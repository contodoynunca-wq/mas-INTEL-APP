
import { Type } from "@google/genai";
import { ai } from './common';
import type { FoundProfessional, Customer, LeadMarket, LeadContact, Lead } from '@/types';
import { generateContentWithRetry as executeRequest } from '@/utils/apiUtils';
import { safeJsonParse } from '@/utils/jsonUtils';
import { validateContact as validateContactUtil } from '@/utils/leadPrinting';

export const validateContact = validateContactUtil;

export const fetchHousingAssociationContacts = async (
    location: string,
    market: LeadMarket
): Promise<FoundProfessional[]> => {
    const prompt = `You are an expert corporate intelligence analyst for the UK construction market, specializing in Housing Associations (HAs). Your task is to find key decision-makers within HAs related to construction and maintenance in a specific location.

**Location:** "${location}"

**CRITICAL EXECUTION PLAN:**
1. IDENTIFY HOUSING ASSOCIATIONS: Identify major HAs operating in or near "${location}".
2. OPPORTUNITY SEARCH: Find New Build Development or Maintenance/Procurement tenders for these HAs.
3. IDENTIFY KEY CONTACTS: Find the "Head of Development" or "Asset Manager".
4. ENRICH: Get full name, email, phone, and sourceUrl.

Output JSON with 'professionals' key containing an array of objects.`;
    const response = await executeRequest(ai, {
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }],
        }
    });

    const result = safeJsonParse<{ professionals: any[] }>(response.text, { professionals: [] });

    return (result.professionals || []).map((p: any) => ({
        ...p,
        type: p.role, 
        status: 'Unverified',
        market: market,
    })) as FoundProfessional[];
};

export const fetchProfessionalsData = async (
    activeTab: string,
    searchQuery: string,
    page: number,
    country: LeadMarket
): Promise<FoundProfessional[]> => {
    const prompt = `Find ${activeTab} in ${searchQuery} (Page ${page}). Market: ${country}. Use Google Search to find real construction professionals. Return JSON with 'professionals' key.`;
    const response = await executeRequest(ai, {
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] }
    });
    const result = safeJsonParse<{ professionals: any[] }>(response.text, { professionals: [] });
    return (result.professionals || []).map(p => ({ ...p, market: country, status: 'Unverified' })) as FoundProfessional[];
};

export const enrichProfessionalsBatch = async (professionals: FoundProfessional[]): Promise<FoundProfessional[]> => {
    // Placeholder for batch enrichment logic if needed in future
    return professionals;
};

export const enrichAndVerifyContact = async (customer: Customer, logEvent: any): Promise<Partial<Customer>> => {
    const prompt = `
    Role: Forensic Data Verifier.
    Task: Verify and enrich the following contact for a natural slate company.
    
    CONTACT DATA:
    - Name: ${customer.contactName}
    - Company: ${customer.company}
    - Current Email: ${customer.email || 'None'}
    - Current Phone: ${customer.phone || 'None'}

    INSTRUCTIONS:
    1. Search for the company website and the individual on LinkedIn.
    2. Determine if the company is still active.
    3. Verify if the email/phone is correct.
    4. If you find NEW, better contact details, provide them.
    5. CRITICAL: If you cannot confirm a field, do NOT return it in the JSON. Do NOT return empty strings or "N/A".
    6. Return a status: 'Verified', 'Inactive', 'Contradictory', or 'Unverified'.

    Return JSON ONLY:
    {
      "status": "string",
      "email": "string (OPTIONAL: only if confirmed/new)",
      "phone": "string (OPTIONAL: only if confirmed/new)",
      "mobile": "string (OPTIONAL: only if found)",
      "website": "string (OPTIONAL: only if found)",
      "activityStatus": "Active | Dissolved | Unknown",
      "verificationReasoning": "string (Short summary of what you found)"
    }
    `;
    const response = await executeRequest(ai, {
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] }
    });
    return safeJsonParse<Partial<Customer>>(response.text, { status: 'Unverified' });
};

export const enrichAndVerifyContactsBatch = async (contacts: any[]): Promise<any[]> => {
    const prompt = `
    Task: Batch verify these construction industry contacts.
    Data: ${JSON.stringify(contacts)}

    For each contact:
    1. Check if the company exists and is active.
    2. Cross-reference the contact name with the company.
    3. Update the status to 'Verified', 'Inactive', 'Contradictory', or 'Unverified'.
    4. Provide NEW email/phone ONLY if you are highly confident they are more accurate than the provided ones.
    5. CRITICAL: Do NOT return empty fields in the JSON objects. Omit fields you couldn't improve.

    Return a JSON array of objects, each MUST include the original 'id'.
    [{ "id": "...", "status": "...", "email": "...", "phone": "...", "verificationReasoning": "..." }]
    `;
    const response = await executeRequest(ai, {
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: { 
            tools: [{ googleSearch: {} }]
        }
    });
    return safeJsonParse(response.text, []);
};

export const findAddressesForContactsBatch = async (contacts: Customer[], signal?: AbortSignal): Promise<{ id: string; address: string }[]> => {
    const prompt = `Find current physical HQ addresses for these companies: ${JSON.stringify(contacts.map(c => ({ id: c.id, company: c.company })))}. Return JSON array of objects with 'id' and 'address'.`;
    const response = await executeRequest(ai, {
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
        signal
    });
    return safeJsonParse(response.text, []);
};

