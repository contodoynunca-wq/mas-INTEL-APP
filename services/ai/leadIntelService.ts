
import { Type, GoogleGenAI } from "@google/genai";
import { ai } from './common';
import type { Lead, LeadMarket, LeadSearchCategory, StatusJob, DisqualifiedLead, StructuredSearchParams, PartnerPrepReport, LeadContact, PlanningDocument, ForensicResult, StrategicEmailDraft } from '@/types';
import { generateContentWithRetry as executeRequest } from '@/utils/apiUtils';
import { safeJsonParse } from '@/utils/jsonUtils';
import { transformLeadForUI } from '@/utils/firestoreUtils';
import firebase from 'firebase/compat/app';
import { getStorage } from '@/services/firebase';
import { getMultimodalEmbedding } from './embeddingService';

/**
 * Generates a multimodal embedding for a lead using its summary, address, and any available images.
 */
export const generateLeadEmbedding = async (
    ai: GoogleGenAI,
    lead: Lead
): Promise<number[]> => {
    const textToEmbed = `
        Title: ${lead.title}
        Address: ${lead.address}
        Summary: ${lead.summary}
        Project Type: ${lead.projectType}
        Project Stage: ${lead.projectStage}
        Slate Fit Score: ${lead.slateFitScore}
        Notes: ${lead.notes}
    `.trim();

    const contents: (string | { inlineData: { data: string, mimeType: string } })[] = [textToEmbed];

    // If we have a street view image, we can include it in the multimodal embedding
    if (lead.streetViewImageUrl) {
        try {
            const response = await fetch(lead.streetViewImageUrl);
            const blob = await response.blob();
            const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                reader.readAsDataURL(blob);
            });
            contents.push({
                inlineData: {
                    data: base64,
                    mimeType: blob.type || 'image/jpeg'
                }
            });
        } catch (e) {
            console.warn("Failed to fetch street view image for embedding", e);
        }
    }

    return getMultimodalEmbedding(ai, contents);
};

// --- HELPER: SAFE MERGE ---
const safeMerge = <T>(newValue: T, existingValue: T): T => {
  if (newValue === null || newValue === undefined || newValue === "") {
    return existingValue;
  }
  if (Array.isArray(newValue) && newValue.length === 0) {
    return existingValue;
  }
  return newValue;
};

