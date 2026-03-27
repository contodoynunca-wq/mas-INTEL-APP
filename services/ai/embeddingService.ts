
import { GoogleGenAI } from "@google/genai";
import { generateContentWithRetry } from "../../utils/apiUtils";

/**
 * Generates multimodal embeddings using the gemini-embedding-2-preview model.
 * Supports text, images, and other parts.
 */
export const getMultimodalEmbedding = async (
    ai: GoogleGenAI,
    contents: (string | { inlineData: { data: string, mimeType: string } })[]
): Promise<number[]> => {
    try {
        const result = await ai.models.embedContent({
            model: 'gemini-embedding-2-preview',
            contents: contents.map(c => {
                if (typeof c === 'string') return c;
                return c;
            }),
        });

        if (result.embeddings && result.embeddings.length > 0) {
            // If multiple contents were provided, it might return an array of embeddings or a single one
            // For now, we assume we want the first one or a combined one if supported
            // The SDK usually returns { embeddings: [ { values: [...] } ] }
            return (result.embeddings[0] as any).values || [];
        }
        return [];
    } catch (error) {
        console.error("Embedding generation failed:", error);
        return [];
    }
};

/**
 * Calculates cosine similarity between two vectors.
 */
export const calculateCosineSimilarity = (vecA: number[], vecB: number[]): number => {
    if (vecA.length !== vecB.length || vecA.length === 0) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};
