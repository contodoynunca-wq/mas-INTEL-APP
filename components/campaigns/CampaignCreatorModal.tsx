import React, { useState, FC } from 'react';
import { useAppStore } from '../../store/store';

interface CampaignCreatorModalProps {
    onClose: () => void;
    initialName?: string;
    initialGoal?: string;
}

/**
 * A modal form for creating a new marketing campaign.
 * It captures the campaign name, goal, and target audience size, then triggers the AI asset generation process.
 * @param {object} props - The component props.
 * @param {Function} props.onClose - Function to call to close the modal.
 * @returns {React.ReactElement} The rendered modal component.
 */
const CampaignCreatorModal: FC<CampaignCreatorModalProps> = ({ onClose, initialName, initialGoal }) => {
    const { createCampaign, campaignContacts, isAiJobRunning } = useAppStore();
    const [name, setName] = useState(initialName || '');
    const [goal, setGoal] = useState(initialGoal || 'Promote an end-of-year offer on our premium slate products.');
    const [targetCount, setTargetCount] = useState(Math.min(100, campaignContacts.length));

    /**
     * Handles the form submission to initiate campaign creation.
     * @returns {Promise<void>}
     */
    const handleSubmit = async (): Promise<void> => {
        if (!name.trim() || !goal.trim()) return;
        
        const contactIdsToTarget = campaignContacts
            .slice(0, Math.min(targetCount, campaignContacts.length))
            .map(c => c.id);

        await createCampaign(name, goal, contactIdsToTarget);
        onClose();
    };

    return (
        <div className="modal">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>Create New Campaign</h2>
                    <button onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    <div className="form-group">
                        <label>Campaign Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g., Q4 2025 Roofer Outreach"
                        />
                    </div>
                    <div className="form-group">
                        <label>Campaign Goal / AI Prompt</label>
                        <textarea
                            value={goal}
                            onChange={e => setGoal(e.target.value)}
                            rows={4}
                            placeholder="Describe the main objective of this campaign for the AI..."
                        />
                    </div>
                    <div className="form-group">
                        <label>Target Audience Size</label>
                        <p className="text-xs text-text-secondary mb-2">Select the number of contacts from your audience list to target. The AI will analyze a sample of these to tailor its strategy.</p>
                        <input
                            type="range"
                            min="1"
                            max={campaignContacts.length}
                            value={targetCount}
                            onChange={e => setTargetCount(parseInt(e.target.value, 10))}
                        />
                        <div className="text-center font-bold">{targetCount} of {campaignContacts.length} contacts</div>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn secondary" onClick={onClose} disabled={isAiJobRunning}>Cancel</button>
                    <button className="btn green" onClick={handleSubmit} disabled={isAiJobRunning || !name || !goal}>
                        {isAiJobRunning ? <span className="loader" /> : 'Generate Campaign'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CampaignCreatorModal;