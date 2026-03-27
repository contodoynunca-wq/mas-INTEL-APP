






import React, { FC, useState } from 'react';
import type { Lead, LeadContact } from '@/types';
import { useAppStore } from '@/store/store';
import { generateOutreachEmail } from '@/services/ai/leadIntelService';
import EmailDraftModal from '../common/EmailDraftModal';
import { StaticMap } from '../common/StaticMap';
import LeadScoreIndicator from '@/components/leads/LeadScoreIndicator';
import { ICONS } from '@/constants';
import { getBestMapAddress } from '@/utils/leadPrinting';

interface DynamicDossierViewProps {
    lead: Lead;
}

const DynamicDossierView: FC<DynamicDossierViewProps> = ({ lead }) => {
    const { addLeadFeedback, processAiJob, handleNavigationRequest } = useAppStore();
    const [draftModalData, setDraftModalData] = useState<{ lead: Lead; draft: { text: string; subject: string; to: string } } | null>(null);
    const [isDraftingEmailFor, setIsDraftingEmailFor] = useState<string | null>(null);

    const handleDraftEmail = async (contact: Partial<LeadContact>) => {
        if (!contact.email) return;
        setIsDraftingEmailFor(contact.email);
        const leadWithTargetContact: Lead = { ...lead, companies: [contact] };

        const result = await processAiJob(
            async () => generateOutreachEmail(leadWithTargetContact),
            `Drafting email for ${contact.contactName}`
        );

        if (result) {
            setDraftModalData({ 
                lead, 
                draft: {
                    subject: result.subject,
                    text: result.body,
                    to: contact.email
                } 
            });
        }
        setIsDraftingEmailFor(null);
    };
    
    const handleReDraftEmail = async () => {
        if (!draftModalData) return;
        setIsDraftingEmailFor(draftModalData.draft.to);
        const contact = lead.companies.find(c => c.email === draftModalData.draft.to);
        if (contact) {
            const leadWithTargetContact: Lead = { ...lead, companies: [contact] };
            const draft = await generateOutreachEmail(leadWithTargetContact);
            setDraftModalData(prev => prev ? { 
                ...prev, 
                draft: {
                    subject: draft.subject,
                    text: draft.body,
                    to: prev.draft.to
                }
            } : null);
        }
        setIsDraftingEmailFor(null);
    };
    
    const handleFeedback = (feedback: Lead['feedback']) => {
        addLeadFeedback(lead.id, feedback);
    };

    // Robust Address for Map
    const mapAddress = getBestMapAddress(lead);

    return (
        <div className="p-4 h-full overflow-y-auto print:overflow-visible">
            <style>
                {`
                    @media print {
                        .no-print { display: none !important; }
                        .print-only { display: block !important; }
                        /* Hide scrollbars and interactive elements */
                        ::-webkit-scrollbar { display: none; }
                        body { background: white; color: black; }
                        .break-inside-avoid { page-break-inside: avoid; }
                    }
                    .print-only { display: none; }
                `}
            </style>
            {draftModalData && (
                <EmailDraftModal
                    initialDraft={draftModalData.draft}
                    onClose={() => setDraftModalData(null)}
                    onReDraft={handleReDraftEmail}
                    isLoading={!!isDraftingEmailFor}
                />
            )}
            <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold m-0 p-0 border-none flex-grow">{lead.title}</h2>
                <div className="flex items-center gap-4 no-print">
                    <LeadScoreIndicator score={lead.totalScore} lead={lead} />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                    <div>
                        <h3>Project Overview</h3>
                        <p className="text-text-secondary">{lead.summary}</p>
                    </div>
                    <div>
                        <h3>Planning &amp; Specification</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm mt-2">
                            <p><strong>Planning Ref:</strong> {lead.applicationRef || 'N/A'}</p>
                            <p><strong>Council:</strong> {lead.council || 'N/A'}</p>
                            <p><strong>Date Found:</strong> {lead.dateFound || 'N/A'}</p>
                             <p><strong>Project Stage:</strong> {lead.projectStage || 'N/A'}</p>
                             {lead.applicationDate && <p><strong>Application Date:</strong> {lead.applicationDate}</p>}
                             {lead.decisionDate && <p><strong>Decision Date:</strong> {lead.decisionDate}</p>}
                             {lead.startDate && <p><strong>Construction Start:</strong> {lead.startDate}</p>}
                        </div>
                    </div>
                     <div>
                        <h3>Extracted Materials</h3>
                        {(lead.materials && lead.materials.length > 0) ? (
                            <ul className="list-disc list-inside text-sm space-y-1">
                                {lead.materials.map((m, i) => <li key={i}>{m.name}</li>)}
                            </ul>
                        ) : <p className="text-sm text-text-secondary">No materials extracted.</p>}
                    </div>
                     <div>
                        <h3>AI Sales Strategy</h3>
                        {lead.salesStrategy ? (
                            <div className="p-4 bg-surface rounded-lg whitespace-pre-wrap text-sm" dangerouslySetInnerHTML={{ __html: lead.salesStrategy.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                        ) : <p className="text-sm text-text-secondary">No strategy generated yet.</p>}
                    </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h3>Location</h3>
                        </div>
                        {/* 
                            Robust Map Display Logic:
                            Always use StaticMap with Address priority. Interactive Map removed to prevent wrong location bugs.
                        */}
                        <div className="rounded-lg overflow-hidden border border-border-color">
                             <StaticMap 
                                address={mapAddress} 
                                lat={lead.geolocation?.lat} 
                                lng={lead.geolocation?.lng} 
                             />
                        </div>

                         <div className="flex flex-col gap-2 mt-4 no-print">
                            {lead.geolocation ? (
                                <a href={`https://www.google.com/maps/search/?api=1&query=${lead.geolocation.lat},${lead.geolocation.lng}`} target="_blank" rel="noopener noreferrer" className="btn tertiary w-full">Open in Google Maps</a>
                            ) : (
                                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapAddress || '')}`} target="_blank" rel="noopener noreferrer" className="btn tertiary w-full">Search Address on Google Maps</a>
                            )}
                        </div>
                    </div>
                     <div className="no-print">
                        <h3>Source Documents</h3>
                        <div className="flex flex-col gap-2">
                            {lead.planningUrl && <a href={lead.planningUrl} target="_blank" rel="noopener noreferrer" className="btn tertiary w-full">View on Council Portal</a>}
                            {(lead.planningDocuments && lead.planningDocuments.length > 0) ? (
                                <div className="mt-2 text-sm space-y-3">
                                    {lead.planningDocuments.map((doc, i) => {
                                        const portalDocsUrl = lead.planningUrl ? (lead.planningUrl + (lead.planningUrl.includes('?') ? '&' : '?') + 'activeTab=documents') : '#';
                                        const isExtractable = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp'].some(ext => doc.filename.toLowerCase().endsWith(ext));
                                        return (
                                            <div key={i} className="p-3 bg-surface rounded-lg border border-border-color text-xs">
                                                <p className="font-bold text-primary">✅ {doc.type || 'Plan Document'} ACCESS</p>
                                                <p className="text-text-secondary mt-1"><strong>Planning Ref:</strong> {lead.applicationRef || 'N/A'}</p>
                                                
                                                <div className="mt-3 space-y-2">
                                                    <div className="p-2 bg-bg-secondary rounded">
                                                        <p className="font-semibold">Option 1 - DIRECT (Recommended)</p>
                                                        <ul className="list-disc list-inside text-text-secondary text-[11px] my-1 pl-1">
                                                            <li>Go to {lead.council || 'Council'} portal</li>
                                                            <li>Search Ref: {lead.applicationRef || 'N/A'}</li>
                                                            <li>Click "Documents" tab</li>
                                                            <li>Download: "{doc.filename}"</li>
                                                        </ul>
                                                        <a href={portalDocsUrl} target="_blank" rel="noopener noreferrer" className="btn sm tertiary w-full mt-1">
                                                            Open Council Portal for this Ref
                                                        </a>
                                                    </div>
                                                    
                                                    <div className="p-2 bg-bg-secondary rounded">
                                                        <p className="font-semibold">Option 2 - DOWNLOAD (If you're verified)</p>
                                                        <button className="btn sm w-full mt-1" disabled title="Feature coming soon. This will allow direct download after entering council credentials.">
                                                            I have login, download for me
                                                        </button>
                                                    </div>
                                                    
                                                    <div className="p-2 bg-bg-secondary rounded">
                                                        <p className="font-semibold">Option 3 - AI ANALYSIS (No Download Needed)</p>
                                                        <button className="btn sm green w-full mt-1" onClick={() => handleNavigationRequest('ai-tools')}>
                                                            Use Plan Reader
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="mt-3 pt-2 border-t border-border-color text-text-secondary grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                                                    <div><strong>Status:</strong> <span className="text-yellow-500">Requires Login</span></div>
                                                    <div><strong>File Size:</strong> {doc.size || 'N/A'}</div>
                                                    <div><strong>AI Extractable:</strong> {isExtractable ? <span className="text-profit-color">Yes</span> : <span className="text-loss-color">No</span>}</div>
                                                    <div><strong>Recommendation:</strong> <span className="text-primary">Use Plan Reader</span></div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : <p className="text-sm text-text-secondary mt-2">No specific documents extracted. Check the council portal directly.</p>}
                        </div>
                    </div>
                    <div>
                        <h3>Key Contacts</h3>
                        <div className="space-y-2">
                            {(lead.companies && lead.companies.length > 0) ? lead.companies.map((c, i) => (
                                <div key={i} className="p-3 bg-surface rounded-lg border border-border-color page-break-inside-avoid">
                                    <p className="font-bold">{c.priority === 'main' && '★ '}{c.contactName}</p>
                                    <p className="text-sm text-text-secondary">{c.type} at {c.company}</p>
                                    {c.email && <p className="text-sm"><a href={`mailto:${c.email}`} className="text-primary hover:underline">{c.email}</a></p>}
                                    {c.phone && <p className="text-sm"><a href={`tel:${c.phone}`} className="text-primary hover:underline">{c.phone}</a></p>}
                                    {c.email && (
                                        <button className="btn sm mt-2 no-print" onClick={() => handleDraftEmail(c)} disabled={!!isDraftingEmailFor}>
                                            {isDraftingEmailFor === c.email ? <span className="loader"/> : 'Draft Email'}
                                        </button>
                                    )}
                                </div>
                            )) : <p className="text-sm text-text-secondary">No contacts found for this lead.</p>}
                        </div>
                    </div>
                </div>
            </div>
             <div className="mt-8 pt-4 border-t border-border-color no-print">
                <h3 className="text-center">Is this a good lead?</h3>
                <div className="flex justify-center gap-2 mt-2">
                    <button className={`btn sm ${lead.feedback === 'good' ? 'green' : 'tertiary'}`} onClick={() => handleFeedback('good')}>👍 Good Lead</button>
                    <button className={`btn sm ${lead.feedback === 'bad_contact' ? 'red' : 'tertiary'}`} onClick={() => handleFeedback('bad_contact')}>👎 Bad Contact</button>
                    <button className={`btn sm ${lead.feedback === 'won' ? 'green' : 'tertiary'}`} onClick={() => handleFeedback('won')}>🏆 Project Won</button>
                    <button className={`btn sm ${lead.feedback === 'wrong_status' ? 'red' : 'tertiary'}`} onClick={() => handleFeedback('wrong_status')}>❗️ Wrong Status</button>
                </div>
            </div>
        </div>
    );
};

export default DynamicDossierView;
