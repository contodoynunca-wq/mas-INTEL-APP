import React, { useMemo } from 'react';
import { ProjectState, ExposureZone, SlateSize, Costing, RoofFeature, FeatureType, DormerType, RoofStyle, StructureType, FlashingType } from '../types';
import { useAppStore } from '../../../../../store/store';

interface ControlsProps {
  project: ProjectState;
  setProject: React.Dispatch<React.SetStateAction<ProjectState>>;
}

export const Controls: React.FC<ControlsProps> = ({ project, setProject }) => {
  const productData = useAppStore(state => state.productData);

  const SLATE_SIZES = useMemo<SlateSize[]>(() => {
      if (productData.length === 0) {
          // Fallback if no products in DB
          return [
              { name: '1a1a MA12', length: 500, width: 250, minPitch: 22.5, thickness: 5, perCrate: 825, price: 2.27 }
          ];
      }
      return productData.map(p => {
          // Parse size like "500x250"
          const parts = p.size.split('x');
          const length = parts.length > 0 ? parseInt(parts[0], 10) || 500 : 500;
          const width = parts.length > 1 ? parseInt(parts[1], 10) || 250 : 250;
          
          return {
              name: p.name,
              length,
              width,
              minPitch: 22.5, // Default min pitch since it's not in Product
              thickness: p.thickness || 5,
              perCrate: p.slatesPerCrate || 800,
              price: p.sellPriceGBP || 0
          };
      });
  }, [productData]);

  // Ensure selectedSlate is valid if productData changes
  React.useEffect(() => {
      if (SLATE_SIZES.length > 0 && !SLATE_SIZES.find(s => s.name === project.selectedSlate.name)) {
          setProject(prev => ({
              ...prev,
              selectedSlate: SLATE_SIZES[0],
              costs: {
                  ...prev.costs,
                  slatePrice: SLATE_SIZES[0].price,
                  slateHalfPrice: SLATE_SIZES[0].price * 3
              }
          }));
      }
  }, [SLATE_SIZES, project.selectedSlate.name, setProject]);

  const updateDim = (key: keyof typeof project.dimensions, value: number) => {
    setProject(prev => ({
      ...prev,
      dimensions: { ...prev.dimensions, [key]: value }
    }));
  };

  const updateCost = (key: keyof Costing, value: number) => {
    setProject(prev => {
      const newCosts = { ...prev.costs, [key]: value };
      return { ...prev, costs: newCosts };
    });
  };
  
  const toggleVisibility = (key: keyof typeof project.visibility) => {
      setProject(prev => ({
          ...prev,
          visibility: { ...prev.visibility, [key]: !prev.visibility[key] }
      }));
  };

  const addFeature = (type: FeatureType) => {
      const newFeature: RoofFeature = {
          id: Math.random().toString(36).substr(2, 9),
          type,
          side: 'front', 
          dormerType: type === 'dormer' ? 'pitched' : undefined, 
          width: type === 'chimney' ? 0.6 : (type === 'extension' ? 4.0 : 1.5),
          height: type === 'extension' ? 3.0 : (type === 'chimney' ? 0.6 : 1.5),
          pitch: 35, 
          x: 0,
          y: type === 'extension' ? 0 : 1.5,
      };
      setProject(prev => ({ ...prev, features: [...prev.features, newFeature] }));
  };
  
  const updateFeature = (id: string, updates: Partial<RoofFeature>) => {
      setProject(prev => ({
          ...prev,
          features: prev.features.map(f => f.id === id ? { ...f, ...updates } : f)
      }));
  };

  return (
    <div className="absolute top-0 left-0 h-full w-80 bg-white shadow-xl z-10 overflow-y-auto p-4 border-r border-slate-200">
      <h1 className="text-xl font-bold text-slate-800 mb-4">Mont Azul Builder</h1>
      
      {/* Visibility Layers */}
      <section className="mb-6 bg-slate-100 p-2 rounded-lg">
          <h2 className="text-xs font-bold text-slate-500 uppercase mb-2">Layers</h2>
          <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={project.visibility.slates} onChange={() => toggleVisibility('slates')} />
                  <span>Slates</span>
              </label>
               <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={project.visibility.battens} onChange={() => toggleVisibility('battens')} />
                  <span>Battens</span>
              </label>
               <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={project.visibility.rafters} onChange={() => toggleVisibility('rafters')} />
                  <span>Rafters</span>
              </label>
               <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={project.visibility.joists} onChange={() => toggleVisibility('joists')} />
                  <span>Joists</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={project.visibility.lead} onChange={() => toggleVisibility('lead')} />
                  <span>Lead / Flashings</span>
              </label>
          </div>
      </section>

      {/* Roof Style */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Roof Style</h2>
        <div className="grid grid-cols-3 gap-2 mb-3">
           {(['Gable', 'Hipped', 'Mono'] as RoofStyle[]).map(style => (
               <button 
                  key={style}
                  onClick={() => setProject(prev => ({...prev, roofStyle: style}))}
                  className={`px-2 py-2 text-xs font-medium rounded border ${project.roofStyle === style ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
               >
                   {style}
               </button>
           ))}
        </div>
        
        <div className="flex items-center space-x-2 border-t pt-2">
             <input 
                type="checkbox" 
                checked={project.sprocketed}
                onChange={(e) => setProject(prev => ({...prev, sprocketed: e.target.checked}))}
                className="rounded text-blue-600 focus:ring-blue-500"
             />
             <label className="text-xs font-medium text-slate-700">Sprocketed Eaves (Bell-cast)</label>
        </div>

        {project.sprocketed && (
             <div className="mt-2 pl-4 border-l-2 border-blue-100 space-y-3 bg-slate-50 p-2 rounded">
                 <div>
                    <label className="block text-[10px] text-slate-500 mb-1 flex justify-between">
                        <span>Kick Length</span>
                        <span className="font-bold">{project.sprocketSettings.length.toFixed(2)}m</span>
                    </label>
                    <input 
                        type="range" min="0.2" max="1.5" step="0.05" 
                        value={project.sprocketSettings.length}
                        onChange={(e) => setProject(prev => ({...prev, sprocketSettings: { ...prev.sprocketSettings, length: parseFloat(e.target.value) }}))}
                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                 </div>
                 <div>
                    <label className="block text-[10px] text-slate-500 mb-1 flex justify-between">
                        <span>Pitch Drop (Less)</span>
                        <span className="font-bold">{project.sprocketSettings.pitchDelta}°</span>
                    </label>
                    <input 
                        type="range" min="5" max="25" step="1" 
                        value={project.sprocketSettings.pitchDelta}
                        onChange={(e) => setProject(prev => ({...prev, sprocketSettings: { ...prev.sprocketSettings, pitchDelta: parseFloat(e.target.value) }}))}
                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                 </div>
             </div>
        )}
      </section>

      {/* Dimensions Section */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">House Geometry</h2>
        <div className="space-y-3">
          
          {/* Structure Type Selection */}
          <div className="flex bg-slate-100 p-1 rounded">
             {(['Truss', 'Cut'] as StructureType[]).map(type => (
                 <button
                    key={type}
                    onClick={() => setProject(prev => ({...prev, structureType: type}))}
                    className={`flex-1 text-xs py-1 rounded font-medium ${project.structureType === type ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                 >
                     {type === 'Cut' ? 'Traditional Cut' : 'Truss Roof'}
                 </button>
             ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Main Pitch (Degrees)</label>
            <input 
              type="range" min="15" max="60" step="1"
              value={project.dimensions.pitch}
              onChange={(e) => updateDim('pitch', parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
               <span>15°</span>
               <span className="font-bold text-blue-600">{project.dimensions.pitch}°</span>
               <span>60°</span>
            </div>
          </div>

          {project.roofStyle === 'Hipped' && (
              <div>
                <label className="block text-xs font-medium text-slate-700">Hip Ends Pitch (Degrees)</label>
                <input 
                  type="range" min="15" max="60" step="1"
                  value={project.dimensions.hipPitch ?? project.dimensions.pitch}
                  onChange={(e) => updateDim('hipPitch', parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                   <span>15°</span>
                   <span className="font-bold text-purple-600">{project.dimensions.hipPitch || project.dimensions.pitch}°</span>
                   <span>60°</span>
                </div>
              </div>
          )}
          
          <div className="grid grid-cols-2 gap-2">
            <div>
                <label className="block text-xs font-medium text-slate-700">Main Eaves (m)</label>
                <input 
                    type="number" value={project.dimensions.eavesLength}
                    onChange={(e) => updateDim('eavesLength', parseFloat(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-1"
                />
            </div>
            <div>
                <label className="block text-xs font-medium text-slate-700">Main Span (m)</label>
                <input 
                    type="number" value={project.dimensions.span}
                    onChange={(e) => updateDim('span', parseFloat(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-1"
                />
            </div>
          </div>

           <div>
              <label className="block text-xs font-medium text-slate-700">Exposure Zone</label>
              <select 
                  value={project.exposure}
                  onChange={(e) => setProject(prev => ({...prev, exposure: e.target.value as ExposureZone}))}
                  className="mt-1 block w-full rounded-md border-gray-300 border p-1 text-sm"
              >
                  <option value="Sheltered">Sheltered</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Severe">Severe</option>
                  <option value="Very Severe">Very Severe</option>
              </select>
           </div>
        </div>
      </section>

      {/* Spec Section */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Specification</h2>
        <div className="space-y-3">
             <div>
                <label className="block text-xs font-medium text-slate-700">Select Product</label>
                <select 
                    value={project.selectedSlate.name}
                    onChange={(e) => {
                        const slate = SLATE_SIZES.find(s => s.name === e.target.value);
                        if (slate) {
                            setProject(prev => ({
                                ...prev, 
                                selectedSlate: slate,
                                costs: {
                                    ...prev.costs,
                                    slatePrice: slate.price,
                                    slateHalfPrice: parseFloat((slate.price * 3).toFixed(2)) // 3x Price Rule
                                }
                            }));
                        }
                    }}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-1 text-sm"
                >
                    {SLATE_SIZES.map(s => (
                        <option key={s.name} value={s.name}>
                            {s.name} ({s.length}x{s.width}) - £{s.price}
                        </option>
                    ))}
                </select>
                {project.dimensions.pitch < project.selectedSlate.minPitch && (
                    <p className="text-red-500 text-[10px] mt-1 font-bold">⚠️ Pitch too low for this slate!</p>
                )}
             </div>

             <div>
                <label className="block text-xs font-medium text-slate-700">Abutment Flashing Detail</label>
                 <select 
                    value={project.abutmentFlashing}
                    onChange={(e) => setProject(prev => ({...prev, abutmentFlashing: e.target.value as FlashingType}))}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-1 text-sm"
                >
                    <option value="Cover">Cover Flashing (Standard)</option>
                    <option value="Stepped">Stepped Flashing (Detailed)</option>
                </select>
             </div>

             <div className="flex items-center space-x-2">
                 <input 
                    type="checkbox" 
                    checked={project.mossControl || false}
                    onChange={(e) => setProject(prev => ({...prev, mossControl: e.target.checked}))}
                    className="rounded text-blue-600 focus:ring-blue-500"
                 />
                 <label className="text-xs font-medium text-slate-700">Add Copper Moss Control Strip</label>
             </div>
        </div>
      </section>

      {/* Features */}
      <section className="mb-6">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Add Features</h2>
          <div className="grid grid-cols-2 gap-2 mb-4">
              <button onClick={() => addFeature('window')} className="px-2 py-1 bg-blue-50 hover:bg-blue-100 rounded text-xs text-blue-700 font-medium">+ Velux</button>
              <button onClick={() => addFeature('chimney')} className="px-2 py-1 bg-orange-50 hover:bg-orange-100 rounded text-xs text-orange-700 font-medium">+ Chimney</button>
              <button onClick={() => addFeature('dormer')} className="px-2 py-1 bg-purple-50 hover:bg-purple-100 rounded text-xs text-purple-700 font-medium">+ Dormer</button>
              <button onClick={() => addFeature('solar')} className="px-2 py-1 bg-green-50 hover:bg-green-100 rounded text-xs text-green-700 font-medium">+ Solar</button>
              <button onClick={() => addFeature('extension')} className="col-span-2 px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs text-gray-700 font-medium">+ Single Story Extension</button>
          </div>
          
          <div className="space-y-3">
             {project.features.map((f, i) => (
                 <div key={f.id} className="bg-slate-50 p-2 rounded border border-slate-200">
                     <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold uppercase text-slate-600">{f.type}</span>
                        <button onClick={() => setProject(prev => ({...prev, features: prev.features.filter(feat => feat.id !== f.id)}))} className="text-red-500 hover:text-red-700 text-xs font-bold">×</button>
                     </div>
                     
                     <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                             <label className="text-[10px] text-slate-500 block">Side</label>
                             <select 
                                value={f.side} 
                                onChange={(e) => updateFeature(f.id, { side: e.target.value as any })}
                                className="w-full text-xs p-1 border rounded"
                             >
                                 <option value="front">Front</option>
                                 <option value="back">Back</option>
                             </select>
                        </div>
                        {f.type === 'dormer' && (
                             <div>
                                <label className="text-[10px] text-slate-500 block">Style</label>
                                <select 
                                    value={f.dormerType} 
                                    onChange={(e) => updateFeature(f.id, { dormerType: e.target.value as DormerType })}
                                    className="w-full text-xs p-1 border rounded"
                                >
                                    <option value="pitched">Pitched</option>
                                    <option value="flat">Flat</option>
                                </select>
                             </div>
                        )}
                     </div>

                     <div className="space-y-1">
                        <div>
                            <label className="text-[10px] text-slate-500 flex justify-between">
                                <span>Position X (Along Eaves)</span>
                                <span>{f.x.toFixed(1)}m</span>
                            </label>
                            <input 
                                type="range" min={-(project.dimensions.eavesLength/2)} max={(project.dimensions.eavesLength/2)} step="0.1"
                                value={f.x}
                                onChange={(e) => updateFeature(f.id, { x: parseFloat(e.target.value) })}
                                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                        
                        <div>
                            <label className="text-[10px] text-slate-500 flex justify-between">
                                <span>{f.type === 'extension' ? 'Position Y (Projection Offset)' : 'Position Y (Up Slope)'}</span>
                                <span>{f.y.toFixed(1)}m</span>
                            </label>
                                <input 
                                type="range" min={f.type === 'extension' ? -2 : 0.5} max={f.type === 'extension' ? 2 : 6} step="0.1"
                                value={f.y}
                                onChange={(e) => updateFeature(f.id, { y: parseFloat(e.target.value) })}
                                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>

                        {(f.type === 'extension' || (f.type === 'dormer' && f.dormerType === 'pitched')) && (
                            <>
                             <div>
                                <label className="text-[10px] text-slate-500 flex justify-between">
                                    <span>Gable Span / Width</span>
                                    <span>{f.width.toFixed(1)}m</span>
                                </label>
                                <input 
                                    type="range" min="1" max={f.type === 'extension' ? 6 : 4} step="0.1"
                                    value={f.width}
                                    onChange={(e) => updateFeature(f.id, { width: parseFloat(e.target.value) })}
                                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                             <div>
                                <label className="text-[10px] text-slate-500 flex justify-between">
                                    <span>Roof Pitch</span>
                                    <span>{f.pitch ?? project.dimensions.pitch}°</span>
                                </label>
                                <input 
                                    type="range" min="15" max="60" step="1"
                                    value={f.pitch ?? project.dimensions.pitch}
                                    onChange={(e) => updateFeature(f.id, { pitch: parseFloat(e.target.value) })}
                                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                            </>
                        )}

                        {f.type === 'extension' && (
                            <div>
                                <label className="text-[10px] text-slate-500 flex justify-between">
                                    <span>Projection Outwards</span>
                                    <span>{f.height.toFixed(1)}m</span>
                                </label>
                                <input 
                                    type="range" min="1" max="10" step="0.5"
                                    value={f.height}
                                    onChange={(e) => updateFeature(f.id, { height: parseFloat(e.target.value) })}
                                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        )}
                        {f.type !== 'extension' && f.type !== 'dormer' && (
                              <div>
                                <label className="text-[10px] text-slate-500 flex justify-between">
                                    <span>Width</span>
                                    <span>{f.width.toFixed(1)}m</span>
                                </label>
                                <input 
                                    type="range" min="0.5" max="4" step="0.1"
                                    value={f.width}
                                    onChange={(e) => updateFeature(f.id, { width: parseFloat(e.target.value) })}
                                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        )}
                     </div>
                 </div>
             ))}
          </div>
      </section>

      {/* Pricing Config */}
      <section className="mb-6 border-t pt-4">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Unit Costs (£)</h2>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                    <label>Slate (ea)</label>
                    <input type="number" step="0.01" value={project.costs.slatePrice} onChange={e => updateCost('slatePrice', parseFloat(e.target.value))} className="w-full border p-1 rounded" />
                </div>
                <div>
                    <label>Half (ea) (3x)</label>
                    <input type="number" step="0.01" value={project.costs.slateHalfPrice} onChange={e => updateCost('slateHalfPrice', parseFloat(e.target.value))} className="w-full border p-1 rounded" />
                </div>
            </div>
             <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                    <label>Batten (m)</label>
                    <input type="number" step="0.01" value={project.costs.timberBattenPrice} onChange={e => updateCost('timberBattenPrice', parseFloat(e.target.value))} className="w-full border p-1 rounded" />
                </div>
                <div>
                    <label>Rafter (m)</label>
                    <input type="number" step="0.01" value={project.costs.timberRafterPrice} onChange={e => updateCost('timberRafterPrice', parseFloat(e.target.value))} className="w-full border p-1 rounded" />
                </div>
            </div>
             <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                    <label>Purlin (m)</label>
                    <input type="number" step="0.01" value={project.costs.timberPurlinPrice} onChange={e => updateCost('timberPurlinPrice', parseFloat(e.target.value))} className="w-full border p-1 rounded" />
                </div>
                <div>
                    <label>Ridge Beam (m)</label>
                    <input type="number" step="0.01" value={project.costs.timberRidgeBeamPrice} onChange={e => updateCost('timberRidgeBeamPrice', parseFloat(e.target.value))} className="w-full border p-1 rounded" />
                </div>
            </div>
             <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                    <label>Membrane (m²)</label>
                    <input type="number" step="0.01" value={project.costs.membranePrice} onChange={e => updateCost('membranePrice', parseFloat(e.target.value))} className="w-full border p-1 rounded" />
                </div>
                <div>
                    <label>Nails (kg)</label>
                    <input type="number" step="0.01" value={project.costs.nailPrice} onChange={e => updateCost('nailPrice', parseFloat(e.target.value))} className="w-full border p-1 rounded" />
                </div>
            </div>
             <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                    <label>Lead C3 (kg)</label>
                    <input type="number" step="0.01" value={project.costs.leadCode3Price} onChange={e => updateCost('leadCode3Price', parseFloat(e.target.value))} className="w-full border p-1 rounded" />
                </div>
                 <div>
                    <label>Lead Clips (ea)</label>
                    <input type="number" step="0.01" value={project.costs.leadClipPrice} onChange={e => updateCost('leadClipPrice', parseFloat(e.target.value))} className="w-full border p-1 rounded" />
                </div>
            </div>
          </div>
      </section>
    </div>
  );
};
