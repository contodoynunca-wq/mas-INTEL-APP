
import React, { FC, useState } from 'react';
import type { Lead, LeadContact, StrategicEmailDraft } from '@/types';
import { generatePersonaEmails } from '@/services/ai/leadIntelService';
import { useAppStore } from '@/store/store';

interface PersonaEmailModalProps {
    lead: Lead;
    contact: Partial<LeadContact>;
    onClose: () => void;
}

const PersonaEmailModal: FC<PersonaEmailModalProps> = ({ lead, contact, onClose }) => {
    const { processAiJob, showModal } = useAppStore();
    const [scenario, setScenario] = useState('');
    const [emails, setEmails] = useState<StrategicEmailDraft[]>([]);
    const [selectedEmailIndex, setSelectedEmailIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    const handleGenerate = async () => {
        if (!scenario.trim()) {
            await showModal({ type: 'alert', title: 'Input Required', message: 'Please enter a specific scenario or goal.' });
            return;
        }

        setIsLoading(true);
        try {
            const result = await processAiJob(async () => {
                return await generatePersonaEmails(lead, contact, scenario);
            }, `Generating Persona Emails for ${contact.contactName}`);

            if (result && result.length > 0) {
                setEmails(result);
                setSelectedEmailIndex(0);
            } else {
                await showModal({ type: 'alert', title: 'Error', message: 'AI could not generate drafts.' });
            }
        } catch (error) {
            // processAiJob handles logging
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenInGmail = () => {
        if (emails.length === 0) return;
        const current = emails[selectedEmailIndex];
        const to = encodeURIComponent(contact.email || '');
        const subject = encodeURIComponent(current.subject);
        const body = encodeURIComponent(current.body.replace(/<[^>]*>/g, '\n')); // Simple strip HTML for mailto
        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`;
        window.open(gmailUrl, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: '900px' }}>
                <div className="modal-header">
                    <h2>Strategic Outreach: {contact.contactName}</h2>
                    <button onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <div className="mb-6 p-4 bg-surface rounded-lg border border-border-color">
                        <label className="font-bold block mb-2 text-primary">Sales Scenario / Goal</label>
                        <textarea
                            value={scenario}
                            onChange={e => setScenario(e.target.value)}
                            className="w-full p-2 text-sm border border-border-color rounded"
                            rows={3}
                            placeholder="e.g., We need to get into the spec for Phase 1. Mention the saline corrosion issues in Newquay."
                            disabled={isLoading || emails.length > 0}
                        />
                        {emails.length === 0 && (
                            <button 
                                className="btn green w-full mt-2" 
                                onClick={handleGenerate} 
                                disabled={isLoading || !scenario.trim()}
                            >
                                {isLoading ? <span className="loader" /> : 'Generate Persona Strategy'}
                            </button>
                        )}
                    </div>

                    {emails.length > 0 && (
                        <div>
                            <div className="flex border-b border-border-color mb-4 overflow-x-auto">
                                {emails.map((email, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setSelectedEmailIndex(idx)}
                                        className={`px-4 py-2 text-sm font-bold whitespace-nowrap rounded-t-lg transition-colors ${selectedEmailIndex === idx ? 'bg-primary text-bg-secondary' : 'bg-surface text-text-secondary hover:bg-bg-primary'}`}
                                    >
                                        {email.angle}
                                    </button>
                                ))}
                            </div>
                            
                            <div className="p-4 bg-surface rounded-lg border border-border-color">
                                <div className="mb-4">
                                    <span className="text-xs text-text-secondary uppercase font-bold">Subject Line</span>
                                    <p className="font-semibold text-text-primary border p-2 rounded bg-bg-secondary mt-1">
                                        {emails[selectedEmailIndex].subject}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-xs text-text-secondary uppercase font-bold">Email Body</span>
                                    <div 
                                        className="mt-1 p-4 bg-bg-secondary rounded border border-border-color text-sm whitespace-pre-wrap h-64 overflow-y-auto"
                                        dangerouslySetInnerHTML={{ __html: emails[selectedEmailIndex].body }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                    <button className="btn secondary" onClick={onClose}>Close</button>
                    {emails.length > 0 && (
                        <>
                            <button 
                                className="btn tertiary" 
                                onClick={() => setEmails([])} // Reset to draft again
                            >
                                Try New Scenario
                            </button>
                            <button className="btn green" onClick={handleOpenInGmail}>
                                Open in Gmail
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PersonaEmailModal;
