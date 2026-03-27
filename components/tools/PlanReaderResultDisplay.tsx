
import React, { FC, useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/store';
import type { PlanReaderResult, RoofSection } from '@/types';
import { generateVisualSummary3D } from '@/services/ai/imageGenerationService';
import { recalculateRoofQuantities, refinePlanData } from '@/services/ai/planReaderService';
import { pdfToImageBase64, fileToBase64 } from '@/utils/fileProcessing';
import { calculatePolygonArea, resolveGeometricOverlaps, mapPlanDataToEstimatorState } from '@/utils/planMath';
import { printContent } from '@/utils/print';
import { DetailSection, SimpleTable, SourceBadge, ConsistencyDashboard, drawRoofSections } from './plan-reader/PlanReaderShared';
import { InteractiveCanvasOverlay } from './plan-reader/InteractiveCanvasOverlay';
import { generateTakeOffReportHtml } from '@/utils/planReportGenerator';
import { getRegulatoryDisclaimer } from '@/services/roofingStandards';
import { RoofingEstimator } from '../../src/components/tools/roofing-estimator/RoofingEstimator';

interface PlanReaderResultDisplayProps { 
    result: PlanReaderResult; 
    imageFiles: File[]; 
    onDiscard: () => void; 
    onUseForQuote: (data: any) => void; 
    onUpdateResult: (res: PlanReaderResult) => void; 
}

export const PlanReaderResultDisplay: FC<PlanReaderResultDisplayProps> = ({ result, imageFiles, onDiscard, onUseForQuote, onUpdateResult }) => {
    const { leadMarket, showModal } = useAppStore();
    const [verifyMode, setVerifyMode] = useState(true);
    const [debugMode, setDebugMode] = useState(false);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const [minZoom, setMinZoom] = useState(0.1); // Dynamic min zoom
    const [showHighlights, setShowHighlights] = useState(true); // Default to showing overlays
    const [activeTool, setActiveTool] = useState<'drag' | 'slice' | 'measure'>('drag');
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [pageCount, setPageCount] = useState(0);
    
    // State for Manual 3D
    const [isGenerating3D, setIsGenerating3D] = useState(false);
    const [refinementPrompt, setRefinementPrompt] = useState('');
    const [generated3DImage, setGenerated3DImage] = useState<string | null>(null);
    
    // State for AI Refinement
    const [aiCommand, setAiCommand] = useState('');
    const [isRefining, setIsRefining] = useState(false);

    const [isRecalculating, setIsRecalculating] = useState(false);
    const [slateSize, setSlateSize] = useState("500x250");
    const [projectRef, setProjectRef] = useState("");
    const [slateSource, setSlateSource] = useState<'Extracted' | 'Default (Regs)' | 'Manual' | 'Default (Standard)'>('Default (Regs)');
    
    const [editedSections, setEditedSections] = useState(result.roofing.roof_sections as RoofSection[]);
    const [editedQuantities, setEditedQuantities] = useState(result.roofing.quantities);

    // Ref for the image container to get dimensions for canvas and fitting
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const [imgDims, setImgDims] = useState({ width: 0, height: 0 });
    // Store container dims for canvas resizing
    const [containerDims, setContainerDims] = useState({ width: 0, height: 0 });

    const getPageImage = async (targetIndex: number): Promise<string | null> => {
        let currentIndex = 0;
        for (const file of imageFiles) {
            if (file.type === 'application/pdf') {
                const pages = await pdfToImageBase64(file);
                if (targetIndex < currentIndex + pages.length) {
                    return pages[targetIndex - currentIndex];
                }
                currentIndex += pages.length;
            } else {
                if (currentIndex === targetIndex) return await fileToBase64(file);
                currentIndex++;
            }
        }
        return null;
    };

    // Calculate total page count
    useEffect(() => {
        const countPages = async () => {
            let total = 0;
            for (const file of imageFiles) {
                if (file.type === 'application/pdf') {
                    // Quick heuristic, actual count might need lib but we iterate files
                    // For precise count we'd need to load PDF but here we assume simple mapping for now
                    // To keep it simple, we assume pages were flattened correctly in logic
                    // We can just rely on getPageImage returning null to find bound
                    // Or rely on logic in prepareImagesForModel which limits to 8
                    // Let's iterate until getPageImage returns null or hit max
                    // Optimization: Do this properly
                    try {
                        if (file.type === 'application/pdf') {
                            // We need to know PDF length. 
                            // Since `pdfToImageBase64` is heavy, we'll just count 1 per image file and assume PDF has 1 for now 
                            // unless we already have the extracted parts.
                            // Better approach: `result` implies we already processed them.
                            // Let's just try to load up to 10.
                        }
                    } catch(e) {}
                }
                total++;
            }
            // For now, let's just find the max page_index from sections + 1
            const maxIdx = editedSections.reduce((max, s) => Math.max(max, s.page_index || 0), 0);
            setPageCount(maxIdx + 1); // At least show pages up to where we found data
        };
        countPages();
    }, [imageFiles, editedSections]);

    // Initial Load & Auto-Switch to "Best" Page (Roof Plan)
    useEffect(() => {
        const init = async () => {
            // Find page with most "Main Slope" sections
            const pageScores: Record<number, number> = {};
            editedSections.forEach(s => {
                if (s.type === 'main_slope') {
                    pageScores[s.page_index || 0] = (pageScores[s.page_index || 0] || 0) + 1;
                }
            });
            
            let bestPage = 0;
            let maxScore = -1;
            Object.entries(pageScores).forEach(([page, score]) => {
                if (score > maxScore) {
                    maxScore = score;
                    bestPage = parseInt(page);
                }
            });

            // If no clear winner, stick to 0
            if (maxScore === -1) bestPage = 0;
            
            setCurrentPageIndex(bestPage);
            const base64 = await getPageImage(bestPage);
            if (base64) setImageUrl(`data:image/jpeg;base64,${base64}`);
        };
        
        init();

        const extractedSize = result.roofing.slate_specification?.size;
        const isDimension = extractedSize && /\d+[\sxX*]+\d+/.test(extractedSize);

        if (isDimension) {
            setSlateSize(extractedSize);
            setSlateSource(result.roofing.slate_specification.source || 'Extracted');
        } else {
            setSlateSize("500x250");
            setSlateSource('Default (Standard)');
        }
    }, [imageFiles]); // Run once on mount (or if files change)

    // Handle manual page change
    useEffect(() => {
        const loadPage = async () => {
            const base64 = await getPageImage(currentPageIndex);
            if (base64) setImageUrl(`data:image/jpeg;base64,${base64}`);
        };
        loadPage();
    }, [currentPageIndex]);

    useEffect(() => {
        // Resize Observer to keep canvas updated when container changes
        if (containerRef.current) {
            const observer = new ResizeObserver(entries => {
                for (let entry of entries) {
                    setContainerDims({ width: entry.contentRect.width, height: entry.contentRect.height });
                }
            });
            observer.observe(containerRef.current);
            return () => observer.disconnect();
        }
    }, []);

    useEffect(() => {
        const performRecalc = async () => {
            setIsRecalculating(true);
            try {
                const sizeToUse = slateSize && slateSize.trim().length >= 3 ? slateSize : "500x250";
                const newQuantities = await recalculateRoofQuantities(
                    editedSections, 
                    result.project_details?.plan_scale || "1:100", 
                    "35", 
                    sizeToUse, 
                    leadMarket === 'UK' ? 'UK' : 'ES'
                );
                setEditedQuantities(newQuantities);
                
                onUpdateResult({ 
                    ...result, 
                    roofing: { 
                        ...result.roofing, 
                        roof_sections: editedSections, 
                        quantities: newQuantities, 
                        slate_specification: { ...result.roofing.slate_specification, size: sizeToUse, source: 'Manual' } 
                    }
                });
            } catch (e) {
                console.warn("Recalc failed", e);
            } finally {
                setIsRecalculating(false);
            }
        };

        const timer = setTimeout(() => {
            performRecalc();
        }, 500);

        return () => clearTimeout(timer);
    }, [editedSections, slateSize, leadMarket]);

    const ensureApiKey = async () => {
        const win = window as any;
        if (win.aistudio && !await win.aistudio.hasSelectedApiKey()) await win.aistudio.openSelectKey();
    };

    const handleDeleteSection = (index: number) => {
        const newSections = [...editedSections];
        newSections.splice(index, 1);
        setEditedSections(newSections);
    };

    const handleAddSection = () => {
        setEditedSections([...editedSections, {
            id: `manual_${Date.now()}`,
            section_id: `S${editedSections.length + 1}`,
            label: "New Section",
            type: "main_slope",
            status: "Proposed",
            area_m2: 0,
            pitch_degrees: 35,
            visual_notes: "Manually added",
            confidence: 1,
            bbox_2d: [0,0,0,0],
            page_index: currentPageIndex, // Assign to current page
            source_method: 'Manual Input'
        }]);
    };

    const handleUpdateSectionPolygon = (index: number, newPolygon: number[]) => {
        const newSections = [...editedSections];
        // The index passed is relative to the filtered sections for the current page
        // We need to find the actual index in the editedSections array
        const pageSections = editedSections.filter(s => s.page_index === currentPageIndex || (s.page_index === undefined && currentPageIndex === 0));
        const targetSection = pageSections[index];
        const actualIndex = editedSections.findIndex(s => s.id === targetSection.id);
        
        if (actualIndex !== -1) {
            const oldPoly = targetSection.polygon_2d;
            const oldArea = targetSection.area_m2 || 0;
            let newArea = oldArea;
            
            if (oldPoly && oldPoly.length >= 6 && oldArea > 0) {
                const oldNormArea = calculatePolygonArea(oldPoly);
                const newNormArea = calculatePolygonArea(newPolygon);
                if (oldNormArea > 0) {
                    newArea = oldArea * (newNormArea / oldNormArea);
                }
            }

            let ymin = 1000, xmin = 1000, ymax = 0, xmax = 0;
            for (let i = 0; i < newPolygon.length; i += 2) {
                const y = newPolygon[i];
                const x = newPolygon[i+1];
                if (y < ymin) ymin = y;
                if (y > ymax) ymax = y;
                if (x < xmin) xmin = x;
                if (x > xmax) xmax = x;
            }

            newSections[actualIndex].polygon_2d = newPolygon;
            newSections[actualIndex].bbox_2d = [ymin, xmin, ymax, xmax];
            newSections[actualIndex].area_m2 = parseFloat(newArea.toFixed(2));
            
            setEditedSections(newSections);
        }
    };

    const handleSplitSection = (index: number, poly1: number[], poly2: number[]) => {
        const newSections = [...editedSections];
        const pageSections = editedSections.filter(s => s.page_index === currentPageIndex || (s.page_index === undefined && currentPageIndex === 0));
        const targetSection = pageSections[index];
        const actualIndex = editedSections.findIndex(s => s.id === targetSection.id);
        
        if (actualIndex !== -1) {
            const oldPoly = targetSection.polygon_2d;
            const oldArea = targetSection.area_m2 || 0;
            let scale = 0;
            
            if (oldPoly && oldPoly.length >= 6 && oldArea > 0) {
                const oldNormArea = calculatePolygonArea(oldPoly);
                if (oldNormArea > 0) {
                    scale = oldArea / oldNormArea;
                }
            }

            const getBbox = (poly: number[]): [number, number, number, number] => {
                let ymin = 1000, xmin = 1000, ymax = 0, xmax = 0;
                for (let i = 0; i < poly.length; i += 2) {
                    const y = poly[i];
                    const x = poly[i+1];
                    if (y < ymin) ymin = y;
                    if (y > ymax) ymax = y;
                    if (x < xmin) xmin = x;
                    if (x > xmax) xmax = x;
                }
                return [ymin, xmin, ymax, xmax];
            };

            const poly1NormArea = calculatePolygonArea(poly1);
            const poly2NormArea = calculatePolygonArea(poly2);

            // Update original section with poly1
            newSections[actualIndex].polygon_2d = poly1;
            newSections[actualIndex].bbox_2d = getBbox(poly1);
            newSections[actualIndex].area_m2 = parseFloat((poly1NormArea * scale).toFixed(2));
            
            // Create new section with poly2
            const newSection: RoofSection = {
                ...newSections[actualIndex],
                id: `manual_split_${Date.now()}`,
                section_id: `${newSections[actualIndex].section_id}b`,
                label: `${newSections[actualIndex].label || newSections[actualIndex].section_id} (Split)`,
                polygon_2d: poly2,
                bbox_2d: getBbox(poly2),
                area_m2: parseFloat((poly2NormArea * scale).toFixed(2))
            };
            
            newSections.splice(actualIndex + 1, 0, newSection);
            setEditedSections(newSections);
        }
    };

    const handleAiRefinement = async () => {
        if(!aiCommand.trim()) return;
        setIsRefining(true);
        try {
            await ensureApiKey();
            const updatedSections = await refinePlanData(editedSections, aiCommand);
            setEditedSections(updatedSections);
            setAiCommand('');
        } catch(e) {
            await showModal({type:'alert', title:'Refinement Failed', message: 'AI could not process the instruction.'});
        } finally { setIsRefining(false); }
    };

    /**
     * Generates a spatial description of the roof layout relative to the center/main mass.
     */
    const generateSpatialDescription = (sections: RoofSection[]): string => {
        const mainSections = sections.filter(s => s.type === 'main_slope' || s.label.toLowerCase().includes('main'));
        if (mainSections.length === 0) return "A complex roof layout.";

        // Find the "Center of Gravity" of the main roof(s)
        let totalX = 0, totalY = 0, count = 0;
        mainSections.forEach(s => {
            if (s.bbox_2d) {
                const cx = (s.bbox_2d[1] + s.bbox_2d[3]) / 2;
                const cy = (s.bbox_2d[0] + s.bbox_2d[2]) / 2;
                totalX += cx; totalY += cy; count++;
            }
        });
        const centerX = totalX / count;
        const centerY = totalY / count;

        let description = "SPATIAL LAYOUT:\n";
        
        sections.forEach(s => {
            if (s.status !== 'Proposed' || !s.bbox_2d) return;
            // Ignore elevation views for spatial description
            if (s.data_flags?.includes("Elevation View - Area Skipped")) return;

            const cx = (s.bbox_2d[1] + s.bbox_2d[3]) / 2;
            const cy = (s.bbox_2d[0] + s.bbox_2d[2]) / 2;
            
            // Determine relative position
            let hPos = "";
            let vPos = "";
            
            if (cx < centerX - 100) hPos = "Left (West)";
            else if (cx > centerX + 100) hPos = "Right (East)";
            else hPos = "Center";

            if (cy < centerY - 100) vPos = "Top (Rear)";
            else if (cy > centerY + 100) vPos = "Bottom (Front)";
            else vPos = "Center";

            let posStr = (hPos === "Center" && vPos === "Center") ? "Central" : `${vPos} ${hPos}`.trim();
            
            description += `- ${s.label || s.type}: Located at ${posStr}.\n`;
        });

        return description;
    };

    /**
     * Creates a high-contrast B&W "Massing Map" mask for the AI.
     * This acts as a ControlNet-style geometric constraint.
     */
    const generateLayoutMask = async (width: number, height: number): Promise<string | null> => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // 1. Background: White
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        // 2. Draw Sections as Grayscale Blocks
        // Darker = "Higher/More Important" (Main Roof)
        // Lighter = "Lower/Less Important" (Porch/Flat)
        
        // Sort to draw main layers first, then details
        const sorted = [...editedSections].sort((a, b) => {
            const priority = (type: string) => {
                if (type.includes('main')) return 1;
                if (type.includes('extension')) return 2;
                if (type.includes('dormer')) return 3;
                return 4;
            };
            return priority(a.type) - priority(b.type);
        });

        sorted.forEach(s => {
            if (s.status !== 'Proposed' || !s.bbox_2d) return;
            // CRITICAL: Skip Elevation Views
            if (s.data_flags?.includes("Elevation View - Area Skipped")) return;
            // Only draw sections from the CURRENT VIEW/PAGE
            if (s.page_index !== currentPageIndex) return;
            
            const [ymin, xmin, ymax, xmax] = s.bbox_2d;
            const x = xmin * (width / 1000);
            const y = ymin * (height / 1000);
            const w = (xmax - xmin) * (width / 1000);
            const h = (ymax - ymin) * (height / 1000);

            // Color coding for AI interpretation (Grayscale Massing)
            if (s.type.includes('main')) {
                ctx.fillStyle = '#000000'; // Black = Main Mass
            } else if (s.type.includes('extension') || s.type.includes('gable')) {
                ctx.fillStyle = '#444444'; // Dark Grey = Major Additions
            } else if (s.type.includes('flat')) {
                ctx.fillStyle = '#888888'; // Grey = Flat Roofs
            } else {
                ctx.fillStyle = '#CCCCCC'; // Light Grey = Detail/Porch
            }

            ctx.fillRect(x, y, w, h);
            
            // Add a white border to separate distinct masses
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, w, h);

            // 3. TEXT INJECTION: Write the label directly on the mask
            // This forces the AI to read "EXTENSION" at this exact location.
            // Use distinct color (Red/Blue) to stand out against grayscale for Vision Model
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const centerX = x + w / 2;
            const centerY = y + h / 2;
            
            // Shadow for readability
            ctx.fillStyle = 'white'; 
            ctx.fillText((s.label || s.type).toUpperCase(), centerX + 2, centerY + 2);
            
            ctx.fillStyle = 'red'; // Bright Red Text for Label
            ctx.fillText((s.label || s.type).toUpperCase(), centerX, centerY);
        });

        return canvas.toDataURL('image/jpeg', 1.0).split(',')[1];
    };

    const handleGenerate3D = async () => {
        await ensureApiKey();
        setIsGenerating3D(true);
        try {
            // 1. Generate Spatial Description (Text)
            const spatialText = generateSpatialDescription(editedSections);
            
            let structuralDescription = "BUILDING COMPOSITION:\n" + spatialText;
            if (refinementPrompt.trim()) structuralDescription += `\nUSER NOTE: ${refinementPrompt}`;

            // 2. Generate Layout Mask (Image)
            // Use current image dimensions for mask
            const width = imgDims.width || 1024;
            const height = imgDims.height || 1024;
            const layoutMaskBase64 = await generateLayoutMask(width, height);

            // 3. Get Clean Plan (Image)
            const cleanImageBase64 = imageUrl ? imageUrl.split(',')[1] : "";
            
            // 4. Send to AI
            const res = await generateVisualSummary3D(
                editedSections, 
                cleanImageBase64, 
                structuralDescription, 
                undefined, 
                [],
                layoutMaskBase64 || undefined // Pass mask
            );
            
            if (res && res.base64Image) {
                setGenerated3DImage(`data:${res.mimeType};base64,${res.base64Image}`);
            } else {
                throw new Error(res?.error || "AI returned no image.");
            }
        } catch(e: any) {
            console.error("3D Gen Error:", e);
            await showModal({type:'alert', title:'Generation Error', message: e.message || "Failed to generate 3D."});
        } finally { setIsGenerating3D(false); }
    };

    const handlePrintReport = async () => {
        // Ask user if they want the overlay
        const includeOverlay = await showModal({
            type: 'confirm',
            title: 'Print Options',
            message: 'Do you want to include the colored "Visual Overlay" (the red/green highlights) on the plan image in the report?'
        });
        
        let compositeImage = imageUrl;
        
        if (includeOverlay && imageUrl) {
             const img = new Image();
             img.crossOrigin = "Anonymous";
             img.src = imageUrl;
             await new Promise(r => img.onload = r);
             
             const canvas = document.createElement('canvas');
             canvas.width = img.naturalWidth;
             canvas.height = img.naturalHeight;
             const ctx = canvas.getContext('2d');
             if (ctx) {
                 ctx.fillStyle = '#ffffff';
                 ctx.fillRect(0, 0, canvas.width, canvas.height);
                 ctx.drawImage(img, 0, 0);
                 // Only draw sections for current page
                 const sectionsForPage = editedSections.filter(s => s.page_index === currentPageIndex);
                 drawRoofSections(ctx, sectionsForPage, canvas.width, canvas.height);
                 compositeImage = canvas.toDataURL('image/jpeg', 0.8);
             }
        }
        
        const reportHtml = generateTakeOffReportHtml(
            result, 
            editedSections, 
            editedQuantities, 
            slateSize, 
            projectRef, 
            generated3DImage,
            compositeImage 
        );
        printContent(reportHtml, `Take-Off Report${projectRef ? ' - ' + projectRef : ''}`, 'A4');
    };

    // Handle image load to size canvas and FIT TO SCREEN
    const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const { naturalWidth, naturalHeight } = e.currentTarget;
        setImgDims({ width: naturalWidth, height: naturalHeight });

        if (containerRef.current) {
            const containerWidth = containerRef.current.clientWidth;
            const containerHeight = containerRef.current.clientHeight;
            setContainerDims({ width: containerWidth, height: containerHeight });
            
            // Calculate scale to fit entirely within container with a small margin
            const scaleX = (containerWidth - 40) / naturalWidth;
            const scaleY = (containerHeight - 40) / naturalHeight;
            const fitScale = Math.min(scaleX, scaleY);
            
            // Set minimum zoom lower than fit scale to allow shrinking if needed
            const newMinZoom = Math.min(fitScale * 0.8, 0.1);
            setMinZoom(newMinZoom);
            setZoom(fitScale); // Set initial zoom to fit
        }
    };

    // Use country for disclaimer logic
    const country = leadMarket === 'UK' ? 'UK' : leadMarket === 'Spain' ? 'ES' : 'UK';
    const disclaimer = getRegulatoryDisclaimer(country);

    const getEstimatorInitialProject = () => {
        const proposedSections = editedSections.filter(s => s.status === 'Proposed');
        
        // Use the new Data Bridge
        const mappedData = mapPlanDataToEstimatorState(proposedSections, 1); // Assuming scale factor is handled elsewhere or 1 for now if already in meters
        
        if (mappedData) {
            // Determine roof style based on hips
            const hips = proposedSections.filter(s => s.type === 'hip');
            let roofStyle: 'Gable' | 'Hipped' | 'Mono' = 'Gable';
            if (hips.length > 0) roofStyle = 'Hipped';
            
            return {
                ...mappedData,
                roofStyle
            };
        }

        // Fallback to basic logic if mapping fails
        const mainSlopes = proposedSections.filter(s => s.type === 'main_slope');
        const hips = proposedSections.filter(s => s.type === 'hip');
        
        let roofStyle: 'Gable' | 'Hipped' | 'Mono' = 'Gable';
        if (hips.length > 0) roofStyle = 'Hipped';
        
        let pitch = 35;
        let eavesLength = 8.0;
        let span = 6.0;

        if (mainSlopes.length > 0) {
            const main = mainSlopes[0];
            if (main.pitch_degrees) pitch = main.pitch_degrees;
            if (main.eave_length_m) eavesLength = main.eave_length_m;
            if (main.rafter_length_m) {
                // span is roughly 2 * rafter * cos(pitch)
                span = 2 * main.rafter_length_m * Math.cos(pitch * Math.PI / 180);
            } else if (main.area_m2 && main.eave_length_m) {
                const rafter = main.area_m2 / main.eave_length_m;
                span = 2 * rafter * Math.cos(pitch * Math.PI / 180);
            }
        }
        
        if (span < 1.0) span = 6.0;
        if (eavesLength < 1.0) eavesLength = 8.0;

        const features: any[] = [];
        proposedSections.forEach((s, idx) => {
            if (s.type === 'dormer') {
                features.push({
                    id: `feat_${idx}`,
                    type: 'dormer',
                    side: 'front',
                    dormerType: s.pitch_degrees && s.pitch_degrees > 10 ? 'pitched' : 'flat',
                    width: s.eave_length_m || 2,
                    height: s.rafter_length_m || 2,
                    x: 0,
                    y: 2
                });
            } else if (s.type === 'velux' || s.type === 'skylight') {
                features.push({
                    id: `feat_${idx}`,
                    type: 'window',
                    side: 'front',
                    width: 0.78,
                    height: 1.18,
                    x: 1,
                    y: 2
                });
            } else if (s.type === 'chimney') {
                features.push({
                    id: `feat_${idx}`,
                    type: 'chimney',
                    side: 'front',
                    width: 0.6,
                    height: 0.6,
                    x: -1,
                    y: 3
                });
            }
        });

        return {
            roofStyle,
            dimensions: {
                eavesLength: parseFloat(eavesLength.toFixed(2)),
                span: parseFloat(span.toFixed(2)),
                pitch,
                hipPitch: pitch
            },
            features
        };
    };

    const resolvedSections = React.useMemo(() => {
        return resolveGeometricOverlaps(editedSections);
    }, [editedSections]);

    const confidenceScore = result.confidence_score || 'Medium';
    const confidenceColors = {
        'High': 'bg-green-100 text-green-800 border-green-300',
        'Medium': 'bg-yellow-100 text-yellow-800 border-yellow-300',
        'Low': 'bg-red-100 text-red-800 border-red-300'
    };

    return (
        <div className="mt-6 panel bg-white shadow-sm border border-gray-200 text-gray-800">
            
            <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-4">
                <div className="flex-grow">
                    <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold text-gray-800 m-0">Forensic Take-Off Report</h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold border ${confidenceColors[confidenceScore]}`}>
                            {confidenceScore} Confidence
                        </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                        <span>Scale: {result.project_details?.plan_scale || 'Auto'}</span>
                        {result.project_details?.scale_audit && (
                            <span className="text-xs text-gray-400" title={`Detected: ${result.project_details.scale_audit.detected_dimension} on ${result.project_details.scale_audit.pixel_length}px line`}>
                                ({result.project_details.scale_audit.px_per_meter.toFixed(1)} px/m)
                            </span>
                        )}
                        <span className="font-bold text-primary border-l pl-4 border-gray-300">Slate Spec: {slateSize}</span>
                        <div className="flex items-center gap-2 border-l pl-4 border-gray-300">
                            <label className="font-semibold">Project Ref:</label>
                            <input 
                                type="text" 
                                value={projectRef} 
                                onChange={e => setProjectRef(e.target.value)} 
                                placeholder="e.g. Plot 1 - Smith" 
                                className="border border-gray-300 rounded px-2 py-0.5 text-sm w-40 focus:ring-1 focus:ring-primary outline-none bg-white text-gray-900"
                            />
                        </div>
                    </div>
                </div>
                    <div className="flex gap-2">
                        <label className="flex items-center gap-1 text-xs cursor-pointer mr-2 border border-gray-300 rounded px-2 hover:bg-gray-50">
                            <input type="checkbox" checked={debugMode} onChange={e => setDebugMode(e.target.checked)} />
                            Debug Mode
                        </label>
                        <button className="btn secondary" onClick={() => showModal({ type: 'custom', title: '3D Roofing Estimator', content: <div className="w-[90vw] h-[85vh]"><RoofingEstimator initialProject={getEstimatorInitialProject()} /></div> })}>🏗️ 3D Estimator</button>
                        <button className="btn tertiary" onClick={handlePrintReport}>🖨️ Print Report</button>
                        <button className={`btn ${verifyMode ? 'primary' : 'secondary'}`} onClick={() => setVerifyMode(!verifyMode)}>{verifyMode ? 'Exit Edit Mode' : '👁️ Verify & Edit'}</button>
                    </div>
            </div>

            <div className="flex gap-4 h-[75vh]">
                <div className="flex-1 overflow-y-auto bg-gray-50 p-4 rounded border border-gray-200">
                    
                    <ConsistencyDashboard sections={editedSections} quantities={editedQuantities} slateSize={slateSize} />

                    <DetailSection title="📝 Extracted Materials (Roof, Walls, etc.)" defaultOpen>
                        {result.plan_notes && result.plan_notes.length > 0 ? (
                            <div className="space-y-2 text-xs">
                                {result.plan_notes.map((note, i) => (
                                    <div key={i} className="bg-white p-2 rounded border border-gray-100">
                                        <span className="font-bold text-primary uppercase text-[10px] block">{note.category}</span>
                                        <span className="text-gray-800">{note.text}</span>
                                    </div>
                                ))}
                            </div>
                        ) : <p className="text-xs text-text-secondary">No materials found.</p>}
                    </DetailSection>

                    <DetailSection title="🤖 AI Refine" defaultOpen>
                        <div className="mb-3 flex gap-2">
                            <input type="text" value={aiCommand} onChange={e => setAiCommand(e.target.value)} placeholder="Ask AI: 'Delete duplicate S1' or 'Add garage'" className="flex-grow text-xs p-2 border rounded bg-white text-gray-900" />
                            <button className="btn sm secondary" onClick={handleAiRefinement} disabled={isRefining}>{isRefining ? <span className="loader"/> : '🤖 AI Refine'}</button>
                        </div>

                        <div className="mb-2 flex justify-between items-center">
                            <div className="text-xs font-bold text-gray-500">
                                Page: {currentPageIndex + 1}
                            </div>
                            <button 
                                onClick={() => setShowHighlights(!showHighlights)} 
                                className={`btn sm ${showHighlights ? 'primary' : 'tertiary'} text-xs`} 
                                title="Toggle Visual Overlay on Plan"
                            >
                                {showHighlights ? 'Hide Overlays' : 'Show Overlays'}
                            </button>
                        </div>

                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="text-gray-600 bg-gray-100">
                                    <th className="text-left p-2">ID</th>
                                    <th className="p-2">Status</th>
                                    <th className="p-2">Area (m²) / Length (m)</th>
                                    <th className="p-2">Pitch (°)</th>
                                    <th className="p-2">Source</th>
                                    <th className="p-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody>{editedSections.map((s, i) => {
                                const type = s.type.toLowerCase();
                                const isLinear = type.includes('valley') || type.includes('parapet') || type.includes('ridge');
                                const isVoid = ['chimney', 'skylight', 'velux', 'void', 'flue'].some(v => type.includes(v));
                                
                                const resolvedS = resolvedSections.find(rs => rs.id === s.id) || s;
                                
                                let displayValue: string | number = resolvedS.area_m2 ? parseFloat(resolvedS.area_m2.toFixed(2)) : 0;
                                if (isLinear) {
                                    displayValue = (resolvedS.rafter_length_m || resolvedS.ridge_length_m || (resolvedS.area_m2 ? (resolvedS.area_m2 / 0.6) : 0));
                                    if (typeof displayValue === 'number') displayValue = parseFloat(displayValue.toFixed(2));
                                } else if (isVoid) {
                                    displayValue = "-"; 
                                }

                                const isCurrentPage = (s.page_index === currentPageIndex) || (s.page_index === undefined && currentPageIndex === 0);

                                return (
                                <tr key={i} className={`border-b border-gray-200 ${s.status === 'Proposed' ? 'bg-white' : 'bg-gray-100 opacity-75'} ${isCurrentPage ? 'border-l-4 border-l-primary' : 'opacity-60'}`}>
                                    <td className="p-2 text-xs font-medium text-gray-800">
                                        <input type="text" value={s.label || s.section_id} onChange={e => {const n = [...editedSections]; n[i].label = e.target.value; setEditedSections(n)}} className="border-none bg-transparent font-bold w-full focus:outline-none text-gray-900"/>
                                        <div className="text-[10px] text-gray-500">{s.type} {s.page_index !== undefined ? `(P${s.page_index + 1})` : ''}</div>
                                        {resolvedS.visual_notes && <div className="text-[9px] text-purple-600 mt-1 italic">{resolvedS.visual_notes}</div>}
                                    </td>
                                    <td className="p-2">
                                        <select value={s.status} onChange={e => {const n = [...editedSections]; n[i].status = e.target.value as any; setEditedSections(n)}} className="text-xs bg-transparent text-gray-900 font-semibold">
                                            <option value="Proposed">Proposed</option>
                                            <option value="Existing">Existing</option>
                                            <option value="Demolish">Demolish</option>
                                        </select>
                                    </td>
                                    <td className="p-2">
                                        {isVoid ? (
                                            <div className="text-center text-gray-400 text-xs font-mono">-</div>
                                        ) : isLinear ? (
                                            <div className="flex items-center gap-1">
                                                <input 
                                                    type="number" 
                                                    className="w-12 p-1 border border-blue-300 rounded text-xs bg-blue-50 text-blue-900" 
                                                    value={typeof displayValue === 'number' ? displayValue.toFixed(2) : 0} 
                                                    onChange={e => {
                                                        const n = [...editedSections]; 
                                                        n[i].rafter_length_m = parseFloat(e.target.value); 
                                                        n[i].area_m2 = 0; 
                                                        setEditedSections(n);
                                                    }} 
                                                />
                                                <span className="text-xs text-blue-600">m</span>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-1">
                                                    <input 
                                                        type="number" 
                                                        className="w-16 p-1 border border-gray-300 rounded text-xs bg-white text-gray-900 font-bold" 
                                                        value={typeof displayValue === 'number' ? displayValue.toFixed(2) : 0} 
                                                        onChange={e => {
                                                            const n = [...editedSections]; 
                                                            n[i].area_m2 = parseFloat(e.target.value); 
                                                            setEditedSections(n);
                                                        }} 
                                                    />
                                                    <span className="text-xs text-gray-500 font-bold">m²</span>
                                                </div>
                                                {resolvedS.gross_area_m2 !== undefined && resolvedS.pitch_multiplier !== undefined && (
                                                    <div className="text-[10px] text-gray-500 leading-tight">
                                                        (Gross 2D: {(resolvedS.gross_area_m2 / resolvedS.pitch_multiplier).toFixed(1)}m² - Void 2D: {resolvedS.void_area_m2 ? (resolvedS.void_area_m2 / resolvedS.pitch_multiplier).toFixed(1) : '0'}m²) <br/>
                                                        × {resolvedS.pitch_multiplier.toFixed(2)} (Pitch)
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-2">
                                        <input 
                                            type="number" 
                                            className="w-16 p-1 border border-gray-300 rounded text-xs text-right bg-white text-gray-900" 
                                            value={s.pitch_degrees} 
                                            onChange={e => {
                                                const n = [...editedSections]; 
                                                n[i].pitch_degrees = parseFloat(e.target.value); 
                                                setEditedSections(n);
                                            }} 
                                        />
                                    </td>
                                    <td className="p-2">
                                        <SourceBadge method={s.source_method} flags={s.data_flags} />
                                    </td>
                                    <td className="p-2 flex gap-1">
                                        <button className="text-red-500 hover:text-red-700 ml-1" title="Delete" onClick={() => handleDeleteSection(i)}>🗑️</button>
                                        {!isCurrentPage && (
                                            <button className="text-blue-500 hover:text-blue-700 ml-1 text-xs" title="Go to Page" onClick={() => setCurrentPageIndex(s.page_index || 0)}>Go</button>
                                        )}
                                    </td>
                                </tr>
                            )}) }</tbody>
                        </table>
                        <button className="w-full text-center text-xs text-primary mt-2 p-1 hover:bg-gray-100 rounded" onClick={handleAddSection}>+ Add Manual Section</button>
                        
                        <div className="mt-4 p-3 bg-white rounded border border-gray-200">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-bold text-gray-500 block">Slate Size (Required for Quantities)</label>
                                {isRecalculating && <span className="text-xs text-blue-500 animate-pulse">Updating quantities...</span>}
                            </div>
                            <div className="flex gap-2 items-center">
                                <input 
                                    type="text" 
                                    value={slateSize} 
                                    onChange={e => setSlateSize(e.target.value)} 
                                    className="border border-gray-300 rounded p-1 text-sm w-28 font-mono bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" 
                                    placeholder="500x250" 
                                />
                                {slateSource && <span className="text-xs text-gray-400">({slateSource})</span>}
                            </div>
                        </div>
                    </DetailSection>

                    <DetailSection title="🧱 Material Quantities" defaultOpen><SimpleTable data={editedQuantities} /></DetailSection>
                    
                    <DetailSection title="🎨 3D Visualizer">
                        <textarea 
                            value={refinementPrompt} 
                            onChange={e => setRefinementPrompt(e.target.value)} 
                            placeholder="e.g. 'Remove middle bay', 'Add rooflights', 'Change roof to brown tiles'..."
                            className="w-full p-2 text-xs border rounded mb-2 bg-white text-gray-900"
                            rows={2}
                        />
                        <button className="btn w-full sm tertiary" onClick={handleGenerate3D} disabled={isGenerating3D}>
                            {isGenerating3D ? <span className="loader"/> : 'Generate 3D Concept'}
                        </button>
                        {generated3DImage && <div className="mt-2 rounded overflow-hidden border border-border-color"><img src={generated3DImage} className="w-full"/></div>}
                    </DetailSection>
                    
                    {/* DISCLAIMER FOOTER */}
                    <div className="mt-4 p-3 bg-yellow-50/50 border border-yellow-100 rounded text-[10px] text-gray-500 italic leading-tight">
                        <p className="whitespace-pre-line">{disclaimer}</p>
                    </div>
                </div>
                
                <div ref={containerRef} className="flex-1 bg-gray-100 flex items-center justify-center overflow-hidden rounded border border-gray-300 relative">
                    {/* Image Container with absolute centering transform */}
                    <div style={{ 
                        position: 'relative', 
                        transform: `scale(${zoom})`, 
                        transformOrigin: 'center', 
                        transition: 'transform 0.1s',
                        width: imgDims.width > 0 ? imgDims.width : 'auto', // Ensure div has specific size for canvas overlay to attach to
                        height: imgDims.height > 0 ? imgDims.height : 'auto'
                    }}>
                        {imageUrl ? (
                            <>
                                <img 
                                    ref={imgRef} 
                                    src={imageUrl} 
                                    onLoad={onImgLoad} 
                                    className="max-w-none shadow-lg block" 
                                    draggable={false} 
                                />
                                {showHighlights && imgDims.width > 0 && (
                                    <InteractiveCanvasOverlay 
                                        sections={editedSections.filter(s => s.page_index === currentPageIndex || (s.page_index === undefined && currentPageIndex === 0))} 
                                        width={imgDims.width} 
                                        height={imgDims.height} 
                                        activeTool={activeTool}
                                        pxPerMeter={result.project_details?.scale_audit?.px_per_meter}
                                        onUpdateSection={handleUpdateSectionPolygon}
                                        onSplitSection={handleSplitSection}
                                    />
                                )}
                            </>
                        ) : <span className="text-gray-400">No Image</span>}
                    </div>

                    {/* Page Navigation Overlay */}
                    {pageCount > 1 && (
                        <div className="absolute top-4 left-4 bg-white/90 p-2 rounded shadow border border-gray-300 z-10 flex gap-2 items-center">
                            <button 
                                onClick={() => setCurrentPageIndex(p => Math.max(0, p - 1))}
                                disabled={currentPageIndex === 0}
                                className="btn sm bg-white"
                            >
                                &larr;
                            </button>
                            <span className="text-sm font-bold">Page {currentPageIndex + 1} / {pageCount}</span>
                            <button 
                                onClick={() => setCurrentPageIndex(p => p + 1)}
                                // Assuming pageCount is calculated based on highest detected index, allow manual navigation beyond if needed or clamp
                                className="btn sm bg-white"
                            >
                                &rarr;
                            </button>
                        </div>
                    )}

                    <div className="absolute bottom-4 right-4 flex gap-2 z-10">
                        {/* Toolbar */}
                        <div className="bg-white p-1 rounded shadow border border-gray-300 flex gap-1 mr-4">
                            <button 
                                className={`btn sm ${activeTool === 'drag' ? 'primary' : 'bg-white text-gray-700'}`}
                                onClick={() => setActiveTool('drag')}
                                title="Snap & Drag Tool"
                            >
                                🖐️ Drag
                            </button>
                            <button 
                                className={`btn sm ${activeTool === 'slice' ? 'primary' : 'bg-white text-gray-700'}`}
                                onClick={() => setActiveTool('slice')}
                                title="Knife / Split Tool"
                            >
                                🔪 Slice
                            </button>
                            <button 
                                className={`btn sm ${activeTool === 'measure' ? 'primary' : 'bg-white text-gray-700'}`}
                                onClick={() => setActiveTool('measure')}
                                title="Measure Tool"
                            >
                                📏 Measure
                            </button>
                        </div>
                        <div className="bg-white px-2 py-1 rounded text-xs font-mono border border-gray-300 flex items-center">
                            {(zoom * 100).toFixed(0)}%
                        </div>
                        <button 
                            className="btn sm bg-white shadow text-xl font-bold w-8 h-8 flex items-center justify-center" 
                            onClick={() => setZoom(z => Math.min(z + 0.2, 5))}
                            title="Zoom In"
                        >+</button>
                        <button 
                            className="btn sm bg-white shadow text-xl font-bold w-8 h-8 flex items-center justify-center" 
                            onClick={() => setZoom(z => Math.max(z - 0.2, minZoom))}
                            title="Zoom Out"
                        >-</button>
                        <button 
                            className="btn sm bg-white shadow text-xs w-8 h-8 flex items-center justify-center" 
                            onClick={() => {
                                if (imgRef.current && containerRef.current) {
                                    // Re-trigger fit logic
                                    onImgLoad({ currentTarget: imgRef.current } as any);
                                }
                            }}
                            title="Fit to Screen"
                        >Fit</button>
                    </div>
                </div>
            </div>

            <div className="mt-6 flex gap-2 flex-wrap pt-4 border-t border-gray-200">
                <button className="btn green" onClick={() => {
                    const totalArea = editedSections.filter(s => s.status === 'Proposed').reduce((a, b) => a + (b.area_m2 || 0), 0);
                    onUseForQuote({ 
                        roofArea: totalArea, 
                        sections: editedSections.filter(s => s.status === 'Proposed').map(s => ({ name: s.section_id, area: s.area_m2, pitch: s.pitch_degrees })), 
                        slateSize: slateSize,
                        visualImage: generated3DImage
                    });
                }}>Use for Quote</button>
                <button className="btn secondary ml-auto" onClick={onDiscard}>Discard</button>
            </div>
        </div>
    );
};
