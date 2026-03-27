
import type { RoofSection, CountryCode } from '@/types';
import { ProjectState, RoofFeature } from '../src/components/tools/roofing-estimator/types';
import { ROOFING_STANDARDS } from '@/services/roofingStandards';

// --- GEOMETRY UTILS ---

/**
 * Calculates the intersection area of two normalized bounding boxes.
 * Box format: [ymin, xmin, ymax, xmax] (0-1000 scale)
 */
export const calculateIntersectionArea = (bboxA: number[], bboxB: number[]): number => {
    if (!bboxA || !bboxB || bboxA.length < 4 || bboxB.length < 4) return 0;

    // Normalize robustly
    const Ay1 = Math.min(bboxA[0], bboxA[2]);
    const Ay2 = Math.max(bboxA[0], bboxA[2]);
    const Ax1 = Math.min(bboxA[1], bboxA[3]);
    const Ax2 = Math.max(bboxA[1], bboxA[3]);

    const By1 = Math.min(bboxB[0], bboxB[2]);
    const By2 = Math.max(bboxB[0], bboxB[2]);
    const Bx1 = Math.min(bboxB[1], bboxB[3]);
    const Bx2 = Math.max(bboxB[1], bboxB[3]);

    const x_overlap = Math.max(0, Math.min(Ax2, Bx2) - Math.max(Ax1, Bx1));
    const y_overlap = Math.max(0, Math.min(Ay2, By2) - Math.max(Ay1, By1));

    return x_overlap * y_overlap;
};

/**
 * Calculates the raw area of a normalized bounding box.
 */
export const calculateBoxArea = (bbox: number[]): number => {
    if (!bbox || bbox.length < 4) return 0;
    const width = Math.abs(bbox[3] - bbox[1]);
    const height = Math.abs(bbox[2] - bbox[0]);
    return width * height;
}

/**
 * NEW: Calculates precise area of a polygon using the Shoelace Formula.
 * Used to correct AI area estimations for triangles (Hips/Valleys).
 */
export const calculatePolygonArea = (flatCoords: number[]): number => {
    if (!flatCoords || flatCoords.length < 6) return 0; // Need at least 3 points (6 coords)
    
    let area = 0;
    const numPoints = flatCoords.length / 2;

    for (let i = 0; i < numPoints; i++) {
        const y1 = flatCoords[i * 2];
        const x1 = flatCoords[i * 2 + 1];
        
        const nextIndex = (i + 1) % numPoints;
        const y2 = flatCoords[nextIndex * 2];
        const x2 = flatCoords[nextIndex * 2 + 1];

        // Shoelace formula: (x1 * y2) - (y1 * x2)
        // Note: Our array is [y, x, y, x], so index 0 is y, 1 is x.
        area += (x1 * y2) - (y1 * x2);
    }

    return Math.abs(area) / 2;
};

/**
 * Checks if a point (x, y) is inside a polygon defined by flatCoords [y, x, y, x...]
 */
