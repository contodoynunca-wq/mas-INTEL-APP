
import type { Lead } from '@/types';
import { differenceInDays } from 'date-fns';

// Pillar 1: Material Fit (0-40 points)
// 40 for Explicit Slate, 20 for Inferred/Heritage, 0 for Flat Roof/Asphalt.
const calculateViabilityScore = (lead: Lead): { score: number; details: string } => {
    let score = 0;
    let details = 'Low Fit';
    
    // Check materials for explicit specification
    const hasExplicitSlate = lead.materials?.some(m => 
        m.name.toLowerCase().includes('natural slate') || 
        m.name.toLowerCase().includes('spanish slate') ||
        m.name.toLowerCase().includes('brazilian slate') ||
        m.name.toLowerCase().includes('cupa') ||
        m.name.toLowerCase().includes('ssq')
    );

    const hasInferredOrHeritage = lead.summary.toLowerCase().includes('heritage') || 
                                  lead.summary.toLowerCase().includes('conservation area') ||
                                  lead.materials?.some(m => m.name.toLowerCase().includes('pitch roof'));

    if (hasExplicitSlate || lead.slateFitScore === 'High') {
        score = 40;
        details = 'Explicit Slate Spec';
    } else if (hasInferredOrHeritage || lead.slateFitScore === 'Medium') {
        score = 20;
        details = 'Inferred / Heritage';
    } else {
        score = 0;
        details = 'No Slate / Flat Roof';
    }

    return { score, details };
};

// Pillar 2: Velocity (0-30 points)
// 30 for "Conditions Discharged" or "On-Site," 20 for "Granted," 10 for "Submitted."
const calculateTimelinessScore = (lead: Lead): { score: number; details: string } => {
    let score = 10; // Default base
    let details = lead.projectStage || 'Unknown';
    const stage = (lead.projectStage || '').toLowerCase();
    const summary = (lead.summary || '').toLowerCase();

    if (stage.includes('site') || stage.includes('construction') || stage.includes('started') || summary.includes('conditions discharged')) {
        score = 30;
    } else if (stage.includes('approved') || stage.includes('granted') || stage.includes('conditionally')) {
        score = 20;
    } else if (stage.includes('planning') || stage.includes('submitted') || stage.includes('awaiting')) {
        score = 10;
    } else if (stage.includes('rejected') || stage.includes('withdrawn')) {
        score = 0;
    }

    return { score, details };
};

// Pillar 3: Entity (0-20 points)
// 20 for known volume builders, 5 for private individuals.
const calculateEntityScore = (lead: Lead): { score: number; details: string } => {
    let score = 5; // Default (Private/Small)
    let details = 'Private/Small';

    const volumeKeywords = ['homes', 'developments', 'construction', 'builders', 'ltd', 'limited', 'plc', 'group', 'properties'];
    const companyName = lead.companies?.[0]?.company?.toLowerCase() || '';

    // Simple heuristic for "Volume Builder" vs Private
    if (companyName && volumeKeywords.some(k => companyName.includes(k)) && !companyName.includes('unknown')) {
        score = 20;
        details = 'Commercial Entity';
    }

    return { score, details };
};

// Pillar 4: Contact (0-10 points)
// 10 for specific email/phone, 0 for generic.
const calculateContactScore = (lead: Lead): { score: number; details: string } => {
    const contacts = lead.companies || [];
    if (contacts.length === 0) return { score: 0, details: 'No Contacts' };

    let score = 0;
    let details = 'Generic Contact';

    // Check for specific contact details
    const hasSpecificContact = contacts.some(c => 
        c.email && 
        !c.email.includes('info@') && 
        !c.email.includes('sales@') && 
        !c.email.includes('admin@') &&
        c.contactName && c.contactName !== 'Unknown'
    );

    if (hasSpecificContact) {
        score = 10;
        details = 'Specific Decision Maker';
    }

    return { score, details };
};

export interface ScoreBreakdown {
    label: string;
    score: number;
    maxPoints: number;
    details: string;
}

export const getScoreBreakdown = (lead: Lead | null | undefined): ScoreBreakdown[] => {
    if (!lead) {
        return [
            { label: 'Material Fit', score: 0, maxPoints: 40, details: 'N/A' },
            { label: 'Velocity', score: 0, maxPoints: 30, details: 'N/A' },
            { label: 'Entity Value', score: 0, maxPoints: 20, details: 'N/A' },
            { label: 'Contact Quality', score: 0, maxPoints: 10, details: 'N/A' },
        ];
    }
    
    const material = calculateViabilityScore(lead);
    const velocity = calculateTimelinessScore(lead);
    const entity = calculateEntityScore(lead);
    const contact = calculateContactScore(lead);

    return [
        { label: 'Material Fit', ...material, maxPoints: 40 },
        { label: 'Velocity', ...velocity, maxPoints: 30 },
        { label: 'Entity Value', ...entity, maxPoints: 20 },
        { label: 'Contact Quality', ...contact, maxPoints: 10 },
    ];
};

export const calculateLeadScores = (lead: Lead): number => {
    if (!lead) return 0;
    const breakdown = getScoreBreakdown(lead);
    const totalScore = breakdown.reduce((sum, pillar) => sum + pillar.score, 0);
    return Math.min(100, Math.round(totalScore));
};

export const getGradeFromScore = (score: number): 'A+' | 'A' | 'B' | 'C' => {
    if (score >= 80) return 'A+';
    if (score >= 60) return 'A';
    if (score >= 40) return 'B';
    return 'C';
};
