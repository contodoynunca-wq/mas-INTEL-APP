
import React, { FC, useState } from 'react';
import { useAppStore } from '@/store/store';
import type { SupervisorFeedback } from '@/types';

interface SupervisorFeedbackModalProps {
    onClose: () => void;
}

const SupervisorFeedbackModal: FC<SupervisorFeedbackModalProps> = ({ onClose }) => {
    const { submitSupervisorFeedback } = useAppStore();
    const [message, setMessage] = useState('');
    const [sentiment, setSentiment] = useState<SupervisorFeedback['sentiment']>('Neutral');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!message.trim()) return;
        setIsSubmitting(true);
        await submitSupervisorFeedback(message, sentiment);
        setIsSubmitting(false);
        onClose();
    };

    return (
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: '500px' }}>
                <div className="modal-header">
                    <h2 className="text-primary">Supervisor AI Feedback</h2>
                    <button onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <p className="text-sm text-text-secondary mb-4">
                        Tell the Supervisor AI what you think. Your feedback helps it evolve the application logic and spot improvement areas.
                    </p>
                    
                    <div className="form-group mb-4">
                        <label>Sentiment</label>
                        <div className="flex gap-2">
                            {(['Positive', 'Neutral', 'Negative', 'Bug'] as const).map(s => (
                                <button 
                                    key={s} 
                                    onClick={() => setSentiment(s)}
                                    className={`px-3 py-1 rounded border transition-colors ${sentiment === s ? 'bg-primary text-bg-secondary border-primary' : 'bg-surface border-border-color text-text-secondary'}`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Message</label>
                        <textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder="e.g. I always have to click 3 times to delete a lead..."
                            rows={5}
                            className="w-full"
                        />
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn secondary" onClick={onClose}>Cancel</button>
                    <button className="btn green" onClick={handleSubmit} disabled={isSubmitting || !message.trim()}>
                        {isSubmitting ? <span className="loader" /> : 'Send to Supervisor'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SupervisorFeedbackModal;
