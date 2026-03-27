
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  User, Note, ModalState, StatusJob, ViewName, Product, Accessory,
  Customer, Project, Lead, SearchJob, LeadMarket, InternalContact, Campaign, CampaignContact, TenderAnalysisResult, LeadContact, ClickSendConfig, ClickSendBalance, LeadSearchCategory, PlanReaderResult, SalesStage, ClosedLoopFeedback, SentItem, CountryCode, PlanningDocument, DiscoverySource, UserAction, SupervisorReport
} from '@/types';
import firebase from 'firebase/compat/app';
import { getDb, getAuth, getStorage } from '@/services/firebase';
import { createContactList, addContactsToList, sendSmsCampaign, getAccountBalance } from '@/services/clicksendService';
import { getEmailProvider } from '@/services/email/EmailProviderFactory';
import { parseAutomationCommand } from '@/services/ai/automationService';
import { dataMinerService } from '@/utils/dataMinerService';
import { printContent } from '@/utils/print';
import { analyzeRoofPlan } from '@/services/ai/planReaderService';
import { createAuthSlice, AuthSlice } from './slices/authSlice';
import { createLeadSlice, LeadSlice } from './slices/leadSlice';
import { createSupervisorSlice, SupervisorSlice } from './slices/supervisorSlice';
import { enrichAndVerifyContactsBatch, reclassifyContactTypeBatch, findAddressesForContactsBatch, enrichAndVerifyContact } from '@/services/ai/contactFinderService';

/**
 * Utility to clean AI response objects before merging.
 * Removes properties that are null, undefined, empty strings, or placeholders like "N/A".
 */
const cleanAiResult = <T extends object>(result: T): Partial<T> => {
    const cleaned: any = {};
    const junkValues = [null, undefined, "", "N/A", "unknown", "None", "not available"];
    
    Object.entries(result).forEach(([key, value]) => {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!junkValues.includes(trimmed)) {
                cleaned[key] = trimmed;
            }
        } else if (value !== null && value !== undefined) {
            cleaned[key] = value;
        }
    });
    return cleaned;
};

export interface AppState extends AuthSlice, LeadSlice, SupervisorSlice {
    // UI State
    activeView: ViewName;
    activeModel: string;
    isMonitorOpen: boolean;
    isProcessMonitorOpen: boolean;
    theme: 'light' | 'dark';
    modal: (ModalState & { onResolve: (value: any) => void }) | null;
    ukOnlyMode: boolean; // Simplified setting for market
    viewProps: any;
    tenderAnalysisState: {
        analysisState: 'idle' | 'running' | 'complete' | 'error';
        analysisResultData: TenderAnalysisResult | null;
        uploadedFiles: File[];
        error: string;
    };
    planReaderState: {
        analysisState: 'idle' | 'running' | 'complete' | 'error';
        analysisResultData: PlanReaderResult | null;
        uploadedFiles: File[];
        error: string;
    };
    sendToPartnerLead: Lead | null;
    
    // Data State
    dashboardNotes: Note[];
    productData: Product[];
    accessoryData: Accessory[];
    customerDirectory: Customer[];
    projectPipeline: Project[];
    internalContacts: InternalContact[];
    campaignContacts: CampaignContact[];
    campaigns: Campaign[];
    sentItems: SentItem[];
    discoverySources: DiscoverySource[];

    // System State
    logs: { id: number; timestamp: Date; type: 'AI' | 'DB' | 'SYS' | 'ERR'; message: string }[];
    apiCallCount: number;
    processJobs: StatusJob[];
    isAiJobRunning: boolean;
    leadMarket: LeadMarket;
    clicksendConfig: ClickSendConfig | null;
    clicksendBalance: ClickSendBalance | null;
    emailProvider: 'clicksend' | 'mailrelay' | null;
    mailRelayHostname: string | null;
    mailRelayApiKey: string | null;
    bypassWord: string | null;
    
    // Actions
    handleNavigationRequest: (view: ViewName, props?: any) => void;
    toggleTheme: () => void;
    toggleUkOnlyMode: () => void;
    setActiveModel: (model: string) => void;
    
    // Logging and Monitoring
    logEvent: (type: 'AI' | 'DB' | 'SYS' | 'ERR', message: string) => void;
    printLogs: () => void;
    toggleMonitor: () => void;
    toggleProcessMonitor: () => void;
    incrementApiCallCount: () => void;
    
    // Jobs
    addProcessJob: (job: Omit<StatusJob, 'id'>) => string;
    updateProcessJob: (id: string, updates: Partial<StatusJob>) => void;
    removeProcessJob: (id: string) => void;
    clearCompletedJobs: () => void;
    processAiJob: <T>(jobLogic: (updateStatus: (updates: Partial<StatusJob>) => void, signal: AbortSignal) => Promise<T>, jobName: string, context?: StatusJob['context']) => Promise<T | undefined>;
    abortJob: (jobId: string) => void;
    
