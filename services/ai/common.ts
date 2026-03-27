import { GoogleGenAI } from "@google/genai";

// Shared AI instance for all services, initialized using the environment variable for security.
export const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// The default model is now managed globally in the Zustand store.
// Each service file will get the active model from `useAppStore.getState().activeModel`.