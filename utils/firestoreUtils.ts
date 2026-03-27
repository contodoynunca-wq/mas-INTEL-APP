


import type { Lead, Material, LeadContact } from '@/types';

/**
 * Helper to safely convert Firestore Timestamps (or serialized versions of them) to JS Date objects.
 * Handles:
 * 1. Firestore Timestamp objects (with toDate())
 * 2. Serialized Timestamps (objects with seconds property)
 * 3. JS Date objects or strings
 * 4. null/undefined
 */
export function safeTimestampToDate(timestamp: any): Date | null {
    if (!timestamp) return null;
    
    // Real Firestore Timestamp
    if (typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
    }
    
    // Serialized Timestamp (from local storage or JSON)
    if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
        // Convert seconds to milliseconds, add nanoseconds if available
        return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
    }

    // Date string or number
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * V52 HYGIENE PROTOCOL: FIREBASE SANITIZER
 * Recursively converts `undefined` values to `null` because Firestore throws an error on `undefined`.
 * Also handles nested arrays by stringifying them, as Firestore does not support arrays of arrays.
 * Preserves Firestore FieldValue objects UNLESS they are inside an array (which Firestore forbids).
 */
export function sanitizeForFirestore(data: any, inArray = false): any {
    if (data === undefined) return null;
    if (data === null) return null;
    
    if (data instanceof Date) return data;

    // Check for FieldValues (e.g. serverTimestamp, arrayUnion)
    // We check for the presence of specific internal properties or constructor name to be safe
    const isFieldValue = data && typeof data === 'object' && (data.constructor?.name === 'FieldValue' || (data._methodName && typeof data._methodName === 'string'));

    if (isFieldValue) {
        if (inArray) {
            console.warn("Sanitizer: Stripped FieldValue from array context (Firestore restriction).");
            return null; // FieldValues cannot exist inside arrays in Firestore
        }
        return data;
    }
    
    if (Array.isArray(data)) {
        return data.map(item => {
            // Pass inArray=true to recursive calls
            const sanitized = sanitizeForFirestore(item, true);
            // Check if the sanitized item is itself an array. Firestore forbids nested arrays.
            if (Array.isArray(sanitized)) {
                // Flatten/Stringify nested arrays to prevent "invalid nested entity" error
                // This preserves data while satisfying Firestore constraints
                return JSON.stringify(sanitized);
            }
            return sanitized;
        });
    }
    
    if (typeof data === 'object') {
        const sanitizedObject: { [key: string]: any } = {};
        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                const value = data[key];
                // Pass inArray state down. If we are already in an array (e.g. leads array), 
                // then any object property here is also legally inside that array structure.
                sanitizedObject[key] = sanitizeForFirestore(value, inArray);
            }
        }
        return sanitizedObject;
    }
    
    return data;
}

/**
 * V52 HYGIENE PROTOCOL: UI TRANSFORMER
 * Strictly enforces UI-safe data types and standardizes structure.
 */