    // Modals & Chat
    showModal: (config: Omit<ModalState, 'onResolve'>) => Promise<any>;
    closeModal: (value?: any) => void;
    openSendToPartnerModal: (lead: Lead) => void;
    closeSendToPartnerModal: () => void;

    // Data Actions
    setLeadMarket: (market: LeadMarket) => void;
    verifySingleContact: (customerId: string) => Promise<void>;
    handleMergeDuplicates: () => Promise<void>;
    handleVerifyContacts: (contactsToVerify?: Customer[]) => Promise<void>;
    enrichMissingAddresses: (contactsToEnrich?: Customer[]) => Promise<void>;
    identifyContactTypes: () => Promise<void>;
    reclassifyDataMinerContacts: () => Promise<void>;
    purgeSimulatedData: () => Promise<void>;
    deleteAllLeadData: () => Promise<void>;
    permanentlyDeleteSoftDeletedCustomers: () => Promise<void>;
    deleteCustomer: (id: string) => Promise<boolean>;
    deleteCustomers: (ids: string[]) => Promise<boolean>;
    uploadPlanForLead: (leadId: string, file: File) => Promise<void>;
    uploadVerificationSnapshot: (leadId: string, file: File) => Promise<void>;
    captureAndStoreLeadEvidence: (leadId: string) => Promise<void>;
    addDiscoverySource: (region: string, url: string) => Promise<void>;
    deleteDiscoverySource: (id: string) => Promise<void>;

    // Campaign Actions
    uploadCampaignContacts: (file: File) => Promise<void>;
    createCampaign: (name: string, goal: string, contactIds: string[]) => Promise<void>;
    addManualCampaignContact: (contact: Omit<CampaignContact, 'id'>) => void;
    addDirectoryCampaignContacts: (customerIds: string[]) => void;
    addClickSendListContacts: (contacts: any[]) => void;
    clearCampaignAudience: () => void;
    approveAndSendCampaign: (campaign: Campaign) => Promise<void>;

    // Tender/Plan Actions
    setTenderAnalysisState: (state: Partial<AppState['tenderAnalysisState']>) => void;
    setPlanReaderState: (state: Partial<AppState['planReaderState']>) => void;
    startPlanReaderAnalysis: (scale: string, pitch: string, slateSize: string, country: CountryCode) => Promise<void>;

    // Automation
    handleAutomationRequest: (command: string) => void;

