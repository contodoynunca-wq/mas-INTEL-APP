export type ExposureZone = 'Sheltered' | 'Moderate' | 'Severe' | 'Very Severe';

export interface Dimensions {
  eavesLength: number; // meters (Width of the house)
  span: number;   // meters (Depth of the house, Gable width)
  pitch: number; // degrees
  hipPitch?: number; // degrees, specific for hip ends
}

export interface SlateSize {
  name: string;
  length: number; // mm
  width: number;  // mm
  minPitch: number; // degrees
  thickness: number; // mm (visual kick)
  perCrate: number; // Pieces per crate
  price: number; // Default sell price
}

export interface Costing {
  slatePrice: number; // per unit
  slateHalfPrice: number; // per unit
  timberBattenPrice: number; // per meter
  timberRafterPrice: number; // per meter
  timberPurlinPrice: number; // per meter (NEW)
  timberRidgeBeamPrice: number; // per meter (NEW)
  membranePrice: number; // per m2
  leadCode3Price: number; // per kg (soakers)
  leadCode5Price: number; // per kg (valleys)
  leadClipPrice: number; // per bag/unit (NEW)
  copperStripPrice: number; // per meter
  nailPrice: number; // per kg
  ridgeTilePrice: number; // per unit
}

export type FeatureType = 'extension' | 'dormer' | 'window' | 'solar' | 'chimney';
export type RoofSide = 'front' | 'back';
export type DormerType = 'flat' | 'pitched';
export type RoofStyle = 'Gable' | 'Hipped' | 'Mono';
export type StructureType = 'Truss' | 'Cut'; // NEW
export type FlashingType = 'Stepped' | 'Cover'; // NEW

export interface RoofFeature {
  id: string;
  type: FeatureType;
  side: RoofSide;
  dormerType?: DormerType; // Only for dormers
  width: number;
  height: number; // Length up the slope (or projection for extension)
  pitch?: number; // Specific pitch for this feature (degrees)
  x: number; // offset from center of the roof face (meters)
  y: number; // offset from eaves (meters up slope)
}

export interface VisibilityState {
  slates: boolean;
  battens: boolean;
  rafters: boolean;
  joists: boolean;
  lead: boolean;
}

export interface ProjectState {
  roofStyle: RoofStyle;
  structureType: StructureType; // NEW
  abutmentFlashing: FlashingType; // NEW
  sprocketed: boolean; // Bell-cast eaves
  sprocketSettings: {
      length: number; // Kick length in meters
      pitchDelta: number; // How much flatter the kick is (degrees)
  };
  dimensions: Dimensions;
  exposure: ExposureZone;
  selectedSlate: SlateSize;
  features: RoofFeature[];
  costs: Costing;
  visibility: VisibilityState;
  mossControl: boolean; // BS 8000 / Mont Azul option
}

export interface CalculationResult {
  headlap: number; // mm
  gauge: number;   // mm
  wasteFactor: number; // % NEW
  slatesTotal: number;
  slatesHalves: number; // For verges/abutments
  crates: number; // Total crates required
  battens: number; // linear meters
  rafters: number; // linear meters
  purlins: number; // linear meters (NEW)
  ridgeBeams: number; // linear meters (NEW)
  membrane: number; // square meters
  nails: number; // kg
  lead: number; // kg
  leadClips: number; // units (NEW)
  copperStrip: number; // meters
  ridgeTiles: number;
  hipTiles: number;
  totalCost: number;
  warnings: string[];
  
  // Sustainability & Future-Proofing
  solarSystemSize: number; // kWp
  solarAnnualGen: number; // kWh
  solarAnnualSaving: number; // £
  
  // Rainwater
  runoffArea: number; // m2 (Effective)
  runoffFlowRate: number; // l/s
  gutterRecommendation: string;
  // Trust & Audit
  netAreaDeductions: number; // m2
  totalMainArea: number; // m2
  confidenceScore: number; // 0-100
}

export interface Hole {
    type: 'box' | 'triangle' | 'pentagon';
    x: number;
    zCenter?: number;
    width?: number;
    height?: number;
    zBase?: number; 
    zTop?: number;  
    widthBase?: number;
    zBottom?: number;
    zCheekTop?: number; 
    zPeak?: number; 
}