export const isPointInPolygon = (x: number, y: number, flatCoords: number[]): boolean => {
    let inside = false;
    const numPoints = flatCoords.length / 2;
    for (let i = 0, j = numPoints - 1; i < numPoints; j = i++) {
        const yi = flatCoords[i * 2];
        const xi = flatCoords[i * 2 + 1];
        const yj = flatCoords[j * 2];
        const xj = flatCoords[j * 2 + 1];
        
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

/**
 * Checks if polygon A is mostly inside polygon B
 */
export const isPolygonInside = (polyA: number[], polyB: number[]): boolean => {
    if (!polyA || !polyB || polyA.length < 6 || polyB.length < 6) return false;
    
    let insideCount = 0;
    const numPointsA = polyA.length / 2;
    for (let i = 0; i < numPointsA; i++) {
        const y = polyA[i * 2];
        const x = polyA[i * 2 + 1];
        if (isPointInPolygon(x, y, polyB)) {
            insideCount++;
        }
    }
    
    // Consider it inside if at least half the points are inside
    return insideCount >= (numPointsA / 2);
};

interface Point { x: number; y: number; }
interface Segment { p1: Point; p2: Point; length: number; }

const getSegments = (flatCoords: number[]): Segment[] => {
    const segs: Segment[] = [];
    const n = flatCoords.length / 2;
    for (let i = 0; i < n; i++) {
        const y1 = flatCoords[i * 2];
        const x1 = flatCoords[i * 2 + 1];
        const next = (i + 1) % n;
        const y2 = flatCoords[next * 2];
        const x2 = flatCoords[next * 2 + 1];
        const length = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
        if (length > 0) {
            segs.push({ p1: {x: x1, y: y1}, p2: {x: x2, y: y2}, length });
        }
    }
    return segs;
};

const getSharedLength = (segA: Segment, segB: Segment, epsilon: number = 30): number => {
    const dxA = segA.p2.x - segA.p1.x;
    const dyA = segA.p2.y - segA.p1.y;
    const dxB = segB.p2.x - segB.p1.x;
    const dyB = segB.p2.y - segB.p1.y;
    
    const lenA = segA.length;
    const lenB = segB.length;
    
    // Parallel Check: Are the angles within ~25 degrees? (cos(25) ≈ 0.90)
    const dot = Math.abs((dxA * dxB + dyA * dyB) / (lenA * lenB));
    if (dot < 0.90) return 0; // Not parallel enough

    // Proximity Check: Shortest distance from segB endpoints to infinite line A
    const cross1 = (dyA * (segB.p1.x - segA.p1.x) - dxA * (segB.p1.y - segA.p1.y)) / lenA;
    const cross2 = (dyA * (segB.p2.x - segA.p1.x) - dxA * (segB.p2.y - segA.p1.y)) / lenA;
    
    const dist1 = Math.abs(cross1);
    const dist2 = Math.abs(cross2);
    
    // If both points are further than epsilon AND on the same side, they don't touch
    if (dist1 > epsilon && dist2 > epsilon && (cross1 * cross2 > 0)) {
        return 0; // Too far apart
    }

    // Overlap Calculation: Project Segment B onto Segment A
    const proj1 = ((segB.p1.x - segA.p1.x) * dxA + (segB.p1.y - segA.p1.y) * dyA) / lenA;
    const proj2 = ((segB.p2.x - segA.p1.x) * dxA + (segB.p2.y - segA.p1.y) * dyA) / lenA;
    
    const minProj = Math.min(proj1, proj2);
    const maxProj = Math.max(proj1, proj2);
    
    const overlapStart = Math.max(0, minProj);
    const overlapEnd = Math.min(lenA, maxProj);
    
    const overlap = overlapEnd - overlapStart;
    
    // Return overlap if it's meaningful (e.g., > 10 pixels)
    return overlap > 10 ? overlap : 0;
};

export const estimateSharedEdges = (sections: RoofSection[]) => {
    let ridgeM = 0;
    let valleyM = 0;
    let hipM = 0;

    const validSections = sections.filter(s => s.polygon_2d && s.polygon_2d.length >= 6 && s.area_m2 && s.area_m2 > 0 && s.type !== 'flat_roof' && s.type !== 'parapet');
    
    for (let i = 0; i < validSections.length; i++) {
        for (let j = i + 1; j < validSections.length; j++) {
            const A = validSections[i];
            const B = validSections[j];

            if (!A.bbox_2d || !B.bbox_2d) continue;

            const segsA = getSegments(A.polygon_2d!);
            const segsB = getSegments(B.polygon_2d!);

            let sharedLengthNorm = 0;
            let isDiagonal = false;

            for (const sa of segsA) {
                for (const sb of segsB) {
                    const overlap = getSharedLength(sa, sb, 30); // Fuzzy snapping tolerance
                    if (overlap > 10) {
                        sharedLengthNorm += overlap;
                        const dx = Math.abs(sa.p2.x - sa.p1.x);
                        const dy = Math.abs(sa.p2.y - sa.p1.y);
                        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                        if (angle > 15 && angle < 75) {
                            isDiagonal = true;
                        }
                    }
                }
            }

            if (sharedLengthNorm > 0) {
                const areaA_norm = calculatePolygonArea(A.polygon_2d!);
                const areaB_norm = calculatePolygonArea(B.polygon_2d!);
                const scaleA = areaA_norm > 0 ? Math.sqrt(A.area_m2! / areaA_norm) : 0;
                const scaleB = areaB_norm > 0 ? Math.sqrt(B.area_m2! / areaB_norm) : 0;
                const scale = (scaleA + scaleB) / 2;

                const realLength = sharedLengthNorm * scale;

                if (!isDiagonal) {
                    ridgeM += realLength;
                } else {
                    const bboxOverlap = calculateIntersectionArea(A.bbox_2d, B.bbox_2d);
                    const minBboxArea = Math.min(calculateBoxArea(A.bbox_2d), calculateBoxArea(B.bbox_2d));
                    const overlapRatio = minBboxArea > 0 ? bboxOverlap / minBboxArea : 0;
                    
                    if (overlapRatio > 0.15) {
                        hipM += realLength;
                    } else {
                        valleyM += realLength;
                    }
                }
            }
        }
    }

    return { ridgeM, valleyM, hipM };
};

/**
 * NEW: Corrects the area based on the geometric fill ratio.
 * If AI calculates BBox Area (210m2) for a Triangle, this logic 
 * detects the polygon covers only 50% of the box and corrects to 105m2.
 */
export const applyGeometricCorrection = (section: RoofSection): RoofSection => {
    let correctedSection = { ...section };

    // 1. Apply Pitch Multiplier if area was visually estimated (footprint area)
    if (correctedSection.source_method === 'Visual Estimation' && correctedSection.pitch_degrees && correctedSection.pitch_degrees > 0) {
        if (!correctedSection.data_flags?.includes("Pitch Multiplier Applied")) {
            const pitchRadians = correctedSection.pitch_degrees * (Math.PI / 180);
            const pitchFactor = 1 / Math.cos(pitchRadians);
            correctedSection.area_m2 = parseFloat((correctedSection.area_m2 * pitchFactor).toFixed(2));
            correctedSection.visual_notes = (correctedSection.visual_notes || '') + ` [Math: Pitch Factor ${pitchFactor.toFixed(2)}x Applied]`;
            correctedSection.data_flags = [...(correctedSection.data_flags || []), "Pitch Multiplier Applied"];
        }
    }

    // Only correct if we have a polygon and an area
    if (!correctedSection.polygon_2d || correctedSection.polygon_2d.length < 6 || !correctedSection.area_m2 || !correctedSection.bbox_2d) {
        // Fallback: If no polygon but type is Hip/Valley, force 0.5 factor heuristic
        if (correctedSection.area_m2 && (correctedSection.type === 'hip' || correctedSection.type === 'valley')) {
            // Check if it hasn't been corrected yet
            if (!correctedSection.visual_notes?.includes('Geometric Correction')) {
                return {
                    ...correctedSection,
                    area_m2: parseFloat((correctedSection.area_m2 * 0.5).toFixed(2)), // Triangle is exactly half of rectangle
                    visual_notes: (correctedSection.visual_notes || '') + " [Math: Triangular Heuristic (0.5) Applied]",
                    data_flags: [...(correctedSection.data_flags || []), "Area Corrected (Triangle)"]
                };
            }
        }
        return correctedSection;
    }

    const boxArea = calculateBoxArea(correctedSection.bbox_2d);
    const polyArea = calculatePolygonArea(correctedSection.polygon_2d);

    if (boxArea <= 0) return correctedSection;

    // Fill Ratio: How much of the bounding box does the shape actually occupy?
    // Rectangle = ~1.0, Triangle = ~0.5
    const fillRatio = polyArea / boxArea;

    // If the ratio is significantly less than 1 (e.g. < 0.8), the AI likely calculated BBox area
    // instead of the specific shape area. We should correct it.
    if (fillRatio < 0.85) {
        const finalArea = correctedSection.area_m2 * fillRatio;
        
        return {
            ...correctedSection,
            area_m2: parseFloat(finalArea.toFixed(2)),
            visual_notes: (correctedSection.visual_notes || '') + ` [Math: Polygon Fill ${Math.round(fillRatio*100)}%]`,
            data_flags: [...(correctedSection.data_flags || []), "Area Corrected (Geometry)"]
        };
    }

    return correctedSection;
};

// --- DEDUPLICATION: REMOVE SPATIAL CLONES ---
// If two sections have > 65% overlap (IoU), they are likely duplicates or the "Whole Roof" vs "One Slope" issue.
export const removeSpatialDuplicates = (sections: RoofSection[]): RoofSection[] => {
    const validSections = [...sections];
    const toRemove = new Set<string>();

    for (let i = 0; i < validSections.length; i++) {
        if (toRemove.has(validSections[i].id)) continue;
        
        for (let j = i + 1; j < validSections.length; j++) {
            if (toRemove.has(validSections[j].id)) continue;

            const A = validSections[i];
            const B = validSections[j];

            if (!A.bbox_2d || !B.bbox_2d) continue;

            const areaA = calculateBoxArea(A.bbox_2d);
            const areaB = calculateBoxArea(B.bbox_2d);
            const intersection = calculateIntersectionArea(A.bbox_2d, B.bbox_2d);
            
            // Calculate Overlap Percentage relative to the SMALLER box
            const minArea = Math.min(areaA, areaB);
            if (minArea <= 0) continue;
            
            // IoU Check (Standard Object Detection Metric)
            const union = areaA + areaB - intersection;
            const iou = union > 0 ? intersection / union : 0;

            if (iou > 0.65) {
                const structuralTypes = ['main_slope', 'flat_roof', 'extension', 'hip', 'valley'];
                const isAStructural = structuralTypes.includes(A.type);
                const isBStructural = structuralTypes.includes(B.type);

                if (isAStructural && !isBStructural) {
                    toRemove.add(B.id);
                } else if (!isAStructural && isBStructural) {
                    toRemove.add(A.id);
                } else {
                    if (A.confidence >= B.confidence) toRemove.add(B.id);
                    else toRemove.add(A.id);
                }
            }
        }
    }

    return validSections.filter(s => !toRemove.has(s.id));
};

// --- LOGIC: RESOLVE GEOMETRIC OVERLAPS (CLIPPING) ---
export const resolveGeometricOverlaps = (sections: RoofSection[]): RoofSection[] => {
    // 0. Pre-clean duplicates
    let resolvedSections = removeSpatialDuplicates(sections);

    // 1. Define Strict Hierarchy (Lower index = Top Layer / Void Generator)
    const HIERARCHY = [
        'chimney', 'skylight', 'velux', 'void', // True Voids (Always cut)
        'parapet',                      // Walls
        'solar_panel', 'pv',            
        'dormer',                       // Sits on top
        'valley',                       // Linear cut
        'terrace', 'balcony',           // Walkable flat areas
        'flat_roof',                    // Flat areas
        'porch', 'canopy', 'bay_window',// Small pitched features
        'extension',                    // Medium pitched
        'main_slope',                   // Base layer
        'hip', 'ridge'
    ];

    const getPriority = (type: string) => {
        const t = (type || '').toLowerCase();
        const idx = HIERARCHY.findIndex(h => t.includes(h));
        return idx === -1 ? 999 : idx;
    };

    // Deep copy to avoid mutating state directly during calc
    resolvedSections = JSON.parse(JSON.stringify(resolvedSections)) as RoofSection[];

    // Initialize gross_area and void_area
    resolvedSections.forEach(s => {
        if (s.area_m2 !== undefined && s.gross_area_m2 === undefined) {
            s.gross_area_m2 = s.area_m2;
            s.void_area_m2 = 0;
            if (s.pitch_degrees) {
                s.pitch_multiplier = 1 / Math.cos(s.pitch_degrees * Math.PI / 180);
            } else {
                s.pitch_multiplier = 1;
            }
        }
    });

    // 2. Sort by Priority (Top Layers First)
    resolvedSections.sort((a, b) => getPriority(a.type) - getPriority(b.type));

    // 3. Perform "Percentile Subtraction"
    for (let i = 0; i < resolvedSections.length; i++) {
        const topSection = resolvedSections[i];
        if (!topSection.bbox_2d || topSection.status === 'Demolish') continue;
        if (calculateBoxArea(topSection.bbox_2d) <= 0) continue;

        const topType = topSection.type.toLowerCase();
        
        const isNonClippingFeature = topType.includes('solar') || topType.includes('pv');
        const isVoidGenerator = topType.includes('flat') || 
                                topType.includes('terrace') || 
                                topType.includes('balcony') || 
                                topType.includes('skylight') || 
                                topType.includes('chimney') || 
                                topType.includes('dormer') ||
                                topType.includes('velux') ||
                                topType.includes('void');

        if (isNonClippingFeature && !isVoidGenerator) continue;

        for (let j = i + 1; j < resolvedSections.length; j++) {
            const bottomSection = resolvedSections[j];
            if (!bottomSection.bbox_2d || bottomSection.status === 'Demolish') continue;

            const bottomBoxArea = calculateBoxArea(bottomSection.bbox_2d);
            if (bottomBoxArea <= 0) continue;

            const topBoxArea = calculateBoxArea(topSection.bbox_2d);
            if (topBoxArea <= 0) continue;

            const overlapArea = calculateIntersectionArea(topSection.bbox_2d, bottomSection.bbox_2d);
            
            if (overlapArea > 0) {
                const overlapRatioOfTop = overlapArea / topBoxArea;

                if (isVoidGenerator && overlapRatioOfTop > 0.05) {
                    if (bottomSection.area_m2 && bottomSection.area_m2 > 0 && topSection.area_m2 && topSection.area_m2 > 0) {
                        const areaToDeduct = topSection.area_m2 * overlapRatioOfTop;
                        bottomSection.area_m2 -= areaToDeduct;
                        if (bottomSection.void_area_m2 !== undefined) {
                            bottomSection.void_area_m2 += areaToDeduct;
                        }
                        if (bottomSection.area_m2 < 0) bottomSection.area_m2 = 0;

                        if (!bottomSection.visual_notes) bottomSection.visual_notes = "";
                        const clipNote = ` [Clipped -${areaToDeduct.toFixed(1)}m² by ${topSection.label || topSection.type}]`;
                        if (!bottomSection.visual_notes.includes(clipNote)) {
                            bottomSection.visual_notes += clipNote;
                        }
                        if (!bottomSection.data_flags) bottomSection.data_flags = [];
                        if (!bottomSection.data_flags.includes("Overlap Corrected")) {
                            bottomSection.data_flags.push("Overlap Corrected");
                        }
                    }
                }
            }
        }
    }

    return resolvedSections;
};

// --- SANITY AUDIT: SCALE CHECK ---
export const performSanityAudit = (sections: RoofSection[]): RoofSection[] => {
    // First, apply geometric corrections (The "210" fix for triangles)
    const geomCorrectedSections = sections.map(applyGeometricCorrection);

    const mainSlopes = geomCorrectedSections.filter(s => s.type === 'main_slope' && s.area_m2 && s.area_m2 > 10);
    if (mainSlopes.length === 0) return geomCorrectedSections;

    // Find the largest "Reference" main slope
    const maxMainSlope = mainSlopes.reduce((prev, current) => (prev.area_m2! > current.area_m2!) ? prev : current);
    const maxArea = maxMainSlope.area_m2!;
    const maxBboxArea = calculateBoxArea(maxMainSlope.bbox_2d);

    if (maxBboxArea <= 0) return geomCorrectedSections;

    return geomCorrectedSections.map(s => {
        if (s.id === maxMainSlope.id) return s;
        
        const t = s.type.toLowerCase();
        const label = (s.label || '').toLowerCase();
        const isSmallFeature = t.includes('valley') || t.includes('link') || t.includes('porch') || label.includes('wedge') || label.includes('center');

        if (isSmallFeature && s.bbox_2d && s.area_m2) {
            const currentBboxArea = calculateBoxArea(s.bbox_2d);
            const visualRatio = currentBboxArea / maxBboxArea; 
            const reportedAreaRatio = s.area_m2 / maxArea;

            if (reportedAreaRatio > (visualRatio * 3)) {
                const correctedArea = maxArea * visualRatio * 1.2;
                
                return {
                    ...s,
                    area_m2: parseFloat(correctedArea.toFixed(2)),
                    visual_notes: (s.visual_notes || '') + ` [AUTO-FIX: Scale Audit reduced from ${s.area_m2}m²]`,
                    data_flags: [...(s.data_flags || []), "Scale Alert Triggered"]
                };
            }
        }
        return s;
    });
};

// --- DATA BRIDGE FOR 3D ESTIMATOR ---
export function mapPlanDataToEstimatorState(
    sections: RoofSection[],
    defaultScaleFactor: number = 1 // pixels to meters fallback
): Partial<ProjectState> | null {
    if (!sections || sections.length === 0) return null;

    // 1. Find the largest main slope to act as the primary reference
    const mainSlopes = sections.filter(s => s.type === 'main_slope' && s.polygon_2d && s.polygon_2d.length > 0);
    if (mainSlopes.length === 0) return null;

    let maxSlope = mainSlopes[0];
    let maxAreaPx = calculatePolygonArea(maxSlope.polygon_2d!);
    for (const slope of mainSlopes) {
        const areaPx = calculatePolygonArea(slope.polygon_2d!);
        if (areaPx > maxAreaPx) {
            maxAreaPx = areaPx;
            maxSlope = slope;
        }
    }

    const pitch = maxSlope.pitch_degrees || 35;
    let scaleFactor = defaultScaleFactor;

    // Calculate actual scale factor if area_m2 is provided
    if (maxSlope.area_m2 && maxAreaPx > 0) {
        const pitchRad = pitch * (Math.PI / 180);
        const area2d_m2 = maxSlope.area_m2 * Math.cos(pitchRad);
        scaleFactor = Math.sqrt(area2d_m2 / maxAreaPx);
    }

    // 2. Calculate Main Eaves and Span
    const poly = maxSlope.polygon_2d!;
    let lowestY = -1;
    let highestY = 10000;
    
    // Find the lowest horizontal-ish line (eaves)
    let eavesLengthPx = 0;
    let ridgeY = 0;
    let eavesY = 0;

    for (let i = 0; i < poly.length; i += 2) {
        const y = poly[i];
        if (y > lowestY) lowestY = y;
        if (y < highestY) highestY = y;
    }

    // Find the segment that is closest to lowestY (assuming bottom of image is eaves)
    for (let i = 0; i < poly.length; i += 2) {
        const y1 = poly[i];
        const x1 = poly[i+1];
        const nextIdx = (i + 2) % poly.length;
        const y2 = poly[nextIdx];
        const x2 = poly[nextIdx+1];

        // If both points are near the bottom
        if (Math.abs(y1 - lowestY) < 50 && Math.abs(y2 - lowestY) < 50) {
            eavesLengthPx = Math.abs(x2 - x1);
            eavesY = (y1 + y2) / 2;
            break;
        }
    }

    // If no clear horizontal eaves found, just use bounding box width
    if (eavesLengthPx === 0) {
        let minX = 10000, maxX = -1;
        for (let i = 1; i < poly.length; i += 2) {
            if (poly[i] < minX) minX = poly[i];
            if (poly[i] > maxX) maxX = poly[i];
        }
        eavesLengthPx = maxX - minX;
        eavesY = lowestY;
    }

    ridgeY = highestY; // Assuming top of polygon is ridge

    let eavesLengthM = eavesLengthPx * scaleFactor;
    // Span is horizontal distance from eaves to ridge * 2 (assuming symmetrical gable)
    let spanM = Math.abs(eavesY - ridgeY) * scaleFactor * 2;

    // Fallback if scale factor is clearly wrong or values are extreme (e.g., eaves > 100m)
    if (eavesLengthM > 100 || eavesLengthM < 1 || isNaN(eavesLengthM)) {
        // Assume a typical eaves length of 8m and recalculate scale factor
        scaleFactor = eavesLengthPx > 0 ? 8 / eavesLengthPx : 1;
        eavesLengthM = 8;
        spanM = Math.abs(eavesY - ridgeY) * scaleFactor * 2;
    }
    
    // Clamp span as well
    if (spanM > 100 || spanM < 1 || isNaN(spanM)) {
        spanM = 6; // Typical span
    }

    // 3. Map Features (Velux, Dormers)
    const features: RoofFeature[] = [];
    const featureSections = sections.filter(s => s.type === 'velux' || s.type === 'dormer');

    for (const fs of featureSections) {
        if (!fs.polygon_2d || fs.polygon_2d.length < 6) continue;

        // Find parent slope
        let parentSlope = maxSlope; // Default to max slope
        for (const ms of mainSlopes) {
            if (isPolygonInside(fs.polygon_2d, ms.polygon_2d!)) {
                parentSlope = ms;
                break;
            }
        }

        // Calculate feature dimensions
        let fMinX = 10000, fMaxX = -1, fMinY = 10000, fMaxY = -1;
        for (let i = 0; i < fs.polygon_2d.length; i += 2) {
            const y = fs.polygon_2d[i];
            const x = fs.polygon_2d[i+1];
            if (x < fMinX) fMinX = x;
            if (x > fMaxX) fMaxX = x;
            if (y < fMinY) fMinY = y;
            if (y > fMaxY) fMaxY = y;
        }

        const widthM = (fMaxX - fMinX) * scaleFactor;
        const heightM = (fMaxY - fMinY) * scaleFactor;

        // Calculate relative position to parent slope's eaves
        // Find parent eaves Y
        let pLowestY = -1;
        for (let i = 0; i < parentSlope.polygon_2d!.length; i += 2) {
            if (parentSlope.polygon_2d![i] > pLowestY) pLowestY = parentSlope.polygon_2d![i];
        }
        
        // Find parent center X
        let pMinX = 10000, pMaxX = -1;
        for (let i = 1; i < parentSlope.polygon_2d!.length; i += 2) {
            if (parentSlope.polygon_2d![i] < pMinX) pMinX = parentSlope.polygon_2d![i];
            if (parentSlope.polygon_2d![i] > pMaxX) pMaxX = parentSlope.polygon_2d![i];
        }
        const pCenterX = (pMinX + pMaxX) / 2;

        // Feature center
        const fCenterX = (fMinX + fMaxX) / 2;

        // X offset from center
        const offsetX = (fCenterX - pCenterX) * scaleFactor;
        
        // Y offset from eaves (up the slope)
        // 2D distance from eaves line straight up to Velux bottom
        const dist2D = Math.abs(pLowestY - fMaxY) * scaleFactor;
        // True distance up the slope = 2D distance / cos(pitch)
        const pitchRad = pitch * (Math.PI / 180);
        const offsetY = dist2D / Math.cos(pitchRad);

        features.push({
            id: fs.id,
            type: fs.type === 'velux' ? 'window' : 'dormer',
            side: 'front', // Defaulting to front for now
            width: Math.min(20, Math.max(0.5, isNaN(widthM) ? 1 : widthM)), // Ensure minimums and maximums
            height: Math.min(20, Math.max(0.5, isNaN(heightM) ? 1 : heightM)),
            x: isNaN(offsetX) ? 0 : offsetX,
            y: Math.min(50, Math.max(0, isNaN(offsetY) ? 0 : offsetY))
        });
    }

    return {
        dimensions: {
            eavesLength: Math.max(1, parseFloat(eavesLengthM.toFixed(2))),
            span: Math.max(1, parseFloat(spanM.toFixed(2))),
            pitch: pitch,
            hipPitch: pitch
        },
        features: features
    };
}

// --- QUANTITY CALCULATION ---
export function calculateDeterministicQuantities(
    sections: RoofSection[], 
    slateSize: string, 
    country: CountryCode
) {
    const standard = ROOFING_STANDARDS[country] || ROOFING_STANDARDS['UK'];
    let totalFullSlates = 0;
    let totalBattens = 0;
    let totalPitchedUnderlay = 0;
    let totalFlatMembrane = 0;
    let totalHalfSlates = 0;
    let totalRidge = 0;
    let totalSlateAndHalf = 0;
    let totalValley = 0;
    let totalParapet = 0;
    let totalHip = 0;

    let width = 250; 
    let length = 500;
    if (slateSize && slateSize.trim().length >= 3) {
        const dims = slateSize.match(/(\d+)\D+(\d+)/);
        if (dims) {
            const val1 = parseInt(dims[1]);
            const val2 = parseInt(dims[2]);
            length = Math.max(val1, val2);
            width = Math.min(val1, val2);
        }
    }

    const activeSections = sections.filter(s => s.status !== 'Demolish');

    activeSections.forEach(section => {
        const area = section.area_m2 || 0;
        const pitch = section.pitch_degrees || 0;
        const type = section.type.toLowerCase();
        
        if (type.includes('cladding') || type.includes('wall')) {
            return;
        }

        if (['chimney', 'skylight', 'velux', 'void', 'flue'].some(t => type.includes(t))) {
            return; 
        }

        if (type.includes('parapet')) {
            let linearM = section.ridge_length_m || section.rafter_length_m;
            if (!linearM && area > 0) {
                 linearM = area / 0.3; 
            }
            totalParapet += Math.ceil((linearM || 5) * 1.1);
            return; 
        }

        if (type === 'ridge' || type === 'verge') {
            if (type === 'ridge' && section.ridge_length_m) {
                totalRidge += Math.ceil(section.ridge_length_m * 3); // Approx 3 ridge tiles per meter
            }
            return;
        }

        const isFlatType = type === 'flat_roof' || type === 'balcony' || type === 'terrace' || type.includes('flat');
        const isEffectiveFlat = isFlatType || (pitch <= 10);

        if (type.includes('solar') || type.includes('pv')) {
            return; 
        }

        if (isEffectiveFlat) {
            totalFlatMembrane += area * 1.15;
        } else {
            totalPitchedUnderlay += area * 1.1; 

            let headlap = 100; 
            if (typeof standard.headLapRules === 'object') {
                const pitches = Object.keys(standard.headLapRules).map(Number).sort((a,b) => a-b);
                headlap = (standard.headLapRules as any)[pitches[0]]; // Default to max headlap (lowest pitch)
                for(const p of pitches) {
                    if (pitch >= p) headlap = (standard.headLapRules as any)[p];
                }
            }
            
            const gauge = (length - headlap) / 2;
            const effectiveWidth = width + 3;
            const slatesPerM2 = 1 / ((gauge/1000) * (effectiveWidth/1000));
            
            totalFullSlates += Math.ceil(area * slatesPerM2 * 1.07);
            totalBattens += Math.ceil(area / (gauge / 1000));

            if (section.ridge_length_m) {
                // Ridge is shared between two slopes, so we divide by 2 to avoid double counting
                totalRidge += Math.ceil((section.ridge_length_m / 2) * 3); // Approx 3 ridge tiles per meter
            } 
            
            let rafterLen = section.rafter_length_m;
            let eaveLen = section.eave_length_m;

            // Estimate missing lengths if area is known
            if (!rafterLen && !eaveLen && area > 0) {
                // Assume roughly square/rectangular slope
                rafterLen = Math.sqrt(area);
                eaveLen = area / rafterLen;
            } else if (!rafterLen && eaveLen && area > 0) {
                rafterLen = area / eaveLen;
            } else if (!eaveLen && rafterLen && area > 0) {
                eaveLen = area / rafterLen;
            }

            if (rafterLen && pitch > 15) {
                 // Calculate slates and a half for verges, hips, and valleys.
                 // We assume an average of 1.5 cut edges per section.
                 const courses = rafterLen / (gauge / 1000);
                 totalSlateAndHalf += Math.ceil(courses * 1.125);
            }

            if (eaveLen && pitch > 15) {
                 // Undereaves course uses half slates
                 const slatesPerEaveM = 1 / (effectiveWidth / 1000);
                 totalHalfSlates += Math.ceil(eaveLen * slatesPerEaveM);
            }
        }
    });

    // --- Estimate Shared Edges (Ridges, Hips, Valleys) from Polygons ---
    const estimatedEdges = estimateSharedEdges(activeSections);
    if (totalRidge === 0) totalRidge = Math.ceil(estimatedEdges.ridgeM * 3);
    if (totalValley === 0) totalValley = Math.ceil(estimatedEdges.valleyM * 1.1);
    if (totalHip === 0) totalHip = Math.ceil(estimatedEdges.hipM * 3);

    return {
        full_slates: totalFullSlates + Math.ceil(totalHalfSlates / 2),
        slate_and_half: totalSlateAndHalf,
        ridge_tiles: totalRidge,
        hip_tiles: totalHip,
        battens_linear_m: totalBattens,
        batten_size: "25x50mm",
        nails_65mm_galv: Math.ceil((totalFullSlates + Math.ceil(totalHalfSlates / 2)) * 2.2),
        underlay_m2: Math.ceil(totalPitchedUnderlay),
        flat_membrane_m2: Math.ceil(totalFlatMembrane),
        valley_liner_m: totalValley,
        parapet_capping_m: totalParapet
    };
}
