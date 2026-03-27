import React, { useRef, useState, useEffect, FC } from 'react';
import { RoofSection } from '@/types';
import { drawRoofSections } from './PlanReaderShared';

interface InteractiveCanvasOverlayProps {
    sections: RoofSection[];
    width: number;
    height: number;
    activeTool: 'drag' | 'slice' | 'measure';
    pxPerMeter?: number;
    onUpdateSection: (index: number, newPolygon: number[]) => void;
    onSplitSection: (index: number, poly1: number[], poly2: number[]) => void;
}

export const InteractiveCanvasOverlay: FC<InteractiveCanvasOverlayProps> = ({
    sections, width, height, activeTool, pxPerMeter, onUpdateSection, onSplitSection
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [draggingNode, setDraggingNode] = useState<{sectionIndex: number, vertexIndex: number} | null>(null);
    const [sliceStart, setSliceStart] = useState<{x: number, y: number} | null>(null);
    const [measureStart, setMeasureStart] = useState<{x: number, y: number} | null>(null);
    const [mousePos, setMousePos] = useState<{x: number, y: number} | null>(null);
    
    // Local state for smooth dragging before committing
    const [localSections, setLocalSections] = useState<RoofSection[]>(sections);

    useEffect(() => {
        setLocalSections(sections);
    }, [sections]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw base sections
        drawRoofSections(ctx, localSections, width, height);

        // Draw handles for drag tool
        if (activeTool === 'drag') {
            localSections.forEach((s, sIdx) => {
                if (!s.polygon_2d) return;
                for (let i = 0; i < s.polygon_2d.length; i += 2) {
                    const py = s.polygon_2d[i];
                    const px = s.polygon_2d[i+1];
                    const cx = px * (width / 1000);
                    const cy = py * (height / 1000);
                    
                    ctx.beginPath();
                    ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
                    ctx.fillStyle = draggingNode?.sectionIndex === sIdx && draggingNode?.vertexIndex === i ? '#ff0000' : '#ffffff';
                    ctx.fill();
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = '#000000';
                    ctx.stroke();
                }
            });
        }

        // Draw slice line
        if (activeTool === 'slice' && sliceStart && mousePos) {
            ctx.beginPath();
            ctx.moveTo(sliceStart.x, sliceStart.y);
            ctx.lineTo(mousePos.x, mousePos.y);
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw measure line
        if (activeTool === 'measure' && measureStart && mousePos) {
            ctx.beginPath();
            ctx.moveTo(measureStart.x, measureStart.y);
            ctx.lineTo(mousePos.x, mousePos.y);
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Calculate distance
            const dx = mousePos.x - measureStart.x;
            const dy = mousePos.y - measureStart.y;
            const distPx = Math.hypot(dx, dy);
            
            // Draw text
            ctx.fillStyle = '#000000';
            ctx.fillRect(mousePos.x + 10, mousePos.y - 25, 120, 24);
            ctx.fillStyle = '#00ff00';
            ctx.font = '14px sans-serif';
            
            if (pxPerMeter && pxPerMeter > 0) {
                const distM = distPx / pxPerMeter;
                ctx.fillText(`${distM.toFixed(2)}m (${Math.round(distPx)}px)`, mousePos.x + 15, mousePos.y - 8);
            } else {
                ctx.fillText(`${Math.round(distPx)}px`, mousePos.x + 15, mousePos.y - 8);
            }
        }

    }, [localSections, width, height, activeTool, draggingNode, sliceStart, measureStart, mousePos, pxPerMeter]);

    const getMouseCoords = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    };

    const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
        const { x, y } = getMouseCoords(e);
        
        if (activeTool === 'drag') {
            // Find closest node
            let closestDist = 15; // 15px hit radius
            let foundNode = null;
            
            for (let sIdx = 0; sIdx < localSections.length; sIdx++) {
                const s = localSections[sIdx];
                if (!s.polygon_2d) continue;
                for (let i = 0; i < s.polygon_2d.length; i += 2) {
                    const py = s.polygon_2d[i];
                    const px = s.polygon_2d[i+1];
                    const cx = px * (width / 1000);
                    const cy = py * (height / 1000);
                    const dist = Math.hypot(cx - x, cy - y);
                    if (dist < closestDist) {
                        closestDist = dist;
                        foundNode = { sectionIndex: sIdx, vertexIndex: i };
                    }
                }
            }
            if (foundNode) {
                setDraggingNode(foundNode);
            }
        } else if (activeTool === 'slice') {
            setSliceStart({ x, y });
            setMousePos({ x, y });
        } else if (activeTool === 'measure') {
            setMeasureStart({ x, y });
            setMousePos({ x, y });
        }
    };

    const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
        const { x, y } = getMouseCoords(e);
        setMousePos({ x, y });
        
        if (activeTool === 'drag' && draggingNode) {
            const newSections = [...localSections];
            const sec = { ...newSections[draggingNode.sectionIndex] };
            const poly = [...(sec.polygon_2d || [])];
            
            // Convert back to 0-1000 normalized coords
            poly[draggingNode.vertexIndex] = Math.max(0, Math.min(1000, y / (height / 1000))); // py
            poly[draggingNode.vertexIndex + 1] = Math.max(0, Math.min(1000, x / (width / 1000))); // px
            
            sec.polygon_2d = poly;
            newSections[draggingNode.sectionIndex] = sec;
            setLocalSections(newSections);
        }
    };

    const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
        if (activeTool === 'drag' && draggingNode) {
            const sec = localSections[draggingNode.sectionIndex];
            if (sec.polygon_2d) {
                onUpdateSection(draggingNode.sectionIndex, sec.polygon_2d);
            }
            setDraggingNode(null);
        } else if (activeTool === 'slice' && sliceStart && mousePos) {
            // Perform slice logic
            performSlice(sliceStart, mousePos);
            setSliceStart(null);
        } else if (activeTool === 'measure') {
            setMeasureStart(null);
        }
    };

    // Helper to check if an infinite line intersects a line segment
    const lineIntersect = (p1: {x: number, y: number}, p2: {x: number, y: number}, p3: {x: number, y: number}, p4: {x: number, y: number}) => {
        const denom = (p4.y - p3.y)*(p2.x - p1.x) - (p4.x - p3.x)*(p2.y - p1.y);
        if (denom === 0) return null; // Parallel or coincident
        const ua = ((p4.x - p3.x)*(p1.y - p3.y) - (p4.y - p3.y)*(p1.x - p3.x)) / denom;
        const ub = ((p2.x - p1.x)*(p1.y - p3.y) - (p2.y - p1.y)*(p1.x - p3.x)) / denom;
        
        // ua is along the infinite slice line (no bounds check)
        // ub is along the polygon edge segment (must be between 0 and 1)
        if (ub >= 0 && ub <= 1) {
            return {
                x: p1.x + ua * (p2.x - p1.x),
                y: p1.y + ua * (p2.y - p1.y),
                ua
            };
        }
        return null;
    };

    const performSlice = (start: {x: number, y: number}, end: {x: number, y: number}) => {
        // Prevent slicing with a single point click
        if (Math.hypot(start.x - end.x, start.y - end.y) < 2) return;

        // Find which section we are slicing
        // We look for a section where the slice line intersects exactly 2 edges
        for (let sIdx = 0; sIdx < localSections.length; sIdx++) {
            const s = localSections[sIdx];
            if (!s.polygon_2d || s.polygon_2d.length < 6) continue;
            
            const poly = s.polygon_2d;
            const pts: {x: number, y: number}[] = [];
            for (let i = 0; i < poly.length; i += 2) {
                pts.push({ x: poly[i+1] * (width / 1000), y: poly[i] * (height / 1000) });
            }
            
            const intersections: { pt: {x: number, y: number}, edgeIdx: number, ua: number }[] = [];
            
            for (let i = 0; i < pts.length; i++) {
                const p1 = pts[i];
                const p2 = pts[(i + 1) % pts.length];
                const hit = lineIntersect(start, end, p1, p2);
                if (hit) {
                    // Deduplicate vertex hits (Vertex Trap fix)
                    const isDuplicate = intersections.some(existing => 
                        Math.hypot(existing.pt.x - hit.x, existing.pt.y - hit.y) < 0.1
                    );
                    if (!isDuplicate) {
                        intersections.push({ pt: hit, edgeIdx: i, ua: hit.ua });
                    }
                }
            }
            
            if (intersections.length === 2) {
                // Sort by ua so we know the order along the slice line
                intersections.sort((a, b) => a.ua - b.ua);
                
                const i1 = intersections[0];
                const i2 = intersections[1];
                
                // Split the polygon into two
                const poly1Pts: {x: number, y: number}[] = [];
                const poly2Pts: {x: number, y: number}[] = [];
                
                // Poly 1: from i1.pt, along edges to i2.pt, then back to i1.pt
                poly1Pts.push(i1.pt);
                let curr = (i1.edgeIdx + 1) % pts.length;
                while (curr !== (i2.edgeIdx + 1) % pts.length) {
                    poly1Pts.push(pts[curr]);
                    curr = (curr + 1) % pts.length;
                }
                poly1Pts.push(i2.pt);
                
                // Poly 2: from i2.pt, along edges to i1.pt, then back to i2.pt
                poly2Pts.push(i2.pt);
                curr = (i2.edgeIdx + 1) % pts.length;
                while (curr !== (i1.edgeIdx + 1) % pts.length) {
                    poly2Pts.push(pts[curr]);
                    curr = (curr + 1) % pts.length;
                }
                poly2Pts.push(i1.pt);
                
                // Convert back to normalized [y, x, y, x]
                const toNormalized = (p: {x: number, y: number}[]) => {
                    const res: number[] = [];
                    p.forEach(pt => {
                        res.push(pt.y / (height / 1000));
                        res.push(pt.x / (width / 1000));
                    });
                    return res;
                };
                
                onSplitSection(sIdx, toNormalized(poly1Pts), toNormalized(poly2Pts));
                return; // Only split one section per slice
            }
        }
    };

    return (
        <canvas 
            ref={canvasRef} 
            width={width} 
            height={height} 
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
            style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                width: '100%',
                height: '100%',
                cursor: activeTool === 'drag' ? (draggingNode ? 'grabbing' : 'grab') : 'crosshair',
                touchAction: 'none' // Prevent scrolling while dragging
            }} 
        />
    );
};
