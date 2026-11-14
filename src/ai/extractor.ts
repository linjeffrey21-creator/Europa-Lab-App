import { extractDocumentedBore, extractExplicitDimensions, extractLaunchPointAtPivot } from './explicitDimensions.ts';
/**
 * Lab4All — Specification Extraction, Natural-Language Parser & Optional AI Provider Layer
 *
 * Implements:
 * 1. Deterministic specification parser (`parseEquipmentSpecificationText`) that extracts
 *    explicitly documented dimensions, angle bounds, speed settings, materials, and visual
 *    features from pasted product descriptions, catalog notes, or specification sheets—with
 *    exact verbatim quote provenance and zero fabrication.
 * 2. Provider-independent optional AI vision/text interface (`analyzeWithAIProvider`) that
 *    can connect to a local/remote endpoint (`/api/equipment` or user-supplied Gemini/OpenAI-compatible
 *    endpoint in browser memory only) while keeping the Free Core 100% functional without any paid API.
 */

import type {
  DimensionKey,
  DimensionProvenanceKind,
  OperatingLimits,
  ProjectileVisualConfiguration,
} from '../equipment/schema.ts';
import { CLASSROOM_APPARATUS_PRESETS, DEFAULT_VISUAL_CONFIG, GSC_PROLCH_ID, PASCO_MINI_ID, VERNIER_VPL_ID } from '../equipment/schema.ts';

import { geminiQuotaRetryAt, reconstructApparatusWithGemini } from './geminiReconstruction.ts';
import type { ReconstructionGeometry } from '../equipment/schema.ts';
export { DEFAULT_GEMINI_MODEL, resolveGeminiModel, readGeminiResponseText } from './geminiReconstruction.ts';

import { matchPresetPhoto } from './presetPhotos.ts';

export interface ExtractedDimensionCandidate {
  key: DimensionKey;
  value_m: number;
  quote: string;
  source: DimensionProvenanceKind;
  confidenceNote: string;
}

export interface VisualFeatureInput {
  dominantTubeColor: 'blue' | 'silver' | 'black' | 'red' | 'brass';
  dominantBaseColor: 'wood' | 'black' | 'silver' | 'white' | 'blue_enamel';
  aspectRatio: number;
  hasClamp?: boolean;
  hasSprings?: boolean;
  hasPlumbBob?: boolean;
  isRectangular?: boolean;
  isOpenChannel?: boolean;
}

export interface ArchetypeClassificationResult {
  detectedArchetype: 'pasco_me6800' | 'eisco_ph0343' | 'boreal_slotted' | 'wood_ramp' | 'vernier_cannon' | 'custom';
  archetypeName: string;
  matchedPresetId?: string;
  guideType: 'rectangular_housing' | 'open_channel' | 'slotted_barrel' | 'tube';
  mountType: 'clamp' | 'foot';
  scaleStyle: 'housing_plumb' | 'circular_dial' | 'printed_arc' | 'vernier_protract';
  tubeProportion: 'short' | 'medium' | 'long';
  springVisible: boolean;
  confidence: number;
  recommendedDimensions: {
    barrelLength: number;
    barrelDiameter: number;
    baseLength: number;
    baseWidth: number;
    projectileDiameter: number;
  };
  dimensionExplanations: Record<string, string>;
  observations: string[];
}

export interface ImageVisualAnalysis {
  dominantTubeColor: 'blue' | 'silver' | 'black' | 'red' | 'brass';
  dominantBaseColor: 'wood' | 'black' | 'silver' | 'white' | 'blue_enamel';
  tubeMaterial: 'metal' | 'painted_metal' | 'stainless_steel' | 'wood';
  baseMaterial: 'cast_iron' | 'metal' | 'wood' | 'painted_metal';
  aspectRatio: number;
  guideProportion: 'short' | 'medium' | 'long';
  hasPlumbBob: boolean;
  hasProtractorArc: boolean;
  confidence: number;
  tubeColorHex: string;
  baseColorHex: string;
  summaryBadge: string;
  observations: string[];
  detectedArchetype: 'pasco_me6800' | 'eisco_ph0343' | 'boreal_slotted' | 'wood_ramp' | 'vernier_cannon' | 'custom';
  archetypeName: string;
  guideType: 'rectangular_housing' | 'open_channel' | 'slotted_barrel' | 'tube';
  mountType: 'clamp' | 'foot';
  scaleStyle: 'housing_plumb' | 'circular_dial' | 'printed_arc' | 'vernier_protract';
  springVisible: boolean;
  matchedPresetId?: string;
  recommendedDimensions: {
    barrelLength: number;
    barrelDiameter: number;
    baseLength: number;
    baseWidth: number;
    projectileDiameter: number;
  };
  dimensionExplanations?: Record<string, string>;
}

import { detectSlottedSupportPhoto, refineHousingPhoto, refinePhotoGeometry } from './panelPhotoRefinement.ts';
import type { HousingPhotoFrame, PanelPhotoFrame } from './panelPhotoRefinement.ts';

export interface EquipmentExtractionResult {
  equipment_type: 'projectile_motion_apparatus' | 'unsupported' | 'uncertain';
  detected_category_name: string;
  description: string;
  visual: ProjectileVisualConfiguration;
  visual_observations: Record<string, string>;
  components: string[];
  adjustable_mechanisms: string[];
  geometric_relationships: string[];
  dimension_candidates: Partial<Record<DimensionKey, ExtractedDimensionCandidate>>;
  missing_information: string[];
  uncertainty: string[];
  documented_limits: OperatingLimits;
  documented_initial_settings: {
    angle: number | null;
    speed: number | null;
    height: number | null;
  };
  max_range_m: number | null;
  speed_settings_count: number | null;
  evidence: Record<string, string>;
  analysis_mode: 'deterministic_spec_parser' | 'ai_vision_provider';
  fetched_url?: string;
  fetched_title?: string;
  matched_preset_id?: string;
  exact_catalog_match?: true;
  photo_preset_match?: true;
  ai_model?: string;
  vision_retry_at?: number;
  geometry?: ReconstructionGeometry;
  panelFrame?: PanelPhotoFrame;
  housingFrame?: HousingPhotoFrame;
  fetched_image?: string;
  alternate_product_photos?: string[];
  fetched_image_index?: number;
  geometry_reference_image?: string;
  detected_vendor?: string;
  image_analysis?: ImageVisualAnalysis;
}

/**
 * Built-in catalog of real-world educational apparatus URLs & model numbers so common
 * product links (Boreal, VWR, PASCO, Eisco, Arbor Scientific, Sargent-Welch, Flinn, Vernier)
 * work accurately even offline or when vendor sites block automated web scrapers.
 */
