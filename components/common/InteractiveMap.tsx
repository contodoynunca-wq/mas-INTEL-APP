
import React, { FC, useEffect, useRef, useState } from 'react';

interface MarkerData {
    lat: number;
    lng: number;
    title?: string;
    color?: string;
    address?: string;
}

interface InteractiveMapProps {
    lat?: number;
    lng?: number;
    address?: string;
    zoom?: number;
    markers?: MarkerData[];
    onMapStateChange?: (lat: number, lng: number, zoom: number) => void;
}

const InteractiveMap: FC<InteractiveMapProps> = ({ lat, lng, address, zoom = 19, markers, onMapStateChange }) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const markerRefs = useRef<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const initMap = async () => {
            if (!mapRef.current) return;

            try {
                // 1. Load the libraries
                const { Map } = await (window as any).google.maps.importLibrary("maps");
                const { AdvancedMarkerElement, PinElement } = await (window as any).google.maps.importLibrary("marker");
                const { Geocoder } = await (window as any).google.maps.importLibrary("geocoding");

                // 2. Initialize Map (Default center, will update momentarily)
                if (!mapInstanceRef.current) {
                    mapInstanceRef.current = new Map(mapRef.current, {
                        center: { lat: 51.505, lng: -0.09 }, // Default London
                        zoom: zoom,
                        mapId: "DEMO_MAP_ID",
                        disableDefaultUI: false,
                        zoomControl: true,
                        mapTypeId: 'hybrid',
                        tilt: 0,
                        heading: 0
                    });
                }

                const map = mapInstanceRef.current;
                const geocoder = new Geocoder();

                // Clear existing markers
                markerRefs.current.forEach(m => m.map = null);
                markerRefs.current = [];

                if (markers && markers.length > 0) {
                    // Render multiple markers
                    const bounds = new (window as any).google.maps.LatLngBounds();
                    
                    // Process markers sequentially to avoid rate limits if geocoding is needed
                    const processMarkers = async () => {
                        for (const m of markers) {
                            let pos = { lat: m.lat, lng: m.lng };
                            
                            // If no valid coords but has address, try to geocode
                            if ((!m.lat || !m.lng) && m.address) {
                                try {
                                    const results = await new Promise<any>((resolve, reject) => {
                                        geocoder.geocode({ address: m.address }, (res: any, status: any) => {
                                            if (status === 'OK') resolve(res);
                                            else reject(status);
                                        });
                                    });
                                    if (results && results[0]) {
                                        pos = {
                                            lat: results[0].geometry.location.lat(),
                                            lng: results[0].geometry.location.lng()
                                        };
                                    }
                                    // Add a small delay to avoid OVER_QUERY_LIMIT
                                    await new Promise(r => setTimeout(r, 200));
                                } catch (e) {
                                    console.warn("Geocoding failed for marker:", m.title, e);
                                    // Add a small delay to avoid OVER_QUERY_LIMIT even on failure
                                    await new Promise(r => setTimeout(r, 200));
                                    continue; // Skip this marker
                                }
                            }
                            
                            // Skip if still no valid coords
                            if (!pos.lat || !pos.lng) continue;

                            bounds.extend(pos);
                            
                            let pinConfig = {};
                            if (m.color) {
                                const pin = new PinElement({
                                    background: m.color,
                                    borderColor: m.color,
                                    glyphColor: '#ffffff'
                                });
                                pinConfig = { content: pin.element };
                            }

                            const marker = new AdvancedMarkerElement({
                                position: pos,
                                map: map,
                                title: m.title,
                                ...pinConfig
                            });
                            markerRefs.current.push(marker);
                        }

                        if (markerRefs.current.length > 1) {
                            map.fitBounds(bounds);
                        } else if (markerRefs.current.length === 1) {
                            map.setCenter(markerRefs.current[0].position);
                            map.setZoom(zoom);
                        }
                        setError(null);
                    };
                    
                    processMarkers();
                } else {
                    // 3. LOGIC: ADDRESS IS KING (or if coords are bad)
                    const hasValidCoords = lat && lng && (lat !== 0 || lng !== 0);
                    
                    if (address && address.length > 5) {
                        geocoder.geocode({ address: address }, (results: any, status: any) => {
                            if (status === 'OK' && results[0]) {
                                const location = results[0].geometry.location;
                                map.setCenter(location);
                                map.setZoom(zoom); 

                                const marker = new AdvancedMarkerElement({
                                    position: location,
                                    map: map,
                                    title: address
                                });
                                markerRefs.current.push(marker);
                                setError(null);
                            } else {
                                console.warn("Geocoding failed via JS API:", status);
                                if (hasValidCoords) {
                                    const pos = { lat, lng };
                                    map.setCenter(pos);
                                    const marker = new AdvancedMarkerElement({ position: pos, map: map, title: "Coordinate Fallback" });
                                    markerRefs.current.push(marker);
                                } else {
                                    setError(`Could not locate: ${address}`);
                                }
                            }
                        });
                    } else if (hasValidCoords) {
                        const pos = { lat, lng };
                        map.setCenter(pos);
                        const marker = new AdvancedMarkerElement({ position: pos, map: map });
                        markerRefs.current.push(marker);
                    } else {
                        if (address) setError("No valid location data available.");
                    }
                }

                // State listener
                const reportState = () => {
                    if (onMapStateChange) {
                        const c = map.getCenter();
                        const z = map.getZoom();
                        if (c) onMapStateChange(c.lat(), c.lng(), z);
                    }
                };
                map.addListener('idle', reportState);

            } catch (e) {
                console.error("Error initializing map:", e);
                setError("Map error. Check API Key configuration.");
            }
        };

        initMap();
    }, [address, lat, lng, markers]); 

    if (error) {
        return <div className="w-full h-full min-h-[250px] bg-bg-secondary flex items-center justify-center text-loss-color border border-border-color rounded-lg font-bold p-4 text-center">{error}</div>;
    }

    return <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '250px', borderRadius: '8px' }} />;
};

export default InteractiveMap;
