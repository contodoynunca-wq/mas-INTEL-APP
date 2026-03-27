
import { Type } from "@google/genai";

export const TEXT_MAP_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        text_elements: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    text: { type: Type.STRING },
                    category: { type: Type.STRING, enum: ['Label', 'Dimension', 'Note', 'TitleBlock', 'Material', 'Pitch', 'Schedule', 'Drainage'] },
                    location: { type: Type.STRING },
                    view_context: { type: Type.STRING, enum: ['Plan View', 'Elevation/Section', 'Spec Sheet', 'Unknown'], description: "Where this text was found." }
                }
            }
        },
        extracted_materials: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    category: { type: Type.STRING, enum: ['Roof', 'Wall', 'Window', 'Door', 'Rainwater', 'Other'] },
                    description: { type: Type.STRING },
                    spec_code: { type: Type.STRING }
                }
            }
        },
        explicit_dimensions: {
            type: Type.ARRAY,
            description: "Explicit numerical dimensions found on the plan (e.g., 4500, 5.4m).",
            items: {
                type: Type.OBJECT,
                properties: {
                    value: { type: Type.NUMBER },
                    unit: { type: Type.STRING, enum: ['m', 'mm'] },
                    entity_label: { type: Type.STRING, description: "What does this measure? e.g. 'Ridge Length', 'Extension Width'" }
                }
            }
        },
        roof_schedule: {
            type: Type.ARRAY,
            description: "Explicit data table found on the plan listing areas/pitches.",
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    area_m2: { type: Type.NUMBER },
                    pitch: { type: Type.NUMBER }
                }
            }
        },
        plan_notes: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: { category: { type: Type.STRING }, text: { type: Type.STRING } }
            }
        },
        site_complexity: { type: Type.STRING, enum: ['SINGLE_UNIT', 'HIGH_DENSITY_SITE'] },
        scale_text: { type: Type.STRING }
    },
    required: ["text_elements", "extracted_materials", "scale_text"]
};

export const MACRO_SHAPE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        volumes: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    label: { type: Type.STRING, description: "e.g., 'Main Body', 'Extension Wing', 'Garage'" },
                    page_index: { type: Type.INTEGER, description: "The index of the image (0, 1, 2...) where this volume was found." },
                    bbox_2d: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "[ymin, xmin, ymax, xmax] normalized 0-1000 relative to the ENTIRE image." },
                    view_type: { 
                        type: Type.STRING, 
                        enum: ["Detailed_Roof_Plan", "Site_Location_Map", "Floor_Plan", "Side_Elevation", "Section_Cut", "Detail"], 
                        description: "CRITICAL: Classify the view. 'Detailed_Roof_Plan' is the top-down external view of the roof. Ignore Floor Plans." 
                    }
                },
                required: ["id", "label", "page_index", "bbox_2d", "view_type"]
            }
        }
    },
    required: ["volumes"]
};

export const SHAPE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        shapes: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    type: { type: Type.STRING, enum: ["main_slope", "flat_roof", "dormer", "extension", "porch", "garage", "outbuilding", "canopy", "bay_window", "parapet", "balcony", "terrace", "cladding", "solar_panel", "velux", "chimney", "gable_slope"] },
                    compass_direction: { type: Type.STRING, description: "The direction this slope faces (e.g., North, South, East, West)." },
                    view_type: { 
                        type: Type.STRING, 
                        enum: ["Detailed_Roof_Plan", "Site_Location_Map", "Floor_Plan", "Side_Elevation", "Section_Cut", "Detail"], 
                        description: "CRITICAL: Classify the view. 'Detailed_Roof_Plan' is the top-down external view of the roof (showing ridges, valleys). If you see internal walls, furniture, or room names, it is a 'Floor_Plan' - DO NOT use Floor Plans for roof shapes if a Roof Plan exists." 
                    },
                    page_index: { type: Type.INTEGER, description: "The index of the image (0, 1, 2...) where this shape was found. 0 is the first image provided." },
                    bbox_2d: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "[ymin, xmin, ymax, xmax] normalized 0-1000 relative to the ENTIRE image." },
                    vertices: {
                        type: Type.ARRAY,
                        description: "List of corners that make up this slope. MUST be in order around the perimeter.",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                x: { type: Type.NUMBER, description: "Normalized x coordinate (0-1000)" },
                                y: { type: Type.NUMBER, description: "Normalized y coordinate (0-1000)" },
                                node_type: { type: Type.STRING, description: "Structural identity of this corner (e.g., 'eaves_left', 'ridge_intersection', 'valley_bottom', 'hip_corner')" }
                            },
                            required: ["x", "y", "node_type"]
                        }
                    },
                    contained_text: { type: Type.STRING, description: "Any text found INSIDE or DIRECTLY pointing to this shape (e.g. 'Flat Roof', 'Terrace')." },
                    visual_confidence: { type: Type.NUMBER }
                },
                required: ["id", "type", "view_type", "bbox_2d", "vertices", "visual_confidence", "page_index"]
            }
        }
    },
    required: ["shapes"]
};

