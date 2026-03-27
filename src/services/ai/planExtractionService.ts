
import { getDb } from '@/services/firebase';
import type { Lead, PlanExtractionJob } from '@/types';
import firebase from 'firebase/compat/app';

const WORKER_URL = "https://extract-plan-worker-994467676155.europe-west1.run.app";

/**
 * Initiates a Cloud Extraction Job by writing to Firestore.
 * This triggers the backend Cloud Function/Run container (external) to process the URL.
 * 
 * @param leadId The ID of the lead to extract plans for.
 * @param planningUrl The URL of the planning application.
 * @param userId The ID of the user requesting the extraction.
 * @returns The Job ID.
 */
export const runCloudPlanExtraction = async (leadId: string, planningUrl: string, userId: string): Promise<string> => {
    const db = getDb();
    
    try {
        // 1. Create the Job Document in Firestore (Trigger watches this)
        const jobData: Omit<PlanExtractionJob, 'id'> = {
            leadId,
            userId,
            planningUrl,
            council: 'Unknown',
            status: 'queued', // <--- Important: Initial state for Eventarc trigger
            createdAt: firebase.firestore.FieldValue.serverTimestamp() as firebase.firestore.Timestamp,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp() as firebase.firestore.Timestamp,
        };

        const jobRef = await db.collection('planExtractionJobs').add(jobData);
        console.log(`Job created in DB: ${jobRef.id}`);

        // 2. "The Manual Kick" - Wake up the worker immediately (Bypasses Trigger latency)
        // We do not await this; fire and forget.
        fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: jobRef.id })
        }).catch(err => console.warn("Manual worker kick failed (Eventarc will handle it):", err));

        return jobRef.id;
    } catch (error) {
        console.error("Failed to start extraction:", error);
        throw error;
    }
};

// Also export as initiatePlanExtraction to match existing imports, acting as a wrapper
export const initiatePlanExtraction = async (lead: Lead, userId: string): Promise<string> => {
    if (!lead.planningUrl) throw new Error("Lead has no planning URL.");
    return runCloudPlanExtraction(lead.id, lead.planningUrl, userId);
};

/**
 * Listens to a specific extraction job and resolves when it is complete or fails.
 * 
 * @param jobId The Firestore Document ID of the job.
 * @param onUpdate Callback to report status back to the UI.
 * @returns A promise resolving with the extraction result.
 */
export const monitorExtractionJob = (
    jobId: string, 
    onUpdate: (status: string, progress: number) => void
): Promise<PlanExtractionJob['result']> => {
    return new Promise((resolve, reject) => {
        const db = getDb();
        let lastStatus = 'initializing';
        const startTime = Date.now();
        let processingStartTime = 0;
        let timerInterval: any = null;

        // Cleanup helper
        const cleanup = () => {
            if (timerInterval) clearInterval(timerInterval);
            unsubscribe();
        };

        // Interval to update UI message and handle stuck states
        timerInterval = setInterval(() => {
            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            
            if (lastStatus === 'queued') {
                // Dynamic Status Messaging
                let progress = 20;
                let msg = `Queued (${elapsedSeconds}s)...`;

                if (elapsedSeconds > 60) {
                    msg = `Heavy load on worker (${elapsedSeconds}s)...`;
                    progress = 28;
                } else if (elapsedSeconds > 30) {
                    msg = `Still queuing, cold start (${elapsedSeconds}s)...`;
                    progress = 25;
                } else if (elapsedSeconds > 10) {
                    msg = `Waking up Cloud Worker (Cold Start ${elapsedSeconds}s)...`;
                    progress = 20 + Math.floor((elapsedSeconds - 10) / 5); 
                }

                onUpdate(msg, Math.min(29, progress));

            } else if (lastStatus === 'processing') {
                 if (processingStartTime === 0) processingStartTime = Date.now();
                 const procSeconds = Math.floor((Date.now() - processingStartTime) / 1000);
                 
                 const fakeProgress = Math.min(90, 30 + Math.floor(procSeconds * 1.5));
                 onUpdate(`Processing plans (${elapsedSeconds}s)...`, fakeProgress);
            }
        }, 1000);

        const unsubscribe = db.collection('planExtractionJobs').doc(jobId)
            .onSnapshot((doc) => {
                const job = doc.data() as PlanExtractionJob | undefined;
                
                if (!job) {
                    cleanup();
                    reject(new Error("Job document disappeared."));
                    return;
                }

                lastStatus = job.status;

                if (job.status === 'complete' && job.result) {
                    cleanup();
                    onUpdate('Complete', 100);
                    resolve(job.result);
                } else if (job.status === 'error') {
                    cleanup();
                    reject(new Error(job.error || "Extraction failed on backend."));
                } else if (job.status === 'processing') {
                    // Update immediately on transition to avoid lag
                    if (processingStartTime === 0) processingStartTime = Date.now();
                    onUpdate('Processing (Cloud Worker)...', 30);
                } else if (job.status === 'queued') {
                    if (Date.now() - startTime < 2000) {
                        onUpdate('Queued...', 20);
                    }
                } else {
                    onUpdate('Initializing...', 10);
                }
            }, (error) => {
                cleanup();
                reject(error);
            });
    });
};
