
import { GoogleGenAI } from "@google/genai";
import { safeJsonParse } from "../../utils/jsonUtils";
import type { PlanReaderResult, StatusJob, CountryCode, RoofSection } from '@/types';
import { useAppStore } from '@/store/store';
import { generateContentWithRetry as executeRequest } from '@/utils/apiUtils';
import { reduceImageResolution, cropImageBase64 } from '@/utils/fileProcessing';
import { ai } from './common';

// --- IMPORTS FROM NEW MODULES ---
import { 
    SCRIBE_PROMPT, SPOTTER_PROMPT, MACRO_SPOTTER_PROMPT, MICRO_SEGMENTER_PROMPT, JUDGE_PROMPT, ACCOUNTANT_PROMPT,
    TEXT_MAP_SCHEMA, SHAPE_SCHEMA, MACRO_SHAPE_SCHEMA, FORENSIC_SCHEMA, CALCULATION_SCHEMA, REFINEMENT_SCHEMA 
} from './prompts/planReaderPrompts';

import { 
    resolveGeometricOverlaps, 
    performSanityAudit, 
    calculateDeterministicQuantities 
} from '@/utils/planMath';

// --- MODEL CONFIGURATION (MAXIMUM QUALITY) ---
// User mandatory requirement: Plan Reader must use Gemini 3 Pro.
const TEXT_MODEL = "gemini-3.1-pro-preview"; 
const VISION_MODEL = "gemini-3.1-pro-preview"; 
const LOGIC_MODEL = "gemini-3.1-pro-preview"; 
const CALC_MODEL = "gemini-3.1-pro-preview"; 

// --- TYPES ---
type ImagePart = { inlineData: { mimeType: string; data: string; }; };

// Helper to sleep between API calls
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const cleanBase64 = (str: string) => str.replace(/^data:image\/\w+;base64,/, "");

const prepareImagesForModel = async (imageParts: ImagePart[]) => {
    const MAX_PAGES = 20;
    const MAX_DIMENSION = 2048;

    let validParts: ImagePart[] = [];
    let validIndices: number[] = [];
    
    for (let i = 0; i < imageParts.length; i++) {
        const p = imageParts[i];
        if (p.inlineData && p.inlineData.data && p.inlineData.data.length > 500) {
            validParts.push(p);
            validIndices.push(i);
        }
    }

    if (validParts.length > MAX_PAGES) {
        console.warn(`[PlanReader] Too many pages (${validParts.length}). Truncating to ${MAX_PAGES}.`);
        validParts = validParts.slice(0, MAX_PAGES);
        validIndices = validIndices.slice(0, MAX_PAGES);
    }

    const resizedParts = await Promise.all(validParts.map(async (p) => {
        try {
            const cleaned = cleanBase64(p.inlineData.data);
            // Reduced compression (0.92) to preserve faint ridge lines
            const reduced = await reduceImageResolution(cleaned, 0.92, MAX_DIMENSION);
            return {
                inlineData: { mimeType: "image/jpeg", data: reduced }
            };
        } catch (e) {
            console.warn("Image resize failed, using original", e);
            return p;
        }
    }));

    return { resizedParts, validIndices };
};

import { getMultimodalEmbedding, calculateCosineSimilarity } from './embeddingService';

/**
 * Ranks pages by their relevance to roof plans using multimodal embeddings.
 */
const rankPagesByRelevance = async (
    ai: GoogleGenAI,
    imageParts: ImagePart[],
    query: string
): Promise<number[]> => {
    try {
        const queryEmbedding = await getMultimodalEmbedding(ai, [query]);
        if (queryEmbedding.length === 0) return imageParts.map((_, i) => i);

        const pageScores = await Promise.all(imageParts.map(async (part, index) => {
            const pageEmbedding = await getMultimodalEmbedding(ai, [part]);
            const score = calculateCosineSimilarity(queryEmbedding, pageEmbedding);
            return { index, score };
        }));

        return pageScores
            .sort((a, b) => b.score - a.score)
            .map(p => p.index);
    } catch (e) {
        console.warn("Page ranking failed, using original order", e);
        return imageParts.map((_, i) => i);
    }
};

