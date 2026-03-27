
import type { PlanReaderResult, RoofSection } from '@/types';
import { getRegulatoryDisclaimer } from '@/services/roofingStandards';

export const generateTakeOffReportHtml = (
    result: PlanReaderResult,
    editedSections: RoofSection[],
    editedQuantities: any,
    slateSize: string,
    projectRef: string,
    generated3DImage: string | null,
    planWithOverlaysImage: string | null // New Parameter
): string => {
    const finalPrintSize = slateSize || "500x250";
    const refDisplay = projectRef ? ` | Ref: <strong>${projectRef}</strong>` : '';
    
    // Default to UK if no market context, or infer from result if available (future improvement)
    const disclaimer = getRegulatoryDisclaimer('UK');

    const confidenceScore = result.confidence_score || 'Medium';
    const confidenceColors: Record<string, string> = {
        'High': 'background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb;',
        'Medium': 'background-color: #fff3cd; color: #856404; border: 1px solid #ffeeba;',
        'Low': 'background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;'
    };

    return `
        <div style="font-family: sans-serif; color: #333; padding: 20px; padding-bottom: 100px;">
            <div style="border-bottom: 2px solid #2980b9; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <h1 style="color: #2980b9; margin: 0;">Roofing Take-Off Report</h1>
                    <p>Scale: ${result.project_details?.plan_scale || 'N/A'} | Slate: <strong>${finalPrintSize}</strong>${refDisplay}</p>
                </div>
                <div style="padding: 5px 10px; border-radius: 4px; font-weight: bold; font-size: 14px; ${confidenceColors[confidenceScore]}">
                    ${confidenceScore} Confidence
                </div>
            </div>
            
            ${result.project_details?.scale_audit ? `
            <div style="margin-bottom: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #2980b9; border-radius: 4px;">
                <h4 style="margin: 0 0 5px 0; color: #2980b9;">Scale Audit (Source of Truth)</h4>
                <p style="margin: 0; font-size: 0.9em;">
                    <strong>Scale Anchor:</strong> The AI detected a dimension of <strong>'${result.project_details.scale_audit.detected_dimension}'</strong> 
                    on a line that is <strong>${result.project_details.scale_audit.pixel_length} pixels</strong> long. 
                    Scale established at <strong>${result.project_details.scale_audit.px_per_meter.toFixed(2)} px per meter</strong>.
                    <br/><span style="color: #666; font-size: 0.85em;">Method: ${result.project_details.scale_audit.method}</span>
                </p>
            </div>
            ` : ''}
            
            ${planWithOverlaysImage ? `
            <div style="margin-bottom: 30px; page-break-inside: avoid;">
                <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px;">Section Identification Plan</h3>
                <img src="${planWithOverlaysImage}" style="width:100%; max-height: 600px; object-fit: contain; border: 1px solid #ccc; border-radius: 4px;" />
                <p style="font-size: 0.8em; color: #666; margin-top: 5px;">Visual reference of identified roof sections.</p>
            </div>
            ` : ''}

            <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px;">Extracted Materials & Notes</h3>
            <ul style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 30px;">
                ${result.plan_notes?.map(n => `<li><strong>${n.category}:</strong> ${n.text}</li>`).join('') || 'No materials extracted.'}
            </ul>

            <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px;">Roof Sections Data</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 0.9em;">
                <thead style="background: #eee;">
                    <tr>
                        <th style="padding:8px; text-align:left; border-bottom: 2px solid #ddd;">ID</th>
                        <th style="padding:8px; text-align:left; border-bottom: 2px solid #ddd;">Type</th>
                        <th style="padding:8px; text-align:left; border-bottom: 2px solid #ddd;">Calculation (Gross - Voids) x Pitch = Net 3D Area</th>
                        <th style="padding:8px; text-align:left; border-bottom: 2px solid #ddd;">Pitch (°)</th>
                        <th style="padding:8px; text-align:left; border-bottom: 2px solid #ddd;">Source</th>
                    </tr>
                </thead>
                <tbody>
                    ${editedSections.map(s => {
                        const type = s.type.toLowerCase();
                        const isLinear = type.includes('valley') || type.includes('parapet') || type.includes('ridge');
                        const isVoid = ['chimney', 'skylight', 'velux', 'void', 'flue'].some(v => type.includes(v));
                        
                        let metric = "";
                        if (isVoid) {
                            metric = "-";
                        } else if (isLinear) {
                            metric = `${(s.rafter_length_m || s.ridge_length_m || (s.area_m2 ? (s.area_m2 / 0.6) : 0)).toFixed(1)}m (Linear)`;
                        } else {
                            if (s.gross_area_m2 !== undefined && s.pitch_multiplier !== undefined) {
                                const gross2D = (s.gross_area_m2 / s.pitch_multiplier).toFixed(2);
                                const voids2D = s.void_area_m2 ? (s.void_area_m2 / s.pitch_multiplier).toFixed(2) : "0.00";
                                const pitchMult = s.pitch_multiplier.toFixed(2);
                                const final3D = s.area_m2?.toFixed(2);
                                metric = `(Gross 2D: ${gross2D}m² - Void 2D: ${voids2D}m²) x Pitch Mult: ${pitchMult} = <strong>${final3D}m²</strong>`;
                            } else {
                                metric = `<strong>${s.area_m2?.toFixed(2)}m²</strong>`;
                            }
                        }
                        
                        const flags = s.data_flags?.map(f => f.includes('Overlap') ? '[Clipped]' : f).join(', ') || '';

                        return `
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding:8px; font-weight:bold;">${s.label || s.section_id}</td>
                            <td style="padding:8px;">${s.type}</td>
                            <td style="padding:8px;">${metric}</td>
                            <td style="padding:8px;">${s.pitch_degrees || '-'}</td>
                            <td style="padding:8px; font-size: 0.8em; color: #666;">${s.source_method || 'Unknown'} ${flags ? `<br/><span style="color:red;">${flags}</span>` : ''}</td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>

            <div style="page-break-inside: avoid;">
                <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px;">Material Quantities (Based on ${finalPrintSize})</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9em; margin-bottom: 30px;">
                    <thead style="background: #eee;"><tr><th style="padding:8px; text-align:left; border-bottom: 2px solid #ddd;">Item</th><th style="padding:8px; text-align:left; border-bottom: 2px solid #ddd;">Quantity</th></tr></thead>
                    <tbody>
                        ${Object.entries(editedQuantities).map(([k, v]) => `
                            <tr style="border-bottom: 1px solid #eee;">
                                <td style="padding:8px; text-transform:capitalize;">${k.replace(/_/g, ' ')}</td>
                                <td style="padding:8px; font-weight:bold;">${v}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            ${generated3DImage ? `<div style="page-break-inside: avoid;"><h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px;">3D Concept</h3><img src="${generated3DImage}" style="max-width:100%; border-radius: 5px; margin-top: 10px;" /></div>` : ''}
            
            <div style="margin-top: 50px; padding: 20px; background-color: #f8f9fa; border-top: 1px solid #ddd; font-size: 0.8em; color: #555; page-break-inside: avoid;">
                <p style="white-space: pre-line; font-style: italic;">
                    ${disclaimer}
                </p>
                <p style="margin-top: 10px; font-weight: bold;">
                    Generated by Mont Azul Sales Intelligence Hub - Plan Reader V2.5
                </p>
            </div>
        </div>
    `;
};
