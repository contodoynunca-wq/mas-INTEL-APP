import { Buffer } from 'buffer';
import * as admin from 'firebase-admin';

export class FirebaseStorageService {
  private bucket: any; // Type as admin.storage.Bucket if types available

  constructor() {
    this.bucket = admin.storage().bucket();
  }

  /**
   * Uploads a buffer to Firebase Storage and returns a persistent URL.
   * 
   * @param buffer The image data
   * @param destinationPath Path in bucket (e.g., plans/123/image.jpg)
   * @param mimeType Content type
   */
  async uploadFile(buffer: Buffer, destinationPath: string, mimeType: string): Promise<string> {
    const file = this.bucket.file(destinationPath);

    try {
      await file.save(buffer, {
        metadata: { contentType: mimeType },
        public: true, // Making it public for simple frontend access
      });

      // Return the public URL. 
      // Alternatively, generate a signed URL if privacy is required.
      return file.publicUrl();
    } catch (error) {
      console.error(`[StorageService] Upload failed for ${destinationPath}:`, error);
      throw new Error('Storage upload failed');
    }
  }
}