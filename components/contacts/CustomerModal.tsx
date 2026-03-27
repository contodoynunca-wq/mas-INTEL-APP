import React, { FC, useState } from 'react';
import type { Customer } from '@/types';
import { useAppStore } from '@/store/store';

interface CustomerModalProps {
    customer: Customer | 'new';
    onClose: () => void;
    onSaveNew?: (newCustomerData: Omit<Customer, 'id' | 'market'>) => void;
}

const CustomerModal: FC<CustomerModalProps> = ({ customer, onClose, onSaveNew }) => { 
    const { showModal, currentUser, customerDirectory, db } = useAppStore();
    const isNew = customer === 'new';
    const [formData, setFormData] = useState<Partial<Customer>>(isNew ? { status: 'Unverified' } : customer); 
    const [error, setError] = useState('');

    const handleChange = (field: keyof Customer, value: string) => {
        setFormData(prev => ({...prev, [field]: value}));
    };
    
    const handleSave = async (e: React.FormEvent) => { 
        e.preventDefault(); 
        setError('');

        if (!db) {
            setError('Database is not ready, please wait.');
            return;
        }

        if (!formData.contactName) {
            setError('Contact name is required.');
            return;
        }
        
        if (!isNew && !formData.id) {
            setError('This contact appears to be corrupted (missing a valid ID) and cannot be saved. Please close this modal and try deleting it.');
            return;
        }

        const emailExists = customerDirectory.some(c => c.email?.toLowerCase() === formData.email?.toLowerCase() && c.id !== formData.id);
        if (formData.email && emailExists) {
            setError('A customer with this email already exists.');
            return;
        }
        
        try { 
            if(isNew && onSaveNew && currentUser) {
                const newCustomerData: Omit<Customer, 'id' | 'market'> = {
                    userId: currentUser.uid,
                    contactName: formData.contactName!,
                    company: formData.company || '',
                    type: formData.type || '',
                    email: formData.email || '',
                    phone: formData.phone || '',
                    mobile: formData.mobile || '',
                    address: formData.address || '',
                    website: formData.website || '',
                    status: 'Unverified',
                };
                onSaveNew(newCustomerData);
            } else if (!isNew && formData.id) {
                const { id, ...dataToUpdate } = formData;
                await db.collection("customers").doc(id).update(dataToUpdate);
                onClose();
            }
        } catch(err) { 
            await showModal({type:'alert', title: 'Error', message:'Could not save customer.'}); 
        } 
    }; 
    
    const fields: {key: keyof Customer, label: string, type?: string}[] = [ 
        {key: 'contactName', label: 'Contact Name'}, {key: 'company', label: 'Company/Authority'},
        {key: 'email', label: 'Email', type: 'email'}, 
        {key: 'phone', label: 'Landline Phone', type: 'tel'},
        {key: 'mobile', label: 'Mobile Phone', type: 'tel'},
        {key: 'type', label: 'Type'}, {key: 'website', label: 'Website'},
        {key: 'address', label: 'Address'},
    ];
    
    return (
        <div className="modal">
            <form onSubmit={handleSave} className="modal-content">
                <div className="modal-header">
                    <h2>{isNew ? 'Add' : 'Edit'} Customer</h2>
                    <button type="button" onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    <div className="form-grid">
                        {fields.map(f => (
                            <div key={f.key as string} className="form-group">
                                <label>{f.label}</label>
                                <input 
                                    type={f.type || 'text'} 
                                    value={formData[f.key] as string || ''} 
                                    onChange={e=>handleChange(f.key, e.target.value)} 
                                />
                            </div>
                        ))}
                    </div>
                    {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn green">Save Customer</button>
                </div>
            </form>
        </div>
    );
};

export default CustomerModal;