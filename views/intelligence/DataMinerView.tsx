
import React, { FC, useState, useEffect } from 'react';
import { useAppStore } from '../../store/store';
import { dataMinerService, MinerState } from '../../utils/dataMinerService';
import type { LeadMarket } from '../../types';
import * as XLSX from 'xlsx';
import { printContent } from '../../utils/print';

type ProfessionalType = 'architects' | 'roofers' | 'builders' | 'planners' | 'developers' | 'housing_associations';

const DataMinerView: FC = () => {
    const { currentUser, customerDirectory, showModal, logEvent, leadMarket } = useAppStore();
    const [minerState, setMinerState] = useState<MinerState>(dataMinerService._state);
    
    const [activeTab, setActiveTab] = useState<ProfessionalType>('architects');
    const [lastSearchTab, setLastSearchTab] = useState<ProfessionalType>('architects');
    const [searchQuery, setSearchQuery] = useState('');
    const [targetCount, setTargetCount] = useState<number | null>(100);

    useEffect(() => {
        const unsubscribe = dataMinerService.subscribe(setMinerState);
        return unsubscribe;
    }, []);

    const handleStartSearch = async () => {
        if (!currentUser) return;
        if (!searchQuery.trim()) {
            await showModal({type: 'alert', title: 'Input Required', message: 'Please enter a location to search.'});
            return;
        }

        if (leadMarket !== 'UK' && activeTab !== 'housing_associations') {
            const confirmed = await showModal({
                type: 'confirm',
                title: 'Market Warning',
                message: 'This enhanced data miner is optimized for UK data sources like Companies House. Results for other markets may be less accurate. Do you want to continue?'
            });
            if (!confirmed) return;
        }
        
        if (activeTab === 'housing_associations' && leadMarket !== 'UK') {
             await showModal({type: 'alert', title: 'Feature Not Available', message: 'The Housing Association Data Miner is currently only available for the UK market.'});
             return;
        }

        setLastSearchTab(activeTab);
        logEvent('AI', `Starting deep contact scan for ${activeTab} in ${searchQuery}.`);
        dataMinerService.startSearch(activeTab, searchQuery, currentUser, customerDirectory, targetCount, leadMarket);
    };

    const handleStopSearch = () => {
        logEvent('SYS', 'User requested to stop deep contact scan.');
        dataMinerService.stopSearch();
    };
    
    const getCapitalizedType = (tab: ProfessionalType): string => {
        if (!tab) return '';
        const typeMap = {
            architects: 'Architect',
            roofers: 'Roofer',
            builders: 'Builder',
            planners: 'Planner',
            developers: 'Developer',
            housing_associations: 'Housing Association Contact',
        };
        return typeMap[tab] || 'Unknown';
    };

    const handleExportXLSX = () => {
        if (minerState.results.length === 0) {
            showModal({ type: 'alert', title: 'No Data', message: 'There are no results to export.' });
            return;
        }
        
        const professionalTypeLabel = getCapitalizedType(lastSearchTab);

        const dataToExport = minerState.results.map(prof => ({
            'Name': prof.name,
            'Company': prof.companyName || prof.authority,
            'Type': (prof as any).role || professionalTypeLabel,
            'Activity Status': prof.activityStatus || 'N/A',
            'Company Size': prof.companySize || 'N/A',
            'Size Reasoning': prof.companySizeReasoning || '',
            'Email': prof.email,
            'Phone': prof.phone,
            'Mobile': prof.mobile,
            'Address': prof.address,
            'Website': prof.website,
            'Finance Report URL': prof.financeReportUrl || '',
            'Source URL': prof.sourceUrl || '',
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Data Miner Results");
        XLSX.writeFile(workbook, `MontAzul_DataMiner_${lastSearchTab}_${searchQuery.replace(/ /g, '_')}.xlsx`);
    };

    const handlePrintResults = async () => {
        if (minerState.results.length === 0) {
            showModal({ type: 'alert', title: 'No Data', message: 'There are no results to print.' });
            return;
        }
        
        const recipient = await showModal({ type: 'prompt', title: 'Recipient Name', message: 'Enter the name of the recipient for the security watermark (e.g. Jewson):' });
        let watermarkText: string | undefined = undefined;
        if (recipient && typeof recipient === 'string' && recipient.trim()) {
            const dateStr = new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
            watermarkText = `Licensed to ${recipient.trim()} - ${dateStr}`;
        }
        
        const professionalTypeLabel = getCapitalizedType(lastSearchTab);

        const tableHeader = `<tr><th>Name</th><th>Company</th><th>Type</th><th>Activity</th><th>Email</th><th>Phone</th><th>Mobile</th><th>Source</th></tr>`;
        const tableBody = minerState.results.map(prof => `
            <tr>
                <td>${prof.name || ''}</td>
                <td>${prof.companyName || prof.authority || ''}</td>
                <td>${(prof as any).role || professionalTypeLabel}</td>
                <td>${prof.activityStatus || 'N/A'}</td>
                <td>${prof.email || ''}</td>
                <td>${prof.phone || ''}</td>
                <td>${prof.mobile || ''}</td>
                <td>${prof.sourceUrl ? `<a href="${prof.sourceUrl}" target="_blank" rel="noopener noreferrer">Link</a>` : 'N/A'}</td>
            </tr>
        `).join('');

        const table = `<table style="width:100%; border-collapse: collapse; font-family: sans-serif;"><thead>${tableHeader}</thead><tbody>${tableBody}</tbody></table><style>table, th, td { border: 1px solid #ddd; padding: 8px; text-align: left; word-break: break-all; } th { background-color: #f2f2f2; }</style>`;
        
        printContent(table, `Data Miner Results: ${lastSearchTab} in ${searchQuery}`, 'A4', false, leadMarket, watermarkText);
    };

    const TABS: { id: ProfessionalType, label: string, ukOnly?: boolean }[] = [
        { id: 'architects', label: 'Architects' },
        { id: 'roofers', label: 'Roofers' },
        { id: 'builders', label: 'Builders' },
        { id: 'planners', label: 'Planners' },
        { id: 'developers', label: 'Developers' },
        { id: 'housing_associations', label: 'Housing Associations', ukOnly: true },
    ];

    const getFullUrl = (url: string | undefined): string => {
        if (!url) return '#';
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        return `https://${url}`;
    };


    return (
        <div className="panel">
            <h2>Contact Data Miner</h2>
            <p className="text-sm text-secondary mb-4">
                This tool performs an exhaustive, multi-page web search to find and automatically save new contacts to your directory. This process can take several minutes. You can monitor its progress in the Process Monitor.
            </p>

            <div className="border-b border-border-color mb-6 flex">
                {TABS.map(tab => {
                    if (tab.ukOnly && leadMarket !== 'UK') return null;

                    const isCurrentlySearchingThisTab = minerState.isDeepSearching && lastSearchTab === tab.id;
                    const isSelectedWhenIdle = !minerState.isDeepSearching && activeTab === tab.id;
                    const isActive = isCurrentlySearchingThisTab || isSelectedWhenIdle;

                    return (
                        <button 
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            disabled={minerState.isDeepSearching}
                            className={`px-4 py-2 text-sm uppercase font-bold transition-colors duration-200 rounded-t-lg border-b-4 ${
                                isActive
                                    ? 'bg-primary text-[var(--bg-secondary)] border-secondary'
                                    : 'text-text-secondary hover:bg-surface border-transparent'
                            } ${minerState.isDeepSearching && !isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            <div className="form-grid">
                <div className="form-group col-span-2">
                    <label>Location (City or County)</label>
                    <input 
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="e.g., London, Cornwall, Manchester..."
                        disabled={minerState.isDeepSearching}
                    />
                </div>
                <div className="form-group">
                    <label>Target New Contacts (Optional)</label>
                    <input 
                        type="number"
                        value={targetCount || ''}
                        onChange={e => setTargetCount(e.target.value ? parseInt(e.target.value, 10) : null)}
                        placeholder="e.g., 100"
                        disabled={minerState.isDeepSearching}
                    />
                </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
                {minerState.isDeepSearching ? (
                    <button className="btn red flex-grow" onClick={handleStopSearch}>Stop Deep Scan</button>
                ) : (
                    <button className="btn green flex-grow" onClick={handleStartSearch}>Start Deep Scan</button>
                )}
                <button className="btn tertiary" onClick={handlePrintResults} disabled={minerState.results.length === 0}>Print Results</button>
                <button className="btn tertiary" onClick={handleExportXLSX} disabled={minerState.results.length === 0}>Export XLSX</button>
            </div>

            {minerState.isDeepSearching && (
                <div className="mt-6 p-4 bg-surface rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-semibold text-primary">Scan in Progress...</span>
                        <span className="text-xs font-mono">{minerState.progress.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-bg-secondary rounded-full h-2">
                        <div className="bg-primary h-2 rounded-full" style={{ width: `${minerState.progress}%`, transition: 'width 0.3s' }}></div>
                    </div>
                    <p className="text-xs text-secondary mt-2 text-center">{minerState.currentPassDescription}</p>
                </div>
            )}

            {minerState.results.length > 0 && (
                <div className="mt-6">
                    <h3 className="mb-4">Results ({minerState.results.length} found)</h3>
                    <div className="overflow-x-auto max-h-96">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Company</th>
                                    <th>Type</th>
                                    <th>Activity</th>
                                    <th>Email</th>
                                    <th>Phone</th>
                                    <th>Mobile</th>
                                    <th>Address</th>
                                    <th>Website</th>
                                    <th>Source</th>
                                </tr>
                            </thead>
                            <tbody>
                                {minerState.results.map((prof, index) => (
                                    <tr key={index}>
                                        <td>{prof.name}</td>
                                        <td>{prof.companyName || prof.authority}</td>
                                        <td>{(prof as any).role || getCapitalizedType(lastSearchTab)}</td>
                                        <td>
                                            <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                                                prof.activityStatus === 'Active' ? 'bg-profit-bg text-profit-color' :
                                                prof.activityStatus ? 'bg-loss-bg text-loss-color' : 'bg-surface text-text-secondary'
                                            }`}>
                                                {prof.activityStatus || 'N/A'}
                                            </span>
                                        </td>
                                        <td className="break-all">{prof.email}</td>
                                        <td>{prof.phone}</td>
                                        <td>{prof.mobile}</td>
                                        <td>{prof.address}</td>
                                        <td>
                                            {prof.website ? (
                                                <a href={getFullUrl(prof.website)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                                    Visit
                                                </a>
                                            ) : 'N/A'}
                                        </td>
                                        <td>
                                            {prof.sourceUrl ? (
                                                <a href={prof.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                                    View Source
                                                </a>
                                            ) : 'N/A'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
             {minerState.error && (
                <div className="mt-6 p-4 bg-loss-bg text-loss-color rounded-lg">
                    <p className="font-bold">An error occurred:</p>
                    <p className="text-sm">{minerState.error}</p>
                </div>
            )}
        </div>
    );
};

export default DataMinerView;
