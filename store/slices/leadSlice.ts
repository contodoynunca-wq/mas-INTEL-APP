
import type { Lead, SearchJob, LeadContact, SalesStage, ClosedLoopFeedback, LeadSearchCategory, PlanningDocument, DiscoverySource, StructuredSearchParams, ForensicResult, StatusJob, PartnerPrepReport } from '@/types';
import type { StateCreator } from 'zustand';
import type { AppState } from '../store';
import { getDb, getStorage } from '@/services/firebase';
import firebase from 'firebase/compat/app';
import { 
    generateAIStrategyForLocation, findNewLeads, deepEnrichLeadData, findHighQualityLeads, 
    findLeadsInSlateRegion as findLeadsInSlateRegionService, generateAccountStrategy, 
    generateOpportunityBasket, rescoreLeadWithV52Logic, findLeadsFromDiscoverySources, 
    updateLeadWithNewInfo, extractMaterialsForLead, generateAIStrategyForLead, 
    generateDeepStrategyContent, generateLeadActionPlan as generateActionPlanService, 
    deepEnrichLeadsBatch, performForensicVerification, findAndStabilizeLeadImages, 
    evaluateProjectValueAndScope, analyzeCompanyFinancials, generateBatchStrategies,
    generatePartnerOutreachEmail, generatePartnerPrepReport, generateOutreachEmail
} from '@/services/ai/leadIntelService';
import { 
    extractBasicContactsForLeads, findSpecificContactDetails, findAndEnrichLinkedInContactsForLead, 
    enrichAndVerifyContact, validateContact, generateContactActionPlan, enrichAndVerifyContactsBatch 
} from '@/services/ai/contactFinderService';
import { calculateLeadScores } from '@/utils/leadScoring';
import { validateContactList, validateContact as validateContactForReport } from '@/utils/leadPrinting';
import { sanitizeForFirestore, transformLeadForUI, safeTimestampToDate } from '@/utils/firestoreUtils';
import { smartScanLead, autoScanLeadFromWeb } from '@/services/ai/smartLeadScanner';
import { runCloudPlanExtraction } from '@/services/ai/planExtractionService';

export interface LeadSlice {
    savedLeads: SearchJob[];
    activeSearches: SearchJob[];
    selectedLeadIntelJob: SearchJob | null;
    globalLeadSearchQuery: string;
    isGlobalSearchActive: boolean;
    lastFetchedData: number | null;
    
    // Actions
    fetchPrimaryData: (options?: { forceRefresh?: boolean }) => Promise<void>;
    setSelectedLeadIntelJob: (job: SearchJob | null) => void;
    updateLeadInJob: (jobId: string, leadId: string, updates: Partial<Lead>, isSavedOverride?: boolean) => Promise<void>;
    deleteLead: (leadId: string) => Promise<void>;
    bulkDeleteLeads: (leadIds: string[]) => Promise<void>;
    addLeadFeedback: (leadId: string, feedback: Lead['feedback']) => Promise<void>;
    findParentJob: (leadId: string) => { job: SearchJob | undefined, isSaved: boolean };
    enrichLeadContacts: (leadId: string, isSilent?: boolean, signal?: AbortSignal) => Promise<void>;
    generateLeadStrategy: (leadId: string, isSilent?: boolean) => Promise<void>;
    generateLeadActionPlan: (leadId: string) => Promise<void>;
    generateOpportunityBasket: (leadId: string) => Promise<void>;
    updateLeadSalesStage: (leadId: string, stage: SalesStage, feedback?: ClosedLoopFeedback) => Promise<void>;
    generateDeepStrategy: (leadId: string, isSilent?: boolean) => Promise<void>;
    generateAccountStrategy: (companyName: string, leads: Lead[]) => Promise<string | null>;
    updateLeadInfo: (leadId: string, isSilent?: boolean) => Promise<void>;
    checkLeadForUpdates: (leadId: string) => Promise<void>;
    deleteLeadContact: (leadId: string, contactIndex: number) => Promise<void>;
    toggleContactPriority: (leadId: string, contactIndex: number) => Promise<void>;
    manuallyVerifyContact: (leadId: string, contactIndex: number) => Promise<void>;
    verifyLeadContact: (leadId: string, contactIndex: number) => Promise<void>;
    enrichJobContacts: (jobId: string) => Promise<void>;
    _coreVerifyAndEnrichLeads: (leadIds: string[], updateStatus: (updates: Partial<StatusJob>) => void, signal: AbortSignal, jobIdOverride?: string) => Promise<void>;
    verifyAndEnrichLeads: (leadIds: string[]) => Promise<void>;
    verifyAllContactsForJob: (leadIds: string[]) => Promise<void>;
    setGlobalLeadSearchQuery: (query: string) => void;
    createCustomLeadGroup: (groupName: string, leadIds: string[]) => Promise<void>;
    handleAdvancedLeadSearch: (query: string, enrichmentType?: 'manual' | 'full') => Promise<string | undefined>;
    handleStructuredLeadSearch: (searchParams: StructuredSearchParams, searchType: LeadSearchCategory, enrichmentType: 'manual' | 'full') => Promise<string | undefined>;
    findMoreLeadsForJob: (jobId: string, isSaved: boolean, enrich: boolean) => Promise<void>;
    findLeadsInSlateRegion: () => Promise<void>;
    handleFullReportForJob: (job: SearchJob, isSaved: boolean) => Promise<void>;
    findAndEnrichLinkedInContacts: (leadId: string) => Promise<void>;
    uploadPlanForLead: (leadId: string, file: File) => Promise<void>;
    uploadVerificationSnapshot: (leadId: string, file: File) => Promise<void>;
    captureAndStoreLeadEvidence: (leadId: string) => Promise<void>;
    runDataHygieneV52: () => Promise<void>;
    runDiscoveryScrape: () => Promise<void>;
    runForensicVerification: (leadIds: string[]) => Promise<ForensicResult[] | undefined>;
    runSnapHunter: (leadIds: string[]) => Promise<void>;
    runForensicValueAudit: (leadId: string) => Promise<void>;
    runEconomicCheck: (leadIds: string[]) => Promise<void>;
    runSmartScan: (leadId: string, file: File) => Promise<void>;
    runAutoPlanScan: (leadId: string) => Promise<void>;
    runCloudPlanExtraction: (leadId: string) => Promise<void>;
    handleSaveJob: (job: SearchJob) => Promise<void>;
    deleteJob: (jobId: string, isSaved: boolean) => Promise<void>;
    generateBulkLeadStrategies: (leadIds: string[]) => Promise<void>;
}

