import React, { FC, useState } from 'react';
import type { InternalContact } from '@/types';
import { useAppStore } from '@/store/store';

interface InternalContactModalProps {
    contact: InternalContact | 'new' | null;
    onClose: () => void;
}

const InternalContactModal: FC<InternalContactModalProps> = ({ contact, onClose }) => { 
    const { showModal, internalContacts, db } = useAppStore();
    const isNew = contact === 'new';
    const [formData, setFormData] = useState<Partial<InternalContact>>(isNew ? {} : contact || {}); 
    const [error, setError] = useState('');

    const handleChange = (field: keyof InternalContact, value: string) => {
        setFormData(prev => ({...prev, [field]: value}));
    };
    
    const handleSave = async (e: React.FormEvent) => { 
        e.preventDefault(); 
        setError('');

        if (!db) {
            setError('Database is not ready, please wait.');
            return;
        }

        if (!formData.name) {
            setError('Branch Name is required.');
            return;
        }
        
        const emailExists = internalContacts.some(c => 
            c.email?.toLowerCase() === formData.email?.toLowerCase() && c.id !== formData.id
        );
        if (formData.email && emailExists) {
            setError('A contact with this email already exists.');
            return;
        }
        
        try { 
            if(isNew) {
                await db.collection('contacts').add(formData);
                onClose();
            } else if (formData.id) {
                const { id, ...dataToUpdate } = formData;
                await db.collection("contacts").doc(id).update(dataToUpdate);
                onClose();
            }
        } catch(err) { 
            await showModal({type:'alert', title: 'Error', message:'Could not save contact.'}); 
        } 
    }; 
    
    const fields: {key: keyof InternalContact, label: string, type?: string, required?: boolean}[] = [ 
        {key: 'name', label: 'Branch Name', required: true}, 
        {key: 'managerName', label: 'Manager Name'},
        {key: 'email', label: 'Email', type: 'email'}, 
        {key: 'phone', label: 'Phone', type: 'tel'},
        {key: 'town', label: 'Town'},
        {key: 'address', label: 'Address'},
    ];
    
    return (
        <div className="modal">
            <form onSubmit={handleSave} className="modal-content">
                <div className="modal-header">
                    <h2>{isNew ? 'Add' : 'Edit'} Internal Contact</h2>
                    <button type="button" onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    <div className="form-grid">
                        {fields.map(f => (
                            <div key={f.key as string} className="form-group">
                                <label>{f.label}{f.required && ' *'}</label>
                                <input 
                                    type={f.type || 'text'} 
                                    value={formData[f.key] as string || ''} 
                                    onChange={e=>handleChange(f.key, e.target.value)} 
                                    required={f.required}
                                />
                            </div>
                        ))}
                    </div>
                    {error && <p className="text-loss-color text-sm mt-2">{error}</p>}
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn green">Save Contact</button>
                </div>
            </form>
        </div>
    );
};

export default InternalContactModal;