// --- BATCH STRATEGY AGENT ---
export const generateBatchStrategies = async (
    leads: Lead[],
    market: LeadMarket
): Promise<Record<string, string>> => {
    // V57 Update: Use generic branding for non-UK, Mont Azul for UK
    const brandIdentity = market === 'UK' ? 'Mont Azul Slate' : 'Premium Spanish Natural Slate Consortium';
    
    // Define language map
    const LANGUAGE_MAP: Record<string, string> = {
        'UK': 'English (UK)',
        'Spain': 'Spanish (Español)',
        'France': 'French (Français)',
        'Germany': 'German (Deutsch)'
    };
    const targetLanguage = LANGUAGE_MAP[market] || 'English';

    const leadsInput = leads.map(l => ({
        id: l.id,
        title: l.title,
        stage: l.projectStage,
        materials: (l.materials || []).map(m => m.name).join(', ')
    }));

    const prompt = `
    Role: You are a Senior Construction Intelligence Analyst for ${brandIdentity}.
    Task: Create a concise, 3-point sales strategy for EACH of the following leads.
    TARGET LANGUAGE: ${targetLanguage} (You MUST write the response in ${targetLanguage}).

    **Input Leads:**
    ${JSON.stringify(leadsInput, null, 2)}

    **Instructions:**
    1. Analyze each lead's stage and materials.
    2. Generate a Markdown formatted strategy.
    3. Return a JSON object mapping lead IDs to their strategy string.

    **Output JSON Schema:**
    {
      "strategies": {
        "LEAD_ID_1": "### Strategy\n- Point 1\n- Point 2",
        "LEAD_ID_2": "..."
      }
    }
    `;

    try {
        const response = await executeRequest(ai, {
            model: 'gemini-3.1-pro-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        const result = safeJsonParse<{ strategies: Record<string, string> }>(response.text, { strategies: {} });
        return result.strategies || {};
    } catch (e) {
        console.error("Batch Strategy Generation Failed", e);
        return {};
    }
};

// --- SNAP HUNTER: HUNT & STABILIZE ---
export const findAndStabilizeLeadImages = async (
    lead: Lead,
    logEvent: (type: 'AI' | 'DB' | 'SYS' | 'ERR', message: string) => void
): Promise<PlanningDocument[]> => {
    logEvent('AI', `Starting Snap Hunt for: ${lead.title}`);

    // 1. HUNT: Ask AI for direct image URLs
    const prompt = `
    Role: Technical Research Assistant.
    Task: Find direct image URLs for architectural plans, elevations, or site layouts for this construction project.
    
    Project: "${lead.title}"
    Location: "${lead.address}"
    Council/Ref: "${lead.council || ''}" / "${lead.applicationRef || ''}"

    Instructions:
    1. Search for the planning application or developer marketing materials.
    2. Extract DIRECT URLs to images (ending in .jpg, .png, .webp) that show the building design.
    3. Prioritize "Proposed Elevations", "Roof Plans", or "Site Plans".
    4. IGNORE PDF links, we only want images that can be previewed.
    5. Return at least 3 relevant image URLs if possible.

    Output JSON:
    {
      "images": [
        { "url": "https://...", "description": "Proposed South Elevation" }
      ]
    }
    `;

    let candidateImages: { url: string; description: string }[] = [];
    
    try {
        const response = await executeRequest(ai, {
            model: 'gemini-3.1-pro-preview',
            contents: prompt,
            config: { 
                tools: [{ googleSearch: {} }] 
            }
        });
        const result = safeJsonParse<{ images: { url: string; description: string }[] }>(response.text, { images: [] });
        candidateImages = result.images || [];
        logEvent('AI', `Snap Hunt found ${candidateImages.length} potential images.`);
    } catch (e) {
        logEvent('ERR', `Snap Hunt AI search failed: ${e}`);
        return [];
    }

    if (candidateImages.length === 0) return [];

    // 2. STABILIZE: Proxy Download -> Firebase Upload
    const stableDocuments: PlanningDocument[] = [];
    const storage = getStorage();

    for (const img of candidateImages) {
        if (!img.url) continue;
        try {
            // Fetch via local proxy to bypass CORS/Hotlink protection
            const proxyUrl = `/api-proxy/fetch-image?url=${encodeURIComponent(img.url)}`;
            const response = await fetch(proxyUrl);
            
            if (!response.ok) {
                 logEvent('SYS', `Failed to fetch image via proxy: ${img.url}`);
                 continue;
            }

            const blob = await response.blob();
            if (blob.size < 5000) continue; // Skip tiny icons/spacers

            // Generate filename
            const ext = blob.type.split('/')[1] || 'jpg';
            const filename = `snap_${Date.now()}_${Math.floor(Math.random()*1000)}.${ext}`;
            const storageRef = storage.ref().child(`plans/${lead.id}/${filename}`);

            // Upload
            await storageRef.put(blob);
            const persistentUrl = await storageRef.getDownloadURL();

            stableDocuments.push({
                url: img.url, // Original source
                storageUrl: persistentUrl, // Permanent link
                type: "Plan Snapshot (Stabilized)",
                filename: img.description || "AI Discovered Image",
                size: `${(blob.size / 1024).toFixed(0)} KB`
            });

        } catch (error) {
            console.warn("Stabilization failed for:", img.url);
        }
    }

    logEvent('SYS', `Successfully stabilized ${stableDocuments.length} images.`);
    return stableDocuments;
};

// --- HELPER: IMAGE STABILIZATION (PROXY DOWNLOAD) ---
// Kept for compatibility with deepEnrichLeadsBatch, but essentially duplicates logic above
async function stabilizeAiImages(leadId: string, planImages: { url: string, description?: string }[]): Promise<PlanningDocument[]> {
    const stableDocuments: PlanningDocument[] = [];
    const storage = getStorage();

    for (const img of planImages) {
        if (!img.url) continue;
        try {
            // 1. Fetch via our server proxy to bypass CORS
            const proxyUrl = `/api-proxy/fetch-image?url=${encodeURIComponent(img.url)}`;
            const response = await fetch(proxyUrl);
            
            if (!response.ok) {
                 stableDocuments.push({ 
                     url: img.url, 
                     type: "Portal Link (Broken)", 
                     filename: img.description || 'Plan Image'
                 });
                 continue;
            }

            // 2. Get the blob
            const blob = await response.blob();

            // 3. Create a filename
            const filename = `ai_capture_${Date.now()}_${Math.floor(Math.random()*1000)}.jpg`;
            const storageRef = storage.ref().child(`plans/${leadId}/${filename}`);

            // 4. Upload to YOUR Firebase Storage
            await storageRef.put(blob);

            // 5. Get the persistent URL
            const persistentUrl = await storageRef.getDownloadURL();

            // 6. Push the SAFE object
            stableDocuments.push({
                url: img.url, // Keep original source for reference
                storageUrl: persistentUrl, // USE THIS for display
                type: "Plan Snapshot (AI Safe)",
                filename: img.description || filename,
                size: `${(blob.size / 1024).toFixed(0)} KB`
            });

        } catch (error) {
            console.error("Failed to stabilize image:", error);
            // Fallback: just link it
            stableDocuments.push({
                url: img.url,
                type: "Portal Link",
                filename: img.description || 'Plan Image'
            });
        }
    }
    return stableDocuments;
}

// --- FORENSIC VALUE AUDIT AGENT ---
export const evaluateProjectValueAndScope = async (lead: Lead): Promise<{ 
    correctedValue: string; 
    correctedScope: string; 
    reasoning: string;
    wasCorrectionNeeded: boolean;
}> => {
    const prompt = `
    Role: You are a Forensic Quantity Surveyor.
    Task: Audit the reported value of this project.
    
    **PROJECT CONTEXT:**
    - Title: "${lead.title}"
    - Current Reported Value: "${lead.projectValue || 'Unknown'}"
    - Current Reported Scope: "${lead.summary}"
    - Location: "${lead.address}"

    **INVESTIGATION PROTOCOL:**
    1. **Search for Funding:** Search for terms like "Capital Transformation Fund", "Levelling Up Fund", or "DfE Framework" associated with this project name.
    2. **Search for Main Contracts:** Look for "Contract Awarded to [Contractor]" news.
    3. **Scope vs Value Mismatch:**
       - If the title mentions "College", "School", "Housing Estate", or "Campus" but the value is <£1m, this is a CRITICAL ERROR (likely just a maintenance contract was scraped).
       - Find the *Real* Construction Value.

    **SPECIFIC CHECK FOR "ISLE OF WIGHT COLLEGE":**
    - If this is the IoW College project, check for the £32m+ DfE funding, not the £499k maintenance value.

    **OUTPUT JSON:**
    {
      "correctedValue": "string (e.g. '£33m', '£150k')",
      "correctedScope": "string (e.g. 'New Build Campus', 'Roof Repairs Only')",
      "reasoning": "string (e.g. 'Found DfE funding allocation of £32.8m. Original value was likely for a specific enabling works package.')",
      "wasCorrectionNeeded": boolean
    }
    `;

    try {
        const response = await executeRequest(ai, {
            model: 'gemini-3.1-pro-preview',
            contents: prompt,
            config: { 
                tools: [{ googleSearch: {} }]
            }
        });
        return safeJsonParse(response.text, { 
            correctedValue: lead.projectValue || 'Unknown', 
            correctedScope: lead.projectType, 
            reasoning: 'AI audit failed.', 
            wasCorrectionNeeded: false 
        });
    } catch (e) {
        throw new Error(`Forensic Value Audit failed: ${e}`);
    }
};

// --- FORENSIC VERIFICATION AGENT (NEW) ---
export const performForensicVerification = async (
    leads: Lead[],
    logEvent: (type: 'AI' | 'DB' | 'SYS' | 'ERR', message: string) => void,
    signal: AbortSignal
): Promise<ForensicResult[]> => {
    
    if (leads.length === 0) return [];

    // Dynamic Date Anchor
    const todayStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const simplifiedLeads = leads.map(l => ({
        leadId: l.id,
        projectName: l.title,
        reportedStatus: l.projectStage,
        address: l.address,
        planningRef: l.applicationRef,
        companies: l.companies.map(c => `${c.contactName} (${c.company})`)
    }));

    const prompt = `
    ROLE DEFINITION: You are the **Mont Azul Data Integrity Engine**. Your mandate is the forensic extraction of AEC sales intelligence with ZERO tolerance for hallucination. You value accuracy over completeness and will report "UNKNOWN" rather than generating a plausible alternative.

    **PLANNING REFERENCE VERIFICATION PROTOCOL (CRITICAL):**
    1. **Explicit Linkage:** You may only associate a Planning Reference (PA Ref) with a project if they are explicitly linked in the same sentence or paragraph of the source data.
    2. **Sequential String Filter:** IMMEDIATELY REJECT any reference containing sequences such as 01234, 12345, 3456, or 98765. These are identified as parametric hallucinations.
    3. **Hierarchy Awareness:** Do not report TPOs (Tree Preservation Orders) or minor advertising signage consents as construction triggers. Verify the project description; if it is for minor works, report it as "Minor - Low Fit."

    **TEMPORAL AND LOGIC CONSTRAINTS:**
    1. **Current Context Anchor:** The current date is **${todayStr}**. Do not project dates forward.
    2. **Status Reconciler (Latency Check):** 
       - **THE "PAST DATE" RULE:** IF the "Decision Date" or "Target Determination Date" found is in the past (before Today), THEN set the Status to **'Decision Made/Check Portal'**.
       - **CONSTRAINT:** Do NOT report "Pending" or "Awaiting Decision" if the decision date was last month or earlier. Trust the Date over the Status Label.
       - If a project status is listed as "Pending" or "Submitted" but the "Decision Date" found in search results is more than 6 months old, flag the lead as **"Watchlist - Possible Stalled/Zombie Project"**.
       - If the lead source says "Approved" (e.g. from a past year), you **MUST** search for "Construction Started [Project Name]" or "Discharge of Conditions" to see if it is now actually "On-Site". Fix the latency error.
    
    **IDENTITY & DEDUPLICATION PROTOCOL (STRICT):**
    - **Reference Number is Key:** Do NOT flag a lead as "Duplicate" unless the Planning Reference Number is IDENTICAL.
    - **Location Separation:** Projects on different streets (e.g. "Meneage St" vs "Coinagehall St") are DISTINCT projects, even if they share an applicant or town.
    - **Avoid Over-Clustering:** Do not group separate garage/extension projects into one unless explicitly linked by a single planning application.

    **MANDATORY "DOUBLE TAP" VERIFICATION LOOP:**
    For each lead, you must:
    1.  **Initial Search:** Find the current status.
    2.  **Counter-Check:**
        - If you find "Refused" or "Rejected", you **MUST** search specifically for "Appeal Allowed [Project Name]" or "Appeal Decision [Ref]".
        - If you find "On Site", check if the contractor has gone into administration (e.g. Midas, ISG).
    3.  **Synthesis:** Only output the final, double-checked reality.

    **Input Data:**
    ${JSON.stringify(simplifiedLeads, null, 2)}

    **Output Format:**
    Return a single JSON object with a "results" key containing an array of objects. 
    IMPORTANT: Do NOT include any text, markdown blocks, or comments outside the JSON block.
    
    Schema:
    {
      "results": [
        {
          "leadId": "string (original ID)",
          "projectName": "string",
          "reportedStatus": "string (original status)",
          "forensicReality": "string (The Truth - e.g., 'Actually just groundworks', 'Appeal Allowed', 'On Hold due to bankruptcy', 'Watchlist - Possible Stalled/Zombie Project', 'Decision Made/Check Portal')",
          "criticalAnomaly": "string | null (e.g., 'Fire Incident', 'Appeal Allowed', 'Infra-Only', 'Administration', 'Sequential Ref Rejected', 'Status Latency Corrected')",
          "strategicAction": "'Monitor' | 'Pitch' | 'Discard'",
          "newProjectStage": "string (Suggested updated stage, e.g. 'On-Site', 'Pre-Construction', 'Overdue / Stalled', 'Watchlist', 'Decision Made/Check Portal')",
          "reasoning": "string (Short explanation)"
        }
      ]
    }
    `;

    try {
        logEvent('AI', `Starting Forensic Verification (Double-Check Mode) for ${leads.length} leads...`);
        const response = await executeRequest(ai, {
            model: 'gemini-3.1-pro-preview',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
                // We enable thinking to enforce the "Double Tap" logic internally before output
                thinkingConfig: { thinkingBudget: 2048 } 
            },
            signal
        });

        const result = safeJsonParse<{ results: ForensicResult[] }>(response.text, { results: [] });
        return result.results || [];

    } catch (e) {
        logEvent('ERR', `Forensic Verification Failed: ${e instanceof Error ? e.message : String(e)}`);
        return [];
    }
};

// --- PERSONA EMAIL GENERATOR ---
export const generatePersonaEmails = async (
    lead: Lead,
    contact: Partial<LeadContact>,
    scenario: string
): Promise<StrategicEmailDraft[]> => {
    const prompt = `
    Role: You are a Strategic Sales Consultant for Mont Azul Slate. Your task is to write hyper-personalized outreach emails.

    **Context:**
    - **Project:** ${lead.title}
    - **Location:** ${lead.address} (Use local knowledge like saline corrosion in coastal areas or conservation tones for heritage sites).
    - **Target Contact:** ${contact.contactName} (${contact.type}) at ${contact.company}.
    - **Scenario:** "${scenario}"

    **The "Mont Azul" Value Proposition (Map the Contact to the Persona):**
    We sell Risk Management, not just slate.

    1.  **IF QUANTITY SURVEYOR / BUYER / EX-ROOFER (e.g. Persona "Andy Hill"):**
        - Pitch: "Wastage Reduction", "Hook-fixing speed", "Sorting time", "Labor savings".
        - Tone: Direct, No buzzwords.
    2.  **IF PLANNER / LAND MANAGER / HERITAGE (e.g. Persona "Jamie Grant"):**
        - Pitch: "Discharge of Conditions", "Heritage matching", "Vernacular Sample Panels", "Success at Tencreek Farm".
        - Tone: Regulatory, Assured.
    3.  **IF DIRECTOR / CONSTRUCTION MANAGER (e.g. Persona "Scott Brown"):**
        - Pitch: "Safety/Efficiency", "Stock Availability", "Pre-graded thickness", "Risk mitigation".
        - Tone: Executive, Efficiency-focused.
    4.  **IF SUSTAINABILITY / HOUSING ASSOCIATION (e.g. Persona "Catherine Pinney"):**
        - Pitch: "Asset Value", "A1 Fire Rating", "100-year life", "EPDs", "Volume Security".
        - Tone: Long-term, Value-driven.

    **Instructions:**
    1.  Analyze the contact's role (${contact.type}) and map them to the closest Persona above.
    2.  Draft 3 separate email variations based on that persona logic.
    3.  Ensure the tone is "Forensic, Professional, and Local". Mention specific details about the project location (e.g. coastal/heritage constraints).

    **Output Format:**
    Return a single JSON object with an "emails" array.
    {
      "emails": [
        { "angle": "The Risk Mitigation Pitch", "subject": "string", "body": "string (HTML)" },
        { "angle": "The Local/Heritage Pitch", "subject": "string", "body": "string (HTML)" },
        { "angle": "The Efficiency/Commercial Pitch", "subject": "string", "body": "string (HTML)" }
      ]
    }
    `;

    try {
        const response = await executeRequest(ai, {
            model: 'gemini-3.1-pro-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        const result = safeJsonParse<{ emails: StrategicEmailDraft[] }>(response.text, { emails: [] });
        return result.emails;
    } catch (e) {
        console.error("Persona Email Generation Failed", e);
        throw e;
    }
};

// --- BATCH ENRICHMENT AGENT ---
export const deepEnrichLeadsBatch = async (
    leads: Lead[],
    market: LeadMarket,
    logEvent: (type: 'AI' | 'DB' | 'SYS' | 'ERR', message: string) => void,
    signal: AbortSignal
): Promise<Record<string, Partial<Lead>>> => {
    logEvent('AI', `Starting Batch Enrichment for ${leads.length} leads...`);

    const leadsData = leads.map(l => ({
        id: l.id,
        title: l.title,
        address: l.address || l.council,
        planningRef: l.applicationRef || '',
        existingContacts: l.companies.map(c => `${c.contactName} (${c.company})`).join(', ')
    }));

    // Native Language Maps
    const LANGUAGE_MAP: Record<string, string> = {
        'UK': 'English (UK)',
        'Spain': 'Spanish (Español)',
        'France': 'French (Français)',
        'Germany': 'German (Deutsch)'
    };
    const targetLanguage = LANGUAGE_MAP[market] || 'English';

    const prompt = `
    Role: Senior Construction Intelligence Officer & Real Estate Intelligence Agent for the ${market} market.
    Target: Comprehensively enrich these ${leads.length} construction leads in ONE pass.
    TARGET LANGUAGE: ${targetLanguage} (You MUST format summaries, address updates, and descriptions in ${targetLanguage}).
    
    You are an expert Real Estate Intelligence Agent responsible for enriching Lead Dossiers.
    Your specific task is to locate "Planning Snapshots", "Architectural Plans" from web sources or provided context, and detailed contact information.

    **LEAD SANITIZATION & GEOGRAPHIC VALIDATOR:**
    1. **Geographic Validator (UK Context):** 
       - Before assigning a lead to a branch, check the postcode/location.
       - **St Ives, Cornwall** (TR26/27) is served by **Jewson Hayle**.
       - **St Ives, Cambridgeshire** (PE27) is NOT. Do not confuse the two.
    2. **Planning Ref Sanitization:**
       - Check the Planning Reference against the snippet source text. If they do not match, replace with "UNKNOWN".
       - **Sequential Filter:** If you see a ref like "12345", "01234", "98765", DELETE IT. It is a hallucination.
       - Assign "Local Development Order (LDO)" where applicable (e.g. Nansledan).

    CRITICAL URL VALIDATION RULES:
    1.  **Reject Session Links:** Do NOT return URLs that contain dynamic session tokens, transient IDs, or ".ashx" handlers unless they are publicly permanent. (e.g., avoid links containing "&sessionID=" or "blobs").
    2.  **Prioritize Meta Images:** Look for OpenGraph tags (og:image) or static thumbnails often found on the summary page of planning applications. These are usually persistent public URLs.
    3.  **File Extension Check:** Prefer direct links ending in static extensions: .jpg, .png, .pdf.
    4.  **Fallback Behavior:** If the only available images are inside a protected/dynamic viewer, return the URL of the *main application summary page* instead and label the type as "Link to Portal (Requires Login)".
    
    INPUT DATA:
    ${JSON.stringify(leadsData, null, 2)}
    
    TASKS FOR EACH LEAD:
    1. **SURVEY (Location & Status):** Find Lat/Lng, Status, Dates (Start/Decision), and Summary.
       - **ADDRESS FORMATTING:** You MUST format the "formattedAddress" field using the LOCAL LANGUAGE and convention for ${market} (e.g., "Rue de la République" not "Republic Street", "Calle Mayor" not "Main Street"). Do not anglicize addresses.
       - **SUMMARY LANGUAGE:** The 'summary' field MUST be written in ${targetLanguage}.
       - **RULE 1: THE "HOTEL BRISTOL" VALIDATION (Anti-Hallucination):**
         - WHEN finding a Planning Ref, VERIFY the "Proposal Description".
         - IF Description != Target Project Name (e.g. User wants "Waste Station" but ID links to "Hotel"), DISCARD ref.
         - DO NOT output conflicting numbers.
       - **RULE 2: THE "NANSLEDAN" PROTOCOL (Regulatory Awareness):**
         - IF standard Ref not found, check for "Local Development Order" (LDO), "Permitted Development", "Royal Assent".
         - Output mechanism (e.g., "Nansledan LDO") as the ref.
    2. **HEADHUNT (People):** Find Architect, Contractor, Developer names/emails/phones.
       - **RULE 3: BUYER PERSONA SORTING:**
         - **Tier 1 (Wallet):** Director, Head of, VP, Commercial, Owner.
         - **Tier 2 (Gatekeeper):** Site Manager, Project Manager, Foreman, Buyer.
         - **Tier 3 (Influencer):** Architect, Engineer, Design.
         - **Exclude:** Marketing, HR, Assistant.
       - **RULE 4: THE "GENERIC GATEWAY" TRAP (Contact Precision):**
         - If you identify a specific individual (e.g., "Jenny Suttle"), you **MUST NOT** assign them a generic "planning@" or "developmentcontrol@" email address.
         - If the only email found is generic, leave the individual's email field as \`null\` or \`""\`. It is better to have no email than a wrong one that goes to the council.
       - **RULE 5: IDENTITY RESOLUTION (Operator vs Contractor):**
         - Distinguish between the **Building Operator** (e.g., "Everyone Active", "Hilton", "Tesco") and the **Construction Company** (e.g., "Pellikaan", "Balfour Beatty").
         - If you find a contact (e.g., "Duncan Cogger"), verify their employer. Do not list an Operator's manager as the Contractor's director.
         - If the entity is the Operator, label the role as "Client / Operator".
       - **RULE 6: THE 'NO DATA LEFT BEHIND' PROTOCOL (Gap Filling):**
         - If you identify a **Company Name** (e.g. 'Studio 4 Architects') or a **Person Name** (e.g. 'John Smith') in the planning documents but NO valid email/phone is listed there:
         - **YOU MUST PERFORM A SECONDARY GOOGLE SEARCH** for that specific entity (e.g., query "Studio 4 Architects contact email").
         - Fill in the gaps with the result of that second search.
         - Do **NOT** return "Unknown" or "TBC" if the company or person name is known. Only return empty if the entity itself is completely unidentified.
       - **RULE 7: THE "DIGITAL FOOTPRINT" MANDATE (External Lookup):**
         - If a Company Name is found (e.g. 'Apex Construction') but the planning application does not list their email/phone, you **MUST** perform an external Google Search for that company's website or contact page to find their general office details (e.g. 'info@apex.com', 'estimating@apex.com'). Do not return 'null' if the company has a website.

    3. **SPECIFY (Materials):** Identify Roofing materials and plan image URLs using the validation rules above.
    
    **OUTPUT REQUIREMENT: PURE JSON**
    You must return a SINGLE valid JSON object. Do NOT include any conversational text, markdown formatting (like \`\`\`json), or explanations. Start the response with '{'.

    OUTPUT JSON SCHEMA:
    A single object where keys are the Lead IDs and values are the enriched data following this schema:
    {
      "LEAD_ID_1": {
          "surveyor": { ... },
          "headhunter": { "contacts": [ { "name": "string", "role": "string", "company": "string", "email": "string", "phone": "string", "personaTier": "Tier 1 | Tier 2 | Tier 3" } ], "contractor": "string" },
          "specifier": { ... }
      },
      "LEAD_ID_2": { ... }
    }
    
    Schema for inner objects:
    "surveyor": { "coordinates": { "lat": number, "lng": number }, "formattedAddress": "string", "status": "string", "startDate": "YYYY-MM-DD", "applicationDate": "YYYY-MM-DD", "decisionDate": "YYYY-MM-DD", "summary": "string" }
    "headhunter": { "contacts": [ { "name": "string", "role": "string", "company": "string", "email": "string", "phone": "string", "personaTier": "string" } ], "contractor": "string" }
    "specifier": { 
        "materials": [ { "name": "string", "type": "Verbatim | Inferred" } ], 
        "planImages": [ { "url": "string", "description": "string" } ] 
    }
    `;

    try {
        // Using Gemini 3 Pro for high-quality batch processing
        const response = await executeRequest(ai, {
            model: 'gemini-3.1-pro-preview',
            contents: prompt,
            config: { 
                tools: [{ googleSearch: {} }],
                // We omit responseMimeType here to avoid conflicts with search tools, 
                // but rely on strict prompt engineering for JSON.
            },
            signal
        });

        const rawResults = safeJsonParse<Record<string, any>>(response.text, {});
        
        // Validation: Check if we actually got results
        if (Object.keys(rawResults).length === 0) {
            logEvent('ERR', 'Batch Enrichment returned empty JSON. Model might have failed to parse request or search failed.');
        }

        const processedResults: Record<string, Partial<Lead>> = {};

        for (const lead of leads) {
            const rawData = rawResults[lead.id];
            if (!rawData) continue;

            const uiUpdates: Partial<Lead> = { ...lead };
            const surveyorData = rawData.surveyor || {};
            const headhunterData = rawData.headhunter || {};
            const specifierData = rawData.specifier || {};

            // 1. Merge Surveyor
            if (surveyorData.summary) uiUpdates.summary = safeMerge(surveyorData.summary, lead.summary);
            if (surveyorData.startDate) uiUpdates.startDate = safeMerge(surveyorData.startDate, lead.startDate);
            if (surveyorData.applicationDate) uiUpdates.applicationDate = surveyorData.applicationDate;
            if (surveyorData.decisionDate) uiUpdates.decisionDate = surveyorData.decisionDate;
            if (surveyorData.status) {
                 let status = surveyorData.status;
                 if (status.toLowerCase().includes('started') || status.toLowerCase().includes('construction')) status = 'On-Site';
                 uiUpdates.projectStage = safeMerge(status, lead.projectStage) as any;
            }
            if (surveyorData.formattedAddress) uiUpdates.formattedAddress = surveyorData.formattedAddress;
            if (surveyorData.coordinates?.lat) {
                uiUpdates.geolocation = { lat: surveyorData.coordinates.lat, lng: surveyorData.coordinates.lng };
            }

            // 2. Merge Headhunter
            if (headhunterData.contractor) uiUpdates.contractor = safeMerge(headhunterData.contractor, lead.contractor);
            
            const contactMap = new Map<string, any>();
            (lead.companies || []).forEach(c => {
                const key = `${c.contactName?.toLowerCase().trim()}|${c.company?.toLowerCase().trim()}`;
                contactMap.set(key, c);
            });

            if (headhunterData.contacts && Array.isArray(headhunterData.contacts)) {
                headhunterData.contacts.forEach((aiContact: any) => {
                    const name = aiContact.name || "Unknown";
                    const comp = aiContact.company || "Unknown Company";
                    const key = `${name.toLowerCase().trim()}|${comp.toLowerCase().trim()}`;
                    
                    if (contactMap.has(key)) {
                        const existing = contactMap.get(key);
                        contactMap.set(key, {
                            ...existing,
                            email: aiContact.email || existing.email,
                            phone: aiContact.phone || existing.phone,
                            type: aiContact.role || existing.type,
                            personaTier: aiContact.personaTier || existing.personaTier
                        });
                    } else {
                        contactMap.set(key, {
                            contactName: name,
                            type: aiContact.role || "Stakeholder",
                            company: comp,
                            email: aiContact.email,
                            phone: aiContact.phone,
                            status: 'Unverified',
                            // Map priority based on persona tier
                            priority: (aiContact.personaTier === 'Tier 1' || aiContact.personaTier === 'Tier 2') ? 'main' : 'secondary',
                            personaTier: aiContact.personaTier
                        });
                    }
                });
            }
            uiUpdates.companies = Array.from(contactMap.values());

            // 3. Merge Specifier
            const existingMaterials = new Set((lead.materials || []).map(m => m.name.toLowerCase()));
            const newMaterials = [...(lead.materials || [])];
            if (specifierData.materials) {
                specifierData.materials.forEach((m: any) => {
                    if (!existingMaterials.has(m.name.toLowerCase())) {
                        newMaterials.push(m);
                    }
                });
            }
            uiUpdates.materials = newMaterials;
            
            const existingDocs = lead.planningDocuments || [];
            let newDocs = [...existingDocs];

            // STABILIZATION: Download & Upload images
            if (specifierData.planImages && Array.isArray(specifierData.planImages)) {
                const stabilizedDocs = await stabilizeAiImages(lead.id, specifierData.planImages);
                
                stabilizedDocs.forEach(doc => {
                    if (!existingDocs.some(d => d.url === doc.url)) {
                        newDocs.push(doc);
                    }
                });
            }
            
            uiUpdates.planningDocuments = newDocs;
            uiUpdates.isFullyEnriched = true;

            processedResults[lead.id] = uiUpdates;
        }

        return processedResults;

    } catch (error) {
        logEvent('ERR', `Batch Enrichment Failed: ${error}`);
        return {};
    }
};

// --- LEGACY SINGLE ENRICHMENT (Wrapper) ---
export const deepEnrichLeadData = async (
    lead: Lead,
    market: LeadMarket,
    logEvent: (type: 'AI' | 'DB' | 'SYS' | 'ERR', message: string) => void,
    signal: AbortSignal
): Promise<Partial<Lead>> => {
    const results = await deepEnrichLeadsBatch([lead], market, logEvent, signal);
    return results[lead.id] || {};
};

// --- STRATEGY AGENT CONTENT GENERATOR (UPDATED V56) ---
export const generateDeepStrategyContent = async (lead: Lead): Promise<string> => {
    // V57 Update: Use generic branding for non-UK, Mont Azul for UK
    const brandIdentity = lead.market === 'UK' ? 'Mont Azul Slate' : 'Premium Spanish Natural Slate Consortium';
    
    // V57 Update: Inject correct standards based on market
    const STANDARDS_MAP: Record<string, string> = {
        'UK': 'BS EN 12326-1 (Product), BS 5534 (Install), NHBC Standards',
        'Spain': 'UNE-EN 12326-1, CTE DB-HS1 (Código Técnico de la Edificación), NTE-QTT',
        'France': 'NF EN 12326-1, Marque NF Ardoises (Certification), DTU 40.11 (Install)',
        'Germany': 'DIN EN 12326-1, DIN 18338 (Dachdeckungsarbeiten), ZVDH Regeln'
    };
    const standards = STANDARDS_MAP[lead.market] || STANDARDS_MAP['UK'];

    const LANGUAGE_MAP: Record<string, string> = {
        'UK': 'English (UK)',
        'Spain': 'Spanish (Español)',
        'France': 'French (Français)',
        'Germany': 'German (Deutsch)'
    };
    const targetLanguage = LANGUAGE_MAP[lead.market] || 'English';

    const prompt = `
    Role: You are a Senior Construction Intelligence Analyst for ${brandIdentity}.
    Task: Create a "Forensic Commercial Strategy" for this project.
    TARGET LANGUAGE: ${targetLanguage} (You MUST write the entire response in ${targetLanguage}).

    **Input Data:**
    - Project: "${lead.title}" (${lead.projectStage})
    - Location: "${lead.address}"
    - Value Hint: "${lead.projectValue || 'Unknown'}"
    - Materials: ${(lead.materials || []).map(m => m.name).join(', ')}
    - Contacts: ${(lead.companies || []).map(c => `${c.contactName} (${c.type} at ${c.company})`).join(', ')}
    - Market: ${lead.market}

    **CRITICAL: USE CORRECT STANDARDS.**
    Use ONLY verified industry standards relevant to ${lead.market}: **${standards}**.
    Do NOT hallucinate fake rules. Use the official codes provided above.
    If in France, explicitly mention compliance with the "Marque NF" or laboratory testing if relevant.

    **ANALYSIS FRAMEWORK:**

    1. **The "Value Reality" Check:**
       - Does the reported value match the description? (e.g., A "College Campus" is likely £20m+, not £500k maintenance).
       - Look for "Capital Transformation Funds", "DfE Frameworks", or "Phase 2" expansions.

    2. **The "Scope" Check:**
       - Is this just "Enabling Works" (Roads/Sewers)? If so, mark as "Monitor".
       - Is this "Vertical Build" (Houses going up)? If so, mark as "Pitch Immediately".

    3. **Strategic Angle (Select One):**
       - **If Social Housing/HA:** Pitch "Homes and Place Standard" compliance (A1 Non-combustible materials, Zero Carbon readiness).
       - **If Coastal/Island (e.g. IoW):** Pitch "Marine Grade Classification" (W1-S1-T1) to prevent corrosion. Suggest "Consignment Stocking" to mitigate ferry/logistics risks.
       - **If Solar Specified:** Pitch "Integrated Solar Compatibility" (Part L / RE 2020 / CTE HE) - speed of install, not just weight load.

    **OUTPUT FORMAT (Markdown):**
    Generate the strategy in the NATIVE LANGUAGE of ${lead.market} (${targetLanguage}).
    Translate all headers below to ${targetLanguage}.

    ### [Translated: Project Reality & Scope]
    - **[Translated: True Scale]:** [Your assessment of the actual size/value.]
    - **[Translated: Build Phase]:** [Infrastructure vs Vertical Build]

    ### [Translated: The Winning Angle]
    "[One sentence summary using REAL industry terms.]"

    ### [Translated: Technical & Regulatory Hooks]
    - **[Translated: Standard]:** [e.g., ${standards}]
    - **[Translated: Benefit]:** [e.g., "Guaranteed longevity in saline environments"]

    ### [Translated: Conversation Starters]
    **[Target Persona]:**
    - "Regarding [Project Name], are you concerned about [Specific Risk]?"
    - [Evidence-based follow up]
    `;

    try {
         const response = await executeRequest(ai, {
            model: 'gemini-3.1-pro-preview', // Force Pro for reasoning
            contents: prompt,
        });
        return response.text;
    } catch (e) {
        throw new Error(`Deep Strategy failed: ${e}`);
    }
};

// --- ECONOMIC HEALTH CHECK AGENT ---
export const analyzeCompanyFinancials = async (
    companyName: string,
    market: LeadMarket,
    logEvent: (type: 'AI' | 'DB' | 'SYS' | 'ERR', message: string) => void
): Promise<{ status: string; risk: string; link: string | null }> => {
    
    const registryMap = {
        'UK': 'Companies House (find-and-update.company-information.service.gov.uk)',
        'Spain': 'Registro Mercantil (registradores.org) or InfoCif',
        'France': 'Infogreffe (infogreffe.fr) or Pappers.fr',
        'Germany': 'Unternehmensregister (unternehmensregister.de) or North Data'
    };

    const prompt = `
    ROLE: Financial Due Diligence Investigator.
    TASK: Find the official economic status of a company in ${market}.
    
    TARGET COMPANY: "${companyName}"
    SOURCE REGISTRY: ${registryMap[market]}

    INSTRUCTIONS:
    1.  **SEARCH:** Perform a Google Search for the company on the official registry or a reliable financial aggregator (like North Data, Pappers, Endole, InfoCif).
    2.  **VERIFY:** Check if the company status is "Active", "Liquidation", "Dissolved", "Administration", or "Insolvent".
    3.  **LINK:** If found, provide a direct URL to the source. If not found, you can leave it null but MUST still estimate status from text snippets.
    4.  **RISK ASSESSMENT:** Based on the status and any "flag" indicators (e.g., "accounts overdue", "gazette notice"), assign a risk level: 'Low', 'Medium', 'High', 'Unknown'.

    OUTPUT JSON ONLY:
    You MUST return a SINGLE valid JSON object within a code block. Do not add any conversational text.
    
    \`\`\`json
    {
      "status": "string (e.g. 'Active', 'Liquidation', 'Dissolved')",
      "risk": "'Low' | 'Medium' | 'High' | 'Unknown'",
      "link": "string | null"
    }
    \`\`\`
    `;

    try {
        // Upgrade to Gemini 3 Pro to handle the Google Search tool output more robustly
        const response = await executeRequest(ai, {
            model: 'gemini-3.1-pro-preview', 
            contents: prompt,
            config: { 
                tools: [{ googleSearch: {} }]
                // NO responseMimeType when using search tools with current Gemini API versions to avoid INVALID_ARGUMENT
            }
        });

        const result = safeJsonParse<{ status: string; risk: string; link: string | null }>(response.text, { status: 'Unknown', risk: 'Unknown', link: null });
        
        // Ensure we return something useful even if parsing is partial
        if (!result.status) result.status = 'Unknown';
        
        return result;
    } catch (e) {
        logEvent('ERR', `Economic Check failed for ${companyName}: ${e}`);
        return { status: 'Unknown', risk: 'Unknown', link: null };
    }
};

// --- BATCH ECONOMIC CHECK ---
export const analyzeCompanyFinancialsBatch = async (
    companies: {name: string, context?: string}[], 
    market: LeadMarket,
    logEvent: (type: 'AI' | 'DB' | 'SYS' | 'ERR', message: string) => void
): Promise<Record<string, { status: string; risk: string; link: string | null }>> => {
    
    const registryMap = {
        'UK': 'Companies House (find-and-update.company-information.service.gov.uk)',
        'Spain': 'Registro Mercantil (registradores.org) or InfoCif',
        'France': 'Infogreffe (infogreffe.fr) or Pappers.fr',
        'Germany': 'Unternehmensregister (unternehmensregister.de) or North Data'
    };

    const prompt = `
    ROLE: Bulk Financial Due Diligence Investigator.
    TASK: Check the economic status for a LIST of companies in ${market}.
    SOURCE REGISTRY: ${registryMap[market]}

    TARGET COMPANIES LIST:
    ${JSON.stringify(companies)}

    INSTRUCTIONS:
    1.  For EACH company, perform a targeted search on the official registry or aggregators (North Data, Endole, etc.).
    2.  Determine Status (Active, Liquidation, Dissolved, Administration) and Risk Level (Low, Medium, High, Unknown).
    3.  Find a direct URL evidence link if possible.
    
    OUTPUT JSON ONLY:
    Return a single JSON object where keys are the *original company names provided* and values match the schema below.
    
    \`\`\`json
    {
      "Company Name 1": { "status": "Active", "risk": "Low", "link": "https://..." },
      "Company Name 2": { "status": "Liquidation", "risk": "High", "link": "https://..." }
    }
    \`\`\`
    `;

    try {
        const response = await executeRequest(ai, {
            model: 'gemini-3.1-pro-preview', 
            contents: prompt,
            config: { 
                tools: [{ googleSearch: {} }]
            }
        });

        const result = safeJsonParse<Record<string, { status: string; risk: string; link: string | null }>>(response.text, {});
        
        // Normalize results
        Object.keys(result).forEach(key => {
            if(!result[key].status) result[key].status = 'Unknown';
            if(!result[key].risk) result[key].risk = 'Unknown';
        });
        
        return result;
    } catch (e) {
        logEvent('ERR', `Batch Economic Check failed: ${e}`);
        return {};
    }
};

// --- QUERY PARSING ---
export const parseNaturalLanguageSearchQuery = async (query: string, market: LeadMarket): Promise<StructuredSearchParams> => {
    const prompt = `TASK: Query Parsing for API Optimization
INPUT: "${query}"
MARKET: ${market}

Extract: location, intent (planning/tenders), sector (public/private), and limit.
Return JSON only.
{
  "search_parameters": {
    "location_filter": "string",
    "country_code": "string",
    "data_source_type": ["planning_portal" | "contracts_finder"],
    "sector_filter": "public_sector" | null,
    "limit": number,
    "keywords": ["string"]
  }
}`;
    
    const response = await executeRequest(ai, {
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
    });
    
    const parsed = safeJsonParse<{ search_parameters: StructuredSearchParams }>(response.text, { 
        search_parameters: { 
            location_filter: query.replace(/\d+/g, '').replace(/leads|in|for|and|with/gi, '').trim(),
            keywords: [query]
        }
    });
    return parsed.search_parameters;
};

// Helper function for V53.1 "Negative Constraint" Search Logic
const buildSearchQueryContext = (stage: string | undefined, location: string, keywords: string[] = []): string => {
    const isStrictOnSite = stage === 'On-Site' || stage === 'active_construction';
    
    if (isStrictOnSite) {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const dateStr = oneYearAgo.toISOString().split('T')[0];

        return `
        CRITICAL V53.1 INSTRUCTION - "ON-SITE" REMEDIATION:
        SEARCH CONSTRAINT:
        Append "after:${dateStr}" to queries.
        REQUIRED KEYWORDS:
        ("construction started" OR "groundworks" OR "contractor appointed" OR "site manager" OR "spades in the ground")
        NEGATIVE CONSTRAINTS:
        -("outline planning" -"awaiting decision" -"pre-planning" -"application received" -"reserved matters" -"refused")
        `;
    }
    
    return `Target Stage: ${stage || 'Planning Applications'}`;
};

export const findNewLeads = async (params: {
    jobId: string;
    searchParams: StructuredSearchParams;
    searchType?: LeadSearchCategory;
    updateStatus: (updates: Partial<StatusJob>) => void;
    signal: AbortSignal;
    existingLeads: Lead[];
    userId: string;
    market: LeadMarket;
    logEvent: (type: 'AI' | 'DB' | 'SYS' | 'ERR', message: string) => void;
    findMoreCount?: number;
}): Promise<{ leads: Lead[], disqualifiedLeads: DisqualifiedLead[] }> => {
    const { searchParams, searchType, signal, userId, market, logEvent } = params;

    const queryContext = buildSearchQueryContext(searchParams.projectStage, searchParams.location_filter || '', searchParams.keywords);

    let personaContext = "";
    if (market === 'UK') {
        personaContext = `
    Role: You are Dr. Aris Thorne, a Senior Construction Intelligence Analyst (Forensic Precision Mode).
    MARKET: ${market}
    TASK: Find high-quality construction leads in ${searchParams.location_filter}.

    THE "CORNWALL PARADOX" / STRATEGIC CONTEXT:
    We operate in a market defined by acute housing demand clashing with rigid environmental protection.
    
    CONSTRAINT 1 (Planning Risk): Do not assume "Approved" means "Start." Check for "Discharge of Conditions" and "Temporal Dissonance" (recent fires, financial disputes, stalled sites).
    CONSTRAINT 2 (Infrastructure vs Vertical): Differentiate between Roads/Enabling Works and actual Housing. Do not flag a site as "Ready for Roofing" if they are still building the access road.
    CONSTRAINT 3 (Naming): Verify names. "Working Titles" (e.g. Rosa Gardens) are often wrong. Find the "Marketing Name" (e.g. Elm Gardens) if possible.

    NEGATIVE CONSTRAINTS (The "Narrowcliff" Rules):
    - Check for catastrophic events (fires, police cordons).
    - Avoid "Zinc/Metal" heavy sites unless pitching "Political Safe Haven" (Slate).
    - For "Zero Carbon" sites, pitch Slate as "Solar Compatible".
        `;
    } else {
        // Keep generic high quality for other markets
        personaContext = `
    ROLE: Senior Lead Architect (Data Integrity & Persona Protocol Enforced).
    MARKET: ${market}
    Focus on forensic precision in data extraction.
        `;
    }

    const prompt = `
    ${personaContext}
    SEARCH PARAMETERS:
    - LOCATION: ${searchParams.location_filter}
    - KEYWORDS: ${(searchParams.keywords || []).join(', ')}
    - CONTEXT: ${queryContext}
    
    *** SYSTEM INSTRUCTION: DATA INTEGRITY PROTOCOLS ***

    RULE 1: THE "HOTEL BRISTOL" VALIDATION (Anti-Hallucination)
    WHEN extracting a Planning Reference (PAxx/xxxxx):
    - VERIFY the "Proposal Description" associated with that ID.
    - IF the Description does not match the Target Project Name (e.g., user asks for "Waste Station" but ID links to "Hotel"):
    - ACTION: DISCARD the reference. Set "planningRef" to null.
    - DO NOT output the conflicting number.

    RULE 2: THE "LIST SEPARATION" PROTOCOL (Anti-Adjacency Bias)
    WHEN parsing lists (e.g. Council Agendas, Weekly Lists):
    - Treat each list item as a completely separate silo.
    - **NEVER** borrow a Reference Number, Address, or Status from the previous or next item in the list.
    - If "Item 4" has a location "St Ives" and "Item 5" has "Tregadillett", ensure the Ref Number for Item 4 stays with Item 4.
    - If the Ref Number is ambiguous or floating between two items, discard it.

    RULE 3: THE "APPLICANT VS AGENT" DISTINCTION (Contact Accuracy)
    - **AGENT:** Usually the Architect or Planner.
    - **APPLICANT:** The Developer or Client (The money).
    - **ACTION:** Extract "Agent Name" and "Applicant Name" separately if possible.
    - **CONSTRAINT:** Do NOT list "Planning Officer" or "Case Officer" as a contact.

    *** V55 INSTRUCTIONS ***
    1. **COORDINATES:** You MUST estimate "lat" and "lng" for every lead based on its address.
    2. **DATES:** Try to find "application_date", "decision_date", and "start_date" if visible in the search snippets.
    3. **CONTACTS:** Extract specific names if possible (e.g. "John Smith - Architect"). If not, provide "Unknown".
    4. **STRICT JSON:** No comments.
    
    OUTPUT JSON SCHEMA:
    {
      "leads": [
        {
          "projectName": "string",
          "projectOverview": "string",
          "formattedAddress": "string",
          "coordinates": { "lat": number, "lng": number },
          "status": "string",
          "council": "string",
          "planningRef": "string",
          "planningUrl": "string",
          "slateFitScore": "High | Medium | Low",
          "slateFitReason": "string",
          "projectValue": "string",
          "materials": ["string"],
          "companyNames": ["string"],
          "construction_start_date": "YYYY-MM-DD",
          "application_date": "YYYY-MM-DD",
          "decision_date": "YYYY-MM-DD",
          "anticipated_completion_date": "YYYY-MM-DD",
          "primary_contact_name": "string",
          "primary_contact_role": "string",
          "primary_contact_email": "string",
          "contacts": [ { "contactName": "string", "company": "string", "role": "string", "email": "string" } ],
          "planningDocuments": [ { "filename": "string", "url": "string", "type": "Plan | Spec | Application" } ]
        }
      ],
      "disqualifiedLeads": []
    }
    `;

    const response = await executeRequest(ai, {
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] },
        signal,
    });

    const result = safeJsonParse<{ leads: any[], disqualifiedLeads: DisqualifiedLead[] }>(response.text, { leads: [], disqualifiedLeads: [] });
    
    const newLeads = (result.leads || []).map((rawLead: any): Lead => {
        let status = rawLead.status || 'Planning';
        const contextString = (searchParams.keywords || []).join(' ').toLowerCase() + ' ' + (searchParams.projectStage || '').toLowerCase();
        
        // Force status normalization based on context or keywords
        if (contextString.includes('started') || contextString.includes('groundworks') || contextString.includes('on-site') || status.toLowerCase().includes('start') || status.toLowerCase().includes('construct')) {
             if (status !== 'Complete') status = 'On-Site';
        }

        const repairedKeyDates = rawLead.keyDates || [];
        if (rawLead.construction_start_date) {
            repairedKeyDates.push({ label: "Construction Start", date: rawLead.construction_start_date });
        }
        if (rawLead.anticipated_completion_date) {
            repairedKeyDates.push({ label: "Anticipated Completion", date: rawLead.anticipated_completion_date });
        }

        let repairedCompanies = rawLead.contacts || rawLead.companies || [];
        
        if (rawLead.primary_contact_name || rawLead.primary_contact_role) {
             const primaryContact: Partial<LeadContact> = {
                contactName: rawLead.primary_contact_name || "Procurement Team",
                type: rawLead.primary_contact_role || "Decision Maker",
                email: rawLead.primary_contact_email,
                company: rawLead.companyNames?.[0] || 'Main Contractor',
                priority: 'main',
                status: 'Unverified'
            };
            repairedCompanies = [primaryContact, ...repairedCompanies];
        } else if (status === 'On-Site' && repairedCompanies.length === 0) {
             repairedCompanies.push({
                contactName: "Site Office",
                type: "Site Manager",
                company: rawLead.companyNames?.[0] || 'Main Contractor',
                priority: 'main',
                status: 'Unverified'
            });
        }

        // V55: Pass Coordinates to Transformer
        const leadDataForTransform = {
            ...rawLead,
            status: status,
            projectStage: status,
            keyDates: repairedKeyDates,
            companies: repairedCompanies,
            address: rawLead.formattedAddress || rawLead.address,
            market: market,
            userId: userId
        };
        
        if (rawLead.coordinates && rawLead.coordinates.lat) {
            leadDataForTransform.geolocation = rawLead.coordinates;
        }

        const sanitizedLead = transformLeadForUI(leadDataForTransform);

        return {
            id: sanitizedLead.id!,
            userId: userId,
            market: market,
            title: sanitizedLead.title || rawLead.projectName || 'Untitled Project',
            summary: sanitizedLead.summary || rawLead.projectOverview || '',
            projectType: sanitizedLead.projectType || 'Unknown',
            projectStage: sanitizedLead.projectStage as any || 'Planning',
            address: sanitizedLead.address || '',
            slateFitScore: sanitizedLead.slateFitScore as any || 'Low',
            slateFitReason: sanitizedLead.slateFitReason || '',
            sources: [],
            companies: sanitizedLead.companies || [],
            companyNames: sanitizedLead.companyNames || [],
            notes: '',
            isFavorite: false,
            isDismissed: false,
            contactsFetched: (sanitizedLead.companies && sanitizedLead.companies.length > 0) || false,
            strategyGenerated: false,
            applicationRef: sanitizedLead.applicationRef || rawLead.planningRef || null,
            council: sanitizedLead.council || null,
            planningUrl: sanitizedLead.planningUrl || null,
            specDocumentUrl: null,
            dateFound: new Date().toISOString().split('T')[0],
            materials: sanitizedLead.materials || [],
            isParsingIncomplete: false,
            isBuildingRegsOnly: false,
            projectValue: sanitizedLead.projectValue,
            keyDates: sanitizedLead.keyDates || [],
            siteHistory: sanitizedLead.siteHistory || [],
            planningDocuments: sanitizedLead.planningDocuments || [],
            totalScore: sanitizedLead.totalScore || 50,
            grade: sanitizedLead.grade || 'C',
            ...(searchType && { originalSearchType: searchType }),
            geolocation: sanitizedLead.geolocation, 
            applicationDate: rawLead.application_date || sanitizedLead.applicationDate,
            decisionDate: rawLead.decision_date || sanitizedLead.decisionDate,
            startDate: rawLead.construction_start_date || sanitizedLead.startDate,
        };
    });

    return { leads: newLeads, disqualifiedLeads: result.disqualifiedLeads || [] };
};


export const updateLeadWithNewInfo = async (
    lead: Lead,
    userId: string,
    logEvent: any,
    signal: AbortSignal
): Promise<Partial<Lead>> => {
    logEvent('AI', `Checking for updates on lead: ${lead.title}`);
    const prompt = `Check for updates on planning application "${lead.applicationRef}" for "${lead.title}".
    Return JSON with ONLY changed fields (status, new documents).`;

    try {
        const response = await executeRequest(ai, {
            model: 'gemini-3.1-pro-preview',
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] },
            signal
        });
        
        const updates = safeJsonParse<Partial<Lead>>(response.text, {});
        return transformLeadForUI(updates);

    } catch (e) {
        return {};
    }
};

