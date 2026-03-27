import React, { useState } from 'react';
import { ProjectState } from '../types';
import { calculateRoof } from '../utils/calculations';

interface EstimatorProps {
  project: ProjectState;
  onPreparePrint?: (printing: boolean) => void;
}

export const Estimator: React.FC<EstimatorProps> = ({ project, onPreparePrint }) => {
  const result = calculateRoof(project);
  const [snapshot, setSnapshot] = useState<string | null>(null);

  const handlePrint = () => {
    const canvas = document.querySelector('canvas');
    if (canvas && onPreparePrint) {
        // 1. Enable Shadows (High Quality Mode)
        onPreparePrint(true);
        
        // 2. Wait for React render + Threejs Shader Compile + Render Frame
        setTimeout(() => {
            const data = canvas.toDataURL('image/png', 1.0);
            setSnapshot(data);
            
            // 3. Disable Shadows
            onPreparePrint(false);
            
            // 4. Print
            setTimeout(() => {
                window.print();
            }, 100);
        }, 500); // 500ms delay to ensure shadow map renders
    } else {
        window.print();
    }
  };

  return (
    <div className="absolute top-4 right-4 w-96 bg-white shadow-2xl rounded-lg border border-slate-200 overflow-hidden z-20 print:w-full print:static print:shadow-none print:border-none print:max-w-none max-h-[90vh] overflow-y-auto">
      <div className="bg-slate-800 text-white px-4 py-3 flex justify-between items-center print:hidden">
        <h2 className="font-bold">Quantity Surveyor</h2>
        <button onClick={handlePrint} className="text-xs bg-slate-600 hover:bg-slate-500 px-2 py-1 rounded transition-colors">
          Print / PDF
        </button>
      </div>

      <div className="p-4 text-sm" id="estimate-print-area">
        <div className="flex justify-between items-center mb-4 border-b pb-2">
            <div>
                <h3 className="font-bold text-lg text-slate-900">Mont Azul Estimate</h3>
                <p className="text-xs text-slate-500">{new Date().toLocaleDateString()}</p>
            </div>
            <div className="text-right text-xs">
                <p>Style: {project.roofStyle} ({project.structureType})</p>
                <p>Pitch: {project.dimensions.pitch}°</p>
                <p>Exp: {project.exposure}</p>
                <p>Slate: {project.selectedSlate.name} <span className="font-semibold">({project.selectedSlate.length}x{project.selectedSlate.width}mm)</span></p>
            </div>
        </div>

        {/* 3D Snapshot for Print */}
        {snapshot && (
            <div className="mb-6 border rounded-lg overflow-hidden shadow-sm hidden print:block">
                <img src={snapshot} alt="Roof Snapshot" className="w-full h-auto object-cover" />
                <p className="text-[10px] text-center text-slate-400 p-1 bg-slate-50 italic">Project Snapshot</p>
            </div>
        )}
        
        {/* Warnings */}
        {result.warnings.length > 0 && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-2 text-xs text-red-700">
                {result.warnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
        )}

        <div className="space-y-4">
            {/* Trust & Audit Section */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                    <h4 className="font-bold text-slate-700 text-xs uppercase">Scale Audit & Trust</h4>
                    <div className={`text-xs font-bold px-2 py-1 rounded ${result.confidenceScore >= 90 ? 'bg-green-100 text-green-700' : result.confidenceScore >= 70 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                        Confidence: {result.confidenceScore}%
                    </div>
                </div>
                <div className="space-y-1 text-xs text-slate-600">
                    <div className="flex justify-between">
                        <span>Gross Roof Area</span>
                        <span className="font-mono">{result.totalMainArea.toFixed(1)} m²</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Net Area Deductions (Features)</span>
                        <span className="font-mono text-red-600">-{result.netAreaDeductions.toFixed(1)} m²</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-800 border-t pt-1 mt-1">
                        <span>Net Slate Area</span>
                        <span className="font-mono">{(result.totalMainArea - result.netAreaDeductions).toFixed(1)} m²</span>
                    </div>
                </div>
            </div>

            <div className="flex justify-between py-1 border-b border-dashed">
                <span className="text-slate-600">Headlap Required</span>
                <span className="font-mono font-bold">{result.headlap} mm</span>
            </div>
            <div className="flex justify-between py-1 border-b border-dashed">
                <span className="text-slate-600">Batten Gauge</span>
                <span className="font-mono font-bold">{result.gauge.toFixed(1)} mm</span>
            </div>
            <div className="flex justify-between py-1 border-b border-dashed">
                <span className="text-slate-600">Crates Required (approx)</span>
                <span className="font-mono font-bold">{result.crates}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-dashed bg-yellow-50 p-1 rounded">
                <span className="text-slate-600">Dynamic Waste Factor</span>
                <span className="font-mono font-bold text-yellow-700">{result.wasteFactor.toFixed(1)}%</span>
            </div>

            <table className="w-full mt-4 text-left border-collapse">
                <thead>
                    <tr className="text-xs text-slate-500 uppercase border-b-2 border-slate-100">
                        <th className="py-2">Item</th>
                        <th className="py-2 text-right">Qty</th>
                        <th className="py-2 text-right">Cost</th>
                    </tr>
                </thead>
                <tbody className="text-slate-700">
                    <tr className="border-b border-slate-50">
                        <td className="py-2">Standard Slates</td>
                        <td className="text-right">{result.slatesTotal}</td>
                        <td className="text-right">£{(result.slatesTotal * project.costs.slatePrice).toFixed(2)}</td>
                    </tr>
                    <tr className="border-b border-slate-50">
                        <td className="py-2">Slate-and-Half (Cuts/Verges)</td>
                        <td className="text-right">{result.slatesHalves}</td>
                        <td className="text-right">£{(result.slatesHalves * project.costs.slateHalfPrice).toFixed(2)}</td>
                    </tr>
                    <tr className="border-b border-slate-50">
                        <td className="py-2">Timber Batten (m)</td>
                        <td className="text-right">{result.battens.toFixed(1)}</td>
                        <td className="text-right">£{(result.battens * project.costs.timberBattenPrice).toFixed(2)}</td>
                    </tr>
                     <tr className="border-b border-slate-50">
                        <td className="py-2">Struct. Rafters (m)</td>
                        <td className="text-right">{result.rafters.toFixed(1)}</td>
                        <td className="text-right">£{(result.rafters * project.costs.timberRafterPrice).toFixed(2)}</td>
                    </tr>
                    {result.purlins > 0 && (
                        <tr className="border-b border-slate-50 bg-blue-50">
                            <td className="py-2 pl-2">Struct. Purlins (225x75) (m)</td>
                            <td className="text-right">{result.purlins.toFixed(1)}</td>
                            <td className="text-right">£{(result.purlins * project.costs.timberPurlinPrice).toFixed(2)}</td>
                        </tr>
                    )}
                    {result.ridgeBeams > 0 && (
                        <tr className="border-b border-slate-50 bg-blue-50">
                            <td className="py-2 pl-2">Struct. Ridge Beam (m)</td>
                            <td className="text-right">{result.ridgeBeams.toFixed(1)}</td>
                            <td className="text-right">£{(result.ridgeBeams * project.costs.timberRidgeBeamPrice).toFixed(2)}</td>
                        </tr>
                    )}
                    <tr className="border-b border-slate-50">
                        <td className="py-2">Membrane (m²)</td>
                        <td className="text-right">{result.membrane.toFixed(1)}</td>
                        <td className="text-right">£{(result.membrane * project.costs.membranePrice).toFixed(2)}</td>
                    </tr>
                    <tr className="border-b border-slate-50">
                        <td className="py-2">Fixings (Copper Nails kg)</td>
                        <td className="text-right">{result.nails}</td>
                        <td className="text-right">£{(result.nails * project.costs.nailPrice).toFixed(2)}</td>
                    </tr>
                     <tr className="border-b border-slate-50">
                        <td className="py-2">Lead (Code 3/5 kg)</td>
                        <td className="text-right">{result.lead}</td>
                        <td className="text-right">£{(result.lead * project.costs.leadCode3Price).toFixed(2)}</td>
                    </tr>
                    {result.leadClips > 0 && (
                        <tr className="border-b border-slate-50">
                            <td className="py-2">Hall Clips / Wedges</td>
                            <td className="text-right">{result.leadClips}</td>
                            <td className="text-right">£{(result.leadClips * project.costs.leadClipPrice).toFixed(2)}</td>
                        </tr>
                    )}
                    {project.mossControl && (
                         <tr className="border-b border-slate-50">
                            <td className="py-2">Copper Strip (m)</td>
                            <td className="text-right">{result.copperStrip.toFixed(1)}</td>
                            <td className="text-right">£{(result.copperStrip * project.costs.copperStripPrice).toFixed(2)}</td>
                        </tr>
                    )}
                    <tr className="border-b border-slate-50">
                        <td className="py-2">Ridge Tiles</td>
                        <td className="text-right">{result.ridgeTiles}</td>
                        <td className="text-right">£{(result.ridgeTiles * project.costs.ridgeTilePrice).toFixed(2)}</td>
                    </tr>
                    {result.hipTiles > 0 && (
                        <tr className="border-b border-slate-50">
                            <td className="py-2">Hip Tiles</td>
                            <td className="text-right">{result.hipTiles}</td>
                            <td className="text-right">£{(result.hipTiles * project.costs.ridgeTilePrice).toFixed(2)}</td>
                        </tr>
                    )}
                </tbody>
                <tfoot>
                    <tr className="text-lg font-bold text-slate-900 border-t-2 border-slate-800">
                        <td className="py-4">Total Estimate</td>
                        <td></td>
                        <td className="py-4 text-right">£{result.totalCost.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>

            {/* Sustainability & Eco Report */}
            <div className="mt-8 border border-green-200 rounded-lg overflow-hidden">
                <div className="bg-green-50 px-3 py-2 border-b border-green-200 flex justify-between items-center">
                    <h3 className="font-bold text-green-800 text-xs uppercase tracking-wide">Sustainability & Eco-Report</h3>
                </div>
                <div className="p-3 bg-white space-y-3">
                    {/* Solar ROI */}
                    {result.solarSystemSize > 0 ? (
                        <div className="flex items-start space-x-2">
                             <div className="bg-yellow-100 text-yellow-600 p-1.5 rounded">
                                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                             </div>
                             <div>
                                 <h4 className="text-xs font-bold text-slate-700">Solar Potential</h4>
                                 <p className="text-[10px] text-slate-500">Based on {result.solarSystemSize.toFixed(2)} kWp system</p>
                                 <div className="mt-1 flex space-x-3">
                                     <div className="text-xs">
                                         <span className="block font-bold text-slate-800">{Math.round(result.solarAnnualGen)} kWh</span>
                                         <span className="text-[9px] text-slate-400">Annual Gen</span>
                                     </div>
                                     <div className="text-xs">
                                         <span className="block font-bold text-green-600">£{Math.round(result.solarAnnualSaving)}</span>
                                         <span className="text-[9px] text-slate-400">Annual Saving</span>
                                     </div>
                                 </div>
                             </div>
                        </div>
                    ) : (
                        <div className="text-xs text-slate-400 italic text-center p-2 bg-slate-50 rounded">
                            Add Solar Panels to see ROI calculation
                        </div>
                    )}

                    <hr className="border-slate-100" />

                    {/* Rainwater */}
                    <div className="flex items-start space-x-2">
                         <div className="bg-blue-100 text-blue-600 p-1.5 rounded">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                         </div>
                         <div className="w-full">
                             <h4 className="text-xs font-bold text-slate-700">Rainwater Management</h4>
                             <p className="text-[10px] text-slate-500">Calculated on {result.runoffArea.toFixed(1)}m² effective drainage area</p>
                             <div className="mt-2 grid grid-cols-2 gap-2">
                                  <div className="bg-slate-50 p-1.5 rounded">
                                      <span className="block text-[9px] text-slate-500">Storm Flow Rate</span>
                                      <span className="block text-xs font-bold text-slate-800">{result.runoffFlowRate.toFixed(2)} Liters/sec</span>
                                  </div>
                                  <div className="bg-blue-50 p-1.5 rounded border border-blue-100">
                                      <span className="block text-[9px] text-blue-500">Rec. Guttering</span>
                                      <span className="block text-xs font-bold text-blue-800">{result.gutterRecommendation}</span>
                                  </div>
                             </div>
                         </div>
                    </div>
                </div>
            </div>
            
            <p className="text-[10px] text-slate-400 mt-4 leading-tight">
                * Compliant with BS 5534:2014+A2:2018. Quantities include dynamic wastage factor based on roof complexity. Lead weights based on Code 3 (Soakers) and Code 5 (Valleys).
            </p>
        </div>
      </div>
    </div>
  );
};
