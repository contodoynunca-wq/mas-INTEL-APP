
import type { Lead, LeadMarket, Material, LeadContact } from '../types';
import { i18n } from './translations';

// Standard Google Maps Static API key
const GOOGLE_MAPS_API_KEY = "AIzaSyBD2ZWbkHzrCUGTHwHwqK9v2dNj6XGINTE";

/**
 * Intelligent Address Cleaner
 */
export const getGeocodingAddress = (originalAddress: string | undefined | null): string => {
    if (!originalAddress) return "";
    return originalAddress.trim();
};

/**
 * Determines the best address string to use for mapping.
 * PRIORITIZES formatted address to ensure Google Maps finds the right spot.
 */
export const getBestMapAddress = (lead: Lead): string => {
    // 1. Try formatted address first
    let addressToUse = getGeocodingAddress(lead.formattedAddress);
    
    // 2. Fallback to raw address if formatted is too short/empty
    if (!addressToUse || addressToUse.length < 5) {
        const rawAddr = getGeocodingAddress(lead.address);
        if (rawAddr) {
            addressToUse = rawAddr;
            // Augment with council if not present to help geocoding context
            if (lead.council && !addressToUse.toLowerCase().includes(lead.council.toLowerCase())) {
                addressToUse += `, ${lead.council}`;
            }
        }
    }
    
    // 3. Fallback to just council if nothing else
    if ((!addressToUse || addressToUse.length < 3) && lead.council) {
        addressToUse = lead.council;
    }

    return addressToUse;
};

// Helper for robust URL construction
export const constructStaticMapUrl = (lat: number, lng: number) => {
  const baseUrl = "https://maps.googleapis.com/maps/api/staticmap";
  const params = new URLSearchParams();
  params.append("center", `${lat},${lng}`);
  params.append("key", GOOGLE_MAPS_API_KEY);
  params.append("maptype", "hybrid"); 
  params.append("zoom", "18"); 
  params.append("size", "600x300");
  params.append("scale", "2"); 
  params.append("markers", `color:red|${lat},${lng}`);
  return `${baseUrl}?${params.toString()}`;
};

export interface ValidationResult {
    valid: boolean;
    issues: string[];
}

export const validateContact = (contact: Partial<LeadContact>): ValidationResult => {
    const issues: string[] = [];
    if (!contact.contactName || contact.contactName === 'Unknown') issues.push("Missing Name");
    if (!contact.company || contact.company === 'Unknown') issues.push("Missing Company");
    
    // Check for at least one contact method
    if (!contact.email && !contact.phone && !contact.mobile) {
        issues.push("No Contact Info");
    }
    
    // Basic format checks
    if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
        issues.push("Invalid Email");
    }
    
    return { valid: issues.length === 0, issues };
};

export const validateContactList = (contacts: Partial<LeadContact>[]): ValidationResult => {
    if (!contacts || contacts.length === 0) return { valid: false, issues: ["No contacts found"] };
    const validContacts = contacts.filter(c => validateContact(c).valid);
    if (validContacts.length === 0) return { valid: false, issues: ["No valid contacts found"] };
    return { valid: true, issues: [] };
};

export const getPrintGroupIntroHTML = (
    title: string, 
    market: LeadMarket, 
    mapLink?: { url: string, text: string },
    staticMapUrl?: string
): string => {
    const dateStr = new Date().toLocaleDateString();
    
    return `
        <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 90vh; text-align: center; page-break-after: always; font-family: sans-serif;">
            <img src="https://i.imgur.com/0Yw1FxJ.png" alt="Mont Azul Logo" style="width: 120px; height: auto; margin-bottom: 2rem;" />
            <h1 style="color: #2980B9; font-size: 2.5rem; margin-bottom: 0.5rem;">${title}</h1>
            <p style="font-size: 1.2rem; color: #555; margin-bottom: 2rem;">Generated on ${dateStr} | Market: ${market}</p>
            
            ${staticMapUrl ? `
                <div style="margin: 1rem 0; width: 80%; max-width: 800px; border: 1px solid #ccc; border-radius: 8px; overflow: hidden;">
                    <img src="${staticMapUrl}" style="width: 100%; height: auto; display: block;" alt="Group Location Map" />
                </div>
            ` : ''}

            ${mapLink ? `
                <div style="margin: 2rem 0; padding: 1rem; border: 1px dashed #ccc; border-radius: 8px;">
                    <p style="margin-bottom: 0.5rem; font-weight: bold; color: #333;">Interactive Map</p>
                    <a href="${mapLink.url}" target="_blank" style="display: inline-block; background-color: #2980B9; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">
                        ${mapLink.text}
                    </a>
                    <p style="font-size: 0.8rem; color: #888; margin-top: 0.5rem;">(Click to open in Google Maps)</p>
                </div>
            ` : ''}
            
            <div style="margin-top: auto; color: #888; font-size: 0.9rem;">
                <p><strong>Mont Azul Sales Intelligence Hub</strong></p>
                <p>Confidential Internal Report</p>
            </div>
        </div>
    `;
};