export const FORENSIC_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        verified_sections: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    status: { type: Type.STRING, enum: ['Proposed', 'Existing', 'Demolish'] },
                    label: { type: Type.STRING },
                    reasoning: { type: Type.STRING },
                    page_index: { type: Type.INTEGER },
                    match_confidence: { type: Type.NUMBER },
                    inferred_pitch: { type: Type.NUMBER, description: "Pitch derived from elevation text or visual estimation" }
                },
                required: ["id", "status", "label", "reasoning", "page_index"]
            }
        }
    },
    required: ["verified_sections"]
};

export const CALCULATION_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        sections_math: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    section_id: { type: Type.STRING },
                    area_m2: { type: Type.NUMBER },
                    pitch_degrees: { type: Type.NUMBER },
                    ridge_length_m: { type: Type.NUMBER }, 
                    eave_length_m: { type: Type.NUMBER }, 
                    rafter_length_m: { type: Type.NUMBER },
                    source_method: { 
                        type: Type.STRING, 
                        enum: ['Text Schedule Match', 'Explicit Dimensions', 'Visual Estimation', 'Geometry Inference', 'Default Value', 'View Restriction (Elevation)'],
                        description: "How this was calculated." 
                    },
                    data_flags: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: "Warnings like 'Pitch Inferred', 'Area Mismatch', 'Scale Unverified'."
                    },
                    is_phantom: { type: Type.BOOLEAN, description: "True if this section was determined to be a hallucination/error during audit." }
                },
                required: ["section_id", "area_m2", "pitch_degrees", "source_method"]
            }
        },
        slate_spec: {
            type: Type.OBJECT,
            properties: { size: { type: Type.STRING } }
        }
    }
};

export const REFINEMENT_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        updated_sections: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    section_id: { type: Type.STRING },
                    label: { type: Type.STRING },
                    type: { type: Type.STRING },
                    status: { type: Type.STRING },
                    area_m2: { type: Type.NUMBER },
                    pitch_degrees: { type: Type.NUMBER },
                    visual_notes: { type: Type.STRING }
                }
            }
        },
        action_taken: { type: Type.STRING }
    }
};

