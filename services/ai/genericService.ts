import { ai } from './common';
import { generateContentWithRetry as executeRequest } from '@/utils/apiUtils';
import { useAppStore } from '@/store/store';

export const generateText = async (prompt: string): Promise<string> => {
    const { activeModel } = useAppStore.getState();
    const response = await executeRequest(ai, { model: activeModel, contents: prompt });
    return response.text;
};

export const generateSvg = async (prompt: string): Promise<string> => {
    const { activeModel } = useAppStore.getState();
    const fullPrompt = `Generate ONLY the SVG code for the following diagram. Do not include any explanation, titles, or markdown formatting like \`\`\`svg. The response must start with "<svg" and end with "</svg>". Description: ${prompt}`;
    const response = await executeRequest(ai, { model: activeModel, contents: fullPrompt });
    let svgContent = response.text.trim();
    if (svgContent.startsWith('```svg')) {
      svgContent = svgContent.substring(5, svgContent.length - 3).trim();
    }
    return svgContent;
};

export const generateRoofPlanSvg = async (description: string): Promise<string> => {
    const { activeModel } = useAppStore.getState();
    const fullPrompt = `You are an expert architectural assistant specializing in roofing. Your task is to generate a simple, clean, top-down 2D SVG diagram of a roof based on a text description.
- The SVG must have a transparent background.
- All lines should use \`stroke="currentColor"\` to adapt to the display theme.
- The SVG should be scalable, using a viewBox attribute and no fixed width/height.
- Include basic, clear text labels for key features like 'Ridge', 'Hip', 'Valley', 'Dormer' if they are mentioned in the description.
- The response MUST BE ONLY the raw SVG code, starting with "<svg" and ending with "</svg>". Do not include any explanation or markdown formatting.

Description to visualize: "${description}"`;
    
    const response = await executeRequest(ai, { model: activeModel, contents: fullPrompt });
    let svgContent = response.text.trim();
    if (svgContent.startsWith('```svg')) {
      svgContent = svgContent.substring(5, svgContent.length - 3).trim();
    }
    return svgContent;
};