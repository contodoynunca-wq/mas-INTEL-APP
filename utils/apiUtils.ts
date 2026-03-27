
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { useAppStore } from '@/store/store';

/**
 * A robust wrapper for the Gemini API's generateContent method that includes
 * a retry mechanism for rate-limiting, a timeout, and support for cancellation.
 * @param ai The GoogleGenAI instance.
 * @param params The parameters for the generateContent call, including an optional AbortSignal.
 * @param maxRetries The maximum number of times to retry the request.
 * @param initialDelay The initial delay in milliseconds before the first retry.
 * @param requestTimeout The maximum time in milliseconds to wait for a response.
 * @returns A promise that resolves with the GenerateContentResponse.
 */
export const generateContentWithRetry = async (
    ai: GoogleGenAI,
    params: Parameters<typeof ai.models.generateContent>[0] & { signal?: AbortSignal },
    maxRetries = 3,
    initialDelay = 1000, 
    requestTimeout = 600000 
): Promise<GenerateContentResponse> => {
    const store = useAppStore.getState();
    store.incrementApiCallCount();
    
    const { signal, ...restOfParams } = params;
    // Default to the requested model
    let currentModel = typeof restOfParams.model === 'string' ? restOfParams.model : 'gemini-3.1-pro-preview';
    
    if (signal?.aborted) {
        throw new DOMException('Aborted by user.', 'AbortError');
    }

    let lastError: any = new Error("AI request failed after all retries.");
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (signal?.aborted) {
            throw new DOMException('Aborted by user.', 'AbortError');
        }
        
        store.logEvent('AI', `API call initiated for model: ${currentModel} (Count: ${store.apiCallCount + 1})`);
        
        try {
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`AI request timed out after ${requestTimeout / 1000} seconds.`)), requestTimeout)
            );

            const result = await Promise.race([
                ai.models.generateContent({
                    ...restOfParams,
                    model: currentModel
                }),
                timeoutPromise
            ]) as GenerateContentResponse;
            
            let responseText = '';
            try {
                responseText = result.text || '';
            } catch (e) {
                // Ignore error if text getter fails (e.g. for image-only responses)
            }
            
            let hasImage = false;
            if (result.candidates?.[0]?.content?.parts) {
                const parts = result.candidates[0].content.parts;
                responseText = parts.map(p => p.text || '').join('');
                hasImage = parts.some(p => p.inlineData);
            }

            if (!responseText && !hasImage) {
                console.error(`AI returned an empty response for model ${currentModel}. Full result:`, JSON.stringify(result, null, 2));
                const finishReason = result.candidates?.[0]?.finishReason;
                if (finishReason === 'SAFETY') {
                    throw new Error(`AI response was blocked by safety filters for model ${currentModel}.`);
                }
                throw new Error(`AI returned an empty response for model ${currentModel}.`);
            }
            
            // Override the text getter if it was empty but we found text in parts
            let originalText = '';
            try { originalText = result.text || ''; } catch(e) {}
            
            if (!originalText && responseText) {
                Object.defineProperty(result, 'text', { get: () => responseText });
            }
            
            return result;

        } catch (e: any) {
            lastError = e;

            if (e.name === 'AbortError' || signal?.aborted) {
                console.warn("AI request was aborted by user.");
                throw e; 
            }
            
            const errorString = e instanceof Error ? e.message : JSON.stringify(e);
            const isForbidden = e.httpStatus === 403 || e.status === 403 || errorString.includes('403') || errorString.includes('Forbidden');
            const hasGoogleSearch = restOfParams.config?.tools?.some((t: any) => t.googleSearch);
            const isRateLimitError = e.toString().includes('RESOURCE_EXHAUSTED') || (e.httpStatus && e.httpStatus === 429) || errorString.includes('429') || errorString.includes('Quota');
            
            if (isForbidden) {
                if (hasGoogleSearch) {
                    console.warn("Google Search tool forbidden (403). Falling back to internal knowledge.");
                    store.logEvent('SYS', "Search tool forbidden. Falling back to internal knowledge.");
                    
                    if (restOfParams.config && restOfParams.config.tools) {
                        restOfParams.config = {
                            ...restOfParams.config,
                            tools: restOfParams.config.tools.filter((t: any) => !t.googleSearch)
                        };
                        if (restOfParams.config.tools.length === 0) {
                            delete restOfParams.config.tools;
                        }
                    }
                    continue;
                } else if (currentModel === 'gemini-3.1-pro-preview') {
                    console.warn("Model forbidden (403) for Pro. Falling back to Flash.");
                    store.logEvent('SYS', "Pro model forbidden. Falling back to Flash model.");
                    currentModel = 'gemini-3-flash-preview';
                    continue;
                } else {
                    throw new Error("API Key Forbidden (403). Your API key may have HTTP Referrer/IP restrictions, or lacks access to this model. Please check your Google Cloud Console API restrictions.");
                }
            }

            if (isRateLimitError && currentModel === 'gemini-3.1-pro-preview') {
                console.warn("Quota exceeded for Pro model. Falling back to Flash model.");
                store.logEvent('SYS', "Quota exceeded for Pro model. Falling back to Flash model.");
                currentModel = 'gemini-3-flash-preview';
                continue;
            }

            if (e.message && e.message.includes('timed out')) {
                console.error("AI request timed out, failing fast.", e);
                throw e;
            }
            
            const isUnavailable = (e.error?.code === 503) || 
                                  (e.error?.status === 'UNAVAILABLE') || 
                                  (e.message && (e.message.includes('overloaded') || e.message.includes('try again') || e.message.includes('empty response')));

            const isServerError = (e.error?.code >= 500 && e.error?.code < 600) || (e.error?.status === 'INTERNAL');

            if (isRateLimitError || isServerError || isUnavailable) {
                if (attempt < maxRetries - 1) {
                    const backoffFactor = isUnavailable ? 4 : 2; 
                    const delay = initialDelay * Math.pow(backoffFactor, attempt) + Math.random() * 500;
                    
                    let reason = 'Unknown Error';
                    if (isRateLimitError) reason = 'Rate limit exceeded';
                    else if (isUnavailable) reason = 'Model overloaded/Unavailable';
                    else if (isServerError) reason = `Server error (${e.error?.code || e.error?.status})`;

                    console.warn(`${reason}. Retrying in ${Math.round(delay / 1000)}s... (Attempt ${attempt + 1}/${maxRetries})`);
                    store.logEvent('SYS', `AI request failed (${reason}). Retrying in ${Math.round(delay / 1000)}s...`);
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    lastError = new Error(`The AI service is currently busy or unavailable. Please try again in a few minutes. (Final error: ${e.message})`);
                }
            } else {
                throw e;
            }
        }
    }
    console.error("AI request failed after all retries.", lastError);
    throw lastError;
};
