
import React, { FC, useState, useMemo, useEffect, useCallback } from 'react';
import { getDb } from '../../../services/firebase';
import type { Lead, SearchJob, LeadMarket, LeadSearchCategory, DisqualifiedLead, StructuredSearchParams, CountryCode, ForensicResult } from '../../../types';
import { useAppStore } from '../../../store/store';
import { generateAIStrategyForLocation, generateOutreachEmail, generateLeadEmbedding } from '../../../services/ai/leadIntelService';
import { printContent } from '../../../utils/print';
import { generateFullLeadHTML } from '../../../utils/leadPrinting';
import { i18n } from '../../../utils/translations';
import { LeadCard } from '../../../components/leads/LeadCard';
import LeadMapModal from '../../../components/leads/LeadMapModal';
import PrintOptionsSelector from '../../../components/common/PrintOptionsSelector';
import { calculateCosineSimilarity, getMultimodalEmbedding } from '../../../services/ai/embeddingService';
import { ICONS } from '@/constants';
import EmailDraftModal from '@/components/common/EmailDraftModal';
import ForensicReportModal from '@/components/leads/ForensicReportModal';
import firebase from 'firebase/compat/app';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from '@google/genai';

const PAGE_SIZE = 15;
const GOOGLE_MAPS_API_KEY = "AIzaSyBD2ZWbkHzrCUGTHwHwqK9v2dNj6XGINTE";

