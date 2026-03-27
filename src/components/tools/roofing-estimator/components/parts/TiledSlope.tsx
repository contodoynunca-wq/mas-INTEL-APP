import React, { useMemo, useRef, useLayoutEffect, useState } from 'react';
import * as THREE from 'three';
import { ProjectState, Hole } from '../../types';

// --- Underlay ---
const UnderlayMesh: React.FC<{ width: number, length: number, holes: Hole[], handleHover: any, handleOut: any, clippingPlanes?: THREE.Plane[] }> = ({ width, length, holes, handleHover, handleOut, clippingPlanes }) => {
    const shape = useMemo(() => {
        const s = new THREE.Shape();
        s.moveTo(-width/2, -length/2);
        s.lineTo(width/2, -length/2);
        s.lineTo(width/2, length/2);
        s.lineTo(-width/2, length/2);
        s.lineTo(-width/2, -length/2);

        holes.forEach(h => {
            const holePath = new THREE.Path();

            if (h.type === 'box') {
                const xMin = h.x - h.width!/2;
                const xMax = h.x + h.width!/2;
                const zMin = h.zCenter! - h.height!/2;
                const zMax = h.zCenter! + h.height!/2;
                
                const yMin = zMin + length/2;
                const yMax = zMax + length/2;
                
                holePath.moveTo(xMin, yMin);
                holePath.lineTo(xMax, yMin);
                holePath.lineTo(xMax, yMax);
                holePath.lineTo(xMin, yMax);
                holePath.lineTo(xMin, yMin);
                s.holes.push(holePath);
            } 
            else if (h.type === 'pentagon') {
                const xMin = h.x - h.width!/2;
                const xMax = h.x + h.width!/2;
                
                const yBottom = h.zBottom! + length/2;
                const yCheek = h.zCheekTop! + length/2;
                const yPeak = h.zPeak! + length/2;
                
                holePath.moveTo(xMin, yBottom);
                holePath.lineTo(xMax, yBottom);
                holePath.lineTo(xMax, yCheek);
                holePath.lineTo(h.x, yPeak);
                holePath.lineTo(xMin, yCheek);
                holePath.lineTo(xMin, yBottom);
                s.holes.push(holePath);
            }
             else if (h.type === 'triangle') {
                const xMin = h.x - h.widthBase!/2;
                const xMax = h.x + h.widthBase!/2;
                const yBase = h.zBase! + length/2;
                const yTop = h.zTop! + length/2;
                
                holePath.moveTo(xMin, yBase);
                holePath.lineTo(xMax, yBase);
                holePath.lineTo(h.x, yTop);
                holePath.lineTo(xMin, yBase);
                s.holes.push(holePath);
            }
        });

        return s;
    }, [width, length, holes]);

    return (
        <mesh position={[0, 0, -length/2]} rotation={[-Math.PI/2, 0, 0]} onPointerMove={(e) => {
            if (clippingPlanes && clippingPlanes.length > 0) {
                for (let i = 0; i < clippingPlanes.length; i++) {
                    if (clippingPlanes[i].distanceToPoint(e.point) < -0.01) return;
                }
            }
            e.stopPropagation();
            handleHover(e, 'Felt / Underlay');
        }} onPointerOut={handleOut} receiveShadow>
            <shapeGeometry args={[shape]} />
            <meshStandardMaterial color="#4a5568" transparent opacity={0.9} side={THREE.DoubleSide} clippingPlanes={clippingPlanes} />
        </mesh>
    );
};

