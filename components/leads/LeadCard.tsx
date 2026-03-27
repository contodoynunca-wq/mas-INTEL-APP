import React, { FC, useState, useMemo } from 'react';
import type { Lead, ModalState, LeadMarket, ViewName } from '@/types';
import { ICONS } from '@/constants';
import { i18n } from '@/utils/translations';
import LeadScoreIndicator from './LeadScoreIndicator';
import { useAppStore } from '@/store/store';

interface LeadCardProps {
    lead: Lead;
    onUpdate: (leadId: string, updates: Partial<Lead>) => void;
    onDelete: (leadId: string) => void;
    onGenerateStrategy: (leadId: string) => void;
    onGenerateActionPlan: (leadId: string) => void;
    onGenerateDeepStrategy: (leadId: string) => void;
    onPrint: (lead: Lead) => void;
    onUpdateLeadInfo: (leadId: string) => void;
    onCheckForUpdates: (leadId: string) => void;
    onVerifyAndEnrich: (leadIds: string[]) => void;
    onVerifyContact: (leadId: string, contactIndex: number) => void;
    isJobRunning: boolean;
    isSummaryExpanded?: boolean;
    showModal: (config: Omit<ModalState, 'onResolve'>) => Promise<any>;
    showCheckbox?: boolean;
    isSelected?: boolean;
    onSelectionChange?: (leadId: string, isSelected: boolean) => void;
    leadMarket: LeadMarket;
    onDeleteContact: (leadId: string, contactIndex: number) => void;
    onManuallyVerifyContact: (leadId: string, contactIndex: number) => void;
    isCompactView?: boolean;
    onFindLinkedInContacts: (leadId: string) => void;
    onDraftEmail: (lead: Lead) => void;
    handleNavigationRequest: (view: ViewName, props?: any) => void;
}

