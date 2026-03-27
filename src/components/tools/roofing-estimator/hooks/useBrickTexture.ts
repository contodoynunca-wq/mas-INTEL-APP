import { useMemo } from 'react';
import * as THREE from 'three';

export const useBrickTexture = () => {
    return useMemo(() => {
        if (typeof document === 'undefined') return null;
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // Fill background (Mortar)
        ctx.fillStyle = '#d1d5db'; // gray-300
        ctx.fillRect(0, 0, 512, 512);

        // Bricks
        const rows = 16;
        const cols = 8;
        const brickH = 512 / rows; // 32px
        const brickW = 512 / cols; // 64px
        const gap = 3;

        for (let i = 0; i < rows; i++) {
            const offset = (i % 2) * (brickW / 2);
            for (let j = -1; j < cols + 1; j++) {
                // Varied brick color (Red/Brown/Orange mix)
                const hue = 10 + Math.random() * 20; 
                const sat = 40 + Math.random() * 25;
                const light = 30 + Math.random() * 20;
                ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
                
                const x = j * brickW + offset + gap/2;
                const y = i * brickH + gap/2;
                const w = brickW - gap;
                const h = brickH - gap;
                
                ctx.fillRect(x, y, w, h);
                
                // Add some noise/texture
                ctx.fillStyle = 'rgba(0,0,0,0.1)';
                ctx.fillRect(x, y + h - 2, w, 2); // Shadow line
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        // Default repeat, scale instances locally
        texture.repeat.set(1, 1);
        return texture;
    }, []);
};
