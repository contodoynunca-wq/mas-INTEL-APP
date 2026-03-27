import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ProjectState, RoofFeature } from '../../types';
import { TiledSlope } from '../parts/TiledSlope';
import { RidgeTiles, ProceduralValley, LeadValley, FeatureFlashing } from '../parts/RoofBasics';

// --- Extension Geometry ---
const ExtensionGeometry = ({ feature, project, metrics, verticalRot, handleHover, handleOut, mainRoofClipPlane, mainRoofParams, zOnSlope }: any) => {
    const pitch = feature.pitch || project.dimensions.pitch;
    const pitchRad = (pitch * Math.PI) / 180;
    
    const extWidth = feature.width; 
    const projectionLength = feature.height; 
    
    const run = extWidth / 2;
    const rise = run * Math.tan(pitchRad);
    
    const mainPitchRad = (project.dimensions.pitch * Math.PI)/180;
    const distToMainRoof = rise / Math.tan(mainPitchRad); 
    
    const totalRidgeLen = projectionLength + distToMainRoof;
    const totalRafterLen = run / Math.cos(pitchRad);
    const ridgeZ = (projectionLength - distToMainRoof) / 2;

    const extensionBaseLocalY = mainRoofParams.rise + (zOnSlope * Math.sin(mainRoofParams.pitchRad));
    const ridgeWorldY = (extensionBaseLocalY - 1) + rise;
    const ridgeClipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), ridgeWorldY - 0.02), [ridgeWorldY]);
    const clipPlanes = useMemo(() => [mainRoofClipPlane, ridgeClipPlane], [mainRoofClipPlane, ridgeClipPlane]);
    const mainRoofPlanes = useMemo(() => [mainRoofClipPlane], [mainRoofClipPlane]);

    const leftStart = new THREE.Vector3(-extWidth/2, 0, 0);
    const rightStart = new THREE.Vector3(extWidth/2, 0, 0);
    const peak = new THREE.Vector3(0, rise, -distToMainRoof);

    return (
        <group rotation={verticalRot}>
            <group rotation={[0, Math.PI, 0]}>
                 <group position={[0, rise - 0.06, ridgeZ]} rotation={[0, Math.PI/2, 0]}>
                     <RidgeTiles length={totalRidgeLen} showCopper={project.mossControl} clippingPlanes={mainRoofPlanes} handleHover={handleHover} handleOut={handleOut} />
                 </group>
                 {project.visibility.lead && (
                     <group position={[0, 0, 0]}>
                          <ProceduralValley start={leftStart} end={peak} handleHover={handleHover} handleOut={handleOut} clippingPlanes={mainRoofPlanes} />
                          <ProceduralValley start={rightStart} end={peak} handleHover={handleHover} handleOut={handleOut} clippingPlanes={mainRoofPlanes} />
                     </group>
                 )}
                 <group position={[0, rise, (projectionLength - distToMainRoof)/2]}> 
                    <group rotation={[0, -Math.PI/2, 0]}>
                        <group rotation={[-pitchRad, 0, 0]}>
                             <TiledSlope width={totalRidgeLen} length={totalRafterLen} pitch={pitch} project={project} metrics={metrics} handleHover={handleHover} handleOut={handleOut} clippingPlanes={clipPlanes} />
                        </group>
                    </group>
                 </group>
                 <group position={[0, rise, (projectionLength - distToMainRoof)/2]}> 
                    <group rotation={[0, Math.PI/2, 0]}>
                        <group rotation={[-pitchRad, 0, 0]}>
                             <TiledSlope width={totalRidgeLen} length={totalRafterLen} pitch={pitch} project={project} metrics={metrics} handleHover={handleHover} handleOut={handleOut} clippingPlanes={clipPlanes} />
                        </group>
                    </group>
                 </group>
            </group>
        </group>
    )
}