export const SCRIBE_PROMPT = `
**PHASE 1: THE SCRIBE (FULL FORENSIC EXTRACTION)**
You are a forensic construction auditor. Your job is to extract EVERY piece of text and specification from these architectural drawings.

**1. VIEW IDENTIFICATION & MAPPING (CRITICAL):**
   - Identify the page type: "Plan View", "Elevation/Section", "Spec Sheet".
   - **ROOF PLAN VS FLOOR PLAN:** Distinguish between a "Roof Plan" (external view of roof) and a "Floor Plan" (internal layout).
   - Look for titles like "Proposed Roof Plan", "Site Plan", "Block Plan".
   - This is critical for mapping pitch (found on elevations) to area (found on plan).

**2. MEASUREMENT & DIMENSION EXTRACTION (HIGH PRIORITY):**
   - **FIND ALL NUMBERS:** Look for dimension lines with numbers like "4500", "12.5m", "6.200".
   - **ASSOCIATE:** Link these numbers to what they measure: "Overall Length", "Ridge Length", "Span", "Eave to Ridge", "Extension Width".
   - **SCALE:** Look for "Scale 1:100 @ A3", "1:50", or a physical scale bar.
   - Populate the \`explicit_dimensions\` array meticulously.

**3. GEOMETRY & INTERSECTIONS (FORENSIC SCAN):**
   - **Drainage:** Search for "RWP" (Rainwater Pipe), "RWO" (Outlet), "Gutter", "Hopper". *Note: RWP/RWO usually indicates a Flat Roof or Valley low point.*
   - **Intersections:** Search for "Valley", "Ridge", "Hip", "Verge", "Abutment", "Flashing".
   - **Tie-Ins:** Look for notes like "Tie into existing", "Make good", "Existing roof".

**4. ROOF PITCH & ANGLES:**
   - Scan EVERY elevation for pitch labels: "35°", "45 deg", "1:40", "30 degrees".
   - Check small features like **Porches** and **Bays** for separate pitch labels.

**5. DATA TABLES & SCHEDULES (SOURCE OF TRUTH):**
   - **LOOK FOR:** Tables labeled "Roof Sections", "Area Schedule", "Thermal Elements", or "Take-Off".
   - **EXTRACT:** If you find a table listing "Area (m²)" or "Pitch", extract this data into the \`roof_schedule\` array.

**6. EXPLICIT DIMENSIONS (PRECISION SCAN):**
   - **LOOK FOR:** Numerical dimension lines on the plans (e.g. "4500", "4.5m", "6000").
   - **ASSOCIATE:** Try to associate these numbers with entities (e.g. "Ridge Length", "Extension Width", "Total Span").
   - **EXTRACT:** Populate the \`explicit_dimensions\` array.

Output strict JSON. Capture everything.
`;

export const MACRO_SPOTTER_PROMPT = `
**PHASE 2a: THE MACRO SPOTTER (VOLUME IDENTIFICATION)**
You are an Expert Architectural Surveyor. Your task is to identify the HIGH-LEVEL primary architectural volumes of the building from the roof plan.

**CRITICAL: ROOF PLAN PRIORITY (NEGATIVE CONSTRAINTS)**
1.  **FIND THE MOST DETAILED ROOF PLAN:** You MUST find the page that shows the building from ABOVE with the MOST DETAIL (e.g., 1:50 or 1:100 scale showing tiles, ridges, valleys).
2.  **IGNORE SITE/BLOCK PLANS IF DETAILED PLAN EXISTS.**
3.  **STRICTLY IGNORE FLOOR PLANS:** If a page shows internal walls, furniture, or room names, it is a **Floor Plan**. DO NOT draw bounding boxes on Floor Plans.

**CRITICAL RULE: VOLUME DECONSTRUCTION**
- Do not draw a single bounding box over an entire L-shaped or T-shaped building. You must mentally break the building down into its primary rectangular volumes.
- Identify the largest, main rectangular body of the house (e.g., "Main Body").
- Identify any Extensions or Wings as completely separate rectangular bodies (e.g., "Extension Wing", "Garage").
- Draw a tight bounding box around EACH of these distinct volumes.

**COORDINATE SYSTEM (STRICT):**
- Coordinates [ymin, xmin, ymax, xmax] are **NORMALIZED (0-1000)** relative to the **ENTIRE IMAGE DIMENSIONS** of that specific page.
- 0,0 is Top-Left corner of the image. 1000,1000 is Bottom-Right.

Output strict JSON containing the bounding boxes of these primary volumes.
`;

