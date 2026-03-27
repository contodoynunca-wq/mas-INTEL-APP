
import type { CountryCode } from '@/types';

interface HeadLapRules {
  [pitch: number]: number;
}

export interface RoofingStandard {
  name: string;
  minPitch: number;
  defaultPitch?: number;
  headLapRules: HeadLapRules | ((snowZone: number, windZone: number) => number);
  gaugeFormula: (slateLength: number, headLap: number) => number;
  sideLap: number;
  fixingsPerSlate: number;
  exposureZones: string[];
  snowZones?: string[];
  units: 'metric';
  language: 'en' | 'es' | 'fr' | 'de';
  specialNotes?: string;
  specialTerms?: { [key: string]: string };
}

export const ROOFING_STANDARDS: Record<CountryCode, RoofingStandard> = {
  UK: {
    name: "BS 5534:2014+A2:2018",
    minPitch: 17.5,
    defaultPitch: 20,
    headLapRules: {
      20: 145,
      22.5: 135,
      25: 120,
      30: 100,
      35: 100
    },
    gaugeFormula: (slateLength, headLap) => (slateLength - headLap) / 2,
    sideLap: 75,
    fixingsPerSlate: 2,
    exposureZones: ['A', 'B', 'C', 'D'],
    units: 'metric',
    language: 'en'
  },
  
  ES: {
    name: "CTE DB-HS1",
    minPitch: 22,
    headLapRules: {
      22: 150,
      25: 120,
      30: 100,
      35: 100
    },
    gaugeFormula: (slateLength, headLap) => (slateLength - headLap) / 2.5,
    sideLap: 80,
    fixingsPerSlate: 2,
    exposureZones: ['Baja', 'Media', 'Alta'],
    specialNotes: "Galicia/Asturias: Local building codes may apply stricter head lap requirements",
    units: 'metric',
    language: 'es'
  },
  
  FR: {
    name: "DTU 40.11",
    minPitch: 25,
    headLapRules: {
      25: 120,
      30: 100,
      35: 100,
      40: 100
    },
    gaugeFormula: (slateLength, headLap) => (slateLength - headLap) / 2,
    sideLap: 75,
    fixingsPerSlate: 2,
    exposureZones: ['Protégé', 'Normal', 'Sévère'],
    specialTerms: {
      gauge: 'pureau'
    },
    units: 'metric',
    language: 'fr'
  },
  
  DE: {
    name: "DIN 18338",
    minPitch: 22,
    headLapRules: (snowZone, windZone) => {
      if (snowZone >= 3) return 130;
      if (windZone >= 3) return 120;
      return 100;
    },
    gaugeFormula: (slateLength, headLap) => (slateLength - headLap) / 2,
    sideLap: 75,
    fixingsPerSlate: 2,
    exposureZones: ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'],
    snowZones: ['Zone 1', 'Zone 2', 'Zone 3'],
    units: 'metric',
    language: 'de'
  }
};

export const getRegulatoryDisclaimer = (country: CountryCode): string => {
    const std = ROOFING_STANDARDS[country] || ROOFING_STANDARDS['UK'];
    
    const baseEn = `METHODOLOGY: Quantities are calculated based on ${std.name} methodology for net surface area coverage plus standard waste factors (Slates: 7-10%, Membranes: 10-15%).
    DISCLAIMER: This is an AI-generated estimate for quoting purposes only. It is NOT a construction drawing or a verified Bill of Quantities. The contractor must verify all dimensions, pitches, and exposure zones on site before ordering. Voids < 0.5m² are not deducted. Ridge/Hip calculations are linear estimates.`;

    const baseEs = `METODOLOGÍA: Las cantidades se calculan basándose en la metodología ${std.name} para la cobertura de superficie neta más factores de desperdicio estándar (Pizarra: 7-10%, Membranas: 10-15%).
    DESCARGO DE RESPONSABILIDAD: Esta es una estimación generada por IA solo para fines de cotización. NO es un plano de construcción ni una Medición certificada. El contratista debe verificar todas las dimensiones, pendientes y zonas de exposición en el sitio antes de realizar el pedido.`;

    const baseFr = `MÉTHODOLOGIE: Les quantités sont calculées sur la base de la méthodologie ${std.name} pour la couverture de surface nette plus les facteurs de perte standard.
    AVIS DE NON-RESPONSABILITÉ: Ceci est une estimation générée par l'IA à des fins de devis uniquement. Ce n'est PAS un dessin de construction ni un métré vérifié. L'entrepreneur doit vérifier toutes les dimensions, pentes et zones d'exposition sur place avant de commander.`;

    const baseDe = `METHODIK: Die Mengen werden basierend auf der ${std.name}-Methodik für die Nettoflächenabdeckung plus Standardverschnittfaktoren berechnet.
    HAFTUNGSAUSSCHLUSS: Dies ist eine KI-generierte Schätzung nur zu Angebotszwecken. Es handelt sich NICHT um eine Konstruktionszeichnung oder ein verifiziertes Leistungsverzeichnis. Der Auftragnehmer muss alle Abmessungen, Neigungen und Expositionszonen vor der Bestellung vor Ort überprüfen.`;

    if (country === 'ES') return baseEs;
    if (country === 'FR') return baseFr;
    if (country === 'DE') return baseDe;
    return baseEn;
};
