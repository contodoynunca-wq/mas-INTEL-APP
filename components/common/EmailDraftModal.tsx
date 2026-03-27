import React, { FC, useState, useEffect } from 'react';

interface EmailDraftModalProps {
    initialDraft: { text: string, subject: string, to: string };
    onClose: () => void;
    onReDraft: () => Promise<void>;
    isLoading: boolean;
}

const EmailDraftModal: FC<EmailDraftModalProps> = ({ initialDraft, onClose, onReDraft, isLoading }) => {
    const [draft, setDraft] = useState(initialDraft);

    useEffect(() => {
        setDraft(initialDraft);
    }, [initialDraft]);

    const handleSend = () => {
        // Construct the Gmail compose URL
        const to = encodeURIComponent(draft.to);
        const subject = encodeURIComponent(draft.subject);
        const body = encodeURIComponent(draft.text);
        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`;

        // Open the URL in a new tab
        window.open(gmailUrl, '_blank', 'noopener,noreferrer');
        onClose();
    };

    return (
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: '700px' }}>
                <div className="modal-header">
                    <h2>Draft Email</h2>
                    <button onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    <div className="form-group">
                        <label>To:</label>
                        <input type="text" value={draft.to} onChange={e => setDraft(p => ({...p, to: e.target.value}))} />
                    </div>
                    <div className="form-group">
                        <label>Subject:</label>
                        <input type="text" value={draft.subject} onChange={e => setDraft(p => ({...p, subject: e.target.value}))} />
                    </div>
                    <div className="form-group">
                        <label>Body:</label>
                        <textarea value={draft.text} onChange={e => setDraft(p => ({...p, text: e.target.value}))} rows={12}></textarea>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn secondary" onClick={onClose}>Cancel</button>
                    <button className="btn tertiary" onClick={onReDraft} disabled={isLoading}>
                        {isLoading ? <span className="loader"/> : 'Re-Draft with AI'}
                    </button>
                    <button className="btn green" onClick={handleSend}>Open in Gmail</button>
                </div>
            </div>
        </div>
    );
};

export default EmailDraftModal;