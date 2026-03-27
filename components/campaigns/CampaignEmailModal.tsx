import React, { useState, FC, useEffect } from 'react';
import { useAppStore } from '../../store/store';
import type { Campaign } from '../../types';
import { createContactList, addContactsToList, sendEmailCampaign } from '../../services/clicksendService';
import { getDb } from '../../services/firebase';
import firebase from 'firebase/compat/app';
import { generateCampaignAssets } from '../../services/ai/campaignService';
import TinyMceEditor from '../common/TinyMceEditor';

interface CampaignEmailModalProps {
    campaign: Campaign;
    onClose: () => void;
}

/**
 * A modal for drafting, reviewing, and sending an email campaign based on an AI-generated template.
 * @param {object} props - The component props.
 * @param {Campaign} props.campaign - The campaign object containing templates and audience data.
 * @param {Function} props.onClose - Function to call to close the modal.
 * @returns {React.ReactElement} The rendered modal component.
 */
const CampaignEmailModal: FC<CampaignEmailModalProps> = ({ campaign, onClose }) => {
    const { processAiJob, showModal, clicksendConfig, campaignContacts } = useAppStore();
    const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(0);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [isReDrafting, setIsReDrafting] = useState(false);

    useEffect(() => {
        if (campaign.emailTemplates && campaign.emailTemplates.length > 0) {
            const template = campaign.emailTemplates[selectedTemplateIndex];
            setSubject(template.subject);
            setBody(template.body);
        }
    }, [campaign, selectedTemplateIndex]);

    /**
     * Triggers the AI to generate a new version of the current email template.
     * @returns {Promise<void>}
     */
    const handleReDraft = async (): Promise<void> => {
        setIsReDrafting(true);
        try {
            const contacts = campaign.contacts || [];
            const assets = await generateCampaignAssets(campaign.name, `A new version of this: ${campaign.goal}`, contacts);
            if (assets.emailTemplates && assets.emailTemplates.length > selectedTemplateIndex) {
                const newTemplate = assets.emailTemplates[selectedTemplateIndex];
                setSubject(newTemplate.subject);
                setBody(newTemplate.body);
            }
        } catch (e) {
            await showModal({ type: 'alert', title: 'AI Error', message: 'Could not re-draft the email.' });
        } finally {
            setIsReDrafting(false);
        }
    };

    /**
     * Initiates the process of sending the email campaign via the ClickSend integration.
     * This function now correctly uses the campaign endpoint which supports personalization.
     * @returns {Promise<void>}
     */
    const handleSend = async (): Promise<void> => {
        const contactsForSync = campaign.contacts || [];
        const confirmed = await showModal({
            type: 'confirm',
            title: 'Confirm Email Campaign',
            message: `You are about to send this email with the subject "<strong>${subject}</strong>" to ${contactsForSync.length} contacts via ClickSend. Are you sure you want to proceed?`
        });

        if (confirmed) {
            onClose(); // Close modal immediately and show progress in process monitor
            processAiJob(async (updateStatus) => {
                if (!clicksendConfig) {
                    throw new Error("ClickSend configuration not found.");
                }
                 if (!clicksendConfig.fromEmailId || !clicksendConfig.fromName) {
                    throw new Error("ClickSend 'From Email ID' and 'From Name' must be set in the Admin panel before sending emails.");
                }

                if (contactsForSync.length === 0) {
                    throw new Error("This campaign has no contacts to send to.");
                }

                try {
                    // FIX: Replaced direct usage of 'db' with a call to 'getDb()' to fix module export error.
                    const db = getDb();
                    let listId = campaign.clicksendListId;

                    if (!listId) {
                        updateStatus({ progress: 10, description: 'Creating new contact list in ClickSend...' });
                        const newListName = `${campaign.name} - ${new Date().toISOString()}`;
                        listId = await createContactList(clicksendConfig, newListName);
                        await db.collection('campaigns').doc(campaign.id).update({ clicksendListId: listId });
                    } else {
                         updateStatus({ progress: 10, description: 'Using existing ClickSend contact list...' });
                    }

                    updateStatus({ progress: 30, description: `Syncing ${contactsForSync.length} contacts to ClickSend...` });
                    await addContactsToList(clicksendConfig, listId, contactsForSync);
                    await db.collection('campaigns').doc(campaign.id).update({ lastSync: firebase.firestore.FieldValue.serverTimestamp() });

                    updateStatus({ progress: 70, description: 'Sending email campaign...' });
                    
                    // Replace app-side placeholders with ClickSend's personalization tags for the campaign endpoint
                    const finalBody = body.replace(/{{name}}/g, '[first_name]');
                    const finalSubject = subject.replace(/{{name}}/g, '[first_name]');
                    
                    const response = await sendEmailCampaign(clicksendConfig, listId, campaign.name, finalSubject, finalBody);

                    const campaignId = response?.data?.campaign_id;
                    if(campaignId) {
                        await db.collection('campaigns').doc(campaign.id).update({ clicksendEmailCampaignId: campaignId, status: 'sent' });
                    } else {
                         await db.collection('campaigns').doc(campaign.id).update({ status: 'sent' });
                    }

                    updateStatus({ progress: 100, description: 'Campaign sent successfully!' });
                    await showModal({ type: 'alert', title: 'Campaign Sent', message: 'Your email campaign has been successfully dispatched via ClickSend.' });

                } catch (error) {
                     const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
                     await showModal({ type: 'alert', title: 'Campaign Failed', message: `There was an error sending the campaign: ${errorMessage}` });
                     throw error;
                }
            }, `Sending Email Campaign: ${campaign.name}`);
        }
    };

    return (
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: '800px' }}>
                <div className="modal-header">
                    <h2>Draft & Send Email Campaign: {campaign.name}</h2>
                    <button onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex border border-border-color rounded-lg p-1">
                            {campaign.emailTemplates.map((template, index) => (
                                <button
                                    key={index}
                                    onClick={() => setSelectedTemplateIndex(index)}
                                    className={`px-3 py-1 text-sm rounded-md ${selectedTemplateIndex === index ? 'bg-primary text-bg-secondary' : ''}`}
                                >
                                    {template.name || `Template ${index + 1}`}
                                </button>
                            ))}
                        </div>
                        <span className="text-sm font-bold text-text-secondary">To: {campaign.contacts.length} contacts</span>
                    </div>

                    <div className="form-group">
                        <label>Subject</label>
                        <input type="text" value={subject} onChange={e => setSubject(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label>Body (HTML is supported)</label>
                        <TinyMceEditor
                            key={selectedTemplateIndex}
                            value={body}
                            onEditorChange={setBody}
                        />
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn secondary" onClick={onClose}>Cancel</button>
                    <button className="btn tertiary" onClick={handleReDraft} disabled={isReDrafting}>
                        {isReDrafting ? <span className="loader"/> : 'Re-Draft with AI'}
                    </button>
                    <button className="btn green" onClick={handleSend}>
                        Send Campaign
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CampaignEmailModal;
