import React, { FC, useState, useEffect } from 'react';
import type { User, ViewName, DiscoverySource } from '../../types';
import { useAppStore } from '../../store/store';
import { APP_VIEWS } from '../../constants';
import { getDb } from '../../services/firebase';

const AdminView: FC = () => {
    const { 
        currentUser,
        allUsers, 
        showModal, 
        logEvent, 
        ukOnlyMode, 
        toggleUkOnlyMode, 
        purgeSimulatedData, 
        deleteAllLeadData,
        fetchSettings,
        emailProvider,
        mailRelayHostname,
        mailRelayApiKey,
        reclassifyDataMinerContacts,
        permanentlyDeleteSoftDeletedCustomers,
        runDataHygieneV52,
        discoverySources,
        addDiscoverySource,
        deleteDiscoverySource,
        runDiscoveryScrape,
        leadMarket,
        bypassWord: savedBypassWord,
     } = useAppStore();
     
    const [loading, setLoading] = useState<Record<string, boolean>>({});
    const [bypassWord, setBypassWord] = useState('');

    // MailRelay State
    const [mrHostname, setMrHostname] = useState('');
    const [mrApiKey, setMrApiKey] = useState('');

    // Provider selection
    const [emailProviderOption, setEmailProviderOption] = useState<'clicksend' | 'mailrelay'>('mailrelay');

    const [isSaving, setIsSaving] = useState(false);

    // Discovery Source State
    const [newSourceRegion, setNewSourceRegion] = useState('');
    const [newSourceUrl, setNewSourceUrl] = useState('');


    useEffect(() => {
        if (emailProvider) {
            setEmailProviderOption(emailProvider);
        }
        if (mailRelayHostname) {
            setMrHostname(mailRelayHostname);
        }
        if (mailRelayApiKey) {
            setMrApiKey(mailRelayApiKey);
        }
        if (savedBypassWord) {
            setBypassWord(savedBypassWord);
        }
    }, [emailProvider, mailRelayHostname, mailRelayApiKey, savedBypassWord]);

    useEffect(() => {
        if (currentUser?.isAdmin && allUsers.length === 0) {
            let db;
            try { db = getDb(); } catch(e) { return; }
            db.collection('users').get().then(snapshot => {
                const users = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as User));
                useAppStore.setState({ allUsers: users });
            }).catch(e => console.error("Failed to fetch users", e));
        }
    }, [currentUser?.isAdmin, allUsers.length]);


    const handleUpdateUser = async (uid: string, updates: Partial<User>) => {
        let db;
        try { db = getDb(); } catch(e) { 
            await showModal({ type: 'alert', title: 'Error', message: 'Database is not connected.' });
            return;
        }
        setLoading(prev => ({ ...prev, [uid]: true }));
        logEvent('DB', `Attempting to update user ${uid} with: ${JSON.stringify(updates)}`);
        try {
            await db.collection('users').doc(uid).update(updates);
            useAppStore.setState(state => ({
                allUsers: state.allUsers.map(u => u.uid === uid ? { ...u, ...updates } : u)
            }));
            logEvent('DB', `Updated user ${uid} with: ${JSON.stringify(updates)}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logEvent('ERR', `Failed to update user ${uid}: ${errorMessage}`);
            await showModal({ type: 'alert', title: 'Error', message: `Failed to update user: ${errorMessage}` });
        } finally {
            setLoading(prev => ({ ...prev, [uid]: false }));
        }
    };
    
    const handlePurge = async () => {
        const confirmed = await showModal({
            type: 'confirm',
            title: 'Confirm Data Purge',
            message: 'This will scan all leads and contacts for the word "simulated" and permanently delete them. This action cannot be undone. Are you sure?'
        });
        if (confirmed) {
            purgeSimulatedData();
        }
    };

    const handleDeleteAllLeads = async () => {
        const confirmed = await showModal({
            type: 'confirm',
            title: 'DANGER: Confirm Deletion',
            message: 'You are about to permanently delete ALL lead data, including active searches and saved history. This action is irreversible. Are you sure you want to proceed?'
        });
        if (confirmed) {
            deleteAllLeadData();
        }
    };
    
    const handleSaveSettings = async () => {
        let db;
        try { db = getDb(); } catch(e) { return; }
        if (!currentUser || !db) return;
        setIsSaving(true);
        logEvent('SYS', 'Attempting to save and verify integration settings...');
        
        const settingsToSave = {
            emailProvider: emailProviderOption,
            mailRelayHostname: mrHostname,
            mailRelayApiKey: mrApiKey,
        };
    
        try {
            await db.collection('settings').doc(currentUser.uid).set(settingsToSave, { merge: true });
            logEvent('DB', 'Saved integration settings.');
            await fetchSettings();
            
            await showModal({ type: 'alert', title: 'Success', message: 'Settings saved successfully!' });
    
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
            logEvent('ERR', `Failed to save or verify settings: ${errorMessage}`);
            await showModal({ type: 'alert', title: 'Error', message: `Failed to save settings. Please check credentials and proxy configuration. Error: ${errorMessage}` });
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveBypassWord = async () => {
        let db;
        try { db = getDb(); } catch(e) { return; }
        if (!db) return;
        const confirmed = await showModal({ type: 'confirm', title: 'Set Bypass Word?', message: 'Setting or changing this word allows emergency access if authentication fails. This should be treated like a master password. Continue?' });
        if (confirmed) {
            setIsSaving(true);
            logEvent('SYS', 'Attempting to save emergency bypass word.');
            try {
                await db.collection('settings').doc('global').set({ bypassWord }, { merge: true });
                logEvent('SYS', 'Emergency bypass word has been updated.');
                await fetchSettings(); // refetch to update state
                await showModal({ type: 'alert', title: 'Success', message: 'Emergency bypass word has been saved.' });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logEvent('ERR', `Failed to save bypass word: ${errorMessage}`);
                await showModal({ type: 'alert', title: 'Error', message: `Could not save bypass word: ${errorMessage}` });
            } finally {
                setIsSaving(false);
            }
        }
    };

    const handleAddSource = async () => {
        if (!newSourceRegion.trim() || !newSourceUrl.trim()) {
            await showModal({ type: 'alert', title: 'Input Required', message: 'Both Region and URL are required.' });
            return;
        }
        await addDiscoverySource(newSourceRegion, newSourceUrl);
        setNewSourceRegion('');
        setNewSourceUrl('');
    };

    const availableViews = Object.entries(APP_VIEWS)
        .map(([key, view]) => ({ id: key as ViewName, title: view.title }))
        .sort((a, b) => a.title.localeCompare(b.title));

    return (
        <div className="space-y-8">
            <div>
                <h2 className="mb-6">User Management</h2>
                <div className="overflow-x-auto">
                    {/* User table remains the same */}
                    <table>
                        <thead>
                            <tr>
                                <th>User</th><th>Status</th><th>Role</th><th>Allowed Views</th><th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allUsers.map((user, index) => (
                                <tr key={user.uid || `user-${index}`}>
                                    <td><p className="font-semibold">{user.displayName}</p><p className="text-sm text-text-secondary">{user.email}</p></td>
                                    <td>
                                        <select value={user.status} onChange={(e) => handleUpdateUser(user.uid, { status: e.target.value as User['status'] })} disabled={loading[user.uid]}>
                                            <option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
                                        </select>
                                    </td>
                                    <td>
                                        <select value={user.isAdmin ? 'admin' : 'user'} onChange={(e) => handleUpdateUser(user.uid, { isAdmin: e.target.value === 'admin' })} disabled={loading[user.uid]}>
                                            <option value="user">User</option><option value="admin">Admin</option>
                                        </select>
                                    </td>
                                    <td>
                                        {user.isAdmin ? <span className="text-sm text-secondary italic">All Views (Admin)</span> : (
                                            <div className="flex flex-col gap-1">
                                                {availableViews.map(view => (
                                                    <label key={view.id} className="flex items-center gap-2 text-sm">
                                                        <input type="checkbox" className="!w-auto" checked={user.allowedViews?.includes(view.id)} onChange={(e) => {
                                                            const newViews = e.target.checked ? [...(user.allowedViews || []), view.id] : (user.allowedViews || []).filter(v => v !== view.id);
                                                            handleUpdateUser(user.uid, { allowedViews: newViews });
                                                        }} disabled={loading[user.uid]} />
                                                        {view.title}
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td>{loading[user.uid] && <span className="loader" />}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div className="panel">
                <h2 className="mb-4">Integrations</h2>
                
                {/* Email Provider Selection */}
                <div className="mb-6">
                    <h3 className="mb-2">Email Provider</h3>
                    <div className="flex gap-4 p-2 bg-surface rounded-lg">
                        <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="emailProvider" value="mailrelay" checked={emailProviderOption === 'mailrelay'} onChange={() => setEmailProviderOption('mailrelay')} /> MailRelay</label>
                    </div>
                </div>

                {/* MailRelay Configuration */}
                <div className={`panel mb-6 ${emailProviderOption !== 'mailrelay' ? 'opacity-50' : ''}`}>
                    <h3 className="mb-4">MailRelay Configuration</h3>
                    <div className="space-y-4">
                        <div className="form-group"><label>MailRelay Hostname</label><input type="text" placeholder="e.g., your_account.ipzmarketing.com" value={mrHostname} onChange={e => setMrHostname(e.target.value)} disabled={emailProviderOption !== 'mailrelay'} /></div>
                        <div className="form-group"><label>MailRelay API Key</label><input type="password" placeholder="Your MailRelay API key" value={mrApiKey} onChange={e => setMrApiKey(e.target.value)} disabled={emailProviderOption !== 'mailrelay'} /></div>
                    </div>
                </div>
                
                <button onClick={handleSaveSettings} className="btn w-full mt-2" disabled={isSaving}>{isSaving ? <span className="loader"/> : 'Save & Verify Settings'}</button>
            </div>

            {/* Other sections remain the same */}
            <div className="space-y-8">
                 <div className="panel">
                    <h3 className="mb-2">Discovery Sources (Weekly Lists)</h3>
                    <p className="text-sm text-text-secondary my-2">Configure the target URLs for the low-cost "Discovery" scraper. These should point to the weekly/monthly planning application list pages for each authority.</p>
                    <div className="space-y-2">
                        {discoverySources.map((source, index) => (
                            <div key={source.id || `source-${index}`} className="flex items-center justify-between p-2 bg-surface rounded">
                                <div>
                                    <p className="font-semibold">{source.region}</p>
                                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary truncate hover:underline">{source.url}</a>
                                </div>
                                <button onClick={() => deleteDiscoverySource(source.id)} className="btn red sm">Delete</button>
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-2 mt-4 pt-4 border-t border-border-color">
                        <input type="text" placeholder="Region Name (e.g., Plymouth)" value={newSourceRegion} onChange={e => setNewSourceRegion(e.target.value)} className="flex-grow"/>
                        <input type="url" placeholder="Weekly List URL" value={newSourceUrl} onChange={e => setNewSourceUrl(e.target.value)} className="flex-grow"/>
                        <button onClick={handleAddSource} className="btn">Add Source</button>
                    </div>
                     <button onClick={runDiscoveryScrape} className="btn green w-full mt-4">Run Weekly Discovery Scrape for {leadMarket}</button>
                </div>
                <div className="panel"><h3 className="mb-2">Regional Settings</h3><div className="p-4 bg-surface rounded-lg"><h4 className="font-semibold">UK Only Mode</h4><p className="text-sm text-text-secondary my-2">If enabled, the app will hide all non-UK markets (Spain, France, Germany) from the Lead Intelligence and Contacts views.</p><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="!w-auto" style={{ transform: 'scale(1.2)'}} checked={ukOnlyMode} onChange={toggleUkOnlyMode} /><span>Enable UK Only Mode</span></label></div></div>
                <div className="panel">
                    <h3 className="mb-2">Data Integrity</h3>
                    <div className="p-4 bg-surface rounded-lg mb-4">
                        <h4 className="font-semibold">V52 Data Hygiene & Re-Scoring</h4>
                        <p className="text-sm text-text-secondary my-2">Run the "V52 Lead Discovery & Qualification Agent" across your entire database. This will re-score all existing leads and archive any that have a LeadFitScore below 40 and are older than 6 months, clearing out "zombie leads".</p>
                        <button onClick={runDataHygieneV52} className="btn secondary">Run V52 Data Hygiene</button>
                    </div>
                    <div className="p-4 bg-surface rounded-lg mb-4">
                        <h4 className="font-semibold">Purge Simulated Data</h4>
                        <p className="text-sm text-text-secondary my-2">Scan the entire database for contacts or lead data containing the word "simulated" and permanently delete them. This is useful for cleaning up any placeholder data generated by the AI. This action cannot be undone.</p>
                        <button onClick={handlePurge} className="btn secondary">Find & Purge Simulated Data</button>
                    </div>
                    <div className="p-4 bg-surface rounded-lg">
                        <h4 className="font-semibold">Re-classify Data Miner Contacts</h4>
                        <p className="text-sm text-text-secondary my-2">This tool will use AI to analyze all contacts sourced from the Data Miner and attempt to correct their professional "Type" (e.g., Architect, Builder). This is useful for fixing historical data inaccuracies.</p>
                        <button onClick={reclassifyDataMinerContacts} className="btn secondary">Re-classify Data Miner Contacts</button>
                    </div>
                </div>
                <div className="panel border-loss-color">
                    <h3 className="text-loss-color mb-2">Danger Zone</h3>
                    <div className="p-4 bg-loss-bg rounded-lg mb-4">
                        <h4 className="font-semibold text-loss-color">Emergency Bypass Word</h4>
                        <p className="text-sm text-text-secondary my-2">Set a word to allow access to the app if Firebase authentication is down. This is stored locally on users' devices after they log in once. Treat this with high security.</p>
                        <div className="flex gap-2">
                            <input type="text" placeholder="Enter bypass word..." value={bypassWord} onChange={e => setBypassWord(e.target.value)} />
                            <button onClick={handleSaveBypassWord} className="btn" disabled={isSaving}>Save Word</button>
                        </div>
                    </div>
                    <div className="p-4 bg-loss-bg rounded-lg mb-4">
                        <h4 className="font-semibold text-loss-color">Delete All Lead Data</h4>
                        <p className="text-sm text-text-secondary my-2">This will permanently delete all jobs and leads from both "Active Searches" and "Saved Searches". This is useful if you are experiencing persistent errors and want to start your lead generation from scratch. This action is irreversible.</p>
                        <button onClick={handleDeleteAllLeads} className="btn red">Delete All Leads</button>
                    </div>
                     <div className="p-4 bg-loss-bg rounded-lg">
                        <h4 className="font-semibold text-loss-color">Permanently Delete Soft-Deleted Contacts</h4>
                        <p className="text-sm text-text-secondary my-2">This will find all contacts that have been previously "deleted" via the Contacts view and permanently remove them from the database. This action is irreversible and is useful for purging bad data.</p>
                        <button onClick={permanentlyDeleteSoftDeletedCustomers} className="btn red">Purge Deleted Contacts</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminView;