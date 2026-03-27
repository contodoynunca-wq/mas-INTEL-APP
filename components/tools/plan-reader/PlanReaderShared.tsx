
import React, { FC, useRef, useEffect } from 'react';
import type { RoofSection } from '@/types';

export const DetailSection: FC<{ title: string, children: React.ReactNode, defaultOpen?: boolean }> = ({ title, children, defaultOpen = false }) => (
    <details open={defaultOpen} className="mt-4 p-3 bg-white rounded-lg border border-border-color">
        <summary className="font-semibold cursor-pointer select-none text-primary">{title}</summary>
        <div className="pt-3 mt-2 border-t border-border-color">{children}</div>
    </details>
);

export const SimpleTable: FC<{data: Record<string, any> | undefined | null}> = ({data}) => {
    if (!data || Object.keys(data).length === 0) return <p className="text-sm text-gray-500">No data extracted.</p>;
    return (
         <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse border border-gray-200"><tbody>
            {Object.entries(data).map(([key, value]) => value ? (
                <tr key={key} className="border-b border-gray-200"><td className="capitalize font-semibold p-2 bg-gray-50 text-gray-700">{key.replace(/_/g, ' ')}</td><td className="p-2 text-gray-800">{String(value)}</td></tr>
            ) : null)}
            </tbody></table>
        </div>
    );
};

export const SourceBadge: FC<{ method?: string, flags?: string[] }> = ({ method, flags }) => {
    if (!method && (!flags || flags.length === 0)) return null;
    
    let color = 'bg-gray-100 text-gray-600';
    let icon = '❓';
    let title = method || 'Unknown Source';

    if (method === 'Text Schedule Match') {
        color = 'bg-green-100 text-green-800';
        icon = '📄'; 
    } else if (method === 'Explicit Dimensions') {
        color = 'bg-emerald-100 text-emerald-800';
        icon = '📏';
    } else if (method === 'Visual Estimation') {
        color = 'bg-blue-100 text-blue-800';
        icon = '👁️';
    } else if (method === 'Geometry Inference') {
        color = 'bg-purple-100 text-purple-800';
        icon = '📐';
    } else if (method === 'Default Value') {
        color = 'bg-yellow-100 text-yellow-800';
        icon = '⚠️';
    } else if (method === 'Manual Input') {
        color = 'bg-indigo-100 text-indigo-800';
        icon = '✍️';
    }

    const hasFlags = flags && flags.length > 0;

    return (
        <div className="flex flex-col items-start gap-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded border border-transparent font-medium ${color}`} title={title}>
                {icon} {method?.split(' ')[0]}
            </span>
            {hasFlags && flags?.map(flag => (
                <span key={flag} className={`text-[9px] font-bold rounded px-1 ${flag.includes('Overlap') ? 'bg-purple-100 text-purple-700' : flag.includes('Clipped') ? 'bg-orange-100 text-orange-700' : 'text-red-500'}`}>
                    {flag.includes('Overlap') ? '✂️ ' : '• '} {flag}
                </span>
            ))}
        </div>
    );
};

export const ConsistencyDashboard: FC<{ sections: RoofSection[], quantities: any, slateSize?: string }> = ({ sections, quantities, slateSize }) => {
    // --- AGGREGATION LOGIC ---
    const isProposed = (s: RoofSection) => !s.status || s.status === 'Proposed';
    const isExisting = (s: RoofSection) => s.status === 'Existing';

    // STRICT FILTERING: Sync with planMath.ts exclusion logic
    // Exclude anything that isn't actual roof covering area
    const isNonArea = (type: string) => {
        return type.includes('valley') || type.includes('ridge') || type.includes('hip') || 
               type.includes('solar') || type.includes('pv') ||
               type.includes('chimney') || type.includes('skylight') || type.includes('velux') || type.includes('void') || type.includes('flue') ||
               type.includes('cladding') || type.includes('wall') || type.includes('parapet');
    };

    const isPitched = (s: RoofSection) => {
        const t = s.type.toLowerCase();
        // Explicitly check for void types again to be safe
        if (['chimney', 'skylight', 'velux', 'void', 'flue'].some(v => t.includes(v))) return false;
        
        return !t.includes('flat') && !t.includes('balcony') && !t.includes('terrace') && 
               !isNonArea(t) && 
               (s.pitch_degrees === undefined || s.pitch_degrees > 10);
    };
    
    const isFlat = (s: RoofSection) => {
        const t = s.type.toLowerCase();
        // Explicitly check for void types again to be safe
        if (['chimney', 'skylight', 'velux', 'void', 'flue'].some(v => t.includes(v))) return false;

        return (t.includes('flat') || t.includes('balcony') || t.includes('terrace')) && !isNonArea(t);
    };

    const totalPitchedProposed = sections.filter(s => isProposed(s) && isPitched(s)).reduce((a, b) => a + (b.area_m2 || 0), 0);
    const totalFlatProposed = sections.filter(s => isProposed(s) && isFlat(s)).reduce((a, b) => a + (b.area_m2 || 0), 0);
    const totalPitchedExisting = sections.filter(s => isExisting(s) && isPitched(s)).reduce((a, b) => a + (b.area_m2 || 0), 0);

    // --- CHECKS ---
    const pitchedUnderlay = quantities.underlay_m2 || 0;
    const ratioPitched = totalPitchedProposed > 0 ? pitchedUnderlay / totalPitchedProposed : 0;
    const isPitchedValid = ratioPitched >= 1.05 && ratioPitched <= 1.30; // Slight tolerance bump

    const flatMembrane = quantities.flat_membrane_m2 || 0;
    const ratioFlat = totalFlatProposed > 0 ? flatMembrane / totalFlatProposed : 0;
    const isFlatValid = ratioFlat >= 1.0;

    const fullSlates = quantities.full_slates || 0;
    
    let theoreticalPerM2 = 20;
    if (slateSize) {
        const dims = slateSize.match(/(\d+)\D+(\d+)/);
        if (dims) {
            const length = parseInt(dims[1]) / 1000;
            const width = parseInt(dims[2]) / 1000;
            const gauge = (length - 0.1) / 2;
            if (gauge > 0 && width > 0) theoreticalPerM2 = 1 / (gauge * (width + 0.003));
        }
    }
    
    const actualSlatesPerM2 = totalPitchedProposed > 0 ? fullSlates / totalPitchedProposed : 0;
    const slateDiff = totalPitchedProposed > 0 ? Math.abs(actualSlatesPerM2 - theoreticalPerM2) / theoreticalPerM2 : 0;
    const isSlateValid = slateDiff < 0.15;

    // Determine Status Color
    const isZeroProposed = totalPitchedProposed === 0 && totalFlatProposed === 0;
    const isReRoofScenario = totalPitchedProposed === 0 && totalPitchedExisting > 0;
    const isOverallValid = !isZeroProposed && isPitchedValid && (totalFlatProposed === 0 || isFlatValid) && (totalPitchedProposed === 0 || isSlateValid);

    return (
        <div className={`mb-4 p-4 rounded-lg border ${isReRoofScenario ? 'bg-yellow-50 border-yellow-300' : isOverallValid ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-300'}`}>
            <div className="flex justify-between items-start mb-3">
                <h4 className={`font-bold text-sm flex items-center gap-2 ${isOverallValid ? 'text-blue-800' : 'text-orange-800'}`}>
                    📊 Consistency Check
                    {isReRoofScenario ? (
                        <span className="text-yellow-800 text-xs bg-yellow-200 border border-yellow-400 px-2 py-0.5 rounded animate-pulse">⚠️ RE-ROOF DETECTED</span>
                    ) : isOverallValid ? (
                        <span className="text-green-600 text-xs border border-green-500 px-2 rounded bg-white">PASS</span>
                    ) : (
                        <span className="text-orange-600 text-xs border border-orange-500 px-2 rounded bg-white">REVIEW NEEDED</span>
                    )}
                </h4>
                {isReRoofScenario && (
                    <div className="text-xs text-yellow-800 text-right">
                        Existing: {totalPitchedExisting.toFixed(1)}m² | Proposed: {totalPitchedProposed.toFixed(1)}m²
                    </div>
                )}
            </div>
            {/* Always show breakdown if invalid OR if there is data to show */}
            {(!isOverallValid || (totalPitchedProposed > 0 || totalFlatProposed > 0)) && (
                <div className="text-[10px] text-gray-700 mt-1 space-y-1 bg-white/50 p-2 rounded">
                    <div className="flex justify-between">
                        <span>Pitched Roof Area (Net):</span>
                        <span className="font-mono">{totalPitchedProposed.toFixed(2)}m²</span>
                    </div>
                    {totalPitchedProposed > 0 && (
                        <div className={`flex justify-between ${!isPitchedValid ? 'text-red-600 font-bold' : ''}`}>
                            <span>Underlay Check (Ratio):</span>
                            <span className="font-mono">{ratioPitched.toFixed(2)} (Target: 1.1-1.3)</span>
                        </div>
                    )}
                    {totalFlatProposed > 0 && (
                        <div className="flex justify-between mt-2">
                            <span>Flat Roof Area:</span>
                            <span className="font-mono">{totalFlatProposed.toFixed(2)}m²</span>
                        </div>
                    )}
                    {totalFlatProposed > 0 && (
                        <div className={`flex justify-between ${!isFlatValid ? 'text-red-600 font-bold' : ''}`}>
                            <span>Membrane Check (Ratio):</span>
                            <span className="font-mono">{ratioFlat.toFixed(2)} (Target: &gt;1.0)</span>
                        </div>
                    )}
                    {totalPitchedProposed > 0 && (
                        <div className={`flex justify-between mt-2 ${!isSlateValid ? 'text-red-600 font-bold' : ''}`}>
                            <span>Slate Count Logic:</span>
                            <span className="font-mono">
                                {actualSlatesPerM2.toFixed(1)}/m² (Theo: {theoreticalPerM2.toFixed(1)})
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export const drawRoofSections = (ctx: CanvasRenderingContext2D, sections: RoofSection[], width: number, height: number) => {
    if (!ctx) return;

    // Sort by type for layering: Bottom Layers First -> Top Layers Last
    const HIERARCHY = [
        'main_slope', 'main',
        'extension', 'gable',
        'hip', 'ridge', 'valley',
        'parapet',
        'flat_roof', 'flat', 'terrace', 'balcony',
        'dormer', 
        'solar_panel', 'pv',
        'chimney', 
        'porch', 'canopy', 'bay_window', 'bay', // Draw porches very late
        'skylight', 'velux' // Draw velux last (on top of everything)
    ];
    const getPriority = (type: string) => {
        const t = (type || '').toLowerCase();
        const idx = HIERARCHY.findIndex(h => t.includes(h));
        return idx === -1 ? 0 : idx; 
    };
    
    // Sort Ascending based on index (Low index = draw first/bottom, High index = draw last/top)
    const sortedSections = [...sections].sort((a, b) => getPriority(a.type) - getPriority(b.type));

    sortedSections.forEach(s => {
        if (!s.bbox_2d || s.bbox_2d.length !== 4) return;
        
        const [ymin, xmin, ymax, xmax] = s.bbox_2d;
        // Verify valid coordinates
        if ([ymin, xmin, ymax, xmax].some(v => typeof v !== 'number' || isNaN(v))) return;

        const x = xmin * (width / 1000);
        const y = ymin * (height / 1000);
        const w = (xmax - xmin) * (width / 1000);
        const h = (ymax - ymin) * (height / 1000);

        let fillStyle = 'rgba(200, 200, 200, 0.3)'; 
        let strokeStyle = 'rgba(100, 100, 100, 0.8)';
        let lineWidth = 2;
        const t = (s.type || '').toLowerCase();
        const isPitched = (s.pitch_degrees && s.pitch_degrees > 10) || t.includes('main') || t.includes('extension') || t.includes('gable') || t.includes('bay') || t.includes('porch');

        if (t.includes('main')) {
            fillStyle = 'rgba(255, 0, 0, 0.2)'; // Red (Main) - Transparent base
            strokeStyle = 'rgba(255, 0, 0, 1)';
        } else if (t.includes('extension') || t.includes('gable')) {
            fillStyle = 'rgba(255, 140, 0, 0.3)'; // Orange
            strokeStyle = 'rgba(255, 140, 0, 1)';
        } else if (t.includes('flat') || t.includes('terrace')) {
            fillStyle = 'rgba(0, 0, 255, 0.6)'; // Blue (Flat) - More opaque
            strokeStyle = 'blue';
        } else if (t.includes('dormer')) {
            fillStyle = 'rgba(0, 255, 0, 0.8)'; // Green (Dormer) - High Opacity
            strokeStyle = '#00ff00';
            lineWidth = 3; 
        } else if (t.includes('porch') || t.includes('canopy')) {
            fillStyle = 'rgba(255, 0, 255, 0.8)'; // Magenta (Porch) - High Opacity
            strokeStyle = '#ff00ff';
            lineWidth = 4; // Very thick to be seen
        } else if (t.includes('bay')) {
            fillStyle = 'rgba(75, 0, 130, 0.8)'; // Indigo (Bay) - High Opacity
            strokeStyle = '#4b0082';
            lineWidth = 3;
        } else if (t.includes('solar') || t.includes('pv')) {
            fillStyle = 'rgba(255, 215, 0, 0.7)'; // Gold (Solar)
            strokeStyle = 'goldenrod';
        } else if (t.includes('velux') || t.includes('skylight')) {
            fillStyle = 'rgba(0, 255, 255, 0.9)'; // Cyan (Velux) - Max Opacity
            strokeStyle = 'cyan';
            lineWidth = 3;
        } else if (t.includes('valley')) {
            fillStyle = 'transparent';
            strokeStyle = '#ff00ff'; // Magenta
            lineWidth = 4;
        } else if (t.includes('hip')) {
            fillStyle = 'transparent';
            strokeStyle = '#0000ff'; // Blue for Hips
            lineWidth = 3;
        } else if (t.includes('ridge')) {
            fillStyle = 'transparent';
            strokeStyle = '#ff0000'; // Red for Ridges
            lineWidth = 3;
        }

        if (s.status === 'Demolish') {
            fillStyle = 'rgba(0, 0, 0, 0.7)';
            strokeStyle = 'black';
        }

        ctx.fillStyle = fillStyle;
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;

        // Draw Polygon if available (better for triangles/hips)
        if (s.polygon_2d && s.polygon_2d.length >= 6) {
            ctx.beginPath();
            const p = s.polygon_2d;
            for (let k = 0; k < p.length; k += 2) {
                const py = p[k];
                const px = p[k + 1];
                if (typeof py === 'number' && typeof px === 'number') {
                    const canvasX = px * (width / 1000);
                    const canvasY = py * (height / 1000);
                    if (k === 0) ctx.moveTo(canvasX, canvasY);
                    else ctx.lineTo(canvasX, canvasY);
                }
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else {
            // Fallback to Rectangle
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.fill();
            ctx.stroke();
        }

        // Draw Geometric Hint Lines for Pitched Roofs (Only if using Rect fallback or simple shapes)
        // This helps the AI Vision Model understand volume if polygon is missing
        if (!s.polygon_2d && isPitched && !t.includes('main') && (w > 10 && h > 10)) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + w/2, y + h/2); // Top-Left to Center
            ctx.moveTo(x + w, y);
            ctx.lineTo(x + w/2, y + h/2); // Top-Right to Center
            ctx.moveTo(x, y + h);
            ctx.lineTo(x + w/2, y + h/2); // Bottom-Left to Center
            ctx.moveTo(x + w, y + h);
            ctx.lineTo(x + w/2, y + h/2); // Bottom-Right to Center
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Draw Label
        if (w > 20 || h > 20 || t.includes('porch') || t.includes('velux')) {
            ctx.font = 'bold 12px sans-serif';
            const label = `${s.section_id} (${s.type || '?'})`;
            const textWidth = ctx.measureText(label).width;
            
            // Center label in the shape
            let labelX = x + w / 2;
            let labelY = y + h / 2;
            
            // If polygon, try to find centroid (simple avg)
            if (s.polygon_2d && s.polygon_2d.length >= 6) {
                let sumX = 0, sumY = 0, count = 0;
                for (let k = 0; k < s.polygon_2d.length; k += 2) {
                     sumY += s.polygon_2d[k];
                     sumX += s.polygon_2d[k+1];
                     count++;
                }
                labelX = (sumX / count) * (width / 1000);
                labelY = (sumY / count) * (height / 1000);
            }

            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(labelX - textWidth/2 - 4, labelY - 9, textWidth + 8, 18);
            
            ctx.fillStyle = 'white';
            ctx.fillText(label, labelX - textWidth/2, labelY + 4);
        }
    });
};

export const CanvasOverlay: FC<{ sections: RoofSection[], width: number, height: number, containerWidth: number, containerHeight: number }> = ({ sections, width, height }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawRoofSections(ctx, sections, width, height);

    }, [sections, width, height]);

    return (
        <canvas 
            ref={canvasRef} 
            width={width} 
            height={height} 
            style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                width: '100%',
                height: '100%',
                pointerEvents: 'none'
            }} 
        />
    );
};
