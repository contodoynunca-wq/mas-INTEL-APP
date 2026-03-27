import { SlateSize, Costing } from './types';

// Specific Product List based on user provided table
// Prices are sell prices.
export const SLATE_SIZES: SlateSize[] = [
  { name: '1a1a MA12', length: 500, width: 250, minPitch: 22.5, thickness: 5, perCrate: 825, price: 2.27 },
  { name: 'q100 MA12', length: 500, width: 250, minPitch: 22.5, thickness: 5, perCrate: 790, price: 2.04 },
  { name: 'LOM MA12', length: 500, width: 250, minPitch: 22.5, thickness: 5, perCrate: 710, price: 1.84 },
  { name: 'SUP MA11', length: 500, width: 250, minPitch: 22.5, thickness: 5, perCrate: 720, price: 1.84 },
  { name: 'Galicia MA11', length: 500, width: 250, minPitch: 22.5, thickness: 5, perCrate: 730, price: 1.78 },
  { name: 'Zamora 1F', length: 600, width: 300, minPitch: 20, thickness: 6, perCrate: 560, price: 3.10 },
  { name: 'MA12 Lom', length: 400, width: 200, minPitch: 30, thickness: 5, perCrate: 1350, price: 0.98 },
  { name: 'MA12 Superior', length: 400, width: 250, minPitch: 25, thickness: 5, perCrate: 900, price: 1.10 },
  { name: 'MA12 30x20', length: 300, width: 200, minPitch: 35, thickness: 4, perCrate: 1860, price: 0.78 },
  { name: 'MA12 32x22', length: 320, width: 220, minPitch: 35, thickness: 4, perCrate: 1800, price: 0.82 },
  { name: 'Standard 500x300', length: 500, width: 300, minPitch: 22.5, thickness: 5, perCrate: 600, price: 2.50 },
];

export const DEFAULT_COSTS: Costing = {
  slatePrice: 2.27, 
  slateHalfPrice: 6.81, // 3x Price
  timberBattenPrice: 0.85, 
  timberRafterPrice: 4.50,
  timberPurlinPrice: 12.50, // 225x75 C24
  timberRidgeBeamPrice: 15.00, // 175x47 C24 (or similar)
  membranePrice: 2.50, 
  leadCode3Price: 4.50, 
  leadCode5Price: 5.20,
  leadClipPrice: 0.50, // Per clip/wedge
  copperStripPrice: 15.00,
  nailPrice: 8.00,
  ridgeTilePrice: 12.00,
};

// Sustainability Constants
export const ELECTRICITY_PRICE = 0.29; // £ per kWh (Average UK Price Cap)
export const SOLAR_YIELD = 850; // kWh per kWp per year (UK Conservative Avg)
export const RAINFALL_INTENSITY = 0.021; // l/s/m2 (BS EN 12056-3 standard intensity)

// BS 5534:2014+A2:2018 Table 6 Guidance
export const getMinHeadlap = (pitch: number, exposure: string, slateLength: number): number => {
  const isSevere = exposure === 'Severe' || exposure === 'Very Severe';
  
  // Small Slates (<400mm)
  // Usually require steeper pitches (min 30+)
  if (slateLength < 400) {
      if (pitch < 30) return 100; // Likely unsuitable, force high lap
      if (pitch < 45) return isSevere ? 90 : 80;
      return isSevere ? 75 : 65;
  }

  // Medium / Standard Slates (400mm - 500mm)
  if (slateLength >= 400 && slateLength < 600) {
      if (pitch < 22.5) return 130; // Very large lap for shallow pitch
      if (pitch < 25) return 115;
      if (pitch < 30) return isSevere ? 100 : 90;
      if (pitch < 45) return isSevere ? 85 : 75;
      return isSevere ? 75 : 65; 
  }
  
  // Large Slates (>=600mm)
  if (slateLength >= 600) {
      if (pitch < 22.5) return 115;
      if (pitch < 27.5) return isSevere ? 100 : 90;
      return isSevere ? 90 : 80;
  }

  // Fallback safe default
  return 75;
};
