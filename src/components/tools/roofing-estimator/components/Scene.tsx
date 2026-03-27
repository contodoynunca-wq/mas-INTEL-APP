import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky, Environment } from '@react-three/drei';
import { RoofMesh } from './RoofMesh';
import { ProjectState } from '../types';

interface SceneProps {
  project: ProjectState;
  setTooltip: (t: {text: string, x: number, y: number} | null) => void;
  isPrinting: boolean;
}

export const Scene: React.FC<SceneProps> = ({ project, setTooltip, isPrinting }) => {
  return (
    <Canvas 
        shadows={isPrinting}
        camera={{ position: [5, 5, 8], fov: 45 }} 
        gl={{ preserveDrawingBuffer: true, localClippingEnabled: true }}
    >
      <color attach="background" args={[isPrinting ? '#ffffff' : '#eef2f6']} />
      
      {!isPrinting && <Sky sunPosition={[100, 50, 100]} turbidity={0.5} rayleigh={0.5} />}
      <Environment preset="city" />

      <ambientLight intensity={0.6} />
      <directionalLight 
        position={[10, 20, 10]} 
        intensity={1.5} 
        castShadow={isPrinting}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0001}
      >
        <orthographicCamera attach="shadow-camera" args={[-20, 20, 20, -20]} />
      </directionalLight>
      
      <group position={[0, -1, 0]}>
        <RoofMesh project={project} setTooltip={setTooltip} />
      </group>

      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.01, 0]} receiveShadow={isPrinting}>
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial color="#e0e0e0" opacity={0.5} transparent />
      </mesh>

      <OrbitControls />
    </Canvas>
  );
};
