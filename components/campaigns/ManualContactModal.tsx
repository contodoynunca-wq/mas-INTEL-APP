import React, { useState, FC } from 'react';
import { useAppStore } from '../../store/store';
import type { CampaignContact } from '../../types';

interface ManualContactModalProps {
    onClose: () => void;
}

/**
 * A modal form for manually adding a single contact to the campaign audience.
 * @param {object} props - The component props.
 * @param {Function} props.onClose - Function to call when the modal should be closed.
 * @returns {React.ReactElement} The rendered modal component.
 */
const ManualContactModal: FC<ManualContactModalProps> = ({ onClose }) => {
    const { addManualCampaignContact } = useAppStore();
    const [formData, setFormData] = useState<Omit<CampaignContact, 'id'>>({
        contactName: '',
        company: '',
        email: '',
        phone: ''
    });
    const [error, setError] = useState('');

    /**
     * Handles changes to form input fields.
     * @param {keyof Omit<CampaignContact, 'id'>} field - The field name to update.
     * @param {string} value - The new value for the field.
     */
    const handleChange = (field: keyof Omit<CampaignContact, 'id'>, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    /**
     * Handles form submission to save the new contact.
     * @param {React.FormEvent} e - The form event.
     */
    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!formData.contactName || !formData.email) {
            setError('Contact Name and Email are required.');
            return;
        }
        addManualCampaignContact(formData);
        onClose();
    };

    return (
        <div className="modal">
            <form onSubmit={handleSave} className="modal-content">
                <div className="modal-header">
                    <h2>Add Manual Contact</h2>
                    <button type="button" onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    <div className="form-grid">
                        <div className="form-group"><label>Contact Name *</label><input type="text" value={formData.contactName} onChange={e => handleChange('contactName', e.target.value)} required /></div>
                        <div className="form-group"><label>Company</label><input type="text" value={formData.company} onChange={e => handleChange('company', e.target.value)} /></div>
                        <div className="form-group"><label>Email *</label><input type="email" value={formData.email} onChange={e => handleChange('email', e.target.value)} required /></div>
                        <div className="form-group"><label>Phone</label><input type="tel" value={formData.phone} onChange={e => handleChange('phone', e.target.value)} /></div>
                    </div>
                    {error && <p className="text-loss-color text-sm mt-2">{error}</p>}
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn green">Add Contact</button>
                </div>
            </form>
        </div>
    );
};

export default ManualContactModal;