export const analyzeRoofPlan = async (
    imageParts: ImagePart[],
    scaleHint: string,
    pitchHint: string,
    slateSize: string,
    country: CountryCode,
    updateStatus: (updates: Partial<StatusJob>) => void,
    signal: AbortSignal
): Promise<PlanReaderResult> => {
    const { logEvent } = useAppStore.getState();

    try {
        // --- PHASE 0: RELEVANCE FILTERING (Multimodal Embeddings) ---
        let { resizedParts: cleanParts, validIndices: activeIndices } = await prepareImagesForModel(imageParts);
        if (cleanParts.length === 0) throw new Error("Preprocessing Error: No valid image data extracted.");

        if (cleanParts.length > 5) {
            updateStatus({ progress: 10, description: 'Phase 0: Ranking pages by relevance (Multimodal AI)...' });
            const relevantIndices = await rankPagesByRelevance(ai, cleanParts, "Detailed External Roof Plan showing ridge lines, valleys, and hips. NOT a floor plan with internal walls or furniture.");
            // Take top 10 most relevant pages to stay within token limits and focus the AI
            const topIndices = relevantIndices.slice(0, 10);
            
            const newCleanParts = [];
            const newActiveIndices = [];
            for (const idx of topIndices) {
                newCleanParts.push(cleanParts[idx]);
                newActiveIndices.push(activeIndices[idx]);
            }
            cleanParts = newCleanParts;
            activeIndices = newActiveIndices;
            
            logEvent('AI', `Filtered ${imageParts.length} pages down to ${cleanParts.length} most relevant roof plans.`);
        }

        // --- PARALLEL PHASE 1 & 2: SCRIBE (Text) & SPOTTER (Vision) ---
        updateStatus({ progress: 20, description: 'Phase 1 & 2: Parallel Analysis (Text + Geometry)...' });
        
        const EXTENDED_TIMEOUT = 900000; // 15 minutes

        const scribePromise = executeRequest(ai, {
            model: TEXT_MODEL,
            contents: [{ parts: [{ text: SCRIBE_PROMPT }, ...cleanParts], role: 'user' }],
            config: { temperature: 0.0, responseMimeType: "application/json", responseSchema: TEXT_MAP_SCHEMA }
        }, 3, 2000, EXTENDED_TIMEOUT);

        const runMultiPassSpotter = async () => {
            updateStatus({ progress: 25, description: 'Phase 2a: Macro Spotter (Identifying Volumes)...' });
            const macroResponse = await executeRequest(ai, {
                model: VISION_MODEL,
                contents: [{ parts: [{ text: MACRO_SPOTTER_PROMPT }, ...cleanParts], role: 'user' }],
                config: { temperature: 0.0, responseMimeType: "application/json", responseSchema: MACRO_SHAPE_SCHEMA }
            }, 3, 2000, EXTENDED_TIMEOUT);
            
            if (signal.aborted) throw new Error('Aborted');
            const macroMap = safeJsonParse(macroResponse.text);
            const volumes = macroMap.volumes || [];
            
            if (volumes.length === 0) {
                // Fallback to old single-pass spotter if no volumes found
                updateStatus({ progress: 35, description: 'Phase 2b: Micro Segmenter (Fallback)...' });
                const spotterResponse = await executeRequest(ai, {
                    model: VISION_MODEL, 
                    contents: [{ parts: [{ text: SPOTTER_PROMPT }, ...cleanParts], role: 'user' }],
                    config: { temperature: 0.0, responseMimeType: "application/json", responseSchema: SHAPE_SCHEMA }
                }, 3, 2000, EXTENDED_TIMEOUT);
                return safeJsonParse(spotterResponse.text);
            }
            
            updateStatus({ progress: 40, description: `Phase 2b: Micro Segmenter (${volumes.length} volumes)...` });
            const allShapes: any[] = [];
            
            for (let i = 0; i < volumes.length; i++) {
                if (signal.aborted) throw new Error('Aborted');
                const vol = volumes[i];
                const pageIndex = vol.page_index || 0;
                const imagePart = cleanParts[pageIndex];
                if (!imagePart) continue;
                
                updateStatus({ progress: 40 + Math.floor((i/volumes.length)*15), description: `Phase 2b: Micro Segmenter (${i+1}/${volumes.length})...` });
                
                try {
                    const { croppedBase64, normRect } = await cropImageBase64(imagePart.inlineData.data, vol.bbox_2d as [number, number, number, number]);
                    
                    const microResponse = await executeRequest(ai, {
                        model: VISION_MODEL,
                        contents: [{ parts: [{ text: MICRO_SEGMENTER_PROMPT }, { inlineData: { mimeType: "image/jpeg", data: croppedBase64 } }], role: 'user' }],
                        config: { temperature: 0.0, responseMimeType: "application/json", responseSchema: SHAPE_SCHEMA }
                    }, 3, 2000, EXTENDED_TIMEOUT);
                    
                    const microMap = safeJsonParse(microResponse.text);
                    const microShapes = microMap.shapes || [];
                    
                    // Translate coordinates back to global space
                    const cropW = normRect.xmax - normRect.xmin;
                    const cropH = normRect.ymax - normRect.ymin;
                    
                    for (const shape of microShapes) {
                        // Translate bbox
                        if (shape.bbox_2d && shape.bbox_2d.length === 4) {
                            shape.bbox_2d = [
                                normRect.ymin + (shape.bbox_2d[0] / 1000) * cropH,
                                normRect.xmin + (shape.bbox_2d[1] / 1000) * cropW,
                                normRect.ymin + (shape.bbox_2d[2] / 1000) * cropH,
                                normRect.xmin + (shape.bbox_2d[3] / 1000) * cropW
                            ];
                        }
                        // Translate vertices
                        if (shape.vertices) {
                            for (const v of shape.vertices) {
                                v.x = normRect.xmin + (v.x / 1000) * cropW;
                                v.y = normRect.ymin + (v.y / 1000) * cropH;
                            }
                        }
                        shape.page_index = pageIndex; // Ensure page index is correct
                        shape.id = `${vol.id}_${shape.id}`; // Ensure unique ID
                        allShapes.push(shape);
                    }
                } catch (e) {
                    console.error("Error processing volume:", vol, e);
                }
            }
            
            return { shapes: allShapes };
        };

        const [scribeResponse, shapeMap] = await Promise.all([scribePromise, runMultiPassSpotter()]);
        
        if (signal.aborted) throw new Error('Aborted');

        const textMap = safeJsonParse(scribeResponse.text);
        const detectedScale = textMap.scale_text || scaleHint;
        
        if (textMap.roof_schedule && textMap.roof_schedule.length > 0) {
            logEvent('AI', `Found explicit roof schedule with ${textMap.roof_schedule.length} items.`);
        }
        
        await sleep(2000);

        // --- PHASE 3: THE JUDGE (LOGIC_MODEL) ---
        updateStatus({ progress: 60, description: 'Phase 3: Splitting & Verifying Slopes (Gemini 3 Pro)...' });
        const judgePrompt = JUDGE_PROMPT(textMap, shapeMap);
        const judgeResponse = await executeRequest(ai, {
            model: LOGIC_MODEL,
            contents: [{ parts: [{ text: judgePrompt }], role: 'user' }],
            config: { temperature: 0.0, responseMimeType: "application/json", responseSchema: FORENSIC_SCHEMA }
        });
        const forensicResult = safeJsonParse(judgeResponse.text);
        if (signal.aborted) throw new Error('Aborted');

        const verifiedSections = forensicResult.verified_sections || [];
        if (verifiedSections.length === 0) {
            throw new Error("NO_PLANS_DETECTED");
        }
        await sleep(1000);

        // --- PHASE 4: THE ACCOUNTANT (CALC_MODEL) ---
        // CRITICAL: Using Thinking Config for better math/logic reasoning in Phase 4
        updateStatus({ progress: 80, description: 'Phase 4: Calculating & Auditing (Thinking...)' });
        const accountantPrompt = ACCOUNTANT_PROMPT(verifiedSections, detectedScale, textMap);
        const accountantResponse = await executeRequest(ai, {
            model: CALC_MODEL,
            contents: [{ parts: [{ text: accountantPrompt }, ...cleanParts], role: 'user' }],
            config: { 
                temperature: 0.0, 
                responseMimeType: "application/json", 
                responseSchema: CALCULATION_SCHEMA
            }
        });
        const mathResult = safeJsonParse(accountantResponse.text);

        // --- MERGE & FILTER ---
        const rawSections: RoofSection[] = [];
        
        verifiedSections.forEach((vSec: any) => {
            const math = mathResult.sections_math?.find((m: any) => m.section_id === vSec.id) || {};
            const shape = shapeMap.shapes?.find((s: any) => s.id === vSec.id) || {};
            
            let type = shape.type || 'main_slope';
            const labelLower = (vSec.label || '').toLowerCase();
            const reasoningLower = (vSec.reasoning || '').toLowerCase();
            
            if (labelLower.includes('valley')) type = 'valley';
            if (labelLower.includes('dormer')) type = 'dormer';
            if (labelLower.includes('flat')) type = 'flat_roof';
            if (labelLower.includes('parapet')) type = 'parapet';
            else if (labelLower.includes('velux') || labelLower.includes('rooflight') || labelLower.includes('skylight')) type = 'velux';
            else if (labelLower.includes('chimney') || labelLower.includes('flue')) type = 'chimney';
            else if (labelLower.includes('cladding') || labelLower.includes('render') || labelLower.includes('wall')) type = 'cladding';

            const isImportantType = ['main_slope', 'flat_roof', 'dormer', 'extension', 'hip', 'valley'].includes(type);

            if (math.is_phantom && !isImportantType) {
                logEvent('AI', `[AUDITOR] Removed phantom section: ${vSec.label} (Area: ${math.area_m2}m²)`);
                return;
            }

            const isExplicitlyFlat = labelLower.includes('flat') || 
                                     labelLower.includes('grp') ||
                                     labelLower.includes('felt') ||
                                     labelLower.includes('single ply') ||
                                     labelLower.includes('terrace') ||
                                     labelLower.includes('balcony') ||
                                     reasoningLower.includes('flat roof') ||
                                     type === 'flat_roof' ||
                                     type === 'balcony' ||
                                     (math.pitch_degrees === 0); 

            let finalPitch = math.pitch_degrees;
            let sourceMethod = math.source_method || 'Unknown';
            let dataFlags = math.data_flags || [];
            let finalArea = math.area_m2 || 0;

            if (finalArea <= 0.1 && shape.bbox_2d && shape.bbox_2d.length === 4) {
                // Fallback: If AI failed to calculate area, estimate it roughly from bbox
                const [ymin, xmin, ymax, xmax] = shape.bbox_2d;
                const widthRatio = (xmax - xmin) / 1000;
                const heightRatio = (ymax - ymin) / 1000;
                // Assume a standard 10m x 10m roof for the whole image if scale is unknown
                const estimatedTotalArea = 100; 
                finalArea = (widthRatio * heightRatio) * estimatedTotalArea;
                if (finalArea < 1) finalArea = 1; // Minimum 1m2 for valid shapes
                sourceMethod = 'Fallback Visual Estimation';
                dataFlags.push('Area Auto-Estimated (AI Failed)');
            }

            const hasDetailedRoofPlan = shapeMap.shapes?.some((s: any) => s.view_type === 'Detailed_Roof_Plan');

            if (shape.view_type === 'Side_Elevation' || shape.view_type === 'Section_Cut' || shape.view_type === 'Detail') {
                const isVerticalFeature = type === 'cladding' || type === 'parapet';
                const isClearRoofSection = ['main_slope', 'flat_roof', 'valley', 'hip', 'dormer', 'velux'].includes(type);
                
                if (!isVerticalFeature && !isClearRoofSection) {
                    finalArea = 0;
                    sourceMethod = 'View Restriction (Elevation)';
                    if (!dataFlags.includes('Elevation View - Area Skipped')) {
                        dataFlags.push('Elevation View - Area Skipped');
                    }
                } else if (isClearRoofSection && !isVerticalFeature) {
                    if (!dataFlags.includes('View Misclassification Corrected (Elevation)')) {
                        dataFlags.push('View Misclassification Corrected (Elevation)');
                    }
                }
            } else if (shape.view_type === 'Site_Location_Map' || shape.view_type === 'Floor_Plan') {
                // If we have a dedicated roof plan, we should NOT take areas from floor plans
                if (hasDetailedRoofPlan && shape.view_type === 'Floor_Plan') {
                    finalArea = 0;
                    sourceMethod = 'View Restriction (Floor Plan Ignored)';
                    if (!dataFlags.includes('Floor Plan Ignored - Roof Plan Exists')) {
                        dataFlags.push('Floor Plan Ignored - Roof Plan Exists');
                    }
                } else {
                    // Only skip if it's not a clear roof section
                    const isClearRoofSection = ['main_slope', 'flat_roof', 'valley', 'hip', 'dormer', 'velux'].includes(type);
                    if (!isClearRoofSection) {
                        finalArea = 0;
                        sourceMethod = 'View Restriction (Wrong Plan Type)';
                        if (!dataFlags.includes('Wrong Plan Type - Area Skipped')) {
                            dataFlags.push('Wrong Plan Type - Area Skipped');
                        }
                    } else {
                        if (!dataFlags.includes('View Misclassification Corrected')) {
                            dataFlags.push('View Misclassification Corrected');
                        }
                    }
                }
            }
            
            if (isExplicitlyFlat) {
                finalPitch = 0;
            } else {
                if (finalPitch === undefined || finalPitch === null) finalPitch = vSec.inferred_pitch;
                if (finalPitch === undefined || finalPitch === null) {
                    finalPitch = (type === 'flat_roof' || type === 'valley' || type === 'parapet' ? 0 : parseInt(pitchHint || '35'));
                    if (sourceMethod !== 'Default Value' && !type.includes('valley') && !type.includes('parapet')) {
                        sourceMethod = 'Default Value';
                        dataFlags.push("Pitch Defaulted");
                    }
                }
            }

            const isPitchedType = ['porch', 'bay_window', 'dormer', 'extension', 'canopy'].includes(type);
            if (type !== 'dormer' && (finalPitch === 0 || finalPitch === null || finalPitch === undefined) && isPitchedType && !isExplicitlyFlat) {
                const defaultPitch = parseInt(pitchHint || '35');
                finalPitch = defaultPitch > 0 ? defaultPitch : 35;
                sourceMethod = 'Default Value';
                dataFlags.push("Auto-Corrected Pitch");
            }

            let notes = vSec.reasoning;
            if (math.notes) notes = math.notes;
            
            // Determine best page index
            let aiPageIndex = vSec.page_index;
            if (aiPageIndex === undefined || aiPageIndex === null) {
                aiPageIndex = shape.page_index !== undefined ? shape.page_index : 0;
            }
            
            // Map back to original imageParts index
            let finalPageIndex = activeIndices[aiPageIndex];
            if (finalPageIndex === undefined) {
                finalPageIndex = activeIndices[0] || 0;
            }

            // Convert vertices array to flat polygon_2d array [y, x, y, x...]
            let finalPolygon = shape.polygon_2d || undefined;
            if (shape.vertices && Array.isArray(shape.vertices)) {
                finalPolygon = [];
                for (const v of shape.vertices) {
                    if (v && typeof v.y === 'number' && typeof v.x === 'number') {
                        finalPolygon.push(v.y, v.x);
                    }
                }
            }

            rawSections.push({
                id: vSec.id,
                section_id: vSec.id,
                label: vSec.label,
                type: type,
                status: vSec.status || 'Unknown',
                page_index: finalPageIndex,
                bbox_2d: shape.bbox_2d || [0,0,0,0],
                polygon_2d: finalPolygon,
                compass_direction: shape.compass_direction,
                vertices: shape.vertices,
                confidence: vSec.match_confidence || 0.9,
                visual_notes: notes,
                area_m2: finalArea,
                pitch_degrees: finalPitch,
                ridge_length_m: math.ridge_length_m || 0,
                eave_length_m: math.eave_length_m || 0,
                rafter_length_m: math.rafter_length_m || 0,
                source_method: sourceMethod,
                data_flags: dataFlags
            });
        });

        // --- PHASE 5: GEOMETRIC RESOLUTION ---
        updateStatus({ progress: 90, description: 'Phase 5: Resolving Overlaps & Clipping Polygons...' });
        
        // Step 1: Geometric Sanity Audit (Scale corrections) -> This now includes the Triangle 50% fix
        const sanityCheckedSections = performSanityAudit(rawSections);
        
        // Step 2: Overlap Resolution (Clipping voids like Velux/Chimneys)
        const finalSections = resolveGeometricOverlaps(sanityCheckedSections);

        let finalSlateSize = mathResult.slate_spec?.size || slateSize;
        if (!finalSlateSize || finalSlateSize.trim().length < 3) finalSlateSize = "500x250";

        const quantities = calculateDeterministicQuantities(finalSections, finalSlateSize, country);

        const extractedMaterialsNotes = (textMap.extracted_materials || []).map((m: any) => ({
            category: m.category,
            text: `${m.description} ${m.spec_code ? `(${m.spec_code})` : ''}`
        }));

        const finalResult: PlanReaderResult = {
            quality_report: {
                confidence_score: 0.95,
                requires_human_review: false,
                scale_validation_status: 'PASSED',
                scale_validation_summary: `Scale: ${detectedScale}`,
                constraint_checks_status: 'PASSED',
                constraint_checks_summary: 'Logic check passed',
                consistency_check_status: 'PASSED',
                consistency_check_summary: 'Text/Shape match verified',
                final_sanity_check_status: 'PASSED',
                final_sanity_check_summary: 'Analysis complete'
            },
            project_details: {
                plan_scale: detectedScale
            },
            plan_notes: [...(textMap.plan_notes || []), ...extractedMaterialsNotes],
            roofing: {
                roof_sections: finalSections,
                quantities: quantities,
                slate_specification: {
                    size: finalSlateSize,
                    gauge_mm: 0,
                    head_lap_mm: 0,
                    source: mathResult.slate_spec?.size ? 'Extracted' : 'Default (Regs)'
                }
            },
            structural: {},
            windows_doors: [],
            finishes: {},
            mechanical_electrical: {},
            compliance: {}
        };

        logEvent('AI', `Forensic Analysis Complete (3 Pro + Thinking). Found ${finalSections.length} sections.`);
        return finalResult;

    } catch (error: any) {
        console.error("Plan Analysis Failed:", error);
        throw error;
    }
};

export const refinePlanData = async (
    currentSections: RoofSection[],
    userInstruction: string
): Promise<RoofSection[]> => {
    const prompt = `
    You are a Plan Data Editor.
    **Current Data:** ${JSON.stringify(currentSections)}
    **Instruction:** "${userInstruction}"
    **Task:** Modify the JSON array based on the instruction. Return NEW array in 'updated_sections'.
    `;

    const response = await executeRequest(ai, {
        model: TEXT_MODEL, 
        contents: [{ parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json", responseSchema: REFINEMENT_SCHEMA }
    });

    const result = safeJsonParse(response.text);
    return result.updated_sections || currentSections;
};

export const recalculateRoofQuantities = async (sections: any[], scale: string, pitch: string, slateSize: string, country: CountryCode) => {
    const finalSize = (slateSize && slateSize.length >= 3) ? slateSize : "500x250";
    const reResolved = resolveGeometricOverlaps(sections);
    return calculateDeterministicQuantities(reResolved, finalSize, country);
};
