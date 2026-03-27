import { Type } from "@google/genai";
import { ai } from './common';
import type { StatusJob, TenderAnalysisResult } from '@/types';
import { generateContentWithRetry as executeRequest } from '@/utils/apiUtils';
import { safeJsonParse } from '@/utils/jsonUtils';
import { COMPANY_DETAILS } from '@/constants';
import { useAppStore } from '@/store/store';

const TENDER_ANALYSIS_SYSTEM_PROMPT = `You are an expert-level 'Tender & Bid Analyst' for Mont Azul Slate Ltd., a premium Spanish natural slate supplier operating in the UK. Your task is to conduct a detailed, critical analysis of an uploaded tender document (ITT, PQQ, etc.).

Your analysis must be structured, insightful, and commercially-minded. You will use the provided company information to pre-draft answers where possible.

**Company Information for Drafting:**
- Name: ${COMPANY_DETAILS.name}
- Address: ${COMPANY_DETAILS.address}
- Phone: ${COMPANY_DETAILS.phone}
- Email: ${COMPANY_DETAILS.email}
- Website: ${COMPANY_DETAILS.website}
- VAT Number: ${COMPANY_DETAILS.vatNumber}
- Core Business: Supplier of high-quality, premium Spanish natural slate for roofing. We control our own quarries, ensuring quality and supply chain stability. Our products meet and exceed all relevant British and European standards.

Your response MUST be a single, strictly-formatted JSON object.`;

const TENDER_ANALYSIS_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        summary: {
            type: Type.OBJECT,
            properties: {
                deadlines: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List all critical deadlines mentioned, e.g., 'Submission Deadline: YYYY-MM-DD HH:MM'." },
                requiredDocuments: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List all mandatory documents required for submission, e.g., 'Completed Form of Tender', 'Health & Safety Policy'." },
                criticalCriteria: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List the most important evaluation or selection criteria, e.g., 'Price (40%)', 'Previous Experience (30%)'." }
            },
            required: ["deadlines", "requiredDocuments", "criticalCriteria"]
        },
        redFlags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Identify and list any unusual, high-risk, or potentially problematic clauses. Examples: 'Uncapped liability clause', 'Liquidated damages seem disproportionately high', 'Specification is ambiguous on material standards'."
        },
        draftedResponses: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    question: { type: Type.STRING, description: "The verbatim question from the tender document." },
                    answer: { type: Type.STRING, description: "A pre-drafted answer based on the provided company information or general industry knowledge. If you cannot answer, state what information is needed." },
                    source: { type: Type.STRING, description: "Indicate if the answer was from 'Company Data' or 'Inferred'." }
                },
                required: ["question", "answer", "source"]
            },
            description: "Pre-fill answers to common questions about company details, certifications, history, etc."
        },
        overallAssessment: {
            type: Type.STRING,
            description: "A brief, high-level summary of the opportunity and its suitability for Mont Azul."
        }
    },
    required: ["summary", "redFlags", "draftedResponses", "overallAssessment"]
};

export const analyzeTenderDocument = async (
    imageParts: { inlineData: { mimeType: string; data: string } }[],
    updateStatus: (updates: Partial<StatusJob>) => void,
    signal: AbortSignal
): Promise<TenderAnalysisResult> => {
    updateStatus({ progress: 10, description: 'Analyzing tender document structure...' });
    
    const userPrompt = "Please analyze the attached tender document based on my system instructions.";
    const contents = [{ text: userPrompt }, ...imageParts];

    const { activeModel } = useAppStore.getState();
    const response = await executeRequest(ai, {
        model: activeModel,
        contents: { parts: contents, role: 'user' },
        config: {
            systemInstruction: TENDER_ANALYSIS_SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseSchema: TENDER_ANALYSIS_SCHEMA,
        }
    }, 3, 5000, 300000); // Increased to 5 minutes

    if (signal.aborted) throw new Error('Aborted');
    updateStatus({ progress: 95, description: 'Finalizing analysis report...' });

    return safeJsonParse(response.text);
};