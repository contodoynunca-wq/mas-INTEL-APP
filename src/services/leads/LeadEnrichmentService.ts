
import * as admin from 'firebase-admin';
import { WebScraperService } from '../http/WebScraperService';
import { FirebaseStorageService } from '../storage/FirebaseStorageService';

// Interfaces for the data structures
interface PlanningDocument {
  url: string;
  type: string;
  description?: string;
  storageUrl?: string; // The new stable URL
}

interface AiEnrichmentResult {
  summary: string;
  images: { url: string; description: string }[];
  // ... other fields
}

export class LeadEnrichmentService {
  private scraper: WebScraperService;
  private storage: FirebaseStorageService;
  private db: admin.firestore.Firestore;

  constructor() {
    this.scraper = new WebScraperService();
    this.storage = new FirebaseStorageService();
    this.db = admin.firestore();
  }

  /**
   * Coordinator method:
   * 1. Accepts AI results
   * 2. Stabilizes images (Download -> Upload)
   * 3. Updates Database
   */
  async processLeadEnrichment(leadId: string, aiResult: AiEnrichmentResult): Promise<void> {
    console.log(`[LeadEnrichment] Processing lead: ${leadId}`);

    // 1. Stabilize Images
    const stableDocuments: PlanningDocument[] = [];

    // Process images in parallel
    const imagePromises = aiResult.images.map(async (img, index) => {
      if (!img.url) return null;

      // A. Attempt Download
      const downloaded = await this.scraper.downloadImage(img.url);

      if (!downloaded) {
        // Fallback: Keep original URL if download fails, but mark as unstable
        return {
          url: img.url,
          type: 'External Link (Unstable)',
          description: img.description
        };
      }

      // B. Attempt Upload
      try {
        const timestamp = Date.now();
        const filename = `${timestamp}_${index}.${downloaded.extension}`;
        const storagePath = `plans/${leadId}/${filename}`;

        const stableUrl = await this.storage.uploadFile(
          downloaded.buffer,
          storagePath,
          downloaded.mimeType
        );

        return {
          url: img.url, // Keep source reference
          storageUrl: stableUrl, // Use this in UI
          type: 'Plan Snapshot (Stabilized)',
          description: img.description
        };
      } catch (err) {
        console.error(`[LeadEnrichment] Stabilization failed for image ${index}`, err);
        // Fallback on upload error
        return {
          url: img.url,
          type: 'External Link (Upload Failed)',
          description: img.description
        };
      }
    });

    const results = await Promise.all(imagePromises);
    
    // Filter out any nulls (though our logic above handles most cases)
    results.forEach(res => {
      if (res) stableDocuments.push(res);
    });

    // 2. Save to Firestore
    // We merge the new stable documents with the AI summary
    const updatePayload = {
      ...aiResult,
      planningDocuments: stableDocuments,
      lastEnrichedAt: admin.firestore.FieldValue.serverTimestamp(),
      isFullyEnriched: true
    };

    await this.db.collection('leads').doc(leadId).update(updatePayload);
    
    console.log(`[LeadEnrichment] Successfully enriched ${leadId} with ${stableDocuments.length} documents.`);
  }
}
