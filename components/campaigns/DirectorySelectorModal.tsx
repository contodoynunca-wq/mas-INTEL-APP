import React, { useState, FC, useMemo } from 'react';
import { useAppStore } from '../../store/store';

interface DirectorySelectorModalProps {
    onClose: () => void;
}

/**
 * A modal for selecting contacts from the main customer directory to add to the campaign audience.
 * @param {object} props - The component props.
 * @param {Function} props.onClose - Function to call when the modal should be closed.
 * @returns {React.ReactElement} The rendered modal component.
 */
const DirectorySelectorModal: FC<DirectorySelectorModalProps> = ({ onClose }) => {
    const { customerDirectory, addDirectoryCampaignContacts } = useAppStore();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');

    /**
     * Filters the customer directory based on the search term.
     * @returns {Customer[]} The filtered list of customers.
     */
    const filteredCustomers = useMemo(() => {
        if (!searchTerm) return customerDirectory;
        const lowercasedTerm = searchTerm.toLowerCase();
        // FIX: Added optional chaining (?.) to prevent crashes if contact properties are null or undefined.
        // This was the root cause of the crash when opening the modal.
        return customerDirectory.filter(c =>
            c.contactName?.toLowerCase().includes(lowercasedTerm) ||
            c.company?.toLowerCase().includes(lowercasedTerm) ||
            c.email?.toLowerCase().includes(lowercasedTerm)
        );
    }, [customerDirectory, searchTerm]);

    /**
     * Toggles the selection state of a single customer.
     * @param {string} id - The ID of the customer to toggle.
     */
    const handleToggle = (id: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };
    
    /**
     * Toggles the selection of all currently visible (filtered) customers.
     */
    const handleToggleAll = () => {
        // FIX: Explicitly type the Set to prevent TypeScript from inferring 'unknown[]'.
        const allVisibleIds = new Set<string>(filteredCustomers.map(c => c.id));
        const allSelected = filteredCustomers.every(c => selectedIds.has(c.id));

        if (allSelected) {
            // Deselect all visible
            setSelectedIds(prev => {
                const newSet = new Set(prev);
                allVisibleIds.forEach(id => newSet.delete(id));
                return newSet;
            });
        } else {
            // Select all visible
            setSelectedIds(prev => new Set([...prev, ...allVisibleIds]));
        }
    };


    /**
     * Handles the submission of selected contacts.
     */
    const handleAddContacts = () => {
        addDirectoryCampaignContacts(Array.from(selectedIds));
        onClose();
    };

    return (
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: '700px' }}>
                <div className="modal-header">
                    <h2>Add from Directory</h2>
                    <button onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    <input
                        type="text"
                        placeholder="Search contacts by name, company, or email..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="mb-4"
                    />
                    <div className="max-h-96 overflow-y-auto border border-border-color rounded-lg">
                        <table className="w-full">
                             <thead>
                                <tr className="sticky top-0 bg-surface">
                                    <th className="p-2 w-8">
                                        <input
                                            type="checkbox"
                                            className="!w-auto"
                                            checked={filteredCustomers.length > 0 && filteredCustomers.every(c => selectedIds.has(c.id))}
                                            onChange={handleToggleAll}
                                            title="Select/Deselect All Visible"
                                        />
                                    </th>
                                    <th className="p-2 text-left">Name</th>
                                    <th className="p-2 text-left">Company</th>
                                    <th className="p-2 text-left">Email</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCustomers.map(customer => (
                                    <tr key={customer.id} className="hover:bg-surface cursor-pointer" onClick={() => handleToggle(customer.id)}>
                                        <td className="p-2"><input type="checkbox" className="!w-auto" checked={selectedIds.has(customer.id)} readOnly /></td>
                                        <td className="p-2">{customer.contactName}</td>
                                        <td className="p-2">{customer.company}</td>
                                        <td className="p-2">{customer.email}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredCustomers.length === 0 && <p className="text-center text-text-secondary p-8">No contacts found.</p>}
                    </div>
                </div>
                <div className="modal-footer">
                    <span className="mr-auto text-sm text-text-secondary">{selectedIds.size} contact(s) selected</span>
                    <button className="btn secondary" onClick={onClose}>Cancel</button>
                    <button className="btn green" onClick={handleAddContacts} disabled={selectedIds.size === 0}>
                        Add Selected Contacts
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DirectorySelectorModal;