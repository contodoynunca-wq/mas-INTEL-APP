
import React, { useState } from 'react';
import { useAppStore } from '../../store/store';

const PrintOptionsSelector = () => {
    const { closeModal } = useAppStore.getState();
    const [pageSize, setPageSize] = useState('A4');
    const [includePersonalEmails, setIncludePersonalEmails] = useState(true);
    const [includeFinancials, setIncludeFinancials] = useState(true);
    const [recipient, setRecipient] = useState('');
    const [customMapLink, setCustomMapLink] = useState('');

    const handleConfirm = () => {
        let watermarkText: string | undefined = undefined;
        if (recipient.trim()) {
            const dateStr = new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
            watermarkText = `Licensed to ${recipient.trim()} - ${dateStr}`;
        }
        closeModal({ pageSize, includePersonalEmails, includeFinancials, includeStrategy: true, watermarkText, customMapLink });
    };

    return (
        <>
            <div className="modal-body">
                <div className="form-group">
                    <label htmlFor="paper-size-select">Paper Size</label>
                    <select id="paper-size-select" value={pageSize} onChange={e => setPageSize(e.target.value)} className="w-full">
                        <option value="A4">A4</option>
                        <option value="A3">A3</option>
                        <option value="letter">Letter</option>
                        <option value="legal">Legal</option>
                    </select>
                </div>
                 <div className="form-group mt-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            className="!w-auto"
                            checked={includePersonalEmails}
                            onChange={e => setIncludePersonalEmails(e.target.checked)}
                            style={{ transform: 'scale(1.2)' }}
                        />
                        <span>Include Personal Emails (Gmail, Outlook, etc.)</span>
                    </label>
                </div>
                <div className="form-group mt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            className="!w-auto"
                            checked={includeFinancials}
                            onChange={e => setIncludeFinancials(e.target.checked)}
                            style={{ transform: 'scale(1.2)' }}
                        />
                        <span>Include Economic Health Check Results</span>
                    </label>
                </div>
                <div className="form-group mt-4 pt-4 border-t border-border-color">
                    <label className="font-bold text-primary">Custom Map Link (Optional)</label>
                    <input 
                        type="text" 
                        placeholder="Paste Google My Maps or Shared Link here..." 
                        value={customMapLink} 
                        onChange={e => setCustomMapLink(e.target.value)} 
                        className="w-full mt-1"
                    />
                    <p className="text-xs text-text-secondary mt-1">
                        If provided, this link will appear on the cover page for the entire group.
                    </p>
                </div>
                <div className="form-group mt-2">
                    <label className="font-bold text-primary">Recipient / Reference (Watermark)</label>
                    <input 
                        type="text" 
                        placeholder="e.g. Project Ref: HPD-01" 
                        value={recipient} 
                        onChange={e => setRecipient(e.target.value)} 
                        className="w-full mt-1"
                    />
                    <p className="text-xs text-text-secondary mt-1">
                        This text will appear as a watermark and in the document header.
                    </p>
                </div>
            </div>
            <div className="modal-footer">
                <button className="btn secondary" onClick={() => closeModal(null)}>Cancel</button>
                <button className="btn" onClick={handleConfirm}>Confirm & Print</button>
            </div>
        </>
    );
};

export default PrintOptionsSelector;
