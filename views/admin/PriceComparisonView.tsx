// Refactored by Janitor 3.0 for performance and safety
import React, { FC, useState, useEffect, useCallback } from 'react';
import { getDb } from '../../services/firebase';
import type { Product } from '../../types';
import { useAppStore } from '../../store/store';

const ComparisonCard: FC<{ product: Product, exchangeRate: number, onUpdate: (id: string, field: keyof Product, value: number) => void, isAdmin: boolean }> = React.memo(({ product, exchangeRate, onUpdate, isAdmin }) => {
    // Local state for what-if scenarios
    const [rebate, setRebate] = useState(0);
    const [priceB, setPriceB] = useState((product.sellPriceGBP || 0) * 1.1); // Default to +10%
    const [priceC, setPriceC] = useState((product.sellPriceGBP || 0) * 0.9); // Default to -10%

    // Cost calculations
    const costPerSlateEUR = product.costPerSlateEUR || 0;
    const transportCostPerSlateEUR = (product.transportEUR && product.slatesPerCrate && product.cratesPerLoad) ? product.transportEUR / (product.slatesPerCrate * product.cratesPerLoad) : 0;
    const totalCostEUR = costPerSlateEUR + transportCostPerSlateEUR;
    const landedCostGBP = totalCostEUR / exchangeRate;
    const finalCostGBP = landedCostGBP * (1 - rebate / 100);

    // Helper to calculate profit and margin for a given price
    const calculateMetrics = (sellPrice: number) => {
        if (isNaN(sellPrice) || sellPrice <= 0) return { profit: 0, margin: 0 };
        const profit = sellPrice - finalCostGBP;
        const margin = (profit / sellPrice) * 100;
        return { profit, margin };
    };

    const tierDefault = calculateMetrics(product.sellPriceGBP || 0);
    const tierB = calculateMetrics(priceB);
    const tierC = calculateMetrics(priceC);

    const PriceTier = ({ title, price, onPriceChange, metrics }: { title: string, price: number, onPriceChange: (value: number) => void, metrics: { profit: number, margin: number } }) => (
        <div className="pricing-tier">
            <div className="pricing-tier-header">{title}</div>
            <div className="form-group">
                <label>Selling Price (£)</label>
                <input
                    type="number"
                    value={price.toFixed(2)}
                    onChange={e => onPriceChange(parseFloat(e.target.value) || 0)}
                    step="0.01"
                    disabled={!isAdmin}
                    className="text-center font-bold"
                />
            </div>
            <div className="tier-results">
                <div>
                    <div className={`tier-result-value ${metrics.profit >= 0 ? 'margin-profit' : 'margin-loss'}`}>
                        £{metrics.profit.toFixed(2)}
                    </div>
                    <div className="tier-result-label">Gross Profit</div>
                </div>
                <div>
                    <div className={`tier-result-value ${metrics.margin >= 0 ? 'margin-profit' : 'margin-loss'}`}>
                        {metrics.margin.toFixed(2)}%
                    </div>
                    <div className="tier-result-label">Margin</div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="pricing-card">
            <h3>{product.name} ({product.size})</h3>
            
            <div className="pricing-section">
                <div className="pricing-section-title">Cost Analysis</div>
                <div className="cost-grid">
                    <span>Landed Cost (£):</span>
                    <span className="font-mono font-bold text-lg">£{landedCostGBP.toFixed(4)}</span>
                    
                    <label htmlFor={`rebate-${product.id}`}>Rebate (%):</label>
                    <input 
                        id={`rebate-${product.id}`}
                        type="number" 
                        value={rebate}
                        onChange={e => setRebate(parseFloat(e.target.value) || 0)}
                        step="0.1"
                        disabled={!isAdmin}
                        className="!w-24 text-right"
                    />
                    
                    <span className="font-bold text-primary">Final Cost (£):</span>
                    <span className="font-mono font-bold text-lg text-primary">£{finalCostGBP.toFixed(4)}</span>
                </div>
            </div>

            <div className="pricing-section">
                <div className="pricing-section-title">Pricing & Profitability Tiers</div>
                <div className="pricing-tiers">
                    <PriceTier
                        title="Default Price"
                        price={product.sellPriceGBP || 0}
                        onPriceChange={(value: number) => onUpdate(product.id, 'sellPriceGBP', value)}
                        metrics={tierDefault}
                    />
                    <PriceTier
                        title="Scenario A"
                        price={priceB}
                        onPriceChange={setPriceB}
                        metrics={tierB}
                    />
                    <PriceTier
                        title="Scenario B"
                        price={priceC}
                        onPriceChange={setPriceC}
                        metrics={tierC}
                    />
                </div>
            </div>
        </div>
    );
});


