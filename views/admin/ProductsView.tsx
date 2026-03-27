import React, { FC, useState } from 'react';
import { useAppStore } from '../../store/store';
import ProductModal from '../../components/products/ProductModal';
import AccessoryModal from '../../components/products/AccessoryModal';

const ProductsView: FC = () => {
    // Performance Optimization: Use granular selectors
    const productData = useAppStore(state => state.productData);
    const accessoryData = useAppStore(state => state.accessoryData);
    const { showModal, db } = useAppStore.getState(); // Actions and db are stable

    const [editingProduct, setEditingProduct] = useState<any | null | 'new'>(null);
    const [editingAccessory, setEditingAccessory] = useState<any | null | 'new'>(null);

    const handleDeleteProduct = async (id: string) => {
        if (!db) {
            await showModal({type:'alert', title:'Error', message:'Database not connected.'});
            return;
        }
        if (await showModal({type:'confirm', title:'Confirm', message:'Delete product?'})) {
            await db.collection("products").doc(id).delete();
        }
    };

    const handleDeleteAccessory = async (id: string) => {
        if (!db) {
            await showModal({type:'alert', title:'Error', message:'Database not connected.'});
            return;
        }
        if (await showModal({type:'confirm', title:'Confirm', message:'Delete accessory?'})) {
            await db.collection("accessories").doc(id).delete();
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="p-6">
            {editingProduct && <ProductModal product={editingProduct === 'new' ? null : editingProduct} onClose={() => setEditingProduct(null)} showModal={showModal} />}
            {editingAccessory && <AccessoryModal accessory={editingAccessory === 'new' ? null : editingAccessory} onClose={() => setEditingAccessory(null)} showModal={showModal} />}
            
            <div className="flex justify-between items-center mb-6">
                <h2>Slate Product Management</h2>
                <div className="flex gap-2">
                    <button className="btn secondary" onClick={handlePrint}>Print</button>
                    <button className="btn" onClick={() => setEditingProduct('new')}>+ Add Product</button>
                </div>
            </div>

            <div className="panel overflow-x-auto mb-8">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-border-color bg-gray-50 dark:bg-gray-800">
                            <th className="p-3 font-semibold text-sm">Name</th>
                            <th className="p-3 font-semibold text-sm">Size</th>
                            <th className="p-3 font-semibold text-sm">Cost Price (£)</th>
                            <th className="p-3 font-semibold text-sm">Sell Price (£)</th>
                            <th className="p-3 font-semibold text-sm">Stock</th>
                            <th className="p-3 font-semibold text-sm">Thickness</th>
                            <th className="p-3 font-semibold text-sm">Cost/Slate (€)</th>
                            <th className="p-3 font-semibold text-sm">Transport (€)</th>
                            <th className="p-3 font-semibold text-sm">Slates/Crate</th>
                            <th className="p-3 font-semibold text-sm">Crates/Load</th>
                            <th className="p-3 font-semibold text-sm">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {productData.map(p => (
                            <tr key={p.id} className="border-b border-border-color hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                <td className="p-3 text-sm font-medium">{p.name}</td>
                                <td className="p-3 text-sm">{p.size}</td>
                                <td className="p-3 text-sm">£{(p.costPriceGBP || 0).toFixed(2)}</td>
                                <td className="p-3 text-sm">£{(p.sellPriceGBP || 0).toFixed(2)}</td>
                                <td className="p-3 text-sm">{p.stockLevel || 0}</td>
                                <td className="p-3 text-sm">{p.thickness || 0}mm</td>
                                <td className="p-3 text-sm">€{(p.costPerSlateEUR || 0).toFixed(2)}</td>
                                <td className="p-3 text-sm">€{(p.transportEUR || 0).toFixed(2)}</td>
                                <td className="p-3 text-sm">{p.slatesPerCrate || 0}</td>
                                <td className="p-3 text-sm">{p.cratesPerLoad || 0}</td>
                                <td className="p-3 text-sm">
                                    <div className="flex gap-2">
                                        <button className="btn sm" onClick={() => setEditingProduct(p)}>Edit</button>
                                        <button className="btn red sm" onClick={() => handleDeleteProduct(p.id)}>Del</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {productData.length === 0 && (
                            <tr>
                                <td colSpan={11} className="p-6 text-center text-gray-500">No products found. Add a product to get started.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="panel">
                <div className="flex justify-between items-center mb-4">
                    <h3>Manage Accessories</h3>
                    <button className="btn" onClick={() => setEditingAccessory('new')}>+ Add Accessory</button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border-color bg-gray-50 dark:bg-gray-800">
                                <th className="p-3 font-semibold text-sm">Name</th>
                                <th className="p-3 font-semibold text-sm">Price (£)</th>
                                <th className="p-3 font-semibold text-sm">Unit</th>
                                <th className="p-3 font-semibold text-sm">Coverage</th>
                                <th className="p-3 font-semibold text-sm">Default</th>
                                <th className="p-3 font-semibold text-sm">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {accessoryData.map(a => (
                                <tr key={a.id} className="border-b border-border-color hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                    <td className="p-3 text-sm font-medium">{a.name}</td>
                                    <td className="p-3 text-sm">£{(a.priceGBP || 0).toFixed(2)}</td>
                                    <td className="p-3 text-sm">{a.unit}</td>
                                    <td className="p-3 text-sm">{a.coverage}</td>
                                    <td className="p-3 text-sm">{a.isDefault ? 'Yes' : 'No'}</td>
                                    <td className="p-3 text-sm">
                                        <div className="flex gap-2">
                                            <button className="btn tertiary sm" onClick={() => setEditingAccessory(a)}>Edit</button>
                                            <button className="btn red sm" onClick={() => handleDeleteAccessory(a.id)}>Del</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {accessoryData.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-6 text-center text-gray-500">No accessories found. Add an accessory to get started.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ProductsView;