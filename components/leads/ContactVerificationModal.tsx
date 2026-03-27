import React, { FC } from 'react';
import type { Lead, LeadContact } from '@/types';
import { useAppStore } from '@/store/store';
// FIX: Imported ValidationResult from 'utils/leadPrinting.ts' where it is defined, and removed unused 'validateContact' import.
import type { ValidationResult } from '@/utils/leadPrinting';

interface ContactVerificationModalProps {
    lead: Lead;
    contactIndex: number;
    aiResult: any; // The result from corroborateContactDetails
    clientValidation: ValidationResult;
    dbCheckResult: { found: boolean; details: string };
    onClose: () => void;
}

const VerificationRow: FC<{ label: string; result: { valid: boolean; details: string } }> = ({ label, result }) => (
    <div className="flex justify-between items-start py-2 border-b border-border-color/50">
        <span className="font-semibold text-text-primary">{label}:</span>
        <div className="text-right">
            <span className="font-bold">
                {result.valid ? 'VALID' : 'INVALID'}
            </span>
            <p className="text-xs text-text-secondary">{result.details}</p>
        </div>
    </div>
);

const AiVerificationRow: FC<{ label: string; result: { found: boolean; details: string } }> = ({ label, result }) => (
    <div className="flex justify-between items-start py-2 border-b border-border-color/50">
        <span className="font-semibold text-text-primary">{label}:</span>
        <div className="text-right">
            <span className="font-bold">
                {result.found ? 'FOUND' : 'NOT PUBLICLY AVAILABLE'}
            </span>
            <p className="text-xs text-text-secondary">{result.details}</p>
        </div>
    </div>
);


const ContactVerificationModal: FC<ContactVerificationModalProps> = ({ lead, contactIndex, aiResult, clientValidation, dbCheckResult, onClose }) => {
    const { manuallyVerifyContact, deleteLeadContact, enrichLeadContacts } = useAppStore();
    const contact = lead.companies[contactIndex];
    if (!contact) return null;

    const handleAutoFind = () => {
        enrichLeadContacts(lead.id, false);
        onClose();
    };

    const handleManualVerify = () => {
        manuallyVerifyContact(lead.id, contactIndex);
        onClose();
    };

    const handleDelete = async () => {
        await deleteLeadContact(lead.id, contactIndex);
        onClose();
    };

    const recommendationColor = aiResult.recommendation === 'SAFE TO CALL' ? 'text-profit-color' : aiResult.recommendation === 'NEEDS WORK' ? 'text-yellow-500' : 'text-loss-color';

    return (
        <>
            <div className="modal-body">
                <h3 className="font-bold text-lg mb-2">{contact.contactName} | {contact.company}</h3>
                <div className="p-4 bg-surface rounded-lg space-y-2 text-sm">
                    <VerificationRow label="Email Format" result={{ valid: !clientValidation.issues.some(i => i.includes('email')), details: clientValidation.issues.find(i => i.includes('email')) || 'Correct format' }} />
                    <VerificationRow label="Phone Format" result={{ valid: !clientValidation.issues.some(i => i.includes('phone')), details: clientValidation.issues.find(i => i.includes('phone')) || 'Plausible format' }} />
                    <AiVerificationRow label="Company Website Match" result={aiResult.companyMatch} />
                    <AiVerificationRow label="LinkedIn Profile" result={aiResult.linkedinMatch} />
                    <AiVerificationRow label="Previous Contacts DB" result={dbCheckResult} />
                </div>
                <div className="mt-4 p-4 bg-bg-secondary rounded-lg text-center">
                    <p className="text-sm text-text-secondary">AI Recommendation</p>
                    <p className={`text-2xl font-bold ${recommendationColor}`}>{aiResult.recommendation}</p>
                    <div className="flex items-center justify-center gap-2 mt-2">
                         <p className="text-sm text-text-secondary">Confidence:</p>
                         <div className="w-32 bg-surface rounded-full h-2.5">
                            <div className="bg-primary h-2.5 rounded-full" style={{ width: `${aiResult.confidenceScore}%` }}></div>
                        </div>
                        <span className="font-bold text-primary">{aiResult.confidenceScore}%</span>
                    </div>
                </div>

                {aiResult.recommendation === 'NEEDS WORK' && (
                    <div className="mt-4 text-center">
                        <p className="text-sm text-text-secondary mb-2">The AI couldn't confidently verify this contact. You can try using the AI to perform a deeper search.</p>
                        <button onClick={handleAutoFind} className="btn">Auto-Find & Enrich Contact</button>
                    </div>
                )}
            </div>
            <div className="modal-footer justify-between">
                <div>
                    <button className="btn red" onClick={handleDelete}>Mark as Invalid (Delete)</button>
                </div>
                <div className="flex gap-2">
                    <button className="btn secondary" onClick={onClose}>Close</button>
                    <button className="btn green" onClick={handleManualVerify}>Mark as Verified</button>
                </div>
            </div>
        </>
    );
};

export default ContactVerificationModal;