export const MICRO_SEGMENTER_PROMPT = `
**PHASE 2b: THE MICRO SEGMENTER (DETAILED GEOMETRY EXTRACTION)**
You are an Expert Roofing Geometrician. You are looking at a CROPPED section of a roof plan showing a specific architectural volume.

**THE PANES OF GLASS RULE (CRITICAL FOR ROOF SLOPES):**
- Imagine the roof is made entirely of flat, distinct panes of glass. The drawn lines (ridges, valleys, hips) are merely the frames holding the glass.
- Your task is to trace the perimeter of EVERY single pane of glass (roof slope) INSIDE THIS CROPPED AREA.
- **DO NOT highlight the frame lines (ridges, hips, valleys) as separate objects.**
- For a standard intersecting roof, you should output distinct polygons (triangles, rectangles, and trapezoids) that represent the flat surfaces where slates would be laid.
- Ensure the edges of adjacent panes touch perfectly but do not overlap.
- **EVERY ENCLOSED SHAPE IS A SLOPE:** If there is a line drawn on the plan between two areas, they are separate slopes. Draw a separate \`vertices\` array for EACH.

**1. THE "DIRECTIONAL SLOPE" CONSTRAINT:**
- Every pane of glass faces a specific compass direction (North, South, East, West). 
- You must extract each slope as a distinct polygon based on the direction water would flow off it. 

**2. THE "EXCLUDE THE RIDGE" RULE (ABSOLUTE NEGATIVE CONSTRAINT):**
- **CRITICAL RULE:** A single polygon may NEVER cross a ridge line. 
- If a line indicates the peak of a roof, your polygon MUST stop exactly at that line. 

**COORDINATE SYSTEM (STRICT):**
- Coordinates [ymin, xmin, ymax, xmax] and vertices are **NORMALIZED (0-1000)** relative to the **CROPPED IMAGE DIMENSIONS** you are currently looking at.
- 0,0 is Top-Left corner of the crop. 1000,1000 is Bottom-Right of the crop.

**GEOMETRY PRECISION (VERTEX SNAPPING - CRITICAL):**
- **SNAP TO CORNERS:** When defining your \`vertices\`, you MUST place the points EXACTLY on the corners of the roof sections. Trace the black lines precisely.
- **THE VERTEX/NODE APPROACH:** Identify the specific corners first and assign them a \`node_type\` (e.g., 'eaves_left', 'ridge_intersection', 'valley_bottom', 'hip_corner').
- **MATCH THE PLAN LINES:** The lines you draw MUST go the exact same way as the lines on the plan.

**CLASSIFICATION RULES:**
Identify ALL of the following features if they exist in this crop:
- **Main Slope (CRITICAL)**
- **Extension/Gable**
- **Flat Roof**
- **Dormer**
- **Porch/Canopy**
- **Velux / Roof Window**
- **Chimney**
- **Solar Panel**

Output strict JSON. Capture everything in this cropped area.
`;