export const ProjectStatusTimeline: FC<{ currentStage: Lead['projectStage'] }> = ({ currentStage }) => {
    const stages = ['Pre-Planning', 'Planning', 'Awaiting Decision', 'Approved', 'On-Site', 'Complete'];
    
    // Helper to find the best matching stage index based on keywords
    const getStageIndex = (stage: string | undefined): number => {
        if (!stage) return -1;
        const s = stage.toLowerCase().trim();
        
        // Priority 1: On-Site / Construction (Active work)
        if (s.includes('site') || s.includes('construction') || s.includes('started') || s.includes('groundworks') || s.includes('underway') || s.includes('commenced')) return 4; // On-Site
        
        // Priority 2: Approved / Granted
        if (s.includes('approved') || s.includes('granted') || s.includes('conditionally') || s.includes('consent') || s.includes('permitted')) return 3; // Approved
        
        // Priority 3: Awaiting / Pending
        if (s.includes('awaiting') || s.includes('pending') || s.includes('decision')) return 2; // Awaiting Decision
        
        // Priority 4: Planning (General) - check exclude Pre-Planning
        if ((s.includes('planning') || s.includes('received') || s.includes('validated') || s.includes('application')) && !s.includes('pre')) return 1; // Planning
        
        // Priority 5: Pre-Planning
        if (s.includes('pre') || s.includes('early')) return 0; // Pre-Planning

        // Priority 6: Complete
        if (s.includes('complete') || s.includes('finished') || s.includes('built')) return 5; // Complete

        return -1;
    };

    const activeIndex = getStageIndex(currentStage);
    
    // Only show fallback/error state for definitive negative statuses
    const isTerminal = ['withdrawn', 'rejected', 'overdue', 'appeal', 'refused'].some(term => (currentStage || '').toLowerCase().includes(term));

    if (isTerminal) return <div className="bg-loss-bg text-loss-color font-bold text-xs p-2 rounded text-center uppercase tracking-wider">{currentStage}</div>;

    return (
        <div className="flex items-center justify-between text-xs my-3 px-1 w-full overflow-x-auto">
            {stages.map((stage, i) => {
                const isActive = activeIndex >= i;
                const isCurrent = activeIndex === i;
                return (
                    <div key={stage} className={`flex flex-col items-center min-w-[60px] flex-1 relative group`}>
                        {/* Connecting Line */}
                        {i < stages.length - 1 && (
                            <div className={`absolute top-1.5 left-[50%] w-full h-[2px] ${isActive && activeIndex > i ? 'bg-primary' : 'bg-border-color'}`} style={{zIndex: 0}} />
                        )}
                        
                        {/* Dot */}
                        <div 
                            className={`w-3 h-3 rounded-full mb-1 z-10 border-2 transition-all duration-300 
                                ${isActive ? 'bg-primary border-primary' : 'bg-bg-secondary border-gray-300'}
                                ${isCurrent ? 'ring-2 ring-primary/30 scale-125 shadow-sm' : ''}
                            `} 
                        />
                        
                        {/* Label */}
                        <span className={`text-[10px] text-center leading-tight transition-colors duration-200 ${isActive ? 'text-primary font-bold' : 'text-text-secondary opacity-70'}`}>
                            {stage}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

const LeadCardComponent: FC<LeadCardProps> = ({ lead, onUpdate, onDelete, onGenerateStrategy, onGenerateDeepStrategy, onPrint, onVerifyAndEnrich, isJobRunning, showCheckbox, isSelected, onSelectionChange, handleNavigationRequest, isCompactView }) => {
    const { runSnapHunter, runForensicValueAudit, runEconomicCheck, runCloudPlanExtraction } = useAppStore();

    // Helper to safely display array data, handling potential V52 sanitizer outputs
    const materialsDisplay = useMemo(() => {
        if (!lead.materials) return '';
        if (Array.isArray(lead.materials)) {
            return lead.materials
                .map(m => {
                    if (typeof m === 'string') return m;
                    if (m && typeof m === 'object') return m.name || 'Unknown Material';
                    return '';
                })
                .filter(Boolean)
                .join(', ');
        }
        return String(lead.materials);
    }, [lead.materials]);

    const contactsCount = lead.companies?.length || 0;
    const hasEmail = lead.companies?.some(c => c.email);
    const hasPhone = lead.companies?.some(c => c.phone);
    
    // Check for "On-Site" variations for badge
    const isOnSite = lead.projectStage === 'On-Site' || (lead.projectStage || '').toLowerCase().includes('started') || (lead.projectStage || '').toLowerCase().includes('construction');

    // Check for plans
    const hasPlans = useMemo(() => {
        return lead.planningDocuments?.some(d => d.type === 'Cloud Extraction' || d.type.startsWith('Smart Scan'));
    }, [lead.planningDocuments]);

    // V55 Protocol: Smart Fallback Text & Logic
    let contactDisplay = '';
    if (contactsCount > 0) {
        contactDisplay = `${contactsCount} Contacts ${hasEmail ? '(@)' : ''} ${hasPhone ? '(Tel)' : ''}`;
    } else if (isOnSite) {
        contactDisplay = 'Unknown Contractor - Call Site Office'; 
    } else {
        contactDisplay = 'No Contacts';
    }

    // Date Logic
    const displayDate = useMemo(() => {
        if (lead.startDate) return { label: "Start Date", date: lead.startDate };
        if (lead.decisionDate) return { label: "Decision", date: lead.decisionDate };
        if (lead.applicationDate) return { label: "Applied", date: lead.applicationDate };
        
        return lead.keyDates?.find(d => 
            d.label.toLowerCase().includes('start') || 
            d.label.toLowerCase().includes('commence') || 
            d.label.toLowerCase().includes('target')
        ) || null;
    }, [lead]);

    // Financial Risk Indicator
    const financialRisk = useMemo(() => {
        if (!lead.companies || lead.companies.length === 0) return null;
        // Check for any high risk
        const highRisk = lead.companies.some(c => c.financialRisk === 'High' || c.financialStatus === 'Liquidation' || c.financialStatus === 'Insolvent');
        if (highRisk) return { label: 'High Risk', color: 'bg-loss-bg text-loss-color' };
        
        const checkedCompanies = lead.companies.filter(c => c.financialStatus);
        if (checkedCompanies.length > 0) return { label: 'Checked', color: 'bg-green-500/10 text-green-600' };
        
        return null;
    }, [lead.companies]);
    

    return (
        <div className={`product-card p-0 hover:bg-surface transition-colors ${isSelected ? 'border-primary bg-primary/5' : ''}`} onClick={() => handleNavigationRequest('lead-dossier', { lead })}>
            
            {/* Header Section */}
            <div className="p-4 border-b border-border-color flex gap-3 items-start relative">
                {showCheckbox && (
                    <div 
                        className="pt-1 z-50 relative cursor-default p-1 -m-1" 
                        onClick={(e) => {
                            e.stopPropagation();
                            // No need to do anything else here, the input handles the change
                        }}
                    >
                        <input 
                            type="checkbox" 
                            checked={isSelected} 
                            onChange={(e) => onSelectionChange?.(lead.id, e.target.checked)}
                            className="h-5 w-5 text-primary rounded cursor-pointer pointer-events-auto"
                        />
                    </div>
                )}
                
                {/* Badges Container */}
                <div className="absolute top-0 right-0 flex flex-col items-end">
                    {isOnSite && (
                        <div className="bg-profit-color text-bg-secondary text-[10px] font-bold px-2 py-0.5 rounded-bl-lg rounded-tr-lg shadow-sm z-10 uppercase tracking-wide mb-1">
                            Active Site
                        </div>
                    )}
                    {hasPlans && (
                        <div className={`text-[10px] font-bold px-2 py-0.5 rounded-l-lg shadow-sm uppercase tracking-wide flex items-center gap-1 z-10 ${isOnSite ? 'bg-blue-100 text-blue-700' : 'bg-blue-600 text-white rounded-tr-lg'}`}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            Plans
                        </div>
                    )}
                </div>

                <div className="flex-grow min-w-0 pr-12">
                    <div className="flex justify-between items-start">
                        <h4 className="font-bold text-base text-primary truncate mb-1" title={lead.title}>{lead.title}</h4>
                        <LeadScoreIndicator score={lead.totalScore} lead={lead} />
                    </div>
                    <p className="text-xs text-text-secondary truncate" title={lead.address}>{lead.address || lead.council || 'No Location'}</p>
                </div>
            </div>

            {/* Body Section */}
            <div className="p-4 space-y-3">
                {/* Status & Value */}
                <div className="flex justify-between items-center text-xs">
                    <span className={`px-2 py-1 rounded font-semibold ${lead.slateFitScore === 'High' ? 'bg-profit-bg text-profit-color' : 'bg-surface text-text-secondary'}`}>
                        {lead.slateFitScore} Fit
                    </span>
                    <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-text-primary">{lead.projectValue || 'Value N/A'}</span>
                    </div>
                </div>

                {!isCompactView && <ProjectStatusTimeline currentStage={lead.projectStage} />}
                
                {!isCompactView && displayDate && (
                     <div className="flex items-center gap-2 text-xs bg-primary/10 text-primary p-2 rounded border border-primary/20">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        <span className="font-bold">{displayDate.label}:</span>
                        <span className="font-mono">{displayDate.date}</span>
                    </div>
                )}

                {/* Summary Snippet */}
                <p className={`text-xs text-text-secondary ${isCompactView ? 'line-clamp-1' : 'line-clamp-3'}`} title={lead.summary}>
                    {lead.summary || 'No summary available.'}
                </p>

                {/* Data Chips */}
                <div className="flex flex-wrap gap-1 mt-2">
                    {materialsDisplay && <span className="text-[10px] px-2 py-0.5 bg-bg-secondary border border-border-color rounded text-text-secondary truncate max-w-full" title={materialsDisplay}>Build: {materialsDisplay}</span>}
                    
                    {contactDisplay && (
                        <span className={`text-[10px] px-2 py-0.5 rounded border ${
                            contactsCount > 0 
                                ? (hasEmail ? 'bg-green-500/10 border-green-500/30 text-green-600' : 'bg-surface border-border-color text-text-secondary')
                                : (isOnSite ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-600 font-bold' : 'bg-surface border-border-color text-text-secondary')
                        }`}>
                            {contactsCount === 0 && isOnSite ? '⚠️ ' : ''}
                            <span dangerouslySetInnerHTML={{ __html: contactDisplay }} />
                        </span>
                    )}
                    
                    {financialRisk && (
                        <span className={`text-[10px] px-2 py-0.5 rounded border border-transparent font-bold ${financialRisk.color}`}>
                            {financialRisk.label}
                        </span>
                    )}
                </div>
            </div>

            {/* Footer / Actions */}
            <div className="p-3 bg-bg-secondary border-t border-border-color flex justify-between items-center gap-2" onClick={e => e.stopPropagation()}>
                <div className="flex gap-1">
                    <button onClick={() => onVerifyAndEnrich([lead.id])} className="btn sm tertiary" title="Deep Enrich (Fixes Contacts)" disabled={isJobRunning || lead.isFullyEnriched}>
                        {ICONS.VERIFY_ENRICH}
                    </button>
                    <button onClick={() => runForensicValueAudit(lead.id)} className="btn sm tertiary" title="Forensic Value Audit" disabled={isJobRunning}>
                        💰
                    </button>
                    <button onClick={() => runCloudPlanExtraction(lead.id)} className="btn sm tertiary bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200" title="Cloud Plan Extraction (Worker)" disabled={isJobRunning || !lead.planningUrl}>
                        ☁️
                    </button>
                    <button onClick={() => runSnapHunter([lead.id])} className="btn sm tertiary" title="Snap Hunter: Find & Stabilize Images" disabled={isJobRunning}>
                        📷
                    </button>
                    <button onClick={() => onGenerateDeepStrategy(lead.id)} className="btn sm tertiary" title="Deepen Strategy (Pro)" disabled={isJobRunning || !lead.contactsFetched}>
                        ⚡
                    </button>
                    <button onClick={() => onPrint(lead)} className="btn sm tertiary" title="Print">🖨️</button>
                </div>
                
                <div className="flex gap-1">
                    <button 
                        onClick={() => onUpdate(lead.id, { isFavorite: !lead.isFavorite })} 
                        className={`btn sm ${lead.isFavorite ? 'text-yellow-500' : 'text-text-secondary'} hover:bg-surface`}
                    >
                        ★
                    </button>
                    <button onClick={() => onDelete(lead.id)} className="btn sm red hover:bg-red-600 hover:text-white">
                        Del
                    </button>
                </div>
            </div>
        </div>
    );
};

export const LeadCard = React.memo(LeadCardComponent);
