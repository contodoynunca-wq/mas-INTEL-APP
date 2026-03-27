import { GoogleGenAI } from "@google/genai";
import { useAppStore } from '@/store/store';
import { generateContentWithRetry as executeRequest } from '@/utils/apiUtils';
import type { RoofSection } from '@/types';

const IMAGE_MODEL_PRO = "gemini-3.1-flash-image-preview";

export interface ImageGenerationResult {
  base64Image: string;
  mimeType: string;
  textDescription?: string;
  error?: string;
}

const getFreshAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// User explicitly requested to NOT use 2.5 flash fallback.
const generateImage = async (ai: any, params: any): Promise<any> => {
    console.log(`[ImageGen] Attempting generation with ${params.model}...`);
    return await executeRequest(ai, params);
}

export const generateVisualSummary3D = async (
    sectionsOrDescription: RoofSection[] | string,
    cleanPlanBase64?: string,
    refinementInstruction?: string,
    bbox?: number[],
    features?: string[],
    layoutMaskBase64?: string
): Promise<ImageGenerationResult | null> => {
    const ai = getFreshAiClient();
    
    // --- MODE 1: SIMPLE DESCRIPTION ---
    if (typeof sectionsOrDescription === 'string' && !cleanPlanBase64) {
        // Fallback for visualizer view without plan data
        const prompt = `
        Create a photorealistic 3D architectural rendering of a house roof based on this description:
        "${sectionsOrDescription}"
        
        Style: Modern, Clean, High Resolution.
        Material: Premium Regular Grey Blue Spanish Natural Slate (Dark Grey/Black), textured.
        Perspective: Isometric or Bird's Eye View.
        Lighting: Soft daylight, realistic shadows.
        NO CLAY TILES. NO RED TILES.
        `;
        
        const response = await generateImage(ai, {
            model: IMAGE_MODEL_PRO,
            contents: { parts: [{ text: prompt }] },
            config: { imageConfig: { aspectRatio: "4:3", imageSize: "1K" } }
        });

        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                return { base64Image: part.inlineData.data, mimeType: part.inlineData.mimeType };
            }
        }
        return null;
    }

    // --- MODE 2: PLAN-TO-PERSPECTIVE INTERPRETATION ---
    // If we have a Layout Mask, use it to strictly control massing.
    
    const structuralManifest = refinementInstruction || "Create a 3D massing model";
    
    let dataDrivenPrompt = "";
    if (Array.isArray(sectionsOrDescription)) {
        const mainSlopes = sectionsOrDescription.filter(s => s.type === 'main_slope');
        const flatRoofs = sectionsOrDescription.filter(s => s.type === 'flat_roof');
        const extensions = sectionsOrDescription.filter(s => s.type === 'extension');
        const dormers = sectionsOrDescription.filter(s => s.type === 'dormer');
        
        dataDrivenPrompt += `\n**DATA-DRIVEN MASSING CONSTRAINTS (MANDATORY):**\n`;
        dataDrivenPrompt += `- The massing consists of ${mainSlopes.length} Main Body pitched roof slope(s).\n`;
        if (extensions.length > 0) dataDrivenPrompt += `- Intersecting the main body are ${extensions.length} Extension Wing(s).\n`;
        if (flatRoofs.length > 0) dataDrivenPrompt += `- There are ${flatRoofs.length} Flat Roof section(s).\n`;
        if (dormers.length > 0) dataDrivenPrompt += `- There are ${dormers.length} Dormer(s) on the pitched slopes.\n`;
        
        const pitches = [...new Set(sectionsOrDescription.filter(s => s.pitch).map(s => s.pitch))];
        if (pitches.length > 0) {
            dataDrivenPrompt += `- The pitched roofs have angles of approximately ${pitches.join(', ')} degrees.\n`;
        }
        
        dataDrivenPrompt += `- DO NOT hallucinate parallel gables if they do not exist in the mask. STRONGLY ADHERE to the geometric mask provided. Ensure diagonal wings or intersecting valleys are the prominent architectural features if shown in the mask.\n`;
    }
    
    let prompt = `
    ROLE: Architectural Visualization Engine.
    INPUT: A Geometry Mask Image (Text-Labeled).
    
    TASK: Generate a Photorealistic 3D Isometric Render of the building.
    
    **GEOMETRY RULES (STRICT):**
    - LOOK at the provided image (Geometry Mask). It contains TEXT LABELS (e.g. "MAIN ROOF", "EXTENSION").
    - **YOU MUST READ THESE LABELS.**
    - Build the specific roof type EXACTLY where the text label appears on the mask.
    - If the mask says "MAIN ROOF", build the highest roof there.
    - If the mask says "PORCH" or "EXTENSION", build a lower attached structure there.
    - Extrude these exact labeled shapes upwards.
    ${dataDrivenPrompt}
    
    **STRUCTURAL MANIFEST:**
    ${structuralManifest}
    
    **VISUAL GUIDELINES:**
    1. **ROOFING MATERIAL:** All pitched roofs MUST be **Premium Dark Grey Spanish Natural Slate**.
    2. **WALLS:** Clean white render or brick (unless specified).
    3. **STYLE:** High-end architectural visualization. Daylight. 
    4. **NEGATIVE PROMPT:** NO colored overlays. NO red/blue boxes. NO schematic lines. NO text labels in the final 3D output. Real building only.
    `;

    const contents: any[] = [{ text: prompt }];
    
    // Add Layout Mask (preferred) or Clean Plan
    if (layoutMaskBase64) {
        contents.push({ inlineData: { mimeType: "image/jpeg", data: layoutMaskBase64 } });
    } else if (cleanPlanBase64) {
        contents.push({ inlineData: { mimeType: "image/jpeg", data: cleanPlanBase64 } });
    }

    try {
        const response = await generateImage(ai, {
            model: IMAGE_MODEL_PRO,
            contents: { parts: contents },
            config: { imageConfig: { aspectRatio: "4:3", imageSize: "1K" } }
        });

        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                return { base64Image: part.inlineData.data, mimeType: part.inlineData.mimeType };
            }
        }
    } catch (e: any) {
        console.error("3D Gen Failed", e);
        if (e.message) return { base64Image: "", mimeType: "", error: e.message };
    }
    return null;
};

export const generateGenericImage = async (prompt: string): Promise<ImageGenerationResult | null> => {
    const ai = getFreshAiClient();
    try {
        const response = await generateImage(ai, {
            model: IMAGE_MODEL_PRO,
            contents: { parts: [{ text: prompt }] },
            config: { imageConfig: { aspectRatio: "1:1", imageSize: "1K" } }
        });
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                return { base64Image: part.inlineData.data, mimeType: part.inlineData.mimeType };
            }
        }
    } catch(e) { console.error(e); }
    return null;
};

export const reimagineStreetView = async (base64Image: string, prompt: string): Promise<ImageGenerationResult | null> => {
    const ai = getFreshAiClient();
    try {
        // Updated to use correct Pro model for image generation
        const response = await executeRequest(ai, {
            model: IMAGE_MODEL_PRO, 
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                    { text: prompt }
                ]
            },
            config: { imageConfig: { aspectRatio: "1:1", imageSize: "1K" } }
        });
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                return { base64Image: part.inlineData.data, mimeType: part.inlineData.mimeType };
            }
        }
    } catch (e) { console.error(e); }
    return null;
};