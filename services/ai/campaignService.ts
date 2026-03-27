import { Type } from "@google/genai";
import { ai } from './common';
import { generateContentWithRetry as executeRequest } from '@/utils/apiUtils';
import { safeJsonParse } from '@/utils/jsonUtils';
import type { CampaignContact } from '@/types';
import { useAppStore } from '@/store/store';

/**
 * Generates a complete marketing campaign asset pack using AI.
 * It analyzes the campaign goal and target audience to produce strategy, email templates, and SMS copy.
 * @param {string} name - The name of the campaign.
 * @param {string} goal - The primary objective or creative brief for the campaign.
 * @param {CampaignContact[]} contacts - A sample of contacts from the target audience.
 * @returns {Promise<any>} A promise that resolves to the structured campaign asset object.
 * @throws {Error} If the AI fails to generate the assets.
 */
export const generateCampaignAssets = async (
    name: string,
    goal: string,
    contacts: CampaignContact[]
): Promise<any> => {
    const contactSample = contacts.slice(0, 10); // Use a sample for analysis

    const prompt = `You are a world-class marketing strategist for a premium slate roofing company called Mont Azul.
    Your task is to generate a complete marketing campaign asset pack based on a campaign goal and a sample of the target audience.

    **Campaign Goal:** ${goal}
    **Campaign Name:** ${name}

    **Target Audience Sample (analyse their roles and companies):**
    ${JSON.stringify(contactSample, null, 2)}

    **Your output MUST be a single JSON object with the following structure. Do not include any other text or markdown.**

    \`\`\`json
    {
      "strategy": {
        "targetAudienceAnalysis": "A brief analysis of the provided contact sample (e.g., 'The list primarily consists of senior architects at large firms...').",
        "keyPainPoints": [
          "Identify 2-3 key pain points this audience likely has that our slate products can solve.",
          "For example: 'Durability and longevity for high-end projects', 'Meeting strict heritage building requirements'."
        ],
        "messagingAngle": "Based on the pain points, define the core messaging angle for this campaign.",
        "recommendedChannels": ["Email", "SMS", "Phone Call"]
      },
      "emailTemplates": [
        {
          "name": "Comprehensive Version",
          "subject": "A compelling, non-spammy subject line for a detailed outreach email.",
          "body": "The full body of a comprehensive email. It should be personalized using placeholders like {{name}} and {{company}}. It must align with the messaging angle, address the key pain points, and include the HTML footer with image and PDF links."
        },
        {
          "name": "Concise Version",
          "subject": "A shorter, more direct subject line.",
          "body": "A brief, concise version of the email, aiming for a quick read and a single call-to-action. It must also include the HTML footer."
        }
      ],
      "smsTemplates": [
        {
            "name": "Short & Punchy",
            "body": "A very short SMS message (under 160 characters). It should be friendly, mention the user by name (use {{name}}), hint at the promotion/email, and provide a contact point. For example: 'Hi {{name}}, just sent you an email with details on our latest Mont Azul slate offers. Regards, Sales at Mont Azul.'"
        },
        {
            "name": "Detailed with Links",
            "body": "A slightly longer SMS message that includes our key resource links. The links MUST be included at the end. Lombeiro: https://drive.google.com/file/d/1u4C319khrXK1Oxp96LTA2w49OfomjehT/view Antartica: https://drive.google.com/file/d/1QRsyEIyIqlcigkyKy7iuEoa7p2Hxlt1s/view Sustainability: https://drive.google.com/file/d/18n1E2NkxwuZ7Jd0qpGpT5ZasXbHB8aDh/view"
        }
      ]
    }
    \`\`\`

    **CRITICAL INSTRUCTIONS FOR EMAIL BODY:**
    - The body MUST be valid HTML. Use <p> and <br> tags for paragraphs and line breaks.
    - You MUST include the following HTML signature block at the end of EACH email body.
        \`\`\`html
        <p>Best regards,</p>
        <table role="presentation" style="width:100%;border:0;border-spacing:0;">
            <tr>
                <td style="width:60px;padding-right:15px;vertical-align:top;">
                    <a href="https://montazul.com" target="_blank">
                        <img src="https://i.imgur.com/0Yw1FxJ.png" alt="Mont Azul Logo" style="width:50px;height:50px;display:block;">
                    </a>
                </td>
                <td style="vertical-align:top;">
                    <p style="margin:0 0 5px 0;font-weight:bold;">The Sales Team at Mont Azul</p>
                    <a href="https://montazul.com" style="color:#2980B9;text-decoration:none;">montazul.com</a>
                </td>
            </tr>
        </table>
        <hr style="margin:15px 0;">
        <p style="font-size: 0.9em; margin-top: 5px;">
          <strong>Downloads:</strong> 
          <a href="https://drive.google.com/uc?export=download&id=1u4C319khrXK1Oxp96LTA2w49OfomjehT" style="color:#2980B9;">Lombeiro Brochure</a> | 
          <a href="https://drive.google.com/uc?export=download&id=1QRsyEIyIqlcigkyKy7iuEoa7p2Hxlt1s" style="color:#2980B9;">Antartica Q100 Brochure</a> | 
          <a href="https://drive.google.com/uc?export=download&id=18n1E2NkxwuZ7Jd0qpGpT5ZasXbHB8aDh" style="color:#2980B9;">Sustainability Report</a>
        </p>
        \`\`\`
    `;

    try {
        const { activeModel } = useAppStore.getState();
        const response = await executeRequest(ai, {
            model: activeModel,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
            }
        });
        
        return safeJsonParse(response.text);

    } catch (e) {
        console.error("Failed to generate campaign assets:", e);
        throw new Error("The AI failed to generate campaign assets. Please check the logs.");
    }
};