import { fetchProfessionalsData, enrichProfessionalsBatch, validateContact, fetchHousingAssociationContacts } from '@/services/ai/contactFinderService';
import type { FoundProfessional, Customer, User, LeadMarket, Lead, LeadContact } from '@/types';
import { getDb } from '@/services/firebase';
import { useAppStore } from '@/store/store';

interface MinerState {
    results: FoundProfessional[];
    isDeepSearching: boolean;
    progress: number;
    error: string | null;
    currentPassDescription: string;
}

const dataMinerService = {
    _subscribers: new Set<(state: MinerState) => void>(),
    _state: {
        results: [] as FoundProfessional[],
        isDeepSearching: false,
        progress: 0,
        error: null as string | null,
        currentPassDescription: '',
    },
    _stopSearch: false,

    subscribe(callback: (state: MinerState) => void) {
        this._subscribers.add(callback);
        callback(this._state);
        return () => this.unsubscribe(callback);
    },
    unsubscribe(callback: (state: MinerState) => void) {
        this._subscribers.delete(callback);
    },
    _notify() {
        for (const callback of this._subscribers) {
            callback(this._state);
        }
    },
    _updateState(newState: Partial<MinerState>) {
        this._state = { ...this._state, ...newState };
        this._notify();
    },

    stopSearch() {
        this._stopSearch = true;
        this._updateState({ currentPassDescription: 'Stopping search... The current page will finish, and then the scan will terminate.' });
    },

    async startSearch(
        activeTab: 'architects' | 'roofers' | 'builders' | 'planners' | 'developers' | 'housing_associations',
        searchQuery: string,
        currentUser: User,
        customerDirectory: Customer[],
        targetCount?: number | null,
        country: LeadMarket = 'UK'
    ) {
        this._stopSearch = false;
        this._updateState({ error: null, isDeepSearching: true, progress: 0, results: [], currentPassDescription: 'Starting deep scan...' });

        const { logEvent } = useAppStore.getState();
        const db = getDb();

        logEvent('SYS', 'Initializing Data Miner: Caching existing contact data for de-duplication...');
        const existingEmails = new Set(customerDirectory.map(c => c.email?.toLowerCase().trim()).filter(Boolean));
        
        let newContactsSavedThisRun = 0;

        try {
            if (activeTab === 'housing_associations') {
                this._updateState({ progress: 10, currentPassDescription: `Searching for Housing Association contacts in ${searchQuery}...` });
                logEvent('AI', `DMiner: Fetching HA contacts for "${searchQuery}"...`);

                const newProfessionals = await fetchHousingAssociationContacts(searchQuery, country);
                logEvent('AI', `DMiner: Fetched ${newProfessionals.length} potential HA contacts.`);

                this._updateState({ progress: 50, currentPassDescription: `Filtering ${newProfessionals.length} potential contacts...` });

                const uniqueNewToSave = newProfessionals.filter(prof =>
                    prof.email && !existingEmails.has(prof.email.toLowerCase().trim())
                );
                
                if (uniqueNewToSave.length > 0) {
                    const batch = db.batch();
                    logEvent('DB', `DMiner: Preparing to commit ${uniqueNewToSave.length} new HA contacts.`);
                    uniqueNewToSave.forEach(prof => {
                        const newCustomer: Omit<Customer, 'id'> = {
                            userId: currentUser.uid,
                            company: prof.companyName || '',
                            contactName: prof.name || '',
                            type: (prof as any).role || 'Housing Association',
                            email: prof.email || '',
                            phone: prof.phone || '',
                            mobile: prof.mobile || '',
                            address: prof.address || '',
                            website: prof.website || '',
                            status: 'Unverified',
                            market: country,
                            sourceUrl: prof.sourceUrl || '',
                            sourceOrigin: 'Data Miner',
                        };
                        const newDocRef = db.collection('customers').doc();
                        batch.set(newDocRef, newCustomer);
                    });
                    await batch.commit();
                    newContactsSavedThisRun = uniqueNewToSave.length;
                    logEvent('DB', `DMiner: Committed ${newContactsSavedThisRun} new HA contacts.`);
                }
                
                this._updateState({ results: newProfessionals });

            } else {
                let page = 1;
                while (!this._stopSearch) {
                    if (targetCount && newContactsSavedThisRun >= targetCount) {
                        logEvent('SYS', `Target of ${targetCount} met. Stopping scan.`);
                        break;
                    }

                    const baseProgress = targetCount ? Math.min(99, (newContactsSavedThisRun / targetCount) * 100) : (page - 1) * 10 % 100;
                    this._updateState({ currentPassDescription: `Searching page ${page}... (Total Saved This Run: ${newContactsSavedThisRun})`, progress: baseProgress });
                    
                    logEvent('AI', `DMiner Page ${page}: Fetching professionals for "${searchQuery}"...`);
                    const newProfessionals = await fetchProfessionalsData(activeTab, searchQuery, page, country);
                    logEvent('AI', `DMiner Page ${page}: Fetched ${newProfessionals.length} potential contacts.`);
                    
                    if (newProfessionals.length === 0 && page > 1) {
                        this._updateState({ currentPassDescription: 'Scan complete, no new contacts found on the last page. Stopping.' });
                        logEvent('SYS', 'DMiner: Found no new professionals. Concluding search.');
                        break;
                    }

                    const uniqueNewToSave = newProfessionals.filter(prof =>
                        prof.email && !existingEmails.has(prof.email.toLowerCase().trim())
                    );
                    
                    let savedThisBatch = 0;
                    if (uniqueNewToSave.length > 0) {
                        const batch = db.batch();
                        uniqueNewToSave.forEach(prof => {
                            const typeMap = { architects: 'Architect', roofers: 'Roofer', builders: 'Builder', planners: 'Planner', developers: 'Developer' };
                            const newCustomer: Omit<Customer, 'id'> = {
                                userId: currentUser.uid,
                                company: prof.companyName || prof.authority || '',
                                contactName: prof.name || '',
                                type: typeMap[activeTab] || 'Unknown',
                                email: prof.email || '',
                                phone: prof.phone || '',
                                mobile: prof.mobile || '',
                                address: prof.address || '',
                                website: prof.website || '',
                                status: 'Unverified',
                                market: country,
                                sourceUrl: prof.sourceUrl || '',
                                sourceOrigin: 'Data Miner',
                            };
                            const newDocRef = db.collection('customers').doc();
                            batch.set(newDocRef, newCustomer);
                            if(prof.email) existingEmails.add(prof.email.toLowerCase().trim());
                        });
                        await batch.commit();
                        savedThisBatch = uniqueNewToSave.length;
                    }

                    newContactsSavedThisRun += savedThisBatch;
                    this._updateState({ 
                        results: [...this._state.results, ...newProfessionals],
                        progress: Math.min(99, baseProgress + 10),
                        currentPassDescription: `Page ${page}: Found ${newProfessionals.length}, Saved ${savedThisBatch} new.`
                    });
                    page++;
                }
            }
        } catch (err: any) {
            logEvent('ERR', `Data Miner failed: ${err.message}`);
            this._updateState({ error: err.message });
            this._stopSearch = true;
        }
        
        let finalDescription = '';
        if (this._state.error) {
            finalDescription = `Scan stopped due to an error: ${this._state.error}`;
        } else if (this._stopSearch) {
            finalDescription = 'Search terminated by user.';
        } else if (targetCount && newContactsSavedThisRun >= targetCount) {
            finalDescription = `Target of ${targetCount} met. Saved ${newContactsSavedThisRun}.`;
        } else {
            finalDescription = `Scan complete. Saved ${newContactsSavedThisRun} new contacts.`;
        }
        
        this._updateState({ isDeepSearching: false, currentPassDescription: finalDescription, progress: 100 });
        logEvent('SYS', `Data Miner finished. ${finalDescription}`);
    }
};

export { dataMinerService };
export type { MinerState };