// --- Structural Trimmers ---
const StructuralTrimmers: React.FC<{ holes: Hole[], length: number, handleHover: any, handleOut: any, clippingPlanes?: THREE.Plane[] }> = ({ holes, length, handleHover, handleOut, clippingPlanes }) => {
    return (
        <group>
            {holes.map((h, i) => {
                const elements = [];
                const mat = new THREE.MeshStandardMaterial({ color: '#5D4037', roughness: 0.8, clippingPlanes: clippingPlanes });
                const thickness = 0.05; 
                const depth = 0.15; 

                if (h.type === 'box') {
                    const topZ = h.zCenter! + h.height!/2 + thickness/2;
                    const btmZ = h.zCenter! - h.height!/2 - thickness/2;
                    const w = h.width! + thickness*2;
                    
                    elements.push(
                        <mesh key="top" position={[h.x, -depth/2 - 0.02, topZ]} material={mat} castShadow receiveShadow>
                            <boxGeometry args={[w, depth, thickness]} />
                        </mesh>
                    );
                    elements.push(
                        <mesh key="btm" position={[h.x, -depth/2 - 0.02, btmZ]} material={mat} castShadow receiveShadow>
                            <boxGeometry args={[w, depth, thickness]} />
                        </mesh>
                    );
                    const sideH = h.height!;
                    elements.push(
                        <mesh key="left" position={[h.x - h.width!/2 - thickness/2, -depth/2 - 0.02, h.zCenter!]} material={mat} castShadow receiveShadow>
                            <boxGeometry args={[thickness, depth, sideH]} />
                        </mesh>
                    );
                     elements.push(
                        <mesh key="right" position={[h.x + h.width!/2 + thickness/2, -depth/2 - 0.02, h.zCenter!]} material={mat} castShadow receiveShadow>
                            <boxGeometry args={[thickness, depth, sideH]} />
                        </mesh>
                    );
                } else if (h.type === 'pentagon') {
                     const btmZ = h.zBottom! - thickness/2;
                     const w = h.width! + thickness*2;
                     elements.push(
                        <mesh key="btm" position={[h.x, -depth/2 - 0.02, btmZ]} material={mat} castShadow receiveShadow>
                            <boxGeometry args={[w, depth, thickness]} />
                        </mesh>
                     );
                     const vertLen = h.zCheekTop! - h.zBottom!;
                     const vertZ = h.zBottom! + vertLen/2;
                     elements.push(
                        <mesh key="left" position={[h.x - h.width!/2 - thickness/2, -depth/2 - 0.02, vertZ]} material={mat} castShadow receiveShadow>
                            <boxGeometry args={[thickness, depth, vertLen]} />
                        </mesh>
                    );
                     elements.push(
                        <mesh key="right" position={[h.x + h.width!/2 + thickness/2, -depth/2 - 0.02, vertZ]} material={mat} castShadow receiveShadow>
                            <boxGeometry args={[thickness, depth, vertLen]} />
                        </mesh>
                    );
                }

                return (
                    <group key={i} onPointerOver={(e) => handleHover(e, 'Structural Trimmer')} onPointerOut={handleOut}>
                        {elements}
                    </group>
                );
            })}
        </group>
    )
}

interface TiledSlopeProps {
    width: number;
    length: number;
    pitch: number;
    project: ProjectState;
    metrics: any;
    holes?: Hole[]; 
    handleHover: any;
    handleOut: any;
    clippingPlanes?: THREE.Plane[];
}

