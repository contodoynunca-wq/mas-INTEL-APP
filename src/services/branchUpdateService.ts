import { GoogleGenAI, Type } from "@google/genai";
import { Contact } from "@/src/utils/sihParser";

export const localFormatFix = (contacts: Contact[]): Contact[] => {
    return contacts.map(c => {
        let newLandline = c.landline || '';
        let newMobile = c.mobile || '';
        
        // If landline looks like a mobile, move it
        const cleanLandline = newLandline.replace(/\s+/g, '');
        if (cleanLandline.startsWith('07') || cleanLandline.startsWith('+447') || cleanLandline.startsWith('447')) {
            if (!newMobile || newMobile === '-') {
                newMobile = newLandline;
                newLandline = '-';
            }
        }
        
        return {
            ...c,
            landline: newLandline,
            mobile: newMobile
        };
    });
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const updateBranchInfo = async (contacts: Contact[], onProgress?: (current: number, total: number) => void): Promise<Contact[]> => {
    if (contacts.length === 0) return [];

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
    
    // We process in batches of 50 to reduce API calls
    const batchSize = 50;
    const updatedContacts: Contact[] = [];

    for (let i = 0; i < contacts.length; i += batchSize) {
        if (i > 0) await delay(2000); // 2 second delay between batches to avoid 429s

        const batch = contacts.slice(i, i + batchSize);
        
        // 1. First, fix the mobile/landline swap locally for the batch
        const preProcessedBatch = localFormatFix(batch);

        // 2. Ask Gemini to find missing info
        const prompt = `
You are a data enrichment assistant. I have a list of Jewson branches in the UK.
Please find their official landline phone number, mobile number (if available), and their current opening status or hours.
If the provided landline or mobile is empty or incorrect, provide the correct one.
Do not hallucinate. If you cannot find the information, leave it empty.

Here are the branches:
${JSON.stringify(preProcessedBatch.map(c => ({
    id: c.id,
    name: c.name,
    town: c.town,
    address: c.address,
    currentLandline: c.landline,
    currentMobile: c.mobile
})), null, 2)}
`;

        try {
            const response = await ai.models.generateContent({
                model: "gemini-3.1-pro-preview",
                contents: prompt,
                config: {
                    tools: [{ googleSearch: {} }],
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                id: { type: Type.STRING, description: "The ID of the branch" },
                                landline: { type: Type.STRING, description: "The official landline number" },
                                mobile: { type: Type.STRING, description: "The official mobile number, if any" },
                                openingHours: { type: Type.STRING, description: "The opening hours or status (e.g., 'Open until 5PM')" }
                            },
                            required: ["id"]
                        }
                    }
                }
            });

            const text = response.text || '[]';
            const enrichedData = JSON.parse(text);

            // Merge back
            const mergedBatch = preProcessedBatch.map(c => {
                const enriched = enrichedData.find((e: any) => e.id === c.id);
                if (enriched) {
                    // Only overwrite if we found something new and valid
                    const finalLandline = enriched.landline || c.landline;
                    const finalMobile = enriched.mobile || c.mobile;
                    
                    // Append opening hours to notes if found
                    let newNotes = c.notes || '';
                    if (enriched.openingHours) {
                        const hoursNote = `[Hours: ${enriched.openingHours}]`;
                        if (!newNotes.includes(hoursNote)) {
                            newNotes = newNotes ? `${newNotes}\n${hoursNote}` : hoursNote;
                        }
                    }

                    return {
                        ...c,
                        landline: finalLandline,
                        mobile: finalMobile,
                        notes: newNotes
                    };
                }
                return c;
            });

            updatedContacts.push(...mergedBatch);

        } catch (error) {
            console.error("Failed to enrich batch", error);
            // On failure, just return the pre-processed batch (with the mobile/landline fix)
            updatedContacts.push(...preProcessedBatch);
        }
        
        if (onProgress) {
            onProgress(Math.min(i + batchSize, contacts.length), contacts.length);
        }
    }

    return updatedContacts;
};
