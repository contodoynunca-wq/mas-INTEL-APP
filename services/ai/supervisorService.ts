
import { ai } from './common';
import { generateContentWithRetry as executeRequest } from '@/utils/apiUtils';
import { safeJsonParse } from '@/utils/jsonUtils';
import type { UserAction, SupervisorFeedback, SupervisorReport } from '@/types';

export const generateSupervisorReport = async (
    logs: UserAction[],
    feedback: SupervisorFeedback[]
): Promise<SupervisorReport> => {
    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

    const prompt = `
    ROLE: You are the "Supervisor AI" (Project Overwatch). You oversee a Lead Generation application.
    TASK: Analyze the provided telemetry logs (user actions) and manual user feedback from the last 7 days.
    GOAL: Generate a critical "System Evolution Report" that identifies behavioral patterns, friction points, and opportunities for automation.

    **INPUT DATA:**
    1. **Telemetry Logs (Sample):** ${JSON.stringify(logs.slice(0, 200), null, 2)} ... (truncated for efficiency)
    2. **User Feedback:** ${JSON.stringify(feedback, null, 2)}

    **ANALYSIS PROTOCOLS:**
    1. **Pattern Recognition:** Look for repetitive sequences. (e.g., "User searches for 'Plymouth' then always filters by 'On-Site'").
    2. **Friction Detection:** Look for high rates of 'DELETE_LEAD'. Analyze the 'details' field to see WHY they are deleting (e.g., "Wrong Status", "Duplicate").
    3. **Sentiment Analysis:** Read the user feedback. Are they frustrated? Happy? What specific feature are they asking for?
    4. **Efficiency:** Are users navigating back and forth excessively?

    **OUTPUT FORMAT (JSON):**
    You must return a single JSON object matching the following schema:
    {
        "generatedAt": ${now},
        "periodStart": ${sevenDaysAgo},
        "periodEnd": ${now},
        "insights": {
            "usagePatterns": ["string", "string"],
            "frictionPoints": ["string", "string"],
            "automationOpportunities": ["string", "string"],
            "systemHealth": "string (e.g. 'Optimal', 'High Friction', 'User Frustrated')"
        },
        "recommendations": [
            "Actionable tip 1 for the developer (e.g. 'Refactor LeadCard to show Status prominently')",
            "Actionable tip 2 for automation (e.g. 'Auto-archive leads older than 2 years')"
        ],
        "rawSummary": "A markdown formatted executive summary of the week. Use bolding and bullet points. Be professional but authoritative as a Supervisor."
    }
    `;

    try {
        const response = await executeRequest(ai, {
            model: 'gemini-3.1-pro-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        const report = safeJsonParse<SupervisorReport>(response.text, {
            id: `rep_${now}`,
            generatedAt: now,
            periodStart: sevenDaysAgo,
            periodEnd: now,
            insights: { usagePatterns: [], frictionPoints: [], automationOpportunities: [], systemHealth: 'Unknown' },
            recommendations: [],
            rawSummary: "Analysis failed."
        });
        
        report.id = `rep_${now}`; // Ensure ID is set
        return report;

    } catch (error) {
        console.error("Supervisor Analysis Failed", error);
        throw error;
    }
};
