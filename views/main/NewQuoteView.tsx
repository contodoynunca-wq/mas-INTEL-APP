
import React, { FC, useState, useEffect } from 'react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { useAppStore } from '../../store/store';
import type { ProjectDetails, Customer, Product, Project } from '../../types';
import QuoteProductCard from '../../components/projects/QuoteProductCard';
import QuoteModal from '../../components/projects/QuoteModal';
import { calculateQuoteForProduct } from '../../utils/QuoteGenerator';
import RecommendationComparisonModal from '../../components/projects/RecommendationComparisonModal';
import { TECHNICAL_DATA } from '../../constants';

const NewQuoteView: FC = () => {
    // Performance Optimization: Use granular selectors
    const productData = useAppStore(state => state.productData);
    const accessoryData = useAppStore(state => state.accessoryData);
    const customerDirectory = useAppStore(state => state.customerDirectory);
    const currentUser = useAppStore(state => state.currentUser);
    const viewProps = useAppStore(state => state.viewProps);
    const db = useAppStore(state => state.db);
    const { showModal, handleNavigationRequest } = useAppStore.getState();

    const [details, setDetails] = useState<ProjectDetails>({
        customerName: '',
        customerType: 'Architect',
        siteLocation: '',
        roofArea: 0,
        roofPitch: 35,
        eavesLength: 10,
        rafterLength: 5,
        exposure: 'moderate'
    });
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [quoteModalData, setQuoteModalData] = useState<any | null>(null);
    const [isComparing, setIsComparing] = useState(false);
    
    // Handle incoming data from AI Surveyor or existing project
    useEffect(() => {
        if (viewProps.surveyorData) {
            setDetails(prev => ({
                ...prev,
                roofArea: parseFloat(viewProps.surveyorData.roofArea) || prev.roofArea,
                roofPitch: parseFloat(viewProps.surveyorData.roofPitch) || prev.roofPitch,
                siteLocation: viewProps.surveyorData.projectAddress || prev.siteLocation
            }));
        }
        if (viewProps.existingProject) {
            const project = viewProps.existingProject as Project;
            setDetails(project.projectSummary);
            const customer = customerDirectory.find(c => c.id === project.customerId);
            if(customer) setSelectedCustomer(customer);
        }
        if (viewProps.planReaderData) {
            setDetails(prev => ({
                ...prev,
                roofArea: viewProps.planReaderData.roofArea || prev.roofArea,
                roofPitch: viewProps.planReaderData.roofPitch || prev.roofPitch,
                eavesLength: viewProps.planReaderData.eavesLength || prev.eavesLength,
                rafterLength: viewProps.planReaderData.rafterLength || prev.rafterLength,
                siteLocation: viewProps.planReaderData.siteLocation || prev.siteLocation,
                // New data from updated plan reader pipeline
                sections: viewProps.planReaderData.sections || undefined,
                visualImage: viewProps.planReaderData.visualImage || undefined
            }));
        }
    }, [viewProps, customerDirectory]);

    const handleDetailChange = (field: keyof ProjectDetails, value: any) => {
        setDetails(prev => ({ ...prev, [field]: value }));
    };

    const handleCustomerSelect = (customerId: string) => {
        const customer = customerDirectory.find(c => c.id === customerId);
        setSelectedCustomer(customer || null);
        if (customer) {
            setDetails(prev => ({ ...prev, customerName: customer.contactName, customerType: customer.type }));
        } else {
             setDetails(prev => ({ ...prev, customerName: '', customerType: 'Architect' }));
        }
    };
    
    const handleGenerateQuote = (product: Product, price: number) => {
        const quote = calculateQuoteForProduct(product, price, details, accessoryData);
        if(quote) {
            setQuoteModalData({ quote, customer: selectedCustomer, existingProject: viewProps.existingProject });
        }
    };
    
    const handleSaveQuote = async (data: { diagram: string, strategy: string, notes: string, projectName: string }) => {
        if(!currentUser || !db) {
            await showModal({type:'alert', title:'Error', message: 'Database not connected.'});
            return;
        };
        
        const { quote } = quoteModalData;
        const newQuote = {
            id: `quote_${Date.now()}`,
            product: quote.product,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            quoteHTML: quote.generateHTML(),
            diagramSVG: data.diagram,
            aiSalesStrategy: data.strategy,
            quoteNotes: data.notes
        };

        if (viewProps.existingProject) {
            // Add to existing project
            const projectRef = db.collection('projects').doc(viewProps.existingProject.id);
            await projectRef.update({
                quotes: firebase.firestore.FieldValue.arrayUnion(newQuote)
            });
        } else {
            // Create new project
            const newProject = {
                name: data.projectName,
                customerId: selectedCustomer?.id || '',
                customerName: details.customerName,
                status: 'Quoted',
                quotes: [newQuote],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                notes: [],
                projectSummary: details,
                userId: currentUser.uid,
            };
            await db.collection('projects').add(newProject);
        }
        setQuoteModalData(null);
        await showModal({type:'alert', title:'Success', message: 'Project and quote saved successfully.'});
        handleNavigationRequest('dashboard');
    };

    const recommendedProducts = productData.filter(p => {
        const rule = TECHNICAL_DATA[details.exposure] || TECHNICAL_DATA.moderate;
        return details.roofPitch >= rule.pitchRange[0] && details.roofPitch <= rule.pitchRange[1];
    });

    return (
        <div className="space-y-8">
            {quoteModalData && <QuoteModal {...quoteModalData} onClose={() => setQuoteModalData(null)} onSave={handleSaveQuote} showModal={showModal} />}
            {isComparing && <RecommendationComparisonModal products={recommendedProducts} details={details} accessories={accessoryData} onClose={() => setIsComparing(false)} />}

            <div className="panel">
                <h2>Project & Customer Details</h2>
                <div className="form-grid">
                    <div className="form-group">
                        <label>Select Existing Customer</label>
                        <select value={selectedCustomer?.id || ''} onChange={e => handleCustomerSelect(e.target.value)}>
                            <option value="">-- Or Enter Details Manually --</option>
                            {customerDirectory.map(c => <option key={c.id} value={c.id}>{c.contactName} ({c.company})</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Customer Name</label>
                        <input type="text" value={details.customerName} onChange={e => handleDetailChange('customerName', e.target.value)} disabled={!!selectedCustomer} />
                    </div>
                    <div className="form-group">
                        <label>Customer Type</label>
                         <select value={details.customerType} onChange={e => handleDetailChange('customerType', e.target.value)} disabled={!!selectedCustomer}>
                            <option>Architect</option>
                            <option>Roofer</option>
                            <option>Builder</option>
                            <option>Homeowner</option>
                            <option>Developer</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Site Location / Address</label>
                        <input type="text" value={details.siteLocation} onChange={e => handleDetailChange('siteLocation', e.target.value)} />
                    </div>
                </div>
            </div>

            <div className="panel">
                <h2>Roof Specifications</h2>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="form-group"><label>Roof Area (m²)</label><input type="number" value={details.roofArea} onChange={e => handleDetailChange('roofArea', parseFloat(e.target.value))} /></div>
                    <div className="form-group"><label>Roof Pitch (°)</label><input type="number" value={details.roofPitch} onChange={e => handleDetailChange('roofPitch', parseFloat(e.target.value))} /></div>
                    <div className="form-group"><label>Eaves Length (m)</label><input type="number" value={details.eavesLength} onChange={e => handleDetailChange('eavesLength', parseFloat(e.target.value))} /></div>
                    <div className="form-group"><label>Rafter Length (m)</label><input type="number" value={details.rafterLength} onChange={e => handleDetailChange('rafterLength', parseFloat(e.target.value))} /></div>
                    <div className="form-group"><label>Exposure</label><select value={details.exposure} onChange={e => handleDetailChange('exposure', e.target.value)}><option value="sheltered">Sheltered</option><option value="moderate">Moderate</option><option value="severe">Severe</option></select></div>
                </div>
                
                {/* Display Multi-Section Badge if applicable */}
                {details.sections && details.sections.length > 0 && (
                    <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                        <p className="text-sm text-blue-600 font-bold">Multi-Section Mode Active</p>
                        <p className="text-xs text-text-secondary mt-1">Quote will be generated for {details.sections.length} distinct roof sections with varying pitches.</p>
                    </div>
                )}
                
                {/* Display 3D Visual Badge if applicable */}
                {details.visualImage && (
                    <div className="mt-2 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                        <p className="text-sm text-purple-600 font-bold">3D Visual Included</p>
                        <p className="text-xs text-text-secondary mt-1">Nano Banana visual will be attached to the final quote.</p>
                    </div>
                )}
            </div>
            
            <div className="panel">
                <div className="flex justify-between items-center mb-4">
                    <h2>Select a Product & Generate Quote</h2>
                    <button className="btn" onClick={() => setIsComparing(true)} disabled={recommendedProducts.length < 2}>Compare All</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {recommendedProducts.map(p => (
                        <QuoteProductCard 
                            key={p.id} 
                            product={p} 
                            details={details} 
                            accessories={accessoryData} 
                            onSelect={setSelectedProduct} 
                            onGenerateQuote={(price) => handleGenerateQuote(p, price)}
                        />
                    ))}
                    {productData.length > 0 && recommendedProducts.length === 0 && (
                        <p className="text-secondary col-span-full text-center">No products match the specified roof pitch for this exposure level.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NewQuoteView;