export const extractMaterialsForLead = async (lead: Lead, logEvent: any, signal: AbortSignal) => {
    logEvent('AI', `Extracting materials for ${lead.title}...`);
    const prompt = `Analyze the project "${lead.title}" at "${lead.address}". 
    Search for planning documents, design and access statements, or tender specifications.
    Identify all specified construction materials, focusing on:
    - Roof Covering (Slate, Clay, Concrete, Metal)
    - Wall Materials (Brick, Stone, Cladding)
    - Windows & Doors
    
    Return a JSON object with a 'materials' array.
    Example: { "materials": ["Natural Slate (Spanish)", "Timber Cladding", "Aluminium Windows"] }`;

    try {
        const response = await executeRequest(ai, {
            model: 'gemini-3.1-pro-preview',
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] },
            signal
        });
        const result = safeJsonParse<Partial<Lead>>(response.text, {});
        return transformLeadForUI(result);
    } catch (e) {
        logEvent('ERR', `Material extraction failed: ${e instanceof Error ? e.message : String(e)}`);
        return {};
    }
};

export const generateAIStrategyForLead = async (lead: Lead, market: LeadMarket) => {
    // Keep the simple version for light/bulk use
    const prompt = `You are a Sales Strategist for ${market === 'UK' ? 'Mont Azul' : 'Spanish Slate Exporters'}.
    Create a concise, 3-point sales strategy for:
    Title: ${lead.title}
    Type: ${lead.projectType}
    Stage: ${lead.projectStage}
    Materials: ${(lead.materials || []).map(m => m.name).join(', ')}
    
    Format as Markdown.`;

    try {
        const response = await executeRequest(ai, {
            model: 'gemini-3.1-pro-preview',
            contents: prompt,
        });
        return response.text;
    } catch (e) {
        return "Strategy generation failed.";
    }
};

