
import type { StateCreator } from 'zustand';
import type { AppState } from '../store';
import type { UserAction, SupervisorReport, SupervisorFeedback, ViewName } from '@/types';
import { getDb } from '@/services/firebase';
import { generateSupervisorReport } from '@/services/ai/supervisorService';
import { sanitizeForFirestore } from '@/utils/firestoreUtils';

export interface SupervisorSlice {
    latestSupervisorReport: SupervisorReport | null;
    
    // Actions
    logUserAction: (actionType: UserAction['actionType'], details: Record<string, any>) => Promise<void>;
    submitSupervisorFeedback: (message: string, sentiment: SupervisorFeedback['sentiment']) => Promise<void>;
    checkAndRunSupervisorReport: () => Promise<void>;
    fetchLatestSupervisorReport: () => Promise<void>;
}

export const createSupervisorSlice: StateCreator<AppState, [], [], SupervisorSlice> = (set, get) => ({
    latestSupervisorReport: null,

    logUserAction: async (actionType, details) => {
        const { currentUser, activeView } = get();
        if (!currentUser) return;

        const action: UserAction = {
            id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            timestamp: Date.now(),
            userId: currentUser.uid,
            actionType,
            view: activeView,
            details
        };

        try {
            const db = getDb();
            // Fire and forget log to avoid blocking UI
            db.collection('supervisor_logs').add(sanitizeForFirestore(action)).catch(err => console.warn("Telemetry failed:", err));
        } catch (e) {
            // Silent fail
        }
    },

    submitSupervisorFeedback: async (message, sentiment) => {
        const { currentUser, activeView, logEvent, showModal } = get();
        if (!currentUser) return;

        const feedback: SupervisorFeedback = {
            id: `fb_${Date.now()}`,
            userId: currentUser.uid,
            timestamp: Date.now(),
            message,
            sentiment,
            contextView: activeView
        };

        try {
            const db = getDb();
            await db.collection('supervisor_feedback').add(sanitizeForFirestore(feedback));
            logEvent('SYS', `User feedback submitted: [${sentiment}] ${message.substring(0, 20)}...`);
            await showModal({ type: 'alert', title: 'Feedback Received', message: 'The Supervisor AI has received your input and will include it in the next evolution report.' });
        } catch (error) {
            logEvent('ERR', `Failed to submit feedback: ${error}`);
            await showModal({ type: 'alert', title: 'Error', message: 'Could not submit feedback.' });
        }
    },

    fetchLatestSupervisorReport: async () => {
        const db = getDb();
        try {
            const snapshot = await db.collection('supervisor_reports')
                .orderBy('generatedAt', 'desc')
                .limit(1)
                .get();
            
            if (!snapshot.empty) {
                set({ latestSupervisorReport: snapshot.docs[0].data() as SupervisorReport });
            }
        } catch (e) {
            console.warn("Could not fetch supervisor report", e);
        }
    },

    checkAndRunSupervisorReport: async () => {
        const { fetchLatestSupervisorReport, processAiJob, logEvent } = get();
        
        // 1. Get latest report to check date
        await fetchLatestSupervisorReport();
        const { latestSupervisorReport } = get();
        
        const now = Date.now();
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        
        // If no report exists, or it's older than 7 days, run a new one
        if (!latestSupervisorReport || (now - latestSupervisorReport.generatedAt > sevenDaysMs)) {
            logEvent('SYS', 'Supervisor Report is due. Initiating analysis...');
            
            await processAiJob(async (updateStatus) => {
                const db = getDb();
                updateStatus({ progress: 10, description: 'Fetching telemetry logs...' });
                
                // Fetch last 7 days of logs
                const startRange = now - sevenDaysMs;
                const logsSnap = await db.collection('supervisor_logs')
                    .where('timestamp', '>=', startRange)
                    .orderBy('timestamp', 'desc')
                    .limit(500) // Limit for context window safety
                    .get();
                
                const logs = logsSnap.docs.map(d => d.data() as UserAction);
                
                updateStatus({ progress: 30, description: 'Fetching user feedback...' });
                const feedbackSnap = await db.collection('supervisor_feedback')
                    .where('timestamp', '>=', startRange)
                    .orderBy('timestamp', 'desc')
                    .get();
                const feedback = feedbackSnap.docs.map(d => d.data() as SupervisorFeedback);

                updateStatus({ progress: 50, description: 'Supervisor AI Analyzing Patterns...' });
                const newReport = await generateSupervisorReport(logs, feedback);
                
                updateStatus({ progress: 90, description: 'Saving Evolution Report...' });
                await db.collection('supervisor_reports').add(newReport);
                
                set({ latestSupervisorReport: newReport });
                
            }, 'Supervisor AI: System Evolution Analysis');
        }
    }
});
