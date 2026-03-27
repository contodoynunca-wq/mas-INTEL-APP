import React, { FC, useState } from 'react';
import type { Accessory, ModalState } from '../../types';
import { useAppStore } from '../../store/store';

interface AccessoryModalProps {
    accessory: Accessory | null;
    onClose: () => void;
    showModal: (config: Omit<ModalState, 'onResolve'>) => Promise<any>;
}

const AccessoryModal: FC<AccessoryModalProps> = ({ accessory, onClose, showModal }) => {
    const { db } = useAppStore();
    const isNew = accessory === null;
    const [formData, setFormData] = useState<Partial<Accessory>>(isNew ? { isDefault: true, priceGBP: 0 } : accessory);

    const handleChange = (field: keyof Accessory, value: string | number | boolean) => {
        setFormData(prev => ({...prev, [field]: value}));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db) {
            await showModal({type: 'alert', title: 'Error', message: 'Database not connected.'});
            return;
        }
        if (!formData.name) {
            await showModal({type: 'alert', title: 'Error', message: 'Accessory name is required.'});
            return;
        }
        try {
            if (isNew) {
                await db.collection("accessories").add(formData);
            } else {
                if (formData.id) {
                    const { id, ...dataToUpdate } = formData;
                    await db.collection("accessories").doc(id).update(dataToUpdate);
                }
            }
            onClose();
        } catch(err) {
            await showModal({type:'alert', title: 'Error', message:'Could not save accessory.'});
        }
    };

    const fields: { key: keyof Accessory; label: string; type: 'text' | 'number' | 'checkbox' }[] = [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'priceGBP', label: 'Price (£)', type: 'number' },
        { key: 'unit', label: 'Unit (e.g., roll, m, box)', type: 'text' },
        { key: 'coverage', label: 'Coverage (e.g., m² per roll)', type: 'number' },
        { key: 'isDefault', label: 'Include in Quotes by Default', type: 'checkbox' },
    ];

    return (
        <div className="modal">
            <form onSubmit={handleSave} className="modal-content">
                <div className="modal-header">
                    <h2>{isNew ? 'Add' : 'Edit'} Accessory</h2>
                    <button type="button" onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    <div className="form-grid">
                        {fields.map(({ key, label, type }) => (
                            <div key={key} className={`form-group ${type === 'checkbox' ? 'col-span-full' : ''}`}>
                                <label className={type === 'checkbox' ? 'flex items-center gap-2' : ''}>
                                {type === 'checkbox' && (
                                     <input 
                                        type="checkbox" 
                                        checked={!!formData[key]} 
                                        onChange={e => handleChange(key, e.target.checked)}
                                        className="!w-auto"
                                    />
                                )}
                                    {label}
                                </label>
                                {type !== 'checkbox' && (
                                    <input 
                                        type={type} 
                                        value={formData[key] as string | number || ''} 
                                        onChange={e => handleChange(key, type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                                        step={type === 'number' ? '0.01' : undefined}
                                        required={key === 'name'}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn green">Save</button>
                </div>
            </form>
        </div>
    );
};

export default AccessoryModal;