export const generateAIStrategyForLocation = async (location: string, leads: Lead[], market: LeadMarket) => {
    const leadSummary = leads.slice(0, 15).map(l => `- ${l.title} (${l.projectType}, ${l.projectStage})`).join('\n');
    
    // Define language map
    const LANGUAGE_MAP: Record<string, string> = {
        'UK': 'English (UK)',
        'Spain': 'Spanish (Español)',
        'France': 'French (Français)',
        'Germany': 'German (Deutsch)'
    };
    const targetLanguage = LANGUAGE_MAP[market] || 'English';

    const prompt = `
    Role: Senior Sales Director for a Premium Construction Materials Supplier.
    Market: ${market}
    Language: ${targetLanguage} (Strict Requirement)

    Task: Analyze these leads in ${location} and create a high-level sales strategy for the region.

    **Lead Data:**
    ${leadSummary}

    **Instructions:**
    1.  Identify the dominant project types (e.g., "Strong trend in Heritage Restorations" or "Surge in New Build Housing").
    2.  Suggest a group sales approach. E.g., "Target local architects with a heritage CPD seminar" or "Approach main contractors for volume deals".
    3.  Provide 3 specific actionable steps for the sales team.

    **Output Format:**
    - Write the ENTIRE response in ${targetLanguage}.
    - Use Markdown formatting.
    - Translate all headers to ${targetLanguage}.
    `;

    try {
        const response = await executeRequest(ai, {
            model: 'gemini-3.1-pro-preview',
            contents: prompt,
        });
        return response.text;
    } catch (e) {
        return "Group strategy generation failed.";
    }
};