export const generateFullLeadHTML = async (
    lead: Lead,
    reportTitle: string,
    options: { includeStrategy: boolean, includePersonalEmails: boolean, includeFinancials?: boolean },
    mapLink?: { url: string, text: string }
): Promise<string> => {
    const T = i18n[lead.market] || i18n['UK'];

    // --- 1. Contacts Generation ---
    const contacts = lead.companies || [];
    let contactsHTML = '';
    
    if (contacts.length > 0) {
        const sortedContacts = [...contacts].sort((a, b) => {
            if (a.priority === 'main' && b.priority !== 'main') return -1;
            if (a.priority !== 'main' && b.priority === 'main') return 1;
            return 0;
        });

        contactsHTML = `<div class="contacts-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem;">`;
        sortedContacts.forEach(c => {
             if(!c.contactName && !c.company) return;
             const isMain = c.priority === 'main';
             contactsHTML += `
                <div class="contact-card" style="background: ${isMain ? '#f0f9ff' : '#f8f9fa'}; border: 1px solid ${isMain ? '#2980b9' : '#e0e0e0'}; padding: 0.8rem; border-radius: 6px; page-break-inside: avoid;">
                    <h4 style="margin: 0 0 0.5rem 0; font-size: 1.1em; color: ${isMain ? '#1a5276' : '#2980B9'};">
                        ${isMain ? '<span style="color: #f39c12; font-size: 1.2em;">★</span> ' : ''}${c.contactName || 'Unknown'} 
                        <span style="font-size:0.8em; color:#555; font-weight:normal;">(${c.type || T.role})</span>
                    </h4>
                    <p style="margin: 0.2rem 0; font-size: 0.9em;"><strong>${T.company}:</strong> ${c.company || 'N/A'}</p>
                    ${c.email ? `<p style="margin: 0.2rem 0; font-size: 0.9em;"><strong>${T.email}:</strong> <a href="mailto:${c.email}">${c.email}</a></p>` : ''}
                    ${c.phone ? `<p style="margin: 0.2rem 0; font-size: 0.9em;"><strong>${T.phone}:</strong> ${c.phone}</p>` : ''}
                    ${c.mobile ? `<p style="margin: 0.2rem 0; font-size: 0.9em;"><strong>Mobile:</strong> ${c.mobile}</p>` : ''}
                </div>
             `;
        });
        contactsHTML += `</div>`;
    } else {
        contactsHTML = `<p><em>${T.noContactsFound}</em></p>`;
    }

    // --- 2. Map Generation (Satellite & Street View) ---
    let mapHtml = '';
    let finalImgSrc = '';
    let fallbackImgSrc = ''; 
    let streetViewImgSrc = '';
    let finalHrefLink = '';
    
    // Priority: ADDRESS string.
    const addressToUse = getBestMapAddress(lead);
    const encodedAddress = encodeURIComponent(addressToUse);
    
    if (addressToUse && addressToUse.length > 5) {
        
        // Primary: Hybrid (Satellite) using address string
        const params = new URLSearchParams();
        params.append("center", addressToUse);
        params.append("zoom", "19"); // High Zoom for roof detail
        params.append("size", "600x300");
        params.append("scale", "2");
        params.append("maptype", "hybrid");
        params.append("markers", `color:red|${addressToUse}`);
        params.append("key", GOOGLE_MAPS_API_KEY);
        
        finalImgSrc = `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
        
        // Fallback: Roadmap (Address)
        params.set("maptype", "roadmap");
        params.set("zoom", "15");
        fallbackImgSrc = `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
        
        finalHrefLink = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
        
        // Street View Check using ADDRESS (More accurate than coords for buildings)
        try {
            streetViewImgSrc = `https://maps.googleapis.com/maps/api/streetview?size=600x300&location=${encodedAddress}&fov=90&heading=0&pitch=10&key=${GOOGLE_MAPS_API_KEY}`;
        } catch (e) {
            console.warn("SV gen failed");
        }

    } else if (lead.geolocation && typeof lead.geolocation.lat === 'number' && typeof lead.geolocation.lng === 'number') {
        // Fallback to coordinates ONLY if address is missing
        const { lat, lng } = lead.geolocation;
        
        finalImgSrc = constructStaticMapUrl(lat, lng);
        
        const fallbackParams = new URLSearchParams();
        fallbackParams.append("center", `${lat},${lng}`);
        fallbackParams.append("key", GOOGLE_MAPS_API_KEY);
        fallbackParams.append("maptype", "roadmap");
        fallbackParams.append("zoom", "15");
        fallbackParams.append("size", "600x300");
        fallbackParams.append("scale", "2");
        fallbackParams.append("markers", `color:red|${lat},${lng}`);
        fallbackImgSrc = `https://maps.googleapis.com/maps/api/staticmap?${fallbackParams.toString()}`;
        
        finalHrefLink = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
        
        streetViewImgSrc = `https://maps.googleapis.com/maps/api/streetview?size=600x300&location=${lat},${lng}&fov=90&heading=0&pitch=10&key=${GOOGLE_MAPS_API_KEY}`;
    } else {
        // Total Fallback
        fallbackImgSrc = `https://placehold.co/600x300/E0E0E0/333333?text=Location+Data+Unavailable`;
        finalImgSrc = fallbackImgSrc;
    }

    mapHtml = `
        <div style="padding: 0; margin: 0 auto; page-break-inside: avoid; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; gap: 10px;">
            <!-- Main Satellite Map -->
            <div style="border: 1px solid #ccc; border-radius: 4px; overflow: hidden;">
                <a href="${finalHrefLink}" target="_blank" title="View location on Google Maps">
                    <img 
                        src="${finalImgSrc}" 
                        alt="Project Location Map"
                        style="width: 100%; height: auto; display: block;"
                        onerror="this.onerror=null; this.src='${fallbackImgSrc}';"
                    >
                </a>
            </div>
            
            <!-- Street View (If Available - We try to load it) -->
            ${streetViewImgSrc ? `
            <div style="border: 1px solid #ccc; border-radius: 4px; overflow: hidden;">
                <img 
                    src="${streetViewImgSrc}" 
                    alt="Street View"
                    style="width: 100%; height: auto; display: block;"
                    onerror="this.style.display='none'"
                >
            </div>
            ` : ''}
        </div>
    `;

    // --- 3. Materials List ---
    let materialsHTML = '<p><em>No materials specified.</em></p>';
    if (lead.materials && lead.materials.length > 0) {
        materialsHTML = `<ul style="columns: 2; -webkit-columns: 2; -moz-columns: 2; font-size: 0.9em;">`;
        lead.materials.forEach(m => {
            materialsHTML += `<li>${m.name}</li>`;
        });
        materialsHTML += `</ul>`;
    }

    // --- 4. Financial Intelligence (Explicit Table) ---
    let financialsHTML = '';
    if (options.includeFinancials) {
        const financialContacts = lead.companies?.filter(c => c.financialStatus) || [];
        if (financialContacts.length > 0) {
            financialsHTML = `
                <div style="margin-top: 1.5rem; margin-bottom: 1rem; padding: 1rem; border: 1px solid #d1d5db; border-radius: 6px; background-color: #f9fafb; page-break-inside: avoid;">
                    <h3 style="margin-top: 0; border-bottom: 2px solid #2980B9; padding-bottom: 0.5rem; color: #2980B9;">Economic Health Report</h3>
                    <p style="font-size: 0.8em; color: #666; margin-bottom: 1rem;">Financial status verification from official government registries.</p>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.85em;">
                        <thead>
                            <tr style="background-color: #e5e7eb;">
                                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ccc;">Company</th>
                                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ccc;">Status</th>
                                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ccc;">Risk Level</th>
                                <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ccc;">Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${financialContacts.map(c => `
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 8px; font-weight: bold;">${c.company}</td>
                                    <td style="padding: 8px; font-weight: bold; color: ${['Active', 'Strong', 'Safe'].includes(c.financialStatus||'') ? '#166534' : '#991b1b'}">${c.financialStatus}</td>
                                    <td style="padding: 8px;">${c.financialRisk || 'N/A'}</td>
                                    <td style="padding: 8px;">${c.financialLink ? `<a href="${c.financialLink}" target="_blank" style="color: #2980B9; text-decoration: none;">Registry Record</a>` : 'Verified'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
    }
    
    // --- PAGE 1: DOSSIER OVERVIEW ---
    let html = `
        <div id="dossier-overview" style="position: relative; min-height: 100vh; page-break-before: always; page-break-after: always;">
            <div class="print-section">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; border-bottom: 2px solid #2980B9; padding-bottom: 0.5rem;">
                    <div>
                        <h2 style="margin-bottom: 0.2rem; border: none; color: #333;">${lead.title}</h2>
                        <p style="margin: 0; font-weight: bold; color: #555;">${lead.formattedAddress || lead.address}</p>
                    </div>
                    <div style="text-align: right;">
                        <span style="background: #2980B9; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; display: inline-block; margin-bottom: 5px;">${lead.projectStage}</span>
                        <p style="margin: 0; font-size: 0.9em;">Found: ${lead.dateFound}</p>
                        ${lead.startDate ? `<p style="margin: 2px 0 0 0; font-size: 0.9em; color: #2980B9; font-weight: bold;">Start: ${lead.startDate}</p>` : ''}
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem; margin-bottom: 1.5rem;">
                    <div>
                        <h3>${T.projectOverview}</h3>
                        <p style="font-size: 0.95em; line-height: 1.5;">${lead.summary || 'No summary available.'}</p>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem; background: #f8f9fa; padding: 1rem; border-radius: 6px; border: 1px solid #e0e0e0;">
                            <div>
                                <p style="font-size: 0.9em;"><strong>${T.address}:</strong> ${lead.formattedAddress || lead.address || 'N/A'}</p>
                                <p style="font-size: 0.9em;"><strong>Type:</strong> ${lead.projectType}</p>
                                <p style="font-size: 0.9em;"><strong>Ref:</strong> ${lead.applicationRef || 'N/A'}</p>
                                <p style="font-size: 0.9em;"><strong>Score:</strong> ${lead.slateFitScore}</p>
                                ${lead.applicationDate ? `<p style="font-size: 0.9em;"><strong>App. Date:</strong> ${lead.applicationDate}</p>` : ''}
                            </div>
                            <div>
                                <p style="font-size: 0.9em;"><strong>Value:</strong> ${lead.projectValue || 'N/A'}</p>
                                <p style="font-size: 0.9em;"><strong>Council:</strong> ${lead.council || 'N/A'}</p>
                                ${lead.decisionDate ? `<p style="font-size: 0.9em;"><strong>Decision:</strong> ${lead.decisionDate}</p>` : ''}
                            </div>
                        </div>

                        <h3>${T.keyMaterials}</h3>
                        ${materialsHTML}
                    </div>
                    
                    <div>
                         <h3 style="margin-top: 0;">${T.locationMap}</h3>
                         ${mapHtml}
                    </div>
                </div>

                <h3>${T.keyContacts}</h3>
                ${contactsHTML}

                ${financialsHTML}

                <div style="margin-top: 2rem; padding: 1rem; background-color: #f8f9fa; border-radius: 6px; text-align: center; font-size: 0.9em; color: #555; border: 1px dashed #ccc; page-break-inside: avoid;">
                    <p style="margin: 0.25rem 0;">
                        <strong>${T.feedbackTitle}</strong><br/>
                        <a href="mailto:info@montazul.com?subject=Feedback: ${encodeURIComponent(lead.title)}" style="color: #2980B9; text-decoration: none; font-weight: bold;">
                            info@montazul.com
                        </a>
                    </p>
                </div>
            </div>
        </div>
    `;

    // --- PAGE 2: STRATEGY (Optional) ---
    if (options.includeStrategy && (lead.salesStrategy || lead.actionPlan || lead.jewsonOverlap)) {
        html += `
            <div id="strategy-section" style="position: relative; min-height: 100vh; page-break-before: always; page-break-after: always;">
                <div class="print-section">
                    ${lead.salesStrategy || lead.actionPlan ? `<h2>${T.aiSalesStrategy}</h2>` : ''}
                    
                    ${lead.jewsonOverlap !== undefined ? `
                        <div style="padding: 10px; background: ${lead.jewsonOverlap ? '#e6fffa' : '#fff5f5'}; border: 1px solid ${lead.jewsonOverlap ? '#38b2ac' : '#fc8181'}; border-radius: 6px; margin-bottom: 1rem;">
                            <strong>Partner Overlap:</strong> ${lead.jewsonOverlap ? '✅ Opportunity' : '❌ No History'}
                            ${lead.companyStatus ? `<br/><small>Status: ${lead.companyStatus}</small>` : ''}
                        </div>
                    ` : ''}
                    
                    ${lead.salesStrategy ? `
                        <div class="strategy-box">
                            ${lead.salesStrategy.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')}
                        </div>
                    ` : ''}

                    ${lead.actionPlan ? `
                        <h3>Action Plan</h3>
                        <div class="strategy-box">
                            ${lead.actionPlan.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    return html;
};
