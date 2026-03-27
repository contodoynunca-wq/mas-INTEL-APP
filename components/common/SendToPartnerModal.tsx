
import React, { FC, useState, useEffect } from 'react';
import { useAppStore } from '@/store/store';
import { generatePartnerOutreachEmail, generatePartnerPrepReport } from '@/services/ai/leadIntelService';
import type { Lead, InternalContact, SentItem, PartnerPrepReport } from '@/types';
import firebase from 'firebase/compat/app';
import { getDb } from '@/services/firebase';

interface SendToPartnerModalProps {
    lead: Lead;
    onClose: () => void;
}

export const SendToPartnerModal: FC<SendToPartnerModalProps> = ({ lead, onClose }) => {
    const { internalContacts, currentUser, showModal, processAiJob } = useAppStore();
    const [step, setStep] = useState<'select' | 'prep' | 'draft'>('select');
    const [selectedPartner, setSelectedPartner] = useState<InternalContact | null>(null);
    const [prepReport, setPrepReport] = useState<PartnerPrepReport | null>(null);
    const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (step === 'draft' && selectedPartner && !draft) {
            const generateDraft = async () => {
                setIsLoading(true);
                try {
                    // Generate draft with prep report context if available
                    const generatedDraft = await generatePartnerOutreachEmail(lead, selectedPartner.name, prepReport || undefined);
                    setDraft(generatedDraft);
                } catch (error) {
                    console.error("Failed to generate partner email", error);
                    await showModal({ type: 'alert', title: 'AI Error', message: 'Could not generate the email draft.' });
                    setStep('select'); 
                } finally {
                    setIsLoading(false);
                }
            };
            generateDraft();
        }
    }, [step, selectedPartner, lead, draft, showModal, prepReport]);

    const handleSelectPartner = (partner: InternalContact) => {
        setSelectedPartner(partner);
        // Go to prep step first
        setStep('prep');
    };
    
    const handleGeneratePrep = async () => {
        if (!selectedPartner) return;
        try {
             // Use processAiJob to show progress
             const report = await processAiJob(
                async () => generatePartnerPrepReport(lead, selectedPartner.name),
                `Analysing lead for ${selectedPartner.name}`
            );
            if (report) {
                setPrepReport(report);
            }
        } catch (e) {
            // Error handled by processAiJob, but we can stay on prep screen
        }
    };

    const handleSkipPrep = () => {
        setStep('draft');
    };
    
    const handleProceedToDraft = () => {
        setStep('draft');
    };

    const handleSend = async () => {
        if (!draft || !selectedPartner || !currentUser) return;

        setIsLoading(true);
        try {
            const db = getDb();
            const sentItem: Omit<SentItem, 'id'> = {
                type: 'single',
                leadId: lead.id,
                leadTitle: lead.title,
                recipientName: selectedPartner.name,
                recipientEmail: selectedPartner.email,
                recipientCompany: selectedPartner.company || '',
                sentAt: firebase.firestore.FieldValue.serverTimestamp() as firebase.firestore.Timestamp,
                sentBy: currentUser.email!,
                userId: currentUser.uid,
            };
            await db.collection('sentItems').add(sentItem);
            
            // Open Gmail
            const to = encodeURIComponent(selectedPartner.email);
            const subject = encodeURIComponent(draft.subject);
            const body = encodeURIComponent(draft.body);
            const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`;
            window.open(gmailUrl, '_blank', 'noopener,noreferrer');
            
            await showModal({type: 'alert', title: 'Success', message: 'Lead has been marked as sent and a draft opened in Gmail.'});
            onClose();

        } catch (error) {
            console.error("Failed to mark as sent:", error);
            await showModal({ type: 'alert', title: 'Error', message: 'Could not log the sent item.' });
        } finally {
            setIsLoading(false);
        }
    };
    
    if (step === 'select') {
        return (
            <div className="modal">
                <div className="modal-content">
                    <div className="modal-header">
                        <h2>Select a Partner to Send To</h2>
                        <button onClick={onClose}>&times;</button>
                    </div>
                    <div className="modal-body">
                        <p className="text-sm text-text-secondary mb-4">Choose a distributor or internal contact to send the playbook for "{lead.title}".</p>
                        <div className="max-h-80 overflow-y-auto space-y-2">
                            {internalContacts.map(contact => (
                                <div key={contact.id} onClick={() => handleSelectPartner(contact)} className="p-3 bg-surface rounded-lg cursor-pointer hover:bg-bg-primary">
                                    <p className="font-semibold">{contact.name}</p>
                                    <p className="text-xs text-text-secondary">{contact.company} - {contact.email}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    
    if (step === 'prep') {
        return (
            <div className="modal">
                <div className="modal-content" style={{maxWidth: '700px'}}>
                    <div className="modal-header">
                         <h2>Meeting Prep: {selectedPartner?.name}</h2>
                         <button onClick={() => setStep('select')}>&larr; Back</button>
                    </div>
                    <div className="modal-body">
                        {!prepReport ? (
                            <div className="text-center p-8">
                                <p className="mb-4">Would you like to run the <strong>Strategic Verification Engine</strong> for this meeting?</p>
                                <p className="text-sm text-text-secondary mb-6">This will verify the company is active, find the specific decision maker (Buyer/QS), and identify the nearest branch or trading angle for {selectedPartner?.name}.</p>
                                <button className="btn green" onClick={handleGeneratePrep}>
                                    Run Strategic Analysis
                                </button>
                                <button className="btn tertiary ml-2" onClick={handleSkipPrep}>
                                    Skip & Just Draft Email
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className={`p-3 rounded-lg border ${prepReport.verification.is_active_company ? 'bg-profit-bg border-profit-color' : 'bg-loss-bg border-loss-color'}`}>
                                    <h4 className="font-bold text-sm">1. Verification</h4>
                                    <p className="text-sm">
                                        {prepReport.verification.is_active_company ? '✅ Active Trading Company' : '❌ Inactive/Unverified'} 
                                        {prepReport.verification.company_reg_number && ` (Reg: ${prepReport.verification.company_reg_number})`}
                                    </p>
                                </div>
                                
                                <div className="p-3 bg-surface rounded-lg border border-border-color">
                                    <h4 className="font-bold text-sm text-primary">2. The Buyer / Contact</h4>
                                    <p className="text-sm font-semibold">{prepReport.enhanced_contact.name}</p>
                                    <p className="text-xs text-text-secondary">{prepReport.enhanced_contact.role}</p>
                                    {prepReport.enhanced_contact.linkedin_or_source_url && (
                                        <a href={prepReport.enhanced_contact.linkedin_or_source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">View Source</a>
                                    )}
                                </div>

                                <div className="p-3 bg-surface rounded-lg border border-border-color">
                                    <h4 className="font-bold text-sm text-primary">3. The {selectedPartner?.name} Angle</h4>
                                    <p className="text-sm"><strong>Nearest Branch:</strong> {prepReport.partner_strategy.nearest_branch}</p>
                                    <p className="text-sm italic mt-1">"{prepReport.partner_strategy.trade_angle}"</p>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="modal-footer">
                        {prepReport && <button className="btn green w-full" onClick={handleProceedToDraft}>Use This Data to Draft Email</button>}
                    </div>
                </div>
            </div>
        );
    }
    
    if (step === 'draft') {
        return (
             <div className="modal">
                <div className="modal-content" style={{maxWidth: '700px'}}>
                    <div className="modal-header">
                        <h2>Draft Email for {selectedPartner?.name}</h2>
                        <button onClick={() => setStep('prep')}>&larr; Back</button>
                    </div>
                    <div className="modal-body">
                        {isLoading && !draft ? <div className="flex justify-center p-8"><div className="loader"/></div> : (
                            <>
                                <div className="form-group">
                                    <label>To:</label>
                                    <input type="text" value={selectedPartner?.email || ''} readOnly />
                                </div>
                                <div className="form-group">
                                    <label>Subject:</label>
                                    <input type="text" value={draft?.subject || ''} onChange={e => setDraft(p => p ? {...p, subject: e.target.value} : null)} />
                                </div>
                                <div className="form-group">
                                    <label>Body:</label>
                                    <textarea value={draft?.body || ''} onChange={e => setDraft(p => p ? {...p, body: e.target.value} : null)} rows={12}></textarea>
                                </div>
                            </>
                        )}
                    </div>
                    <div className="modal-footer">
                        <button className="btn secondary" onClick={onClose}>Cancel</button>
                        <button className="btn green" onClick={handleSend} disabled={isLoading || !draft}>
                            {isLoading ? <span className="loader"/> : 'Mark as Sent & Open Gmail'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
    
    return null;
};
