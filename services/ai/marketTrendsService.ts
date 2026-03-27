import { Type } from "@google/genai";
import { ai } from './common';
import type { Lead, MarketTrendReport, LeadMarket } from '@/types';
import { generateContentWithRetry as executeRequest } from '@/utils/apiUtils';
import { safeJsonParse } from '@/utils/jsonUtils';
import { useAppStore } from '@/store/store';

export const analyzeMarketTrends = async (leads: Lead[], currentDate: string, market: LeadMarket): Promise<MarketTrendReport> => {
    if (leads.length === 0) {
        return { report: "Not enough data to analyze. Please save more leads to generate a market trend report.", strategicLeadIds: [] };
    }

    const prompts = {
        'UK': `You are a Senior Market Analyst for the UK construction industry, working for a premium natural slate supplier. The current date is ${currentDate}. I will provide you with a JSON array of construction leads your company has saved. 
        Your two primary tasks are:
        1.  **Generate a Report:** Analyze the data and generate a concise, insightful market trends report in markdown format.
        2.  **Identify Key Leads:** Select the top 5-10 most strategically important leads from the provided data that your analysis is based on. These are the leads that best represent the trends you identify or offer the highest potential.
        **Report Requirements:**
        - **Date Accuracy:** Your report should reflect the current date (${currentDate}) and avoid mentioning outdated dates from your training data.
        - **Geographic Hotspots:** Which towns, cities, or counties show the most activity?
        - **Booming Project Types:** Are there specific types of projects (e.g., 'Barn Conversion', 'Listed Building Repair') that are trending?
        - **Key Players:** Identify architects or developers appearing repeatedly on high-value projects.
        - **Strategic Recommendations:** Provide 2-3 actionable recommendations for the sales team.
        **Output Format:**
        Your response MUST be a single JSON object with two keys:
        - \`report\`: A string containing your full markdown-formatted report.
        - \`strategicLeadIds\`: An array of strings, where each string is the original 'id' of one of the key leads you identified.
        **Lead Data:**
        ${JSON.stringify(leads, null, 2)}`,
        'Spain': `Eres un Analista de Mercado Senior para la industria de la construcción en España, trabajando para un proveedor premium de pizarra natural. La fecha actual es ${currentDate}. Te proporcionaré un array JSON de leads de construcción que tu empresa ha guardado.
        Tus dos tareas principales son:
        1.  **Generar un Informe:** Analiza los datos y genera un informe de tendencias de mercado conciso y perspicaz en formato markdown.
        2.  **Identificar Leads Clave:** Selecciona los 5-10 leads estratégicamente más importantes de los datos proporcionados en los que se basa tu análisis.
        **Requisitos del Informe:**
        - **Puntos Geográficos Calientes:** ¿Qué ciudades o provincias muestran más actividad?
        - **Tipos de Proyectos en Auge:** ¿Hay tipos específicos de proyectos (ej. 'Rehabilitación de Casco Histórico', 'Vivienda Unifamiliar de Lujo') que son tendencia?
        - **Actores Clave:** Identifica arquitectos o promotores que aparecen repetidamente en proyectos de alto valor.
        - **Recomendaciones Estratégicas:** Proporciona 2-3 recomendaciones accionables para el equipo de ventas.
        **Formato de Salida:**
        Tu respuesta DEBE ser un único objeto JSON con dos claves:
        - \`report\`: Una cadena con tu informe completo en formato markdown.
        - \`strategicLeadIds\`: Un array de cadenas, donde cada cadena es el 'id' original de uno de los leads clave que identificaste.
        **Datos de Leads:**
        ${JSON.stringify(leads, null, 2)}`,
        'France': `Vous êtes un Analyste de Marché Senior pour l'industrie de la construction en France, travaillant pour un fournisseur premium d'ardoise naturelle. La date actuelle est ${currentDate}. Je vais vous fournir un tableau JSON de prospects de construction que votre entreprise a enregistrés.
        Vos deux tâches principales sont :
        1.  **Générer un Rapport :** Analysez les données et générez un rapport sur les tendances du marché, concis et perspicace, au format markdown.
        2.  **Identifier les Prospects Clés :** Sélectionnez les 5 à 10 prospects les plus importants sur le plan stratégique à partir des données fournies sur lesquelles votre analyse est basée.
        **Exigences du Rapport :**
        - **Points Chauds Géographiques :** Quelles villes ou départements montrent le plus d'activité ?
        - **Types de Projets en Plein Essor :** Y a-t-il des types de projets spécifiques (par ex. 'Rénovation de Monument Historique', 'Maison individuelle de luxe') qui sont en vogue ?
        - **Acteurs Clés :** Identifiez les architectes ou promoteurs apparaissant de manière répétée sur des projets à forte valeur.
        - **Recommandations Stratégiques :** Fournissez 2-3 recommandations exploitables pour l'équipe commerciale.
        **Format de Sortie :**
        Votre réponse DOIT être un seul objet JSON avec deux clés :
        - \`report\`: Une chaîne contenant votre rapport complet au format markdown.
        - \`strategicLeadIds\`: Un tableau de chaînes, où chaque chaîne est l' 'id' original de l'un des prospects clés que vous avez identifiés.
        **Données des Prospects :**
        ${JSON.stringify(leads, null, 2)}`
    };

    const prompt = prompts[market] || prompts['UK'];

    try {
        const { activeModel } = useAppStore.getState();
        const response = await executeRequest(ai, {
            model: activeModel,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        report: { type: Type.STRING },
                        strategicLeadIds: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        }
                    },
                    required: ["report", "strategicLeadIds"]
                }
            }
        });
        return safeJsonParse(response.text);
    } catch (e) {
        console.error("Failed to analyze market trends:", e);
        return { report: "An error occurred during AI analysis. Could not generate the report.", strategicLeadIds: [] };
    }
};