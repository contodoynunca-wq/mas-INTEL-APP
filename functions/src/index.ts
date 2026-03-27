import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import * as puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { CONFIG } from "./config";

// Initialize Firebase Admin
admin.initializeApp();

interface SnapshotRequest {
    url: string;
    leadId: string;
}

interface SnapshotResponse {
    success: boolean;
    storageUrl?: string;
    error?: string;
}

/**
 * Cloud Function: captureUrlSnapshot
 * 
 * Visits a URL using Headless Chrome, renders JavaScript, captures a screenshot,
 * and saves it directly to Firebase Storage.
 */
export const captureUrlSnapshot = onCall<SnapshotRequest, Promise<SnapshotResponse>>(
    {
        memory: CONFIG.memory,
        timeoutSeconds: CONFIG.timeoutSeconds,
        region: CONFIG.region,
    },
    async (request) => {
        const { url, leadId } = request.data;

        // 1. Input Validation
        if (!url) {
            throw new HttpsError("invalid-argument", "The function must be called with a 'url'.");
        }
        if (!leadId) {
            throw new HttpsError("invalid-argument", "The function must be called with a 'leadId'.");
        }

        let browser: puppeteer.Browser | null = null;

        try {
            logger.info(`Starting snapshot capture for: ${url}`);

            // 2. Launch Browser
            // We use @sparticuz/chromium which locates the binary automatically in the GCF environment
            browser = await puppeteer.launch({
                args: chromium.args,
                defaultViewport: chromium.defaultViewport,
                executablePath: await chromium.executablePath(),
                headless: chromium.headless,
                ignoreHTTPSErrors: true,
            });

            const page = await browser.newPage();

            // 3. Evasion Techniques (Anti-Bot)
            // Set a real user agent to prevent 403 Forbidden errors from Council firewalls
            await page.setUserAgent(CONFIG.userAgent);
            
            // Set a nice viewport for the screenshot
            await page.setViewport(CONFIG.viewport);

            // 4. Navigate
            // networkidle2 waits until there are no more than 2 network connections for at least 500ms
            // This ensures client-side JS rendering (React/Angular portals) has finished.
            await page.goto(url, { 
                waitUntil: "networkidle2", 
                timeout: 30000 // 30s page load timeout
            });

            // 5. Capture Screenshot
            // 'jpeg' is smaller than 'png' and sufficient for reference material.
            const buffer = await page.screenshot({
                type: "jpeg",
                quality: 80,
                encoding: "binary",
                fullPage: false // Set to true if you want the scrolling full page
            });

            logger.info("Screenshot captured successfully.");

            // 6. Upload to Firebase Storage
            const bucket = admin.storage().bucket();
            const timestamp = Date.now();
            const filename = `snap_${timestamp}.jpg`;
            const destination = `${CONFIG.storagePrefix}/${leadId}/${filename}`;
            const file = bucket.file(destination);

            await file.save(buffer, {
                metadata: {
                    contentType: "image/jpeg",
                    metadata: {
                        originalUrl: url,
                        leadId: leadId,
                        source: "Puppeteer Scraper"
                    }
                }
            });

            // 7. Make Public & Get URL
            // In a strict enterprise env, you might prefer signed URLs. 
            // For this app, making it public allows for easy embedding in <img> tags without token expiry logic.
            await file.makePublic();
            const publicUrl = file.publicUrl();

            logger.info(`Image saved to: ${destination}`);

            return {
                success: true,
                storageUrl: publicUrl
            };

        } catch (error) {
            logger.error("Snapshot failed", error);
            
            // Return a clean error object rather than throwing 500, 
            // allowing the frontend to handle "Snapshot Failed" gracefully.
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown Puppeteer error"
            };

        } finally {
            // 8. Cleanup
            // CRITICAL: Always close the browser to free up memory and prevent zombie processes
            if (browser) {
                await browser.close();
            }
        }
    }
);