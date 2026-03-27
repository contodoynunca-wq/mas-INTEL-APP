import React, { FC, useMemo, useState, useCallback, DragEvent } from 'react';
import { useAppStore } from '@/store/store';
import type { Lead, SalesStage, ClosedLoopFeedback } from '@/types';
import { useDebounce } from '@/hooks/useDebounce';
import LeadScoreIndicator from '@/components/leads/LeadScoreIndicator';
import { ICONS } from '@/constants';

// --- Kanban Card Component ---
const KanbanCard: FC<{ lead: Lead; onClick: () => void }> = ({ lead, onClick }) => {
    return (
        <div
            className="p-3 rounded-lg bg-surface hover:bg-bg-primary border border-border-color cursor-pointer"
            onClick={onClick}
            draggable="true"
            onDragStart={(e) => {
                e.dataTransfer.setData('leadId', lead.id);
                e.currentTarget.style.opacity = '0.5';
            }}
            onDragEnd={(e) => e.currentTarget.style.opacity = '1'}
        >
            <div className="flex justify-between items-start">
                <p className="font-bold text-sm flex-grow pr-2">{lead.title}</p>
                <LeadScoreIndicator score={lead.totalScore} lead={lead} />
            </div>
            <p className="text-xs text-text-secondary mt-1">{lead.address}</p>
            <div className="flex justify-between items-center mt-2 text-xs">
                <span className="font-semibold bg-bg-primary px-2 py-1 rounded">{lead.projectStage}</span>
                <span className={`font-semibold px-2 py-1 rounded ${lead.slateFitScore === 'High' ? 'text-profit-color' : lead.slateFitScore === 'Medium' ? 'text-yellow-500' : 'text-loss-color'}`}>{lead.slateFitScore} Fit</span>
            </div>
        </div>
    );
};

// --- Feedback Modal Component ---
const FeedbackModal: FC<{ status: 'Won' | 'Lost'; onSave: (feedback: ClosedLoopFeedback) => void; onClose: () => void }> = ({ status, onSave, onClose }) => {
    const [wonDetails, setWonDetails] = useState({ quotedSlateValue: 0, quotedTotalBasketValue: 0, appointedContractor: '' });
    const [lostDetails, setLostDetails] = useState({ reason: 'Price' as 'Price' | 'Availability' | 'Relationship' | 'Other', competitor: '', otherReason: '' });

    const handleSave = () => {
        if (status === 'Won') {
            onSave({ status: 'Won', wonDetails });
        } else {
            onSave({ status: 'Lost', lostDetails });
        }
        onClose();
    };

    return (
        <div className="modal">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>Feedback for Lead: {status}</h2>
                    <button onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body space-y-4">
                    {status === 'Won' ? (
                        <>
                            <div className="form-group"><label>Quoted Value (Mont Azul Slate)</label><input type="number" value={wonDetails.quotedSlateValue} onChange={e => setWonDetails(p => ({...p, quotedSlateValue: parseFloat(e.target.value) || 0}))} /></div>
                            <div className="form-group"><label>Quoted Value (Total Basket)</label><input type="number" value={wonDetails.quotedTotalBasketValue} onChange={e => setWonDetails(p => ({...p, quotedTotalBasketValue: parseFloat(e.target.value) || 0}))} /></div>
                            <div className="form-group"><label>Appointed Contractor</label><input type="text" value={wonDetails.appointedContractor} onChange={e => setWonDetails(p => ({...p, appointedContractor: e.target.value}))} /></div>
                        </>
                    ) : (
                        <>
                            <div className="form-group"><label>Reason for Loss</label><select value={lostDetails.reason} onChange={e => setLostDetails(p => ({...p, reason: e.target.value as any}))}><option>Price</option><option>Availability</option><option>Relationship</option><option>Other</option></select></div>
                            {lostDetails.reason === 'Other' && <div className="form-group"><label>Please specify</label><input type="text" value={lostDetails.otherReason} onChange={e => setLostDetails(p => ({...p, otherReason: e.target.value}))} /></div>}
                            <div className="form-group"><label>Lost to (Competitor)</label><input type="text" value={lostDetails.competitor} onChange={e => setLostDetails(p => ({...p, competitor: e.target.value}))} placeholder="e.g., Competitor A, Cheaper Import" /></div>
                        </>
                    )}
                </div>
                <div className="modal-footer">
                    <button className="btn secondary" onClick={onClose}>Cancel</button>
                    <button className="btn green" onClick={handleSave}>Save Feedback</button>
                </div>
            </div>
        </div>
    );
};

