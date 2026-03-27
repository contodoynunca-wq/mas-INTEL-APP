
import React, { FC, useState, useEffect, useRef } from 'react';
import type { SearchJob, Lead, ModalState, LeadMarket } from '../../types';
import * as XLSX from 'xlsx';
import { getGeocodingAddress } from '../../utils/leadPrinting';

interface LeadMapModalProps {
    job: SearchJob | null;
    onClose: () => void;
    showModal: (c: Omit<ModalState, 'onResolve'>) => Promise<any>;
}

interface MarkerData {
    lat: number;
    lng: number;
    lead: Lead;
}

// SECURITY WARNING: Hardcoded API key.
const API_KEY = "AIzaSyBD2ZWbkHzrCUGTHwHwqK9v2dNj6XGINTE";

// Helper to robustly check for Google Maps loading with retry
const waitForGoogleMaps = (timeout = 10000): Promise<void> => {
    return new Promise((resolve, reject) => {
        if ((window as any).google && (window as any).google.maps) {
            return resolve();
        }
        let count = 0;
        const checkIntervalMs = 200;
        const maxChecks = timeout / checkIntervalMs;
        
        const interval = setInterval(() => {
            if ((window as any).google && (window as any).google.maps) {
                clearInterval(interval);
                resolve();
            }
            if (count > maxChecks) {
                clearInterval(interval);
                reject(new Error("Maps script timeout"));
            }
            count++;
        }, checkIntervalMs);
    });
};

