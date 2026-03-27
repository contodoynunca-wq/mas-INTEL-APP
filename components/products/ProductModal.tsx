import React, { FC, useState } from 'react';
import type { Product, ModalState } from '../../types';
import { useAppStore } from '../../store/store';

interface ProductModalProps {
    product: Product | null;
    onClose: () => void;
    showModal: (config: Omit<ModalState, 'onResolve'>) => Promise<any>;
}

const ProductModal: FC<ProductModalProps> = ({ product, onClose, showModal }) => {
    const { db } = useAppStore();
    const isNew = product === null;
    const [formData, setFormData] = useState<Partial<Product>>(isNew ? {} : product);

    const handleChange = (field: keyof Product, value: string | number) => {
        setFormData(prev => ({...prev, [field]: value}));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db) {
            await showModal({type:'alert', title: 'Error', message:'Database not connected.'});
            return;
        }
        try {
            if (isNew) {
                await db.collection("products").add(formData);
            } else {
                if (formData.id) {
                    const { id, ...dataToUpdate } = formData;
                    await db.collection("products").doc(id).update(dataToUpdate);
                }
            }
            onClose();
        } catch(err) {
            await showModal({type:'alert', title: 'Error', message:'Could not save product.'});
        }
    };

    const fields: { key: keyof Product; label: string; type: 'text' | 'number' | 'textarea' }[] = [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'size', label: 'Size', type: 'text' },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'imageUrl', label: 'Image URL', type: 'text' },
        { key: 'costPriceGBP', label: 'Cost Price (£)', type: 'number' },
        { key: 'sellPriceGBP', label: 'Selling Price (£)', type: 'number' },
        { key: 'stockLevel', label: 'Stock Level', type: 'number' },
        { key: 'thickness', label: 'Thickness (mm)', type: 'number' },
        { key: 'costPerSlateEUR', label: 'Cost per Slate (€)', type: 'number' },
        { key: 'transportEUR', label: 'Transport (€)', type: 'number' },
        { key: 'slatesPerCrate', label: 'Slates/Crate', type: 'number' },
        { key: 'cratesPerLoad', label: 'Crates/Load', type: 'number' },
        { key: 'slatesAndHalves', label: 'Slates & Halves', type: 'number' },
    ];

    return (
        <div className="modal">
            <form onSubmit={handleSave} className="modal-content">
                <div className="modal-header">
                    <h2>{isNew ? 'Add' : 'Edit'} Product</h2>
                    <button type="button" onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    <div className="form-grid">
                        {fields.map(({ key, label, type }) => (
                            <div key={key} className="form-group">
                                <label>{label}</label>
                                {type === 'textarea' ? (
                                    <textarea 
                                        value={formData[key] as string || ''} 
                                        onChange={e => handleChange(key, e.target.value)}
                                        rows={3}
                                    />
                                ) : (
                                    <input 
                                        type={type} 
                                        value={formData[key] as string | number || ''} 
                                        onChange={e => handleChange(key, type === 'number' ? parseFloat(e.target.value) : e.target.value)}
                                        step={type === 'number' ? '0.01' : undefined}
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

export default ProductModal;