const LeadIntelView: FC = () => {
    // Granular state selectors for performance
    const currentUser = useAppStore(state => state.currentUser);
    const activeSearches = useAppStore(state => state.activeSearches);
    const savedLeads = useAppStore(state => state.savedLeads);
    const isAiJobRunning = useAppStore(state => state.isAiJobRunning);
    const viewProps = useAppStore(state => state.viewProps);
    const selectedLeadIntelJob = useAppStore(state => state.selectedLeadIntelJob);
    const leadMarket = useAppStore(state => state.leadMarket);
    const globalLeadSearchQuery = useAppStore(state => state.globalLeadSearchQuery);
    const isGlobalSearchActive = useAppStore(state => state.isGlobalSearchActive);

    // Actions
    const {
        processAiJob, showModal, logEvent, updateLeadInJob, enrichLeadContacts, findAndEnrichLinkedInContacts,
        generateLeadStrategy, generateLeadActionPlan, generateDeepStrategy, verifyAndEnrichLeads,
        setSelectedLeadIntelJob, updateLeadInfo, checkLeadForUpdates, setLeadMarket, deleteLeadContact,
        findParentJob, manuallyVerifyContact, verifyLeadContact, enrichJobContacts,
        setGlobalLeadSearchQuery, handleAdvancedLeadSearch,
        handleNavigationRequest, verifyAllContactsForJob, deleteLead, bulkDeleteLeads,
        handleStructuredLeadSearch, findMoreLeadsForJob, runForensicVerification, runSnapHunter, runEconomicCheck,
        handleSaveJob, deleteJob, generateBulkLeadStrategies, createCustomLeadGroup
    } = useAppStore.getState();

    // UI State
    const [sidebarTab, setSidebarTab] = useState<'active' | 'history' | 'custom'>('active');
    const [specialViewMode, setSpecialViewMode] = useState<'favorites' | 'all_leads' | null>(null);
    
    // Filter & Search State
    const [smartSearchQuery, setSmartSearchQuery] = useState('');
    const [localGlobalSearch, setLocalGlobalSearch] = useState('');
    const [searchMode, setSearchMode] = useState<'smart' | 'global' | 'semantic'>('smart');
    const [enrichAfterFinding, setEnrichAfterFinding] = useState(false);
    const [leadFilterQuery, setLeadFilterQuery] = useState('');
    const [stageFilter, setStageFilter] = useState<'All' | 'On-Site' | 'Pre-Construction'>('All');
    const [gradeFilter, setGradeFilter] = useState('All');
    const [currentPage, setCurrentPage] = useState(1);
    
    // Tool State
    // Using mapTargetJob to trigger map modal for any arbitrary list of leads
    const [mapTargetJob, setMapTargetJob] = useState<SearchJob | null>(null);
    const [selectedLeadsForBulk, setSelectedLeadsForBulk] = useState<string[]>([]);
    const [isCompactView, setIsCompactView] = useState(false);
    const [draftModalData, setDraftModalData] = useState<{ lead: Lead; draft: { text: string; subject: string; to: string } } | null>(null);
    const [isDraftingEmail, setIsDraftingEmail] = useState(false);
    const [showManualControls, setShowManualControls] = useState(false);
    const [forensicResults, setForensicResults] = useState<ForensicResult[] | null>(null);

    // Manual Controls State
    const [manualLocation, setManualLocation] = useState('');
    const [manualQuantity, setManualQuantity] = useState('10');
    const [manualStage, setManualStage] = useState('All');
    const [manualSector, setManualSector] = useState('All');

    // Translation
    const T = useMemo(() => i18n[leadMarket] || i18n['UK'], [leadMarket]);
    
    // --- Derived Data ---

    const filteredActiveSearches = useMemo(() => activeSearches.filter(job => job.market === leadMarket), [activeSearches, leadMarket]);
    const filteredSavedLeads = useMemo(() => savedLeads.filter(job => job.market === leadMarket && job.searchType !== 'custom_group'), [savedLeads, leadMarket]);
    const customGroups = useMemo(() => savedLeads.filter(job => job.market === leadMarket && job.searchType === 'custom_group'), [savedLeads, leadMarket]);
    
    const allMarketLeads = useMemo(() => {
         return [...activeSearches, ...savedLeads]
            .filter(job => job.market === leadMarket)
            .flatMap(job => job.leads)
            .filter(l => !l.isDismissed);
    }, [activeSearches, savedLeads, leadMarket]);

    const favoriteLeads = useMemo(() => allMarketLeads.filter(l => l.isFavorite), [allMarketLeads]);

    const [semanticSearchQuery, setSemanticSearchQuery] = useState('');
    const [isSemanticSearching, setIsSemanticSearching] = useState(false);
    const [semanticResults, setSemanticResults] = useState<{ leadId: string; score: number }[] | null>(null);

    const handleSemanticSearch = async () => {
        if (!semanticSearchQuery.trim()) {
            setSemanticResults(null);
            return;
        }
        setIsSemanticSearching(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const queryEmbedding = await getMultimodalEmbedding(ai, [semanticSearchQuery]);
            
            if (queryEmbedding.length === 0) {
                setSemanticResults(null);
                return;
            }

            const results = allMarketLeads
                .filter(l => l.multimodalEmbedding || l.embedding)
                .map(l => {
                    const leadEmbedding = l.multimodalEmbedding || l.embedding || [];
                    const score = calculateCosineSimilarity(queryEmbedding, leadEmbedding);
                    return { leadId: l.id, score };
                })
                .filter(r => r.score > 0.3) // Threshold
                .sort((a, b) => b.score - a.score);

            setSemanticResults(results);
        } catch (e) {
            console.error("Semantic search failed", e);
        } finally {
            setIsSemanticSearching(false);
        }
    };

    const handleGenerateEmbeddings = async () => {
        const leadsToEnrich = currentLeads.filter(l => !l.multimodalEmbedding);
        if (leadsToEnrich.length === 0) return;

        await processAiJob(async () => {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            for (const lead of leadsToEnrich) {
                const embedding = await generateLeadEmbedding(ai, lead);
                if (embedding.length > 0) {
                    const { job, isSaved } = findParentJob(lead.id);
                    if (job) {
                        await updateLeadInJob(job.id, lead.id, { multimodalEmbedding: embedding }, isSaved);
                    }
                }
            }
        }, `Generating Multimodal Embeddings for ${leadsToEnrich.length} leads...`);
    };

    // Determine which leads to show in the Right Panel
    const currentLeads = useMemo(() => {
        let leads = allMarketLeads;

        if (semanticResults) {
            const resultIds = semanticResults.map(r => r.leadId);
            leads = leads.filter(l => resultIds.includes(l.id))
                .sort((a, b) => {
                    const scoreA = semanticResults.find(r => r.leadId === a.id)?.score || 0;
                    const scoreB = semanticResults.find(r => r.leadId === b.id)?.score || 0;
                    return scoreB - scoreA;
                });
        } else if (isGlobalSearchActive && globalLeadSearchQuery) {
            const lowerQuery = globalLeadSearchQuery.toLowerCase();
            return allMarketLeads.filter(lead => 
                lead.title?.toLowerCase().includes(lowerQuery) ||
                lead.summary?.toLowerCase().includes(lowerQuery) ||
                lead.address?.toLowerCase().includes(lowerQuery) ||
                lead.companies?.some(c => c.company?.toLowerCase().includes(lowerQuery))
            );
        }
        if (specialViewMode === 'favorites') return favoriteLeads;
        if (specialViewMode === 'all_leads') return allMarketLeads;
        
        return selectedLeadIntelJob?.leads.filter(l => !l.isDismissed) || [];
    }, [selectedLeadIntelJob, isGlobalSearchActive, globalLeadSearchQuery, specialViewMode, favoriteLeads, allMarketLeads]);

    const filteredLeads = useMemo(() => {
        let leads = currentLeads;
        if (stageFilter !== 'All') leads = leads.filter(lead => lead.projectStage === stageFilter);
        if (gradeFilter !== 'All') leads = leads.filter(lead => {
                if (!lead.grade) return false;
                if (gradeFilter === 'A') return lead.grade.startsWith('A');
                if (gradeFilter === 'B') return lead.grade.startsWith('B');
                return lead.grade === gradeFilter;
            });
        if (leadFilterQuery.trim()) {
            const lowercasedQuery = leadFilterQuery.toLowerCase();
            leads = leads.filter(lead => 
                lead.title?.toLowerCase().includes(lowercasedQuery) ||
                lead.summary?.toLowerCase().includes(lowercasedQuery) ||
                lead.address?.toLowerCase().includes(lowercasedQuery) ||
                lead.companies?.some(c => c.company?.toLowerCase().includes(lowercasedQuery))
            );
        }
        return leads;
    }, [currentLeads, leadFilterQuery, stageFilter, gradeFilter]);

    const paginatedLeads = useMemo(() => {
        return filteredLeads.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    }, [filteredLeads, currentPage]);
    
    const totalPages = Math.ceil(filteredLeads.length / PAGE_SIZE);

    // --- Effects ---

    useEffect(() => { setCurrentPage(1); }, [leadFilterQuery, stageFilter, gradeFilter, selectedLeadIntelJob, isGlobalSearchActive, specialViewMode]);

    useEffect(() => {
        if (globalLeadSearchQuery !== localGlobalSearch) setLocalGlobalSearch(globalLeadSearchQuery);
    }, [globalLeadSearchQuery]);

    useEffect(() => {
        if (viewProps.strategicLeadIds) {
            setSpecialViewMode('favorites'); 
        }
        if (viewProps.autoSearchQuery && typeof viewProps.autoSearchQuery === 'string') {
            setSmartSearchQuery(viewProps.autoSearchQuery);
            handleAdvancedLeadSearch(viewProps.autoSearchQuery);
        }
    }, [viewProps, handleAdvancedLeadSearch]);

    // --- Handlers ---

    const handleGlobalSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (localGlobalSearch.trim()) {
            setGlobalLeadSearchQuery(localGlobalSearch);
            setSelectedLeadsForBulk([]);
            setLeadFilterQuery('');
            setSpecialViewMode(null);
            setSelectedLeadIntelJob(null);
        }
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;
        
        if (searchMode === 'global') {
            handleGlobalSearch(e);
            return;
        }

        setGlobalLeadSearchQuery('');
        setSpecialViewMode(null);
        
        if (!manualLocation.trim() && !smartSearchQuery.trim()) {
            showModal({ type: 'alert', title: 'Input Required', message: 'Please enter a location or query.' });
            return;
        }
    
        const countryCodeMap: Record<LeadMarket, CountryCode> = { UK: 'UK', Spain: 'ES', France: 'FR', Germany: 'DE' };
        const searchParams: StructuredSearchParams = {
            location_filter: manualLocation || smartSearchQuery.replace(/\d+/g, '').trim(),
            limit: parseInt(manualQuantity, 10) || 10,
            country_code: countryCodeMap[leadMarket],
            keywords: smartSearchQuery ? [smartSearchQuery] : undefined,
        };
        
        let searchType: LeadSearchCategory = 'general_search';
        if (manualStage === 'Tenders') {
            searchParams.data_source_type = ['contracts_finder'];
            searchType = 'pre_planning';
        } else if (manualStage === 'Planning') {
            searchParams.data_source_type = ['planning_portal'];
        } else if (manualStage === 'On-Site') {
            searchParams.projectStage = 'On-Site';
            searchType = 'active_construction';
        }
        if (manualSector === 'Social Housing') searchParams.sector_filter = 'public_sector';
        
        handleStructuredLeadSearch(searchParams, searchType, enrichAfterFinding ? 'full' : 'manual');
        setSidebarTab('active'); 
    };

    const handleSelectJob = (job: SearchJob) => {
        setGlobalLeadSearchQuery('');
        setLocalGlobalSearch('');
        setSpecialViewMode(null);
        setSelectedLeadIntelJob(job);
        setSelectedLeadsForBulk([]);
        setLeadFilterQuery('');
    };

    const handleSelectSpecialView = (mode: 'favorites' | 'all_leads') => {
        setGlobalLeadSearchQuery('');
        setLocalGlobalSearch('');
        setSelectedLeadIntelJob(null);
        setSpecialViewMode(mode);
        setSelectedLeadsForBulk([]);
        setLeadFilterQuery('');
    };

    const handleFindMoreLeads = (job: SearchJob, isSaved: boolean) => {
        if (!currentUser) return;
        findMoreLeadsForJob(job.id, isSaved, enrichAfterFinding);
    };

    const handleDraftEmail = useCallback(async (lead: Lead) => {
        const result = await processAiJob(async () => generateOutreachEmail(lead), `Drafting email`, { leadId: lead.id });
        if (result) setDraftModalData({ lead, draft: { subject: result.subject, text: result.body, to: lead.companies?.[0]?.email || '' } });
    }, [processAiJob]);

    const handleExportXLSX = () => {
        const leadsToExport = filteredLeads.filter(l => selectedLeadsForBulk.includes(l.id));
        if (leadsToExport.length === 0) return;

        const data = leadsToExport.map(l => ({
            Title: l.title,
            Address: l.address,
            Stage: l.projectStage,
            Value: l.projectValue,
            Score: l.slateFitScore,
            Company: l.companies?.[0]?.company || '',
            Contact: l.companies?.[0]?.contactName || '',
            Email: l.companies?.[0]?.email || '',
            Phone: l.companies?.[0]?.phone || ''
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Leads");
        XLSX.writeFile(wb, `Leads_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleBulkGenerateStrategy = async () => {
        const leads = filteredLeads.filter(l => selectedLeadsForBulk.includes(l.id));
        if (leads.length === 0) return;
        await generateBulkLeadStrategies(selectedLeadsForBulk);
        setSelectedLeadsForBulk([]);
    };

    const handleBulkPrint = async () => {
        const leadsToPrint = filteredLeads.filter(l => selectedLeadsForBulk.includes(l.id));
        if (leadsToPrint.length === 0) return;

        const printOptions = await showModal({ type: 'custom', title: 'Bulk Print Options', content: <PrintOptionsSelector /> });
        if (!printOptions) return;

        let mapLink = undefined;
        let staticMapUrl = undefined;

        if (printOptions.customMapLink) {
            mapLink = { url: printOptions.customMapLink, text: 'View Interactive Project Map' };
        } else if (leadsToPrint.length <= 25) {
            const coords = leadsToPrint.filter(l => l.geolocation && l.geolocation.lat).map(l => `${l.geolocation!.lat},${l.geolocation!.lng}`);
            if (coords.length > 1) {
                const origin = coords[0];
                const destination = coords[coords.length - 1];
                const waypoints = coords.slice(1, -1).join('|');
                mapLink = { url: `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${waypoints}`, text: 'View Route on Google Maps' };
            }
        }

        const mapCoords = leadsToPrint.filter(l => l.geolocation && l.geolocation.lat).map(l => `${l.geolocation!.lat.toFixed(5)},${l.geolocation!.lng.toFixed(5)}`).slice(0, 40); 
        if (mapCoords.length > 0) {
            const markersParam = mapCoords.join('|');
            const baseUrl = "https://maps.googleapis.com/maps/api/staticmap";
            const params = new URLSearchParams();
            params.append("size", "600x400");
            params.append("scale", "2");
            params.append("maptype", "roadmap");
            params.append("markers", `color:red|size:mid|${markersParam}`);
            params.append("key", GOOGLE_MAPS_API_KEY);
            staticMapUrl = `${baseUrl}?${params.toString()}`;
        }

        let groupStrategyHtml = '';
        let strategyTitle = `Lead Group Report (${leadsToPrint.length})`;

        if (selectedLeadIntelJob && selectedLeadIntelJob.strategy) {
            strategyTitle = `Lead Report: ${selectedLeadIntelJob.location}`;
            groupStrategyHtml = `<div class="strategy-box">${selectedLeadIntelJob.strategy.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')}</div>`;
        } else {
            const generateStrat = await showModal({ type: 'confirm', title: 'Generate Strategy?', message: 'No general strategy exists for this group. Would you like the AI to analyze these leads and create a summary strategy for the report cover page?' });
            if (generateStrat) {
                await processAiJob(async (updateStatus) => {
                    updateStatus({ progress: 50, description: 'Generating group strategy...' });
                    const locationContext = selectedLeadIntelJob?.location || leadsToPrint[0].address || "Multiple Locations";
                    const strategyText = await generateAIStrategyForLocation(locationContext, leadsToPrint, leadMarket);
                    groupStrategyHtml = `<div class="strategy-box">${strategyText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')}</div>`;
                }, 'Generating Ad-Hoc Strategy');
            }
        }

        let fullHtml = '';
        const { getPrintGroupIntroHTML } = await import('@/utils/leadPrinting');
        fullHtml += getPrintGroupIntroHTML(strategyTitle, leadMarket, mapLink, staticMapUrl);
        if (groupStrategyHtml) { fullHtml += `<h2>Strategic Overview</h2>${groupStrategyHtml}<div class="page-break"></div>`; }

        for (const lead of leadsToPrint) {
            const leadHtml = await generateFullLeadHTML(lead, lead.title, printOptions);
            fullHtml += leadHtml + '<div class="page-break"></div>';
        }

        printContent(fullHtml, strategyTitle, printOptions.pageSize, true, leadMarket, printOptions.watermarkText);
        setSelectedLeadsForBulk([]);
    };

    const handleBulkAction = async (action: string) => {
        if (selectedLeadsForBulk.length === 0) return;
        
        if (action === 'delete') { 
            if (await showModal({ type: 'confirm', title: 'Delete?', message: `Delete ${selectedLeadsForBulk.length} leads?` })) {
                await bulkDeleteLeads(selectedLeadsForBulk); setSelectedLeadsForBulk([]); 
            }
            return;
        }

        if (action === 'mapSelected') {
            if (!currentUser) return;
            const leadsToMap = filteredLeads.filter(l => selectedLeadsForBulk.includes(l.id));
            if (leadsToMap.length === 0) return;

            const tempJob: SearchJob = {
                id: 'temp_map_' + Date.now(),
                userId: currentUser.uid,
                location: 'Selected Leads',
                leads: leadsToMap,
                status: 'complete',
                error: null,
                findMoreCount: 0,
                market: leadMarket
            };
            setMapTargetJob(tempJob);
        }
        
        if (action === 'createGroup') {
            const groupName = await showModal({ type: 'prompt', title: 'Group Name', message: 'Enter a name for this custom lead group:', placeholder: 'e.g. My Visit List' });
            if (groupName && typeof groupName === 'string') {
                await createCustomLeadGroup(groupName, selectedLeadsForBulk);
                setSelectedLeadsForBulk([]);
                setSidebarTab('custom');
            }
        }

        if (action === 'printGroup') await handleBulkPrint();
        if (action === 'snapHunter') await runSnapHunter(selectedLeadsForBulk);
        if (action === 'economicCheck') await runEconomicCheck(selectedLeadsForBulk);
        if (action === 'fullEnrichment') await verifyAndEnrichLeads(selectedLeadsForBulk);
        if (action === 'verifyAllContacts') await verifyAllContactsForJob(selectedLeadsForBulk);
        if (action === 'forensicVerify') { 
            const res = await runForensicVerification(selectedLeadsForBulk); 
            if (res && res.length > 0) {
                setForensicResults(res);
            } else {
                await showModal({ type: 'alert', title: 'Verification Complete', message: 'Forensic verification completed successfully. No anomalies or critical updates were found for the selected leads.' });
            }
        }
        if (action === 'exportXlsx') handleExportXLSX();
        if (action === 'bulkStrategy') handleBulkGenerateStrategy();
        if (action === 'extractMaterials') {
             await processAiJob(async (updateStatus) => {
                for (let i = 0; i < selectedLeadsForBulk.length; i++) {
                    updateStatus({ progress: (i / selectedLeadsForBulk.length) * 100, description: `Extracting materials: ${i + 1}/${selectedLeadsForBulk.length}` });
                    await updateLeadInfo(selectedLeadsForBulk[i], true);
                }
            }, `Bulk Material Extraction`);
        }
        
        if (action !== 'printGroup' && action !== 'createGroup' && action !== 'mapSelected') setSelectedLeadsForBulk([]);
    };

    const handlePrintLead = useCallback(async (lead: Lead) => {
        const opts = await showModal({ type: 'custom', title: 'Print Options', content: <PrintOptionsSelector /> });
        if (!opts) return;
        const content = await generateFullLeadHTML(lead, `Dossier: ${lead.title}`, opts);
        printContent(content, lead.title, opts.pageSize, true, lead.market, opts.watermarkText);
    }, [showModal]);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedLeadsForBulk(filteredLeads.map(l => l.id));
        } else {
            setSelectedLeadsForBulk([]);
        }
    };

    const handleForceCompleteJob = async (jobId: string) => {
         const store = useAppStore.getState();
         
         // Find which collection it belongs to by checking global state
         const isActive = store.activeSearches.some(j => j.id === jobId);
         const isSaved = store.savedLeads.some(j => j.id === jobId);
         
         if (!isActive && !isSaved) {
             console.error("Job not found in local store");
             return;
         }

         const collection = isActive ? 'activeSearches' : 'savedLeads';

         // 1. Optimistic Update Local UI Selected Job
         if (selectedLeadIntelJob && selectedLeadIntelJob.id === jobId) {
             setSelectedLeadIntelJob({ ...selectedLeadIntelJob, status: 'complete' });
         }
         
         // 2. Optimistic Update Lists in Store
         if (isActive) {
             const newActive = store.activeSearches.map(j => j.id === jobId ? { ...j, status: 'complete' as const } : j);
             useAppStore.setState({ activeSearches: newActive });
         } else {
             const newSaved = store.savedLeads.map(j => j.id === jobId ? { ...j, status: 'complete' as const } : j);
             useAppStore.setState({ savedLeads: newSaved });
         }

         // 3. Fire DB Update
         const db = getDb();
         try {
            await db.collection(collection).doc(jobId).update({ status: 'complete' });
            store.logEvent('SYS', `Force completed job ${jobId}`);
         } catch (e) {
             console.error("Force complete failed db sync", e);
             store.logEvent('ERR', `Force complete failed for ${jobId}`);
         }
    };

    // --- Render Helpers ---

    const renderJobList = (jobs: SearchJob[], isSaved: boolean) => {
        if (jobs.length === 0) return <p className="text-xs text-text-secondary text-center p-4">No jobs found.</p>;
        return (
            <div className="space-y-1">
                {jobs.map(job => (
                    <div key={job.id} onClick={() => handleSelectJob(job)} className={`p-2 rounded cursor-pointer transition-colors flex justify-between items-center ${selectedLeadIntelJob?.id === job.id ? 'bg-primary text-bg-secondary' : 'bg-surface hover:bg-bg-primary border border-border-color'}`}>
                        <div className="min-w-0 flex-grow">
                            <p className="font-semibold text-sm truncate" title={job.location}>{job.location}</p>
                            <div className="flex justify-between items-center text-[10px] opacity-80 mt-0.5">
                                <span>{job.leads?.length || 0} leads</span>
                                {job.status === 'running' && <span className="animate-pulse text-primary">●</span>}
                            </div>
                        </div>
                        <div className="flex gap-1 items-center ml-2">
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleFindMoreLeads(job, isSaved); }} 
                                className="btn tertiary sm !p-1 !h-6 !w-6 flex items-center justify-center" 
                                title="Find more leads similar to this job"
                            >+</button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); isSaved ? deleteJob(job.id, true) : handleSaveJob(job); }} 
                                className={`btn sm !p-1 !h-6 !w-6 flex items-center justify-center ${isSaved ? 'red' : 'green'}`}
                                title={isSaved ? "Delete from history" : "Save search to history"}
                            >{isSaved ? '×' : '💾'}</button>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full">
            {mapTargetJob && <LeadMapModal job={mapTargetJob} onClose={() => setMapTargetJob(null)} showModal={showModal}/>}
            {draftModalData && <EmailDraftModal initialDraft={draftModalData.draft} onClose={() => setDraftModalData(null)} onReDraft={async () => {}} isLoading={isDraftingEmail} />}
            {forensicResults && <ForensicReportModal results={forensicResults} onClose={() => setForensicResults(null)} />}

            {/* 1. Command Bar */}
            <div className="flex-shrink-0 bg-bg-secondary border-b border-border-color p-3 flex flex-col gap-2 shadow-sm z-10">
                <div className="flex items-center gap-3 w-full">
                    {/* Market Selector - COMPACT */}
                    <select 
                        value={leadMarket} 
                        onChange={(e) => setLeadMarket(e.target.value as any)} 
                        className="w-auto min-w-[80px] text-xs font-bold bg-surface border border-border-color rounded px-2 py-2 h-10 focus:ring-2 focus:ring-primary outline-none"
                        title="Select Market Region"
                    >
                        <option value="UK">🇬🇧 UK</option> <option value="Spain">🇪🇸 ES</option> <option value="France">🇫🇷 FR</option> <option value="Germany">🇩🇪 DE</option>
                    </select>

                    {/* Mode Toggle */}
                    <div className="flex bg-surface rounded-lg border border-border-color p-1 h-10 items-center shrink-0">
                        <button 
                            onClick={() => setSearchMode('smart')} 
                            className={`px-3 py-1 text-xs font-bold rounded transition-colors h-full ${searchMode === 'smart' ? 'bg-primary text-bg-secondary' : 'text-text-secondary hover:bg-bg-primary'}`}
                            title="Search for new leads using AI agents"
                        >
                            ⚡ Web
                        </button>
                        <div className="w-[1px] h-4 bg-border-color mx-1"></div>
                        <button 
                            onClick={() => setSearchMode('global')} 
                            className={`px-3 py-1 text-xs font-bold rounded transition-colors h-full ${searchMode === 'global' ? 'bg-primary text-bg-secondary' : 'text-text-secondary hover:bg-bg-primary'}`}
                            title="Search your saved database"
                        >
                            🔍 DB
                        </button>
                        <div className="w-[1px] h-4 bg-border-color mx-1"></div>
                        <button 
                            onClick={() => setSearchMode('semantic')} 
                            className={`px-3 py-1 text-xs font-bold rounded transition-colors h-full ${searchMode === 'semantic' ? 'bg-primary text-bg-secondary' : 'text-text-secondary hover:bg-bg-primary'}`}
                            title="Semantic search using multimodal embeddings"
                        >
                            🧠 Semantic
                        </button>
                    </div>

                    {/* Search Input - DOMINANT */}
                    <form onSubmit={(e) => { e.preventDefault(); searchMode === 'semantic' ? handleSemanticSearch() : handleSearchSubmit(e); }} className="flex-grow flex items-center relative min-w-0">
                        <input 
                            type="text" 
                            value={searchMode === 'smart' ? smartSearchQuery : (searchMode === 'global' ? localGlobalSearch : semanticSearchQuery)}
                            onChange={e => {
                                if (searchMode === 'smart') setSmartSearchQuery(e.target.value);
                                else if (searchMode === 'global') setLocalGlobalSearch(e.target.value);
                                else setSemanticSearchQuery(e.target.value);
                            }}
                            className="w-full pl-4 pr-10 h-10 text-sm border border-border-color rounded bg-surface focus:ring-2 focus:ring-primary outline-none transition-shadow"
                            placeholder={
                                searchMode === 'smart' ? "e.g. 'Roofers in Bristol'..." : 
                                searchMode === 'global' ? "Search database by name, company..." :
                                "Ask anything: 'Leads with complex roofs' or 'Heritage projects'..."
                            }
                        />
                        <button type="submit" className="absolute right-2 p-1 text-primary hover:bg-bg-secondary rounded" title="Execute Search">
                            {isSemanticSearching ? (
                                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                            )}
                        </button>
                    </form>

                    {/* Enrich Semantic Button */}
                    <button 
                        onClick={handleGenerateEmbeddings}
                        className="h-10 px-3 flex-shrink-0 flex items-center justify-center rounded border bg-surface border-border-color hover:bg-bg-primary text-xs font-bold gap-2"
                        title="Generate multimodal embeddings for semantic search"
                    >
                        <span>🧠</span>
                        <span className="hidden lg:inline">Enrich Semantic</span>
                    </button>

                    {/* Advanced Toggle */}
                    <button 
                        onClick={() => setShowManualControls(!showManualControls)} 
                        className={`h-10 w-10 flex-shrink-0 flex items-center justify-center rounded border ${showManualControls ? 'bg-primary text-bg-secondary border-primary' : 'bg-surface border-border-color hover:bg-bg-primary'}`}
                        title="Toggle Manual Search Controls & Filters"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
                    </button>
                </div>

                {/* Advanced Filters Drawer - Explicitly VISIBLE when toggled */}
                {showManualControls && searchMode === 'smart' && (
                    <div className="grid grid-cols-4 gap-4 p-3 bg-surface rounded border border-border-color text-xs animate-fade-in mt-2 shadow-lg relative z-20">
                        <div className="flex flex-col">
                            <label className="font-bold mb-1 text-text-secondary">Stage</label>
                            <select value={manualStage} onChange={e => setManualStage(e.target.value)} className="p-2 border rounded bg-bg-secondary">
                                <option value="All">Any Stage</option>
                                <option value="Planning">Planning Apps</option>
                                <option value="Tenders">Tenders</option>
                                <option value="On-Site">On-Site</option>
                            </select>
                        </div>
                        <div className="flex flex-col">
                            <label className="font-bold mb-1 text-text-secondary">Sector</label>
                            <select value={manualSector} onChange={e => setManualSector(e.target.value)} className="p-2 border rounded bg-bg-secondary">
                                <option value="All">All Sectors</option>
                                <option value="Social Housing">Social Housing (Public)</option>
                                <option value="Private">Private Development</option>
                            </select>
                        </div>
                        <div className="flex flex-col">
                            <label className="font-bold mb-1 text-text-secondary">Quantity</label>
                            <input type="number" value={manualQuantity} onChange={e => setManualQuantity(e.target.value)} className="p-2 border rounded bg-bg-secondary" min="1" max="100" />
                        </div>
                        <div className="flex flex-col justify-end">
                            <label className="flex items-center gap-2 cursor-pointer p-2 border rounded bg-bg-secondary hover:bg-bg-primary transition-colors">
                                <input type="checkbox" checked={enrichAfterFinding} onChange={e => setEnrichAfterFinding(e.target.checked)} />
                                <span className="font-bold">Auto-Enrich</span>
                            </label>
                        </div>
                    </div>
                )}
            </div>

            {/* 2. Main Layout */}
            <div className="flex-grow grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-0 min-h-0">
                
                {/* LEFT PANEL: Navigation */}
                <div className="border-r border-border-color bg-bg-secondary flex flex-col overflow-hidden">
                    {/* Quick Access */}
                    <div className="p-2 space-y-1 border-b border-border-color">
                        <p className="text-[10px] font-bold text-text-secondary uppercase px-2 mb-1">Library</p>
                        <button onClick={() => handleSelectSpecialView('favorites')} className={`w-full text-left px-3 py-2 rounded text-sm font-medium flex items-center gap-2 ${specialViewMode === 'favorites' ? 'bg-primary text-bg-secondary' : 'hover:bg-surface'}`} title="View your favorite leads">
                            <span className="text-yellow-500">★</span> Favorites ({favoriteLeads.length})
                        </button>
                        <button onClick={() => handleSelectSpecialView('all_leads')} className={`w-full text-left px-3 py-2 rounded text-sm font-medium flex items-center gap-2 ${specialViewMode === 'all_leads' ? 'bg-primary text-bg-secondary' : 'hover:bg-surface'}`} title="View all leads in the current market">
                            <span className="text-blue-400">📂</span> All Leads ({allMarketLeads.length})
                        </button>
                    </div>

                    {/* Job Lists Tabs */}
                    <div className="flex border-b border-border-color">
                        <button onClick={() => setSidebarTab('active')} className={`flex-1 py-2 text-[10px] font-bold uppercase ${sidebarTab === 'active' ? 'border-b-2 border-primary text-primary' : 'text-text-secondary'}`} title="Active Searches">Active</button>
                        <button onClick={() => setSidebarTab('history')} className={`flex-1 py-2 text-[10px] font-bold uppercase ${sidebarTab === 'history' ? 'border-b-2 border-primary text-primary' : 'text-text-secondary'}`} title="Saved Searches">History</button>
                        <button onClick={() => setSidebarTab('custom')} className={`flex-1 py-2 text-[10px] font-bold uppercase ${sidebarTab === 'custom' ? 'border-b-2 border-primary text-primary' : 'text-text-secondary'}`} title="Custom Groups">Custom</button>
                    </div>

                    {/* Job List Content */}
                    <div className="flex-grow overflow-y-auto p-2">
                        {sidebarTab === 'active' && renderJobList(filteredActiveSearches, false)}
                        {sidebarTab === 'history' && renderJobList(filteredSavedLeads, true)}
                        {sidebarTab === 'custom' && renderJobList(customGroups, true)}
                    </div>
                </div>

                {/* RIGHT PANEL: Content View */}
                <div className="bg-bg-primary overflow-y-auto p-4">
                    {/* View Header */}
                    <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                        <div>
                            <h2 className="text-xl font-bold text-primary m-0 p-0 border-none">
                                {isGlobalSearchActive ? `Search Results: "${globalLeadSearchQuery}"` : 
                                 specialViewMode === 'favorites' ? 'Favorite Leads' : 
                                 specialViewMode === 'all_leads' ? 'All Market Leads' : 
                                 selectedLeadIntelJob ? selectedLeadIntelJob.location : 'Lead Intelligence'}
                            </h2>
                            <div className="flex items-center gap-3 mt-1">
                                <p className="text-xs text-text-secondary">{filteredLeads.length} leads shown</p>
                                {selectedLeadIntelJob && !specialViewMode && (
                                    <div 
                                        className={`text-[10px] px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer ${selectedLeadIntelJob.status === 'running' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}
                                        onClick={(e) => {
                                             if(selectedLeadIntelJob.status === 'running') {
                                                 e.stopPropagation();
                                                 handleForceCompleteJob(selectedLeadIntelJob.id);
                                             }
                                        }}
                                        title={selectedLeadIntelJob.status === 'running' ? "Click to force complete if stuck" : ""}
                                    >
                                        {selectedLeadIntelJob.status === 'running' ? 'Job Running...' : 'Completed'}
                                        {selectedLeadIntelJob.status === 'running' && <span className="font-bold ml-1 hover:text-red-500">×</span>}
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        {/* Header Actions */}
                        <div className="flex gap-2 items-center">
                            <div className="flex items-center gap-2 mr-4">
                                <input 
                                    type="checkbox" 
                                    id="selectAll"
                                    checked={filteredLeads.length > 0 && selectedLeadsForBulk.length === filteredLeads.length} 
                                    onChange={handleSelectAll}
                                    className="w-4 h-4 text-primary rounded focus:ring-primary cursor-pointer"
                                    title="Select all visible leads"
                                />
                                <label htmlFor="selectAll" className="text-sm text-text-secondary cursor-pointer select-none">Select All</label>
                            </div>

                            {/* ALWAYS SHOW MAP/CREATE/ENRICH BUTTONS IF LEADS EXIST */}
                            {filteredLeads.length > 0 && (
                                <>
                                    <button 
                                        className="btn sm bg-white border border-border-color hover:bg-bg-secondary text-text-primary" 
                                        onClick={() => {
                                            if (selectedLeadIntelJob) {
                                                setMapTargetJob(selectedLeadIntelJob);
                                            } else {
                                                // Ad-hoc job for map
                                                setMapTargetJob({
                                                    id: 'temp_map_view',
                                                    userId: currentUser?.uid || '',
                                                    location: 'Current View',
                                                    leads: filteredLeads,
                                                    status: 'complete',
                                                    error: null,
                                                    findMoreCount: 0,
                                                    market: leadMarket
                                                });
                                            }
                                        }}
                                        title="View all visible leads on map"
                                    >
                                        🗺️ Map View
                                    </button>

                                    <button 
                                        className="btn sm primary" 
                                        onClick={async () => {
                                            const groupName = await showModal({ type: 'prompt', title: 'Group Name', message: `Save ${filteredLeads.length} leads as a new group:`, placeholder: 'e.g. My Search Results' });
                                            if (groupName && typeof groupName === 'string') {
                                                await createCustomLeadGroup(groupName, filteredLeads.map(l => l.id));
                                                setSidebarTab('custom');
                                            }
                                        }}
                                        title="Save current results as a custom group"
                                    >
                                        📁 Create Group
                                    </button>

                                    <button 
                                        className="btn sm bg-white border border-border-color hover:bg-bg-secondary text-text-primary" 
                                        onClick={() => {
                                            if (selectedLeadIntelJob) {
                                                enrichJobContacts(selectedLeadIntelJob.id);
                                            } else {
                                                // Bulk enrich specific IDs for ad-hoc list
                                                verifyAndEnrichLeads(filteredLeads.map(l => l.id));
                                            }
                                        }} 
                                        title="Run Enrichment on all visible leads"
                                    >
                                        ⚡ Enrich Group
                                    </button>
                                </>
                            )}
                            
                            {/* Save Search - Only for Active Jobs */}
                            {selectedLeadIntelJob && sidebarTab === 'active' && !specialViewMode && (
                                <button 
                                    className="btn sm green" 
                                    onClick={() => handleSaveJob(selectedLeadIntelJob)}
                                    title="Save this search to History"
                                >
                                    💾 Save Search
                                </button>
                            )}
                            
                            <button className={`btn sm ${isCompactView ? 'primary' : 'tertiary'}`} onClick={() => setIsCompactView(!isCompactView)} title="Toggle Compact View">≡</button>
                        </div>
                    </div>

                    {/* Bulk Actions Bar (Only if leads selected) */}
                    {selectedLeadsForBulk.length > 0 && (
                        <div className="sticky top-0 z-20 bg-surface p-2 rounded-lg border border-border-color shadow-sm mb-4 flex items-center gap-2 flex-wrap animate-fade-in border-2 border-blue-500/20">
                            <span className="text-xs font-bold mr-2 bg-primary text-bg-secondary px-2 py-1 rounded">{selectedLeadsForBulk.length} Selected</span>
                            <div className="h-4 w-[1px] bg-border-color mx-1"></div>
                            
                            {/* CRITICAL: PRIMARY BULK ACTIONS */}
                            <button onClick={() => handleBulkAction('createGroup')} className="btn sm primary py-1 px-3 text-xs shadow-sm hover:brightness-110" title="Save selected leads as a new custom group">
                                📁 Create Group
                            </button>
                            <button onClick={() => handleBulkAction('mapSelected')} className="btn sm secondary py-1 px-3 text-xs shadow-sm hover:brightness-110" title="View selected leads on map">
                                🗺️ Map Selected
                            </button>

                            <div className="h-4 w-[1px] bg-border-color mx-1"></div>

                            <button onClick={() => handleBulkAction('printGroup')} className="btn sm py-1 px-3 text-xs border border-border-color bg-white hover:bg-bg-secondary" title="Print a dossier for selected leads">
                                🖨️ Print Group
                            </button>
                            <button onClick={() => handleBulkAction('fullEnrichment')} className="btn green sm py-1 px-3 text-xs" title="Run AI deep enrichment">
                                ⚡ Enrich
                            </button>
                            <button onClick={() => handleBulkAction('snapHunter')} className="btn sm py-1 px-3 text-xs border border-border-color bg-white hover:bg-bg-secondary" title="Find plan images">
                                📷 Snap Hunter
                            </button>
                            <button onClick={() => handleBulkAction('extractMaterials')} className="btn sm py-1 px-3 text-xs border border-border-color bg-white hover:bg-bg-secondary" title="Extract materials">
                                🏗️ Materials
                            </button>
                            <button onClick={() => handleBulkAction('economicCheck')} className="btn sm py-1 px-3 text-xs border border-border-color bg-white hover:bg-bg-secondary" title="Run economic health check">
                                💰 Econ Check
                            </button>
                            <button onClick={() => handleBulkAction('forensicVerify')} className="btn sm py-1 px-3 text-xs border border-border-color bg-white hover:bg-bg-secondary" title="Verify status with AI">
                                🕵️ Verify Status
                            </button>
                            <button onClick={() => handleBulkAction('verifyAllContacts')} className="btn sm py-1 px-3 text-xs border border-border-color bg-white hover:bg-bg-secondary" title="Verify contacts">
                                📞 Verify Contacts
                            </button>
                            <button onClick={() => handleBulkAction('bulkStrategy')} className="btn sm py-1 px-3 text-xs border border-border-color bg-white hover:bg-bg-secondary" title="Generate sales strategies">
                                🎯 Strategy
                            </button>
                            <button onClick={() => handleBulkAction('exportXlsx')} className="btn sm py-1 px-3 text-xs border border-border-color bg-white hover:bg-bg-secondary" title="Export to Excel">
                                📥 Export
                            </button>
                            
                            <div className="h-4 w-[1px] bg-border-color mx-1"></div>
                            <button onClick={() => handleBulkAction('delete')} className="btn red sm py-1 px-3 text-xs" title="Delete selected">
                                Delete
                            </button>
                            <button onClick={() => setSelectedLeadsForBulk([])} className="btn tertiary sm py-1 px-3 text-xs ml-auto" title="Clear selection">
                                Clear
                            </button>
                        </div>
                    )}

                    {/* Leads Grid */}
                    {filteredLeads.length > 0 ? (
                        <div className="masonry-3-col pb-8">
                            {paginatedLeads.map(lead => (
                                <LeadCard 
                                    key={lead.id} 
                                    lead={lead} 
                                    onUpdate={(id, u) => updateLeadInJob(findParentJob(id).job?.id || '', id, u)}
                                    onDelete={deleteLead}
                                    onGenerateStrategy={generateLeadStrategy}
                                    onGenerateActionPlan={generateLeadActionPlan}
                                    onGenerateDeepStrategy={generateDeepStrategy}
                                    onPrint={handlePrintLead}
                                    onUpdateLeadInfo={updateLeadInfo}
                                    onCheckForUpdates={checkLeadForUpdates}
                                    onVerifyAndEnrich={verifyAndEnrichLeads}
                                    onVerifyContact={verifyLeadContact}
                                    isJobRunning={isAiJobRunning}
                                    showModal={showModal}
                                    showCheckbox={true}
                                    isSelected={selectedLeadsForBulk.includes(lead.id)}
                                    onSelectionChange={(id, sel) => setSelectedLeadsForBulk(prev => sel ? [...prev, id] : prev.filter(x => x !== id))}
                                    leadMarket={lead.market || 'UK'}
                                    onDeleteContact={deleteLeadContact}
                                    onManuallyVerifyContact={manuallyVerifyContact}
                                    isCompactView={isCompactView}
                                    onFindLinkedInContacts={findAndEnrichLinkedInContacts}
                                    onDraftEmail={handleDraftEmail}
                                    handleNavigationRequest={handleNavigationRequest}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 opacity-50">
                            <div className="text-4xl mb-2">🔍</div>
                            <p className="text-sm">Select a job, group, or search for leads to begin.</p>
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex justify-center gap-2 py-4">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="btn sm tertiary">&larr; Prev</button>
                            <span className="text-xs flex items-center px-2 font-bold">{currentPage} / {totalPages}</span>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="btn sm tertiary">Next &rarr;</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LeadIntelView;
