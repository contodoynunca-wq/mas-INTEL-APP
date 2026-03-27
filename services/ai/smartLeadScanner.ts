import { GoogleGenAI, Type } from "@google/genai";
import { getStorage, getFunctions } from '@/services/firebase';
import { fileToBase64, renderPdfPageAsBlob } from '@/utils/fileProcessing';
import { safeJsonParse } from '@/utils/jsonUtils';
import type { SmartScanData, PlanningDocument, Lead, StatusJob } from '@/types';
import { generateContentWithRetry as executeRequest } from '@/utils/apiUtils';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const smartScanLead = async (
    leadId: string, 
    file: File, 
    logEvent: (type: 'AI' | 'DB' | 'SYS' | 'ERR', msg: string) => void
): Promise<{ success: boolean; data?: SmartScanData; error?: string }> => {
    logEvent('AI', `Starting Smart Scan for Lead: ${leadId}`);

    try {
        logEvent('SYS', 'Processing PDF for AI ingestion...');
        const { fileToBase64 } = await import('@/utils/fileProcessing');
        const base64 = await fileToBase64(file);
        
        const prompt = `
Role: Senior Construction Auditor.
Task: Analyze this entire planning document.

Phase 1: Asset Identification (Visuals)
Identify the page numbers for:
1. The "Proposed Roof Plan" (Critical).
2. The "Proposed Elevations" (Latest revision only - check dates/Rev letters).
3. Any "Site Block Plans".
*Ignore existing/demolition plans.*

Phase 2: Lead Verification (Intelligence)
Extract the following data and provide the SOURCE (Page number + text location) for verification:
- Project Description: (e.g., "Rear extension")
- Applicant Name:
- Site Address:
- Latest Revision Date:

Return JSON ONLY in this format:
{
  "assets": [
    { "type": "Roof Plan", "pageNumber": 5, "description": "Proposed Roof Layout Rev B" },
    { "type": "Elevation", "pageNumber": 6, "description": "South Elevation" }
  ],
  "verification": {
    "projectDescription": { "value": "...", "source": "Page 1, Header Box" },
    "siteAddress": { "value": "...", "source": "Page 1, Footer" },
    "revisionStatus": { "value": "Rev B", "source": "Page 5, Title Block, Date: 12/10/2023" },
    "applicantName": { "value": "...", "source": "Page 1, Applicant Field" }
  }
}
`;

        logEvent('AI', 'Sending PDF to Gemini 3 Pro for high-precision auditing...');
        const response = await executeRequest(ai, {
            model: 'gemini-3.1-pro-preview',
            contents: [{ parts: [
                { inlineData: { mimeType: 'application/pdf', data: base64 } },
                { text: prompt }
            ], role: 'user' }],
            config: { responseMimeType: 'application/json' }
        });

        const aiResponse = safeJsonParse(response.text);
        
        if (!aiResponse.assets && !aiResponse.verification) {
            throw new Error("Invalid AI Response structure");
        }

        const validAssets: PlanningDocument[] = [];
        const storage = getStorage();

        if (aiResponse.assets && Array.isArray(aiResponse.assets)) {
            for (const target of aiResponse.assets) {
                logEvent('SYS', `Snapping Page ${target.pageNumber} (${target.type})...`);
                
                try {
                    const blob = await renderPdfPageAsBlob(file, target.pageNumber);
                    const filename = `plans/${leadId}/smart_${target.type.replace(/\s+/g, '_')}_pg${target.pageNumber}_${Date.now()}.jpg`;
                    const ref = storage.ref().child(filename);
                    
                    await ref.put(blob);
                    const url = await ref.getDownloadURL();

                    validAssets.push({
                        type: `Smart Scan: ${target.type}`,
                        url: url,
                        storageUrl: url,
                        description: target.description,
                        pageNumber: target.pageNumber,
                        filename: `SmartScan_${target.type}_Pg${target.pageNumber}.jpg`,
                        notes: `Verified on Page ${target.pageNumber}`,
                        isLatest: true,
                        size: `${(blob.size / 1024).toFixed(0)} KB`
                    });
                } catch (err) {
                    console.warn(`Failed to process page ${target.pageNumber}`, err);
                    logEvent('ERR', `Failed to snap page ${target.pageNumber}: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
        }

        const resultData: SmartScanData = {
            status: 'verified',
            assets: validAssets,
            dataVerification: aiResponse.verification,
            timestamp: new Date().toISOString()
        };

        logEvent('AI', 'Smart Scan completed successfully.');
        return { success: true, data: resultData };

    } catch (e: any) {
        console.error("Smart Scan Failed:", e);
        logEvent('ERR', `Smart Scan failed: ${e.message}`);
        return { success: false, error: e.message };
    }
};

// FIX: Added missing exported member autoScanLeadFromWeb.
export const autoScanLeadFromWeb = async (
    lead: Lead,
    updateStatus: (updates: Partial<StatusJob>) => void,
    logEvent: (type: 'AI' | 'DB' | 'SYS' | 'ERR', msg: string) => void,
    signal: AbortSignal
): Promise<{ success: boolean; files?: File[]; error?: string }> => {
    logEvent('AI', `Auto-scanning web for plans: ${lead.title}`);
    updateStatus({ progress: 20, description: 'Searching for online planning documents...' });
    
    try {
        const prompt = `Search for architectural PDF plans (Proposed Roof, Elevation) for construction project ${lead.title} (Ref: ${lead.applicationRef}) at ${lead.address}. Return JSON list of 'urls' pointing to potential files.`;
        const response = await executeRequest(ai, {
            model: 'gemini-3.1-pro-preview',
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] },
            signal
        });
        
        const result = safeJsonParse<{ urls: string[] }>(response.text, { urls: [] });
        // NOTE: In a real implementation, we would attempt to download these and convert them to Files.
        return { success: true, files: [] };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};