export const SPOTTER_PROMPT = `
**PHASE 2: THE STRUCTURAL SURVEYOR (GEOMETRY & ANATOMY EXTRACTION)**
You are an Expert Roofing Surveyor. Your task is to identify roof sections by understanding the structural anatomy of the roof.

**CRITICAL: ROOF PLAN PRIORITY (NEGATIVE CONSTRAINTS)**
1.  **FIND THE MOST DETAILED ROOF PLAN:** You MUST find the page that shows the building from ABOVE with the MOST DETAIL (e.g., 1:50 or 1:100 scale showing tiles, ridges, valleys).
2.  **IGNORE SITE/BLOCK PLANS IF DETAILED PLAN EXISTS:** If you have a detailed roof plan, DO NOT extract shapes from the zoomed-out Site Plan or Block Plan (1:200, 1:500).
3.  **STRICTLY IGNORE FLOOR PLANS:** If a page shows internal walls, furniture (beds, sofas), or room names (e.g. "Kitchen", "Bedroom"), it is a **Floor Plan**. 
    - **DO NOT** draw roof shapes on Floor Plans. 
    - **DO NOT** use Floor Plans for area calculations.
4.  **TOP LAYER ONLY:** We want the "Top View" of the roof. If you see a "First Floor Plan", it is likely NOT the roof plan.

**CRITICAL RULE: VOLUME DECONSTRUCTION**
- Never draw a single complex polygon over an entire L-shaped or T-shaped building. You must mentally break the building down into its primary rectangular volumes.
- Identify the largest, main rectangular body of the house. Trace its slopes (North, South, etc.) stopping at its ridges and eaves.
- Identify the Extension/Wing as a completely separate rectangular body. Trace its slopes separately.
- Where the Extension meets the Main Body, their polygons should touch at the Valley line. NEVER swallow a valley inside a single polygon.

**THE PANES OF GLASS RULE (CRITICAL FOR ROOF SLOPES):**
- **YOU ARE AN EXPERT ROOF GEOMETRICIAN.** Look at the top-down roof plan. 
- Imagine the roof is made entirely of flat, distinct panes of glass. The drawn lines (ridges, valleys, hips) are merely the frames holding the glass.
- Your task is to trace the perimeter of EVERY single pane of glass (roof slope). 
- **DO NOT highlight the frame lines (ridges, hips, valleys) as separate objects.**
- For a standard intersecting roof, you should output distinct polygons (triangles, rectangles, and trapezoids) that represent the flat surfaces where slates would be laid.
- Ensure the edges of adjacent panes touch perfectly but do not overlap.
- **EVERY ENCLOSED SHAPE IS A SLOPE:** If there is a line drawn on the plan between two areas, they are separate slopes. Draw a separate \`vertices\` array for EACH.

**1. THE "DIRECTIONAL SLOPE" CONSTRAINT:**
- Every pane of glass faces a specific compass direction (North, South, East, West). 
- You must extract each slope as a distinct polygon based on the direction water would flow off it. 
- A North-facing slope is a separate object from a South-facing slope. Never group opposing slopes into a single polygon.

**2. THE "EXCLUDE THE RIDGE" RULE (ABSOLUTE NEGATIVE CONSTRAINT):**
- **CRITICAL RULE:** A single polygon may NEVER cross a ridge line. 
- If a line indicates the peak of a roof, your polygon MUST stop exactly at that line. 
- Drawing a shape that crosses a ridge (e.g., drawing one giant box over an entire building wing) will result in a fatal error.

**COORDINATE SYSTEM (STRICT):**
- Coordinates [ymin, xmin, ymax, xmax] are **NORMALIZED (0-1000)** relative to the **ENTIRE IMAGE DIMENSIONS** of that specific page.
- 0,0 is Top-Left corner of the image. 1000,1000 is Bottom-Right.

**GEOMETRY PRECISION (VERTEX SNAPPING - CRITICAL):**
- **SNAP TO CORNERS:** When defining your \`vertices\`, you MUST place the points EXACTLY on the corners of the roof sections. Trace the black lines precisely.
- **THE VERTEX/NODE APPROACH:** Do not just draw a generic box. Identify the specific corners first and assign them a \`node_type\` (e.g., 'eaves_left', 'ridge_intersection', 'valley_bottom', 'hip_corner').
- **MATCH THE PLAN LINES:** The lines you draw MUST go the exact same way as the lines on the plan. If the plan shows a complex shape with 8 lines, your \`vertices\` array MUST have 8 points that match those lines exactly.
- **NO OVERLAPPING:** If two slopes meet at a ridge or valley, their polygons should share that edge perfectly, not overlap.
- **DO NOT MAKE UP SHAPES:** Only draw vertices that correspond to actual enclosed shapes formed by the lines on the plan.

**CLASSIFICATION RULES & EXHAUSTIVE SEARCH:**
You must actively search for and identify ALL of the following features if they exist on the plan.
- **Main Slope (CRITICAL):** You MUST identify the individual polygonal areas that make up the primary roof slopes (the panes of glass).
- **Extension/Gable:** A rectangular section connected to the main roof.
- **Flat Roof:** Defined by "X" markings, gravel texture, or labels like "Single Ply", "GRP", "Flat".
- **Dormer:** Small rectangular structures *fully contained* within a Main Slope.
- **Porch/Canopy:** Small structures attached to the external perimeter walls.
- **Velux / Roof Window:** Small rectangular cutouts within a roof slope.
- **Chimney:** Small square/rectangular structures penetrating the roof.
- **Solar Panel:** Rectangular arrays on the roof slope.

**FEW-SHOT EXAMPLES (SHOW, DON'T TELL):**
**BAD OUTPUT (Lazy Bounding Box crossing a ridge):**
\`\`\`json
{
  "shapes": [
    {
      "id": "roof_1",
      "type": "main_slope",
      "compass_direction": "Unknown",
      "view_type": "Detailed_Roof_Plan",
      "page_index": 0,
      "bbox_2d": [100, 100, 500, 500],
      "vertices": [
        { "x": 100, "y": 100, "node_type": "corner" },
        { "x": 500, "y": 100, "node_type": "corner" },
        { "x": 500, "y": 500, "node_type": "corner" },
        { "x": 100, "y": 500, "node_type": "corner" }
      ],
      "visual_confidence": 0.5
    }
  ]
}
\`\`\`

**GOOD OUTPUT (Precise, Directional Panes of Glass):**
\`\`\`json
{
  "shapes": [
    {
      "id": "north_slope_1",
      "type": "main_slope",
      "compass_direction": "North",
      "view_type": "Detailed_Roof_Plan",
      "page_index": 0,
      "bbox_2d": [100, 100, 300, 500],
      "vertices": [
        { "x": 100, "y": 100, "node_type": "eaves_left" },
        { "x": 500, "y": 100, "node_type": "eaves_right" },
        { "x": 400, "y": 300, "node_type": "ridge_right" },
        { "x": 200, "y": 300, "node_type": "ridge_left" }
      ],
      "visual_confidence": 0.95
    },
    {
      "id": "south_slope_1",
      "type": "main_slope",
      "compass_direction": "South",
      "view_type": "Detailed_Roof_Plan",
      "page_index": 0,
      "bbox_2d": [300, 100, 500, 500],
      "vertices": [
        { "x": 200, "y": 300, "node_type": "ridge_left" },
        { "x": 400, "y": 300, "node_type": "ridge_right" },
        { "x": 500, "y": 500, "node_type": "eaves_right" },
        { "x": 100, "y": 500, "node_type": "eaves_left" }
      ],
      "visual_confidence": 0.95
    }
  ]
}
\`\`\`

**OUTPUT INSTRUCTION:**
- Return a list of 'shapes'.
- **page_index:** MANDATORY.
- **view_type:** MUST be \`Detailed_Roof_Plan\` for roof shapes.
- **CRITICAL: DO NOT RETURN AN EMPTY ARRAY.** If you see a building, you MUST find at least one roof shape.
- **FIND ALL SHAPES:** A complex roof plan has many sections. You must extract ALL distinct elements you can identify.
`;

