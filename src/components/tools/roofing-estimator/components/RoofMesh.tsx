import React, { useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { Text, Line } from '@react-three/drei';
import { ProjectState, Hole } from '../types';
import { calculateRoof } from '../utils/calculations';
import { useBrickTexture } from '../hooks/useBrickTexture';

// Sub-components
import { RidgeTiles, HipTiles, CeilingJoists, WallPlate, LeadValley, Purlins, StructuralRidge } from './parts/RoofBasics';
import { TiledSlope } from './parts/TiledSlope';
import { FeatureProxy } from './features/FeatureRenderer';

interface RoofMeshProps {
  project: ProjectState;
  setTooltip: (t: {text: string, x: number, y: number} | null) => void;
}

// Helper component for Sprocketed Slope (splits one slope into two: main + kick)
const SprocketSlope = ({ sprocketed, ...props }: any) => {
    if (!sprocketed) return <TiledSlope {...props} />;

    const { width, length, pitch, project } = props;
    const kickLength = project.sprocketSettings?.length ?? 0.5;
    const kickDrop = project.sprocketSettings?.pitchDelta ?? 15;
    
    // Ensure we don't have negative lengths if roof is tiny
    const mainLength = Math.max(0.01, length - kickLength);
    const safeKickLength = Math.min(kickLength, length - 0.01);
    
    const kickPitch = Math.max(10, pitch - kickDrop);
    const deltaPitchRad = ((pitch - kickPitch) * Math.PI) / 180;
    
    return (
        <group>
            {/* Main Upper Slope: Top at Z=0, extends to Z=-mainLength */}
            <group position={[0, 0, 0]}>
                <TiledSlope {...props} length={mainLength} />
            </group>
            
            {/* Kick Slope: Starts at Z=-mainLength, rotated up */}
            <group position={[0, 0, -mainLength]} rotation={[deltaPitchRad, 0, 0]}>
                 <TiledSlope {...props} length={safeKickLength} pitch={kickPitch} />
                 
                 {/* Visual Feedback for Controls */}
                 <group position={[width/2 + 0.2, 0, 0]}>
                     {/* Kick Length Line */}
                     <Line points={[[0, 0.1, 0], [0, 0.1, -safeKickLength]]} color="blue" lineWidth={2} />
                     <Line points={[[0, 0.05, 0], [0, 0.15, 0]]} color="blue" lineWidth={2} />
                     <Line points={[[0, 0.05, -safeKickLength], [0, 0.15, -safeKickLength]]} color="blue" lineWidth={2} />
                     
                     <Text 
                        position={[0, 0.25, -safeKickLength/2]} 
                        fontSize={0.12} 
                        color="blue" 
                        anchorX="center" 
                        anchorY="bottom"
                        rotation={[-Math.PI/2, 0, 0]} // Face up/camera
                     >
                         {`Kick: ${safeKickLength.toFixed(2)}m`}
                     </Text>
                     
                     {/* Drop Angle Text */}
                     <Text 
                        position={[0, 0.25, 0.2]} // Slightly up the main slope
                        fontSize={0.12} 
                        color="red" 
                        anchorX="center" 
                        anchorY="bottom"
                         rotation={[-Math.PI/2, 0, 0]}
                     >
                         {`Drop: ${kickDrop}°`}
                     </Text>
                 </group>
            </group>
        </group>
    )
}

export const RoofMesh: React.FC<RoofMeshProps> = ({ project, setTooltip }) => {
  const { dimensions, visibility, mossControl, selectedSlate, roofStyle, sprocketed, structureType } = project;
  const metrics = useMemo(() => calculateRoof(project), [project]);
  
  const brickTexture = useBrickTexture();

  // Basic Geometry Params
  const run = dimensions.span / 2;
  const rise = run * Math.tan((dimensions.pitch * Math.PI) / 180);
  const rafterLength = run / Math.cos((dimensions.pitch * Math.PI) / 180);
  const pitchRad = (dimensions.pitch * Math.PI) / 180;

  // Hip Pitch Logic
  const hipPitch = dimensions.hipPitch || dimensions.pitch;
  const hipPitchRad = (hipPitch * Math.PI) / 180;
  // Calculate distance from Eaves corner to Ridge Start (X-axis offset)
  // Rise / x = tan(hipPitch) => x = Rise / tan(hipPitch)
  const hipEndRun = rise / Math.tan(hipPitchRad); 
  const hipEndRafterLength = hipEndRun / Math.cos(hipPitchRad);

  // Effective Ridge Length
  // If hipEndRun is very large, ridge len could be negative (pyramid becomes inverted). Clamp to 0.
  // Standard hipped: ridge = eaves - 2*run.
  // But here we use calculated hipEndRun.
  const effectiveRidgeLen = roofStyle === 'Hipped' ? Math.max(0, dimensions.eavesLength - 2 * hipEndRun) : dimensions.eavesLength;
  
  // For Mono Pitch
  const monoRun = dimensions.span;
  const monoRise = monoRun * Math.tan(pitchRad);
  const monoRafterLength = monoRun / Math.cos(pitchRad);

  // --- World Clipping Planes for Hips ---
  const hipPlanes = useMemo(() => {
      if (roofStyle !== 'Hipped') return null;

      const W = dimensions.eavesLength;
      const S = dimensions.span;
      const H = rise;
      const ridgeLen = effectiveRidgeLen;
      const ridgeX = ridgeLen / 2;

      // Helper to create vertical cut plane through 2 points, keeping 'center' side
      const createPlane = (p1: THREE.Vector3, p2: THREE.Vector3) => {
          const vLine = new THREE.Vector3().subVectors(p2, p1);
          const vUp = new THREE.Vector3(0, 1, 0);
          const normal = new THREE.Vector3().crossVectors(vLine, vUp).normalize();
          
          // Check against Center (0, H/2, 0)
          const center = new THREE.Vector3(0, H/2, 0);
          const dist = normal.dot(new THREE.Vector3().subVectors(center, p1));
          
          if (dist < 0) normal.negate();
          
          return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, p1);
      };

      // Corners at Y=0. Ridge at Y=H.
      // Front (Z+) Corners: SW (-X, +Z), SE (+X, +Z)
      // Back (Z-) Corners: NW (-X, -Z), NE (+X, -Z)
      // Note: X width is W. Z depth is S.

      const pNW_Corner = new THREE.Vector3(-W/2, 0, -S/2);
      const pNW_Ridge = new THREE.Vector3(-ridgeX, H, 0);
      const planeNW = createPlane(pNW_Corner, pNW_Ridge);

      const pNE_Corner = new THREE.Vector3(W/2, 0, -S/2);
      const pNE_Ridge = new THREE.Vector3(ridgeX, H, 0);
      const planeNE = createPlane(pNE_Corner, pNE_Ridge);

      const pSW_Corner = new THREE.Vector3(-W/2, 0, S/2);
      const pSW_Ridge = new THREE.Vector3(-ridgeX, H, 0);
      const planeSW = createPlane(pSW_Corner, pSW_Ridge);

      const pSE_Corner = new THREE.Vector3(W/2, 0, S/2);
      const pSE_Ridge = new THREE.Vector3(ridgeX, H, 0);
      const planeSE = createPlane(pSE_Corner, pSE_Ridge);

      return { planeNW, planeNE, planeSW, planeSE };
  }, [roofStyle, dimensions, rise, effectiveRidgeLen]);

  // Main Bottom Cut Plane
  const mainClipPlane = useMemo(() => {
      if (roofStyle === 'Mono') {
         return new THREE.Plane(new THREE.Vector3(0, -1, 0), monoRise - 1.02);
      }
      return new THREE.Plane(new THREE.Vector3(0, -1, 0), rise - 1.02);
  }, [rise, monoRise, roofStyle]);
  const mainClipPlanes = useMemo(() => {
      const planes = [mainClipPlane];
      if (roofStyle === 'Gable' || roofStyle === 'Mono') {
          // Left gable end: keep x > -eavesLength/2
          planes.push(new THREE.Plane(new THREE.Vector3(1, 0, 0), dimensions.eavesLength / 2));
          // Right gable end: keep x < eavesLength/2
          planes.push(new THREE.Plane(new THREE.Vector3(-1, 0, 0), dimensions.eavesLength / 2));
      }
      return planes;
  }, [mainClipPlane, roofStyle, dimensions.eavesLength]);

  // Feature Planes
  const frontPlane = useMemo(() => {
      const normal = new THREE.Vector3(0, Math.cos(pitchRad), Math.sin(pitchRad));
      const point = new THREE.Vector3(0, rise - 1.005, 0); 
      const constant = -normal.dot(point);
      return new THREE.Plane(normal, constant);
  }, [pitchRad, rise]);

  const backPlane = useMemo(() => {
      if (roofStyle === 'Mono') {
         const normal = new THREE.Vector3(0, Math.cos(pitchRad), Math.sin(pitchRad)); 
         return new THREE.Plane(normal, 0); 
      }
      const normal = new THREE.Vector3(0, Math.cos(pitchRad), -Math.sin(pitchRad));
      const point = new THREE.Vector3(0, rise - 1.005, 0);
      const constant = -normal.dot(point);
      return new THREE.Plane(normal, constant);
  }, [pitchRad, rise, roofStyle]);

  const handleHover = useCallback((e: any, text: string) => {
      e.stopPropagation();
      setTooltip({ text, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  }, [setTooltip]);
  
  const handleOut = useCallback(() => setTooltip(null), [setTooltip]);

  // --- Hole Calculation ---
  const calculateHoles = (side: 'front' | 'back') => {
      return project.features.filter(f => f.side === side).map(f => {
          if (f.type === 'solar') return null;
          const currentRafterLen = roofStyle === 'Mono' ? monoRafterLength : rafterLength;
          const zBottom = -currentRafterLen + f.y; 
          
          if (f.type === 'extension') {
              const featPitchRad = ((f.pitch || dimensions.pitch) * Math.PI)/180;
              const featRise = (f.width / 2) * Math.tan(featPitchRad);
              const distUpMainSlope = featRise / Math.sin(pitchRad);
              return { type: 'triangle', x: f.x, zBase: zBottom, zTop: zBottom + distUpMainSlope, widthBase: f.width - 0.05 } as Hole;
          } else if (f.type === 'dormer' && f.dormerType === 'pitched') {
               const featPitchRad = ((f.pitch || dimensions.pitch) * Math.PI)/180;
               const featRise = (f.width / 2) * Math.tan(featPitchRad);
               const zCheekTop = zBottom + f.height;
               const distToPeak = featRise / Math.sin(pitchRad);
               const zPeak = zCheekTop + distToPeak;
               return { type: 'pentagon', x: f.x, zBottom: zBottom, zCheekTop: zCheekTop, zPeak: zPeak, width: f.width - 0.05 } as Hole;
          } else {
             return { type: 'box', x: f.x, zCenter: zBottom, width: f.width, height: f.height } as Hole;
          }
      }).filter(Boolean) as Hole[];
  };

  const frontHoles = useMemo(() => calculateHoles('front'), [project.features, rafterLength, pitchRad, dimensions.pitch, roofStyle]);
  const backHoles = useMemo(() => calculateHoles('back'), [project.features, rafterLength, pitchRad, dimensions.pitch, roofStyle]);

  const meshKey = `${selectedSlate.name}-${selectedSlate.length}-${roofStyle}`;

  // Slope Clipping Planes assignments
  // Front Slope Mesh (Rot Y = PI, Facing +Z South). Clips SW and SE corners.
  const frontSlopePlanes = useMemo(() => hipPlanes ? [mainClipPlane, hipPlanes.planeSW, hipPlanes.planeSE] : mainClipPlanes, [hipPlanes, mainClipPlane]);
  
  // Back Slope Mesh (Rot Y = 0, Facing -Z North). Clips NW and NE corners.
  const backSlopePlanes = useMemo(() => hipPlanes ? [mainClipPlane, hipPlanes.planeNW, hipPlanes.planeNE] : mainClipPlanes, [hipPlanes, mainClipPlane]);
  
  // Left Slope Mesh (Rot Y = PI/2, Facing -X West). 
  // IMPORTANT: For the side slopes (West/East), we need to Keep the "Outer" side relative to the main roof volume, 
  // because the "Keep Center" planes define the North/South slopes. The Side slopes are the "cut off" parts.
  // So we negate the planes to keep the triangle cap.
  const leftSlopePlanes = useMemo(() => hipPlanes ? [mainClipPlane, hipPlanes.planeNW.clone().negate(), hipPlanes.planeSW.clone().negate()] : mainClipPlanes, [hipPlanes, mainClipPlane]);
  
  // Right Slope Mesh (Rot Y = -PI/2, Facing +X East).
  const rightSlopePlanes = useMemo(() => hipPlanes ? [mainClipPlane, hipPlanes.planeNE.clone().negate(), hipPlanes.planeSE.clone().negate()] : mainClipPlanes, [hipPlanes, mainClipPlane]);

  // Helper to draw a hip line, optionally bending it if sprocketed
  const drawHip = (start: THREE.Vector3, end: THREE.Vector3, keyPrefix: string) => {
      if (!sprocketed) {
          return <HipTiles key={keyPrefix} start={start} end={end} showCopper={mossControl} handleHover={handleHover} handleOut={handleOut} />;
      }

      // Calculate the visual break point for the hip tiles
      // The kick slope is defined by length and pitchDrop in sprocketSettings
      const kickDrop = project.sprocketSettings?.pitchDelta ?? 15;
      const kickPitch = Math.max(10, dimensions.pitch - kickDrop);
      const kickRad = (kickPitch * Math.PI)/180;
      
      const kickLen = project.sprocketSettings?.length ?? 0.5;
      const kickRise = kickLen * Math.sin(kickRad); // Vertical rise of the kick section
      
      // Interpolation factor t
      // Local Y at start (Ridge) = 0.
      // Local Y at end (Eaves) = -rise.
      // Local Y at break point = -rise + kickRise.
      // t = (y_break - y_start) / (y_end - y_start) = (-rise + kickRise) / (-rise) = (rise - kickRise) / rise
      
      const t = (rise - kickRise) / rise;
      const safeT = Math.max(0, Math.min(1, t));
      
      const pBreak = new THREE.Vector3().lerpVectors(start, end, safeT);

      return (
          <group key={keyPrefix}>
              <HipTiles start={start} end={pBreak} showCopper={mossControl} handleHover={handleHover} handleOut={handleOut} />
              <HipTiles start={pBreak} end={end} showCopper={mossControl} handleHover={handleHover} handleOut={handleOut} />
          </group>
      );
  };

  return (
    <group>
        {/* === GABLE & HIPPED LOGIC === */}
        {(roofStyle === 'Gable' || roofStyle === 'Hipped') && (
            <>
                {/* Ridge Tiles */}
                {effectiveRidgeLen > 0 && (
                    <group position={[0, rise - 0.06, 0]}>
                        <RidgeTiles length={effectiveRidgeLen} showCopper={mossControl} handleHover={handleHover} handleOut={handleOut} />
                        {structureType === 'Cut' && visibility.rafters && (
                            <StructuralRidge length={effectiveRidgeLen} handleHover={handleHover} handleOut={handleOut} />
                        )}
                    </group>
                )}

                {/* Front Slope (South Facing +Z, Rot Y = PI) */}
                <group rotation={[0, Math.PI, 0]} position={[0, rise, 0]}>
                    <group rotation={[-pitchRad, 0, 0]}>
                        <SprocketSlope 
                            sprocketed={sprocketed}
                            key={`front-${meshKey}`}
                            width={dimensions.eavesLength} 
                            length={rafterLength}
                            pitch={dimensions.pitch}
                            project={project}
                            metrics={metrics}
                            holes={frontHoles}
                            handleHover={handleHover}
                            handleOut={handleOut}
                            clippingPlanes={frontSlopePlanes}
                        />
                        {structureType === 'Cut' && visibility.rafters && !sprocketed && (
                             <Purlins width={dimensions.eavesLength} rafterLen={rafterLength} pitchRad={pitchRad} handleHover={handleHover} handleOut={handleOut} />
                        )}
                    </group>
                </group>

                {/* Back Slope (North Facing -Z, Rot Y = 0) */}
                <group position={[0, rise, 0]}>
                    <group rotation={[-pitchRad, 0, 0]}>
                        <SprocketSlope 
                            sprocketed={sprocketed}
                            key={`back-${meshKey}`}
                            width={dimensions.eavesLength} 
                            length={rafterLength}
                            pitch={dimensions.pitch}
                            project={project}
                            metrics={metrics}
                            holes={backHoles}
                            handleHover={handleHover}
                            handleOut={handleOut}
                            clippingPlanes={backSlopePlanes}
                        />
                        {structureType === 'Cut' && visibility.rafters && !sprocketed && (
                             <Purlins width={dimensions.eavesLength} rafterLen={rafterLength} pitchRad={pitchRad} handleHover={handleHover} handleOut={handleOut} />
                        )}
                    </group>
                </group>

                {/* Hipped Side Slopes */}
                {roofStyle === 'Hipped' && (
                    <>
                        {/* West Side (Facing -X, Rot Y = PI/2) */}
                        <group position={[-dimensions.eavesLength/2 + hipEndRun, rise, 0]} rotation={[0, Math.PI/2, 0]}>
                            <group rotation={[-hipPitchRad, 0, 0]}>
                                <SprocketSlope 
                                    sprocketed={sprocketed}
                                    key={`west-${meshKey}`}
                                    width={dimensions.span}
                                    length={hipEndRafterLength}
                                    pitch={hipPitch}
                                    project={project}
                                    metrics={metrics}
                                    handleHover={handleHover}
                                    handleOut={handleOut}
                                    clippingPlanes={leftSlopePlanes}
                                />
                            </group>
                        </group>
                        {/* East Side (Facing +X, Rot Y = -PI/2) */}
                        <group position={[dimensions.eavesLength/2 - hipEndRun, rise, 0]} rotation={[0, -Math.PI/2, 0]}>
                            <group rotation={[-hipPitchRad, 0, 0]}>
                                <SprocketSlope 
                                    sprocketed={sprocketed}
                                    key={`east-${meshKey}`}
                                    width={dimensions.span}
                                    length={hipEndRafterLength}
                                    pitch={hipPitch}
                                    project={project}
                                    metrics={metrics}
                                    handleHover={handleHover}
                                    handleOut={handleOut}
                                    clippingPlanes={rightSlopePlanes}
                                />
                            </group>
                        </group>
                        
                        {/* Hip Tiles (4 corners) */}
                        <group position={[0, rise, 0]}>
                            {/* NW Hip */}
                            {drawHip(new THREE.Vector3(-effectiveRidgeLen/2, 0, 0), new THREE.Vector3(-dimensions.eavesLength/2, -rise, -dimensions.span/2), "nw")}
                             {/* NE Hip */}
                            {drawHip(new THREE.Vector3(effectiveRidgeLen/2, 0, 0), new THREE.Vector3(dimensions.eavesLength/2, -rise, -dimensions.span/2), "ne")}
                             {/* SW Hip */}
                            {drawHip(new THREE.Vector3(-effectiveRidgeLen/2, 0, 0), new THREE.Vector3(-dimensions.eavesLength/2, -rise, dimensions.span/2), "sw")}
                             {/* SE Hip */}
                            {drawHip(new THREE.Vector3(effectiveRidgeLen/2, 0, 0), new THREE.Vector3(dimensions.eavesLength/2, -rise, dimensions.span/2), "se")}
                        </group>
                    </>
                )}
            </>
        )}

        {/* === MONO PITCH LOGIC === */}
        {roofStyle === 'Mono' && (
             <group rotation={[0, Math.PI, 0]} position={[0, monoRise, -dimensions.span/2]}>
                 <group rotation={[-pitchRad, 0, 0]}>
                    <SprocketSlope 
                        sprocketed={sprocketed}
                        key={`mono-${meshKey}`}
                        width={dimensions.eavesLength} 
                        length={monoRafterLength}
                        pitch={dimensions.pitch}
                        project={project}
                        metrics={metrics}
                        holes={frontHoles}
                        handleHover={handleHover}
                        handleOut={handleOut}
                        clippingPlanes={mainClipPlanes}
                    />
                    {structureType === 'Cut' && visibility.rafters && !sprocketed && (
                             <Purlins width={dimensions.eavesLength} rafterLen={monoRafterLength} pitchRad={pitchRad} handleHover={handleHover} handleOut={handleOut} />
                    )}
                 </group>
             </group>
        )}

        {/* Structural (Joists/Plates) */}
        {visibility.joists && (
             <group position={[0, 0, 0]}>
                 <CeilingJoists width={dimensions.eavesLength} span={dimensions.span} handleHover={handleHover} handleOut={handleOut} />
                 {roofStyle !== 'Hipped' && (
                     <>
                        <WallPlate width={dimensions.eavesLength} zPos={dimensions.span/2 - 0.25} />
                        <WallPlate width={dimensions.eavesLength} zPos={-(dimensions.span/2 - 0.25)} />
                     </>
                 )}
             </group>
        )}

        {project.features.map(f => (
             <FeatureProxy 
                key={f.id + meshKey} 
                feature={f} 
                project={project} 
                metrics={metrics} 
                mainRoofParams={{ rise: roofStyle === 'Mono' ? monoRise : rise, run, pitchRad, length: roofStyle === 'Mono' ? monoRafterLength : rafterLength }}
                handleHover={handleHover}
                handleOut={handleOut}
                clipPlane={f.side === 'front' ? frontPlane : backPlane}
                brickTexture={brickTexture}
             />
        ))}
    </group>
  );
};