// --- Dormer Geometry ---
const DormerGeometry = ({ feature, project, metrics, verticalRot, handleHover, handleOut, mainRoofClipPlane, mainRoofParams, zOnSlope, brickMat }: any) => {
    const isPitched = feature.dormerType === 'pitched';
    const pitch = feature.pitch || project.dimensions.pitch;
    const pitchRad = (pitch * Math.PI) / 180;
    const width = feature.width;
    const length = feature.height;
    const isFront = feature.side === 'front';

    // Use passed-down planes from FeatureProxy (which are Main Roof Slope planes)
    const basePlanes = useMemo(() => [mainRoofClipPlane], [mainRoofClipPlane]);
    
    // Dormer Roof Calculation
    const run = width / 2;
    const rise = run * Math.tan(pitchRad);
    const rafterLen = run / Math.cos(pitchRad);
    const mainPitchRad = (project.dimensions.pitch * Math.PI)/180;
    const mainRise = mainRoofParams.rise;
    
    // Intersection Calculation: How far back does the ridge go to hit the main roof?
    // z = 0 is Front. +z is Up Main Slope.
    // Ridge Height H = 1.0 + rise.
    // Main Roof Height at z: y = z * tan(mainPitch).
    // Intersection: z = (1.0 + rise) / tan(mainPitch).
    const z_intersect = (1.0 + rise) / Math.tan(mainPitchRad);
    
    // Calculate cheek length for soakers (where eaves level y=1.0 intersects main roof)
    // Eaves height at 1.0. Main roof y = z * tan(mainPitch). 1.0 = z * tan.
    const cheekLength = 1.0 / Math.tan(mainPitchRad);

    // Ensure we draw enough geometry to hit the roof. Add buffer for clipping safety.
    const realLength = Math.max(length, z_intersect + 0.5); 
    const centerZ = realLength / 2;

    // Start of Valley is where the Dormer Eaves (y=1.0) hit the Main Roof (y=z*tan(a))
    // 1.0 = z * tan(a) -> z = 1.0 / tan(a). This is exactly 'cheekLength'.
    // The valley runs from the end of the cheek soaker to the ridge peak.
    const valleyStartZ = cheekLength;
    const leftStart = new THREE.Vector3(-width/2, 1.0, valleyStartZ); 
    const rightStart = new THREE.Vector3(width/2, 1.0, valleyStartZ); 
    const peak = new THREE.Vector3(0, 1.0 + rise, z_intersect);

    // Calculate Valley Bisector Vectors for orientation
    // Main Roof Normal in this space (rotated +Pitch from Slope): (0, cosP, -sinP) assuming +Z is Back
    // Actually, +Z is Up/Back. Normal points Up/Forward (-Z).
    const mainNormal = useMemo(() => new THREE.Vector3(0, Math.cos(mainPitchRad), -Math.sin(mainPitchRad)), [mainPitchRad]);
    
    // Dormer Roof Normals
    const dormerNormalL = useMemo(() => new THREE.Vector3(-Math.sin(pitchRad), Math.cos(pitchRad), 0), [pitchRad]);
    const dormerNormalR = useMemo(() => new THREE.Vector3(Math.sin(pitchRad), Math.cos(pitchRad), 0), [pitchRad]);

    const bisectorL = useMemo(() => new THREE.Vector3().addVectors(mainNormal, dormerNormalL).normalize(), [mainNormal, dormerNormalL]);
    const bisectorR = useMemo(() => new THREE.Vector3().addVectors(mainNormal, dormerNormalR).normalize(), [mainNormal, dormerNormalR]);


    // Dormer Tiles Clipping Planes (To clip ridge tops)
    const dormerClipPlanes = useMemo(() => {
        if (!isPitched) return basePlanes;
        const dormerBaseLocalY = mainRise + (zOnSlope * Math.sin(mainPitchRad));
        const ridgeWorldY = (dormerBaseLocalY - 1) + 1.0 + rise; 
        const ridgeClipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), ridgeWorldY - 0.02);
        return [mainRoofClipPlane, ridgeClipPlane];
    }, [isPitched, rise, mainRise, mainPitchRad, zOnSlope, basePlanes, mainRoofClipPlane]);

    // Cheek Planes for clipping the brick walls to the dormer roof pitch
    const cheekPlanes = useMemo(() => {
        if (!isPitched) return { left: basePlanes, right: basePlanes };

        // Matrix construction for transforming local planes to world planes
        const matrix = new THREE.Matrix4();
        // 1. Main Roof Group Placement
        const mat1 = new THREE.Matrix4().makeTranslation(0, mainRise, 0);
        const mat2 = new THREE.Matrix4().makeRotationY(isFront ? Math.PI : 0);
        // 2. Tilt to Slope
        const mat3 = new THREE.Matrix4().makeRotationX(-mainPitchRad);
        // 3. Position on Slope
        const mat4 = new THREE.Matrix4().makeTranslation(feature.x, 0, zOnSlope);
        // 4. Vertical Correction (Local Geometry Space)
        const mat5 = new THREE.Matrix4().makeRotationX(mainPitchRad);
        
        matrix.multiply(mat1).multiply(mat2).multiply(mat3).multiply(mat4).multiply(mat5);

        const margin = 0.05; // 50mm below slate line
        const localPoint = new THREE.Vector3(0, 1.0 + rise - margin, 0);
        const sin = Math.sin(pitchRad);
        const cos = Math.cos(pitchRad);
        
        // Define Local Planes (Normals pointing Inward/Down to keep geometry below)
        const normalLeft = new THREE.Vector3(sin, -cos, 0);
        const planeLeft = new THREE.Plane().setFromNormalAndCoplanarPoint(normalLeft, localPoint);
        
        const normalRight = new THREE.Vector3(-sin, -cos, 0);
        const planeRight = new THREE.Plane().setFromNormalAndCoplanarPoint(normalRight, localPoint);

        // Transform to World Space
        const worldPlaneLeft = planeLeft.clone().applyMatrix4(matrix);
        const worldPlaneRight = planeRight.clone().applyMatrix4(matrix);

        return {
            left: [mainRoofClipPlane, worldPlaneLeft],
            right: [mainRoofClipPlane, worldPlaneRight]
        };
    }, [isPitched, pitchRad, rise, mainRoofClipPlane, feature.x, zOnSlope, isFront, mainRise, mainPitchRad]);

    // Materials with cheek clipping planes
    const leftMat = useMemo(() => {
        const m = brickMat.clone();
        m.clippingPlanes = cheekPlanes.left;
        return m;
    }, [brickMat, cheekPlanes]);

    const rightMat = useMemo(() => {
        const m = brickMat.clone();
        m.clippingPlanes = cheekPlanes.right;
        return m;
    }, [brickMat, cheekPlanes]);

    const cheekThick = 0.15;
    
    // Cheek geometry
    const cheekHeight = 3.0; 
    const cheekCenterY = -0.5; // Arbitrary center, clipping handles the top/bottom

    // Front Gable Triangle
    const gableShape = useMemo(() => {
        const shape = new THREE.Shape();
        shape.moveTo(-width/2, 1.0);
        shape.lineTo(width/2, 1.0);
        shape.lineTo(0, 1.0 + rise);
        shape.lineTo(-width/2, 1.0);
        return shape;
    }, [width, rise]);

    return (
        <group rotation={verticalRot}>
            
            {/* Left Cheek */}
            <mesh position={[-width/2 + cheekThick/2, cheekCenterY, centerZ]} material={leftMat} onPointerMove={(e) => handleHover(e, 'Dormer Cheek')} onPointerOut={handleOut} castShadow receiveShadow>
                 <boxGeometry args={[cheekThick, cheekHeight, realLength]} />
            </mesh>
            
            {/* Right Cheek */}
             <mesh position={[width/2 - cheekThick/2, cheekCenterY, centerZ]} material={rightMat} onPointerMove={(e) => handleHover(e, 'Dormer Cheek')} onPointerOut={handleOut} castShadow receiveShadow>
                 <boxGeometry args={[cheekThick, cheekHeight, realLength]} />
            </mesh>
            
            {/* Front Gable Triangle */}
            {isPitched && (
                <mesh position={[0, 0, cheekThick/2]} material={brickMat} onPointerMove={(e) => handleHover(e, 'Dormer Gable')} onPointerOut={handleOut} castShadow receiveShadow>
                    <shapeGeometry args={[gableShape]} />
                </mesh>
            )}

            {isPitched ? (
                <>
                    {/* Valleys - Rendered OUTSIDE the +1.0 offset group because coordinates (1.0, 1.0+rise) are already absolute to dormer base */}
                    {project.visibility.lead && (
                        <group> 
                             <LeadValley start={leftStart} end={peak} bisector={bisectorL} handleHover={handleHover} handleOut={handleOut} clippingPlanes={basePlanes} />
                             <LeadValley start={rightStart} end={peak} bisector={bisectorR} handleHover={handleHover} handleOut={handleOut} clippingPlanes={basePlanes} />
                        </group>
                    )}

                    <group position={[0, 1.0, 0]}>
                        <group position={[0, rise - 0.06, centerZ]} rotation={[0, Math.PI/2, 0]}>
                            <RidgeTiles length={realLength} showCopper={project.mossControl} clippingPlanes={basePlanes} handleHover={handleHover} handleOut={handleOut} />
                        </group>
                        
                        <group position={[0, rise, centerZ]}>
                            <group rotation={[0, -Math.PI/2, 0]}>
                                <group rotation={[-pitchRad, 0, 0]}>
                                    <TiledSlope width={realLength} length={rafterLen} pitch={pitch} project={project} metrics={metrics} handleHover={handleHover} handleOut={handleOut} clippingPlanes={dormerClipPlanes} />
                                </group>
                            </group>
                        </group>

                        <group position={[0, rise, centerZ]}>
                            <group rotation={[0, Math.PI/2, 0]}>
                                <group rotation={[-pitchRad, 0, 0]}>
                                    <TiledSlope width={realLength} length={rafterLen} pitch={pitch} project={project} metrics={metrics} handleHover={handleHover} handleOut={handleOut} clippingPlanes={dormerClipPlanes} />
                                </group>
                            </group>
                        </group>
                    </group>
                </>
            ) : (
                <mesh position={[0, 1.05, centerZ]} castShadow receiveShadow onPointerMove={(e) => handleHover(e, 'Flat Roof Felt')} onPointerOut={handleOut}>
                    <boxGeometry args={[width + 0.2, 0.1, realLength + 0.2]} />
                    <meshStandardMaterial color="#4a5568" clippingPlanes={basePlanes} side={THREE.DoubleSide} />
                </mesh>
            )}
            
            {project.visibility.lead && (
                <group position={[0, (cheekLength/2) * Math.tan(mainPitchRad), cheekLength/2]}>
                     <FeatureFlashing width={width} depth={cheekLength} pitchRad={mainPitchRad} type="dormer" handleHover={handleHover} handleOut={handleOut} clippingPlanes={basePlanes} />
                </group>
            )}
        </group>
    );
}

