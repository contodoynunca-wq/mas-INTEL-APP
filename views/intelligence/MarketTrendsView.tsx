
import React, { FC, useState, useMemo } from 'react';
import type { Lead, StatusJob, MarketTrendReport, ViewName } from '../../types';
import { analyzeMarketTrends } from '../../services/ai/marketTrendsService';
import { printContent } from '../../utils/print';
import { useAppStore } from '../../store/store';
import * as XLSX from 'xlsx';

const MarketTrendsView: FC = () => {
    // Performance Optimization: Use granular selectors
    const savedLeads = useAppStore(state => state.savedLeads);
    const leadMarket = useAppStore(state => state.leadMarket);
    const { processAiJob, handleNavigationRequest: navigate, showModal, setLeadMarket } = useAppStore.getState();

    const [reportData, setReportData] = useState<MarketTrendReport | null>(null);
    const [analysisProgress, setAnalysisProgress] = useState<{ progress: number, description: string } | null>(null);

    const allLeads = useMemo(() => {
        return (savedLeads || [])
            .flatMap(job => job.leads || [])
            .filter(lead => lead.market === leadMarket || (leadMarket === 'UK' && !lead.market));
    }, [savedLeads, leadMarket]);

    const handleAnalyze = async () => {
        setReportData(null);
        setAnalysisProgress({ progress: 0, description: 'Initializing analysis...' });
        const result = await processAiJob(async (updateStatus, signal) => {
            const localUpdate = (p: number, d: string) => {
                updateStatus({ progress: p, description: d });
                setAnalysisProgress({ progress: p, description: d });
            };

            localUpdate(25, `Analyzing ${allLeads.length} saved leads from ${leadMarket} market...`);
            const currentDate = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
            const generatedReport = await analyzeMarketTrends(allLeads, currentDate, leadMarket);
            localUpdate(100, 'Report generated.');
            return generatedReport;
        }, `Market Trend Analysis (${leadMarket})`);

        if (result) {
            setReportData(result);
        }
        setAnalysisProgress(null);
    };

    const handlePrintReport = async () => {
        if (!reportData) return;
        
        const recipient = await showModal({ type: 'prompt', title: 'Recipient Name', message: 'Enter the name of the recipient for the security watermark (e.g. Jewson):' });
        let watermarkText: string | undefined = undefined;
        if (recipient && typeof recipient === 'string' && recipient.trim()) {
            const dateStr = new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
            watermarkText = `Licensed to ${recipient.trim()} - ${dateStr}`;
        }

        printContent(`<div class="whitespace-pre-wrap">${reportData.report}</div>`, `Market Trends Report - ${leadMarket}`, 'A4', false, leadMarket, watermarkText);
    };

    const handleViewStrategicLeads = () => {
        if (!reportData || !reportData.strategicLeadIds.length) return;
        navigate('lead-intel', { strategicLeadIds: reportData.strategicLeadIds });
    };

    const handleExportXLSX = () => {
        if (!reportData || !reportData.strategicLeadIds || reportData.strategicLeadIds.length === 0) {
            showModal({ type: 'alert', title: 'No Data', message: 'No strategic leads to export.' });
            return;
        }
        const strategicLeads = allLeads.filter(l => reportData.strategicLeadIds.includes(l.id));
        const dataToExport = strategicLeads.map(l => ({
            'Title': l.title, 'Summary': l.summary, 'Address': l.address,
            'Project Type': l.projectType, 'Project Stage': l.projectStage,
            'Slate Fit Score': l.slateFitScore,
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Strategic Leads");
        XLSX.writeFile(workbook, `MontAzul_Market_Trends_Strategic_Leads_${leadMarket}.xlsx`);
    };

    return (
        <div className="space-y-8">
            <div className="panel">
                 <div className="border-b border-border-color mb-6 flex">
                    <button 
                        onClick={() => { setLeadMarket('UK'); setReportData(null); }} 
                        className={`px-4 py-2 text-sm uppercase font-bold transition-colors duration-200 rounded-t-lg ${leadMarket === 'UK' ? 'bg-primary text-bg-secondary' : 'text-text-secondary hover:bg-surface'}`}
                    >
                        🇬🇧 UK Trends
                    </button>
                    <button 
                        onClick={() => { setLeadMarket('Spain'); setReportData(null); }} 
                        className={`px-4 py-2 text-sm uppercase font-bold transition-colors duration-200 rounded-t-lg ${leadMarket === 'Spain' ? 'bg-primary text-bg-secondary' : 'text-text-secondary hover:bg-surface'}`}
                    >
                        🇪🇸 Spanish Trends
                    </button>
                    <button 
                        onClick={() => { setLeadMarket('France'); setReportData(null); }} 
                        className={`px-4 py-2 text-sm uppercase font-bold transition-colors duration-200 rounded-t-lg ${leadMarket === 'France' ? 'bg-primary text-bg-secondary' : 'text-text-secondary hover:bg-surface'}`}
                    >
                        🇫🇷 French Trends
                    </button>
                    <button 
                        onClick={() => { setLeadMarket('Germany'); setReportData(null); }} 
                        className={`px-4 py-2 text-sm uppercase font-bold transition-colors duration-200 rounded-t-lg ${leadMarket === 'Germany' ? 'bg-primary text-bg-secondary' : 'text-text-secondary hover:bg-surface'}`}
                    >
                        🇩🇪 German Trends
                    </button>
                </div>
                <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
                    <h2>Market Trend Analysis ({leadMarket})</h2>
                    <button onClick={handleAnalyze} className="btn green" disabled={allLeads.length === 0 || !!analysisProgress}>
                        {analysisProgress ? <span className="loader" /> : `Analyze ${allLeads.length} Saved Leads`}
                    </button>
                </div>
                <p className="text-sm text-secondary mb-4">
                    The AI will analyze all of your saved leads from the "{leadMarket}" market to identify geographic hotspots, trending project types, key players, and strategic opportunities. The more leads you save, the more accurate the analysis will be.
                </p>
                {analysisProgress && (
                    <div className="my-4 p-4 bg-surface rounded-lg">
                        <p className="text-sm text-primary mb-2">{analysisProgress.description}</p>
                        <div className="w-full bg-surface rounded-full h-2.5">
                            <div className="bg-primary h-2.5 rounded-full" style={{ width: `${analysisProgress.progress}%`, transition: 'width 0.5s ease-in-out' }}></div>
                        </div>
                    </div>
                )}
            </div>

            {reportData && (
                <div className="panel">
                    <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
                        <h3 className="mb-0">AI-Generated Strategy Report ({leadMarket})</h3>
                        <div className="flex gap-2">
                             {reportData.strategicLeadIds.length > 0 && (
                                <>
                                    <button onClick={handleViewStrategicLeads} className="btn secondary">
                                        View Strategic Leads ({reportData.strategicLeadIds.length})
                                    </button>
                                    <button onClick={handleExportXLSX} className="btn secondary">Export XLSX</button>
                                </>
                            )}
                            <button onClick={handlePrintReport} className="btn tertiary">
                                Print Report
                            </button>
                        </div>
                    </div>

                    <div 
                        className="prose prose-sm max-w-none prose-headings:text-primary prose-strong:text-text-primary prose-p:text-text-primary prose-li:text-text-secondary whitespace-pre-wrap p-4 bg-surface rounded-lg"
                        dangerouslySetInnerHTML={{ __html: reportData.report.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}
                    />
                </div>
            )}

            {!reportData && !analysisProgress && (
                 <div className="panel">
                    <div className="text-center py-16">
                        <p className="text-secondary">Your market report will appear here after analysis.</p>
                        {allLeads.length === 0 && (
                             <p className="text-yellow-500 mt-2">You have no saved leads in the {leadMarket} market to analyze. Go to Lead Intelligence to find and save leads first.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MarketTrendsView;
