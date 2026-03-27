import React, { useState, FC } from 'react';
import { useAppStore } from '@/store/store';

const MarkAsSentModal: FC = () => {
    const { closeModal } = useAppStore.getState();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [company, setCompany] = useState('');

    const handleConfirm = () => {
        if (!name || !email) {
            // simple validation
            return;
        }
        closeModal({ name, email, company });
    };

    return (
        <>
            <div className="modal-body">
                <p className="text-sm text-text-secondary mb-4">Log who you sent this lead information to for tracking purposes.</p>
                <div className="form-group">
                    <label>Recipient Name*</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} required />
                </div>
                <div className="form-group">
                    <label>Recipient Email*</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="form-group">
                    <label>Recipient Company</label>
                    <input type="text" value={company} onChange={e => setCompany(e.target.value)} />
                </div>
            </div>
            <div className="modal-footer">
                <button className="btn secondary" onClick={() => closeModal(null)}>Cancel</button>
                <button className="btn green" onClick={handleConfirm} disabled={!name || !email}>Confirm Sent</button>
            </div>
        </>
    );
};

export default MarkAsSentModal;