const PriceComparisonView: FC = () => { 
    // Performance Optimization: Use granular selectors
    const productData = useAppStore(state => state.productData);
    const currentUser = useAppStore(state => state.currentUser);
    const { showModal, logEvent } = useAppStore.getState(); // Actions are stable

    const [rate, setRate] = useState(1.15); 
    const [rateStatus, setRateStatus] = useState('Fetching latest rate...'); 
    const [localProductData, setLocalProductData] = useState<Product[]>([]); 
    const [isDirty, setIsDirty] = useState(false); 
    
    useEffect(() => { 
        if (productData) {
            setLocalProductData(JSON.parse(JSON.stringify(productData))); 
            setIsDirty(false);
        }
    }, [productData]); 

    const fetchRate = useCallback(async () => { 
        try {
            setRateStatus('Fetching latest rate...');
            const response = await fetch('https://open.er-api.com/v6/latest/GBP');
            if (!response.ok) throw new Error(`API responded with status ${response.status}`);
            const data = await response.json();
            if (data && data.rates && data.rates.EUR) {
                setRate(data.rates.EUR);
                const updateTime = data.time_last_update_utc ? new Date(data.time_last_update_utc).toLocaleTimeString() : new Date().toLocaleTimeString();
                setRateStatus(`Rate updated at ${updateTime}: 1 GBP = ${data.rates.EUR.toFixed(4)} EUR`);
            } else {
                setRateStatus('Could not fetch live rate, using default.');
            }
        } catch (error) {
            console.error("Failed to fetch exchange rate:", error);
            setRateStatus('Could not fetch live rate, using default.');
        }
    }, []);

    useEffect(() => { 
        fetchRate(); 
        const intervalId = setInterval(fetchRate, 60000); 
        return () => clearInterval(intervalId); 
    }, [fetchRate]); 
    
    const handleInputChange = useCallback((id: string, field: keyof Product, value: number) => { 
        if (isNaN(value)) return;
        setLocalProductData(prev => prev.map(p => p.id === id ? {...p, [field]: value} : p)); 
        setIsDirty(true); 
    }, []); 
    
    const handleSaveChanges = async () => {
        if (!isDirty || !currentUser?.isAdmin) return;
        
        const confirmed = await showModal({ type: 'confirm', title: "Confirm Price Updates", message: "Are you sure you want to save these price changes to the database?" });
        if (!confirmed) return;

        logEvent('DB', 'Starting batch update for product prices.');
        const db = getDb();
        const batch = db.batch();
        let changesCount = 0;

        localProductData.forEach(localProd => {
            const originalProd = productData.find(p => p.id === localProd.id);
            if (originalProd && (originalProd.costPriceGBP !== localProd.costPriceGBP || originalProd.sellPriceGBP !== localProd.sellPriceGBP)) {
                const docRef = db.collection('products').doc(localProd.id);
                batch.update(docRef, { 
                    costPriceGBP: localProd.costPriceGBP,
                    sellPriceGBP: localProd.sellPriceGBP 
                });
                changesCount++;
            }
        });

        if (changesCount > 0) {
            try {
                await batch.commit();
                setIsDirty(false);
                logEvent('DB', `Successfully updated ${changesCount} products.`);
                await showModal({ type: 'alert', title: 'Success', message: 'Product prices have been updated successfully.' });
            } catch (error) {
                logEvent('ERR', `Failed to update product prices: ${error instanceof Error ? error.message : 'Unknown error'}`);
                await showModal({ type: 'alert', title: 'Error', message: 'An error occurred while saving the changes.' });
            }
        } else {
             await showModal({ type: 'alert', title: 'No Changes', message: 'No changes were detected to save.' });
             setIsDirty(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="panel">
                <div className='flex flex-wrap justify-between items-center gap-4'>
                    <h2 className="m-0 p-0 border-none">Live Price & Margin Analysis</h2>
                    {currentUser?.isAdmin && <button className="btn green" onClick={handleSaveChanges} disabled={!isDirty}>Save Changes</button>}
                </div>
                <div className="form-group mt-4">
                    <label>Live Exchange Rate (€ per £):</label>
                    <div className="flex gap-4 items-center">
                        <input type="number" value={rate.toFixed(4)} onChange={e=>setRate(parseFloat(e.target.value))} className="w-48" />
                        <span className="text-sm text-text-secondary">{rateStatus}</span>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {localProductData.map(p => <ComparisonCard key={p.id} product={p} exchangeRate={rate} onUpdate={handleInputChange} isAdmin={currentUser?.isAdmin || false} />)}
            </div>
        </div>
    ); 
};

export default PriceComparisonView;