export const generatePartnerPrepReport = async (lead: Lead, partnerName: string): Promise<PartnerPrepReport> => {
    const prompt = `You are the "Mont Azul Strategic Verification Engine". Prepare a lead for a partnership meeting with "${partnerName}".
Input: ${JSON.stringify(lead, null, 2)}
Output JSON:
{
  "verification": { "is_active_company": boolean, "company_reg_number": "string", "confidence_score": number },
  "enhanced_contact": { "role": "string", "name": "string", "linkedin_or_source_url": "string" },
  "partner_strategy": { "nearest_branch": "string", "trade_angle": "string" }
}`;
    try {
        const response = await executeRequest(ai, {
            model: 'gemini-3.1-pro-preview',
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });
        return safeJsonParse<PartnerPrepReport>(response.text, {
             verification: { is_active_company: false, company_reg_number: null, confidence_score: 0 },
             enhanced_contact: { role: 'Unknown', name: 'Unknown', linkedin_or_source_url: '' },
             partner_strategy: { nearest_branch: 'Unknown', trade_angle: 'Could not generate strategy.' }
        });
    } catch (e) {
        throw e;
    }
};

export const generatePartnerOutreachEmail = async (lead: Lead, partnerName: string, prepReport?: PartnerPrepReport) => {
    const prompt = `Write an internal sales email to partner "${partnerName}" about lead "${lead.title}".
    Return JSON: { "subject": "string", "body": "string" }`;
    try {
        const response = await executeRequest(ai, {
            model: 'gemini-3.1-pro-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        return safeJsonParse(response.text, { subject: "New Lead", body: "Hi..." });
    } catch (e) {
        return { subject: `Project: ${lead.title}`, body: `Hi ${partnerName}, check this lead.` };
    }
};

export const generateOutreachEmail = async (lead: Lead) => {
    const prompt = `Write a cold outreach email to "${lead.companies[0]?.contactName || 'the project team'}" about "${lead.title}".
    Goal: Introduce Mont Azul slate.
    Return JSON: { "subject": "string", "body": "string" }`;
     try {
        const response = await executeRequest(ai, {
            model: 'gemini-3.1-pro-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        return safeJsonParse(response.text, { subject: "Project Enquiry", body: "Hello..." });
    } catch (e) {
        return { subject: `Project: ${lead.title}`, body: `Hi,\n\nWe are interested in supplying slate for ${lead.title}.` };
    }
};

// Placeholders for functions that might be called but logic is simple or deferring to other services
export const findHighQualityLeads = async (params: any) => "job_id_placeholder";
export const generateAccountStrategy = async (companyName: string, leads: Lead[]) => "Account Strategy...";
export const generateOpportunityBasket = async (leadId: string) => ({ primary: "", highAttach: [], thirdOrder: "" });
export const findLeadsFromDiscoverySources = async () => ({ leads: [], disqualifiedLeads: [] });
export const getTodaysFocusLeads = async (leads: Lead[]) => Promise.resolve([] as any[]);
export const rescoreLeadWithV52Logic = async () => ({ totalScore: 50, grade: 'C' });
export const findLeadsInSlateRegion = async () => "job_id";
export const generateLeadActionPlan = async (leadId: string) => { /* implementation */ };
export const generateDeepStrategy = async (leadId: string, isSilent?: boolean) => {
    console.warn("Deprecated generateDeepStrategy called in service layer. Use leadSlice action instead.");
};