// --- Partner Playbook Modal Component ---
const PartnerPlaybookModal: FC<{ lead: Lead; onClose: () => void }> = ({ lead, onClose }) => {
    const { generateLeadStrategy, generateOpportunityBasket } = useAppStore();
    const needsIntel = !lead.salesStrategy || !lead.opportunityBasket;

    const handleGenerateIntel = () => {
        if (!lead.salesStrategy) generateLeadStrategy(lead.id);
        if (!lead.opportunityBasket) generateOpportunityBasket(lead.id);
    };

    return (
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: '900px' }}>
                <div className="modal-header">
                    <h2>Partner Playbook: {lead.title}</h2>
                    <button onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    {needsIntel && (
                        <div className="p-4 bg-yellow-500/10 border border-yellow-500 rounded-lg text-center mb-4">
                            <p className="text-yellow-500 mb-2">This lead has not been fully analyzed for the Partner Playbook.</p>
                            <button className="btn secondary" onClick={handleGenerateIntel}>Generate Intel with AI</button>
                        </div>
                    )}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div>
                            <h3>Project Snapshot</h3>
                            <div className="text-sm space-y-2 p-3 bg-surface rounded-lg">
                                <p><strong>Address:</strong> {lead.address}</p>
                                <p><strong>Project Stage:</strong> {lead.projectStage}</p>
                                <p><strong>Inferred Slate Value:</strong> {lead.projectValue || 'N/A'}</p>
                                <p><strong>Planning Ref:</strong> {lead.applicationRef || 'N/A'}</p>
                            </div>

                             <h3 className="mt-4">Key Contacts</h3>
                             <div className="space-y-2 text-sm max-h-48 overflow-y-auto">
                                {lead.companies?.map((c, i) => (
                                    <div key={i} className="p-2 bg-surface rounded-lg">
                                        <p><strong>{c.contactName}</strong> ({c.type})</p>
                                        <p className="text-text-secondary">{c.company}</p>
                                        {c.email && <a href={`mailto:${c.email}`} className="text-primary">{c.email}</a>} {c.phone && <a href={`tel:${c.phone}`} className="text-primary">{c.phone}</a>}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h3>Opportunity Basket</h3>
                            {lead.opportunityBasket ? (
                                <table className="w-full text-sm">
                                    <tbody>
                                        <tr className="border-b border-border-color"><td className="font-semibold p-2">Primary Opportunity</td><td className="p-2">{lead.opportunityBasket.primary}</td></tr>
                                        <tr className="border-b border-border-color"><td className="font-semibold p-2 align-top">High-Attach Basket</td><td className="p-2"><ul>{lead.opportunityBasket.highAttach.map((item, i) => <li key={i}>• {item}</li>)}</ul></td></tr>
                                        <tr><td className="font-semibold p-2">Third-Order Opportunity</td><td className="p-2">{lead.opportunityBasket.thirdOrder}</td></tr>
                                    </tbody>
                                </table>
                            ) : <p className="text-sm text-text-secondary">Generate intel to see opportunity basket.</p>}

                            <h3 className="mt-4">Source Documents</h3>
                            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                                {lead.planningUrl && <a href={lead.planningUrl} target="_blank" rel="noopener noreferrer" className="btn tertiary">Council Planning Portal</a>}
                                {lead.specDocumentUrl && <a href={lead.specDocumentUrl} target="_blank" rel="noopener noreferrer" className="btn tertiary">Specification Document</a>}
                                {lead.planningDocuments?.map((doc, i) => (
                                    <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer" className="btn tertiary" title={doc.filename}>
                                        Download: {doc.type || 'Plan Document'}
                                    </a>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="mt-6">
                        <h3>Partner Playbook</h3>
                        {lead.salesStrategy ? <div className="p-4 bg-surface rounded-lg whitespace-pre-wrap text-sm" dangerouslySetInnerHTML={{ __html: lead.salesStrategy.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} /> : <p className="text-sm text-text-secondary">Generate intel to see the playbook.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Main View Component ---
const IntelligentSalesHubView: FC = () => {
    const { activeSearches, savedLeads, updateLeadSalesStage } = useAppStore();
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [feedbackState, setFeedbackState] = useState<{leadId: string, status: 'Won' | 'Lost'} | null>(null);
    const [dragOverColumn, setDragOverColumn] = useState<SalesStage | null>(null);

    const allLeads = useMemo(() => {
        const combinedLeads = [...activeSearches, ...savedLeads].flatMap(job => job.leads);
        const uniqueLeads = Array.from(new Map(combinedLeads.map(lead => [lead.id, lead])).values());
        return uniqueLeads;
    }, [activeSearches, savedLeads]);

    const leadsByStage = useMemo(() => {
        const stages: Record<SalesStage, Lead[]> = {
            'New Leads': [], 'Contacted': [], 'Quoting': [], 'Won': [], 'Lost': []
        };
        allLeads.forEach(lead => {
            const stage = lead.salesStage || 'New Leads';
            if (stages[stage]) {
                stages[stage].push(lead);
            }
        });
        return stages;
    }, [allLeads]);

    const handleDrop = async (e: DragEvent<HTMLDivElement>, targetStage: SalesStage) => {
        e.preventDefault();
        setDragOverColumn(null);
        const leadId = e.dataTransfer.getData('leadId');
        const lead = allLeads.find(l => l.id === leadId);
        if (!lead || lead.salesStage === targetStage) return;

        if (targetStage === 'Won' || targetStage === 'Lost') {
            setFeedbackState({ leadId, status: targetStage });
        } else {
            await updateLeadSalesStage(leadId, targetStage);
        }
    };

    const handleFeedbackSave = async (feedback: ClosedLoopFeedback) => {
        if (feedbackState) {
            await updateLeadSalesStage(feedbackState.leadId, feedbackState.status, feedback);
            setFeedbackState(null);
        }
    };
    
    const KANBAN_STAGES: SalesStage[] = ['New Leads', 'Contacted', 'Quoting', 'Won', 'Lost'];

    return (
        <div className="h-full flex flex-col">
            {selectedLead && <PartnerPlaybookModal lead={selectedLead} onClose={() => setSelectedLead(null)} />}
            {feedbackState && <FeedbackModal status={feedbackState.status} onSave={handleFeedbackSave} onClose={() => setFeedbackState(null)} />}
            
            <h2 className="flex-shrink-0">Distributor Sales Hub</h2>
            <div className="flex-grow grid grid-cols-5 gap-4 overflow-x-auto min-h-0">
                {KANBAN_STAGES.map(stage => (
                    <div
                        key={stage}
                        className={`flex flex-col bg-bg-secondary rounded-lg p-2 transition-colors ${dragOverColumn === stage ? 'bg-primary/10' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOverColumn(stage); }}
                        onDragLeave={() => setDragOverColumn(null)}
                        onDrop={(e) => handleDrop(e, stage)}
                    >
                        <h3 className="font-bold text-center p-2 border-b border-border-color flex-shrink-0">{stage} ({leadsByStage[stage].length})</h3>
                        <div className="flex-grow overflow-y-auto p-2 space-y-3">
                            {leadsByStage[stage].map(lead => (
                                <KanbanCard key={lead.id} lead={lead} onClick={() => setSelectedLead(lead)} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default IntelligentSalesHubView;