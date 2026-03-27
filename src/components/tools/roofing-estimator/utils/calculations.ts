import { ProjectState, CalculationResult } from '../types';
import { getMinHeadlap, ELECTRICITY_PRICE, SOLAR_YIELD, RAINFALL_INTENSITY } from '../constants';

export const calculateRoof = (state: ProjectState): CalculationResult => {
  const { dimensions, exposure, selectedSlate, costs, features, mossControl, roofStyle, sprocketed, structureType, abutmentFlashing } = state;
  const { eavesLength, span, pitch } = dimensions;
  const hipPitch = dimensions.hipPitch || pitch;

  const warnings: string[] = [];

  // --- BS 5534 COMPLIANCE CHECKS ---

  // 1. Minimum Pitch Check
  if (pitch < selectedSlate.minPitch) {
    warnings.push(`⛔ NON-COMPLIANT: ${selectedSlate.name} requires min pitch of ${selectedSlate.minPitch}°. Current: ${pitch}°.`);
  }
  if (hipPitch < selectedSlate.minPitch && roofStyle === 'Hipped') {
    warnings.push(`⛔ NON-COMPLIANT: Hip pitch ${hipPitch}° is below slate minimum ${selectedSlate.minPitch}°.`);
  }

  // 2. Headlap Calculation
  const headlap = getMinHeadlap(pitch, exposure, selectedSlate.length);
  
  // Check if headlap is physically viable
  if (headlap >= selectedSlate.length * 0.5) {
      warnings.push(`⚠️ CRITICAL: Required headlap (${headlap}mm) is >50% of slate length. Pitch too shallow for this slate.`);
  }

  // 3. Batten Gauge Calculation
  const gauge = (selectedSlate.length - headlap) / 2;
  const gaugeM = gauge / 1000;
  
  // 4. Gauge Checks
  if (gauge < 80) {
      warnings.push(`⚠️ WARNING: Calculated gauge is ${gauge.toFixed(1)}mm. This is narrow/uneconomical. Increase pitch or slate size.`);
  }

  // 5. Batten Sizing Check (General Rule for 600mm centers)
  warnings.push(`ℹ️ NOTE: For 600mm rafter centres, use 50x25mm graded battens to comply with BS 5534.`);

  // 6. Exposure Advisories
  if (exposure === 'Severe' || exposure === 'Very Severe') {
      if (pitch < 25) {
           warnings.push(`⚠️ ADVISORY: Severe exposure at low pitch (<25°) increases risk. Verify driving rain index (BS 8104).`);
      }
      warnings.push(`ℹ️ NOTE: In ${exposure} zones, ensure fixing specification resists higher wind uplift.`);
  }

  // --- GEOMETRY & QUANTITIES ---

  // 1. Basic Geometry
  const run = span / 2;
  const rise = run * Math.tan((pitch * Math.PI) / 180);
  const rafterLength = run / Math.cos((pitch * Math.PI) / 180);
  
  // Basic Area calculation
  let totalMainArea = (eavesLength * span) / Math.cos((pitch * Math.PI) / 180); // Default Gable Box
  
  if (roofStyle === 'Mono') {
     const monoRun = span;
     const monoRafter = monoRun / Math.cos((pitch * Math.PI) / 180);
     totalMainArea = eavesLength * monoRafter;
  }
  
  let deductedArea = 0;
  let additionalRoofArea = 0; 
  let additionalRidgeLen = 0;
  let additionalValleys = 0; // meters
  let hipRafterLen = 0;
  let additionalVergeLen = 0;
  let abutmentLen = 0;

  // Hip Geometry
  if (roofStyle === 'Hipped') {
      const hipEndRun = rise / Math.tan((hipPitch * Math.PI)/180);
      const hipEndRafter = hipEndRun / Math.cos((hipPitch * Math.PI)/180);
      
      const hipEndArea = 0.5 * span * hipEndRafter;
      
      const ridgeLen = Math.max(0, eavesLength - 2 * hipEndRun);
      const mainSideArea = ((eavesLength + ridgeLen) / 2) * rafterLength;
      
      totalMainArea = (mainSideArea * 2) + (hipEndArea * 2);
      
      // Hip Rafters (Diagonal Length)
      const diagLen = Math.sqrt(hipEndRun*hipEndRun + (span/2)*(span/2) + rise*rise);
      hipRafterLen = diagLen * 4;
  }

  // Feature Geometry Analysis
  let solarArea = 0;

  features.forEach(f => {
      const featureArea = f.width * f.height;
      if (f.type === 'window' || f.type === 'chimney') {
          deductedArea += featureArea;
          // Abutment len: 2 sides + top/bottom depending on type
          if (f.type === 'chimney') abutmentLen += (f.height * 2) + (f.width * 2);
          if (f.type === 'window') abutmentLen += (f.height * 2) + f.width; // Top is usually gutter, bottom apron
      }
      if (f.type === 'dormer' && f.dormerType === 'pitched') {
          deductedArea += featureArea; 
          additionalRoofArea += (featureArea * 1.3); 
          additionalRidgeLen += f.height;
          additionalValleys += f.height * 2;
          abutmentLen += (f.height * 2); // Cheeks against main roof? Actually usually valleys or flashings
      }
      if (f.type === 'extension') {
          deductedArea += (f.width * (f.width/2)); 
          const extPitch = f.pitch || pitch;
          const extRun = f.width / 2;
          const extRafter = extRun / Math.cos((extPitch * Math.PI) / 180);
          const extArea = (extRafter * f.height) * 2; 
          additionalRoofArea += extArea;
          additionalRidgeLen += f.height;
          additionalValleys += (extRafter * 2);
          abutmentLen += (extRafter * 2); // Sides against main wall (if applicable, simplified here)
      }
      if (f.type === 'solar') {
          solarArea += (f.width * f.height);
      }
  });

  if (roofStyle === 'Mono') abutmentLen += eavesLength; // Top edge usually abutment

  let netSlateArea = Math.max(0, totalMainArea - deductedArea + additionalRoofArea);
  
  // Sprocketed Eaves Adjustment
  if (sprocketed) {
      netSlateArea *= 1.05;
  }

  const slateWidthM = selectedSlate.width / 1000;
  const slatesPerM2 = 1 / ((slateWidthM + 0.005) * gaugeM);
  
  // 3. Quantities
  let slatesTotal = Math.ceil(netSlateArea * slatesPerM2);
  
  // Broken Bond Logic & Cut Edges (BS 5534)
  let cutEdgeLen = 0;

  // 1. Verges (Outer edges)
  if (roofStyle === 'Gable') cutEdgeLen += rafterLength * 4;
  else if (roofStyle === 'Mono') cutEdgeLen += (span / Math.cos((pitch*Math.PI)/180)) * 2;

  // 2. Hips and Valleys
  cutEdgeLen += hipRafterLen * 2; // Both sides of hips
  cutEdgeLen += additionalValleys * 2; // Both sides of valleys

  // 3. Abutments (Features like Velux, Chimney, Dormer)
  features.forEach(f => {
      if (f.type === 'window' || f.type === 'chimney') {
          cutEdgeLen += f.height * 2; // Left and right abutments
      }
      if (f.type === 'extension') {
          const extPitch = f.pitch || pitch;
          const extRafter = (f.width / 2) / Math.cos((extPitch * Math.PI) / 180);
          cutEdgeLen += extRafter * 2;
      }
  });

  // Calculate courses and required halves
  const edgeCourses = Math.ceil(cutEdgeLen / gaugeM);
  const slatesHalves = Math.ceil(edgeCourses / 2); // Every alternating course needs a half

  // Deduct the equivalent area from the standard slate total
  slatesTotal = Math.max(0, slatesTotal - Math.ceil(slatesHalves * 0.5));

  // --- DYNAMIC WASTE ALGORITHM (Cut Complexity) ---
  const totalCutEdges = additionalValleys + hipRafterLen + abutmentLen + cutEdgeLen;
  const complexityRatio = netSlateArea > 0 ? totalCutEdges / netSlateArea : 0;
  
  // Base Waste
  let wastePercent = 5; 
  
  // Add calculated complexity
  wastePercent += (complexityRatio * 20);

  // Add feature bumps
  features.forEach(f => {
      if (f.type === 'dormer') wastePercent += 1.5;
      if (f.type === 'window' || f.type === 'chimney') wastePercent += 0.5;
  });

  // Clamp constraints
  wastePercent = Math.min(20, Math.max(5, wastePercent));
  
  const wasteMultiplier = 1 + (wastePercent / 100);
  slatesTotal = Math.ceil(slatesTotal * wasteMultiplier);
  const crates = Math.ceil(slatesTotal / selectedSlate.perCrate);
  
  // Battens (Add extra for sprocketed break)
  const battens = (netSlateArea / gaugeM) * (sprocketed ? 1.15 : 1.1); 

  // --- STRUCTURAL TIMBER ---
  const rafterSpacing = 0.6; 
  let mainRaftersCount = 0;
  if (roofStyle === 'Mono') {
       mainRaftersCount = Math.ceil(eavesLength/rafterSpacing) + 1;
  } else {
       mainRaftersCount = (Math.ceil(eavesLength/rafterSpacing) + 1) * 2;
  }
  let timberLinearMeters = mainRaftersCount * (roofStyle === 'Mono' ? (span / Math.cos((pitch*Math.PI)/180)) : rafterLength);
  timberLinearMeters += hipRafterLen;
  
  // Structural Additions (Cut Roof vs Truss)
  let purlinsMeters = 0;
  let ridgeBeamMeters = 0;

  if (structureType === 'Cut') {
      // Ridge Beam
      const ridgeTileLength = 0.45; 
      let mainRidgeLen = 0;
      if (roofStyle === 'Gable') mainRidgeLen = eavesLength;
      else if (roofStyle === 'Hipped') {
           const hipEndRun = rise / Math.tan((hipPitch * Math.PI)/180);
           mainRidgeLen = Math.max(0, eavesLength - 2 * hipEndRun); 
      }
      const totalRidgeLen = mainRidgeLen + additionalRidgeLen;
      
      // Traditional cut roofs need a structural ridge beam
      if (totalRidgeLen > 0) {
          ridgeBeamMeters = totalRidgeLen;
          warnings.push(`ℹ️ ENGINEERING: Structural Ridge Beam calculated (${ridgeBeamMeters.toFixed(1)}m). Verify sizing with engineer.`);
      }

      // Purlins
      let purlinRowsPerSide = 0;
      if (rafterLength > 4.5) purlinRowsPerSide = 2;
      else if (rafterLength > 2.5) purlinRowsPerSide = 1;
      
      if (purlinRowsPerSide > 0) {
          const sideLen = roofStyle === 'Hipped' ? (eavesLength + mainRidgeLen)/2 : eavesLength; // Approx average length for hips
          purlinsMeters = (sideLen * purlinRowsPerSide * 2); // 2 sides
          warnings.push(`ℹ️ ENGINEERING: Rafter span > 2.5m. Added ${purlinRowsPerSide} row(s) of purlins per side.`);
      }
  }

  features.forEach(f => {
     timberLinearMeters += (rafterLength * 2); 
     const isWide = f.width > rafterSpacing;
     const multiplier = isWide ? 2 : 1;
     timberLinearMeters += (f.width * multiplier * 2); 
  });
  timberLinearMeters += (additionalRoofArea * 3.0); 

  const membrane = (totalMainArea + additionalRoofArea) * 1.15; 

  const ridgeTileLength = 0.45; 
  let mainRidgeLen = 0;
  if (roofStyle === 'Gable') mainRidgeLen = eavesLength;
  else if (roofStyle === 'Hipped') {
       const hipEndRun = rise / Math.tan((hipPitch * Math.PI)/180);
       mainRidgeLen = Math.max(0, eavesLength - 2 * hipEndRun); 
  }
  else if (roofStyle === 'Mono') mainRidgeLen = 0;

  const totalRidgeLen = mainRidgeLen + additionalRidgeLen;
  const ridgeTiles = Math.ceil(totalRidgeLen / ridgeTileLength);
  const hipTiles = roofStyle === 'Hipped' ? Math.ceil(hipRafterLen / ridgeTileLength) : 0;
  const copperStrip = mossControl ? (totalRidgeLen + (roofStyle === 'Hipped' ? hipRafterLen : 0)) : 0;

  const totalNailsCount = (slatesTotal + slatesHalves) * 2;
  const nailsKg = Math.ceil(totalNailsCount / 240); 

  // --- LEAD & FLASHINGS ---
  let leadKg = 0;
  let leadClips = 0;

  const valleyWidth = 0.5; 
  const valleyArea = additionalValleys * valleyWidth;
  leadKg += valleyArea * 25.40; // Code 5
  
  // Abutments
  const abutmentArea = abutmentLen * 0.3; // 300mm standard girth
  let abutmentWeight = abutmentArea * 14.97; // Code 3 base
  
  if (abutmentFlashing === 'Stepped') {
      abutmentWeight *= 1.10; // 10% extra for overlap/cutting waste on steps
      leadClips = Math.ceil(abutmentLen * 4); // 4 per meter
  } else {
      leadClips = Math.ceil(abutmentLen * 2); // 2 per meter for straight cover
  }
  
  leadKg += abutmentWeight;

  // --- SUSTAINABILITY: SOLAR ROI ---
  // Approx 210 W/m2 efficiency
  const solarSystemSize = solarArea * 0.210; 
  const solarAnnualGen = solarSystemSize * SOLAR_YIELD;
  const solarAnnualSaving = solarAnnualGen * ELECTRICITY_PRICE;

  // --- SUSTAINABILITY: RAINWATER RUNOFF (BS EN 12056-3) ---
  // Effective Area (Ae) = L * (W + H/2)
  // RunForDrainage is half span for Gable/Hip, full span for Mono
  const runForDrainage = roofStyle === 'Mono' ? span : (span / 2);
  const riseForDrainage = runForDrainage * Math.tan((pitch * Math.PI)/180);
  
  // Effective Run takes wind into account roughly by adding half the rise
  const effectiveRun = runForDrainage + (riseForDrainage / 2);
  const runoffArea = eavesLength * effectiveRun;
  
  // Flow Rate (Liters/Sec) = Area * Intensity
  const runoffFlowRate = runoffArea * RAINFALL_INTENSITY;

  let gutterRecommendation = "Standard Half Round (112mm)";
  if (runoffFlowRate > 2.4) {
      gutterRecommendation = "Ogee / High Cap (125mm+)";
  } else if (runoffFlowRate > 1.0) {
      gutterRecommendation = "Deep Flow (115mm)";
  }

  // --- CONFIDENCE SCORE ---
  let confidenceScore = 100;
  if (pitch < selectedSlate.minPitch) confidenceScore -= 20;
  else if (pitch < selectedSlate.minPitch + 5) confidenceScore -= 5;
  
  if (exposure === 'Severe' || exposure === 'Very Severe') confidenceScore -= 5;
  if (wastePercent > 10) confidenceScore -= (wastePercent - 10);
  if (features.length > 2) confidenceScore -= (features.length - 2) * 2;
  
  confidenceScore = Math.max(0, Math.min(100, Math.round(confidenceScore)));

  const totalCost = 
    (slatesTotal * costs.slatePrice) +
    (slatesHalves * costs.slateHalfPrice) +
    (battens * costs.timberBattenPrice) +
    (timberLinearMeters * costs.timberRafterPrice) +
    (purlinsMeters * costs.timberPurlinPrice) +
    (ridgeBeamMeters * costs.timberRidgeBeamPrice) +
    (membrane * costs.membranePrice) +
    (nailsKg * costs.nailPrice) +
    (leadKg * costs.leadCode3Price) + 
    (leadClips * costs.leadClipPrice) +
    (copperStrip * costs.copperStripPrice) +
    (ridgeTiles * costs.ridgeTilePrice) +
    (hipTiles * costs.ridgeTilePrice);

  return {
    headlap,
    gauge,
    wasteFactor: wastePercent,
    slatesTotal,
    slatesHalves,
    crates,
    battens,
    rafters: timberLinearMeters,
    purlins: purlinsMeters,
    ridgeBeams: ridgeBeamMeters,
    membrane,
    nails: nailsKg,
    lead: Math.ceil(leadKg),
    leadClips,
    copperStrip,
    ridgeTiles,
    hipTiles,
    totalCost,
    warnings,
    solarSystemSize,
    solarAnnualGen,
    solarAnnualSaving,
    runoffArea,
    runoffFlowRate,
    gutterRecommendation,
    netAreaDeductions: deductedArea,
    totalMainArea,
    confidenceScore
  };
};
