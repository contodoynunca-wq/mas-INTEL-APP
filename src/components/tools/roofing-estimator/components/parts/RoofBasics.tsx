import React, { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';

// --- Wall Plate ---
export const WallPlate: React.FC<{ width: number, zPos: number }> = ({ width, zPos }) => {
    return (
        <mesh position={[0, 0, zPos]} castShadow receiveShadow>
            <boxGeometry args={[width, 0.075, 0.1]} />
            <meshStandardMaterial color="#5D4037" />
        </mesh>
    );
}

// --- Ceiling Joists ---
export const CeilingJoists: React.FC<{ width: number, span: number, handleHover: any, handleOut: any }> = ({ width, span, handleHover, handleOut }) => {
    const spacing = 0.6;
    const numRafters = Math.max(2, Math.ceil(width / spacing) + 1);
    const actualSpan = span - 0.1; 
    
    const joistGeo = useMemo(() => new THREE.BoxGeometry(0.05, 0.15, actualSpan), [actualSpan]);
    const joistMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8B5A2B', roughness: 0.9, side: THREE.DoubleSide }), []);
    
    const meshRef = useRef<THREE.InstancedMesh>(null);

    useLayoutEffect(() => {
        if (!meshRef.current) return;
        const dummy = new THREE.Object3D();
        for (let i = 0; i < numRafters; i++) {
            const x = -width/2 + (i * (width / (numRafters - 1)));
            dummy.position.set(x, 0, 0); 
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [width, actualSpan, numRafters]);

    return (
        <instancedMesh 
            ref={meshRef} 
            args={[joistGeo, joistMat, numRafters]} 
            castShadow
            receiveShadow
            onPointerMove={(e) => {
                e.stopPropagation();
                handleHover(e, `Ceiling Joist (${actualSpan.toFixed(2)}m)`);
            }}
            onPointerOut={handleOut}
        />
    );
};

// --- Structural Purlins (NEW) ---
export const Purlins: React.FC<{ width: number, rafterLen: number, pitchRad: number, handleHover: any, handleOut: any }> = ({ width, rafterLen, pitchRad, handleHover, handleOut }) => {
    // Logic: If rafterLen > 2.5m, add 1 purlin. If > 4.5m, add 2.
    const rows = rafterLen > 4.5 ? 2 : (rafterLen > 2.5 ? 1 : 0);
    if (rows === 0) return null;

    const purlins = [];
    const mat = new THREE.MeshStandardMaterial({ color: '#5D4037' });
    const purlinGeo = new THREE.BoxGeometry(width, 0.225, 0.075); // 225x75mm

    for(let i=1; i<=rows; i++) {
        // Distribute evenly up the slope
        const distUpSlope = (rafterLen / (rows + 1)) * i;
        // Convert to Y/Z coords (relative to ridge/slope origin)
        // Note: This component is placed inside the slope rotation group, so Z is along slope
        const zPos = -distUpSlope;
        
        purlins.push(
            <mesh 
                key={i} 
                position={[0, -0.25, zPos]} // Sit below rafter
                rotation={[0, 0, 0]} 
                material={mat}
                castShadow receiveShadow
                onPointerMove={(e) => handleHover(e, 'Structural Purlin (225x75)')}
                onPointerOut={handleOut}
            >
                <primitive object={purlinGeo} />
            </mesh>
        );
    }

    return <group>{purlins}</group>;
};

// --- Structural Ridge Beam (NEW) ---
export const StructuralRidge: React.FC<{ length: number, handleHover: any, handleOut: any }> = ({ length, handleHover, handleOut }) => {
    return (
        <mesh 
            position={[0, -0.2, 0]} 
            onPointerMove={(e) => handleHover(e, 'Structural Ridge Beam (175x47)')} 
            onPointerOut={handleOut}
            castShadow receiveShadow
        >
            <boxGeometry args={[0.047, 0.175, length]} />
            <meshStandardMaterial color="#5D4037" />
        </mesh>
    );
};

// --- Ridge Tiles ---
export const RidgeTiles: React.FC<{length: number, showCopper: boolean, handleHover: any, handleOut: any, clippingPlanes?: THREE.Plane[]}> = ({ length, showCopper, handleHover, handleOut, clippingPlanes }) => {
    const tileLen = 0.45;
    const gap = 0.02; 
    const effectiveLen = tileLen + gap;
    const count = Math.ceil(length / effectiveLen);
    const tiles = [];
    
    for(let i=0; i<count; i++) {
        const xPos = -length/2 + (i * effectiveLen) + effectiveLen/2;
        if (xPos > length/2 + 0.1) break; 
        tiles.push(
            <mesh 
                key={i} 
                position={[xPos, 0, 0]} 
                rotation={[0, 0, Math.PI/2]} 
                castShadow 
                receiveShadow
                onPointerMove={(e) => {
                    if (clippingPlanes && clippingPlanes.length > 0) {
                        for (let j = 0; j < clippingPlanes.length; j++) {
                            if (clippingPlanes[j].distanceToPoint(e.point) < -0.01) return;
                        }
                    }
                    e.stopPropagation(); 
                    handleHover(e, 'Ridge Tile'); 
                }}
                onPointerOut={handleOut}
            >
                <cylinderGeometry args={[0.12, 0.12, 0.45, 16, 1, false, 0, Math.PI]} />
                <meshStandardMaterial color="#7c2d12" roughness={0.9} clippingPlanes={clippingPlanes} />
            </mesh>
        )
    }
    return (
        <group>
            {tiles}
            {showCopper && (
                <mesh position={[0, 0.13, 0]} rotation={[0, 0, Math.PI/2]} castShadow>
                     <cylinderGeometry args={[0.01, 0.01, length, 8]} />
                     <meshStandardMaterial color="#b87333" metalness={0.8} roughness={0.2} clippingPlanes={clippingPlanes} />
                </mesh>
            )}
        </group>
    )
}

// --- Hip Tiles ---
export const HipTiles: React.FC<{ start: THREE.Vector3, end: THREE.Vector3, showCopper: boolean, handleHover: any, handleOut: any }> = ({ start, end, showCopper, handleHover, handleOut }) => {
    const vec = useMemo(() => new THREE.Vector3().subVectors(end, start), [start, end]);
    const length = vec.length();
    const mid = useMemo(() => new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5), [start, end]);
    
    const quaternion = useMemo(() => {
        const dummy = new THREE.Object3D();
        dummy.position.copy(start); 
        dummy.lookAt(end); // +Z points to End
        return dummy.quaternion;
    }, [start, end]);

    const tileLen = 0.45;
    const gap = 0.02; 
    const effectiveLen = tileLen + gap;
    const count = Math.ceil(length / effectiveLen);
    const tiles = [];

    // Local positions along Z axis due to LookAt
    for(let i=0; i<count; i++) {
        const zPos = -length/2 + (i * effectiveLen) + effectiveLen/2;
        tiles.push(
            <mesh 
                key={i} 
                position={[0, 0, zPos]} 
                rotation={[0, Math.PI/2, Math.PI/2]} 
                castShadow 
                receiveShadow
                onPointerMove={(e) => { e.stopPropagation(); handleHover(e, 'Hip Tile'); }}
                onPointerOut={handleOut}
            >
                <cylinderGeometry args={[0.12, 0.12, 0.45, 16, 1, false, 0, Math.PI]} />
                <meshStandardMaterial color="#7c2d12" roughness={0.9} />
            </mesh>
        )
    }

    return (
        <group position={mid} quaternion={quaternion}>
            {tiles}
            {showCopper && (
                <mesh position={[0, 0.13, 0]} rotation={[0, Math.PI/2, Math.PI/2]} castShadow>
                     <cylinderGeometry args={[0.01, 0.01, length, 8]} />
                     <meshStandardMaterial color="#b87333" metalness={0.8} roughness={0.2} />
                </mesh>
            )}
        </group>
    );
};

// --- Valleys ---
export const ProceduralValley: React.FC<{ start: THREE.Vector3, end: THREE.Vector3, handleHover: any, handleOut: any, clippingPlanes?: THREE.Plane[] }> = ({ start, end, handleHover, handleOut, clippingPlanes }) => {
    const vec = useMemo(() => new THREE.Vector3().subVectors(end, start), [start, end]);
    const length = vec.length();
    const mid = useMemo(() => new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5), [start, end]);
    const quaternion = useMemo(() => {
        const dummy = new THREE.Object3D();
        dummy.position.copy(start); 
        dummy.lookAt(end);
        return dummy.quaternion;
    }, [start, end]);

    return (
        <group position={mid} quaternion={quaternion}>
             <mesh onPointerMove={(e) => {
                 if (clippingPlanes && clippingPlanes.length > 0) {
                     for (let i = 0; i < clippingPlanes.length; i++) {
                         if (clippingPlanes[i].distanceToPoint(e.point) < -0.01) return;
                     }
                 }
                 handleHover(e, 'Lead Valley');
             }} onPointerOut={handleOut} receiveShadow>
                {/* Thin but visible valley */}
                <boxGeometry args={[0.25, 0.005, length]} /> 
                <meshStandardMaterial color="#666" roughness={0.6} metalness={0.3} side={THREE.DoubleSide} clippingPlanes={clippingPlanes} />
             </mesh>
        </group>
    );
};

export const LeadValley: React.FC<{ start: THREE.Vector3, end: THREE.Vector3, bisector: THREE.Vector3, handleHover: any, handleOut: any, clippingPlanes?: THREE.Plane[] }> = ({ start, end, bisector, handleHover, handleOut, clippingPlanes }) => {
    const length = start.distanceTo(end);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    
    const quaternion = useMemo(() => {
        const dummy = new THREE.Object3D();
        dummy.position.copy(start);
        dummy.up.copy(bisector);
        dummy.lookAt(end);
        return dummy.quaternion;
    }, [start, end, bisector]);

    // Lift slightly along the bisector (which is local Y) to sit on top of tiles
    const thickness = 0.003; 
    const lift = 0.005;      
    const width = 0.35; // 350mm visible lead width

    return (
        <group position={mid} quaternion={quaternion}>
             <mesh position={[0, lift, 0]} onPointerMove={(e) => {
                 if (clippingPlanes && clippingPlanes.length > 0) {
                     for (let i = 0; i < clippingPlanes.length; i++) {
                         if (clippingPlanes[i].distanceToPoint(e.point) < -0.01) return;
                     }
                 }
                 handleHover(e, 'Lead Valley (Code 5)');
             }} onPointerOut={handleOut} receiveShadow>
                <boxGeometry args={[width, thickness, length]} />
                <meshStandardMaterial color="#64748b" roughness={0.5} metalness={0.2} side={THREE.DoubleSide} clippingPlanes={clippingPlanes} />
             </mesh>
        </group>
    );
};

// --- Flashings ---
export const FeatureFlashing: React.FC<{ width: number, depth: number, pitchRad: number, type?: 'chimney' | 'dormer' | 'extension' | 'window', handleHover: any, handleOut: any, clippingPlanes?: THREE.Plane[] }> = ({ width, depth, pitchRad, type, handleHover, handleOut, clippingPlanes }) => {
    const projectedDepth = depth / Math.cos(pitchRad);
    const yOffset = 0.03; // Sit closer to tiles
    const thickness = 0.005; // Thin lead sheet

    // Lead material
    const leadMaterial = new THREE.MeshStandardMaterial({
        color: "#64748b", // Slate gray / lead color
        roughness: 0.5,
        metalness: 0.2,
        clippingPlanes: clippingPlanes,
        side: THREE.DoubleSide
    });

    const windowFlashingMaterial = new THREE.MeshStandardMaterial({
        color: "#333333", // Dark grey for window kits
        roughness: 0.7,
        metalness: 0.1,
        clippingPlanes: clippingPlanes,
        side: THREE.DoubleSide
    });

    return (
        <group rotation={[-pitchRad, 0, 0]}>
            {/* Front Apron Flashing */}
            <mesh position={[0, yOffset, -(projectedDepth/2 + 0.1)]} rotation={[0, 0, 0]} onPointerMove={(e) => {
                if (clippingPlanes && clippingPlanes.length > 0) {
                    for (let i = 0; i < clippingPlanes.length; i++) {
                        if (clippingPlanes[i].distanceToPoint(e.point) < -0.01) return;
                    }
                }
                handleHover(e, type === 'window' ? 'Bottom Flashing' : 'Lead Apron (Code 3)');
            }} onPointerOut={handleOut} receiveShadow>
                 <boxGeometry args={[width + 0.3, thickness, 0.2]} /> 
                 <primitive object={type === 'window' ? windowFlashingMaterial : leadMaterial} attach="material" />
            </mesh>
            
            {/* Side Soakers / Step Flashing */}
            {type !== 'extension' && (
                <>
                    <mesh position={[-width/2 - 0.05, yOffset, 0]} onPointerMove={(e) => {
                        if (clippingPlanes && clippingPlanes.length > 0) {
                            for (let i = 0; i < clippingPlanes.length; i++) {
                                if (clippingPlanes[i].distanceToPoint(e.point) < -0.01) return;
                            }
                        }
                        handleHover(e, type === 'window' ? 'Side Flashing' : 'Lead Soakers & Step Flashing (Code 3)');
                    }} onPointerOut={handleOut} receiveShadow>
                         <boxGeometry args={[0.1, thickness, projectedDepth + 0.2]} />
                         <primitive object={type === 'window' ? windowFlashingMaterial : leadMaterial} attach="material" />
                    </mesh>
                    <mesh position={[width/2 + 0.05, yOffset, 0]} onPointerMove={(e) => {
                        if (clippingPlanes && clippingPlanes.length > 0) {
                            for (let i = 0; i < clippingPlanes.length; i++) {
                                if (clippingPlanes[i].distanceToPoint(e.point) < -0.01) return;
                            }
                        }
                        handleHover(e, type === 'window' ? 'Side Flashing' : 'Lead Soakers & Step Flashing (Code 3)');
                    }} onPointerOut={handleOut} receiveShadow>
                         <boxGeometry args={[0.1, thickness, projectedDepth + 0.2]} />
                         <primitive object={type === 'window' ? windowFlashingMaterial : leadMaterial} attach="material" />
                    </mesh>
                </>
            )}

            {/* Back Gutter / Top Flashing */}
            {(type === 'chimney' || type === 'window') && (
                 <mesh position={[0, yOffset, projectedDepth/2 + 0.1]} onPointerMove={(e) => {
                     if (clippingPlanes && clippingPlanes.length > 0) {
                         for (let i = 0; i < clippingPlanes.length; i++) {
                             if (clippingPlanes[i].distanceToPoint(e.point) < -0.01) return;
                         }
                     }
                     handleHover(e, type === 'window' ? 'Top Flashing' : 'Lead Back Gutter (Code 4)');
                 }} onPointerOut={handleOut} receiveShadow>
                     <boxGeometry args={[width + 0.3, thickness, 0.2]} />
                     <primitive object={type === 'window' ? windowFlashingMaterial : leadMaterial} attach="material" />
                 </mesh>
            )}
        </group>
    );
};