// --- Feature Proxy ---
export const FeatureProxy: React.FC<{ 
    feature: RoofFeature, 
    project: ProjectState, 
    metrics: any, 
    mainRoofParams: any,
    handleHover: any,
    handleOut: any,
    clipPlane: THREE.Plane,
    brickTexture?: THREE.Texture | null
}> = ({ feature, project, metrics, mainRoofParams, handleHover, handleOut, clipPlane, brickTexture }) => {
    
    const zOnSlope = -mainRoofParams.length + feature.y;
    const isFront = feature.side === 'front';
    const mainGroupPos: [number, number, number] = [0, mainRoofParams.rise, 0];
    const mainGroupRot: [number, number, number] = isFront ? [0, Math.PI, 0] : [0, 0, 0];
    const tiltRot: [number, number, number] = [-mainRoofParams.pitchRad, 0, 0];
    const verticalRot: [number, number, number] = [mainRoofParams.pitchRad, 0, 0];

    const brickMat = useMemo(() => new THREE.MeshStandardMaterial({ 
        map: brickTexture || null, 
        color: brickTexture ? '#ffffff' : '#8d5524', 
        roughness: 0.9,
        clippingPlanes: [clipPlane],
        side: THREE.DoubleSide 
    }), [brickTexture, clipPlane]);

    // Active clipping planes for other materials
    const activePlanes = useMemo(() => [clipPlane], [clipPlane]);

    return (
        <group position={mainGroupPos} rotation={mainGroupRot}>
            <group rotation={tiltRot}>
                <group position={[feature.x, 0, zOnSlope]}>
                    {feature.type === 'extension' && (
                        <ExtensionGeometry feature={feature} project={project} metrics={metrics} verticalRot={verticalRot} handleHover={handleHover} handleOut={handleOut} mainRoofClipPlane={clipPlane} mainRoofParams={mainRoofParams} zOnSlope={zOnSlope} />
                    )}

                    {feature.type === 'dormer' && (
                        <DormerGeometry feature={feature} project={project} metrics={metrics} verticalRot={verticalRot} handleHover={handleHover} handleOut={handleOut} mainRoofClipPlane={clipPlane} mainRoofParams={mainRoofParams} zOnSlope={zOnSlope} brickMat={brickMat} />
                    )}

                    {feature.type === 'chimney' && (
                        <group rotation={verticalRot}>
                            <mesh position={[0, 0, 0]} material={brickMat} onPointerMove={(e) => handleHover(e, 'Brick Chimney')} onPointerOut={handleOut} castShadow receiveShadow>
                                <boxGeometry args={[feature.width, 1.5 + 1.0, 0.6]} />
                            </mesh>
                            <mesh position={[0, 1.35, 0]} onPointerMove={(e) => handleHover(e, 'Chimney Pot')} onPointerOut={handleOut} castShadow receiveShadow>
                                <cylinderGeometry args={[0.12, 0.12, 0.4, 16]} />
                                <meshStandardMaterial color="#c05621" clippingPlanes={activePlanes} />
                            </mesh>
                            {project.visibility.lead && (
                                <FeatureFlashing width={feature.width} depth={0.6} pitchRad={mainRoofParams.pitchRad} type="chimney" handleHover={handleHover} handleOut={handleOut} clippingPlanes={activePlanes} />
                            )}
                        </group>
                    )}

                    {feature.type === 'solar' && (
                        <group position={[0, 0.08, 0]} onPointerMove={(e) => handleHover(e, 'Solar Panel')} onPointerOut={handleOut}>
                            <boxGeometry args={[feature.width, 0.04, feature.height]} />
                            <meshStandardMaterial color="#1a202c" roughness={0.5} clippingPlanes={activePlanes} />
                            <mesh position={[0, 0.021, 0]} rotation={[-Math.PI/2, 0, 0]} receiveShadow>
                                <planeGeometry args={[feature.width - 0.05, feature.height - 0.05]} />
                                <meshStandardMaterial color="#2b6cb0" metalness={0.6} roughness={0.2} clippingPlanes={activePlanes} />
                            </mesh>
                        </group>
                    )}
                    
                    {feature.type === 'window' && (
                        <group position={[0, 0.05, 0]}>
                            <mesh onPointerMove={(e) => handleHover(e, 'Velux Frame')} onPointerOut={handleOut} castShadow receiveShadow>
                                <boxGeometry args={[feature.width, 0.1, feature.height]} />
                                <meshStandardMaterial color="#2d3748" clippingPlanes={activePlanes} />
                            </mesh>
                            <mesh position={[0, 0.04, 0]} rotation={[-Math.PI/2, 0, 0]} receiveShadow>
                                <planeGeometry args={[feature.width - 0.15, feature.height - 0.15]} />
                                <meshStandardMaterial color="#90cdf4" metalness={0.9} roughness={0.05} clippingPlanes={activePlanes} />
                            </mesh>
                            {project.visibility.lead && (
                                <FeatureFlashing width={feature.width} depth={feature.height} pitchRad={0} type="window" handleHover={handleHover} handleOut={handleOut} clippingPlanes={activePlanes} />
                            )}
                        </group>
                    )}
                </group>
            </group>
        </group>
    );
};