export const extractBasicContactsForLeads = async (leads: Lead[], logEvent: any, market: LeadMarket): Promise<Record<string, Partial<LeadContact>[]>> => {
    const prompt = `
    ROLE: Forensic Construction Headhunter & Investigator.
    MARKET CONTEXT: ${market}.
    TASK: Deep-scan the web for the *actual* decision-makers for the following construction projects.

    **INPUT LEADS:**
    ${JSON.stringify(leads.map(l => ({ id: l.id, title: l.title, address: l.address, description: l.summary })))}

    **CRITICAL EXTRACTION PROTOCOLS (READ CAREFULLY):**

    1. **THE "ANTI-OFFICER" RULE:**
       - Do **NOT** return names like "Planning Officer", "Case Officer", or "Development Control". These are government employees, not buyers.
       - If the only email available is a generic council email (e.g. \`planning@council.gov.uk\`), you MAY return it, but you MUST label the role as "**Council Planning Desk (Generic)**". Do NOT label it as "Developer".

    2. **THE "EMAIL MISMATCH" TRAP (New):**
       - **NEVER** assign a generic planning email (e.g., \`development.control@...\`, \`planning@...\`) to a specific private individual (e.g., "Jenny Suttle").
       - If you find a name like "Jenny Suttle" but only a council email, return the email as \`null\` or find her actual company email. Do NOT conflate the two.

    3. **THE "OPERATOR VS BUILDER" DISTINCTION (New):**
       - Verify the company. "Everyone Active" is a Leisure Operator, not a Builder. "Pellikaan" is a Builder.
       - If a person (e.g. Duncan Cogger) is found, check who they actually work for. Do not assign an Operator's employee to the Construction company.
       - Correctly label the company: "End User / Operator" vs "Main Contractor".

    4. **THE "GEOGRAPHIC LOCK" RULE:**
       - If the project is in the UK, **REJECT** any contractors based in the USA (e.g., LLCs in Texas, Florida, California).
       - Verify the company has a ${market} presence.

    5. **THE "DEEP DIVE" HIERARCHY (Who to find):**
       - **Priority 1 (The Buyer):** Look for the "Commercial Director", "Quantity Surveyor", or "Buyer" at the Developer/Contractor company.
       - **Priority 2 (The Boss):** If no buyer found, look for the "Managing Director" or "Owner" of the construction company.
       - **Priority 3 (The Site):** Look for "Site Manager" or "Project Manager".
       - **Priority 4 (The Agent):** The Architect/Agent is acceptable if no contractor is found.

    6. **THE 'NO DATA LEFT BEHIND' PROTOCOL (Gap Filling):**
       - If you identify a **Company Name** (e.g. 'Studio 4 Architects') or a **Person Name** (e.g. 'John Smith') in the planning documents but NO valid email/phone is listed there:
       - **YOU MUST PERFORM A SECONDARY GOOGLE SEARCH** for that specific entity (e.g., query "Studio 4 Architects contact email").
       - Fill in the gaps with the result of that second search.
       - Do **NOT** return "Unknown" or "TBC" if the company or person name is known. Only return empty if the entity itself is completely unidentified.

    **OUTPUT FORMAT (JSON):**
    Return a single JSON object where keys are the Lead IDs.
    {
      "LEAD_ID_1": [
         { 
           "contactName": "John Smith", 
           "company": "Smith Construction Ltd", 
           "role": "Commercial Director", 
           "email": "john@smith.co.uk", 
           "phone": "01234..." 
         }
      ]
    }
    `;

    const response = await executeRequest(ai, {
        model: 'gemini-3.1-pro-preview', // Force Pro for complex reasoning
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] }
    });
    return safeJsonParse(response.text, {});
};

export const findSpecificContactDetails = async (contact: Partial<LeadContact>, lead: Lead): Promise<Partial<LeadContact>> => {
    const prompt = `Find specific direct email and phone for ${contact.contactName} at ${contact.company} specifically related to project ${lead.title}. Return JSON object.`;
    const response = await executeRequest(ai, {
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] }
    });
    return safeJsonParse(response.text, contact);
};

export const findAndEnrichLinkedInContactsForLead = async (lead: Lead, logEvent: any): Promise<Partial<LeadContact>[]> => {
    const prompt = `Find LinkedIn profiles for key project personnel (PMs, Directors) for ${lead.title}. Return JSON array of contacts with 'linkedinUrl'.`;
    const response = await executeRequest(ai, {
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] }
    });
    return safeJsonParse(response.text, []);
};

export const generateContactActionPlan = async (contact: LeadContact, lead: Lead): Promise<string> => {
    const prompt = `Generate a customized 3-step outreach plan for ${contact.contactName} at ${contact.company} regarding ${lead.title}. Focus on Mont Azul slate benefits.`;
    const response = await executeRequest(ai, {
        model: 'gemini-3.1-pro-preview',
        contents: prompt
    });
    return response.text;
};

export const determineContactTypesBatch = async (contacts: (Pick<Customer, 'id' | 'contactName' | 'company' | 'website'>)[]): Promise<{ id: string; type: string }[]> => {
     const prompt = `You are a classification engine. Determine the professional type of these contacts.
     Options: Architect, Roofer, Builder, Developer, Planner, Housing Association.
     
     Input:
     ${JSON.stringify(contacts)}
     
     Return JSON array: [{ "id": "...", "type": "..." }]`;
     
     try {
         const response = await executeRequest(ai, {
            model: 'gemini-3.1-pro-preview',
            contents: prompt,
            config: { responseMimeType: 'application/json' }
         });
         const res = safeJsonParse(response.text, []);
         return Array.isArray(res) ? res : [];
     } catch (e) { return []; }
}

export const reclassifyContactTypeBatch = async (contacts: (Pick<Customer, 'id' | 'contactName' | 'company' | 'website' | 'type'>)[]): Promise<{ id: string; type: string }[]> => {
     return determineContactTypesBatch(contacts);
};