const LeadMapModal: FC<LeadMapModalProps> = ({ job, onClose, showModal }) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const [markers, setMarkers] = useState<MarkerData[]>([]);
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
        if (!job || !API_KEY) return;

        const processLeads = async () => {
            setIsLoading(true);
            setSelectedLead(null);
            setError(null);
            
            try {
                await waitForGoogleMaps();
            } catch (e) {
                console.error("Maps load error:", e);
                setError("Google Maps script failed to load. Check your connection or try reloading.");
                setIsLoading(false);
                return;
            }

            const leadsToProcess = job.leads.filter(l => !l.isDismissed);
            if (leadsToProcess.length === 0) {
                setError("No visible leads in this group to map.");
                setIsLoading(false);
                return;
            }
            
            const marketToCountryCode: Record<LeadMarket, string> = { 'UK': 'GB', 'Spain': 'ES', 'France': 'FR', 'Germany': 'DE' };
            const countryCode = marketToCountryCode[job.market || 'UK'];

            // Limit concurrent geocoding requests to avoid overwhelming browser/API
            const markerPromises = leadsToProcess.map(async (lead) => {
                // FORCE GEOCODING: We ignore lead.geolocation to ensure map accuracy based on the real address string.
                // This fixes issues where AI-estimated coordinates might be off.

                let fullAddressForMap = lead.formattedAddress || lead.address;
                
                // Augment address with job location if generic
                if (fullAddressForMap && job.location && !fullAddressForMap.toLowerCase().includes(job.location.toLowerCase())) {
                    fullAddressForMap = `${fullAddressForMap}, ${job.location}`;
                }
                
                // CLEAN ADDRESS: Use the clean function to maintain consistency with Print Maps
                const cleanAddress = getGeocodingAddress(fullAddressForMap);
                
                if (!cleanAddress || cleanAddress.length < 3) {
                    return { status: 'INVALID_ADDRESS', error_message: 'Address too short', lead };
                }

                try {
                    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cleanAddress)}&key=${API_KEY}&components=country:${countryCode}`);
                    const data = await response.json();
                    if (data.status === 'OK' && data.results[0]) {
                        return { status: 'OK', data: { ...data.results[0].geometry.location, lead } };
                    } else {
                        return { status: data.status, error_message: data.error_message || `Could not geocode address: ${cleanAddress}`, lead };
                    }
                } catch (error) {
                    return { status: 'FETCH_ERROR', error_message: 'Network error during geocoding.', lead };
                }
            });

            const results = await Promise.all(markerPromises);
            
            const validMarkers = results
                .filter(r => r?.status === 'OK')
                .map(r => r.data as MarkerData);
            
            if (validMarkers.length === 0) {
                setError("Could not find coordinates for any leads based on their addresses.");
            }
            
            setMarkers(validMarkers);
            setIsLoading(false);
        };

        processLeads();
    }, [job, retryCount]);

    useEffect(() => {
        if (!mapRef.current || markers.length === 0 || !(window as any).google?.maps) return;
        
        const initMap = async () => {
            try {
                const { Map } = await (window as any).google.maps.importLibrary("maps");
                const { AdvancedMarkerElement, PinElement } = await (window as any).google.maps.importLibrary("marker");
                const { LatLngBounds } = await (window as any).google.maps.importLibrary("core");

                const bounds = new LatLngBounds();
                
                const map = new Map(mapRef.current as HTMLElement, {
                    center: { lat: 54.5, lng: -4.5 }, // UK Center
                    zoom: 6,
                    mapId: "DEMO_MAP_ID", // Required for AdvancedMarkerElement
                    disableDefaultUI: false,
                    mapTypeControl: true,
                    streetViewControl: false,
                    fullscreenControl: false,
                    tilt: 0, // Explicitly disable tilt
                });

                markers.forEach(({ lat, lng, lead }) => {
                    const pin = new PinElement({
                        background: lead.projectStage === 'On-Site' ? '#2ECC71' : '#2980B9',
                        borderColor: "#FFFFFF",
                        glyphColor: "#FFFFFF",
                        scale: 1,
                    });

                    const marker = new AdvancedMarkerElement({
                        position: { lat, lng },
                        map: map,
                        title: lead.title,
                        content: pin.element,
                    });
                    
                    marker.addListener('click', () => {
                        setSelectedLead(lead);
                    });
                    bounds.extend({ lat, lng });
                });

                if (markers.length > 1) {
                    map.fitBounds(bounds);
                } else if (markers.length === 1) {
                    map.setCenter(bounds.getCenter());
                    map.setZoom(14);
                }
            } catch (e) {
                 console.error("Error initializing map object:", e);
                 setError("Map initialization failed.");
            }
        };

        initMap();

    }, [markers]);


    if (!job) return null;

    const handleDirections = () => {
        if (markers.length === 0) return;
        if (markers.length === 1) {
            const { lat, lng } = markers[0];
            const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
            window.open(url, '_blank', 'noopener,noreferrer');
            return;
        }
        const waypoints = markers.slice(0, -1).map(m => `${m.lat},${m.lng}`).join('|');
        const destination = `${markers[markers.length - 1].lat},${markers[markers.length - 1].lng}`;
        const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&waypoints=${encodeURIComponent(waypoints)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const handleExportXLSX = async () => {
        if (!job || markers.length === 0) {
            showModal({ type: 'alert', title: 'No Data', message: 'There are no leads to export.' });
            return;
        }
        
        const leadsToExport = markers.map(marker => ({
            'Name': marker.lead.title,
            'Description': marker.lead.summary || `Stage: ${marker.lead.projectStage}`,
            'Address': marker.lead.address,
            'Latitude': marker.lat,
            'Longitude': marker.lng,
            'Stage': marker.lead.projectStage,
            'Score': marker.lead.slateFitScore
        }));

        const worksheet = XLSX.utils.json_to_sheet(leadsToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Map Data");
        XLSX.writeFile(workbook, `MontAzul_Map_Export_${job.location.replace(/ /g, '_')}.xlsx`);

        await showModal({
            type: 'alert',
            title: 'Export Successful!',
            message: 'File Saved! To visualize these points:\n\n1. Go to google.com/mymaps\n2. Click "Create a New Map"\n3. In the layer box, click "Import" and select this XLSX file.'
        });
    };
    
    const handleRetry = () => {
        setRetryCount(c => c + 1);
    };

    return (
        <div className="modal no-print">
            <div className="absolute top-0 left-0 w-full h-full bg-bg-primary flex" style={{zIndex: 10000}}>
                <div ref={mapRef} className="h-full flex-grow relative">
                    {(isLoading || error) && (
                        <div className="absolute inset-0 bg-bg-primary/80 flex items-center justify-center z-10">
                            {isLoading && <div className="loader !w-12 !h-12"></div>}
                            {error && !isLoading && (
                                <div className="text-center p-8 max-w-lg bg-surface rounded-lg shadow-xl border border-border-color">
                                    <h3 className="text-loss-color text-xl font-bold">Map Unavailable</h3>
                                    <p className="text-text-secondary mt-2 mb-4">{error}</p>
                                    <div className="flex justify-center gap-2">
                                         <button onClick={handleRetry} className="btn primary">Retry Loading</button>
                                         <button onClick={onClose} className="btn secondary">Close</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                
                <div 
                    className="h-full flex-shrink-0 bg-bg-secondary transition-all duration-300 ease-in-out overflow-y-auto"
                    style={{ width: selectedLead ? '450px' : '0px', borderLeft: selectedLead ? '2px solid var(--primary)' : 'none' }}
                >
                    {selectedLead && (
                        <div className="p-6">
                            <button onClick={() => setSelectedLead(null)} className="absolute top-4 right-4 text-2xl text-text-secondary hover:text-text-primary">×</button>
                            <h3 className="text-lg mb-2">{selectedLead?.title}</h3>
                            <div className="p-4 bg-surface rounded-lg space-y-2 text-sm border border-border-color">
                                <div><strong>Address:</strong> {selectedLead?.address}</div>
                                <div><strong>Stage:</strong> {selectedLead?.projectStage}</div>
                            </div>
                            <h4 className="font-semibold text-sm mt-4 mb-2">Contacts</h4>
                            <div className="space-y-2 text-xs">
                                {(selectedLead?.companies || []).map((c, i) => (
                                    <div key={i} className="bg-surface p-2 rounded border border-border-color">
                                        <p className="font-bold">{c.contactName} ({c.type})</p>
                                        <p>{c.company}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="absolute top-4 left-4 bg-bg-secondary p-2 rounded-lg flex items-center gap-2 shadow-lg border border-border-color">
                    <h2 className="text-lg m-0 px-2">Map View</h2>
                     <button onClick={handleDirections} className="btn" disabled={markers.length === 0}>Directions</button>
                     <button onClick={handleExportXLSX} className="btn" disabled={markers.length === 0}>Export (My Maps)</button>
                     <button onClick={onClose} className="btn secondary">Close</button>
                </div>
            </div>
        </div>
    );
};

export default LeadMapModal;