export const createLeadSlice: StateCreator<AppState, [], [], LeadSlice> = (set, get) => ({
    savedLeads: [],
    activeSearches: [],
    selectedLeadIntelJob: null,
    globalLeadSearchQuery: '',
    isGlobalSearchActive: false,
    lastFetchedData: null,

    fetchPrimaryData: async (options: { forceRefresh?: boolean } = {}) => {
        const { forceRefresh = false } = options;
        const { savedLeads, lastFetchedData, currentUser, logEvent, allUsers } = get();
        if (!currentUser) return;

        const CACHE_DURATION = 3600000; // 1 hour
        const isCacheStale = !lastFetchedData || (Date.now() - lastFetchedData > CACHE_DURATION);
        const isCacheEmpty = savedLeads.length === 0;

        if (!forceRefresh && !isCacheStale && !isCacheEmpty) return;

        const db = getDb();
        try {
            const collectionsToFetch = [
                { name: 'activeSearches', query: db.collection('activeSearches') },
                { name: 'savedLeads', query: db.collection('savedLeads') },
                { name: 'customerDirectory', query: db.collection('customers') },
                { name: 'projectPipeline', query: db.collection('projects') },
                { name: 'sentItems', query: db.collection('sentItems') },
                { name: 'dashboardNotes', query: db.collection('dashboardNotes') },
                { name: 'productData', query: db.collection('products') },
                { name: 'accessoryData', query: db.collection('accessories') },
                { name: 'internalContacts', query: db.collection('contacts') },
                { name: 'campaigns', query: db.collection('campaigns') },
                { name: 'discoverySources', query: db.collection('discoverySources').where('market', '==', get().leadMarket) },
            ];
            
            if (currentUser.isAdmin && allUsers.length === 0) {
                 collectionsToFetch.push({ name: 'allUsers', query: db.collection('users') });
            }

            const snapshots = await Promise.all(collectionsToFetch.map(c => c.query.get()));
            const newState: Partial<AppState> = {};
            
            snapshots.forEach((snapshot, index) => {
                const collection = collectionsToFetch[index];
                let data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                if (collection.name === 'customerDirectory') {
                    data = data.filter((item: any) => item.isDeleted !== true);
                } else if (collection.name === 'allUsers') {
                    data = data.map(item => ({ ...item, uid: item.id }));
                }
                if (['dashboardNotes', 'sentItems'].includes(collection.name)) {
                    const sortKey = collection.name === 'dashboardNotes' ? 'createdAt' : 'sentAt';
                    (data as any[]).sort((a,b) => (safeTimestampToDate(b[sortKey])?.getTime() ?? 0) - (safeTimestampToDate(a[sortKey])?.getTime() ?? 0));
                }
                (newState as any)[collection.name] = data;
            });
            
            const currentSelected = get().selectedLeadIntelJob;
            if (currentSelected) {
                const updatedSelected = [...(newState.activeSearches || []), ...(newState.savedLeads || [])].find(j => j.id === currentSelected.id);
                if (updatedSelected) {
                    newState.selectedLeadIntelJob = updatedSelected as SearchJob;
                }
            }
            newState.lastFetchedData = Date.now();
            set(newState);
            logEvent('DB', `Data refreshed from Firestore.`);
        } catch (error) {
            console.error("Fetch failed", error);
        }
    },

    setSelectedLeadIntelJob: (job) => set({ selectedLeadIntelJob: job }),
    setGlobalLeadSearchQuery: (query) => set({ globalLeadSearchQuery: query, isGlobalSearchActive: !!query, selectedLeadIntelJob: null }),
    
    findParentJob: (leadId) => {
        const { activeSearches, savedLeads } = get();
        let job = activeSearches.find(j => j.leads.some(l => l.id === leadId));
        if (job) return { job, isSaved: false };
        job = savedLeads.find(j => j.leads.some(l => l.id === leadId));
        if (job) return { job, isSaved: true };
        return { job: undefined, isSaved: false };
    },

    updateLeadInJob: async (jobId, leadId, updates, isSavedOverride) => {
        const { findParentJob, logEvent, savedLeads, activeSearches, selectedLeadIntelJob } = get();
        const db = getDb();
        let { job, isSaved } = findParentJob(leadId);
        if (isSavedOverride !== undefined) isSaved = isSavedOverride;
        
        if (!job) {
            if (jobId) {
                 job = activeSearches.find(j => j.id === jobId);
                 if (job) isSaved = false;
                 else {
                     job = savedLeads.find(j => j.id === jobId);
                     if (job) isSaved = true;
                 }
            }
            if (!job && jobId) {
                const collectionName = isSaved ? 'savedLeads' : 'activeSearches';
                const doc = await db.collection(collectionName).doc(jobId).get();
                if (doc.exists) job = { ...doc.data(), id: doc.id } as SearchJob;
            }
        }
        
        if (!job) {
             logEvent('ERR', `Cannot update lead ${leadId}: Parent job not found.`);
             return;
        }
        
        const leadToUpdate = job.leads.find(l => l.id === leadId);
        if (!leadToUpdate) return;
        
        const mergedRawLead = { ...leadToUpdate, ...updates };
        const updatedLead = transformLeadForUI(mergedRawLead) as Lead;
        updatedLead.totalScore = calculateLeadScores(updatedLead);
        
        const updatedLeads = job.leads.map(l => l.id === leadId ? updatedLead : l);
        
        try {
            const collectionName = isSaved ? 'savedLeads' : 'activeSearches';
            const payload = sanitizeForFirestore({ leads: updatedLeads });
            await db.collection(collectionName).doc(job.id).update(payload);
            
            const collection = isSaved ? [...savedLeads] : [...activeSearches];
            const index = collection.findIndex(j => j.id === job.id);
            if (index > -1) {
                collection[index] = { ...collection[index], leads: updatedLeads };
                const newState: Partial<AppState> = isSaved ? { savedLeads: collection } : { activeSearches: collection };
                
                if (selectedLeadIntelJob?.id === job.id) {
                    newState.selectedLeadIntelJob = collection[index];
                }
                set(newState);
            }
        } catch (error: any) {
            console.error("Failed to update lead in DB", error);
            logEvent('ERR', `Failed to update lead ${leadId} in DB: ${error.message}`);
        }
    },

    deleteLead: async (leadId) => {
         const { findParentJob } = get();
         const { job, isSaved } = findParentJob(leadId);
         if(!job) return;
         
         const newLeads = job.leads.filter(l => l.id !== leadId);
         const db = getDb();
         const payload = sanitizeForFirestore({ leads: newLeads });
         
         await db.collection(isSaved ? 'savedLeads' : 'activeSearches').doc(job.id).update(payload);
         get().fetchPrimaryData({forceRefresh: true});
    },

    bulkDeleteLeads: async (leadIds) => {
        const { findParentJob } = get();
        const db = getDb();
        const jobsToUpdate = new Map<string, { job: SearchJob, isSaved: boolean, leadsToRemove: Set<string> }>();
        
        leadIds.forEach(leadId => {
            const { job, isSaved } = findParentJob(leadId);
            if (job) {
                if (!jobsToUpdate.has(job.id)) {
                    jobsToUpdate.set(job.id, { job, isSaved, leadsToRemove: new Set() });
                }
                jobsToUpdate.get(job.id)!.leadsToRemove.add(leadId);
            }
        });
        
        const batch = db.batch();
        jobsToUpdate.forEach(({ job, isSaved, leadsToRemove }, jobId) => {
            const newLeads = job.leads.filter(l => !leadsToRemove.has(l.id));
            const collectionName = isSaved ? 'savedLeads' : 'activeSearches';
            const docRef = db.collection(collectionName).doc(jobId);
            const payload = sanitizeForFirestore({ leads: newLeads });
            batch.update(docRef, payload);
        });
        
        await batch.commit();
        get().fetchPrimaryData({forceRefresh: true});
    },

    addLeadFeedback: async (leadId, feedback) => {
        const { findParentJob, updateLeadInJob } = get();
        const { job } = findParentJob(leadId);
        if (job) {
            await updateLeadInJob(job.id, leadId, { feedback });
        }
    },

    enrichLeadContacts: async (leadId, isSilent, signal) => {
        const { findParentJob, updateLeadInJob, processAiJob, logEvent } = get();
        const { job } = findParentJob(leadId);
        if (!job) return;
        const logic = async (updateStatus: any) => {
            await updateLeadInJob(job.id, leadId, { isFindingContacts: true });
            updateStatus({ progress: 20, description: 'Extracting basic contacts...' });
            
            const lead = job.leads.find(l => l.id === leadId)!;
            const existingContacts = lead.companies || []; 

            const basicContacts = await extractBasicContactsForLeads([lead], logEvent, lead.market);
            const incomingContacts = basicContacts[leadId] || [];
            
            const mergedContacts = [...existingContacts];

            incomingContacts.forEach(incoming => {
                const matchIndex = mergedContacts.findIndex(ex => {
                    const nameMatch = ex.contactName?.toLowerCase().trim() === incoming.contactName?.toLowerCase().trim();
                    const exComp = ex.company?.toLowerCase() || '';
                    const inComp = incoming.company?.toLowerCase() || '';
                    const companyMatch = exComp.includes(inComp) || inComp.includes(exComp) || exComp === 'unknown company';
                    return nameMatch && companyMatch;
                });

                if (matchIndex >= 0) {
                    const existing = mergedContacts[matchIndex];
                    mergedContacts[matchIndex] = {
                        ...existing,
                        ...incoming,
                        email: incoming.email || existing.email,
                        phone: incoming.phone || existing.phone,
                        mobile: incoming.mobile || existing.mobile,
                        linkedinUrl: incoming.linkedinUrl || existing.linkedinUrl,
                        status: existing.status === 'Verified' ? 'Verified' : (incoming.status || existing.status || 'Unverified')
                    };
                } else {
                    mergedContacts.push(incoming);
                }
            });

            await updateLeadInJob(job.id, leadId, { 
                companies: mergedContacts, 
                contactsFetched: true,
                isFindingContacts: false 
            });
            logEvent('AI', `Enrichment complete. Lead now has ${mergedContacts.length} contacts.`);
        };
        if (isSilent) {
            return logic(() => {});
        } else {
            await processAiJob(logic, 'Enriching Contacts', { leadId });
        }
    },

    generateLeadStrategy: async (leadId, isSilent) => {
         const { findParentJob, updateLeadInJob, processAiJob } = get();
         const { job } = findParentJob(leadId);
         if(!job) return;
         const logic = async () => {
             await updateLeadInJob(job.id, leadId, { isGeneratingStrategy: true });
             const lead = job.leads.find(l => l.id === leadId)!;
             const strategy = await generateAIStrategyForLead(lead, lead.market);
             await updateLeadInJob(job.id, leadId, { salesStrategy: strategy, strategyGenerated: true, isGeneratingStrategy: false });
         };
         if (isSilent) {
             return logic().catch(e => console.error(`Background Strategy Generation Failed for ${leadId}`, e));
         } else {
             await processAiJob(logic, 'Generating Strategy', { leadId });
         }
    },

    generateLeadActionPlan: async (leadId) => { /* Placeholder */ },
    generateOpportunityBasket: async (leadId) => { /* Placeholder */ },

    updateLeadSalesStage: async (leadId, stage, feedback) => {
        const { findParentJob, updateLeadInJob } = get();
        const { job } = findParentJob(leadId);
        if(job) await updateLeadInJob(job.id, leadId, { salesStage: stage, closedLoopFeedback: feedback });
    },

    generateDeepStrategy: async (leadId, isSilent) => {
         const { findParentJob, updateLeadInJob, processAiJob, logEvent } = get();
         const { job, isSaved } = findParentJob(leadId);
         if(!job) {
             logEvent('ERR', `Cannot generate deep strategy: Job not found for lead ${leadId}`);
             return;
         }
         const logic = async () => {
             await updateLeadInJob(job.id, leadId, { isGeneratingStrategy: true }, isSaved);
             try {
                 const lead = job.leads.find(l => l.id === leadId);
                 if (!lead) throw new Error("Lead not found in job");
                 const strategy = await generateDeepStrategyContent(lead);
                 await updateLeadInJob(job.id, leadId, { 
                     salesStrategy: strategy, 
                     strategyGenerated: true, 
                     isGeneratingStrategy: false 
                }, isSaved);
             } catch (e) {
                 console.error("Strategy Gen Error", e);
                 await updateLeadInJob(job.id, leadId, { isGeneratingStrategy: false }, isSaved);
                 throw e;
             }
         };
         if (isSilent) {
             return logic().catch(e => console.error(`Strategy Gen Failed`, e));
         } else {
             await processAiJob(logic, 'Generating Deep Strategy', { leadId });
         }
    },

    generateAccountStrategy: async (company, leads) => {
         return await generateAccountStrategy(company, leads);
    },

    updateLeadInfo: async (leadId) => {
         const { findParentJob, updateLeadInJob, processAiJob, logEvent } = get();
         const { job } = findParentJob(leadId);
         if(!job) return;
         await processAiJob(async (status, signal) => {
             const lead = job.leads.find(l => l.id === leadId)!;
             const updates = await extractMaterialsForLead(lead, logEvent, signal);
             await updateLeadInJob(job.id, leadId, updates);
         }, 'Extracting Materials', { leadId });
    },

    checkLeadForUpdates: async (leadId) => {
         const { findParentJob, updateLeadInJob, processAiJob, currentUser, logEvent } = get();
         const { job } = findParentJob(leadId);
         if(!job || !currentUser) return;
         await processAiJob(async (status, signal) => {
             const lead = job.leads.find(l => l.id === leadId)!;
             const updates = await updateLeadWithNewInfo(lead, currentUser.uid, logEvent, signal);
             await updateLeadInJob(job.id, leadId, updates);
         }, 'Checking Updates', { leadId });
    },

    deleteLeadContact: async (leadId, contactIndex) => {
        const { findParentJob, updateLeadInJob } = get();
        const { job, isSaved } = findParentJob(leadId);
        if(!job) return;
        const lead = job.leads.find(l => l.id === leadId);
        if(!lead || !lead.companies) return;
        
        const newContacts = [...lead.companies];
        newContacts.splice(contactIndex, 1);
        await updateLeadInJob(job.id, leadId, { companies: newContacts }, isSaved);
    },

    toggleContactPriority: async (leadId, contactIndex) => {
        const { findParentJob, updateLeadInJob } = get();
        const { job, isSaved } = findParentJob(leadId);
        if(!job) return;
        const lead = job.leads.find(l => l.id === leadId);
        if(!lead || !lead.companies) return;
        
        const newContacts = [...lead.companies];
        if(!newContacts[contactIndex]) return;

        const target = newContacts[contactIndex];
        if (target.priority === 'main') {
            target.priority = 'secondary';
        } else {
            newContacts.forEach(c => { if(c.priority === 'main') c.priority = 'secondary'; });
            target.priority = 'main';
        }
        
        await updateLeadInJob(job.id, leadId, { companies: newContacts }, isSaved);
    },

    manuallyVerifyContact: async (leadId, index) => {
        const { findParentJob, updateLeadInJob } = get();
        const { job } = findParentJob(leadId);
        if(!job) return;
        const lead = job.leads.find(l => l.id === leadId);
        if(!lead || !lead.companies) return;
        const newContacts = [...lead.companies];
        if(newContacts[index]) {
            newContacts[index] = { ...newContacts[index], status: 'Verified' };
            await updateLeadInJob(job.id, leadId, { companies: newContacts });
        }
    },

    verifyLeadContact: async (leadId, contactIndex) => {
        const { findParentJob, updateLeadInJob, processAiJob, logEvent } = get();
        const { job, isSaved } = findParentJob(leadId);
        if(!job) return;
        const lead = job.leads.find(l => l.id === leadId);
        if(!lead || !lead.companies[contactIndex]) return;
        
        const contact = lead.companies[contactIndex];
        
        await processAiJob(async () => {
            const customerLike: any = {
                contactName: contact.contactName || '',
                company: contact.company || '',
                email: contact.email || '',
                phone: contact.phone || ''
            };
            const result = await enrichAndVerifyContact(customerLike, logEvent);
            
            const newContacts = [...lead.companies];
            newContacts[contactIndex] = {
                ...contact,
                status: result.status as any,
                email: result.email || contact.email,
                phone: result.phone || contact.phone,
            };
            await updateLeadInJob(job.id, leadId, { companies: newContacts }, isSaved);
        }, `Verifying ${contact.contactName}`);
    },

    enrichJobContacts: async (jobId) => {
        const { processAiJob, enrichLeadContacts, savedLeads, activeSearches } = get();
        const job = [...savedLeads, ...activeSearches].find(j => j.id === jobId);
        if(!job) return;
        await processAiJob(async (status, signal) => {
            for(const lead of job.leads) {
                if(!lead.contactsFetched) await enrichLeadContacts(lead.id, true, signal);
            }
        }, 'Enriching Group Contacts', { jobId });
    },

    _coreVerifyAndEnrichLeads: async (leadIds, updateStatus, signal, jobIdOverride) => {
        const { findParentJob, updateLeadInJob, logEvent, activeSearches, savedLeads, leadMarket } = get();
        let overrideJob: SearchJob | undefined;
        if (jobIdOverride) {
            overrideJob = activeSearches.find(j => j.id === jobIdOverride);
            if (!overrideJob) {
                overrideJob = savedLeads.find(j => j.id === jobIdOverride);
            }
            if (!overrideJob) {
                const db = getDb();
                const doc = await db.collection('activeSearches').doc(jobIdOverride).get();
                if (doc.exists) {
                    overrideJob = { ...doc.data(), id: doc.id } as SearchJob;
                }
            }
        }
        const BATCH_SIZE = 5;
        for (let i = 0; i < leadIds.length; i += BATCH_SIZE) {
            if (signal.aborted) throw new Error("Aborted");
            const batchLeadIds = leadIds.slice(i, i + BATCH_SIZE);
            const leadsToProcess: Lead[] = [];
            const jobMap = new Map<string, { job: SearchJob, isSaved: boolean }>();
            
            for (const leadId of batchLeadIds) {
                let job: SearchJob | undefined;
                let isSaved = false;
                if (overrideJob) {
                    job = overrideJob;
                } else {
                    const res = findParentJob(leadId);
                    job = res.job;
                    isSaved = res.isSaved;
                }
                if (job) {
                    const lead = job.leads.find(l => l.id === leadId);
                    if (lead) {
                        leadsToProcess.push(lead);
                        jobMap.set(leadId, { job, isSaved });
                    }
                }
            }
            if (leadsToProcess.length === 0) continue;
            
            updateStatus({ progress: (i / leadIds.length) * 100, description: `Enriching batch ${Math.floor(i / BATCH_SIZE) + 1}... (${leadsToProcess.length} leads)` });
            
            try {
                const enrichedResults = await deepEnrichLeadsBatch(leadsToProcess, leadMarket, logEvent, signal);
                for (const lead of leadsToProcess) {
                    const enrichedData = enrichedResults[lead.id];
                    if (enrichedData) {
                        const { job, isSaved } = jobMap.get(lead.id)!;
                        await updateLeadInJob(job.id, lead.id, { ...enrichedData, isFullyEnriched: true }, isSaved);
                    }
                }
            } catch (e) {
                logEvent('ERR', `Batch enrichment failed for slice starting at ${i}: ${e}`);
            }
        }
    },

    verifyAndEnrichLeads: async (leadIds) => {
         const { processAiJob, _coreVerifyAndEnrichLeads } = get();
         await processAiJob((s, sig) => _coreVerifyAndEnrichLeads(leadIds, s, sig), 'Bulk Enrichment', { leadIds });
    },

    verifyAllContactsForJob: async (leadIds) => {
        const { findParentJob, updateLeadInJob, processAiJob, logEvent } = get();
        if (leadIds.length === 0) return;
        await processAiJob(async (updateStatus, signal) => {
            const contactsToProcess: { leadId: string, contactIndex: number, data: any }[] = [];
            for (const leadId of leadIds) {
                 if (signal.aborted) throw new Error("Aborted");
                 const { job } = findParentJob(leadId);
                 if (!job) continue;
                 const lead = job.leads.find(l => l.id === leadId);
                 if (!lead || !lead.companies || lead.companies.length === 0) continue;
                 lead.companies.forEach((c, idx) => {
                     if (c.status !== 'Verified' && c.status !== 'Inactive') {
                          contactsToProcess.push({
                              leadId,
                              contactIndex: idx,
                              data: {
                                  id: `${leadId}__${idx}`,
                                  contactName: c.contactName,
                                  company: c.company,
                                  email: c.email || '',
                                  phone: c.phone || '',
                              }
                          });
                     }
                 });
            }
            if (contactsToProcess.length === 0) return;
            const BATCH_SIZE = 8; 
            const updatesByLead = new Map<string, Map<number, Partial<LeadContact>>>();
            
            for (let i = 0; i < contactsToProcess.length; i += BATCH_SIZE) {
                if (signal.aborted) throw new Error("Aborted");
                const batch = contactsToProcess.slice(i, i + BATCH_SIZE);
                updateStatus({ progress: (i / contactsToProcess.length) * 100, description: `Verifying batch ${Math.ceil((i + 1)/BATCH_SIZE)}...` });
                try {
                    const inputForService = batch.map(b => b.data);
                    const results = await enrichAndVerifyContactsBatch(inputForService);
                    results.forEach(res => {
                         const [leadId, idxStr] = res.id.split('__');
                         const index = parseInt(idxStr, 10);
                         if(!updatesByLead.has(leadId)) updatesByLead.set(leadId, new Map());
                         updatesByLead.get(leadId)!.set(index, {
                             status: res.status as any,
                             email: res.email || undefined,
                             phone: res.phone || undefined,
                             mobile: res.mobile || undefined
                         });
                    });
                } catch (e) {
                    logEvent('ERR', `Batch verification failed: ${e}`);
                }
            }
            updateStatus({ progress: 95, description: 'Saving updates...' });
            for (const [leadId, updates] of updatesByLead.entries()) {
                const { job, isSaved } = findParentJob(leadId);
                if (!job) continue;
                const lead = job.leads.find(l => l.id === leadId);
                if (!lead) continue;
                const newCompanies = [...lead.companies];
                updates.forEach((update, idx) => {
                    if (newCompanies[idx]) {
                        newCompanies[idx] = { ...newCompanies[idx], ...update };
                    }
                });
                await updateLeadInJob(job.id, leadId, { companies: newCompanies }, isSaved);
            }
        }, `Verifying contacts for ${leadIds.length} leads`);
    },

    createCustomLeadGroup: async (groupName, leadIds) => {
        const { currentUser, logEvent, activeSearches, savedLeads, leadMarket } = get();
        if (!currentUser) return;
        
        // 1. Gather Lead Data
        const gatheredLeads: Lead[] = [];
        const seenIds = new Set<string>();

        // Look in active and saved lists
        [...activeSearches, ...savedLeads].forEach(job => {
            job.leads.forEach(l => {
                if (leadIds.includes(l.id) && !seenIds.has(l.id)) {
                    gatheredLeads.push(l);
                    seenIds.add(l.id);
                }
            });
        });

        if (gatheredLeads.length === 0) return;

        // 2. Create Job Object
        const newGroup: SearchJob = {
            id: `group_${Date.now()}`,
            userId: currentUser.uid,
            location: groupName,
            searchType: 'custom_group',
            leads: gatheredLeads,
            status: 'complete',
            error: null,
            findMoreCount: 0,
            market: leadMarket
        };

        // 3. Save to DB
        const db = getDb();
        try {
            await db.collection('savedLeads').doc(newGroup.id).set(sanitizeForFirestore(newGroup));
            logEvent('DB', `Created custom group "${groupName}" with ${gatheredLeads.length} leads.`);
            
            // 4. Update Local State
            set(state => ({
                savedLeads: [newGroup, ...state.savedLeads],
                selectedLeadIntelJob: newGroup
            }));
        } catch (e: any) {
            logEvent('ERR', `Failed to save custom group: ${e.message}`);
        }
    },

    handleAdvancedLeadSearch: async (query, type) => { 
        const { currentUser, leadMarket, processAiJob } = get();
        if (!currentUser) return;
        return await processAiJob(async (status, signal) => {
            return await findHighQualityLeads({ query, updateStatus: status, signal, userId: currentUser.uid, market: leadMarket, enrichmentType: type || 'manual' });
        }, `Smart Search: ${query}`);
    },

    handleStructuredLeadSearch: async (params, type, enrich) => {
        const { currentUser, leadMarket, processAiJob, logEvent } = get();
        if (!currentUser) return;
        return await processAiJob(async (status, signal) => {
             const db = getDb();
             const newJob: Omit<SearchJob, 'id'> = {
                userId: currentUser.uid,
                location: params.location_filter || 'Custom Search',
                market: leadMarket,
                status: 'running',
                leads: [],
                findMoreCount: 0,
                searchType: type,
                searchParams: params,
                error: null
            };
            const cleanJob = sanitizeForFirestore(newJob);
            const docRef = await db.collection('activeSearches').add(cleanJob);
            const { leads, disqualifiedLeads } = await findNewLeads({
                jobId: docRef.id,
                searchParams: params,
                searchType: type,
                updateStatus: status,
                signal,
                existingLeads: [],
                userId: currentUser.uid,
                market: leadMarket,
                logEvent
            });
            const sanitizedLeads = leads.map(lead => transformLeadForUI(lead) as Lead);
            const payload = sanitizeForFirestore({
                leads: sanitizedLeads,
                disqualifiedLeads: disqualifiedLeads,
                status: 'complete',
                progress: 100
            });
            await docRef.update(payload);
            const newJobWithId = { ...cleanJob, id: docRef.id, leads: sanitizedLeads, disqualifiedLeads, status: 'complete' };
            set(state => ({
                activeSearches: [newJobWithId as SearchJob, ...state.activeSearches],
                selectedLeadIntelJob: newJobWithId as SearchJob
            }));
            if(enrich === 'full') {
                const { _coreVerifyAndEnrichLeads } = get();
                await _coreVerifyAndEnrichLeads(leads.map(l => l.id), status, signal, docRef.id);
            }
            return docRef.id;
        }, `Structured Search: ${params.location_filter}`);
    },

    findMoreLeadsForJob: async (jobId, isSaved, enrich) => {
        const { currentUser, processAiJob, logEvent, activeSearches, savedLeads, _coreVerifyAndEnrichLeads } = get();
        if (!currentUser) return;
        const collectionName = isSaved ? 'savedLeads' : 'activeSearches';
        const job = (isSaved ? savedLeads : activeSearches).find(j => j.id === jobId);
        if (!job) return;
        await processAiJob(async (updateStatus, signal) => {
             const db = getDb();
             const jobRef = db.collection(collectionName).doc(jobId);
             const currentFindMoreCount = job.findMoreCount || 0;
             const newFindMoreCount = currentFindMoreCount + 1;
             await jobRef.update({ status: 'running', findMoreCount: newFindMoreCount });
             updateStatus({ progress: 10, description: 'Searching for more leads...' });
             const { leads, disqualifiedLeads } = await findNewLeads({
                 jobId: job.id,
                 searchParams: job.searchParams || { location_filter: job.location, keywords: job.keywords },
                 searchType: job.searchType,
                 updateStatus,
                 signal,
                 existingLeads: job.leads,
                 userId: currentUser.uid,
                 market: job.market,
                 logEvent,
                 findMoreCount: currentFindMoreCount
             });
             const sanitizedLeads = leads.map(l => transformLeadForUI(l) as Lead);
             if (sanitizedLeads.length > 0 || disqualifiedLeads.length > 0) {
                 const updatePayload: any = {};
                 if (sanitizedLeads.length > 0) {
                     updatePayload.leads = firebase.firestore.FieldValue.arrayUnion(...sanitizeForFirestore(sanitizedLeads));
                 }
                 if (disqualifiedLeads.length > 0) {
                     updatePayload.disqualifiedLeads = firebase.firestore.FieldValue.arrayUnion(...disqualifiedLeads);
                 }
                 try {
                    await jobRef.update(updatePayload);
                 } catch (dbError: any) {
                    throw new Error(`DB Save Failed: ${dbError.message}. Local state was NOT updated to prevent data mismatch.`);
                 }
                 const collection = isSaved ? get().savedLeads : get().activeSearches;
                 const updatedCollection = collection.map(j => {
                     if (j.id === jobId) {
                         return {
                             ...j,
                             leads: [...j.leads, ...sanitizedLeads],
                             disqualifiedLeads: [...(j.disqualifiedLeads || []), ...disqualifiedLeads],
                             findMoreCount: newFindMoreCount,
                             status: 'complete' as const
                         };
                     }
                     return j;
                 });
                 if (isSaved) set({ savedLeads: updatedCollection });
                 else set({ activeSearches: updatedCollection });
                 const currentlySelected = get().selectedLeadIntelJob;
                 if (currentlySelected && currentlySelected.id === jobId) {
                     const updatedJob = updatedCollection.find(j => j.id === jobId);
                     if (updatedJob) {
                         set({ selectedLeadIntelJob: updatedJob });
                     }
                 }
                 logEvent('AI', `Found ${sanitizedLeads.length} more leads.`);
                 if (enrich && sanitizedLeads.length > 0) {
                     await _coreVerifyAndEnrichLeads(sanitizedLeads.map(l => l.id), updateStatus, signal, jobId);
                 }
             } else {
                 await jobRef.update({ status: 'complete' });
                 logEvent('SYS', 'No more leads found.');
             }
             const collection = isSaved ? get().savedLeads : get().activeSearches;
             const updatedCollection = collection.map(j => j.id === jobId ? { ...j, status: 'complete' as const, findMoreCount: newFindMoreCount } : j);
             if (isSaved) set({ savedLeads: updatedCollection });
             else set({ activeSearches: updatedCollection });
        }, `Finding more leads for: ${job.location}`);
    },

    findLeadsInSlateRegion: async () => { /* Placeholder */ },

    handleFullReportForJob: async (job, isSaved) => {
        const { processAiJob, updateLeadInJob, showModal } = get();
        await processAiJob(async (updateStatus, signal) => {
            const totalLeads = job.leads.length;
            if (totalLeads === 0) return;
            if (!job.strategy) {
                updateStatus({ progress: 20, description: 'Generating group strategy...' });
                const strategy = await generateAIStrategyForLocation(job.location, job.leads, job.market);
                const db = getDb();
                const collectionName = isSaved ? 'savedLeads' : 'activeSearches';
                await db.collection(collectionName).doc(job.id).update(sanitizeForFirestore({ strategy }));
                job.strategy = strategy; 
            }
            for (let i = 0; i < totalLeads; i++) {
                 const lead = job.leads[i];
                 if (!lead.salesStrategy) {
                     updateStatus({ progress: 30 + (i / totalLeads) * 60, description: `Strategizing ${i+1}/${totalLeads}: ${lead.title}` });
                     const strategy = await generateAIStrategyForLead(lead, lead.market);
                     await updateLeadInJob(job.id, lead.id, { salesStrategy: strategy, strategyGenerated: true }, isSaved);
                 }
            }
            updateStatus({ progress: 100, description: 'Report ready.' });
            await showModal({ type: 'alert', title: 'Report Ready', message: 'Group strategy and lead summaries are ready.' });
        }, `Creating Full Report for ${job.location}`, { jobId: job.id });
    },

    findAndEnrichLinkedInContacts: async (leadId) => {
        const { findParentJob, processAiJob, logEvent, updateLeadInJob } = get();
        const { job, isSaved } = findParentJob(leadId);
        if(!job) return;
        const lead = job.leads.find(l => l.id === leadId);
        if(!lead) return;
        
        await processAiJob(async () => {
            const newContacts = await findAndEnrichLinkedInContactsForLead(lead, logEvent);
            if(newContacts && newContacts.length > 0) {
                const existingContacts = lead.companies || [];
                const merged = [...existingContacts, ...newContacts];
                await updateLeadInJob(job.id, leadId, { companies: merged }, isSaved);
            }
        }, `LinkedIn Search for ${lead.title}`);
    },

    uploadPlanForLead: async (leadId, file) => {
        const { findParentJob, updateLeadInJob, logEvent, showModal } = get();
        const { job } = findParentJob(leadId);
        if (!job) return;
        try {
            const storage = getStorage();
            const storageRef = storage.ref();
            const fileRef = storageRef.child(`plans/${leadId}/${Date.now()}_${file.name}`);
            logEvent('SYS', 'Starting file upload...');
            const snapshot = await fileRef.put(file);
            const downloadURL = await snapshot.ref.getDownloadURL();
            logEvent('SYS', 'File uploaded, saving record...');
            const newDocument: PlanningDocument = {
                type: 'Architectural Plan',
                filename: file.name,
                url: downloadURL,
                storageUrl: downloadURL,
                size: `${(file.size / 1024 / 1024).toFixed(2)} MB`
            };
            const lead = job.leads.find(l => l.id === leadId);
            const existingDocs = lead?.planningDocuments || [];
            await updateLeadInJob(job.id, leadId, {
                planningDocuments: [...existingDocs, newDocument]
            });
            logEvent('SYS', `Uploaded plan for lead ${leadId}`);
            await showModal({ type: 'alert', title: 'Success', message: 'Plan uploaded successfully.' });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logEvent('ERR', `Failed to upload plan: ${msg}`);
            await showModal({ type: 'alert', title: 'Error', message: `Failed to upload plan: ${msg}` });
        }
    },

    uploadVerificationSnapshot: async (leadId, file) => {
        const { findParentJob, updateLeadInJob, logEvent, showModal } = get();
        const { job } = findParentJob(leadId);
        if (!job) return;
        try {
            const storage = getStorage();
            const storageRef = storage.ref();
            const fileRef = storageRef.child(`snapshots/${leadId}/${Date.now()}_${file.name}`);
            logEvent('SYS', 'Starting snapshot upload...');
            const snapshot = await fileRef.put(file);
            const downloadURL = await snapshot.ref.getDownloadURL();
            logEvent('SYS', 'Snapshot uploaded, saving record...');
            const newDocument: PlanningDocument = {
                type: 'Verification Snapshot',
                filename: file.name,
                url: downloadURL,
                storageUrl: downloadURL,
                size: `${(file.size / 1024).toFixed(0)} KB`
            };
            const lead = job.leads.find(l => l.id === leadId);
            const existingDocs = lead?.planningDocuments || [];
            await updateLeadInJob(job.id, leadId, {
                planningDocuments: [...existingDocs, newDocument]
            });
             logEvent('SYS', `Uploaded snapshot for lead ${leadId}`);
             await showModal({ type: 'alert', title: 'Success', message: 'Snapshot uploaded successfully.' });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logEvent('ERR', `Failed to upload snapshot: ${msg}`);
            await showModal({ type: 'alert', title: 'Error', message: `Failed to upload snapshot: ${msg}` });
        }
    },

    captureAndStoreLeadEvidence: async (leadId) => { /* Placeholder */ },

    runDataHygieneV52: async () => {
        const { activeSearches, savedLeads, processAiJob, logEvent, showModal } = get();
        const db = getDb();
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        await processAiJob(async (updateStatus) => {
            const allJobs = [...activeSearches, ...savedLeads];
            let totalProcessed = 0;
            let totalArchived = 0;
            const batch = db.batch();

            for (let i = 0; i < allJobs.length; i++) {
                const job = allJobs[i];
                const collectionName = activeSearches.some(j => j.id === job.id) ? 'activeSearches' : 'savedLeads';
                let jobChanged = false;
                
                const updatedLeads = job.leads.map(lead => {
                    const newScore = calculateLeadScores(lead);
                    let leadChanged = false;
                    
                    if (newScore !== lead.totalScore) {
                        lead.totalScore = newScore;
                        leadChanged = true;
                    }

                    const leadDate = new Date(lead.dateFound);
                    if (!lead.isDismissed && newScore < 40 && leadDate < sixMonthsAgo) {
                        lead.isDismissed = true;
                        lead.notes = (lead.notes || '') + '\n[Auto-Archived by V52 Hygiene: Low Score & Old]';
                        totalArchived++;
                        leadChanged = true;
                    }
                    
                    if (leadChanged) jobChanged = true;
                    return lead;
                });

                if (jobChanged) {
                    const docRef = db.collection(collectionName).doc(job.id);
                    batch.update(docRef, { leads: sanitizeForFirestore(updatedLeads) });
                }
                
                totalProcessed += job.leads.length;
                updateStatus({ 
                    progress: (i / allJobs.length) * 100, 
                    description: `Scanning job ${i+1}/${allJobs.length}... (${totalArchived} archived)` 
                });
            }

            await batch.commit();
            
            // Refresh local data
            get().fetchPrimaryData({ forceRefresh: true });
            
            await showModal({
                type: 'alert',
                title: 'Hygiene Complete',
                message: `Scanned ${totalProcessed} leads. Auto-archived ${totalArchived} zombies (Score < 40, > 6 months old).`
            });

        }, 'V52 Data Hygiene');
    },

    runDiscoveryScrape: async () => { /* Placeholder */ },

    runForensicVerification: async (leadIds) => {
        const { findParentJob, processAiJob, logEvent } = get();
        if(leadIds.length === 0) return;
        
        // Gather full lead objects
        const leads: Lead[] = [];
        for(const id of leadIds) {
            const { job } = findParentJob(id);
            const l = job?.leads.find(x => x.id === id);
            if(l) leads.push(l);
        }

        return await processAiJob(async (status, signal) => {
            return await performForensicVerification(leads, logEvent, signal);
        }, `Forensic Verification (${leads.length})`);
    },

    runSnapHunter: async (leadIds) => {
        const { findParentJob, updateLeadInJob, processAiJob, logEvent } = get();
        await processAiJob(async (updateStatus) => {
            for (let i = 0; i < leadIds.length; i++) {
                const leadId = leadIds[i];
                const { job, isSaved } = findParentJob(leadId);
                if (!job) continue;
                const lead = job.leads.find(l => l.id === leadId);
                if (!lead) continue;

                updateStatus({ progress: (i / leadIds.length) * 100, description: `Hunting images for ${lead.title}...` });
                const docs = await findAndStabilizeLeadImages(lead, logEvent);
                
                if (docs.length > 0) {
                    const existing = lead.planningDocuments || [];
                    const merged = [...existing, ...docs]; // Append new docs
                    await updateLeadInJob(job.id, leadId, { planningDocuments: merged }, isSaved);
                }
            }
        }, `Snap Hunter (${leadIds.length} leads)`);
    },

    runForensicValueAudit: async (leadId) => {
        const { findParentJob, updateLeadInJob, processAiJob, showModal } = get();
        const { job, isSaved } = findParentJob(leadId);
        if(!job) return;
        const lead = job.leads.find(l => l.id === leadId);
        if(!lead) return;

        await processAiJob(async () => {
            const result = await evaluateProjectValueAndScope(lead);
            if (result.wasCorrectionNeeded) {
                const newNote = `[Value Audit]: ${result.reasoning} | Corrected: ${result.correctedValue}`;
                await updateLeadInJob(job.id, leadId, { 
                    projectValue: result.correctedValue,
                    notes: (lead.notes || '') + '\n' + newNote 
                }, isSaved);
                await showModal({ type: 'alert', title: 'Audit Complete', message: `Value corrected to ${result.correctedValue}.`});
            } else {
                await showModal({ type: 'alert', title: 'Audit Complete', message: 'Value appears consistent with project scope.'});
            }
        }, 'Forensic Value Audit');
    },

    runEconomicCheck: async (leadIds) => {
        const { findParentJob, updateLeadInJob, processAiJob, logEvent, leadMarket } = get();
        await processAiJob(async (updateStatus) => {
            for (let i = 0; i < leadIds.length; i++) {
                const leadId = leadIds[i];
                const { job, isSaved } = findParentJob(leadId);
                if (!job) continue;
                const lead = job.leads.find(l => l.id === leadId);
                if (!lead || !lead.companies) continue;

                updateStatus({ progress: (i / leadIds.length) * 100, description: `Checking finances for ${lead.title}...` });
                const newCompanies = [...lead.companies];
                let changed = false;

                for (let j = 0; j < newCompanies.length; j++) {
                    const comp = newCompanies[j];
                    if (comp.company && comp.company !== 'Unknown') {
                        const result = await analyzeCompanyFinancials(comp.company, leadMarket, logEvent);
                        newCompanies[j] = {
                            ...comp,
                            financialStatus: result.status as any,
                            financialRisk: result.risk as any,
                            financialLink: result.link || undefined,
                            financialLastChecked: new Date().toISOString()
                        };
                        changed = true;
                    }
                }

                if (changed) {
                    await updateLeadInJob(job.id, leadId, { companies: newCompanies }, isSaved);
                }
            }
        }, 'Economic Health Check', { leadIds });
    },

    runSmartScan: async (leadId, file) => {
        const { findParentJob, updateLeadInJob, processAiJob, logEvent, showModal } = get();
        const { job, isSaved } = findParentJob(leadId);
        if(!job) return;
        
        await processAiJob(async () => {
            const result = await smartScanLead(leadId, file, logEvent);
            if(result.success && result.data) {
                const lead = job.leads.find(l => l.id === leadId);
                const currentDocs = lead?.planningDocuments || [];
                // Merge smart scan docs
                const newDocs = [...currentDocs, ...result.data.assets];
                await updateLeadInJob(job.id, leadId, { 
                    planningDocuments: newDocs,
                    smartScan: result.data 
                }, isSaved);
                await showModal({type:'alert', title:'Smart Scan Complete', message: 'Assets extracted and data verified.'});
            } else {
                throw new Error(result.error || "Smart Scan failed.");
            }
        }, 'Smart Scan Analysis', { leadId });
    },

    runAutoPlanScan: async (leadId) => {
        const { findParentJob, processAiJob, logEvent } = get();
        const { job } = findParentJob(leadId);
        if(!job) return;
        const lead = job.leads.find(l => l.id === leadId);
        if(!lead) return;

        await processAiJob(async (status, signal) => {
            await autoScanLeadFromWeb(lead, status, logEvent, signal);
        }, 'Auto-Plan Scan', { leadId });
    },

    runCloudPlanExtraction: async (leadId) => {
        const { findParentJob, currentUser, updateLeadInJob, showModal, processAiJob } = get();
        const { job, isSaved } = findParentJob(leadId);
        if (!job || !currentUser) return;
        const lead = job.leads.find(l => l.id === leadId);
        if(!lead || !lead.planningUrl) {
            await showModal({ type: 'alert', title: 'Error', message: 'No planning URL available for this lead.'});
            return;
        }

        // Just fire the trigger, don't wait for completion here. Monitor takes over.
        try {
            await runCloudPlanExtraction(lead, currentUser.uid);
            await showModal({ type: 'alert', title: 'Extraction Queued', message: 'The Cloud Worker has been dispatched. Results will appear in the documents tab shortly.'});
        } catch (e: any) {
            await showModal({ type: 'alert', title: 'Error', message: 'Failed to queue extraction: ' + e.message});
        }
    },

    handleSaveJob: async (job) => {
        const { activeSearches, savedLeads, logEvent, setSelectedLeadIntelJob } = get();
        const db = getDb();
        const batch = db.batch();
        
        // Remove from active
        const oldRef = db.collection('activeSearches').doc(job.id);
        batch.delete(oldRef);
        
        // Add to saved
        const newRef = db.collection('savedLeads').doc(job.id);
        const sanitizedJob = sanitizeForFirestore({ ...job, id: job.id });
        batch.set(newRef, sanitizedJob); 
        
        await batch.commit();
        
        // Optimistic Update
        set(state => ({
            activeSearches: state.activeSearches.filter(j => j.id !== job.id),
            savedLeads: [job, ...state.savedLeads],
            selectedLeadIntelJob: job // Keep it selected
        }));
        logEvent('DB', `Saved search ${job.id} to history.`);
    },

    deleteJob: async (jobId, isSaved) => {
        const { showModal, setSelectedLeadIntelJob } = get();
        if (await showModal({ type: 'confirm', title: 'Delete Search?', message: 'This cannot be undone.' })) {
            const db = getDb();
            const collection = isSaved ? 'savedLeads' : 'activeSearches';
            await db.collection(collection).doc(jobId).delete();
            
            set(state => {
                if (isSaved) {
                    return { savedLeads: state.savedLeads.filter(j => j.id !== jobId) };
                } else {
                    return { activeSearches: state.activeSearches.filter(j => j.id !== jobId) };
                }
            });
            
            if (get().selectedLeadIntelJob?.id === jobId) {
                setSelectedLeadIntelJob(null);
            }
        }
    },

    generateBulkLeadStrategies: async (leadIds) => {
        const { findParentJob, updateLeadInJob, processAiJob, leadMarket } = get();
        // Gather leads
        const leads: Lead[] = [];
        const jobMap = new Map<string, {job: SearchJob, isSaved: boolean}>();
        
        for(const id of leadIds) {
            const { job, isSaved } = findParentJob(id);
            if(job) {
                const l = job.leads.find(x => x.id === id);
                if(l && !l.salesStrategy) {
                    leads.push(l);
                    jobMap.set(id, {job, isSaved});
                }
            }
        }
        
        if (leads.length === 0) return;

        await processAiJob(async (updateStatus) => {
            updateStatus({ progress: 20, description: `Generating strategies for ${leads.length} leads...` });
            const strategies = await generateBatchStrategies(leads, leadMarket);
            
            updateStatus({ progress: 80, description: 'Saving strategies...' });
            for(const [leadId, strategy] of Object.entries(strategies)) {
                const info = jobMap.get(leadId);
                if(info) {
                    await updateLeadInJob(info.job.id, leadId, { 
                        salesStrategy: strategy, 
                        strategyGenerated: true,
                        isGeneratingStrategy: false 
                    }, info.isSaved);
                }
            }
        }, `Bulk Strategy Generation`);
    },
});