    // Integrations
    fetchSettings: () => Promise<void>;
    setClickSendBalance: (balance: ClickSendBalance | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
    ...createAuthSlice(set, get),
    ...createLeadSlice(set, get),
    ...createSupervisorSlice(set, get),
    // =======================================================================
    // I. UI STATE
    // =======================================================================
    activeView: 'dashboard',
    activeModel: 'gemini-3.1-pro-preview', // Updated default model
    isMonitorOpen: false,
    isProcessMonitorOpen: false,
    theme: 'dark', // Persist will handle initial value from localStorage
    modal: null,
    ukOnlyMode: false,
    viewProps: {},
    tenderAnalysisState: { analysisState: 'idle', analysisResultData: null, uploadedFiles: [], error: '' },
    planReaderState: { analysisState: 'idle', analysisResultData: null, uploadedFiles: [], error: '' },
    sendToPartnerLead: null,

    // =======================================================================
    // II. DATA STATE (Non-Auth, Non-Lead)
    // =======================================================================
    dashboardNotes: [],
    productData: [],
    accessoryData: [],
    customerDirectory: [],
    projectPipeline: [],
    internalContacts: [],
    campaignContacts: [],
    campaigns: [],
    sentItems: [],
    discoverySources: [],

    // =======================================================================
    // III. SYSTEM STATE
    // =======================================================================
    logs: [],
    apiCallCount: 0,
    processJobs: [],
    isAiJobRunning: false,
    leadMarket: 'UK',
    clicksendConfig: null,
    clicksendBalance: null,
    emailProvider: null,
    mailRelayHostname: null,
    mailRelayApiKey: null,
    bypassWord: null,

    // =======================================================================
    // IV. CORE ACTIONS
    // =======================================================================
    handleNavigationRequest: (view, props = {}) => {
        // Telemetry Hook for Navigation
        get().logUserAction('NAVIGATION', { view });
        set({ activeView: view, viewProps: props });
    },
    toggleTheme: () => set(state => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
    toggleUkOnlyMode: () => set(state => ({ ukOnlyMode: !state.ukOnlyMode })),
    setActiveModel: (model) => set({ activeModel: model }),

    // =======================================================================
    // V. LOGGING & MONITORING
    // =======================================================================
    logEvent: (type, message) => {
        console.log(`[${type}] ${message}`);
        set(state => ({
            logs: [...state.logs, { id: Date.now(), timestamp: new Date(), type, message }]
        }));
    },
    printLogs: () => {
        const { logs, leadMarket } = get();
        if (logs.length === 0) {
            get().showModal({ type: 'alert', title: 'No Logs', message: 'There are no log entries to print.' });
            return;
        }
        const logHtml = `
            <table style="width: 100%; border-collapse: collapse; font-size: 9pt;">
                <thead><tr style="background-color: #f2f2f2;"><th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Time</th><th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Type</th><th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Message</th></tr></thead>
                <tbody>${logs.map(log => `<tr><td style="padding: 8px; border: 1px solid #ddd; vertical-align: top; white-space: nowrap;">${log.timestamp.toLocaleTimeString()}</td><td style="padding: 8px; border: 1px solid #ddd; vertical-align: top;">${log.type}</td><td style="padding: 8px; border: 1px solid #ddd; word-break: break-all;">${log.message}</td></tr>`).join('')}</tbody>
            </table>`;
        printContent(logHtml, 'System Monitor Logs', 'A4', false, leadMarket);
    },
    toggleMonitor: () => set(state => ({ isMonitorOpen: !state.isMonitorOpen })),
    toggleProcessMonitor: () => set(state => ({ isProcessMonitorOpen: !state.isProcessMonitorOpen })),
    incrementApiCallCount: () => set(state => ({ apiCallCount: state.apiCallCount + 1 })),
    
    // =======================================================================
    // VI. PROCESS & JOB MANAGEMENT
    // =======================================================================
    addProcessJob: (job) => {
        const id = `job_${Date.now()}`;
        const newJob = { ...job, id };
        set(state => ({ 
            processJobs: [...state.processJobs, newJob],
            isAiJobRunning: true // Any running job makes this true
        }));
        return id;
    },
    updateProcessJob: (id, updates) => {
        set(state => {
            const updatedJobs = state.processJobs.map(j => {
                if (j.id === id) {
                    const newContext = updates.context ? { ...j.context, ...updates.context } : j.context;
                    return { ...j, ...updates, context: newContext };
                }
                return j;
            });
            const stillRunning = updatedJobs.some(j => j.status === 'running');
            return {
                processJobs: updatedJobs,
                isAiJobRunning: stillRunning
            };
        });
    },
    removeProcessJob: (id) => set(state => {
        const updatedJobs = state.processJobs.filter(j => j.id !== id);
        const stillRunning = updatedJobs.some(j => j.status === 'running');
        return {
            processJobs: updatedJobs,
            isAiJobRunning: stillRunning
        };
    }),
    clearCompletedJobs: () => set(state => ({ 
        processJobs: state.processJobs.filter(j => j.status === 'running')
    })),
    processAiJob: async (jobLogic, jobName, context) => {
        const abortController = new AbortController();
        const jobId = get().addProcessJob({ name: jobName, status: 'running', progress: 0, description: 'Starting...', abortController, context: context });
        get().logEvent('SYS', `Starting job: ${jobName}`);
        get().logUserAction('FEATURE_USE', { jobName, context }); // Telemetry
        
        const updateStatus = (updates: Partial<StatusJob>) => get().updateProcessJob(jobId, updates);

        try {
            const result = await jobLogic(updateStatus, abortController.signal);
            updateStatus({ status: 'complete', progress: 100, description: 'Completed successfully.' });
            get().logEvent('SYS', `Job "${jobName}" completed successfully.`);
            return result;
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (error.name === 'AbortError') {
                updateStatus({ status: 'error', progress: 0, description: 'Job was cancelled by the user.' });
                get().logEvent('SYS', `Job "${jobName}" was aborted.`);
            } else {
                updateStatus({ status: 'error', progress: 0, description: `Error: ${errorMessage}` });
                get().logEvent('ERR', `Job "${jobName}" failed: ${errorMessage}`);
            }
        }
    },
    abortJob: (jobId: string) => {
        const job = get().processJobs.find(j => j.id === jobId || j.name.includes(jobId)); // find by name too
        if (job?.abortController) {
            job.abortController.abort();
            get().updateProcessJob(job.id, { status: 'error', description: 'Aborting...' });
        }
    },

    // =======================================================================
    // VII. MODALS & CHAT
    // =======================================================================
    showModal: (config) => {
        return new Promise((resolve) => {
            set({ modal: { ...config, onResolve: resolve } });
        });
    },
    closeModal: (value) => {
        get().modal?.onResolve(value);
        set({ modal: null });
    },
    openSendToPartnerModal: (lead) => set({ sendToPartnerLead: lead }),
    closeSendToPartnerModal: () => set({ sendToPartnerLead: null }),

    // =======================================================================
    // VIII. OTHER DATA ACTIONS
    // =======================================================================
    setLeadMarket: (market) => set({ leadMarket: market }),
    addDiscoverySource: async (region, url) => {
        const { leadMarket, currentUser, logEvent, showModal } = get();
        if (!currentUser) return;
        const db = getDb();
        try {
            const newSource: Omit<DiscoverySource, 'id'> = { region, url, market: leadMarket };
            await db.collection('discoverySources').add(newSource);
            logEvent('DB', `Added new discovery source for ${region}.`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logEvent('ERR', `Failed to add discovery source: ${message}`);
            await showModal({ type: 'alert', title: 'Error', message: `Could not add source: ${message}` });
        }
    },
    deleteDiscoverySource: async (id) => {
        const { logEvent, showModal } = get();
        const db = getDb();
        try {
            await db.collection('discoverySources').doc(id).delete();
            logEvent('DB', `Deleted discovery source ${id}.`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logEvent('ERR', `Failed to delete discovery source: ${message}`);
            await showModal({ type: 'alert', title: 'Error', message: `Could not delete source: ${message}` });
        }
    },
    verifySingleContact: async (customerId) => {
        const { customerDirectory, logEvent, processAiJob } = get();
        const db = getDb();
        const customer = customerDirectory.find(c => c.id === customerId);
        if (!customer) {
            logEvent('ERR', `verifySingleContact failed: Customer with ID ${customerId} not found.`);
            return;
        }

        await processAiJob(async () => {
            const rawResult = await enrichAndVerifyContact(customer, logEvent);
            const cleanedResult = cleanAiResult(rawResult);
            
            if (Object.keys(cleanedResult).length > 0) {
                await db.collection('customers').doc(customerId).update(cleanedResult);
                logEvent('DB', `Verified contact ${customer.contactName} (${customerId}). New status: ${cleanedResult.status}`);
                // Manually update local state to reflect DB change
                set(state => ({
                    customerDirectory: state.customerDirectory.map(c => 
                        c.id === customerId ? { ...c, ...cleanedResult } : c
                    )
                }));
            } else {
                logEvent('SYS', `Verification for ${customer.contactName} yielded no changes.`);
            }
        }, `Verifying: ${customer.contactName}`, { customerId });
    },
    handleMergeDuplicates: async () => {},
    handleVerifyContacts: async (contactsToVerify) => {
        const { showModal, processAiJob, logEvent, customerDirectory, leadMarket } = get();
        const db = getDb();
        const sourceContacts = contactsToVerify || customerDirectory.filter(c => c.market === leadMarket && c.status !== 'Verified' && c.status !== 'Inactive');
        const unverified = sourceContacts.filter(c => c.status !== 'Verified' && c.status !== 'Inactive');
        
        if(unverified.length === 0) {
            showModal({type: 'alert', title: 'No Action Needed', message: 'There are no unverified contacts in the current selection to verify.'});
            return;
        }

        const scope = contactsToVerify ? `${unverified.length} selected` : `${unverified.length} in ${leadMarket}`;
        const confirmed = await showModal({
            type: 'confirm',
            title: 'Verify Contacts',
            message: `This will use AI to verify ${scope} contacts. This may consume a significant amount of API credits. Continue?`
        });
        if(!confirmed) return;
        
        processAiJob(async (updateStatus, signal) => {
            const batchSize = 10;
            const statusCounts: Record<string, number> = { Verified: 0, Inactive: 0, Contradictory: 0, Unverified: 0 };
            const allResults: (Partial<Customer> & { id: string })[] = [];

            for (let i = 0; i < unverified.length; i += batchSize) {
                if (signal.aborted) throw new Error("Aborted");
                const batch = unverified.slice(i, i + batchSize);
                updateStatus({ progress: (i / unverified.length) * 100, description: `Verifying contacts ${i+1}-${i+batch.length} of ${unverified.length}` });

                try {
                    const rawResults = await enrichAndVerifyContactsBatch(batch);
                    
                    // FIX: Typed cleanAiResult to Customer and cast the final result to fix 'status' missing errors.
                    const cleanedBatchResults = rawResults.map(res => ({
                        ...cleanAiResult<Customer>(res),
                        id: res.id // Preserve ID
                    }) as (Partial<Customer> & { id: string }));

                    allResults.push(...cleanedBatchResults);
                    const firestoreBatch = db.batch();
                    cleanedBatchResults.forEach(result => {
                        if (result.id) {
                            const docRef = db.collection('customers').doc(result.id);
                            firestoreBatch.update(docRef, result);
                            if (result.status && statusCounts.hasOwnProperty(result.status)) {
                                statusCounts[result.status]++;
                            }
                        }
                    });
                    await firestoreBatch.commit();
                } catch (batchError) {
                    logEvent('ERR', `Contact verification batch failed: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`);
                }
            }
            
            const totalProcessed = Object.values(statusCounts).reduce((a, b) => a + b, 0);
            let summaryMessage = `Verification process complete. ${totalProcessed} of ${unverified.length} contacts were processed by the AI.<br/><br/>`;
            summaryMessage += `&bull; <strong>${statusCounts.Verified}</strong> contacts successfully verified.<br/>`;
            summaryMessage += `&bull; <strong>${statusCounts.Inactive}</strong> contacts marked as inactive.<br/>`;
            summaryMessage += `&bull; <strong>${statusCounts.Contradictory}</strong> contacts found with contradictory info.<br/>`;
            summaryMessage += `&bull; <strong>${statusCounts.Unverified}</strong> contacts could not be verified and remain unchanged.`;
            
            // Manually update local state to reflect DB changes
            if (allResults.length > 0) {
                const updatesMap = new Map(allResults.map(res => [res.id, res]));
                set(state => ({
                    customerDirectory: state.customerDirectory.map(customer => {
                        if (updatesMap.has(customer.id)) {
                            return { ...customer, ...updatesMap.get(customer.id) };
                        }
                        return customer;
                    })
                }));
                logEvent('SYS', `Updated ${allResults.length} contacts in local state after bulk verification.`);
            }

            await showModal({
                type: 'alert',
                title: 'Verification Summary',
                message: summaryMessage
            });

        }, `Verifying ${scope} Contacts`);
    },
    enrichMissingAddresses: async (contactsToEnrich) => {
        const { showModal, processAiJob, logEvent, customerDirectory } = get();
        const db = getDb();
    
        const sourceContacts = contactsToEnrich || customerDirectory;
        const contactsMissingAddress = sourceContacts.filter(c => !c.address || (typeof c.address === 'string' && c.address.trim() === ''));
    
        if (contactsMissingAddress.length === 0) {
            await showModal({ type: 'alert', title: 'No Action Needed', message: 'There are no contacts with missing addresses in the current selection.' });
            return;
        }
    
        const confirmed = await showModal({
            type: 'confirm',
            title: 'Find Missing Addresses',
            message: `This will use an optimized AI batch process to find addresses for ${contactsMissingAddress.length} contacts. This is much more efficient than one-by-one. Continue?`
        });
        if (!confirmed) return;
    
        await processAiJob(async (updateStatus, signal) => {
            const BATCH_SIZE = 50;
            let successfulUpdates = 0;
            let failedUpdates = 0;
    
            for (let i = 0; i < contactsMissingAddress.length; i += BATCH_SIZE) {
                if (signal.aborted) throw new Error("Aborted");
                
                const batchContacts = contactsMissingAddress.slice(i, i + BATCH_SIZE);
                const progress = (i / contactsMissingAddress.length) * 100;
                updateStatus({ progress, description: `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}... (${i + batchContacts.length}/${contactsMissingAddress.length})` });

                try {
                    const results = await findAddressesForContactsBatch(batchContacts, signal) as any[];
                    
                    const uniqueResults = Array.from(new Map(results.map(item => [item.id, item])).values()) as any[];

                    const firestoreBatch = db.batch();
                    uniqueResults.forEach(result => {
                        if ((result as any).address) {
                            const docRef = db.collection('customers').doc((result as any).id);
                            firestoreBatch.update(docRef, { address: (result as any).address });
                            successfulUpdates++;
                            logEvent('DB', `Batch updated address for ${(result as any).id}.`);
                        } else {
                            failedUpdates++;
                            logEvent('SYS', `Batch could not find address for ${(result as any).id}.`);
                        }
                    });

                    const returnedIds = new Set(uniqueResults.map(r => (r as any).id));
                    batchContacts.forEach(contact => {
                        if (!returnedIds.has(contact.id)) {
                            failedUpdates++;
                            logEvent('ERR', `AI did not return a result for contact ${contact.id} in batch.`);
                        }
                    });

                    await firestoreBatch.commit();
                } catch (error) {
                    failedUpdates += batchContacts.length;
                    logEvent('ERR', `Failed to process address batch: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    if (error.name === 'AbortError') throw error;
                }
            }
    
            await showModal({
                type: 'alert',
                title: 'Address Search Complete',
                message: `Successfully found and updated ${successfulUpdates} addresses. Could not find addresses for ${failedUpdates} contacts.`
            });
        }, `Finding addresses for ${contactsMissingAddress.length} contacts`);
    },
    identifyContactTypes: async () => {},
    reclassifyDataMinerContacts: async () => {
        const { customerDirectory, processAiJob, logEvent, showModal } = get();
        const db = getDb();
        const contactsToReclassify = customerDirectory.filter(c => c.sourceOrigin === 'Data Miner' && (c.type === 'Unknown' || !c.type));
        
        if (contactsToReclassify.length === 0) {
            await showModal({ type: 'alert', title: 'No Action Needed', message: 'No Data Miner contacts with an "Unknown" type were found to reclassify.' });
            return;
        }

        const confirmed = await showModal({
            type: 'confirm',
            title: 'Re-classify Contacts',
            message: `This will use AI to attempt to re-classify ${contactsToReclassify.length} contacts sourced from the Data Miner. This may consume API credits. Continue?`
        });
        if (!confirmed) return;

        await processAiJob(async (updateStatus, signal) => {
            const batchSize = 50;
            let successfulUpdates = 0;
            for (let i = 0; i < contactsToReclassify.length; i += batchSize) {
                if (signal.aborted) throw new Error("Aborted");
                const batchContacts = contactsToReclassify.slice(i, i + batchSize);
                updateStatus({ progress: (i / contactsToReclassify.length) * 100, description: `Analyzing contacts ${i + 1}-${i + batchContacts.length}...` });
                
                try {
                    const results = await reclassifyContactTypeBatch(batchContacts);
                    if (results && results.length > 0) {
                        const firestoreBatch = db.batch();
                        results.forEach(result => {
                            if (result.id && result.type !== 'Unknown') {
                                const docRef = db.collection('customers').doc(result.id);
                                firestoreBatch.update(docRef, { type: result.type });
                                successfulUpdates++;
                            }
                        });
                        await firestoreBatch.commit();
                    }
                } catch (error) {
                    logEvent('ERR', `Failed to reclassify batch starting at index ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
            await showModal({ type: 'alert', title: 'Re-classification Complete', message: `Successfully re-classified ${successfulUpdates} of ${contactsToReclassify.length} contacts.` });
        }, `Re-classifying ${contactsToReclassify.length} contacts`);
    },
    purgeSimulatedData: async () => {
        const { processAiJob, showModal, logEvent, customerDirectory, activeSearches, savedLeads } = get();
        const db = getDb();
        
        await processAiJob(async (updateStatus) => {
            const batch = db.batch();
            let deletedCustomers = 0;
            let updatedJobs = 0;
    
            updateStatus({ progress: 10, description: 'Scanning customer directory...' });
            const customersToDelete = customerDirectory.filter(c => JSON.stringify(c).toLowerCase().includes('simulated'));
            customersToDelete.forEach(c => {
                const docRef = db.collection('customers').doc(c.id);
                batch.delete(docRef);
                deletedCustomers++;
            });
    
            updateStatus({ progress: 40, description: 'Scanning active searches...' });
            for (const job of activeSearches) {
                const originalLeadCount = job.leads.length;
                const filteredLeads = job.leads.filter(l => !JSON.stringify(l).toLowerCase().includes('simulated'));
                if (filteredLeads.length < originalLeadCount) {
                    const jobRef = db.collection('activeSearches').doc(job.id);
                    batch.update(jobRef, { leads: filteredLeads });
                    updatedJobs++;
                }
            }
    
            updateStatus({ progress: 70, description: 'Scanning saved searches...' });
            for (const job of savedLeads) {
                const originalLeadCount = job.leads.length;
                const filteredLeads = job.leads.filter(l => !JSON.stringify(l).toLowerCase().includes('simulated'));
                if (filteredLeads.length < originalLeadCount) {
                    const jobRef = db.collection('savedLeads').doc(job.id);
                    batch.update(jobRef, { leads: filteredLeads });
                    updatedJobs++;
                }
            }
            
            updateStatus({ progress: 90, description: 'Committing changes to database...' });
            await batch.commit();
    
            const message = `Purge complete. Deleted ${deletedCustomers} customers and cleaned ${updatedJobs} lead groups.`;
            logEvent('DB', message);
            await showModal({ type: 'alert', title: 'Purge Complete', message });
    
        }, 'Purging Simulated Data');
    },
    deleteAllLeadData: async () => {
        const { processAiJob, showModal, logEvent, activeSearches, savedLeads } = get();
        const db = getDb();

        await processAiJob(async (updateStatus) => {
            const batch = db.batch();
            
            updateStatus({ progress: 25, description: `Deleting ${activeSearches.length} active searches...` });
            activeSearches.forEach(job => {
                const docRef = db.collection('activeSearches').doc(job.id);
                batch.delete(docRef);
            });
    
            updateStatus({ progress: 50, description: `Deleting ${savedLeads.length} saved searches...` });
            savedLeads.forEach(job => {
                const docRef = db.collection('savedLeads').doc(job.id);
                batch.delete(docRef);
            });
    
            updateStatus({ progress: 75, description: 'Committing deletions...' });
            await batch.commit();
    
            const message = `Successfully deleted all ${activeSearches.length} active and ${savedLeads.length} saved lead groups.`;
            logEvent('DB', message);
            await showModal({ type: 'alert', title: 'Deletion Complete', message });
    
        }, 'Deleting All Lead Data');
    },
    permanentlyDeleteSoftDeletedCustomers: async () => {
        const { processAiJob, showModal, logEvent } = get();
        const db = getDb();

        await processAiJob(async (updateStatus) => {
            updateStatus({ progress: 20, description: 'Querying for soft-deleted contacts...' });
            const querySnapshot = await db.collection('customers').where('isDeleted', '==', true).get();
            
            if (querySnapshot.empty) {
                updateStatus({ progress: 100, description: 'No soft-deleted contacts found to purge.' });
                await showModal({ type: 'alert', title: 'No Action Needed', message: 'No soft-deleted contacts were found.' });
                return;
            }
    
            const count = querySnapshot.size;
            updateStatus({ progress: 50, description: `Found ${count} contacts to purge. Preparing batch delete...` });
            const batch = db.batch();
            querySnapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
    
            updateStatus({ progress: 80, description: 'Committing permanent deletions...' });
            await batch.commit();
    
            const message = `Successfully purged ${count} soft-deleted contacts.`;
            logEvent('DB', message);
            await showModal({ type: 'alert', title: 'Purge Complete', message });
    
        }, 'Purging Deleted Contacts');
    },
    deleteCustomer: async (id) => {
        const { logEvent, showModal } = get();
        const db = getDb();
        logEvent('DB', `Attempting to soft-delete customer ${id}.`);
        // Telemetry
        get().logUserAction('DELETE_LEAD', { type: 'customer', id });
        
        try {
            await db.collection('customers').doc(id).update({ isDeleted: true });
            logEvent('DB', `Successfully soft-deleted customer ${id}.`);
            set(state => ({
                customerDirectory: state.customerDirectory.filter(c => c.id !== id)
            }));
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logEvent('ERR', `Failed to delete customer ${id}: ${message}`);
            await showModal({ type: 'alert', title: 'Error', message: `Could not delete contact: ${message}` });
            return false;
        }
    },
    deleteCustomers: async (ids) => {
        const { logEvent, showModal } = get();
        const db = getDb();
        if (ids.length === 0) return true;
        logEvent('DB', `Attempting to soft-delete ${ids.length} customers.`);
        try {
            const batch = db.batch();
            const idsToDelete = new Set(ids);
            ids.forEach(id => {
                const docRef = db.collection('customers').doc(id);
                batch.update(docRef, { isDeleted: true });
            });
            await batch.commit();
            logEvent('DB', `Successfully soft-deleted ${ids.length} customers.`);
            set(state => ({
                customerDirectory: state.customerDirectory.filter(c => !idsToDelete.has(c.id))
            }));
            await showModal({ type: 'alert', title: 'Success', message: `${ids.length} contacts have been deleted.` });
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logEvent('ERR', `Failed to delete customers: ${message}`);
            await showModal({ type: 'alert', title: 'Error', message: `Could not delete contacts: ${message}` });
            return false;
        }
    },
    uploadPlanForLead: async (leadId, file) => {},
    uploadVerificationSnapshot: async (leadId, file) => {},
    captureAndStoreLeadEvidence: async (leadId) => {},
    uploadCampaignContacts: async (file) => {},
    createCampaign: async (name, goal, contactIds) => {},
    addManualCampaignContact: (contact) => {},
    addDirectoryCampaignContacts: (customerIds) => {
        const { customerDirectory, campaignContacts, showModal } = get();
        const existingIds = new Set(campaignContacts.map(c => c.id));
    
        const selectedCustomers = customerDirectory.filter(c => customerIds.includes(c.id));
        
        const verifiedToAdd = selectedCustomers
            .filter(c => c.status === 'Verified' && !existingIds.has(c.id));
            
        const unverifiedCount = selectedCustomers.length - verifiedToAdd.length;
    
        if (unverifiedCount > 0) {
            showModal({
                type: 'alert',
                title: 'Contacts Skipped',
                message: `${unverifiedCount} selected contact(s) were skipped because they are not 'Verified'. Please run the 'Verify Contacts' tool in the Contacts view to improve data quality.`
            });
        }
    
        const contactsToAdd = verifiedToAdd.map(c => ({
            id: c.id,
            contactName: c.contactName,
            company: c.company,
            email: c.email,
            phone: c.phone
        }));
    
        if (contactsToAdd.length > 0) {
            set(state => ({
                campaignContacts: [...state.campaignContacts, ...contactsToAdd]
            }));
        }
    },
    addClickSendListContacts: (contacts) => {},
    clearCampaignAudience: () => {},
    approveAndSendCampaign: async (campaign) => {
        const { showModal, logEvent } = get();
        logEvent('SYS', `Campaign send for "${campaign.name}" triggered but is temporarily disabled.`);
        await showModal({
            type: 'alert',
            title: 'Feature Temporarily Disabled',
            message: 'The campaign sending functionality is currently switched off for maintenance. Your campaign draft has been saved. Please contact support for more information.'
        });
    },
    setTenderAnalysisState: (state) => set(s => ({ tenderAnalysisState: { ...s.tenderAnalysisState, ...state }})),
    setPlanReaderState: (state) => set(s => ({ planReaderState: { ...s.planReaderState, ...state }})),
    
    startPlanReaderAnalysis: async (scale, pitch, slateSize, country) => {
        const { planReaderState, processAiJob, setPlanReaderState, showModal } = get();
        if (planReaderState.uploadedFiles.length === 0) return;

        setPlanReaderState({ analysisState: 'running', error: '' });

        try {
            const result = await processAiJob(async (updateStatus, signal) => {
                const { fileToBase64, pdfToImageBase64 } = await import('@/utils/fileProcessing');
                const { analyzeRoofPlan } = await import('@/services/ai/planReaderService');
                
                const imageParts: { inlineData: { mimeType: string; data: string } }[] = [];
                
                updateStatus({ progress: 10, description: 'Processing uploaded files...' });

                for (const file of planReaderState.uploadedFiles) {
                    if (signal.aborted) throw new Error('Aborted');
                    if (file.type === 'application/pdf') {
                        const images = await pdfToImageBase64(file);
                        images.forEach(img => {
                            imageParts.push({ inlineData: { mimeType: 'image/jpeg', data: img } });
                        });
                    } else {
                        const base64 = await fileToBase64(file);
                        imageParts.push({ inlineData: { mimeType: file.type, data: base64 } });
                    }
                }

                if (imageParts.length === 0) throw new Error("No valid images found to analyze.");

                return await analyzeRoofPlan(imageParts, scale, pitch, slateSize, country, updateStatus, signal);
            }, 'Plan Reader Analysis');

            if (result) {
                setPlanReaderState({ analysisState: 'complete', analysisResultData: result });
            } else {
                setPlanReaderState({ analysisState: 'error', error: 'Analysis was cancelled or failed.' });
            }
        } catch (error: any) {
            let friendlyError = error.message || "Unknown error";
            
            if (friendlyError === "NO_PLANS_DETECTED") {
                friendlyError = "No architectural plans were detected in the uploaded documents. Please upload a file that contains a floor plan, roof plan, or elevation.";
                await showModal({ type: 'alert', title: 'Analysis Result', message: friendlyError });
                setPlanReaderState({ analysisState: 'idle', error: friendlyError, uploadedFiles: [] });
            } else {
                console.error("Plan Reader Error:", error);
                setPlanReaderState({ analysisState: 'error', error: friendlyError });
            }
        }
    },
    
    handleAutomationRequest: (command) => {
        const { logEvent, handleAdvancedLeadSearch, processAiJob } = get();
        
        processAiJob(async (updateStatus, signal) => {
            logEvent('SYS', `Processing automation command: "${command}"`);
            const tasksResult = await parseAutomationCommand(command);
    
            if (!tasksResult || !tasksResult.tasks || tasksResult.tasks.length === 0) {
                throw new Error('Could not understand the command. Please try phrasing it differently.');
            }
    
            logEvent('SYS', `Parsed ${tasksResult.tasks.length} tasks from command.`);
            let i = 0;
            for (const task of tasksResult.tasks) {
                if (signal.aborted) throw new Error('Automation cancelled by user.');
                i++;
                const taskDescription = task.type === 'find_leads' || task.type === 'find_leads_and_generate_report' ? task.query : `${task.contactType} in ${task.location}`;
                updateStatus({ progress: (i / tasksResult.tasks.length) * 100, description: `Task ${i}/${tasksResult.tasks.length}: ${taskDescription}` });
                
                switch (task.type) {
                    case 'find_leads':
                        await handleAdvancedLeadSearch(task.query, 'manual');
                        break;
                    case 'find_contacts':
                        const { currentUser, customerDirectory, leadMarket } = get();
                        if (currentUser) {
                            await dataMinerService.startSearch(task.contactType, task.location, currentUser, customerDirectory, task.quantity, leadMarket);
                        }
                        break;
                    case 'find_leads_and_generate_report':
                        await handleAdvancedLeadSearch(task.query, 'full');
                        break;
                }
            }
        }, `Automation: "${command}"`);
    },
    fetchSettings: async () => {
        const { setClickSendBalance, logEvent } = get();
        const db = getDb();
        const auth = getAuth();
        try {
            if (auth?.currentUser) {
                const userSettingsDoc = await db.collection('settings').doc(auth.currentUser.uid).get();
                if (userSettingsDoc.exists) {
                    const settings = userSettingsDoc.data();
                    set({
                        clicksendConfig: settings?.clicksend || null,
                        emailProvider: settings?.emailProvider || null,
                        mailRelayHostname: settings?.mailRelayHostname || null,
                        mailRelayApiKey: settings?.mailRelayApiKey || null,
                    });
                }
            }
            
            const globalSettingsDoc = await db.collection('settings').doc('global').get();
            if (globalSettingsDoc.exists) {
                const globalSettings = globalSettingsDoc.data();
                if (globalSettings?.bypassWord) {
                    set({ bypassWord: globalSettings.bypassWord });
                    logEvent('SYS', 'Fetched and cached emergency bypass word.');
                }
            }

            const discoverySourcesSnapshot = await db.collection('discoverySources').get();
            const discoverySources = discoverySourcesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as DiscoverySource[];
            set({ discoverySources });

        } catch (error) {
            logEvent('ERR', `Failed to fetch settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    },
    setClickSendBalance: (balance) => set({ clicksendBalance: balance }),
    }),
    {
      name: 'mont-azul-store',
      partialize: (state) =>
        Object.fromEntries(
          Object.entries(state).filter(([key]) => ![
            'modal', 'processJobs', 'logs', 'currentUser', 'allUsers', 'isAiJobRunning',
            'apiCallCount', 'isMonitorOpen', 'isProcessMonitorOpen',
            'clicksendConfig', 'clicksendBalance',
            'planReaderState',
          ].includes(key))
        ),
    }
  )
);