export function transformLeadForUI(rawLeadData: any): Partial<Lead> {
    if (!rawLeadData || typeof rawLeadData !== 'object') return {};

    const clean: any = { ...rawLeadData };

    // 1. Project Value
    if (clean.projectValue !== undefined && clean.projectValue !== null) {
        if (typeof clean.projectValue === 'object') {
            const val = clean.projectValue.amount ?? clean.projectValue.value ?? clean.projectValue.estimated_value;
            const currency = clean.projectValue.currency || '£';
            if (val !== undefined && val !== null) {
                 let symbol = '£';
                 const cLower = String(currency).toLowerCase();
                 if (cLower.includes('eur') || cLower.includes('euro')) symbol = '€';
                 else if (cLower.includes('usd')) symbol = '$';
                 clean.projectValue = `${symbol}${val.toLocaleString ? val.toLocaleString() : val}`;
            } else {
                 clean.projectValue = null;
            }
        } else {
            clean.projectValue = String(clean.projectValue).trim();
            if (/^\d+$/.test(clean.projectValue)) {
                clean.projectValue = `£${parseInt(clean.projectValue).toLocaleString()}`;
            }
        }
    }

    // 2. Materials
    let rawMaterials = clean.materials || clean.material_list; 
    if (!rawMaterials) {
        clean.materials = [];
    } else {
        if (!Array.isArray(rawMaterials)) rawMaterials = [rawMaterials];
        clean.materials = rawMaterials.map((m: any) => {
            if (!m) return null;
            if (typeof m === 'string') {
                const cleanName = m.replace(/^[-•*]\s*/, '').trim();
                if (cleanName.length < 2) return null;
                return { name: cleanName, type: 'Verbatim' };
            }
            if (typeof m === 'object') {
                 const name = m.name || m.material || m.value || m.description || m.item || (Object.keys(m).length > 0 ? Object.values(m)[0] : 'Unknown');
                 const cleanName = String(name).trim();
                 if (cleanName.length < 2 || cleanName.toLowerCase() === 'object') return null;
                 return { ...m, name: cleanName, type: m.type || 'Inferred' };
            }
            return { name: String(m), type: 'Inferred' };
        }).filter((m: any) => m !== null);
    }

    // 3. Contacts/Companies
    let rawCompanies = clean.companies || clean.contacts || clean.key_contacts; 
    if (!rawCompanies) {
        clean.companies = [];
    } else {
        if (!Array.isArray(rawCompanies)) rawCompanies = [rawCompanies];
        clean.companies = rawCompanies.map((c: any) => {
            if (!c) return null;
            if (typeof c === 'string') return { contactName: c, company: 'Unknown', status: 'Unverified', priority: 'secondary' };
            return {
                contactName: c.contactName || c.name || c.contact_name || (c.role ? c.role : 'Unknown Contact'),
                company: c.company || c.companyName || c.organization || 'Unknown Company',
                status: c.status || 'Unverified',
                email: c.email || c.emailAddress || c.email_address || undefined,
                phone: c.phone || c.phoneNumber || c.tel || undefined,
                type: c.type || c.role || c.jobTitle || 'Contact',
                priority: c.priority || 'secondary',
                linkedinUrl: c.linkedinUrl || c.linkedin || undefined,
                website: c.website || c.url || undefined,
                // Financial Intelligence Passthrough
                financialStatus: c.financialStatus || undefined,
                financialRisk: c.financialRisk || undefined,
                financialLink: c.financialLink || undefined,
                financialLastChecked: c.financialLastChecked || undefined
            };
        }).filter((c: any) => c !== null && (c.contactName || c.company));
    }
    
    // 4. Address Flattening
    if (clean.formattedAddress && typeof clean.formattedAddress === 'object') {
         clean.formattedAddress = Object.values(clean.formattedAddress).filter(v => v).join(', ');
    }
    if (clean.address && typeof clean.address === 'object') {
         clean.address = Object.values(clean.address).filter(v => v).join(', ');
    }

    // 5. Geolocation Passthrough (V60 Upgrade)
    // Ensure that if geolocation is present (e.g. from AI enrichment), it remains valid
    if (clean.geolocation && typeof clean.geolocation === 'object') {
        // If valid lat/lng numbers, keep them.
        if (typeof clean.geolocation.lat !== 'number' || typeof clean.geolocation.lng !== 'number') {
            delete clean.geolocation;
        }
    }

    // 6. Array Assurance
    ['keyDates', 'siteHistory', 'companyNames', 'sources'].forEach(field => {
        if (clean[field] && !Array.isArray(clean[field])) {
             clean[field] = [clean[field]];
        } else if (!clean[field]) {
            clean[field] = [];
        }
    });
    
    // 7. Start Date
    if (!clean.startDate && clean.start_date) clean.startDate = clean.start_date;
    if (!clean.startDate && clean.construction_start) clean.startDate = clean.construction_start;

    // 8. Docs
    if (!clean.planningDocuments || !Array.isArray(clean.planningDocuments)) {
        clean.planningDocuments = [];
    } else {
        // V58 Fix: Defensively flatten array to prevent "Property array contains invalid nested entity"
        clean.planningDocuments = clean.planningDocuments.flat(Infinity).map((doc: any) => ({
            filename: doc.filename || 'Unknown Document',
            url: doc.url || '#',
            type: doc.type || 'Document',
            storageUrl: doc.storageUrl
        }));
    }

    // 9. Truncation
    if (clean.summary && typeof clean.summary === 'string' && clean.summary.length > 800) {
        clean.summary = clean.summary.substring(0, 797) + '...';
    }

    // 10. ID
    if (!clean.id) {
        clean.id = `lead_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    // Pass through specific dates (normalize keys to camelCase for UI)
    if (clean.application_date) clean.applicationDate = clean.application_date;
    if (clean.decision_date) clean.decisionDate = clean.decision_date;
    // Ensure direct passthrough if they are already in correct format
    if (clean.applicationDate) clean.applicationDate = clean.applicationDate;
    if (clean.decisionDate) clean.decisionDate = clean.decisionDate;

    // Cleanup
    delete clean.contacts;
    delete clean.material_list;
    delete clean.key_contacts;
    delete clean.application_date;
    delete clean.decision_date;

    return clean as Partial<Lead>;
}

export const enforceLeadStructure = transformLeadForUI;
