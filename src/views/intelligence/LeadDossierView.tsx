
import React, { FC, useState, useRef, useMemo, useEffect } from 'react';
import { useAppStore } from '@/store/store';
import type { Lead, LeadContact, PlanningDocument } from '@/types';
import LeadScoreIndicator from '@/components/leads/LeadScoreIndicator';
import { ICONS } from '@/constants';
import { ProjectStatusTimeline } from '@/components/leads/LeadCard'; 
import { StaticMap } from '@/components/common/StaticMap';
import InteractiveMap from '@/components/common/InteractiveMap';
import EmailDraftModal from '@/components/common/EmailDraftModal';
import PersonaEmailModal from '@/components/leads/PersonaEmailModal';
import PrintOptionsSelector from '@/components/common/PrintOptionsSelector';
import { generateFullLeadHTML, getBestMapAddress } from '@/utils/leadPrinting';
import { printContent } from '@/utils/print';
import { generateOutreachEmail } from '@/services/ai/leadIntelService';
import { generateVisualSummary3D } from '@/services/ai/imageGenerationService';
import { getStorage } from '@/services/firebase';
import { base64ToBlob } from '@/utils/fileProcessing';
import { LeadAnalysisView } from '../../components/leads/LeadAnalysisView'; 

const LeadDossierView: FC = () => {
    const { 
        viewProps, 
        handleNavigationRequest, 
        uploadPlanForLead, 
        uploadVerificationSnapshot, 
        processAiJob, 
        addLeadFeedback,
        activeSearches,
        savedLeads,
        toggleContactPriority,
        deleteLeadContact,
        showModal,
        runForensicValueAudit,
        runEconomicCheck,
        processJobs,
        runSmartScan,
        runAutoPlanScan,
        runCloudPlanExtraction,
        updateLeadInJob,
        findParentJob
    } = useAppStore();

    const passedLead = viewProps.lead as Lead | undefined;
    const lead = useMemo(() => {
        if (!passedLead) return undefined;
        const allLeads = [...activeSearches, ...savedLeads].flatMap(j => j.leads);
        const found = allLeads.find(l => l.id === passedLead.id);
        return found || passedLead;
    }, [activeSearches, savedLeads, passedLead]);

    const [activeTab, setActiveTab] = useState<'overview' | 'contacts' | 'documents' | 'strategy' | 'notes'>('overview');
    const [draftModalData, setDraftModalData] = useState<{ lead: Lead; draft: { text: string; subject: string; to: string } } | null>(null);
    const [isDraftingEmailFor, setIsDraftingEmailFor] = useState<string | null>(null);
    const [personaEmailContact, setPersonaEmailContact] = useState<Partial<LeadContact> | null>(null);
    const [isGenerating3D, setIsGenerating3D] = useState(false);
    const [local3DPreview, setLocal3DPreview] = useState<string | null>(null);
    const [mapRefreshTrigger, setMapRefreshTrigger] = useState(0);
    
    const planFileInputRef = useRef<HTMLInputElement>(null);
    const snapshotFileInputRef = useRef<HTMLInputElement>(null);
    const smartScanInputRef = useRef<HTMLInputElement>(null);

    const isSmartScanRunning = lead ? processJobs.some(j => j.name.includes(`Smart Scan`) && j.context?.leadId === lead.id && j.status === 'running') : false;
    const isAutoScanRunning = lead ? processJobs.some(j => j.name.includes(`Auto-Plan Scan`) && j.context?.leadId === lead.id && j.status === 'running') : false;
    const isEconomicCheckRunning = lead ? processJobs.some(j => j.name.includes(`Economic`) && j.context?.leadIds?.includes(lead.id) && j.status === 'running') : false;
    const isCloudExtractRunning = lead ? processJobs.some(j => j.name.includes(`Cloud Plan`) && j.context?.leadId === lead.id && j.status === 'running') : false;

    // Reset local preview when lead changes
    useEffect(() => {
        setLocal3DPreview(null);
    }, [lead?.id]);

    const handlePlanFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && lead) uploadPlanForLead(lead.id, file);
        if (e.target) e.target.value = '';
    };

    const handleSnapshotFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && lead) uploadVerificationSnapshot(lead.id, file);
        if (e.target) e.target.value = '';
    };

    const handleSmartScanSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && lead) runSmartScan(lead.id, file);
        if (e.target) e.target.value = '';
    };

    const handleAutoScan = async () => {
        if (lead) {
            if (await showModal({type: 'confirm', title: 'Start Auto-Plan Scan?', message: 'This will attempt to find the latest PDF plans (Roof/Elevations) on the council portal and open them in the Plan Reader for verification.'})) {
                runAutoPlanScan(lead.id);
            }
        }
    };

    const handleCloudExtract = async () => {
        if(lead && lead.planningUrl) {
             if (await showModal({type: 'confirm', title: 'Start Cloud Extraction?', message: 'This will queue a robust backend worker to visit the portal, extract plans via Headless Browser, and analyze them with Gemini 3 Pro. This process takes 1-2 minutes.'})) {
                runCloudPlanExtraction(lead.id);
            }
        }
    };

    const handleGenerate3D = async () => {
        if (!lead) return;
        setIsGenerating3D(true);
        try {
            const summary = `${lead.title}. Type: ${lead.projectType}. Materials: ${lead.materials?.map(m => m.name).join(', ') || 'Slate'}.`;
            
            const result = await processAiJob(async () => {
                return await generateVisualSummary3D(summary);
            }, `Generating 3D for ${lead.title}`);

            if (result && result.base64Image) {
                const dataUrl = `data:${result.mimeType};base64,${result.base64Image}`;
                setLocal3DPreview(dataUrl);

                const blob = base64ToBlob(result.base64Image, result.mimeType);
                const storage = getStorage();
                const filename = `3d_concept_${Date.now()}.jpg`;
                const storageRef = storage.ref().child(`plans/${lead.id}/${filename}`);
                
                await storageRef.put(blob);
                const downloadURL = await storageRef.getDownloadURL();

                const { job, isSaved } = findParentJob(lead.id);
                if (job) {
                    const newDoc = {
                        type: 'AI 3D Concept',
                        filename: filename,
                        url: downloadURL,
                        storageUrl: downloadURL,
                        size: `${(blob.size / 1024).toFixed(0)} KB`,
                        isLatest: true
                    };
                    await updateLeadInJob(job.id, lead.id, { planningDocuments: [...(lead.planningDocuments || []), newDoc] }, isSaved);
                }
            }
        } catch (e) {
            console.error(e);
            await showModal({type: 'alert', title: 'Error', message: 'Failed to generate 3D concept.'});
        } finally {
            setIsGenerating3D(false);
        }
    };

    const handleFeedback = (feedback: Lead['feedback']) => { if (lead) addLeadFeedback(lead.id, feedback); };
    const handleTogglePriority = async (index: number) => { if (lead) await toggleContactPriority(lead.id, index); };
    
    const handleDeleteContact = async (index: number, contactName: string) => {
        if (!lead) return;
        if (await showModal({ type: 'confirm', title: 'Delete Contact?', message: `Remove <strong>${contactName}</strong>?` })) {
            await deleteLeadContact(lead.id, index);
        }
    };
    
    const handleDraftEmail = async (contact: Partial<LeadContact>) => {
        if (!contact.email || !lead) return;
        setIsDraftingEmailFor(contact.email);
        const leadContext = { ...lead, companies: [contact] };
        const result = await processAiJob(async () => generateOutreachEmail(leadContext), `Drafting email for ${contact.contactName}`);
        if (result) setDraftModalData({ lead, draft: { subject: result.subject, text: result.body, to: contact.email } });
        setIsDraftingEmailFor(null);
    };
    
    const handleReDraftEmail = async () => {
        if (!draftModalData || !lead) return;
        setIsDraftingEmailFor(draftModalData.draft.to);
        const contact = lead.companies?.find(c => c.email === draftModalData.draft.to);
        const leadContext = contact ? { ...lead, companies: [contact] } : lead;
        const result = await processAiJob(async () => generateOutreachEmail(leadContext), `Re-drafting email`);
        if (result) setDraftModalData(prev => prev ? { ...prev, draft: { subject: result.subject, text: result.body, to: prev.draft.to } } : null);
        setIsDraftingEmailFor(null);
    };

    const handlePrint = async () => {
        if (!lead) return;
        const printOptions = await showModal({ type: 'custom', title: 'Print Options', content: <PrintOptionsSelector /> });
        if (!printOptions) return;
        const reportTitle = `Lead Dossier: ${lead.title.substring(0, 40)}`;
        const leadContent = await generateFullLeadHTML(lead, reportTitle, printOptions);
        printContent(leadContent, reportTitle, printOptions.pageSize, true, lead.market, printOptions.watermarkText);
    };

    const ensureAbsoluteUrl = (url?: string) => {
        if (!url) return '#';
        if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http')) return url;
        return `https://${url}`;
    };

    const getBest3DImage = () => {
        if (local3DPreview) return local3DPreview;
        const saved3D = lead?.planningDocuments?.find(d => d.type === 'AI 3D Concept' || (d.filename && d.filename.includes('3d_concept')));
        return saved3D?.storageUrl || saved3D?.url || null;
    };

    const handleResetMap = () => {
        setMapRefreshTrigger(prev => prev + 1);
    };

    if (!lead) return <div className="flex items-center justify-center h-full"><p>No Lead Selected</p></div>;

    const financialContacts = lead.companies?.filter(c => c.financialStatus) || [];
    const hasFinancialData = financialContacts.length > 0;
    const current3DImage = getBest3DImage();
    const cloudExtractedDocs = lead.planningDocuments?.filter(d => d.type === 'Cloud Extraction') || [];

    // Robust Address for Map
    const mapAddress = getBestMapAddress(lead);

    const renderOverview = () => (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <div><h3>Project Overview</h3><p className="text-text-secondary whitespace-pre-wrap">{lead.summary}</p></div>
                 <div className="p-4 bg-surface rounded-lg border border-border-color grid grid-cols-2 gap-4 text-sm">
                    <p><strong>Ref:</strong> {lead.applicationRef || 'N/A'}</p>
                    <p><strong>Council:</strong> {lead.council || 'N/A'}</p>
                    <p><strong>Stage:</strong> {lead.projectStage || 'N/A'}</p>
                    <div className="flex items-center gap-2"><p><strong>Value:</strong> {lead.projectValue || 'N/A'}</p><button onClick={() => runForensicValueAudit(lead.id)} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded" title="Audit Value">💰 Audit</button></div>
                </div>
                
                <div className="p-4 bg-surface rounded-lg border border-border-color">
                    <div className="flex justify-between items-center mb-3"><h3 className="text-lg font-bold m-0 flex items-center gap-2">💰 Financial Intelligence</h3><button onClick={() => runEconomicCheck([lead.id])} className="btn sm tertiary" disabled={isEconomicCheckRunning}>{isEconomicCheckRunning ? <span className="loader" /> : (hasFinancialData ? 'Refresh' : 'Run Check')}</button></div>
                    {hasFinancialData ? (
                        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-bg-secondary text-text-secondary text-xs"><tr><th className="p-2 text-left">Company</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Risk</th></tr></thead><tbody>
                            {financialContacts.map((c, i) => (<tr key={i}><td className="p-2 font-medium">{c.company}</td><td className="p-2"><span className={`px-2 py-0.5 rounded text-xs font-bold ${['Active', 'Strong', 'Safe'].includes(c.financialStatus||'') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{c.financialStatus}</span></td><td className="p-2">{c.financialRisk}</td></tr>))}
                        </tbody></table></div>
                    ) : <div className="text-center py-4 text-text-secondary text-sm">No financial data available.</div>}
                </div>
                <div><h3>Timeline</h3><ProjectStatusTimeline currentStage={lead.projectStage} /></div>
            </div>
            <div className="space-y-6">
                 {/* NEW: Plans Preview in Sidebar */}
                 {cloudExtractedDocs.length > 0 && (
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                        <h3 className="text-blue-800 text-sm font-bold mb-2 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            Blueprints Extracted
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                            {cloudExtractedDocs.slice(0, 4).map((doc, i) => (
                                <a key={i} href={doc.storageUrl || doc.url} target="_blank" className="block rounded overflow-hidden border border-blue-200 hover:opacity-80">
                                    <img src={doc.storageUrl || doc.url} className="w-full h-20 object-cover" />
                                </a>
                            ))}
                        </div>
                        <button onClick={() => setActiveTab('documents')} className="w-full mt-2 text-xs text-blue-600 hover:underline">View All &rarr;</button>
                    </div>
                 )}

                 <div>
                    <div className="flex justify-between items-center mb-2">
                        <h3>Location</h3>
                        <button onClick={handleResetMap} className="text-xs text-primary hover:underline">📍 Reset Map</button>
                    </div>
                    {/* Interactive Map with Address Priority */}
                    <div className="rounded-lg overflow-hidden border border-border-color h-64 relative bg-bg-secondary no-print">
                        <InteractiveMap 
                            key={mapRefreshTrigger}
                            address={mapAddress} 
                            lat={lead.geolocation?.lat} 
                            lng={lead.geolocation?.lng} 
                        />
                    </div>
                    <div className="rounded-lg overflow-hidden border border-border-color h-64 relative bg-bg-secondary print-only">
                        <StaticMap 
                            address={mapAddress} 
                            lat={lead.geolocation?.lat} 
                            lng={lead.geolocation?.lng} 
                        />
                    </div>
                    
                     <div className="flex flex-col gap-2 mt-4 no-print">
                        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapAddress || '')}`} target="_blank" rel="noopener noreferrer" className="btn tertiary w-full">Search Address on Google Maps</a>
                    </div>
                 </div>
                 
                 {/* 3D Concept Card in Overview */}
                 <div className="p-4 bg-surface rounded-lg border border-border-color">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-bold m-0">Visual Concept</h3>
                        {!current3DImage && (
                            <button className="btn sm tertiary" onClick={handleGenerate3D} disabled={isGenerating3D}>
                                {isGenerating3D ? <span className="loader" /> : 'Generate'}
                            </button>
                        )}
                    </div>
                    {current3DImage ? (
                        <div className="rounded overflow-hidden border border-border-color">
                            <img src={ensureAbsoluteUrl(current3DImage)} alt="3D Concept" className="w-full h-auto object-cover" />
                        </div>
                    ) : (
                        <div className="h-32 bg-bg-secondary rounded flex items-center justify-center text-xs text-text-secondary border border-dashed border-border-color">
                            No 3D concept generated.
                        </div>
                    )}
                 </div>
            </div>
        </div>
    );

    const renderDocuments = () => {
        // Collect existing documents (excluding cloud extraction from generic list to avoid duplication if we handle them specially)
        const imageDocs = lead.planningDocuments?.filter(doc => doc.url && (doc.type === 'Plan Snapshot (AI)' || doc.type === 'AI 3D Concept' || doc.type.startsWith('Smart Scan') || doc.filename.match(/\.(jpg|jpeg|png|webp|gif)$/i))) || [];
        
        // If we have a local preview that isn't yet in the list, add it
        const previewDoc: PlanningDocument | null = local3DPreview && !imageDocs.some(d => d.url === local3DPreview || d.storageUrl === local3DPreview) ? {
            type: 'AI 3D Concept (Preview)',
            filename: '3D_Concept_Preview.jpg',
            url: local3DPreview,
            storageUrl: local3DPreview,
            isLatest: true
        } : null;

        const displayDocs = previewDoc ? [previewDoc, ...imageDocs] : imageDocs;

        return (
         <div className="space-y-6 max-w-4xl">
             <div className="p-4 bg-purple-50/50 border border-purple-200 rounded-lg flex items-center justify-between gap-4">
                 <div><h4 className="text-purple-700 font-bold mb-1">☁️ Cloud Plan Extraction (Robust)</h4><p className="text-sm text-text-secondary">Queues a backend worker to fully render the portal, screenshot plans, and extract JSON data. Use this for complex portals.</p></div>
                 <button className="btn bg-purple-600 text-white hover:bg-purple-700" onClick={handleCloudExtract} disabled={isCloudExtractRunning || !lead.planningUrl}>{isCloudExtractRunning ? <span className="loader" /> : 'Run Cloud Extract'}</button>
             </div>

             {/* --- NEW: Plan Snapshots Gallery (Cloud Extracted) --- */}
             {cloudExtractedDocs.length > 0 && (
                <div className="mt-6 mb-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Scanned Blueprints (Cloud Worker)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {cloudExtractedDocs.map((doc, index) => (
                            <div key={index} className="border rounded-lg overflow-hidden shadow-sm bg-white">
                                <a href={ensureAbsoluteUrl(doc.storageUrl || doc.url)} target="_blank" rel="noopener noreferrer">
                                    <img 
                                        src={ensureAbsoluteUrl(doc.storageUrl || doc.url)} 
                                        alt={doc.filename || `Plan ${index + 1}`} 
                                        className="w-full h-48 object-cover hover:opacity-90 transition-opacity"
                                    />
                                </a>
                                <div className="p-2 text-xs text-gray-500 bg-gray-50 truncate">
                                    {doc.description || `Document ${index + 1}`}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
             )}

             <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg flex items-center justify-between gap-4">
                 <div><h4 className="text-primary font-bold mb-1">⚡ Quick Snap Hunter (Client-Side)</h4><p className="text-sm text-text-secondary">Attempts to find image links directly from your browser. Faster but less robust.</p></div>
                 <button className="btn green" onClick={handleAutoScan} disabled={isAutoScanRunning || !lead.applicationRef}>{isAutoScanRunning ? <span className="loader" /> : 'Quick Scan'}</button>
             </div>

             <div className="p-4 bg-bg-secondary border border-border-color rounded-lg flex items-center justify-between">
                 <div><h4 className="font-bold mb-1">🤖 Manual Smart Scan</h4><p className="text-sm text-text-secondary">Upload a specific PDF for audit.</p></div>
                 <div><input type="file" ref={smartScanInputRef} onChange={handleSmartScanSelect} className="hidden" accept=".pdf" /><button className="btn primary" onClick={() => smartScanInputRef.current?.click()} disabled={isSmartScanRunning}>{isSmartScanRunning ? <span className="loader" /> : 'Upload PDF'}</button></div>
             </div>

             <div className="flex justify-between items-center">
                 <h4 className="font-semibold">Visuals</h4>
                 <button className="btn tertiary sm" onClick={handleGenerate3D} disabled={isGenerating3D}>
                     {isGenerating3D ? <span className="loader" /> : '✨ Generate 3D Concept'}
                 </button>
             </div>

             {displayDocs.length > 0 ? (
                 <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                     {displayDocs.filter(d => d.type !== 'Cloud Extraction').map((doc, i) => ( 
                         <div key={i} className="border border-border-color rounded-lg overflow-hidden bg-bg-secondary relative group">
                             <a href={ensureAbsoluteUrl(doc.storageUrl || doc.url)} target="_blank" className="block bg-black/5">
                                <img src={ensureAbsoluteUrl(doc.storageUrl || doc.url)} alt={doc.filename} className="w-full h-40 object-cover hover:opacity-90"/>
                             </a>
                             <div className="p-2 text-center"><p className="text-xs font-semibold truncate">{doc.filename}</p></div>
                             {doc.type.includes('Preview') && <div className="absolute top-2 right-2 bg-yellow-500 text-white text-[10px] px-2 py-1 rounded">Unsaved</div>}
                         </div>
                     ))}
                 </div>
             ) : <p className="text-sm text-text-secondary">No other visuals found.</p>}

             <div className="mt-4 pt-4 border-t border-border-color grid grid-cols-2 gap-4">
                <div><input type="file" ref={planFileInputRef} onChange={handlePlanFileSelect} className="hidden" accept=".pdf,.png,.jpg" /><button className="btn w-full" onClick={() => planFileInputRef.current?.click()}>{ICONS.EXTRACT_MATERIALS} Upload Plan (Manual)</button></div>
                <div><input type="file" ref={snapshotFileInputRef} onChange={handleSnapshotFileSelect} className="hidden" accept=".png,.jpg" /><button className="btn tertiary w-full" onClick={() => snapshotFileInputRef.current?.click()}>Upload Snapshot</button></div>
            </div>
         </div>
        );
    };

    const renderContacts = () => (
        <div className="space-y-4 max-w-4xl">
            <div className="flex justify-between items-center">
                <h3>Key Stakeholders</h3>
            </div>
            
            {(lead.companies && lead.companies.length > 0) ? lead.companies.map((c, i) => (
                <div key={i} className="p-4 bg-surface rounded-lg border border-border-color flex flex-col md:flex-row justify-between gap-4">
                    <div className="flex-grow">
                        <div className="flex items-center gap-2">
                            {c.priority === 'main' && <span className="text-yellow-500 text-lg">★</span>}
                            <h4 className="font-bold text-lg m-0">{c.contactName}</h4>
                            <span className="px-2 py-0.5 bg-bg-secondary rounded text-xs border border-border-color">{c.type}</span>
                        </div>
                        <p className="text-primary font-semibold mt-1">{c.company}</p>
                        
                        <div className="mt-2 space-y-1 text-sm">
                            {c.email && <p className="flex items-center gap-2"><span className="text-text-secondary w-16">Email:</span> <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a></p>}
                            {c.phone && <p className="flex items-center gap-2"><span className="text-text-secondary w-16">Phone:</span> <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a></p>}
                            {c.mobile && <p className="flex items-center gap-2"><span className="text-text-secondary w-16">Mobile:</span> <a href={`tel:${c.mobile}`} className="hover:underline">{c.mobile}</a></p>}
                        </div>
                        
                        {c.status === 'Verified' && <div className="mt-2 inline-flex items-center gap-1 text-xs text-profit-color bg-profit-bg px-2 py-1 rounded"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg> Verified Contact</div>}
                    </div>
                    
                    <div className="flex flex-col gap-2 justify-start min-w-[140px]">
                        {c.email && (
                            <button className="btn sm" onClick={() => handleDraftEmail(c)} disabled={!!isDraftingEmailFor}>
                                {isDraftingEmailFor === c.email ? <span className="loader"/> : '📧 Draft Email'}
                            </button>
                        )}
                        <button className="btn sm tertiary" onClick={() => setPersonaEmailContact(c)}>⚡ Persona Strategy</button>
                        <div className="h-[1px] bg-border-color my-1"></div>
                        <button className="btn sm tertiary" onClick={() => handleTogglePriority(i)}>
                            {c.priority === 'main' ? 'Demote Priority' : 'Make Primary'}
                        </button>
                        <button className="btn sm red" onClick={() => handleDeleteContact(i, c.contactName)}>Remove</button>
                    </div>
                </div>
            )) : (
                <div className="text-center p-8 bg-surface rounded-lg border border-border-color border-dashed">
                    <p className="text-text-secondary">No contacts found for this lead yet.</p>
                    <p className="text-xs text-text-secondary mt-2">Run "Enrichment" in the main view to find people.</p>
                </div>
            )}
        </div>
    );

    const renderStrategy = () => <div className="p-4 bg-surface rounded-lg border border-border-color"><div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: (lead.salesStrategy || 'No strategy yet').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} /></div>;

    return (
        <div className="p-4 h-full overflow-y-auto">
            {draftModalData && <EmailDraftModal initialDraft={draftModalData.draft} onClose={() => setDraftModalData(null)} onReDraft={handleReDraftEmail} isLoading={!!isDraftingEmailFor} />}
            {personaEmailContact && <PersonaEmailModal lead={lead} contact={personaEmailContact} onClose={() => setPersonaEmailContact(null)} />}
            
            <div className="flex justify-between items-start mb-6">
                <div><button onClick={() => handleNavigationRequest('lead-intel')} className="text-sm text-primary hover:underline mb-1">&larr; Back</button><h2 className="text-2xl font-bold m-0">{lead.title}</h2></div>
                <div className="flex items-center gap-4"><LeadScoreIndicator score={lead.totalScore} lead={lead} /><button onClick={handlePrint} className="btn tertiary sm">Print</button></div>
            </div>

            {/* AI Analysis View Integration - Shows Cloud Worker Results without mixing materials */}
            <LeadAnalysisView lead={lead} />

            <div className="border-b border-border-color mb-6 flex gap-4">
                <button onClick={() => setActiveTab('overview')} className={`pb-2 border-b-2 ${activeTab === 'overview' ? 'border-primary text-primary' : 'border-transparent'}`}>Overview</button>
                <button onClick={() => setActiveTab('contacts')} className={`pb-2 border-b-2 ${activeTab === 'contacts' ? 'border-primary text-primary' : 'border-transparent'}`}>Contacts</button>
                <button onClick={() => setActiveTab('documents')} className={`pb-2 border-b-2 ${activeTab === 'documents' ? 'border-primary text-primary' : 'border-transparent'}`}>Documents</button>
                <button onClick={() => setActiveTab('strategy')} className={`pb-2 border-b-2 ${activeTab === 'strategy' ? 'border-primary text-primary' : 'border-transparent'}`}>Strategy</button>
                <button onClick={() => setActiveTab('notes')} className={`pb-2 border-b-2 ${activeTab === 'notes' ? 'border-primary text-primary' : 'border-transparent'}`}>Notes</button>
            </div>

            <div className="pb-20">
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'contacts' && renderContacts()}
                {activeTab === 'documents' && renderDocuments()}
                {activeTab === 'strategy' && renderStrategy()}
                {activeTab === 'notes' && (
                    <div className="p-4 bg-surface rounded-lg border border-border-color">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="m-0">Lead Notes & Call Transcripts</h3>
                        </div>
                        <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                            {lead.notes ? lead.notes : <span className="text-text-secondary italic">No notes or call transcripts yet.</span>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LeadDossierView;
