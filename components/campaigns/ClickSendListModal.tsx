import React, { useState, FC, useEffect } from 'react';
import { useAppStore } from '../../store/store';
import { getContactLists, getContactsFromList } from '../../services/clicksendService';

interface ClickSendListModalProps {
    onClose: () => void;
}

interface ClickSendList {
    list_id: number;
    list_name: string;
    contact_count: number;
}

const ClickSendListModal: FC<ClickSendListModalProps> = ({ onClose }) => {
    const { clicksendConfig, addClickSendListContacts, showModal } = useAppStore();
    const [lists, setLists] = useState<ClickSendList[]>([]);
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);
    const [selectedListIds, setSelectedListIds] = useState<Set<number>>(new Set());

    useEffect(() => {
        const fetchLists = async () => {
            if (!clicksendConfig) {
                await showModal({ type: 'alert', title: 'Error', message: 'ClickSend is not configured.' });
                onClose();
                return;
            }
            try {
                const fetchedLists = await getContactLists(clicksendConfig);
                setLists(fetchedLists);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                await showModal({ type: 'alert', title: 'Error Fetching Lists', message: `Could not fetch contact lists from ClickSend: ${errorMessage}` });
                onClose();
            } finally {
                setLoading(false);
            }
        };
        fetchLists();
    }, [clicksendConfig, onClose, showModal]);

    const handleToggle = (id: number) => {
        setSelectedListIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const handleImport = async () => {
        if (selectedListIds.size === 0 || !clicksendConfig) return;
        setImporting(true);
        try {
            const contactPromises = Array.from(selectedListIds).map((id: number) => getContactsFromList(clicksendConfig, id));
            const contactArrays = await Promise.all(contactPromises);
            const allContacts = contactArrays.flat();
            
            addClickSendListContacts(allContacts);
            onClose();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await showModal({ type: 'alert', title: 'Import Error', message: `Failed to import contacts: ${errorMessage}` });
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="modal">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>Add Contacts from ClickSend</h2>
                    <button onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    {loading ? (
                        <div className="flex justify-center items-center h-48"><div className="loader"/></div>
                    ) : lists.length === 0 ? (
                        <p className="text-center text-text-secondary">No contact lists found in your ClickSend account.</p>
                    ) : (
                        <div className="max-h-96 overflow-y-auto border border-border-color rounded-lg">
                            {lists.map(list => (
                                <div key={list.list_id} onClick={() => handleToggle(list.list_id)} className="flex items-center gap-4 p-3 border-b border-border-color last:border-b-0 hover:bg-surface cursor-pointer">
                                    <input type="checkbox" className="!w-auto" checked={selectedListIds.has(list.list_id)} readOnly />
                                    <div>
                                        <p className="font-semibold">{list.list_name}</p>
                                        <p className="text-xs text-text-secondary">{list.contact_count} contacts</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                     <span className="mr-auto text-sm text-text-secondary">{selectedListIds.size} list(s) selected</span>
                    <button className="btn secondary" onClick={onClose} disabled={importing}>Cancel</button>
                    <button className="btn green" onClick={handleImport} disabled={importing || selectedListIds.size === 0}>
                        {importing ? <span className="loader" /> : 'Import Contacts'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ClickSendListModal;