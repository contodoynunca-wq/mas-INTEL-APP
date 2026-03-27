import { Buffer } from 'buffer';
import fetch from 'node-fetch'; // Or built-in fetch for Node 18+

export interface DownloadResult {
  buffer: Buffer;
  mimeType: string;
  extension: string;
}

export class WebScraperService {
  private readonly USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  /**
   * Downloads a file from a URL, mimicking a real browser to avoid 403s.
   * Returns null if the download fails or times out.
   */
  async downloadImage(url: string): Promise<DownloadResult | null> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': this.USER_AGENT,
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Referer': new URL(url).origin, // spoof referer to origin
        },
        timeout: 10000, // 10s timeout
      });

      if (!response.ok) {
        console.warn(`[WebScraper] Failed to download ${url}: ${response.status} ${response.statusText}`);
        return null;
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return {
        buffer,
        mimeType: contentType,
        extension: this.getExtensionFromMime(contentType)
      };
    } catch (error) {
      console.error(`[WebScraper] Network error for ${url}:`, error);
      return null; // return null to ensure the main flow doesn't crash
    }
  }

  private getExtensionFromMime(mime: string): string {
    switch (mime) {
      case 'image/png': return 'png';
      case 'image/webp': return 'webp';
      case 'image/gif': return 'gif';
      case 'application/pdf': return 'pdf';
      default: return 'jpg';
    }
  }
}