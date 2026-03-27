import { MemoryOption } from "firebase-functions/v2/options";

export const CONFIG = {
    // Browser Automation requires significant RAM. 
    // 2GiB is the recommended minimum for stability with Puppeteer in Cloud Functions.
    memory: "2GiB" as MemoryOption,
    
    // Scraping can be slow. Allow 2 minutes before the function times out.
    timeoutSeconds: 120,
    
    // The region where your function and storage bucket reside
    region: "europe-west1",

    // Storage folder prefix
    storagePrefix: "planning_snapshots",

    // Browser Viewport settings for high-quality screenshots
    viewport: {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
    },

    // User Agent to spoof. This mimics a standard Desktop Chrome on Windows.
    // CRITICAL for bypassing basic 403 bot protection on Council Portals.
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};