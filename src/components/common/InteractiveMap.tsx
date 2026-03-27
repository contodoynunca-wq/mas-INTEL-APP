
import React, { FC, useEffect, useRef, useState } from 'react';

interface MapMarker {
    id?: string;
    lat: number;
    lng: number;
    title?: string;
    color?: string;
    icon?: string;
}

interface InteractiveMapProps {
    lat?: number;
    lng?: number;
    address?: string;
    zoom?: number;
    markers?: MapMarker[];
    onMapStateChange?: (lat: number, lng: number, zoom: number) => void;
    onMarkerClick?: (id: string) => void;
}

const InteractiveMap: FC<InteractiveMapProps> = ({ lat, lng, address, zoom = 12, markers = [], onMapStateChange, onMarkerClick }) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const initMap = async () => {
            if (!mapRef.current) return;

            try {
                // 1. Load the libraries
                const { Map } = await (window as any).google.maps.importLibrary("maps");
                const { AdvancedMarkerElement, PinElement } = await (window as any).google.maps.importLibrary("marker");
                const { Geocoder } = await (window as any).google.maps.importLibrary("geocoding");
                const { LatLngBounds } = await (window as any).google.maps.importLibrary("core");

                // 2. Initialize Map (Default center)
                if (!mapInstanceRef.current) {
                    mapInstanceRef.current = new Map(mapRef.current, {
                        center: { lat: 54.5, lng: -4 }, // UK Center
                        zoom: 6,
                        mapId: "DEMO_MAP_ID",
                        disableDefaultUI: false,
                        zoomControl: true,
                        mapTypeId: 'roadmap',
                    });
                }

                const map = mapInstanceRef.current;
                const geocoder = new Geocoder();

                // Clear existing markers
                markersRef.current.forEach(m => m.map = null);
                markersRef.current = [];

                // 3. Handle Multiple Markers
                if (markers.length > 0) {
                    const bounds = new LatLngBounds();
                    markers.forEach(marker => {
                        if (marker.lat && marker.lng) {
                            const pos = { lat: marker.lat, lng: marker.lng };
                            
                            const pinContainer = document.createElement('div');
                            pinContainer.style.display = 'flex';
                            pinContainer.style.flexDirection = 'column';
                            pinContainer.style.alignItems = 'center';
                            pinContainer.style.cursor = 'pointer';

                            const pin = new PinElement({
                                background: marker.color || '#DB4437',
                                borderColor: marker.color || '#DB4437',
                                glyphColor: '#ffffff',
                                glyph: marker.icon || undefined
                            });
                            pinContainer.appendChild(pin.element);

                            if (marker.title) {
                                const label = document.createElement('div');
                                label.textContent = marker.title.split('\n')[0]; // Just the branch name
                                label.style.backgroundColor = 'rgba(15, 23, 42, 0.9)'; // slate-900
                                label.style.color = 'white';
                                label.style.padding = '2px 6px';
                                label.style.borderRadius = '4px';
                                label.style.fontSize = '10px';
                                label.style.marginTop = '2px';
                                label.style.whiteSpace = 'nowrap';
                                label.style.border = '1px solid rgba(51, 65, 85, 0.8)'; // slate-700
                                label.style.pointerEvents = 'none'; // let clicks pass through
                                pinContainer.appendChild(label);
                            }

                            const newMarker = new AdvancedMarkerElement({
                                position: pos,
                                map: map,
                                title: marker.title,
                                content: pinContainer
                            });
                            
                            newMarker.addListener('gmp-click', () => {
                                if (onMarkerClick && marker.id) {
                                    onMarkerClick(marker.id);
                                }
                            });

                            markersRef.current.push(newMarker);
                            bounds.extend(pos);
                        }
                    });
                    
                    if (!address && (!lat || !lng)) {
                         map.fitBounds(bounds);
                    }
                }

                // 4. Handle Single Address/Location (Focus)
                if (address && address.length > 2) {
                    geocoder.geocode({ address: address }, (results: any, status: any) => {
                        if (status === 'OK' && results[0]) {
                            const location = results[0].geometry.location;
                            map.setCenter(location);
                            map.setZoom(14); 

                            const mainMarker = new AdvancedMarkerElement({
                                position: location,
                                map: map,
                                title: address,
                            });
                            markersRef.current.push(mainMarker);
                            setError(null);
                        } else {
                            console.warn("Geocoding failed:", status);
                            if (lat && lng) {
                                const pos = { lat, lng };
                                map.setCenter(pos);
                                map.setZoom(14);
                            }
                        }
                    });
                } else if (lat && lng) {
                    const pos = { lat, lng };
                    map.setCenter(pos);
                    map.setZoom(14);
                    const mainMarker = new AdvancedMarkerElement({
                        position: pos,
                        map: map,
                        title: "Selected Location"
                    });
                    markersRef.current.push(mainMarker);
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
                setError("Map error. Check API Key.");
            }
        };

        initMap();
    }, [address, lat, lng, markers]); 

    if (error) {
        return <div className="w-full h-full min-h-[250px] bg-slate-800 flex items-center justify-center text-red-400 border border-slate-700 rounded-lg p-4 text-center">{error}</div>;
    }

    return <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '300px', borderRadius: '8px' }} />;
};

export default InteractiveMap;
