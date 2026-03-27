import { Type } from "@google/genai";
import { ai } from './common';
import { generateContentWithRetry as executeRequest } from '@/utils/apiUtils';
import { safeJsonParse } from '@/utils/jsonUtils';
import { useAppStore } from '@/store/store';

export const parseAutomationCommand = async (command: string): Promise<{ tasks: any[] }> => {
    const prompt = `You are an expert command parser for a sales intelligence application. Your task is to convert a user's natural language request into a structured JSON array of sequential tasks.

The user can request three main types of actions:
1.  **"find_leads"**: Search for new construction project leads.
2.  **"find_contacts"**: Find professionals (architects, roofers, etc.) using the Data Miner tool.
3.  **"find_leads_and_generate_report"**: A complex workflow that first finds leads, then automatically runs a full enrichment and reporting process on them.

Your response MUST be a single JSON object with a "tasks" key, which is an array of task objects, ordered by execution sequence.

**Task Object Schemas:**

1.  **Find Leads:**
    {
      "type": "find_leads",
      "query": "string (The full search query for the leads, e.g., '10 perfect leads for Tiverton')"
    }

2.  **Find Contacts (Data Miner):**
    {
      "type": "find_contacts",
      "contactType": "<'architects'|'roofers'|'builders'|'planners'|'developers'>",
      "location": "string",
      "quantity": "number | null"
    }
    
3. **Find Leads & Generate Full Report:**
    {
      "type": "find_leads_and_generate_report",
      "query": "string (The search query for the leads, e.g., '10 perfect leads for Tiverton')"
    }

**ADVANCED SCRIPTING SYNTAX:**
The user may use a more structured scripting format with "Search:" and "Focus:" keywords. You MUST parse this correctly.
-   \`Search: "Location"\` defines the location for the search.
-   \`Focus: keyword1, keyword2\` provides additional keywords to append to the search query for that location.
-   Each \`Search:\` block defines a new, separate task.
-   General instructions like "find 2 to 5 leads full enriched" apply to all subsequent \`Search:\` blocks.

**CRITICAL RULES:**
-   **SEQUENTIAL ORDER:** You MUST break down the user's command into a sequence of tasks in the exact order they were mentioned.
-   **MULTI-LOCATION DETECTION:** For simple lists (e.g., "find leads in Plymouth, Exeter, and Launceston"), you MUST create a separate task object for EACH location.
-   **WORKFLOW DETECTION:** If the user mentions "full report", "enrich", or similar phrases after a lead search request, you MUST use the \`find_leads_and_generate_report\` task type.
-   **DATA MINER DETECTION:** If the user mentions a professional type (architect, roofer, etc.), it is a \`find_contacts\` task. Extract the quantity and location. If no quantity is specified for a contact search, default to 100.
-   **LEAD SEARCH DETECTION:** Any other request for "leads" is a simple \`find_leads\` task.
-   **ADVANCED SYNTAX PARSING:** If you detect the "Search:" and "Focus:" keywords, you MUST treat each \`Search:\` block as a distinct task. The final \`query\` for that task will be a combination of the general instruction, the location from \`Search:\`, and the keywords from \`Focus:\`.

**Examples:**
-   User: "40 leads for Cornwall and 100 roofers from plymouth"
    Your Output:
    {
      "tasks": [
        { "type": "find_leads", "query": "40 leads for Cornwall" },
        { "type": "find_contacts", "contactType": "roofers", "location": "plymouth", "quantity": 100 }
      ]
    }
-   User: "get me 2 perfect leads for tiverton, plymouth and exeter and full report"
    Your Output:
    {
      "tasks": [
        { "type": "find_leads_and_generate_report", "query": "2 perfect leads for tiverton" },
        { "type": "find_leads_and_generate_report", "query": "2 perfect leads for plymouth" },
        { "type": "find_leads_and_generate_report", "query": "2 perfect leads for exeter" }
      ]
    }
-   User: "find 2 to 5 leads full enriched and deepen strategy for Search: "Truro, Cornwall" Focus: Listed Buildings, Extensions, Roof Repairs Search: "Falmouth, Cornwall" Focus: Listed Buildings, Conservation Area projects"
    Your Output:
    {
      "tasks": [
        { "type": "find_leads_and_generate_report", "query": "2 to 5 leads for Truro, Cornwall focusing on Listed Buildings, Extensions, Roof Repairs" },
        { "type": "find_leads_and_generate_report", "query": "2 to 5 leads for Falmouth, Cornwall focusing on Listed Buildings, Conservation Area projects" }
      ]
    }

Now, parse the following user command: "${command}"`;

    try {
        const { activeModel } = useAppStore.getState();
        const response = await executeRequest(ai, {
            model: activeModel,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
            }
        });
        return safeJsonParse(response.text, { tasks: [] });
    } catch(e) {
        console.error("Failed to parse automation command:", e);
        return { tasks: [] };
    }
};