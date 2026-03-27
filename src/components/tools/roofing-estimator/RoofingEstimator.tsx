import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ProjectState, SlateSize } from './types';
import { DEFAULT_COSTS } from './constants';
import { Scene } from './components/Scene';
import { Controls } from './components/Controls';
import { Estimator } from './components/Estimator';
import { useAppStore } from '../../../../store/store';

const INITIAL_STATE: ProjectState = {
  roofStyle: 'Gable',
  structureType: 'Truss', // Default to Truss
  abutmentFlashing: 'Cover', // Default to Cover
  sprocketed: false,
  sprocketSettings: {
      length: 0.5,
      pitchDelta: 15
  },
  dimensions: {
    eavesLength: 8.0,
    span: 6.0,
    pitch: 35,
    hipPitch: 35, // Default to same as main pitch
  },
  exposure: 'Moderate',
  selectedSlate: { name: '1a1a MA12', length: 500, width: 250, minPitch: 22.5, thickness: 5, perCrate: 825, price: 2.27 }, 
  features: [],
  costs: {
      ...DEFAULT_COSTS,
      slatePrice: 2.27,
      slateHalfPrice: 6.81 // Enforce 3x rule on startup
  },
  visibility: {
      slates: true,
      battens: true,
      rafters: true,
      joists: true,
      lead: true
  },
  mossControl: false,
};

export const RoofingEstimator = ({ initialProject }: { initialProject?: Partial<ProjectState> }) => {
  const [project, setProject] = useState<ProjectState>({ ...INITIAL_STATE, ...initialProject });
  const [isPrinting, setIsPrinting] = useState(false);
  
  const productData = useAppStore(state => state.productData);

  useEffect(() => {
      if (productData.length > 0 && !initialProject?.selectedSlate) {
          const p = productData[0];
          const parts = p.size.split('x');
          const length = parts.length > 0 ? parseInt(parts[0], 10) || 500 : 500;
          const width = parts.length > 1 ? parseInt(parts[1], 10) || 250 : 250;
          
          const defaultSlate: SlateSize = {
              name: p.name,
              length,
              width,
              minPitch: 22.5,
              thickness: p.thickness || 5,
              perCrate: p.slatesPerCrate || 800,
              price: p.sellPriceGBP || 0
          };

          setProject(prev => ({
              ...prev,
              selectedSlate: defaultSlate,
              costs: {
                  ...prev.costs,
                  slatePrice: defaultSlate.price,
                  slateHalfPrice: parseFloat((defaultSlate.price * 3).toFixed(2))
              }
          }));
      }
  }, [productData, initialProject]);

  // Use a ref for the tooltip DOM element to avoid re-renders on every mouse move
  const tooltipRef = useRef<HTMLDivElement>(null);

  const setTooltip = useCallback((data: {text: string, x: number, y: number} | null) => {
      if (!tooltipRef.current) return;
      
      if (data) {
          tooltipRef.current.style.opacity = '1';
          tooltipRef.current.innerText = data.text;
          // Use transform for better performance than left/top
          tooltipRef.current.style.transform = `translate(${data.x + 15}px, ${data.y + 15}px)`;
      } else {
          tooltipRef.current.style.opacity = '0';
      }
  }, []);

  return (
    <div className="h-[800px] w-full flex flex-col bg-slate-50 relative print:h-auto print:overflow-visible rounded-lg border border-slate-200 overflow-hidden">
      {/* 3D Viewport - Hidden on Print */}
      <div className="absolute inset-0 z-0 print:hidden">
        <Scene project={project} setTooltip={setTooltip} isPrinting={isPrinting} />
      </div>

      {/* Tooltip Overlay - Optimized */}
      <div 
          ref={tooltipRef}
          className="fixed pointer-events-none bg-black/80 text-white p-2 rounded text-xs whitespace-nowrap backdrop-blur-sm border border-white/20 shadow-xl z-50 print:hidden transition-opacity duration-150 opacity-0"
          style={{ left: 0, top: 0, willChange: 'transform' }} 
      />

      {/* UI Layers - Hidden on Print */}
      <div className="print:hidden h-full relative z-10 pointer-events-none">
        <div className="pointer-events-auto h-full w-80">
            <Controls project={project} setProject={setProject} />
        </div>
      </div>
      
      {/* Estimator - Visible on Print (handled internally) */}
      <div className="pointer-events-auto absolute top-0 right-0 h-full p-4">
        <Estimator project={project} onPreparePrint={setIsPrinting} />
      </div>
      
      {/* Overlay for small screens warning - Hidden on Print */}
      <div className="md:hidden fixed inset-0 bg-white z-50 flex items-center justify-center p-8 text-center print:hidden">
          <p>Please use a desktop or tablet for the 3D Builder experience.</p>
      </div>
    </div>
  );
}
