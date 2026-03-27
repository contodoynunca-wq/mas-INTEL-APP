
import React, { FC, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '@/store/store';
import { getAuth, getDb, firebaseInitializationError } from '@/src/services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { User } from '@/types';

import Sidebar from '@/components/common/Sidebar';
import AuthScreen from '@/views/auth/AuthScreen';
import BypassAuthScreen from '@/views/auth/BypassAuthScreen';
import DashboardView from '@/views/main/DashboardView';
import NewQuoteView from '@/views/main/NewQuoteView';
import LeadIntelView from '@/views/intelligence/LeadIntelView';
import MarketTrendsView from '@/views/intelligence/MarketTrendsView';
import DataMinerView from '@/views/intelligence/DataMinerView';
import PriceComparisonView from '@/views/admin/PriceComparisonView';
import { ContactsView } from '@/views/main/ContactsView';
import AiToolsView from '@/views/intelligence/AiToolsView';
import ProductsView from '@/views/admin/ProductsView';
import AdminView from '@/views/admin/AdminView';
import CampaignsView from '@/views/main/CampaignsView';
import IntelligentSalesHubView from '@/views/intelligence/IntelligentSalesHubView';
import SalesIntelCenterView from '@/views/intelligence/SalesIntelCenterView';
import LeadDossierView from '@/views/intelligence/LeadDossierView';
import SupervisorView from '@/views/admin/SupervisorView';
import VisualizerView from '@/views/intelligence/VisualizerView';
import RoofingEstimatorView from '@/views/main/RoofingEstimatorView';

import Monitor from '@/components/system/Monitor';
import ProcessMonitor from '@/components/system/ProcessMonitor';
import Modal from '@/components/common/Modal';
import { SendToPartnerModal } from '@/components/common/SendToPartnerModal';
import SupervisorFeedbackModal from '@/components/common/SupervisorFeedbackModal';

const App: FC = () => {
    // State selectors: Each piece of state is selected individually for performance.
    const activeView = useAppStore(state => state.activeView);
    const currentUser = useAppStore(state => state.currentUser);
    const isMonitorOpen = useAppStore(state => state.isMonitorOpen);
    const isProcessMonitorOpen = useAppStore(state => state.isProcessMonitorOpen);
    const logs = useAppStore(state => state.logs);
    const apiCallCount = useAppStore(state => state.apiCallCount);
    const modal = useAppStore(state => state.modal);
    const processJobs = useAppStore(state => state.processJobs);
    const theme = useAppStore(state => state.theme);
    const isAiJobRunning = useAppStore(state => state.isAiJobRunning);
    const sendToPartnerLead = useAppStore(state => state.sendToPartnerLead);
    const planReaderState = useAppStore(state => state.planReaderState); // Selector for reset check

    // Actions: Grabbed once via getState() as they are stable and don't cause re-renders.
    const {
        setCurrentUser,
        closeModal,
        toggleMonitor,
        toggleProcessMonitor,
        clearCompletedJobs,
        printLogs,
        logEvent,
        closeSendToPartnerModal,
        showModal,
        checkAndRunSupervisorReport,
        setPlanReaderState
    } = useAppStore.getState();

    const wakeLockRef = useRef<WakeLockSentinel | null>(null);

    // Safety Check: Reset Plan Reader state on mount if it was left running/stuck
    useEffect(() => {
        if (planReaderState.analysisState === 'running') {
            console.warn("Resetting stuck Plan Reader state on load.");
            setPlanReaderState({ analysisState: 'idle', error: '' });
        }
    }, []);

    // Supervisor AI: Check on load
    useEffect(() => {
        if (currentUser) {
            checkAndRunSupervisorReport();
        }
    }, [currentUser]);

    // Effect to keep the screen awake during long AI jobs
    useEffect(() => {
        if (!('wakeLock' in navigator)) {
            // Silently ignore wake lock support missing to avoid user alarm
            return;
        }

        const requestWakeLock = async () => {
            if (wakeLockRef.current || document.visibilityState !== 'visible') return;
            try {
                const wakeLock = await navigator.wakeLock.request('screen');
                wakeLockRef.current = wakeLock;
                // Only log as debug or not at all to avoid clutter
                console.debug('Screen wake lock acquired.');

                wakeLock.addEventListener('release', () => {
                    wakeLockRef.current = null;
                });
            } catch (err: any) {
                // Silently catch wake lock errors (like permission denied or policy blocked)
                // These are non-critical and should not alarm the user via logs
                console.debug(`Wake Lock request denied/failed: ${err.name}, ${err.message}`);
            }
        };

        const releaseWakeLock = async () => {
            if (wakeLockRef.current) {
                try {
                    await wakeLockRef.current.release();
                } catch (err: any) {
                    console.debug(`Wake Lock release failed: ${err.name}, ${err.message}`);
                }
            }
        };

        if (isAiJobRunning) {
            requestWakeLock();
        } else {
            releaseWakeLock();
        }

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && isAiJobRunning) {
                requestWakeLock();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            releaseWakeLock();
        };
    }, [isAiJobRunning]);
    

    // Centralized Firebase initialization and authentication logic
    useEffect(() => {
        if (firebaseInitializationError) {
            logEvent('ERR', `Firebase critical init error: ${firebaseInitializationError}. Auth flow halted.`);
            return;
        }
        
        const auth = getAuth();
        const db = getDb();

        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            if (user) {
                const userDocRef = doc(db, 'users', user.uid);
                const userDoc = await getDoc(userDocRef);
                if (userDoc.exists()) {
                    const userData = userDoc.data() as Omit<User, 'uid' | 'email' | 'displayName'>;
                    if (userData.status === 'approved') {
                        setCurrentUser({
                            uid: user.uid,
                            email: user.email,
                            displayName: user.displayName,
                            ...userData
                        });
                    } else {
                        auth.signOut();
                        setCurrentUser(null);
                        showModal({ type: 'alert', title: 'Account Not Approved', message: 'Your account is pending administrator approval.' });
                    }
                } else {
                    auth.signOut();
                    setCurrentUser(null);
                }
            } else {
                setCurrentUser(null);
            }
        });
        return unsubscribe;
    }, [setCurrentUser, showModal, logEvent]);

    useEffect(() => {
        document.documentElement.className = theme;
    }, [theme]);
    
    const CurrentView = useMemo(() => {
        if (!currentUser) return AuthScreen;

        switch (activeView) {
            case 'dashboard': return DashboardView;
            case 'intelligent-sales-hub': return IntelligentSalesHubView;
            case 'sales-intel-center': return SalesIntelCenterView;
            case 'new-quote': return NewQuoteView;
            case 'lead-intel': return LeadIntelView;
            case 'market-trends': return MarketTrendsView;
            case 'data-miner': return DataMinerView;
            case 'price-comparison': return PriceComparisonView;
            case 'contacts': return ContactsView;
            case 'ai-tools': return AiToolsView;
            case 'visualizer': return VisualizerView;
            case 'roofing-estimator': return RoofingEstimatorView;
            case 'products': return ProductsView;
            case 'admin': return AdminView;
            case 'campaigns': return CampaignsView;
            case 'lead-dossier': return LeadDossierView;
            case 'supervisor': return SupervisorView;
            default: return DashboardView;
        }
    }, [activeView, currentUser]);

    if (firebaseInitializationError && !currentUser) {
        return <BypassAuthScreen error={firebaseInitializationError} />;
    }

    if (!currentUser) {
        return <AuthScreen />;
    }

    if (currentUser.status !== 'approved') {
        const auth = getAuth();
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="auth-container text-center">
                    <img src="https://i.imgur.com/0Yw1FxJ.png" alt="Mont Azul Logo" className="h-28 w-28 mx-auto mb-4"/>
                    <h1 className="text-2xl font-bold mb-2">Account Pending Approval</h1>
                    <p className="text-text-secondary">Your account is awaiting approval from an administrator. Please check back later.</p>
                    <button onClick={() => auth.signOut()} className="btn secondary mt-6">Logout</button>
                </div>
            </div>
        );
    }

    // Determine if the view needs padding or handles its own layout
    const isFullHeightView = activeView === 'lead-intel' || activeView === 'lead-dossier' || activeView === 'sales-intel-center';

    return (
        <div className="app-container">
            <Sidebar />
            <div className="flex-grow flex flex-col min-w-0 h-screen">
                <main className={`main-content flex-grow min-h-0 ${isFullHeightView ? '!p-0' : 'p-6'}`}>
                    <CurrentView />
                </main>
            </div>

            {isMonitorOpen && <Monitor logs={logs} onClose={toggleMonitor} apiCallCount={apiCallCount} onPrint={printLogs} />}
            {isProcessMonitorOpen && <ProcessMonitor jobs={processJobs} onClose={toggleProcessMonitor} onClearCompleted={clearCompletedJobs} />}
            {modal?.type !== 'SupervisorFeedback' && modal && <Modal {...modal} onClose={closeModal} />}
            {modal?.type === 'SupervisorFeedback' && <SupervisorFeedbackModal onClose={() => closeModal(null)} />}
            {sendToPartnerLead && <SendToPartnerModal lead={sendToPartnerLead} onClose={closeSendToPartnerModal} />}
        </div>
    );
};

export default App;