export const TiledSlope: React.FC<TiledSlopeProps> = ({ 
    width, length, pitch, project, metrics, holes = [], handleHover, handleOut, clippingPlanes = []
}) => {
    
    const { selectedSlate, visibility } = project;
    
    const standardRef = useRef<THREE.InstancedMesh>(null);
    const halfRef = useRef<THREE.InstancedMesh>(null);
    const battenRef = useRef<THREE.InstancedMesh>(null);
    const rafterRef = useRef<THREE.InstancedMesh>(null);

    const [highlightMatrix, setHighlightMatrix] = useState<THREE.Matrix4 | null>(null);
    const [highlightGeo, setHighlightGeo] = useState<THREE.BufferGeometry | null>(null);

    const slateThicknessM = (selectedSlate.thickness || 5) / 1000;
    const slateGeo = useMemo(() => new THREE.BoxGeometry(selectedSlate.width / 1000, slateThicknessM, selectedSlate.length / 1000), [selectedSlate, slateThicknessM]);
    const halfSlateGeo = useMemo(() => new THREE.BoxGeometry((selectedSlate.width / 1000) * 1.5, slateThicknessM, selectedSlate.length / 1000), [selectedSlate, slateThicknessM]);
    const battenGeo = useMemo(() => new THREE.BoxGeometry(1, 0.025, 0.050), []); 
    const rafterGeo = useMemo(() => new THREE.BoxGeometry(0.05, 0.15, 1), []);

    const activePlanes = useMemo(() => clippingPlanes, [clippingPlanes]);

    // Enhanced materials for realism
    const slateMaterial = useMemo(() => new THREE.MeshStandardMaterial({ 
        color: '#1e293b', // Darker slate
        roughness: 0.6, 
        metalness: 0.1,
        clippingPlanes: activePlanes,
        clipShadows: true,
        side: THREE.DoubleSide,
    }), [activePlanes]);
    
    const woodMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8B5A2B', roughness: 0.9, clippingPlanes: activePlanes, side: THREE.DoubleSide }), [activePlanes]);
    const battenMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#5D4037', clippingPlanes: activePlanes, side: THREE.DoubleSide }), [activePlanes]);

    useLayoutEffect(() => {
        if (!standardRef.current || !battenRef.current || !rafterRef.current) return;

        const dummy = new THREE.Object3D();
        const gaugeM = metrics.gauge / 1000;
        const numRows = Math.ceil(length / gaugeM);
        const slateWidthM = selectedSlate.width / 1000;
        const jointGap = 0.005; 
        const slateLengthM = selectedSlate.length / 1000;

        const getHoleZRangeAtX = (cx: number) => {
             let ranges: number[][] = [];
             
             holes.forEach(h => {
                const margin = 0.01; 
                
                if (h.type === 'box') {
                    if (cx > h.x - h.width!/2 - margin && cx < h.x + h.width!/2 + margin) {
                        ranges.push([h.zCenter! - h.height!/2 - margin, h.zCenter! + h.height!/2 + margin]);
                    }
                } else if (h.type === 'triangle') {
                    const dx = Math.abs(cx - h.x);
                    const halfWidthBase = h.widthBase! / 2;
                    if (dx < halfWidthBase + margin) {
                        const ratio = dx / (halfWidthBase + margin);
                        if (ratio <= 1.0) {
                             const zLimit = h.zTop! - ratio * (h.zTop! - h.zBase!);
                             const rMin = Math.min(h.zBase!, zLimit) - margin;
                             const rMax = Math.max(h.zBase!, zLimit) + margin;
                             ranges.push([rMin, rMax]);
                        }
                    }
                } else if (h.type === 'pentagon') {
                    if (cx > h.x - h.width!/2 - margin && cx < h.x + h.width!/2 + margin) {
                        ranges.push([h.zBottom! - margin, h.zCheekTop!]);
                        const dx = Math.abs(cx - h.x);
                        const halfWidth = h.width! / 2;
                        if (dx <= halfWidth + margin) {
                            const ratio = dx / (halfWidth + margin);
                            const zLimit = h.zPeak! - ratio * (h.zPeak! - h.zCheekTop!);
                            ranges.push([h.zCheekTop!, zLimit + margin]);
                        }
                    }
                }
             });
             return ranges;
        }

        const isColliding = (cx: number, cz: number) => {
            const ranges = getHoleZRangeAtX(cx);
            return ranges.some(r => cz >= r[0] && cz <= r[1]);
        };

        const rafterSpacing = 0.6;
        const numRafters = Math.max(2, Math.ceil(width / rafterSpacing) + 1);
        let validRafterCount = 0;
        
        if(visibility.rafters) {
            for(let i=0; i<numRafters; i++) {
                const xPos = -width/2 + (i * (width / (numRafters - 1)));
                let segments = [{start: -length, end: 0}];

                const ranges = getHoleZRangeAtX(xPos);
                ranges.forEach(r => {
                     const [holeMinZ, holeMaxZ] = r;
                     const nextSegments: {start: number, end: number}[] = [];
                     segments.forEach(seg => {
                         if (seg.end < holeMinZ || seg.start > holeMaxZ) {
                             nextSegments.push(seg);
                             return;
                         }
                         if (seg.start < holeMinZ) nextSegments.push({start: seg.start, end: holeMinZ});
                         if (seg.end > holeMaxZ) nextSegments.push({start: holeMaxZ, end: seg.end});
                     });
                     segments = nextSegments;
                });

                segments.forEach(seg => {
                    const len = seg.end - seg.start;
                    if (len > 0.05) { 
                        const center = seg.start + len/2;
                        dummy.position.set(xPos, -0.12, center);
                        dummy.rotation.set(0, 0, 0);
                        dummy.scale.set(1, 1, len);
                        dummy.updateMatrix();
                        rafterRef.current!.setMatrixAt(validRafterCount++, dummy.matrix);
                    }
                });
            }

            holes.forEach(h => {
                 let leftX, rightX;
                 const w = h.widthBase || h.width || 1.0;
                 leftX = h.x - w/2 - 0.05;
                 rightX = h.x + w/2 + 0.05;
                 
                dummy.position.set(leftX, -0.12, -length/2);
                dummy.scale.set(1, 1, length);
                dummy.updateMatrix();
                rafterRef.current!.setMatrixAt(validRafterCount++, dummy.matrix);
                dummy.position.set(rightX, -0.12, -length/2);
                dummy.scale.set(1, 1, length);
                dummy.updateMatrix();
                rafterRef.current!.setMatrixAt(validRafterCount++, dummy.matrix);
            });
        }
        
        rafterRef.current.count = validRafterCount;
        rafterRef.current.instanceMatrix.needsUpdate = true;


        let bIdx = 0, sIdx = 0, hIdx = 0;
        battenRef.current.count = visibility.battens ? numRows * 4 : 0; 
        standardRef.current.count = visibility.slates ? ((Math.ceil(width/slateWidthM) + 2) * numRows) : 0;
        if (halfRef.current) halfRef.current.count = visibility.slates ? (numRows * 4) : 0;

        for (let row = 0; row < numRows; row++) {
            const distFromEaves = row * gaugeM;
            const zPos = -length + distFromEaves + (gaugeM/2); 
            const battenZ = zPos + (slateLengthM/2) - 0.19;

            if(visibility.battens) {
                let segments = [{start: -width/2, end: width/2}];
                holes.forEach(hole => {
                    const ranges = getHoleZRangeAtX(hole.x); 
                    
                    let minZ, maxZ;
                    if (hole.type === 'pentagon') {
                         minZ = hole.zBottom!;
                         maxZ = hole.zPeak!;
                    } else {
                         minZ = Math.min(hole.zBase!, hole.zTop ?? hole.zCenter! + hole.height!/2);
                         maxZ = Math.max(hole.zBase!, hole.zTop ?? hole.zCenter! + hole.height!/2);
                         if (hole.type === 'box') {
                             minZ = hole.zCenter! - hole.height!/2;
                             maxZ = hole.zCenter! + hole.height!/2;
                         }
                    }

                    if (battenZ >= minZ && battenZ <= maxZ) {
                         let currentWidth = hole.width || hole.widthBase || 0;
                         if (hole.type === 'triangle') {
                             const totalH = Math.abs(hole.zTop! - hole.zBase!);
                             const currentH = Math.abs(hole.zTop! - battenZ);
                             currentWidth = hole.widthBase! * (currentH / totalH);
                         } else if (hole.type === 'pentagon') {
                             if (battenZ > hole.zCheekTop!) {
                                 const totalH = hole.zPeak! - hole.zCheekTop!;
                                 const currentH = hole.zPeak! - battenZ;
                                 currentWidth = hole.width! * (currentH / totalH);
                             } else {
                                 currentWidth = hole.width!;
                             }
                         }

                         const holeLeft = hole.x - currentWidth/2;
                         const holeRight = hole.x + currentWidth/2;
                         const newSegments: {start: number, end: number}[] = [];
                         segments.forEach(seg => {
                              if (seg.end < holeLeft || seg.start > holeRight) {
                                  newSegments.push(seg);
                                  return;
                              }
                              if (seg.start < holeLeft) newSegments.push({start: seg.start, end: holeLeft});
                              if (seg.end > holeRight) newSegments.push({start: holeRight, end: seg.end});
                         });
                         segments = newSegments;
                    }
                });

                segments.forEach(seg => {
                    const segWidth = seg.end - seg.start;
                    if (segWidth > 0.05) {
                        const xCenter = seg.start + segWidth/2;
                        dummy.position.set(xCenter, 0, battenZ);
                        dummy.rotation.set(0,0,0);
                        dummy.scale.set(segWidth, 1, 1);
                        dummy.updateMatrix();
                        battenRef.current!.setMatrixAt(bIdx++, dummy.matrix);
                    }
                });
            }

            if(!visibility.slates) continue;

            const kickAngle = 0.05;
            const isOdd = row % 2 !== 0;
            let currentX = -width / 2;
            let remainingWidth = width;

            const addSlate = (x: number, scaleX: number = 1, isHalf: boolean = false) => {
                if (!isColliding(x, zPos)) {
                    dummy.position.set(x, 0.028, zPos);
                    dummy.rotation.set(kickAngle + Math.random()*0.005, (Math.random()-0.5)*0.01, 0);
                    dummy.scale.set(scaleX, 1, 1);
                    dummy.updateMatrix();
                    if (isHalf && halfRef.current && hIdx < halfRef.current.count) {
                        halfRef.current.setMatrixAt(hIdx++, dummy.matrix);
                    } else if (!isHalf && sIdx < standardRef.current!.count) {
                        standardRef.current!.setMatrixAt(sIdx++, dummy.matrix);
                    }
                }
            };

            const w = slateWidthM + jointGap;
            currentX = -width / 2;
            let startWithHalf = isOdd;

            if (startWithHalf) {
                addSlate(currentX + (w * 1.5) / 2, 1, true);
                currentX += w * 1.5;
            }

            while (currentX < width / 2) {
                let remaining = width / 2 - currentX;
                if (remaining >= w) {
                    addSlate(currentX + w / 2, 1, false);
                    currentX += w;
                } else {
                    if (remaining > w * 0.75) {
                        addSlate(currentX + w / 2, 1, false);
                    } else if (remaining > 0.05) {
                        addSlate(currentX + (w * 1.5) / 2, 1, true);
                    }
                    break;
                }
            }
        }
        
        standardRef.current.count = sIdx; // Update actual count
        if (halfRef.current) halfRef.current.count = hIdx;
        standardRef.current.instanceMatrix.needsUpdate = true;
        if (halfRef.current) halfRef.current.instanceMatrix.needsUpdate = true;
        battenRef.current.instanceMatrix.needsUpdate = true;

        const computeBoundingSphere = (mesh: THREE.InstancedMesh, count: number) => {
            if (count === 0) return;
            const sphere = new THREE.Sphere();
            const box = new THREE.Box3();
            const tempMat = new THREE.Matrix4();
            const tempPos = new THREE.Vector3();
            for(let i=0; i<count; i++) {
                mesh.getMatrixAt(i, tempMat);
                tempPos.setFromMatrixPosition(tempMat);
                box.expandByPoint(tempPos);
            }
            box.min.subScalar(2.0);
            box.max.addScalar(2.0);
            box.getBoundingSphere(sphere);
            sphere.radius *= 1.5;
            mesh.boundingSphere = sphere;
        };

        if (visibility.slates) {
            computeBoundingSphere(standardRef.current, standardRef.current.count);
            if (halfRef.current) computeBoundingSphere(halfRef.current, halfRef.current.count);
        }
        if (visibility.battens) computeBoundingSphere(battenRef.current, battenRef.current.count);
        if (visibility.rafters) computeBoundingSphere(rafterRef.current, rafterRef.current.count);
        
    }, [width, length, selectedSlate, visibility, holes, metrics]);
    
    const onMove = (e: any, type: 'std' | 'half') => {
        if (activePlanes && activePlanes.length > 0) {
            for (let i = 0; i < activePlanes.length; i++) {
                if (activePlanes[i].distanceToPoint(e.point) < -0.01) return;
            }
        }
        e.stopPropagation(); 
        handleHover(e, `${project.selectedSlate.name}${type === 'half' ? ' (Half)' : ''}`);
        if (e.instanceId !== undefined) {
            const m = new THREE.Matrix4();
            e.object.getMatrixAt(e.instanceId, m);
            setHighlightMatrix(m);
            setHighlightGeo(type === 'half' ? halfSlateGeo : slateGeo);
        }
    };
    
    const onWoodMove = (e: any, type: 'Batten' | 'Rafter') => {
        if (activePlanes && activePlanes.length > 0) {
            for (let i = 0; i < activePlanes.length; i++) {
                if (activePlanes[i].distanceToPoint(e.point) < -0.01) return;
            }
        }
        e.stopPropagation();
        let label: string = type;
        if (e.instanceId !== undefined) {
             const m = new THREE.Matrix4();
             e.object.getMatrixAt(e.instanceId, m);
             const scale = new THREE.Vector3();
             scale.setFromMatrixScale(m);
             if (type === 'Batten') label = `Batten (${scale.x.toFixed(2)}m)`;
             else label = `Rafter (${scale.z.toFixed(2)}m)`;
        }
        handleHover(e, label);
    };

    return (
        <group>
            <UnderlayMesh width={width} length={length} holes={holes} handleHover={handleHover} handleOut={handleOut} clippingPlanes={activePlanes} />
            
            {visibility.rafters && (
                <StructuralTrimmers holes={holes} length={length} handleHover={handleHover} handleOut={handleOut} clippingPlanes={activePlanes} />
            )}

            <instancedMesh ref={rafterRef} args={[rafterGeo, woodMaterial, 200]} geometry={rafterGeo} material={woodMaterial} frustumCulled={false} onPointerMove={(e) => onWoodMove(e, 'Rafter')} onPointerOut={handleOut} castShadow receiveShadow />
            <instancedMesh ref={battenRef} args={[battenGeo, battenMaterial, 2000]} geometry={battenGeo} material={battenMaterial} frustumCulled={false} onPointerMove={(e) => onWoodMove(e, 'Batten')} onPointerOut={handleOut} castShadow receiveShadow />
            <instancedMesh ref={standardRef} args={[slateGeo, slateMaterial, 3000]} geometry={slateGeo} material={slateMaterial} onPointerMove={(e) => onMove(e, 'std')} onPointerOut={() => { handleOut(); setHighlightMatrix(null); }} frustumCulled={false} castShadow receiveShadow />
            <instancedMesh ref={halfRef} args={[halfSlateGeo, slateMaterial, 1000]} geometry={halfSlateGeo} material={slateMaterial} onPointerMove={(e) => onMove(e, 'half')} onPointerOut={() => { handleOut(); setHighlightMatrix(null); }} frustumCulled={false} castShadow receiveShadow />
            {highlightMatrix && highlightGeo && (
                <mesh geometry={highlightGeo} matrix={highlightMatrix} matrixAutoUpdate={false}>
                    <meshBasicMaterial color="red" wireframe opacity={0.8} transparent depthTest={false} side={THREE.DoubleSide} clippingPlanes={activePlanes} />
                </mesh>
            )}
        </group>
    );
};