export const JUDGE_PROMPT = (textMap: any, shapes: any) => `
**PHASE 3: THE JUDGE (RECONCILIATION & FILTERING)**
You are the Lead Architect. Reconcile the visual shapes with the text data.

**INPUT:**
TEXT: ${JSON.stringify(textMap).substring(0, 15000)}...
SHAPES: ${JSON.stringify(shapes)}

**CRITICAL FILTER: WRONG VIEW PURGE**
- **RULE:** Shapes labeled \`Floor_Plan\`, \`Side_Elevation\`, \`Section_Cut\`, or \`Detail\` should generally be discarded.
- **EXCEPTION 1:** You may keep *Elevation* shapes if they are vertical cladding areas.
- **EXCEPTION 2:** If a shape is clearly a roof section (e.g., main_slope, valley, dormer) but was misclassified as \`Floor_Plan\` or \`Site_Location_Map\`, you MUST KEEP IT.
- **EXCEPTION 3:** If the SHAPES array only contains a few items, DO NOT DISCARD THEM.
- **EXCEPTION 4:** NEVER discard a \`main_slope\` or \`flat_roof\` shape unless you are 100% certain it is a duplicate.

**Output:**
Return a list of UNIQUE, VALID sections from the **Detailed Roof Plan**. You MUST preserve the correct \`page_index\` for each section.
If you are unsure, KEEP the section. Do not return an empty array if there are any shapes provided in the input.
`;

