
import React, { useState } from 'react';
import { getGeocodingAddress } from '../../utils/leadPrinting';

// SECURITY WARNING: Hardcoded API key.
// This matches the key used in other map components for simplicity.
const API_KEY = "AIzaSyBD2ZWbkHzrCUGTHwHwqK9v2dNj6XGINTE";

interface StaticMapProps {
    lat?: number;
    lng?: number;
    address?: string;
}

export const StaticMap: React.FC<StaticMapProps> = ({ lat, lng, address }) => {
    
    const constructMapUrl = (latitude: number, longitude: number, mapType: 'hybrid' | 'roadmap', zoom: number) => {
        const baseUrl = "https://maps.googleapis.com/maps/api/staticmap";
        const params = new URLSearchParams();
        params.append("center", `${latitude},${longitude}`);
        params.append("zoom", zoom.toString());
        params.append("size", "600x300");
        params.append("maptype", mapType);
        params.append("markers", `color:red|${latitude},${longitude}`);
        params.append("key", API_KEY);
        return `${baseUrl}?${params.toString()}`;
    };

    let initialMapUrl = '';
    let fallbackMapUrl = '';
    let linkUrl = '';

    // LOGIC: ADDRESS PRIORITY
    // Use the address if available as it is often more accurate than AI-inferred coords.
    // Coordinates are only used if no valid address string is present.
    if (address && address.length > 5) {
        // USE CLEANER: Use consistent addressing logic
        const cleanAddress = getGeocodingAddress(address);
        const encodedAddress = encodeURIComponent(cleanAddress);
        
        // For address fallback, keep simple params
        const params = new URLSearchParams();
        params.append("center", cleanAddress);
        params.append("zoom", "18");
        params.append("size", "600x300");
        params.append("maptype", "roadmap");
        params.append("markers", `color:red|${cleanAddress}`);
        params.append("key", API_KEY);
        
        // Primary is hybrid
        const hybridParams = new URLSearchParams(params);
        hybridParams.set("maptype", "hybrid");
        
        initialMapUrl = `https://maps.googleapis.com/maps/api/staticmap?${hybridParams.toString()}`;
        fallbackMapUrl = `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
        linkUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
    } else if (lat && lng) {
        // Fallback to coordinates only if no address provided
        initialMapUrl = constructMapUrl(lat, lng, 'hybrid', 17);
        fallbackMapUrl = constructMapUrl(lat, lng, 'roadmap', 15);
        linkUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    } else {
        return (
            <div className="w-full h-48 bg-gray-200 flex items-center justify-center border border-gray-300 rounded-lg text-gray-500">
                Map Unavailable
            </div>
        );
    }
    
    return (
        <div className="w-full border border-gray-300 rounded-lg overflow-hidden break-inside-avoid">
            <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="block cursor-pointer">
                <img 
                    src={initialMapUrl} 
                    alt={address ? `Map of ${address}` : `Map location: ${lat}, ${lng}`} 
                    className="w-full h-auto block"
                    onError={(e) => {
                        if (fallbackMapUrl) {
                            (e.target as HTMLImageElement).onerror = null; // Prevent infinite loop
                            (e.target as HTMLImageElement).src = fallbackMapUrl;
                        } else {
                            (e.target as HTMLImageElement).src = 'https://placehold.co/600x300/E0E0E0/333333?text=Map+Load+Error';
                        }
                    }}
                />
            </a>
        </div>
    );
};
