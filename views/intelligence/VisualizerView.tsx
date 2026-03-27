
import React, { FC, useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/store';
import InteractiveMap from '../../components/common/InteractiveMap';
import { reimagineStreetView } from '../../services/ai/imageGenerationService';
import { printContent } from '../../utils/print';
import { fileToBase64 } from '../../utils/fileProcessing';

// Hardcoded API key matching other components
const API_KEY = "AIzaSyBD2ZWbkHzrCUGTHwHwqK9v2dNj6XGINTE";

const VisualizerView: FC = () => {
    const { processAiJob, showModal } = useAppStore();
    
    // Search State
    const [address, setAddress] = useState('');
    const [isLocating, setIsLocating] = useState(false);
    
    // Map State (Target)
    const [initialCoords, setInitialCoords] = useState<{lat: number, lng: number} | null>(null);
    const [currentView, setCurrentView] = useState<{lat: number, lng: number, zoom: number} | null>(null);
    
    // Generation State
    const [prompt, setPrompt] = useState('Modernize this building with a Natural Spanish Slate roof (Dark Grey). Make it look like a high-end architectural render.');
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [capturedSourceImage, setCapturedSourceImage] = useState<string | null>(null); // For display/print
    
    // Manual Upload Fallback
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Enable Paste Support
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    if (blob) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            if (event.target?.result) {
                                setCapturedSourceImage(event.target.result as string);
                                setGeneratedImage(null); // Reset previous result
                                if (!initialCoords) setInitialCoords({ lat: 0, lng: 0 }); // Ensure UI shows image mode
                                setCurrentView(null);
                            }
                        };
                        reader.readAsDataURL(blob);
                    }
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [initialCoords]);

    const handleLocate = async (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation(); // Stop map from catching the enter key
        if (!address.trim()) return;
        setIsLocating(true);
        setInitialCoords(null);
        setGeneratedImage(null);
        setCapturedSourceImage(null);

        try {
            const geoResponse = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${API_KEY}`);
            const geoData = await geoResponse.json();
            
            if (geoData.status === 'OK' && geoData.results[0]) {
                const { lat, lng } = geoData.results[0].geometry.location;
                setInitialCoords({ lat, lng });
                // Default view state
                setCurrentView({ lat, lng, zoom: 19 }); 
            } else {
                await showModal({ type: 'alert', title: 'Location Not Found', message: 'Could not find coordinates for that address.' });
            }
        } catch (err) {
            console.error(err);
            await showModal({ type: 'alert', title: 'Error', message: 'Failed to locate address.' });
        } finally {
            setIsLocating(false);
        }
    };

    const handleMapStateChange = (lat: number, lng: number, zoom: number) => {
        setCurrentView({ lat, lng, zoom });
    };

    const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        try {
            const base64 = await fileToBase64(file);
            const dataUrl = `data:${file.type};base64,${base64}`;
            setCapturedSourceImage(dataUrl);
            setInitialCoords({ lat: 0, lng: 0 }); // Mock coords to show UI
            setCurrentView(null); // Clear map view if manual upload used
        } catch (err) {
            await showModal({ type: 'alert', title: 'Upload Failed', message: 'Could not read file.' });
        }
    };

    const handleGenerate = async () => {
        // If we have a manually uploaded image, use it directly.
        // Otherwise, try to capture from map.
        if (!currentView && !capturedSourceImage) {
             await showModal({ type: 'alert', title: 'No Image Source', message: 'Please locate an address, upload an image, or paste (Ctrl+V) a screenshot.' });
             return;
        }
        
        setIsGenerating(true);

        try {
            let base64data = capturedSourceImage;

            // 1. If no manual image, capture the Satellite View from Map
            if (!base64data && currentView) {
                // Ensure integer zoom and fixed precision to prevent API rejection
                const cleanLat = currentView.lat.toFixed(6);
                const cleanLng = currentView.lng.toFixed(6);
                const cleanZoom = Math.floor(currentView.zoom);

                // We use the Static Maps API to get a clean JPEG of exactly what the user is looking at
                const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${cleanLat},${cleanLng}&zoom=${cleanZoom}&size=640x640&maptype=satellite&key=${API_KEY}`;
                
                // 2. Fetch via Proxy (to handle CORS and convert to Blob)
                // Note: We force a unique param to avoid caching issues
                const proxyUrl = `/api-proxy/fetch-resource?url=${encodeURIComponent(staticMapUrl)}&t=${Date.now()}`;
                const response = await fetch(proxyUrl);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Automatic Capture Failed (${response.status}). Please take a screenshot and Paste (Ctrl+V) it here instead.`);
                }
                
                const blob = await response.blob();
                // Convert blob to base64
                base64data = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
                
                setCapturedSourceImage(base64data); // Save for display
            }

            if (!base64data) throw new Error("No source image available.");

            // 3. Send to AI (Reimagine)
            const aerialPrompt = `
            INPUT IMAGE: This is a satellite/aerial view of a property.
            TASK: Create a 3D Architectural Render based on this footprint.
            PERSPECTIVE: Keep the bird's-eye or isometric angle.
            INSTRUCTION: ${prompt}
            `;

            const result = await processAiJob(async () => {
                return await reimagineStreetView(base64data!, aerialPrompt);
            }, 'Generating 3D Concept from Aerial View');

            if (result) {
                setGeneratedImage(`data:${result.mimeType};base64,${result.base64Image}`);
            }

        } catch (err: any) {
            console.error(err);
            const confirmed = await showModal({ 
                type: 'confirm', 
                title: 'Capture Issue', 
                message: `${err.message}\n\nWould you like to upload a file instead?` 
            });
            if (confirmed) {
                fileInputRef.current?.click();
            }
        } finally {
            setIsGenerating(false);
        }
    };

    const handlePrint = () => {
        if (!generatedImage || !capturedSourceImage) return;
        
        const content = `
            <div style="padding: 20px; font-family: sans-serif;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <img src="https://i.imgur.com/0Yw1FxJ.png" alt="Mont Azul Logo" style="height: 60px;" />
                    <h1 style="color: #2980B9; margin-top: 10px;">Renovation Concept</h1>
                    <p style="color: #666;">${address || 'Custom Upload'}</p>
                </div>

                <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                    <div style="flex: 1;">
                        <h3 style="border-bottom: 2px solid #eee; padding-bottom: 5px;">Original Context</h3>
                        <img src="${capturedSourceImage}" style="width: 100%; border-radius: 8px; border: 1px solid #ccc;" />
                    </div>
                    <div style="flex: 1;">
                        <h3 style="border-bottom: 2px solid #eee; padding-bottom: 5px; color: #2980B9;">AI Proposed Concept</h3>
                        <img src="${generatedImage}" style="width: 100%; border-radius: 8px; border: 1px solid #2980B9;" />
                    </div>
                </div>

                <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin-top: 20px;">
                    <strong>Design Brief:</strong> ${prompt}
                </div>

                <div style="text-align: center; font-size: 0.8em; color: #888; margin-top: 50px;">
                    Generated by Mont Azul Sales Intelligence Hub. This is an AI-generated concept for visualization only.
                </div>
            </div>
        `;
        
        printContent(content, "3D Concept Render", "A4", true);
    };

    const presets = [
        "Replace existing roof with Premium Natural Spanish Slate.",
        "Convert to modern white render with Slate Roof.",
        "Show as a completed renovation with landscaped garden.",
        "Add solar panels integrated into the slate roof."
    ];

    return (
        <div className="h-full flex flex-col p-4 overflow-hidden">
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleManualUpload} accept="image/*" />
            
            <div className="flex-shrink-0 mb-4">
                <div className="flex justify-between items-center">
                    <h2 className="m-0 p-0 border-none">3D Satellite Visualizer</h2>
                    <div className="flex gap-2">
                        <div className="text-xs text-text-secondary flex items-center mr-2">
                            💡 Pro Tip: Paste (Ctrl+V) any image here!
                        </div>
                        <button className="btn tertiary sm" onClick={() => fileInputRef.current?.click()}>📤 Upload Image</button>
                        {generatedImage && <button onClick={handlePrint} className="btn tertiary sm">🖨️ Print PDF</button>}
                    </div>
                </div>
                <p className="text-sm text-secondary mt-1">
                    1. Search Address OR Paste Screenshot. 2. Adjust View. 3. Click Generate.
                </p>
            </div>

            <div className="flex-grow grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6 min-h-0">
                
                {/* Main Viewport - Map or Result Split */}
                <div className="bg-black/5 rounded-lg border border-border-color overflow-hidden relative flex flex-col shadow-inner">
                    {/* Search Overlay - Fixed interactions */}
                    <form 
                        onSubmit={handleLocate} 
                        className="absolute top-4 left-4 z-50 bg-surface/95 backdrop-blur p-2 rounded shadow-lg border border-border-color flex gap-2 w-96 max-w-[80%]"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => e.stopPropagation()}
                    >
                        <input 
                            type="text" 
                            value={address} 
                            onChange={e => setAddress(e.target.value)} 
                            placeholder="Enter address (e.g. 123 High St)..." 
                            className="flex-grow bg-transparent border-none focus:ring-0 text-sm text-text-primary"
                            disabled={isLocating}
                        />
                        <button type="submit" className="text-primary font-bold text-sm px-2" disabled={isLocating}>
                            {isLocating ? '...' : 'GO'}
                        </button>
                    </form>

                    {/* Map Area */}
                    <div className={`flex-grow relative transition-all duration-500 ${generatedImage ? 'h-1/2' : 'h-full'}`}>
                        {initialCoords ? (
                            <InteractiveMap 
                                lat={initialCoords.lat} 
                                lng={initialCoords.lng} 
                                zoom={19} 
                                onMapStateChange={handleMapStateChange}
                            />
                        ) : capturedSourceImage ? (
                            <div className="w-full h-full bg-black flex items-center justify-center relative">
                                <img src={capturedSourceImage} className="max-h-full max-w-full object-contain" alt="Manual Source" />
                                <button 
                                    onClick={() => setCapturedSourceImage(null)} 
                                    className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-500"
                                    title="Clear Image"
                                >
                                    ×
                                </button>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-text-secondary p-8 text-center">
                                <svg className="w-16 h-16 mb-4 opacity-20" fill="currentColor" viewBox="0 0 24 24"><path d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <p className="font-bold text-lg">No Image Source</p>
                                <p className="text-sm mt-2">Enter an address above to load the satellite map.</p>
                                <p className="text-sm mt-1">OR</p>
                                <p className="text-sm mt-1 font-mono bg-bg-secondary px-2 py-1 rounded border border-border-color">Paste (Ctrl+V) a screenshot here</p>
                            </div>
                        )}
                    </div>

                    {/* Generated Result Area (Slides up) */}
                    {generatedImage && (
                        <div className="flex-grow bg-surface border-t border-primary relative">
                            <div className="absolute top-2 left-2 bg-primary text-bg-secondary text-xs px-2 py-1 rounded z-10">AI Generated Concept</div>
                            <img src={generatedImage} className="w-full h-full object-cover" alt="Generated Concept" />
                        </div>
                    )}
                </div>

                {/* Sidebar Controls */}
                <div className="bg-surface border border-border-color rounded-lg p-4 flex flex-col overflow-y-auto shadow-sm">
                    <h3 className="text-lg font-bold mb-4">Design Controls</h3>
                    
                    <div className="mb-6">
                        <label className="block text-xs font-bold text-text-secondary uppercase mb-2">Instructions</label>
                        <textarea 
                            value={prompt} 
                            onChange={e => setPrompt(e.target.value)}
                            className="w-full p-3 border border-border-color rounded text-sm h-32 focus:ring-2 focus:ring-primary outline-none bg-bg-secondary"
                            placeholder="Describe the renovation..."
                        />
                    </div>

                    <div className="mb-6">
                        <label className="block text-xs font-bold text-text-secondary uppercase mb-2">Quick Presets</label>
                        <div className="space-y-2">
                            {presets.map((p, i) => (
                                <button 
                                    key={i} 
                                    onClick={() => setPrompt(p)}
                                    className="w-full text-left text-xs p-2 rounded bg-bg-secondary hover:bg-bg-primary border border-border-color transition-colors"
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-auto">
                        {(!initialCoords && !capturedSourceImage) ? (
                            <button className="btn w-full disabled opacity-50 cursor-not-allowed">Locate or Paste Image First</button>
                        ) : (
                            <button 
                                onClick={handleGenerate} 
                                className="btn green w-full py-3 text-base shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5"
                                disabled={isGenerating}
                            >
                                {isGenerating ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <span className="loader !w-4 !h-4 border-white"></span> Generating...
                                    </span>
                                ) : '✨ Generate Concept'}
                            </button>
                        )}
                        <p className="text-[10px] text-center text-text-secondary mt-3">
                            AI analyzes the visible map area (Satellite) to create the 3D render. Position the map carefully!
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VisualizerView;
