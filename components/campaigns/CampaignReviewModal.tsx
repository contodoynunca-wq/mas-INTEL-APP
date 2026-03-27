import React, { FC } from 'react';
import { useAppStore } from '../../store/store';
import type { Campaign } from '../../types';

interface CampaignReviewModalProps {
    campaign: Campaign;
    onClose: () => void;
}

const CampaignReviewModal: FC<CampaignReviewModalProps> = ({ campaign, onClose }) => {
    const { approveAndSendCampaign, isAiJobRunning } = useAppStore();

    const handleApproveAndSend = async () => {
        await approveAndSendCampaign(campaign);
        onClose();
    };
    
    const emailTemplate = campaign.emailTemplates?.[0];
    const smsTemplate = campaign.smsTemplates?.[0];
    const theme = useAppStore(state => state.theme);

    const iframeStyles = `
        <style>
            body { 
                font-family: sans-serif; 
                margin: 0;
                padding: 1rem;
                background-color: ${theme === 'dark' ? '#1E1E1E' : '#FFFFFF'};
                color: ${theme === 'dark' ? '#EAEAEA' : '#2C3E50'};
            }
            a { color: ${theme === 'dark' ? '#87CEEB' : '#2980B9'}; }
            img { max-width: 100%; height: auto; }
        </style>
    `;

    return (
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: '800px' }}>
                <div className="modal-header">
                    <h2>Review & Approve: {campaign.name}</h2>
                    <button onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    {campaign.type === 'email' && emailTemplate && (
                        <div className="space-y-4">
                            <div>
                                <h4 className="font-bold">Email Subject</h4>
                                <p className="p-2 bg-surface rounded">{emailTemplate.subject}</p>
                            </div>
                            <div>
                                <h4 className="font-bold">Email Body Preview</h4>
                                <iframe
                                    srcDoc={iframeStyles + emailTemplate.body}
                                    title="Email Preview"
                                    className="w-full h-96 border border-border-color rounded bg-bg-secondary"
                                />
                            </div>
                        </div>
                    )}
                    {campaign.type === 'sms' && smsTemplate && (
                         <div>
                            <h4 className="font-bold">SMS Body</h4>
                            <pre className="p-4 bg-surface rounded whitespace-pre-wrap font-sans">{smsTemplate.body}</pre>
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                    <button className="btn secondary" onClick={onClose} disabled={isAiJobRunning}>Cancel Review</button>
                    <button className="btn green" onClick={handleApproveAndSend} disabled={isAiJobRunning}>
                        {isAiJobRunning ? <span className="loader" /> : `Approve & Send ${campaign.type.toUpperCase()}`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CampaignReviewModal;