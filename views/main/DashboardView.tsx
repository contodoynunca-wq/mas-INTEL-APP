
import React, { FC, useMemo, useState, useEffect } from 'react';
import { useAppStore } from '../../store/store';
import ProjectDetailModal from '../../components/projects/ProjectDetailModal';
import DashboardNotepad from '../../components/dashboard/DashboardNotepad';
import Clock from '../../components/common/Clock';
import AutomationStation from '../../components/dashboard/AutomationStation';
import { Project, Lead } from '../../types';
import { getTodaysFocusLeads } from '@/services/ai/leadIntelService';
import TodaysFocus from '@/components/dashboard/TodaysFocus';
import { safeTimestampToDate } from '../../utils/firestoreUtils';

const DashboardView: FC = () => {
    // Performance Optimization: Use granular selectors to only subscribe to necessary state changes.
    const projectPipeline = useAppStore(state => state.projectPipeline);
    const customerDirectory = useAppStore(state => state.customerDirectory);
    const allUsers = useAppStore(state => state.allUsers);
    const currentUser = useAppStore(state => state.currentUser);
    const savedLeads = useAppStore(state => state.savedLeads);
    const activeSearches = useAppStore(state => state.activeSearches);
    const sentItems = useAppStore(state => state.sentItems);
    const db = useAppStore(state => state.db);
    const { handleNavigationRequest, showModal, handleAutomationRequest, processAiJob } = useAppStore.getState();
    
    const [projectModalId, setProjectModalId] = useState<string | null>(null);
    const activeProject = useMemo(() => projectPipeline.find(p => p.id === projectModalId), [projectModalId, projectPipeline]);
    const [focusLeads, setFocusLeads] = useState<{ lead: Lead; justification: string }[]>([]);
    const [isLoadingFocus, setIsLoadingFocus] = useState(true);

    const allLeads = useMemo(() => {
        return [...activeSearches, ...savedLeads].flatMap(job => job.leads);
    }, [savedLeads, activeSearches]);

    useEffect(() => {
        const fetchFocusLeads = async () => {
            setIsLoadingFocus(true);
            try {
                // Get top 20 high-scored, non-dismissed, new leads to send for analysis
                const candidateLeads = allLeads
                    .filter(lead => !lead.isDismissed && lead.salesStage === 'New Leads')
                    .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
                    .slice(0, 20);

                if (candidateLeads.length > 0) {
                    const result = await getTodaysFocusLeads(candidateLeads);
                    const leadsWithData = result
                        .map(focus => ({
                            ...focus,
                            lead: allLeads.find(l => l.id === focus.leadId),
                        }))
                        .filter(item => item.lead) as { lead: Lead; justification: string }[];
                    setFocusLeads(leadsWithData);
                }
            } catch (error) {
                console.error("Failed to fetch today's focus leads:", error);
            } finally {
                setIsLoadingFocus(false);
            }
        };

        fetchFocusLeads();
    }, [allLeads]);

    const pinnedLeads = useMemo(() => {
        return allLeads.filter(lead => lead.isPinned).slice(0, 3);
    }, [allLeads]);

    const handleDelete = async (id: string) => {
        if (!db) return;
        const confirmed = await showModal({type: 'confirm', title: "Delete Project", message: "Are you sure?"});
        if (confirmed) {
            await db.collection("projects").doc(id).delete();
        }
    };
    
    const getCustomerDisplay = (project: Project) => {
        if (project.customerId) {
            const customer = customerDirectory.find(c => c.id === project.customerId);
            return customer?.company || customer?.contactName;
        }
        return project.customerName || 'N/A';
    };
    
    const getProjectSummaryText = (project: Project) => {
        const { roofArea, siteLocation } = project.projectSummary;
        let summaryParts = [];
        if (roofArea) summaryParts.push(`${roofArea}m² roof`);
        if (siteLocation) summaryParts.push(`in ${siteLocation}`);
        return summaryParts.join(' ');
    };

    return (
        <>
            {activeProject && <ProjectDetailModal project={activeProject} onClose={() => setProjectModalId(null)} />}
            <div className="dashboard-grid h-full">
                <div className="panel flex flex-col overflow-hidden">
                    <h2 className="flex-shrink-0">Project Pipeline</h2>
                    <div className="flex-grow overflow-y-auto">
                        {projectPipeline.length === 0 ? <p className="text-center p-8 text-text-secondary">No projects yet. Create one from the 'New Quote' page.</p> : projectPipeline.map(p => {
                            return (
                                <div key={p.id} className="project-card-grid">
                                    <div>
                                        <p className="font-semibold">{p.name}</p>
                                        <div className="text-sm text-text-secondary">{getCustomerDisplay(p)}</div>
                                        <div className="text-xs text-primary mt-1">{getProjectSummaryText(p)}</div>
                                    </div>
                                    <div><span className={`project-status-badge ${p.status === 'Won' ? 'bg-profit-bg text-profit-color' : p.status === 'Lost' ? 'bg-loss-bg text-loss-color' : 'bg-secondary/20 text-secondary'}`}>{p.status}</span></div>
                                    <div>{safeTimestampToDate(p.createdAt)?.toLocaleDateString() ?? 'N/A'}</div>
                                    <div className="flex gap-2">
                                        <button className="btn sm" onClick={() => setProjectModalId(p.id)}>View</button>
                                        <button className="btn red sm" onClick={() => handleDelete(p.id)}>Del</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="flex flex-col gap-8 overflow-y-auto">
                     <div className="panel">
                        <h2>Today's Focus</h2>
                        <TodaysFocus leads={focusLeads} isLoading={isLoadingFocus} />
                    </div>
                    <div className="panel">
                        <h2>Automation Station</h2>
                        <AutomationStation onAutomate={handleAutomationRequest} />
                    </div>
                    <DashboardNotepad />
                    <div className="panel">
                        <h2>Action Center</h2>
                        {(currentUser?.isAdmin && allUsers.some(u => u.status === 'pending')) ?
                            <><p>{allUsers.filter(u=>u.status==='pending').length} user(s) awaiting approval.</p><button className="btn secondary" onClick={() => handleNavigationRequest('admin')}>Review</button></> :
                            <p>No pending actions. ✅</p>
                        }
                        <Clock />
                    </div>
                    <div className="panel">
                        <h2>Pinned Favorite Leads</h2>
                        {pinnedLeads.length === 0 ? (
                            <p className="text-sm text-text-secondary">No leads pinned to dashboard. Go to Lead Intelligence → Favorites to pin one.</p>
                        ) : (
                            <div className="space-y-4">
                                {pinnedLeads.map(lead => (
                                    <div key={lead.id} className="p-2 bg-surface rounded-lg cursor-pointer hover:bg-bg-primary" onClick={() => handleNavigationRequest('lead-dossier', { lead })}>
                                        <p className="font-bold truncate">{lead.title}</p>
                                        <p className="text-xs text-text-secondary">{lead.projectStage} | Fit: {lead.slateFitScore}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                         <button className="btn w-full mt-4" onClick={() => handleNavigationRequest('lead-intel')}>Go to Lead Intelligence</button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default DashboardView;