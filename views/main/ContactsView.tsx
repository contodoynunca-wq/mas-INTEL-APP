import React, { FC, useState, useMemo, useEffect } from 'react';
import type { Customer, LeadMarket, InternalContact } from '../../types';
import { useAppStore } from '../../store/store';
import CustomerModal from '../../components/contacts/CustomerModal';
import InternalContactModal from '../../components/contacts/InternalContactModal';
import InternalContactImportModal from '../../components/contacts/InternalContactImportModal';
import { ContactRow } from '../../components/contacts/ContactRow';
import { printContent } from '../../utils/print';
import * as XLSX from 'xlsx';
import { useDebounce } from '../../hooks/useDebounce';

const PAGE_SIZE = 30;

export const ContactsView: FC = () => {
    const { 
        currentUser, 
        showModal, 
        customerDirectory,
        internalContacts,
        leadMarket, 
        setLeadMarket, 
        ukOnlyMode, 
        handleVerifyContacts,
        verifySingleContact,
        enrichMissingAddresses,
        isAiJobRunning,
        activeSearches,
        savedLeads,
        logEvent,
        deleteCustomer,
        deleteCustomers,
        processJobs,
        db,
    } = useAppStore();
    
    // State for UI control
    const [activeTab, setActiveTab] = useState<'customers' | 'internal'>('customers');
    const [modal, setModal] = useState<'customer' | 'internal' | 'importer' | null>(null);
    const [editingCustomer, setEditingCustomer] = useState<Customer | 'new' | null>(null);
    const [editingInternalContact, setEditingInternalContact] = useState<InternalContact | 'new' | null>(null);

    // State for filtering and searching
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [typeFilter, setTypeFilter] = useState('All');
    const [sourceFilter, setSourceFilter] = useState('All');
    const debouncedSearchQuery = useDebounce(searchQuery, 300);
    const [currentPage, setCurrentPage] = useState(1);
    
    // State for selection and deletion
    const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        const runMigration = async () => {
            if (!db) return;
            const migrationKey = 'hasRunDataMinerTagMigrationV1';
            if (localStorage.getItem(migrationKey) || customerDirectory.length === 0) return;
            logEvent('SYS', 'Checking for untagged Data Miner contacts...');
            const contactsToMigrate = customerDirectory.filter(c => (c.companySize || c.financeReportUrl || c.activityStatus) && c.sourceOrigin !== 'Data Miner');
            if (contactsToMigrate.length > 0) {
                logEvent('DB', `Found ${contactsToMigrate.length} contacts to migrate. Starting batch update...`);
                const confirmed = await showModal({ type: 'confirm', title: 'Database Update Required', message: `We need to update ${contactsToMigrate.length} older contacts to work with the new "Source" filter. Is it okay to proceed?` });
                if (!confirmed) { logEvent('SYS', 'User deferred the Data Miner contact migration.'); return; }
                try {
                    const batch = db.batch();
                    contactsToMigrate.forEach(contact => {
                        const docRef = db.collection('customers').doc(contact.id);
                        batch.update(docRef, { sourceOrigin: 'Data Miner' });
                    });
                    await batch.commit();
                    logEvent('DB', `Successfully tagged ${contactsToMigrate.length} contacts as sourced from Data Miner.`);
                    localStorage.setItem(migrationKey, 'true');
                } catch (error) { logEvent('ERR', `Data Miner contact migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`); }
            } else { logEvent('SYS', 'No untagged Data Miner contacts found.'); localStorage.setItem(migrationKey, 'true'); }
        };
        runMigration();
    }, [customerDirectory, logEvent, showModal, db]);

    const MARKETS: { id: LeadMarket; label: string; flag: string }[] = [ { id: 'UK', label: 'UK', flag: '🇬🇧' }, { id: 'Spain', label: 'Spain', flag: '🇪🇸' }, { id: 'France', label: 'France', flag: '🇫🇷' }, { id: 'Germany', label: 'Germany', flag: '🇩🇪' } ];

    const keyAccountCounts = useMemo(() => {
        const counts = new Map<string, number>();
        [...activeSearches, ...savedLeads].flatMap(job => job.leads).forEach(lead => {
            if (lead.companies) {
                const companiesInLead = new Set<string>();
                lead.companies.forEach(contact => { if (contact.company) companiesInLead.add(contact.company); });
                companiesInLead.forEach(companyName => counts.set(companyName, (counts.get(companyName) || 0) + 1));
            }
        });
        return counts;
    }, [activeSearches, savedLeads]);

    const uniqueTypes = useMemo(() => new Set<string>(customerDirectory.filter(c => c.market === leadMarket).map(c => c.type).filter(Boolean)), [customerDirectory, leadMarket]);
    
    const filteredCustomers = useMemo(() => {
        let filtered = customerDirectory.filter(c => c.market === leadMarket);
        if (statusFilter !== 'All') filtered = filtered.filter(c => c.status === statusFilter);
        if (sourceFilter !== 'All') filtered = filtered.filter(c => c.sourceOrigin === sourceFilter || (sourceFilter === 'Other' && c.sourceOrigin !== 'Data Miner'));
        if (typeFilter !== 'All') filtered = filtered.filter(c => c.type === typeFilter);
        if (debouncedSearchQuery.trim()) {
            const lowerQuery = debouncedSearchQuery.toLowerCase();
            filtered = filtered.filter(c => Object.values(c).some(val => String(val).toLowerCase().includes(lowerQuery)));
        }
        return [...filtered].sort((a, b) => (a.contactName || '').localeCompare(b.contactName || ''));
    }, [customerDirectory, leadMarket, statusFilter, typeFilter, sourceFilter, debouncedSearchQuery]);

    const filteredInternalContacts = useMemo(() => {
        let filtered = internalContacts;
        if (debouncedSearchQuery.trim()) {
            const lowerQuery = debouncedSearchQuery.toLowerCase();
            filtered = filtered.filter(c => Object.values(c).some(val => String(val).toLowerCase().includes(lowerQuery)));
        }
        return [...filtered].sort((a,b) => (a.name || '').localeCompare(b.name || ''));
    }, [internalContacts, debouncedSearchQuery]);

    const contactsMissingAddressCount = useMemo(() => filteredCustomers.filter(c => !c.address || (typeof c.address === 'string' && c.address.trim() === '')).length, [filteredCustomers]);
    
    const paginatedCustomers = useMemo(() => filteredCustomers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [filteredCustomers, currentPage]);
    const totalCustomerCount = filteredCustomers.length;
    const isLastPage = (currentPage * PAGE_SIZE) >= totalCustomerCount;

    useEffect(() => {
        setCurrentPage(1);
        setSelectedCustomerIds(new Set());
    }, [leadMarket, statusFilter, typeFilter, sourceFilter, debouncedSearchQuery, activeTab]);

    const handleNextPage = () => { if (!isLastPage) setCurrentPage(p => p + 1); };
    const handlePrevPage = () => { if (currentPage > 1) setCurrentPage(p => p - 1); };
    
    const handleSaveCustomer = async (newCustomerData: Omit<Customer, 'id' | 'market'>) => {
        if (!currentUser || !db) return;
        try {
            await db.collection('customers').add({ ...newCustomerData, market: leadMarket, sourceOrigin: 'Manual' as const });
            setEditingCustomer(null);
            await showModal({type: 'alert', title: 'Success', message: 'New customer added.'});
        } catch (error) { await showModal({type: 'alert', title: 'Error', message: 'Could not save new customer.'}); }
    };

    const handleDelete = async (id: string, isInternal: boolean) => {
        if (!db) return;
        if (deletingIds.has(id)) return;
        const confirmed = await showModal({type: 'confirm', title: 'Delete Contact', message: 'Are you sure?'});
        if (confirmed) {
            setDeletingIds(prev => new Set(prev).add(id));
            try {
                if (isInternal) {
                    await db.collection('contacts').doc(id).delete();
                } else {
                    await deleteCustomer(id);
                }
            } catch (error) {
                 console.error("Deletion failed in view:", error);
            } finally {
                setDeletingIds(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(id);
                    return newSet;
                });
            }
        }
    };
    
    const handlePrint = (isInternal: boolean) => {
        const contactsToPrint = isInternal ? filteredInternalContacts : filteredCustomers;
        if (contactsToPrint.length === 0) {
            showModal({ type: 'alert', title: 'No Data', message: 'There are no contacts in the current view to print.' });
            return;
        }
        const headers = isInternal ? ['Branch', 'Manager', 'Email', 'Phone', 'Town', 'Address'] : ['Name', 'Company', 'Address', 'Email', 'Phone', 'Mobile', 'Activity', 'Size', 'Status'];
        const tableHeader = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
        const tableBody = contactsToPrint.map((c: any) => `
            <tr>
                <td>${c.contactName || c.name || ''}</td>
                <td>${isInternal ? (c.managerName || '') : (c.company || '')}</td>
                ${isInternal ? `
                    <td>${c.email || ''}</td>
                    <td>${c.phone || c.mobile || c.landline || ''}</td>
                    <td>${c.town || ''}</td>
                    <td>${c.address || ''}</td>
                ` : `
                    <td>${c.address || ''}</td>
                    <td>${c.email || ''}</td>
                    <td>${c.phone || ''}</td>
                    <td>${c.mobile || ''}</td>
                    <td>${c.activityStatus || ''}</td>
                    <td>${c.companySize || ''}</td>
                    <td>${c.status || ''}</td>
                `}
            </tr>
        `).join('');
        printContent(`<table><thead>${tableHeader}</thead><tbody>${tableBody}</tbody></table>`, `${isInternal ? 'Internal' : 'Customer'} Directory`, 'A4', false, leadMarket);
    };

    const handleExportXLSX = (isInternal: boolean) => {
        const contactsToExport = isInternal ? filteredInternalContacts : filteredCustomers;
        if (contactsToExport.length === 0) {
            showModal({ type: 'alert', title: 'No Data', message: 'There are no contacts in the current view to export.' });
            return;
        }
    
        const dataToExport = contactsToExport.map((c: any) => isInternal ? {
            'Branch': c.name,
            'Manager': c.managerName || '',
            'Email': c.email,
            'Phone': c.phone || c.mobile || c.landline || '',
            'Town': c.town || '',
            'Address': c.address,
        } : {
            'Name': c.contactName,
            'Company': c.company,
            'Type': c.type,
            'Address': c.address,
            'Email': c.email,
            'Landline': c.phone,
            'Mobile': c.mobile || '',
            'Activity': c.activityStatus,
            'Size': c.companySize,
            'Status': c.status,
            'Source': c.sourceOrigin || 'Manual',
        });
    
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Contacts");
        const filename = `MontAzul_${isInternal ? 'Internal' : 'Customer'}_Contacts_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(workbook, filename);
    };

    const handleToggleSelection = (id: string) => {
        setSelectedCustomerIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };
    
    const handleToggleSelectAll = () => {
        if (selectedCustomerIds.size === paginatedCustomers.length) {
            setSelectedCustomerIds(new Set());
        } else {
            setSelectedCustomerIds(new Set(paginatedCustomers.map(c => c.id)));
        }
    };
    
    const handleBulkDelete = async () => {
        const confirmed = await showModal({ type: 'confirm', title: 'Delete Selected?', message: `Are you sure you want to delete ${selectedCustomerIds.size} contacts?` });
        if (confirmed) {
            const success = await deleteCustomers(Array.from(selectedCustomerIds));
            if (success) setSelectedCustomerIds(new Set());
        }
    };
    
    const handleBulkVerify = async () => {
        const selectedCustomers = customerDirectory.filter(c => selectedCustomerIds.has(c.id));
        await handleVerifyContacts(selectedCustomers);
        setSelectedCustomerIds(new Set());
    };

    const renderCustomers = () => {
        const hasSelection = selectedCustomerIds.size > 0;
        return (
            <>
                <div className={`p-3 rounded-lg flex flex-wrap items-center gap-4 mb-4 transition-colors duration-200 ${hasSelection ? 'bg-primary/10 border border-primary' : 'bg-surface'}`}>
                    <span className="font-semibold">{selectedCustomerIds.size} selected</span>
                    <button className="btn sm green" onClick={handleBulkVerify} disabled={!hasSelection}>Verify Selected</button>
                    <button className="btn sm red" onClick={handleBulkDelete} disabled={!hasSelection}>Delete Selected</button>
                    <button className="btn sm tertiary" onClick={() => setSelectedCustomerIds(new Set())} disabled={!hasSelection}>Clear Selection</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
                    <div className="md:col-span-2"><input type="text" placeholder="Search customers..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full" /></div>
                    <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option value="All">All Types</option>{Array.from(uniqueTypes).map(type => <option key={type} value={type}>{type}</option>)}</select>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="All">All Statuses</option><option value="Verified">Verified</option><option value="Unverified">Unverified</option><option value="Contradictory">Contradictory</option><option value="Invalid Format">Invalid Format</option><option value="Inactive">Inactive</option></select>
                    <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}><option value="All">All Sources</option><option value="Data Miner">Data Miner</option><option value="Other">Other</option></select>
                </div>
                <div className="overflow-x-auto">
                    <table>
                        <thead><tr>
                            <th className="w-8"><input type="checkbox" title="Select/deselect all on this page" checked={paginatedCustomers.length > 0 && selectedCustomerIds.size === paginatedCustomers.length} onChange={handleToggleSelectAll}/></th>
                            <th>Contact Name</th><th>Company</th><th>Type</th><th>Address</th><th>Email</th><th>Landline</th><th>Mobile</th><th>Activity</th><th>Size</th><th>Status</th><th>Actions</th>
                        </tr></thead>
                        <tbody>
                            {paginatedCustomers.map(c => {
                                const accountCount = keyAccountCounts.get(c.company);
                                const isVerifying = processJobs.some(job => job.status === 'running' && job.context?.customerId === c.id);
                                return (
                                    <ContactRow
                                        key={c.id}
                                        customer={c}
                                        isSelected={selectedCustomerIds.has(c.id)}
                                        isVerifying={isVerifying}
                                        isDeleting={deletingIds.has(c.id)}
                                        keyAccountCount={accountCount}
                                        onToggleSelection={handleToggleSelection}
                                        onEdit={() => { setEditingCustomer(c); setModal('customer'); }}
                                        onVerify={verifySingleContact}
                                        onDelete={() => handleDelete(c.id, false)}
                                        onShowKeyAccount={(companyName) => showModal({ type: 'KeyAccount', title: 'Key Account', companyName })}
                                    />
                                )
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="flex justify-between items-center mt-4">
                    <button onClick={handlePrevPage} disabled={currentPage === 1} className="btn">Previous</button>
                    <span className="text-sm text-text-secondary">Page {currentPage} of {Math.ceil(totalCustomerCount / PAGE_SIZE)}</span>
                    <button onClick={handleNextPage} disabled={isLastPage} className="btn">Next</button>
                </div>
            </>
        );
    };

    const renderInternalContacts = () => (
        <>
            <div className="mb-4">
                <input type="text" placeholder="Search internal contacts..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full max-w-sm" />
            </div>
            <div className="overflow-x-auto">
                <table>
                    <thead><tr><th>Branch</th><th>Manager</th><th>Email</th><th>Phone</th><th>Town</th><th>Address</th><th>Actions</th></tr></thead>
                    <tbody>
                        {filteredInternalContacts.map(c => (
                            <tr key={c.id}>
                                <td>{c.name}</td><td>{c.managerName || ''}</td><td>{c.email}</td><td>{c.phone || c.mobile || c.landline || ''}</td><td>{c.town || ''}</td><td>{c.address}</td>
                                <td>
                                    <div className="flex gap-2">
                                        <button className="btn sm" onClick={() => { setEditingInternalContact(c); setModal('internal'); }}>Edit</button>
                                        <button className="btn red sm" onClick={() => handleDelete(c.id, true)} disabled={deletingIds.has(c.id)}>{deletingIds.has(c.id) ? <span className="loader" /> : 'Del'}</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );

    return (
        <div className="panel">
            {modal === 'customer' && editingCustomer && <CustomerModal customer={editingCustomer} onClose={() => setModal(null)} onSaveNew={handleSaveCustomer} />}
            {modal === 'internal' && editingInternalContact && <InternalContactModal contact={editingInternalContact} onClose={() => setModal(null)} />}
            {modal === 'importer' && <InternalContactImportModal onClose={() => setModal(null)} />}

            <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
                <div className="flex items-center gap-4">
                    <h2>Contacts ({activeTab === 'customers' ? `${filteredCustomers.length} of ${customerDirectory.length}` : `${filteredInternalContacts.length}`})</h2>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button className="btn tertiary" onClick={() => handlePrint(activeTab === 'internal')}>Print</button>
                    <button className="btn tertiary" onClick={() => handleExportXLSX(activeTab === 'internal')}>Export XLSX</button>
                    {activeTab === 'customers' ? (
                        <>
                            <button className="btn" onClick={() => enrichMissingAddresses(filteredCustomers)} disabled={isAiJobRunning || contactsMissingAddressCount === 0} title="Find missing addresses for currently filtered contacts.">Find Addresses ({contactsMissingAddressCount})</button>
                            <button className="btn" onClick={() => handleVerifyContacts()} disabled={isAiJobRunning}>Verify All ({leadMarket})</button>
                            <button className="btn green" onClick={() => { setEditingCustomer('new'); setModal('customer'); }}>+ Add Customer</button>
                        </>
                    ) : (
                        <>
                            <button className="btn" onClick={() => { setEditingInternalContact('new'); setModal('internal'); }}>+ Add Manually</button>
                            <button className="btn green" onClick={() => setModal('importer')}>Import List</button>
                        </>
                    )}
                </div>
            </div>
            
            <div className="border-b border-border-color mb-6 flex">
                <button onClick={() => setActiveTab('customers')} className={`px-4 py-2 text-sm uppercase font-bold transition-colors duration-200 rounded-t-lg ${activeTab === 'customers' ? 'bg-primary text-bg-secondary' : 'text-text-secondary hover:bg-surface'}`}>Customers</button>
                <button onClick={() => setActiveTab('internal')} className={`px-4 py-2 text-sm uppercase font-bold transition-colors duration-200 rounded-t-lg ${activeTab === 'internal' ? 'bg-primary text-bg-secondary' : 'text-text-secondary hover:bg-surface'}`}>Internal Contacts (Distributors)</button>
            </div>
            
            {activeTab === 'customers' && renderCustomers()}
            {activeTab === 'internal' && renderInternalContacts()}
        </div>
    );
};