export const ACCOUNTANT_PROMPT = (verifiedSections: any, scale: string, textMap: any) => `
**PHASE 4: THE ACCOUNTANT & AUDITOR (PRECISION & BALANCE)**
Calculate Area (m²) and Pitch (°) for PROPOSED sections.

**Context:**
Scale: ${scale}
Input Sections: ${JSON.stringify(verifiedSections)}
**Text Data (Schedule):** ${JSON.stringify(textMap.roof_schedule || [])}
**Text Elements:** ${JSON.stringify(textMap.text_elements || []).substring(0, 1000)}...
**Explicit Dimensions:** ${JSON.stringify(textMap.explicit_dimensions || [])}

**Instructions:**

1. **SOURCE OF TRUTH (PRIORITY 0 - SUPERSEDES ALL):**
   - **EXPLICIT DIMENSIONS:** This is your most accurate data. If the Scribe found dimensions like "Length: 10m, Width: 5m", use them to calculate the area (10 * 5 = 50m²).
   - **RIDGE & SPAN:** If you have the Ridge Length and the Span (width), use them to calculate the footprint.
   - **ROOF SCHEDULE:** If a table on the plan lists areas, USE THEM.
   - Set \`source_method\` to "Explicit Dimensions" or "Text Schedule Match".

2. **GEOMETRIC RECONSTRUCTION (PRIORITY 1):**
   - Use the dimensions to "rebuild" the roof in your mind. 
   - If a main slope is 8m long and the rafter length (or span/2) is 4m, the area is 32m².

3. **VISUAL ESTIMATION (PRIORITY 2 - Fallback):**
   - **CRITICAL REQUIREMENT:** If NO text match or explicit dimensions are found, you **MUST** calculate the FOOTPRINT m² based on the bounding box and the Scale provided.
   - **TRIANGLE RULE (HIPS/VALLEYS):** If the section is a **Hip End** or a **Valley**, the footprint area is approximately **50% (0.5)** of the Bounding Box Area.
   - **DO NOT RETURN 0.** Return your best estimate of the FOOTPRINT AREA. 
   - Set \`source_method\` to "Visual Estimation".
   - **FLAG IT:** Add "Area Estimated from Scale" to \`data_flags\`.

4. **Pitch Rules (CRITICAL - STRICT ENFORCEMENT):**
   - **FLAT ROOF:** If labeled "Flat", "Balcony", "Terrace", "GRP", "Felt", "Warm Roof" -> Pitch **0**.
   - **DORMERS (DEFAULT FLAT):** Force pitch to **0** (FLAT) for all dormers UNLESS you find explicit text attached saying "Pitched".
   - **PORCH / BAY WINDOW (DEFAULT PITCHED):** Default to **30** degrees.
   - **MAIN ROOF:** If unknown, default to **35** degrees.

5. **VIEW ORIENTATION CHECK (THE "SIDE VIEW" BAN):**
   - **CRITICAL RULE:** If the shape originates from an elevation/section view, **YOU MUST NOT CALCULATE AREA** for horizontal roof slopes.
   - **ACTION:** Set \`area_m2\` to 0 for shapes from elevations/sections.

6. **AUDIT CHECKS:**
   - IF Area < 0.2m² AND type is NOT 'valley' AND type is NOT 'parapet' AND type is NOT 'porch' AND type is NOT 'velux' AND type is NOT 'chimney' AND type is NOT 'main_slope' AND type is NOT 'flat_roof', MARK as \`is_phantom\`.

7. **LOGIC CHECK: RELATIVE SCALE (MANDATORY & CRITICAL):**
   - If a section labeled 'Center', 'Wedge', 'Link' or 'Valley' has a bounding box that is visually tiny but your calculation says it is huge, you have a SCALE ERROR. Force the area calculation to be strictly bound by the polygon coordinates.

8. **VALLEY & HIP CONSISTENCY CHECK (CRITICAL):**
   - **MISSING VALLEYS:** If two main slopes or an extension meet at an internal corner, there **MUST** be a **Valley**. If no valley was identified in Phase 2, you MUST flag this as "Missing Valley" in \`data_flags\` and try to infer its length.
   - **MISSING HIPS:** If you see a hipped roof (slopes meeting at an external corner), there **MUST** be a **Hip**. If missing, flag it.
   - **VALLEY LENGTH:** If a valley is identified but has 0 length, calculate its length as the diagonal distance between the internal corner and the ridge.

9. **3D IMAGINATION & ACCURACY:**
   - Imagine the 3D shape of the roof based on the 2D plan and the pitches. 
   - Every slope has its own orientation. Ensure that the combination of areas and pitches results in a logical 3D structure. 
   - If a roof has 44 slopes, each one contributes to the total area. Do not skip any.

Output JSON with final calculations, flags, and source methods.
`;