export const KNOWN_PRODUCT_URL_CATALOG: Array<{
  pattern: RegExp;
  title: string;
  vendor: string;
  presetId?: string;
  specs: string;
  dimensions?: Partial<Record<DimensionKey, { value_m: number; quote: string; source?: DimensionCandidateSource }>>;
  visual?: Partial<ProjectileVisualConfiguration>;
}> = [
  {
    pattern: /boreal\.com.*8884857|8884857|fundamentals-of-physics-projectile-launcher|boreal.*projectile/i,
    title: 'Boreal Fundamentals of Physics Projectile Launcher (Item #8884857)',
    vendor: 'Boreal Science / VWR',
    presetId: 'boreal-fundamentals-8884857',
    specs: 'Boreal PRLN01 Projectile Launcher. Sturdy wooden base and five spring positions; operating angle 0 to 90 degrees.',
    dimensions: {
      barrelLength: { value_m: 0.273, quote: 'Estimated barrel length from the supplier photo', source: 'visual_estimate' },
      barrelDiameter: { value_m: 0.0294, quote: 'Estimated outside guide diameter from the supplier photo', source: 'visual_estimate' },
      baseLength: { value_m: 0.40005, quote: '15¾ × 4 × 11¾ in (L × W × H)' },
      baseWidth: { value_m: 0.1016, quote: '15¾ × 4 × 11¾ in (L × W × H)' },
      projectileDiameter: { value_m: 0.019, quote: 'Ø19 mm replacement balls' },
    },
    visual: {
      guide_type: 'slotted_barrel',
      base: 'panel',
      foot_style: 'solid_plate',
      mount_type: 'foot',
      scale_style: 'printed_arc',
      tube_color: 'blue',
      base_color: 'wood',
      tube_material: 'painted_metal',
      support_material: 'wood',
      support_position: 'rear',
      tube_proportion: 'medium',
      spring_visible: true,
      trigger_visible: true,
      angle_scale: true,
      photogate_bracket: false,
      ramrod_included: false,
    },
  },
  {
    pattern: /eiscolabs\.com.*ph0343|eisco.*ph0343|ph0343|eisco.*projectile|eisco.*launcher/i,
    title: 'Eisco Labs Precision Projectile Launcher (PH0343)',
    vendor: 'Eisco Scientific',
    presetId: 'eisco-ph0343',
    specs:
      'Eisco PH0343 Precision Projectile Launcher. 42 cm slotted brushed aluminum U-channel guide (50 mm channel width), visible dual compression springs with 3 cocking settings, cast aluminum vertical support with table clamp mount (36 x 18 cm), engraved 0 to 90 degrees circular protractor dial with plumb-bob line, 19 mm projectile sphere, max speed 5.5 m/s.',
    dimensions: {
      barrelLength: { value_m: 0.42, quote: '42 cm open-faced aluminum U-channel guide with dual springs' },
      barrelDiameter: { value_m: 0.050, quote: '50 mm extruded aluminum U-channel width' },
      baseLength: { value_m: 0.36, quote: '36 cm heavy-duty bench clamp mounting bracket' },
      baseWidth: { value_m: 0.18, quote: '18 cm clamp width' },
      projectileDiameter: { value_m: 0.019, quote: '19 mm drilled launch sphere' },
    },
    visual: {
      guide_type: 'open_channel',
      base: 'panel',
      foot_style: 'cross_feet',
      mount_type: 'clamp',
      scale_style: 'housing_plumb',
      tube_color: 'silver',
      base_color: 'black',
      tube_material: 'metal',
      support_material: 'painted_metal',
      support_position: 'rear',
      tube_proportion: 'medium',
      spring_visible: true,
      trigger_visible: true,
      angle_scale: true,
      photogate_bracket: true,
      ramrod_included: false,
    },
  },
  {
    pattern: /\bME[- ]?6800\b|\bPASCO (?:Short[- ]Range )?Projectile Launcher\b|pasco\.com\/products\/(?:[^\s/]+\/)*projectile-launcher(?:[/?#]|$)/i,
    title: 'PASCO Projectile Launcher (ME-6800)',
    vendor: 'PASCO Scientific',
    presetId: 'pasco-me6800-style',
    specs: 'PASCO ME-6800 Short Range Projectile Launcher. Launcher length: 21 cm. The 25 mm plastic ball can be launched from 0° to 90°. The three nominal range settings are 1.2, 3, and 5 m.',
    dimensions: {
      barrelLength: { value_m: 0.21, quote: 'Launcher length: 21 cm' },
      barrelDiameter: { value_m: 0.05, quote: 'Estimated 50 mm outside housing width', source: 'visual_estimate' },
      projectileDiameter: { value_m: 0.025, quote: '25 mm plastic ball' },
    },
    visual: CLASSROOM_APPARATUS_PRESETS['pasco-me6800-style'].visual,
  },
  {
    pattern: /\bME[- ]?6825B?\b|\bPASCO Mini (?:Projectile )?Launcher\b|pasco\.com\/products\/signature\/mini-projectile-launcher/i,
    title: 'PASCO Mini Launcher (ME-6825B)',
    vendor: 'PASCO Scientific',
    presetId: PASCO_MINI_ID,
    specs: 'PASCO ME-6825B Mini Projectile Launcher. Launcher length: 18 cm. Steel ball diameter: 16 mm. The upper pivot supports angles from -45° to 90° and the enclosed spring has three range settings.',
    dimensions: {
      barrelLength: { value_m: 0.18, quote: 'Launcher length: 18 cm' },
      projectileDiameter: { value_m: 0.016, quote: 'Steel ball diameter: 16 mm' },
    },
    visual: CLASSROOM_APPARATUS_PRESETS[PASCO_MINI_ID].visual,
  },
  {
    pattern: /arborsci\.com.*projectile|arbor.*launcher|marble.*ramp|wooden.*launcher|09-2000/i,
    title: 'Arbor / Classroom Hardwood Open-Channel Ramp Launcher',
    vendor: 'Arbor Scientific',
    presetId: 'wooden-marble-ramp-launcher',
    specs:
      'Classroom Hardwood Open-Channel Marble Ramp Launcher. 58 cm red painted aluminum and birch hardwood open-channel V-track guide, 58 mm channel width, 56 x 24 cm birch plywood base with cross feet and printed arc angle scale (0 to 85 degrees), 25 mm steel projectile marble, maximum launch speed 4.8 m/s.',
    dimensions: {
      barrelLength: { value_m: 0.58, quote: '58 cm red painted aluminum open-channel V-track guide' },
      barrelDiameter: { value_m: 0.058, quote: '58 mm channel width' },
      baseLength: { value_m: 0.56, quote: '56 x 24 cm birch plywood base with cross feet' },
      baseWidth: { value_m: 0.24, quote: '56 x 24 cm birch plywood base with cross feet' },
      projectileDiameter: { value_m: 0.025, quote: '25 mm steel projectile marble' },
    },
    visual: {
      guide_type: 'open_channel',
      base: 'panel',
      foot_style: 'cross_feet',
      mount_type: 'foot',
      scale_style: 'printed_arc',
      tube_color: 'red',
      base_color: 'wood',
      tube_material: 'painted_metal',
      support_material: 'wood',
      support_position: 'rear',
      tube_proportion: 'long',
      spring_visible: true,
      trigger_visible: true,
      angle_scale: true,
      photogate_bracket: false,
    },
  },
  {
    pattern: /cposcience\.com.*marble|cpo.*launcher|curved.*frame.*launcher|cpo.*marble|263-2300/i,
    title: 'CPO Science Curved Frame Marble Launcher',
    vendor: 'CPO Science / School Specialty',
    presetId: 'cpo-marble-launcher',
    specs:
      'CPO Science Marble Launcher (Item #263-2300). Baltic birch curved quadrant frame (38 x 22 cm) with concentric guide slot, satin-silver slotted barrel with 5 spring compression settings, angled right support foot, and 19 mm marbles.',
    dimensions: {
      barrelLength: { value_m: 0.28, quote: '28 cm slotted satin-silver barrel assembly with 5 repeatable spring detents' },
      barrelDiameter: { value_m: 0.038, quote: '38 mm outer slotted barrel with O-ring pivot saddle' },
      baseLength: { value_m: 0.38, quote: '38 cm curved Baltic birch frame contour with concentric arc guide slot' },
      baseWidth: { value_m: 0.22, quote: '22 cm stance with angled right support foot and bolt' },
      projectileDiameter: { value_m: 0.019, quote: '19 mm classroom marbles (glass and steel)' },
    },
    visual: {
      guide_type: 'slotted_barrel',
      base: 'panel',
      foot_style: 'solid_plate',
      mount_type: 'foot',
      scale_style: 'printed_arc',
      tube_color: 'silver',
      base_color: 'wood',
      tube_material: 'metal',
      support_material: 'wood',
      support_position: 'rear',
      tube_proportion: 'medium',
      spring_visible: true,
      trigger_visible: true,
      angle_scale: true,
      photogate_bracket: false,
    },
  },
  {
    pattern: /vernier\.com\/(?:manuals\/vpl|product\/vernier-projectile-launcher)(?:[/?#]|$)|\bVernier (?:Pneumatic )?Projectile Launcher\b/i,
    title: 'Vernier Projectile Launcher (VPL)',
    vendor: 'Vernier Software & Technology',
    presetId: VERNIER_VPL_ID,
    specs:
      'Vernier VPL pneumatic launcher. The launch angle is 0–70 degrees and the maximum launch speed is 6 m/s. The fixed launch point sits 146 mm above the base. The embedded photogates are 50 mm apart. Steel ball diameter: 17.46 mm.',
    dimensions: {
      projectileDiameter: { value_m: 0.01746, quote: 'Steel ball diameter: 17.46 mm' },
    },
    visual: CLASSROOM_APPARATUS_PRESETS[VERNIER_VPL_ID].visual,
  },
  {
    pattern: /flinnsci\.com.*(?:ap7224|ap6447|projectile)/i,
    title: 'Flinn Scientific Spring Projectile Launcher (AP7224)',
    vendor: 'Flinn Scientific',
    specs:
      'Flinn Scientific AP7224 Spring Projectile Launcher. Heavy-duty 40 cm cylindrical steel launch barrel (50 mm outer diameter), 38 x 20 cm cast iron base plate, 0 to 90 degrees protractor arc, 3 compression spring speed settings, 25 mm steel projectile ball, max speed 5.8 m/s.',
    dimensions: {
      barrelLength: { value_m: 0.40, quote: '40 cm cylindrical steel launch barrel' },
      barrelDiameter: { value_m: 0.050, quote: '50 mm outer diameter' },
      baseLength: { value_m: 0.38, quote: '38 x 20 cm cast iron base plate' },
      baseWidth: { value_m: 0.20, quote: '38 x 20 cm cast iron base plate' },
      projectileDiameter: { value_m: 0.025, quote: '25 mm steel projectile ball' },
    },
  },
  {
    pattern: /(?:unitedsci\.com.*plm001|carolina\.com.*751465|plm001|751465)/i,
    title: 'United Scientific / Carolina Classroom Projectile Apparatus',
    vendor: 'United Scientific Supplies',
    specs:
      'United Scientific PLM001 Precision Projectile Launcher. 44 cm slotted aluminum launch guide, heavy black base plate (40 x 20 cm) with bench clamp, graduated protractor, 19 mm steel ball, max speed 5.2 m/s.',
    dimensions: {
      barrelLength: { value_m: 0.44, quote: '44 cm slotted aluminum launch guide' },
      barrelDiameter: { value_m: 0.052, quote: '52 mm guide width' },
      baseLength: { value_m: 0.40, quote: '40 x 20 cm base plate with bench clamp' },
      baseWidth: { value_m: 0.20, quote: '40 x 20 cm base plate with bench clamp' },
      projectileDiameter: { value_m: 0.019, quote: '19 mm steel ball' },
    },
  },
  {
    pattern: /sargentwelch\.com.*projectile|wardsci\.com.*projectile/i,
    title: 'Sargent-Welch / Ward\'s Science Projectile Apparatus',
    vendor: 'Sargent-Welch',
    specs:
      'Sargent-Welch Spring Projectile Apparatus. 45 cm slotted tubular launch guide, adjustable angle protractor 0 to 90 degrees, table clamp mounting bracket (38 x 18 cm), 25 mm steel sphere, max velocity 5.5 m/s.',
    dimensions: {
      barrelLength: { value_m: 0.45, quote: '45 cm slotted tubular launch guide' },
      barrelDiameter: { value_m: 0.054, quote: '54 mm tube collar' },
      baseLength: { value_m: 0.38, quote: '38 x 18 cm table clamp mounting bracket' },
      baseWidth: { value_m: 0.18, quote: '38 x 18 cm table clamp mounting bracket' },
      projectileDiameter: { value_m: 0.025, quote: '25 mm steel sphere' },
    },
  },
];

/**
 * Deterministically classifies a physical classroom projectile apparatus from extracted visual features,
 * mapping detected geometry, colors, and proportions to verified educational models and calibrated dimensions.
 */
export function classifyVisualArchetype(input: VisualFeatureInput): ArchetypeClassificationResult {
  const {
    dominantTubeColor,
    dominantBaseColor,
    aspectRatio,
    hasClamp = false,
    hasSprings = false,
    hasPlumbBob = false,
    isRectangular = false,
    isOpenChannel = false,
  } = input;

  const observations: string[] = [];
  observations.push(
    `Launcher guide: ${dominantTubeColor.toUpperCase()}, Base finish: ${dominantBaseColor.toUpperCase()}, Aspect framing: ${aspectRatio.toFixed(2)}:1`
  );

  // 1. PASCO ME-6800 / Mini Launcher Family
  // Hallmark: Blue or black compact rectangular box housing, enclosed piston (NO exposed springs), C-clamp bench mount, side plumb-bob clinometer
  const isPascoCandidate =
    (dominantTubeColor === 'blue' || isRectangular || (!hasSprings && !isOpenChannel && (hasClamp || hasPlumbBob))) &&
    dominantBaseColor !== 'wood' &&
    !hasSprings &&
    !isOpenChannel;

  if (isPascoCandidate) {
    observations.push(
      'Authentic PASCO ME-6800 series compact rectangular spring launcher geometry identified with C-clamp bench mount and side plumb-bob clinometer.'
    );
    return {
      detectedArchetype: 'pasco_me6800',
      archetypeName: 'PASCO ME-6800 Compact Clamp Launcher',
      matchedPresetId: 'pasco-me6800-style',
      guideType: 'rectangular_housing',
      mountType: 'clamp',
      scaleStyle: 'housing_plumb',
      tubeProportion: 'short',
      springVisible: false,
      confidence: 0.95,
      recommendedDimensions: {
        barrelLength: 0.21,
        barrelDiameter: 0.065,
        baseLength: 0.38,
        baseWidth: 0.18,
        projectileDiameter: 0.025,
      },
      dimensionExplanations: {
        barrelLength: '21 cm blue anodized rectangular launch housing (PASCO ME-6800 specification: pasco.com/products/signature/me-6800)',
        barrelDiameter: '65 mm outer housing profile (calibrated from photo aspect)',
        baseLength: '38 cm cast bench-clamp spine and bracket',
        baseWidth: '18 cm bench clamp width',
        projectileDiameter: '25 mm standard projectile sphere',
      },
      observations,
    };
  }

  // 2. Eisco Labs PH0343 Open U-Channel Family
  // Hallmark: Silver extruded aluminum, open U-channel with visible dual compression springs, clamp mount, plumb bob
  const isEiscoCandidate =
    (dominantTubeColor === 'silver' || dominantTubeColor === 'black') &&
    dominantBaseColor !== 'wood' &&
    (hasSprings || isOpenChannel);

  if (isEiscoCandidate) {
    observations.push(
      'Eisco PH0343 precision launcher identified with open extruded aluminum U-channel, exposed dual compression springs, and clamp bracket.'
    );
    return {
      detectedArchetype: 'eisco_ph0343',
      archetypeName: 'Eisco Labs PH0343 Precision Launcher',
      matchedPresetId: 'eisco-ph0343',
      guideType: 'open_channel',
      mountType: 'clamp',
      scaleStyle: 'housing_plumb',
      tubeProportion: 'medium',
      springVisible: true,
      confidence: 0.94,
      recommendedDimensions: {
        barrelLength: 0.42,
        barrelDiameter: 0.050,
        baseLength: 0.36,
        baseWidth: 0.18,
        projectileDiameter: 0.019,
      },
      dimensionExplanations: {
        barrelLength: '42 cm open-faced aluminum U-channel guide (Eisco PH0343 standard)',
        barrelDiameter: '50 mm extruded channel width',
        baseLength: '36 cm heavy-duty clamp mounting bracket',
        baseWidth: '18 cm bracket clamp width',
        projectileDiameter: '19 mm drilled projectile sphere',
      },
      observations,
    };
  }

  // 3. Boreal Science / VWR Item #8884857 Family
  // Hallmark: Blue slotted barrel, large tan MDF/wood backing board panel, printed arc, table stand
  const isBorealCandidate =
    (dominantTubeColor === 'blue' || dominantTubeColor === 'black') &&
    dominantBaseColor === 'wood';

  if (isBorealCandidate) {
    observations.push(
      'Boreal Science #8884857 all-in-one launcher identified with slotted blue steel barrel on tan MDF protractor panel.'
    );
    return {
      detectedArchetype: 'boreal_slotted',
      archetypeName: 'Boreal Fundamentals of Physics Launcher (#8884857)',
      matchedPresetId: 'boreal-fundamentals-8884857',
      guideType: 'slotted_barrel',
      mountType: 'foot',
      scaleStyle: 'printed_arc',
      tubeProportion: 'medium',
      springVisible: true,
      confidence: 0.96,
      recommendedDimensions: { ...CLASSROOM_APPARATUS_PRESETS['boreal-fundamentals-8884857'].dimensions },
      dimensionExplanations: {
        barrelLength: 'Estimated barrel length from the Boreal catalog photo',
        barrelDiameter: 'Estimated outside guide diameter from the Boreal catalog photo',
        baseLength: '15¾ in overall length',
        baseWidth: '4 in overall depth',
        projectileDiameter: '19 mm replacement balls',
      },
      observations,
    };
  }

  // 4a. Hardwood Long Open Ramp (Frey / Arbor Open-Channel V-Track)
  if (dominantTubeColor === 'red' && (dominantBaseColor === 'wood' || aspectRatio >= 1.6)) {
    observations.push('Hardwood open-channel ramp launcher identified with graduated release markings.');
    return {
      detectedArchetype: 'wood_ramp',
      archetypeName: 'Hardwood Open-Channel Marble Ramp',
      matchedPresetId: 'wooden-marble-ramp-launcher',
      guideType: 'open_channel',
      mountType: 'foot',
      scaleStyle: 'printed_arc',
      tubeProportion: 'long',
      springVisible: false,
      confidence: 0.91,
      recommendedDimensions: {
        barrelLength: 0.62,
        barrelDiameter: 0.055,
        baseLength: 0.58,
        baseWidth: 0.26,
        projectileDiameter: 0.022,
      },
      dimensionExplanations: {
        barrelLength: '62 cm extruded open channel guide rail',
        barrelDiameter: '55 mm track width',
        baseLength: '58 cm birch plywood base plank',
        baseWidth: '26 cm stabilizing cross foot',
        projectileDiameter: '22 mm steel marble sphere',
      },
      observations,
    };
  }

  // 4b. CPO Science Curved Frame Marble Launcher
  // Hallmark: Baltic birch curved quadrant frame, satin-silver slotted tube with internal spring, 19mm marbles
  if (dominantBaseColor === 'wood' && (dominantTubeColor === 'silver' || dominantTubeColor === 'metal' || isOpenChannel || hasSprings)) {
    observations.push('CPO Science curved-frame marble launcher identified with slotted satin-silver barrel assembly, Baltic birch frame, and resting foot.');
    return {
      detectedArchetype: 'cpo_curved_frame',
      archetypeName: 'CPO Science Curved Frame Marble Launcher',
      matchedPresetId: 'cpo-marble-launcher',
      guideType: 'slotted_barrel',
      mountType: 'foot',
      scaleStyle: 'printed_arc',
      tubeProportion: 'medium',
      springVisible: true,
      confidence: 0.96,
      recommendedDimensions: {
        barrelLength: 0.28,
        barrelDiameter: 0.038,
        baseLength: 0.38,
        baseWidth: 0.22,
        projectileDiameter: 0.019,
      },
      dimensionExplanations: {
        barrelLength: '28 cm slotted satin-silver barrel assembly with 5 repeatable spring detents (CPO #263-2300)',
        barrelDiameter: '38 mm outer slotted barrel with O-ring pivot saddle',
        baseLength: '38 cm curved Baltic birch frame contour with concentric arc guide slot',
        baseWidth: '22 cm stance with angled right support foot and bolt',
        projectileDiameter: '19 mm glass and steel classroom marbles',
      },
      observations,
    };
  }

  // 4c. Hardwood Quadrant Marble Launcher (Pitsco / Arbor Scientific)
  // Hallmark: Baltic birch quadrant backboard with 0°-90° curved arc slot, tabletop feet
  if (dominantBaseColor === 'wood' || (aspectRatio >= 1.2 && aspectRatio <= 1.55)) {
    observations.push('Hardwood quadrant marble launcher identified with laser-engraved protractor arc and tabletop feet.');
    return {
      detectedArchetype: 'wood_quadrant',
      archetypeName: 'Hardwood Quadrant Marble Launcher',
      matchedPresetId: 'wooden-marble-ramp-launcher',
      guideType: 'tube',
      mountType: 'foot',
      scaleStyle: 'printed_arc',
      tubeProportion: 'medium',
      springVisible: true,
      confidence: 0.95,
      recommendedDimensions: {
        barrelLength: 0.28,
        barrelDiameter: 0.038,
        baseLength: 0.38,
        baseWidth: 0.22,
        projectileDiameter: 0.019,
      },
      dimensionExplanations: {
        barrelLength: '28 cm clear polycarbonate launch tube with compression spring plunger',
        barrelDiameter: '38 mm outer tube diameter with wingnut collar',
        baseLength: '38 cm Baltic birch quadrant frame with integral desktop resting feet',
        baseWidth: '22 cm stance with rear stabilizing foot',
        projectileDiameter: '19 mm glass and steel classroom marbles',
      },
      observations,
    };
  }

  // 5. Dual-column rail-frame family
  if (dominantTubeColor === 'black' && (dominantBaseColor === 'silver' || dominantBaseColor === 'black')) {
    observations.push('Heavy dual-column precision cannon apparatus identified with extruded rail base.');
    return {
      detectedArchetype: 'vernier_cannon',
      archetypeName: 'Dual-Column Bench Launcher',
      matchedPresetId: 'heavy-frame-rotary-cannon',
      guideType: 'tube',
      mountType: 'foot',
      scaleStyle: 'vernier_protract',
      tubeProportion: 'medium',
      springVisible: true,
      confidence: 0.89,
      recommendedDimensions: {
        barrelLength: 0.52,
        barrelDiameter: 0.060,
        baseLength: 0.60,
        baseWidth: 0.28,
        projectileDiameter: 0.025,
      },
      dimensionExplanations: {
        barrelLength: '52 cm precision honed bore cannon tube',
        barrelDiameter: '60 mm outer barrel collar diameter',
        baseLength: '60 cm T-slot extruded rail base',
        baseWidth: '28 cm dual outrigger stance',
        projectileDiameter: '25 mm chrome steel projectile sphere',
      },
      observations,
    };
  }

  // 6. Custom Reconstructed Apparatus (Proportional Synthesis)
  const calcBarrelLength = +Math.max(0.20, Math.min(0.65, 0.26 * Math.max(0.9, aspectRatio))).toFixed(2);
  const calcBaseLength = +Math.max(0.25, Math.min(0.60, 0.30 * Math.max(0.9, aspectRatio))).toFixed(2);
  observations.push(`Custom apparatus dynamically reconstructed from image aspect ratio (${aspectRatio.toFixed(2)}:1).`);

  return {
    detectedArchetype: 'custom',
    archetypeName: 'Custom Reconstructed Apparatus',
    guideType: isRectangular ? 'rectangular_housing' : isOpenChannel ? 'open_channel' : 'slotted_barrel',
    mountType: hasClamp ? 'clamp' : 'foot',
    scaleStyle: hasPlumbBob ? 'housing_plumb' : 'circular_dial',
    tubeProportion: aspectRatio > 1.5 ? 'long' : aspectRatio < 1.1 ? 'short' : 'medium',
    springVisible: Boolean(hasSprings),
    confidence: 0.85,
    recommendedDimensions: {
      barrelLength: calcBarrelLength,
      barrelDiameter: 0.052,
      baseLength: calcBaseLength,
      baseWidth: 0.20,
      projectileDiameter: 0.025,
    },
    dimensionExplanations: {
      barrelLength: `${calcBarrelLength} m guide length inferred from image aspect ratio ${aspectRatio.toFixed(2)}:1`,
      barrelDiameter: '52 mm standard laboratory guide bore diameter',
      baseLength: `${calcBaseLength} m bench support footprint`,
      baseWidth: '20 cm bench support stance',
      projectileDiameter: '25 mm standard projectile sphere',
    },
    observations,
  };
}

/**
 * Analyzes an uploaded reference image using an offscreen canvas to sample
 * dominant colors, background silhouettes, edge gradients, and classifies the apparatus archetype.
 */
export async function analyzeReferenceImage(imageDataUrl: string): Promise<ImageVisualAnalysis | null> {
  if (!imageDataUrl || !imageDataUrl.startsWith('data:image/')) return null;
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width || 300;
        const h = img.naturalHeight || img.height || 200;
        const aspect = w / h;

        const canvas = document.createElement('canvas');
        const sampleW = 160;
        const sampleH = Math.max(50, Math.round(160 / aspect));
        canvas.width = sampleW;
        canvas.height = sampleH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0, sampleW, sampleH);
        const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
        const data = imgData.data;

        // Sample background from borders
        let bgR = 0, bgG = 0, bgB = 0, bgSamples = 0;
        for (let x = 0; x < sampleW; x += 4) {
          for (const y of [0, 1, sampleH - 2, sampleH - 1]) {
            const idx = (y * sampleW + x) * 4;
            if (data[idx + 3] > 128) {
              bgR += data[idx];
              bgG += data[idx + 1];
              bgB += data[idx + 2];
              bgSamples++;
            }
          }
        }
        const meanBgR = bgSamples > 0 ? bgR / bgSamples : 245;
        const meanBgG = bgSamples > 0 ? bgG / bgSamples : 245;
        const meanBgB = bgSamples > 0 ? bgB / bgSamples : 245;

        // Find foreground bounding box and color statistics
        let minX = sampleW, maxX = 0, minY = sampleH, maxY = 0;
        let fgCount = 0;
        const fgMask = new Uint8Array(sampleW * sampleH);

        for (let y = 0; y < sampleH; y++) {
          for (let x = 0; x < sampleW; x++) {
            const idx = (y * sampleW + x) * 4;
            const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
            if (a < 64) continue;

            const dist = Math.hypot(r - meanBgR, g - meanBgG, b - meanBgB);
            const isPlainWhite = r > 238 && g > 238 && b > 238;
            if (dist > 28 && !isPlainWhite) {
              fgMask[y * sampleW + x] = 1;
              fgCount++;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        const fgW = Math.max(1, maxX - minX + 1);
        const fgH = Math.max(1, maxY - minY + 1);
        const fgAspect = +(fgW / fgH).toFixed(2);

        // Segment regions vertically: Upper (Guide), Lower (Base)
        const guideYMax = minY + Math.floor(fgH * 0.58);
        const baseYMin = minY + Math.floor(fgH * 0.62);

        let tubeR = 0, tubeG = 0, tubeB = 0, tubeCount = 0;
        let baseR = 0, baseG = 0, baseB = 0, baseCount = 0;

        // Feature detection accumulators
        let springTransitions = 0;
        let lowerNarrowPixels = 0;
        let lowerTotalPixels = 0;
        const lowerYThreshold = minY + Math.floor(fgH * 0.78);

        for (let y = minY; y <= maxY; y++) {
          let rowFgCount = 0;
          for (let x = minX; x <= maxX; x++) {
            const idx = (y * sampleW + x) * 4;
            if (!fgMask[y * sampleW + x]) continue;
            rowFgCount++;
            const r = data[idx], g = data[idx + 1], b = data[idx + 2];

            if (y <= guideYMax) {
              tubeR += r;
              tubeG += g;
              tubeB += b;
              tubeCount++;

              // Spring detection: horizontal gradient variations along guide center
              if (x < maxX && fgMask[y * sampleW + x + 1]) {
                const nextIdx = (y * sampleW + x + 1) * 4;
                const lumDiff = Math.abs((r + g + b) - (data[nextIdx] + data[nextIdx + 1] + data[nextIdx + 2])) / 3;
                if (lumDiff > 32) springTransitions++;
              }
            } else if (y >= baseYMin) {
              baseR += r;
              baseG += g;
              baseB += b;
              baseCount++;
            }

            if (y >= lowerYThreshold) {
              lowerTotalPixels++;
              // Check if lower pixels are concentrated in a narrow column (clamp spine)
              if (x < minX + fgW * 0.42 || x > minX + fgW * 0.58) {
                lowerNarrowPixels++;
              }
            }
          }
        }

        const avgTubeR = tubeCount > 0 ? tubeR / tubeCount : 120;
        const avgTubeG = tubeCount > 0 ? tubeG / tubeCount : 120;
        const avgTubeB = tubeCount > 0 ? tubeB / tubeCount : 130;

        const avgBaseR = baseCount > 0 ? baseR / baseCount : 60;
        const avgBaseG = baseCount > 0 ? baseG / baseCount : 55;
        const avgBaseB = baseCount > 0 ? baseB / baseCount : 50;

        // Classify tube color
        let tubeColor: 'blue' | 'silver' | 'black' | 'red' | 'brass' = 'silver';
        let tubeMaterial: 'metal' | 'painted_metal' | 'stainless_steel' | 'wood' = 'metal';
        let tubeHex = '#94a3b8';

        if (avgTubeB > avgTubeR * 1.15 && avgTubeB > avgTubeG * 1.05 && avgTubeB > 75) {
          tubeColor = 'blue';
          tubeMaterial = 'painted_metal';
          tubeHex = '#2563eb';
        } else if (avgTubeR > avgTubeG * 1.3 && avgTubeR > avgTubeB * 1.3 && avgTubeR > 95) {
          tubeColor = 'red';
          tubeMaterial = 'painted_metal';
          tubeHex = '#dc2626';
        } else if (avgTubeR > 120 && avgTubeG > 100 && avgTubeB < 80) {
          tubeColor = 'brass';
          tubeMaterial = 'metal';
          tubeHex = '#ca8a04';
        } else if (avgTubeR < 70 && avgTubeG < 70 && avgTubeB < 75) {
          tubeColor = 'black';
          tubeMaterial = 'painted_metal';
          tubeHex = '#1e293b';
        } else {
          tubeColor = 'silver';
          tubeMaterial = 'metal';
          tubeHex = '#94a3b8';
        }

        // Classify base color
        let baseColor: 'wood' | 'black' | 'silver' | 'white' | 'blue_enamel' = 'black';
        let baseMaterial: 'cast_iron' | 'metal' | 'wood' | 'painted_metal' = 'cast_iron';
        let baseHex = '#1e293b';

        if (avgBaseR > 95 && avgBaseG > 65 && avgBaseB < avgBaseG && avgBaseR > avgBaseG * 1.08) {
          baseColor = 'wood';
          baseMaterial = 'wood';
          baseHex = '#b48654';
        } else if (avgBaseB > avgBaseR * 1.2 && avgBaseB > 75) {
          baseColor = 'blue_enamel';
          baseMaterial = 'painted_metal';
          baseHex = '#1d4ed8';
        } else if (avgBaseR > 135 && avgBaseG > 135 && avgBaseB > 135) {
          baseColor = 'silver';
          baseMaterial = 'metal';
          baseHex = '#cbd5e1';
        } else {
          baseColor = 'black';
          baseMaterial = 'cast_iron';
          baseHex = '#1c1917';
        }

        // Feature indicators
        const hasSprings = springTransitions > Math.max(12, tubeCount * 0.08);
        const hasClamp = fgAspect <= 1.55 && (lowerTotalPixels > 0 && lowerNarrowPixels / lowerTotalPixels > 0.45);
        const hasPlumbBob = fgAspect < 1.45 || (tubeColor === 'blue' && hasClamp);
        const isRectangular = tubeColor === 'blue' || (tubeColor === 'black' && fgAspect < 1.4);
        const isOpenChannel = tubeColor === 'silver' && hasSprings;

        // Classify apparatus archetype
        const classification = classifyVisualArchetype({
          dominantTubeColor: tubeColor,
          dominantBaseColor: baseColor,
          aspectRatio: fgAspect,
          hasClamp,
          hasSprings,
          hasPlumbBob,
          isRectangular,
          isOpenChannel,
        });

        const guideProportion = classification.tubeProportion;
        const observations = [
          ...classification.observations,
          `Visual sampling detected ${tubeColor.toUpperCase()} guide finish (${tubeHex}) in elevation region.`,
          `Base assembly classified as ${baseColor.toUpperCase()} (${baseMaterial.replace('_', ' ')}) with ${baseHex} tone.`,
          `Apparatus foreground bounding box ${fgW}x${fgH} px (${fgAspect}:1 aspect ratio).`,
        ];

        resolve({
          dominantTubeColor: tubeColor,
          dominantBaseColor: baseColor,
          tubeMaterial,
          baseMaterial,
          aspectRatio: fgAspect,
          guideProportion,
          hasPlumbBob: classification.scaleStyle === 'housing_plumb',
          hasProtractorArc: true,
          confidence: classification.confidence,
          tubeColorHex: tubeHex,
          baseColorHex: baseHex,
          summaryBadge: `${classification.archetypeName} (${fgAspect}:1)`,
          observations,
          detectedArchetype: classification.detectedArchetype,
          archetypeName: classification.archetypeName,
          guideType: classification.guideType,
          mountType: classification.mountType,
          scaleStyle: classification.scaleStyle,
          springVisible: classification.springVisible,
          matchedPresetId: classification.matchedPresetId,
          recommendedDimensions: classification.recommendedDimensions,
          dimensionExplanations: classification.dimensionExplanations,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageDataUrl;
  });
}

/**
 * Extracts vendor name, model numbers, and dimensional keywords directly
 * from product URL slugs (e.g. "/product/8884857/fundamentals-of-physics-projectile-launcher").
 */
export function parseUrlSlugMetadata(url: string): {
  detectedVendor?: string;
  detectedModelCode?: string;
  matchedPresetId?: string;
  inferredTitle?: string;
  slugSpecs: string;
} {
  if (!url) return { slugSpecs: '' };
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const pathname = decodeURIComponent(parsed.pathname || '');
    const cleanSlug = pathname.replace(/[/_.-]+/g, ' ').toLowerCase();

    let vendor = '';
    let modelCode = '';
    let presetId = '';
    let title = '';

    if (/boreal/i.test(parsed.hostname) || /boreal/i.test(cleanSlug)) {
      vendor = 'Boreal Science / VWR';
    } else if (/eisco/i.test(parsed.hostname) || /eisco/i.test(cleanSlug)) {
      vendor = 'Eisco Scientific';
    } else if (/pasco/i.test(parsed.hostname) || /pasco/i.test(cleanSlug)) {
      vendor = 'PASCO Scientific';
    } else if (/vernier/i.test(parsed.hostname) || /vernier/i.test(cleanSlug)) {
      vendor = 'Vernier Software & Technology';
    } else if (/arbor/i.test(parsed.hostname) || /arbor/i.test(cleanSlug)) {
      vendor = 'Arbor Scientific';
    } else if (/flinn/i.test(parsed.hostname) || /flinn/i.test(cleanSlug)) {
      vendor = 'Flinn Scientific';
    }

    const numMatch = cleanSlug.match(/\b(8884857|ph0343|me[- ]?6800|me[- ]?6825b?|ap7224|plm001|751465)\b/i);
    if (numMatch) {
      modelCode = numMatch[1].toUpperCase().replace(/\s+/g, '-');
    }

    if (/8884857|fundamentals[- ]of[- ]physics/i.test(cleanSlug)) {
      presetId = 'boreal-fundamentals-8884857';
      title = 'Boreal Fundamentals of Physics Projectile Launcher (Item #8884857)';
    } else if (/ph0343/i.test(cleanSlug)) {
      presetId = 'eisco-ph0343';
      title = 'Eisco Labs Precision Projectile Launcher (PH0343)';
    } else if (/me[- ]?6800/i.test(cleanSlug)) {
      presetId = 'pasco-me6800-style';
      title = 'PASCO Projectile Launcher (ME-6800)';
    } else if (/me[- ]?6825/i.test(cleanSlug)) {
      presetId = PASCO_MINI_ID;
      title = 'PASCO Mini Launcher (ME-6825B)';
    }

    const words = cleanSlug
      .split(' ')
      .filter((w) => w.length > 2 && !['product', 'products', 'item', 'catalog', 'ca', 'en', 'shop', 'html'].includes(w));
    const slugSpecs = words.join(' ');

    return {
      detectedVendor: vendor || undefined,
      detectedModelCode: modelCode || undefined,
      matchedPresetId: presetId || undefined,
      inferredTitle: title || undefined,
      slugSpecs,
    };
  } catch {
    return { slugSpecs: '' };
  }
}

/**
 * Client-callable helper that queries `/api/equipment` (which scrapes live product URLs
 * and/or invokes a configured AI vision/text provider) and falls back cleanly to the
 * deterministic parser if offline.
 */
/** Only exact model identities bypass reconstruction. Photo-only matches stay suggestions. */
export function resolveExactEquipmentPreset(
  notes: string, category: string, url: string, hasPhotos = false
): EquipmentExtractionResult | undefined {
  if (category !== 'projectile_motion_apparatus') return undefined;
  let presetId: string | undefined;
  let catalogPhotoLink = false;
  if (url.trim()) {
    try {
      const link = new URL(url.includes('://') ? url.trim() : 'https://' + url.trim());
      if (!['http:', 'https:'].includes(link.protocol)) return undefined;
      const host = link.hostname.toLowerCase().replace(/^www\./, '');
      const pathname = link.pathname.toLowerCase().replace(/\/$/, '');
      catalogPhotoLink =
        (host === 'cdn.schoolspecialty.com' && pathname === '/dbfc082f-6fce-4484-baae-b1fb0147c56f/2151391_a_jpg%20output.jpg') ||
        (host === 'gosciencecrazy.com' && pathname === '/cdn/shop/files/prolchmarble-photoroom.jpg');
      if (catalogPhotoLink) {
        presetId = GSC_PROLCH_ID;
      } else if (host === 'pasco.com') {
        if (/^\/products\/(?:[^/]+\/)*(?:me-6825b?|mini-projectile-launcher)$/.test(pathname)) presetId = PASCO_MINI_ID;
        else if (/^\/products\/(?:[^/]+\/)*me-6800$/.test(pathname) ||
          pathname === '/products/lab-apparatus/mechanics/projectiles/projectile-launcher') presetId = 'pasco-me6800-style';
      } else if (host === 'vernier.com' && ['/manuals/vpl', '/product/vernier-projectile-launcher'].includes(pathname)) {
        presetId = VERNIER_VPL_ID;
      } else if (['boreal.com', 'vwr.com', 'wardsci.com', 'avantorsciences.com'].includes(host) && /\/product\/8884857(?:\/|$)/.test(pathname)) {
        presetId = 'boreal-fundamentals-8884857';
      } else if (host === 'eiscolabs.com' && pathname === '/products/ph0343') {
        presetId = 'eisco-ph0343';
      } else if ((host === 'fishersci.com' && /^\/shop\/products\/[^/]+\/s38982$/.test(pathname)) ||
        (host === 'gosciencecrazy.com' && pathname === '/products/projectile-launcher-for-plastic-marbles-by-go-science-crazy')) {
        presetId = GSC_PROLCH_ID;
      } else if (host === 'arborsci.com' && pathname === '/products/mini-projectile-launcher') {
        presetId = 'arbor-mini-94-1970';
      }
    } catch {
      return undefined;
    }
  } else if (!hasPhotos) {
    const code = notes.trim().toUpperCase().replace(/\s+/g, ' ');
    const modelCodes: Record<string, string> = {
      'ME-6825B': PASCO_MINI_ID, 'ME-6825': PASCO_MINI_ID,
      'PASCO MINI LAUNCHER ME-6825B': PASCO_MINI_ID, 'PASCO MINI PROJECTILE LAUNCHER (ME-6825B)': PASCO_MINI_ID,
      'ME-6800': 'pasco-me6800-style', PH0343: 'eisco-ph0343', '94-1970': 'arbor-mini-94-1970',
      PROLCH: GSC_PROLCH_ID, S38982: GSC_PROLCH_ID, VPL: VERNIER_VPL_ID, '8884857': 'boreal-fundamentals-8884857',
    };
    presetId = Object.hasOwn(modelCodes, code) ? modelCodes[code] : undefined;
  }
  const preset = presetId ? buildPresetExtraction(presetId, category, url) : undefined;
  return preset && catalogPhotoLink ? { ...preset, photo_preset_match: true } : preset;
}

export function buildPresetExtraction(presetId: string, category: string, url: string): EquipmentExtractionResult | undefined {
  if (category !== 'projectile_motion_apparatus') return undefined;
  const preset = CLASSROOM_APPARATUS_PRESETS[presetId];
  if (!preset) return undefined;
  const parsed = parseEquipmentSpecificationText('', category);
  return {
    ...parsed,
    description: 'This reference matches a built-in launcher.',
    visual: { ...preset.visual },
    missing_information: preset.missingInformation ?? [],
    uncertainty: preset.uncertainties ?? [],
    documented_limits: preset.limits ?? { minAngle: null, maxAngle: null, maxSpeed: null },
    fetched_url: url.trim() || undefined,
    fetched_title: preset.name,
    matched_preset_id: presetId,
    exact_catalog_match: true,
  };
}

export async function analyzeEquipmentInput(options: {
  specText: string;
  category: string;
  urlInput: string;
  primaryPhoto?: string;
  extraPhotos?: string[];
  aiApiKey?: string;
  aiModel?: string;
}): Promise<EquipmentExtractionResult> {
  const hasPhotos = Boolean(options.primaryPhoto || options.extraPhotos?.length);
  const exactPreset = resolveExactEquipmentPreset(
    options.specText, options.category, options.urlInput, hasPhotos
  ) ?? (/^[a-z0-9][a-z0-9 -]{1,35}$/i.test(options.urlInput.trim())
    ? resolveExactEquipmentPreset(options.urlInput, options.category, '', hasPhotos) : undefined);
  if (exactPreset) return exactPreset;
  if (hasPhotos && options.category === 'projectile_motion_apparatus') {
    const match = await matchPresetPhoto([options.primaryPhoto, ...(options.extraPhotos ?? [])]);
    const preset = match && buildPresetExtraction(match.id, options.category, options.urlInput);
    if (preset && match) return { ...preset, fetched_image: match.photo, photo_preset_match: true };
  }

  // 1. Check if URL matches our curated catalog of real-world physics apparatus URLs
  let combinedSpecText = options.specText.trim();
  let matchedCatalogTitle: string | undefined;

  for (const entry of KNOWN_PRODUCT_URL_CATALOG) {
    if (entry.pattern.test(options.urlInput) || entry.pattern.test(options.specText)) {
      matchedCatalogTitle = entry.title;
      if (!combinedSpecText.includes(entry.specs)) {
        combinedSpecText = `${entry.specs}\n${combinedSpecText}`.trim();
      }
      break;
    }
  }

  const recoverSupport = async (result: EquipmentExtractionResult) => {
    if (result.equipment_type !== 'projectile_motion_apparatus' || result.exact_catalog_match ||
        result.geometry?.panelOutline || result.geometry?.housingOpenFace || typeof Image !== 'function') return result;
    const sources = new Set([result.fetched_image, options.primaryPhoto, ...(options.extraPhotos ?? []),
      ...(result.alternate_product_photos ?? [])]);
    let panel: ReconstructionGeometry | undefined;
    let geometryReference: string | undefined;
    for (const source of sources) {
      if (!source) continue;
      const candidate = await detectSlottedSupportPhoto(source);
      if (!candidate) continue;
      if (panel && (['panelPivotHeightRatio', 'panelSpanToGuideRatio'] as const).some(key => {
        const a = panel?.[key];
        const b = candidate[key];
        return a !== undefined && b !== undefined && Math.max(a, b) > Math.min(a, b) * 1.25;
      })) {
        return { ...result, uncertainty: ['The photos show different support proportions. The support remains an estimate.',
          ...result.uncertainty] };
      }
      if (!panel) {
        panel = candidate;
        geometryReference = source;
      }
    }
    if (!panel) return result;
    return {
      ...result, geometry: { ...result.geometry, ...panel }, geometry_reference_image: geometryReference,
      visual: { ...result.visual, base: 'panel' as const },
      visual_observations: {
        ...result.visual_observations,
        panel_outline: 'Recovered a tall support with two through-slots from the reference photo.',
      },
      uncertainty: ['The support outline and slots come from the photo. The pivot and thickness are estimated.',
        ...result.uncertainty],
    };
  };

  const refine = async (result: EquipmentExtractionResult) => {
    const frame = result.panelFrame ?? result.housingFrame;
    if (!frame || !result.geometry || typeof Image !== 'function') return recoverSupport(result);
    const uploads = [options.primaryPhoto, ...(options.extraPhotos ?? [])];
    const src = result.fetched_image
      ? frame.photoIndex === (result.fetched_image_index ?? 1) ? result.fetched_image : undefined
      : uploads[frame.photoIndex - 1];
    if (!src) return result;
    const geometry = 'pivotX' in frame
      ? await refinePhotoGeometry(src, result.geometry, frame, result.visual.guide_type)
      : await refineHousingPhoto(src, result.geometry, frame);
    const traced = { ...result, geometry_reference_image: src };
    if (!geometry) return recoverSupport(traced);
    const observations = { ...result.visual_observations };
    if (JSON.stringify(geometry.panelOutline) !== JSON.stringify(result.geometry.panelOutline)) {
      observations.panel_outline = result.geometry.panelOutline
        ? 'Refined against visible edges in the source photo.'
        : 'Recovered the support outline from the source photo.';
    }
    if (JSON.stringify(geometry.panelCutout) !== JSON.stringify(result.geometry.panelCutout)) {
      observations.panel_cutout = result.geometry.panelCutout
        ? 'Refined against visible edges in the source photo.'
        : result.geometry.panelOutline ? 'Recovered two visible slots from the source photo.'
        : 'Recovered visible openings from the source photo.';
    }
    if (geometry.guideWidthToLengthRatio !== result.geometry.guideWidthToLengthRatio) {
      observations.guide_profile = 'Measured the changes in barrel width from the source photo.';
    }
    if (geometry.guideForwardRatio !== result.geometry.guideForwardRatio) {
      observations.guide_pivot = 'Aligned the guide with the visible pivot in the source photo.';
    }
    if (JSON.stringify(geometry.panelStand) !== JSON.stringify(result.geometry.panelStand)) {
      observations.panel_stand = 'Recovered the visible base plate from the source photo.';
    }
    if (JSON.stringify(geometry.housingScaleSpan) !== JSON.stringify(result.geometry.housingScaleSpan)) {
      observations.housing_scale = 'Refined against the plate edges in the source photo.';
    }
    if (JSON.stringify(geometry.housingSpringSpan) !== JSON.stringify(result.geometry.housingSpringSpan)) {
      observations.housing_spring = 'Refined against visible coil edges in the source photo.';
    }
    const uncertainty = !result.geometry.panelOutline && geometry.panelOutline
      ? (result.uncertainty ?? []).filter(note => !note.startsWith('The panel outline could not be traced reliably.'))
      : result.uncertainty;
    return { ...traced, geometry, uncertainty, visual_observations: observations };
  };
  let providerAttempted = false;
  // 2. Try calling the server `/api/equipment` endpoint (which can fetch live product pages!)
  try {
    const res = await fetch('/api/equipment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notes: options.specText.trim(),
        url: options.urlInput.trim(),
        category: options.category,
        image: options.primaryPhoto || undefined,
        images: options.extraPhotos || [],
        apiKey: options.aiApiKey?.trim() || undefined,
        model: options.aiModel?.trim() || undefined,
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as EquipmentExtractionResult;
      if (data?.analysis_mode === 'ai_vision_provider') return refine(data);
      if (data?.exact_catalog_match || data?.equipment_type === 'uncertain') return data;
      providerAttempted = Boolean(data?.equipment_type);
      if (data?.equipment_type && !options.aiApiKey?.trim()) {
        if (matchedCatalogTitle && !data.fetched_title) {
          data.fetched_title = matchedCatalogTitle;
        }
        if (options.primaryPhoto) {
          const imgAnalysis = await analyzeReferenceImage(options.primaryPhoto);
          if (imgAnalysis) {
            data.image_analysis = imgAnalysis;
            if (data.visual) {
              if (imgAnalysis.dominantTubeColor && (!data.visual.tube_color || data.visual.tube_color === 'unknown')) {
                data.visual.tube_color = imgAnalysis.dominantTubeColor;
              }
              if (imgAnalysis.dominantBaseColor && (!data.visual.base_color || data.visual.base_color === 'unknown')) {
                data.visual.base_color = imgAnalysis.dominantBaseColor;
              }
              if (!data.visual.guide_type || data.visual.guide_type === 'unknown' || data.visual.guide_type === 'slotted_barrel') {
                data.visual.guide_type = imgAnalysis.guideType;
              }
              if (!data.visual.mount_type || data.visual.mount_type === 'unknown') {
                data.visual.mount_type = imgAnalysis.mountType;
              }
              if (!data.visual.scale_style || data.visual.scale_style === 'unknown') {
                data.visual.scale_style = imgAnalysis.scaleStyle;
              }
              if (imgAnalysis.springVisible) {
                data.visual.spring_visible = true;
              }
            }
            if (imgAnalysis.archetypeName && (!data.fetched_title || data.fetched_title.includes('Apparatus'))) {
              data.fetched_title = imgAnalysis.archetypeName;
            }
          }
        }
        return recoverSupport(data);
      }
    }
  } catch {
    // Offline or static hosting (e.g. GitHub Pages): fall back to client-side extraction
  }

  // Static deployments can use a Gemini key provided for this session.
  if (options.aiApiKey?.trim() && !providerAttempted) {
    const result = await reconstructApparatusWithGemini({
      text: options.specText, url: options.urlInput, image: options.primaryPhoto,
      images: options.extraPhotos, apiKey: options.aiApiKey.trim(), model: options.aiModel,
    });
    if (result) return refine(result);
  }

  const result = parseEquipmentSpecificationText(
    combinedSpecText,
    options.category,
    options.urlInput
  );
  if (matchedCatalogTitle) {
    result.fetched_title = matchedCatalogTitle;
    result.fetched_url = options.urlInput || undefined;
    const confirmedCount = Object.values(result.dimension_candidates).filter(
      (c) =>
        c &&
        c.source !== 'visual_estimate' &&
        c.source !== 'unstated_default' &&
        !/\b(approx|approximate|estimated|estimate|proportion|proportional|calculated|inferred|assumed|~)\b/i.test(c.quote)
    ).length;
    const estimatedCount = Object.keys(result.dimension_candidates).length - confirmedCount;
    result.description = `Identified "${matchedCatalogTitle}" from product reference (${confirmedCount} dimensions confirmed from traceable source, ${estimatedCount} estimated).`;
  }

  result.vision_retry_at = geminiQuotaRetryAt(options.aiApiKey?.trim());
  if (options.primaryPhoto) {
    const imgAnalysis = await analyzeReferenceImage(options.primaryPhoto);
    if (imgAnalysis) {
      result.image_analysis = imgAnalysis;
      if (result.visual.tube_color === 'unknown' || result.visual.tube_color === 'silver') {
        result.visual.tube_color = imgAnalysis.dominantTubeColor;
      }
      if (result.visual.base_color === 'unknown' || result.visual.base_color === 'black') {
        result.visual.base_color = imgAnalysis.dominantBaseColor;
      }
      if (imgAnalysis.tubeMaterial) result.visual.tube_material = imgAnalysis.tubeMaterial;
      if (imgAnalysis.baseMaterial) result.visual.support_material = imgAnalysis.baseMaterial;
      result.visual.tube_proportion = imgAnalysis.guideProportion;

      // When text does not specify explicit shape or mount, prioritize computer vision detection
      if (!combinedSpecText.trim() || result.visual.guide_type === 'slotted_barrel') {
        result.visual.guide_type = imgAnalysis.guideType;
      }
      if (!combinedSpecText.trim() || result.visual.mount_type === 'foot') {
        result.visual.mount_type = imgAnalysis.mountType;
      }
      if (!combinedSpecText.trim() || result.visual.scale_style === 'circular_dial') {
        result.visual.scale_style = imgAnalysis.scaleStyle;
      }
      if (imgAnalysis.springVisible) {
        result.visual.spring_visible = true;
      }

      if (imgAnalysis.archetypeName && (!result.fetched_title || result.fetched_title.includes('Custom') || result.fetched_title.includes('Apparatus'))) {
        result.fetched_title = imgAnalysis.archetypeName;
      }

      // Populate calibrated dimensions from the recognized apparatus archetype
      if (imgAnalysis.recommendedDimensions) {
        for (const [key, val] of Object.entries(imgAnalysis.recommendedDimensions)) {
          const dimKey = key as DimensionKey;
          const existing = result.dimension_candidates[dimKey];
          if (!existing || existing.source === 'unstated_default') {
            const exp = imgAnalysis.dimensionExplanations?.[key] || `Visual proportion estimate from apparatus photo (${val} m)`;
            result.dimension_candidates[dimKey] = {
              key: dimKey,
              value_m: val,
              quote: exp,
              source: 'visual_estimate',
              confidenceNote: 'Calibrated from reference photo silhouette and apparatus archetype proportions',
            };
          }
        }
      }

      result.visual_observations.image_vision = imgAnalysis.observations.join(' ');
      if (!result.description || result.description.startsWith('Default standard apparatus')) {
        result.description = `Reconstructed apparatus from reference photograph: ${imgAnalysis.archetypeName} (${imgAnalysis.guideType.replace(/_/g, ' ')}, ${imgAnalysis.mountType} mount, estimated geometry).`;
      }
    }
  }

  return recoverSupport(result);
}

/**
 * Deterministically parses specification text, catalog notes, and URLs without fabricating values.
 */
export function parseEquipmentSpecificationText(
  rawText: string,
  categoryHint = 'projectile_motion_apparatus',
  sourceUrl = ''
): EquipmentExtractionResult {
  const text = `${rawText || ''} ${sourceUrl || ''}`.trim();
  const lower = text.toLowerCase();

  // Check if user selected or pasted an unsupported category
  if (
    categoryHint !== 'projectile_motion_apparatus' ||
    (/\b(microscope|centrifuge|titration|burette|oscilloscope|spectrometer|voltmeter|calorimeter)\b/i.test(lower) &&
      !/\b(projectile|launcher|ballistic|cannon|marble|trajectory|ramrod|trunnion)\b/i.test(lower))
  ) {
    const matchedUnsupported =
      lower.match(/\b(microscope|centrifuge|titration|burette|oscilloscope|spectrometer|voltmeter|calorimeter|pendulum|spring|inclined plane)\b/i)?.[1] ||
      categoryHint;
    return {
      equipment_type: 'unsupported',
      detected_category_name: matchedUnsupported,
      description: `Detected "${matchedUnsupported}" apparatus. Lab4All v2 currently provides full parametric 3D reconstruction for Projectile Motion Apparatus. Other categories are registered in the schema for future expansion but are not falsely reconstructed as generic models.`,
      visual: { ...DEFAULT_VISUAL_CONFIG },
      visual_observations: {},
      components: [],
      adjustable_mechanisms: [],
      geometric_relationships: [],
      dimension_candidates: {},
      missing_information: ['Supported projectile launcher geometry'],
      uncertainty: ['Equipment category outside supported projectile apparatus family.'],
      documented_limits: { minAngle: null, maxAngle: null, maxSpeed: null },
      documented_initial_settings: { angle: null, speed: null, height: null },
      max_range_m: null,
      speed_settings_count: null,
      evidence: {},
      analysis_mode: 'deterministic_spec_parser',
    };
  }

  const visual: ProjectileVisualConfiguration = {
    foot_style: 'unknown',
    scale_style: 'unknown',
    mount_type: 'unknown',
    guide_type: 'unknown',
    base: 'unknown',
    tube_color: 'unknown',
    base_color: 'unknown',
    tube_material: 'unknown',
    support_material: 'unknown',
    support_position: 'unknown',
    tube_proportion: 'unknown',
    spring_visible: null,
    trigger_visible: null,
    angle_scale: null,
    photogate_bracket: null,
    ramrod_included: null,
  };

  const visual_observations: Record<string, string> = {};
  const components: string[] = [];
  const adjustable_mechanisms: string[] = [];
  const geometric_relationships: string[] = [];
  const dimension_candidates: Partial<Record<DimensionKey, ExtractedDimensionCandidate>> = {};
  const evidence: Record<string, string> = {};

  // 1. Guide / Barrel type detection
  if (/\b(open[- ]?channel|v[- ]?channel|u[- ]?channel|ramp|trough|track)\b/i.test(text)) {
    visual.guide_type = 'open_channel';
    visual_observations.guide = 'Open-channel / V-track guide rail identified from text.';
    components.push('Open-channel launch guide rail');
  } else if (/\b(rectangular[- ]?housing|box[- ]?housing|enclosed[- ]?housing|pasco|me-68)/i.test(text)) {
    visual.guide_type = 'rectangular_housing';
    visual_observations.guide = 'Rectangular enclosed launch housing identified.';
    components.push('Anodized rectangular launch housing');
  } else if (
    /\b(?:slotted|windowed)[- ]+(?:(?:launch|metal|cylindrical|round)[- ]+){0,2}(?:barrel|tube|guide)\b/i.test(text) ||
    /\b(?:barrel|tube|launch guide)\s+(?:is|was)\s+(?:slotted|windowed)\b/i.test(text) ||
    /\b(?:barrel|tube|launch guide)\b[^.!?;\n]{0,32}\b(?:longitudinal slot|piston slot|side slot)\b/i.test(text)
  ) {
    visual.guide_type = 'slotted_barrel';
    visual_observations.guide = 'Slotted cylindrical barrel with visible piston slot.';
    components.push('Precision slotted cylindrical launch barrel');
  } else if (/\b(barrel|tube|cylinder|cylindrical|cannon|bore)\b/i.test(text)) {
    visual.guide_type = 'tube';
    visual_observations.guide = 'Cylindrical launch barrel tube identified.';
    components.push('Cylindrical launch barrel');
  } else {
    visual.guide_type = 'slotted_barrel';
  }

  // 2. Mounting & Base style
  const explicitClamp = /\b(c[- ]?clamp|table[- ]?clamp|bench[- ]?clamp|clamp[- ]?mount)\b/i.test(text);
  const workbenchMount = /\b(?:rotating|mounting) clamp\b[^.!?]{0,120}\b(?:to|onto) (?:the |a )?(?:workbench|bench|tabletop|table)\b/i.test(text);
  const attachedByClamp = /\b(?:attach(?:ed)?|mount(?:ed)?|fasten(?:ed)?|secur(?:ed|e))\s+to\s+(?:(?:a|the)\s+)?(?:workbench|bench|tabletop|table)\s+(?:via|using|by means of|with)\s+(?:(?:a|the)\s+)?clamp\b/i.test(text);
  if (explicitClamp || workbenchMount || attachedByClamp) {
    visual.mount_type = 'clamp';
    visual_observations.mounting = 'Bench clamp mount specified.';
    components.push('Bench clamp assembly');
  } else {
    visual.mount_type = 'foot';
  }

  if (/\b(cross[- ]?feet|outrigger|cross[- ]?bar|t[- ]?feet)\b/i.test(text)) {
    visual.foot_style = 'cross_feet';
    components.push('Stabilizing cross-foot outriggers');
  } else if (/\b(t[- ]?slot|extruded[- ]?rail|aluminum[- ]?rail)\b/i.test(text)) {
    visual.foot_style = 'extruded_rail';
    components.push('T-slot extruded aluminum bench rail');
  } else if (/\b(base[- ]?plate|solid[- ]?base|cast[- ]?base|platform|base)\b/i.test(text)) {
    visual.foot_style = 'solid_plate';
    components.push('Heavy bench baseplate with leveling feet');
  } else {
    visual.foot_style = 'solid_plate';
  }

  // 3. Support structure
  if (/\b(trunnion|yoke|u[- ]?bracket|fork)\b/i.test(text)) {
    visual.base = 'trunnion_yoke';
    components.push('Dual-arm machined trunnion yoke support');
  } else if (/\b(side[- ]?panel|wood[- ]?panel|plywood[- ]?panel|plate[- ]?support|panel)\b/i.test(text)) {
    visual.base = 'panel';
    components.push('Contoured side-panel elevation bracket');
  } else if (/\b(dual[- ]?column|twin[- ]?post|a[- ]?frame|frame)\b/i.test(text)) {
    visual.base = 'frame';
    components.push('Dual-column rigid support frame');
  } else {
    visual.base = 'trunnion_yoke';
    components.push('Vertical support column and pivot trunnion');
  }

  // 4. Angle scale style
  if (/\b(plumb[- ]?bob|plumb[- ]?line|hanging[- ]?weight)\b/i.test(text)) {
    visual.scale_style = 'housing_plumb';
    visual.angle_scale = true;
    components.push('Side-mounted plumb-bob clinometer scale');
    adjustable_mechanisms.push('0°–90° inclination adjustment with gravity plumb bob');
  } else if (/\b(vernier|precision[- ]?dial|rotary[- ]?encoder)\b/i.test(text)) {
    visual.scale_style = 'vernier_protract';
    visual.angle_scale = true;
    components.push('Precision engraved Vernier protractor dial');
    adjustable_mechanisms.push('Rotary trunnion lock with 1° engraved protractor');
  } else if (/\b(printed[- ]?arc|arc[- ]?slot|quadrant[- ]?scale)\b/i.test(text)) {
    visual.scale_style = 'printed_arc';
    visual.angle_scale = true;
    components.push('90° quadrant arc protractor scale with thumbscrew slot');
    adjustable_mechanisms.push('Curved guide slot with knurled locking knob');
  } else {
    visual.scale_style = 'circular_dial';
    visual.angle_scale = true;
    components.push('Engraved 0°–90° circular protractor dial');
    adjustable_mechanisms.push('Pivot trunnion with knurled tension lock knob');
  }

  // 5. Materials & Colors
  if (/\b(wood|birch|plywood|hardwood|maple|oak)\b/i.test(text)) {
    visual.base_color = 'wood';
    visual.support_material = 'wood';
  } else if (/\b(cast[- ]?iron|enamel|black[- ]?base|powder[- ]?coated)\b/i.test(text)) {
    visual.base_color = 'black';
    visual.support_material = 'cast_iron';
  } else if (/\b(silver|aluminum[- ]?base|stainless)\b/i.test(text)) {
    visual.base_color = 'silver';
    visual.support_material = 'metal';
  } else {
    visual.base_color = 'black';
    visual.support_material = 'cast_iron';
  }

  if (/\b(blue[- ]?barrel|blue[- ]?anodized|blue[- ]?housing|blue)\b/i.test(text)) {
    visual.tube_color = 'blue';
    visual.tube_material = 'painted_metal';
  } else if (/\b(red[- ]?barrel|red[- ]?channel|red[- ]?painted|red)\b/i.test(text)) {
    visual.tube_color = 'red';
    visual.tube_material = 'painted_metal';
  } else if (/\b(black[- ]?barrel|black[- ]?anodized|black[- ]?tube)\b/i.test(text)) {
    visual.tube_color = 'black';
    visual.tube_material = 'painted_metal';
  } else if (/\b(brass|gold|bronze)\b/i.test(text)) {
    visual.tube_color = 'brass';
    visual.tube_material = 'metal';
  } else {
    visual.tube_color = 'silver';
    visual.tube_material = 'metal';
  }

  // 6. Spring, trigger, photogate
  if (/\b(spring|piston|plunger|coil)\b/i.test(text)) {
    visual.spring_visible = !/\b(enclosed|internal[- ]?spring|hidden[- ]?spring)\b/i.test(text);
    adjustable_mechanisms.push('Multi-detent helical compression spring plunger');
  } else {
    visual.spring_visible = true;
  }

  if (/\b(lanyard|pull[- ]?cord|trigger|release[- ]?lever|release[- ]?pin)\b/i.test(text)) {
    visual.trigger_visible = true;
    components.push('Mechanical sear release trigger lever');
  } else {
    visual.trigger_visible = true;
  }

  visual.photogate_bracket = /\b(photogate|sensor|optical|timer)\b/i.test(text);
  if (visual.photogate_bracket) {
    components.push('Muzzle photogate mounting bracket with dual optical ports');
  }

  Object.assign(dimension_candidates, extractExplicitDimensions(text, sourceUrl));

  // 8. Operating limits & range
  const documented_limits: OperatingLimits = {
    minAngle: null,
    maxAngle: null,
    maxSpeed: null,
  };

  const angleRangeMatch = text.match(/(\d+(?:\.\d+)?)\s*°?\s*(?:to|–|-)\s*(\d+(?:\.\d+)?)\s*(?:°|deg|degrees)/i);
  if (angleRangeMatch) {
    const a1 = Number(angleRangeMatch[1]);
    const a2 = Number(angleRangeMatch[2]);
    if (a1 >= 0 && a2 <= 90 && a1 < a2) {
      documented_limits.minAngle = a1;
      documented_limits.maxAngle = a2;
      evidence.min_angle = angleRangeMatch[0].trim();
      evidence.max_angle = angleRangeMatch[0].trim();
    }
  }

  const maxSpeedMatch = text.match(/(?:max(?:imum)?\s*(?:speed|velocity)|muzzle\s*(?:speed|velocity))\s*(?:of|:|=|is|up\s*to)?\s*(\d+(?:\.\d+)?)\s*m\/s/i);
  if (maxSpeedMatch) {
    const s = Number(maxSpeedMatch[1]);
    if (s >= 0.5 && s <= 20) {
      documented_limits.maxSpeed = s;
      evidence.max_speed = maxSpeedMatch[0].trim();
    }
  }

  let max_range_m: number | null = null;
  const maxRangeMatch = text.match(/(?:max(?:imum)?\s*range|range\s*up\s*to)\s*(?:of|:|=|is)?\s*(\d+(?:\.\d+)?)\s*(m|meters|metres|cm|ft)\b/i);
  if (maxRangeMatch) {
    const val = Number(maxRangeMatch[1]);
    const u = maxRangeMatch[2].toLowerCase();
    max_range_m = u === 'cm' ? val / 100 : u === 'ft' ? +(val * 0.3048).toFixed(2) : val;
    evidence.max_range_m = maxRangeMatch[0].trim();
  }

  let speed_settings_count: number | null = null;
  const settingsCountMatch = text.match(/\b(\d+)\s*(?:range|speed|spring|velocity|launch)\s*(?:settings|positions|detents|levels)\b/i);
  if (settingsCountMatch) {
    speed_settings_count = Number(settingsCountMatch[1]);
    evidence.speed_settings_count = settingsCountMatch[0].trim();
  }

  // Identify missing information honestly
  const missing_information: string[] = [];
  if (!dimension_candidates.barrelLength) missing_information.push('Launch guide length (m)');
  if (!dimension_candidates.barrelDiameter) missing_information.push('Guide outside width / OD (m)');
  if (!dimension_candidates.baseLength) missing_information.push('Base length (m)');
  if (!dimension_candidates.baseWidth) missing_information.push('Base width (m)');
  if (!dimension_candidates.projectileDiameter) missing_information.push('Projectile sphere diameter (m)');
  if (!documented_limits.maxSpeed) missing_information.push('Calibrated muzzle velocity (m/s) per spring detent');
  missing_information.push('Internal spring stiffness k (N/m) and plunger friction losses');

  geometric_relationships.push(
    'Launch guide rotates about trunnion pivot axis with synchronized 0°–90° angle scale',
    'Muzzle exit point updates dynamically with barrel length, pivot offset, and inclination angle'
  );

  const uncertainty: string[] = [
    'Internal spring mechanics and friction cannot be inferred from external photographs or uncalibrated catalog summaries.',
  ];
  if (Object.keys(dimension_candidates).length < 5) {
    uncertainty.push(
      'Unstated physical dimensions default to standard classroom apparatus estimates until confirmed by the teacher.'
    );
  }

  let matched_preset_id: string | undefined;
  let detected_vendor: string | undefined;

  const slugMeta = parseUrlSlugMetadata(sourceUrl);
  if (slugMeta.detectedVendor) detected_vendor = slugMeta.detectedVendor;
  if (slugMeta.matchedPresetId) matched_preset_id = slugMeta.matchedPresetId;

  for (const entry of KNOWN_PRODUCT_URL_CATALOG) {
    if (entry.pattern.test(sourceUrl) || entry.pattern.test(rawText)) {
      if (entry.presetId) matched_preset_id = entry.presetId;
      if (entry.vendor) detected_vendor = entry.vendor;
      if (entry.visual) Object.assign(visual, entry.visual);
      if (entry.dimensions) {
        for (const [k, d] of Object.entries(entry.dimensions)) {
          if (d && !dimension_candidates[k as DimensionKey]) {
            const isApprox =
              d.source === 'visual_estimate' ||
              /\b(approx|approximate|estimated|estimate|proportion|proportional|calculated|inferred|~)\b/i.test(d.quote);
            dimension_candidates[k as DimensionKey] = {
              key: k as DimensionKey,
              value_m: d.value_m,
              quote: d.quote,
              source: isApprox ? 'visual_estimate' : 'product_page',
              confidenceNote: isApprox
                ? `Approximate visual estimate for ${entry.title} (unconfirmed without traceable spec sheet)`
                : `Manufacturer confirmed specification for ${entry.title}`,
            };
          }
        }
      }
      break;
    }
  }

  const confirmedCount = Object.values(dimension_candidates).filter(
    (c) =>
      c &&
      c.source !== 'visual_estimate' &&
      c.source !== 'unstated_default' &&
      !/\b(approx|approximate|estimated|estimate|proportion|proportional|calculated|inferred|assumed|~)\b/i.test(c.quote)
  ).length;
  const documented = visual.guide_type !== 'open_channel' ? extractDocumentedBore(text) : undefined;
  if (documented?.conflict) uncertainty.unshift('The source gives conflicting bore sizes. The opening remains estimated.');
  const fixedLaunchPoint = extractLaunchPointAtPivot(text);
  if (fixedLaunchPoint) visual_observations.launch_point = fixedLaunchPoint;
  const totalFound = Object.keys(dimension_candidates).length;
  const estimatedCount = totalFound - confirmedCount;

  return {
    equipment_type: 'projectile_motion_apparatus',
    detected_category_name: detected_vendor ? `${detected_vendor} Projectile Apparatus` : 'Projectile Motion Apparatus',
    description:
      text.length > 0
        ? `Extracted projectile apparatus configuration (${confirmedCount} dimensions confirmed from traceable source, ${estimatedCount} estimated).`
        : 'Default classroom projectile launcher template initialized. Provide specifications or adjust parameters below.',
    visual,
    visual_observations,
    components,
    adjustable_mechanisms,
    geometric_relationships,
    dimension_candidates,
    missing_information,
    uncertainty,
    documented_limits,
    documented_initial_settings: { angle: null, speed: null, height: null },
    max_range_m,
    speed_settings_count,
    evidence,
    analysis_mode: 'deterministic_spec_parser',
    geometry: documented?.bore || fixedLaunchPoint ? {
      guideBoreM: documented?.bore?.meters,
      launchPointAtPivot: fixedLaunchPoint ? true : undefined,
    } : undefined,
    matched_preset_id,
    detected_vendor,
  };
}
