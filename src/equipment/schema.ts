/**
 * Lab4All — Extensible Equipment Schema, Presets & Component Registry
 *
 * Separates:
 * 1. Equipment category & recognition metadata
 * 2. Parametric visual assembly configuration
 * 3. Physical dimensions & provenance tracking (confirmed vs. estimated vs. missing)
 * 4. Operating bounds & kinematics synchronization
 */

import type { ProjectileMaterial } from '../physics/projectile.ts';

export type SupportedEquipmentCategory =
  | 'projectile_motion_apparatus'
  | 'pendulum_apparatus'
  | 'inclined_plane_track'
  | 'hookes_law_spring'
  | 'other';

export type DimensionProvenanceKind =
  | 'teacher_entered'
  | 'manufacturer_spec'
  | 'user_text'
  | 'product_page'
  | 'pdf_unverified'
  | 'visual_estimate';

export type DimensionVerificationStatus = 'confirmed' | 'estimated' | 'missing';

export interface DimensionSourceMetadata {
  kind: DimensionProvenanceKind;
  quote?: string;
  sourceUrl?: string;
  sourceStatus?: 'live' | 'cached' | null;
  confidenceNote?: string;
}

export interface ProjectileVisualConfiguration {
  foot_style: 'cross_feet' | 'solid_plate' | 'extruded_rail' | 'unknown';
  scale_style: 'printed_arc' | 'circular_dial' | 'housing_plumb' | 'vernier_protract' | 'unknown';
  mount_type: 'clamp' | 'foot' | 'bench_bolted' | 'unknown';
  guide_type: 'tube' | 'open_channel' | 'rectangular_housing' | 'slotted_barrel' | 'unknown';
  base: 'panel' | 'post' | 'frame' | 'trunnion_yoke' | 'unknown';
  tube_color: 'blue' | 'silver' | 'black' | 'red' | 'brass' | 'unknown';
  base_color: 'wood' | 'silver' | 'black' | 'white' | 'blue_enamel' | 'unknown';
  tube_material: 'metal' | 'painted_metal' | 'plastic' | 'wood' | 'stainless_steel' | 'unknown';
  support_material: 'metal' | 'painted_metal' | 'plastic' | 'wood' | 'cast_iron' | 'unknown';
  support_position: 'rear' | 'center' | 'front' | 'unknown';
  tube_proportion: 'short' | 'medium' | 'long' | 'unknown';
  spring_visible: boolean | null;
  trigger_visible: boolean | null;
  angle_scale: boolean | null;
  photogate_bracket?: boolean | null;
  ramrod_included?: boolean | null;
}

export interface ProjectileDimensions {
  /** Launch guide / barrel length in meters (0.10 to 1.50 m) */
  barrelLength: number;
  /** Guide outside diameter or width in meters (0.020 to 0.200 m) */
  barrelDiameter: number;
  /** Base length in meters (0.15 to 1.50 m) */
  baseLength: number;
  /** Base width in meters (0.08 to 0.80 m) */
  baseWidth: number;
  /** Projectile sphere diameter in meters (0.005 to 0.080 m) */
  projectileDiameter: number;
}

export type DimensionKey = keyof ProjectileDimensions;

export interface OperatingLimits {
  minAngle: number | null;
  maxAngle: number | null;
  maxSpeed: number | null;
}

type HousingSpan = { start: number; end: number };

export interface ReconstructionGeometry {
  guideBoreM?: number;
  guideColor?: string;
  supportColor?: string;
  panelOutline?: { x: number; y: number }[];
  panelPivotHeightRatio?: number;
  panelSpanToGuideRatio?: number;
  guideForwardRatio?: number;
  launchPointAtPivot?: true;
  panelCutout?: { x: number; y: number }[];
  panelExtraCutouts?: { x: number; y: number }[][];
  panelThicknessRatio?: number;
  panelStand?: { left: number; right: number; thickness: number; color: string };
  housingOpenFace?: true;
  housingSpringSpan?: HousingSpan;
  housingScaleSpan?: HousingSpan;
  barrelProfile?: { along: number; width: number }[];
  guideWidthToLengthRatio?: number;
  guideSleeves?: { start: number; end: number; width: number; height: number; color?: string }[];
}

export function validateReconstructionGeometry(input: unknown): ReconstructionGeometry | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as ReconstructionGeometry;
  const geometry: ReconstructionGeometry = {};
  if (raw.launchPointAtPivot === true) geometry.launchPointAtPivot = true;
  if (typeof raw.guideBoreM === 'number' && raw.guideBoreM >= .006 && raw.guideBoreM < .2) {
    geometry.guideBoreM = raw.guideBoreM;
  }
  for (const key of ['guideColor', 'supportColor'] as const) {
    const color = raw[key];
    if (typeof color === 'string' && /^#[a-f0-9]{6}$/i.test(color)) geometry[key] = color;
  }
  const outline = raw.panelOutline;
  if (Array.isArray(outline) && outline.length >= 3 && outline.length <= 16 &&
      outline.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
        p.x >= -0.5 && p.x <= 0.5 && p.y >= 0 && p.y <= 1.25)) {
    const points = outline.map(({ x, y }) => ({ x, y: y < 0.015 ? 0 : y }));
    let containsPivot = false;
    let hasFoot = false;
    let simple = true;
    let area = 0;
    type Point = typeof points[number];
    const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const edgesMeet = (a: Point, b: Point, c: Point, d: Point) => {
      const overlaps = (axis: 'x' | 'y') => Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis])) <=
        Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis]));
      return overlaps('x') && overlaps('y') && cross(a,b,c) * cross(a,b,d) <= 0 && cross(c,d,a) * cross(c,d,b) <= 0;
    };
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      area += a.x * b.y - b.x * a.y;
      if (Math.hypot(a.x - b.x, a.y - b.y) < 0.003) simple = false;
      if (a.y === 0 && b.y === 0 && Math.abs(a.x - b.x) >= 0.10) hasFoot = true;
      if ((a.y > 0.96) !== (b.y > 0.96) && a.x + (b.x - a.x) * (0.96 - a.y) / (b.y - a.y) > 0) {
        containsPivot = !containsPivot;
      }
      for (let j = i + 2; j < points.length; j++) {
        if (i === 0 && j === points.length - 1) continue;
        if (edgesMeet(a, b, points[j], points[(j + 1) % points.length])) simple = false;
      }
    }
    if (simple && containsPivot && hasFoot && Math.abs(area) > 0.12) {
      geometry.panelOutline = points;
      const forwardRatio = raw.guideForwardRatio;
      if (typeof forwardRatio === 'number' && forwardRatio >= .03 && forwardRatio <= .97) {
        geometry.guideForwardRatio = forwardRatio;
      }
      const stand = raw.panelStand;
      if (stand && [stand.left, stand.right, stand.thickness].every(Number.isFinite) &&
          stand.left >= -.95 && stand.right <= .95 && stand.right - stand.left >= .5 &&
          stand.thickness >= .02 && stand.thickness <= .18 &&
          typeof stand.color === 'string' && /^#[a-f0-9]{6}$/i.test(stand.color) &&
          points.filter(point => point.y <= .025).every(point => point.x >= stand.left - .008 && point.x <= stand.right + .008)) {
        geometry.panelStand = { left: stand.left, right: stand.right, thickness: stand.thickness, color: stand.color };
      }
      const thickness = raw.panelThicknessRatio;
      if (typeof thickness === 'number' && Number.isFinite(thickness) && thickness >= 0.015 && thickness <= 0.28) {
        geometry.panelThicknessRatio = thickness;
      }
      const contains = (polygon: Point[], point: Point) => polygon.reduce((inside, a, index) => {
        const b = polygon[(index + 1) % polygon.length];
        return (a.y > point.y) !== (b.y > point.y) &&
          a.x + (b.x - a.x) * (point.y - a.y) / (b.y - a.y) > point.x ? !inside : inside;
      }, false);
      const openings = [raw.panelCutout, ...(Array.isArray(raw.panelExtraCutouts) ? raw.panelExtraCutouts.slice(0, 3) : [])];
      const accepted: Point[][] = [];
      for (const hole of openings) {
        if (!Array.isArray(hole) || hole.length < 3 || hole.length > 24 ||
            !hole.every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y) && contains(points, point)) ||
            contains(hole, { x: 0, y: 1 }) ||
            accepted.some(other => contains(other, hole[0]) || contains(hole, other[0]))) continue;
        let valid = true;
        let holeArea = 0;
        for (let i = 0; i < hole.length; i++) {
          const a = hole[i];
          const b = hole[(i + 1) % hole.length];
          holeArea += a.x * b.y - b.x * a.y;
          if (Math.hypot(a.x - b.x, a.y - b.y) < 0.003 ||
              points.some((point, index) => edgesMeet(a, b, point, points[(index + 1) % points.length])) ||
              accepted.some(other => other.some((point, index) =>
                edgesMeet(a, b, point, other[(index + 1) % other.length])))) valid = false;
          for (let j = i + 2; j < hole.length; j++) {
            if (i === 0 && j === hole.length - 1) continue;
            if (edgesMeet(a, b, hole[j], hole[(j + 1) % hole.length])) valid = false;
          }
        }
        if (valid && Math.abs(holeArea) > 0.001) accepted.push(hole.map(({ x, y }) => ({ x, y })));
      }
      if (accepted.length) geometry.panelCutout = accepted[0];
      if (accepted.length > 1) geometry.panelExtraCutouts = accepted.slice(1);
      const ratio = raw.panelPivotHeightRatio;
      if (typeof ratio === 'number' && Number.isFinite(ratio) && ratio >= 0.2 && ratio <= 3.5) {
        geometry.panelPivotHeightRatio = ratio;
      }
      const spanRatio = raw.panelSpanToGuideRatio;
      if (typeof spanRatio === 'number' && Number.isFinite(spanRatio) && spanRatio >= 0.15 && spanRatio <= 2.5) {
        geometry.panelSpanToGuideRatio = spanRatio;
      }
    }
  }
  if (raw.housingOpenFace === true) {
    geometry.housingOpenFace = true;
    for (const key of ['housingSpringSpan', 'housingScaleSpan'] as const) {
      const span = raw[key];
      if (span && Number.isFinite(span.start) && Number.isFinite(span.end) &&
          span.start >= 0 && span.end <= 1 && span.end - span.start >= 0.06 &&
          span.end - span.start <= 0.8) {
        geometry[key] = { start: span.start, end: span.end };
      }
    }
  }
  const profile = raw.barrelProfile;
  if (Array.isArray(profile) && profile.length >= 2 && profile.length <= 14 &&
      profile.every((p, i) => p && Number.isFinite(p.along) && Number.isFinite(p.width) &&
        p.along >= 0 && p.along <= 1 && p.width >= 0.45 && p.width <= 1 &&
        (i === 0 || p.along - profile[i - 1].along >= 0.003)) &&
      profile[0].along === 0 && profile[profile.length - 1].along === 1 &&
      profile.some(p => p.width >= 0.99)) {
    geometry.barrelProfile = profile.map(({ along, width }) => ({ along, width }));
    const ratio = raw.guideWidthToLengthRatio;
    if (typeof ratio === 'number' && ratio >= .035 && ratio <= .3) geometry.guideWidthToLengthRatio = ratio;
  }
  const sleeves = raw.guideSleeves;
  if (!geometry.barrelProfile && Array.isArray(sleeves) && sleeves.length <= 6) {
    const valid = sleeves.filter(sleeve => sleeve && [sleeve.start, sleeve.end, sleeve.width, sleeve.height].every(Number.isFinite) &&
      sleeve.start >= 0 && sleeve.end <= 1 && sleeve.end - sleeve.start >= .008 && sleeve.end - sleeve.start <= .45 &&
      sleeve.width >= 1.1 && sleeve.width <= 3 && sleeve.height >= 1.1 && sleeve.height <= 3).sort((a, b) => a.start - b.start);
    const accepted: NonNullable<ReconstructionGeometry['guideSleeves']> = [];
    for (const sleeve of valid) {
      if (accepted.length && sleeve.start < accepted[accepted.length - 1].end) continue;
      accepted.push({ start: sleeve.start, end: sleeve.end, width: sleeve.width, height: sleeve.height,
        ...(typeof sleeve.color === 'string' && /^#[a-f0-9]{6}$/i.test(sleeve.color) ? { color: sleeve.color } : {}) });
    }
    if (accepted.length) geometry.guideSleeves = accepted;
  }
  return Object.keys(geometry).length ? geometry : undefined;
}

export interface ProjectileApparatusSpec {
  projectileMaterial?: ProjectileMaterial;
  reconstruction?: ReconstructionGeometry;
  id: string;
  name: string;
  manufacturerModel?: string;
  kind: 'projectile_motion_apparatus';
  visual: ProjectileVisualConfiguration;
  dimensions: ProjectileDimensions;
  dimensionStatus: Record<DimensionKey, DimensionVerificationStatus>;
  dimensionSources?: Partial<Record<DimensionKey, DimensionSourceMetadata>>;
  missingInformation?: string[];
  uncertainties?: string[];
  limits?: OperatingLimits | null;
}

export interface DimensionDefinition {
  key: DimensionKey;
  label: string;
  unit: 'm';
  min: number;
  max: number;
  step: number;
  description: string;
}

export const DIMENSION_DEFINITIONS: DimensionDefinition[] = [
  {
    key: 'barrelLength',
    label: 'Launch guide length',
    unit: 'm',
    min: 0.1,
    max: 1.5,
    step: 0.01,
    description: 'Total length of the launch barrel, channel, or housing from breech to muzzle.',
  },
  {
    key: 'barrelDiameter',
    label: 'Guide outside width',
    unit: 'm',
    min: 0.02,
    max: 0.2,
    step: 0.005,
    description: 'Outer diameter of cylindrical barrel or outer width of housing/channel.',
  },
  {
    key: 'baseLength',
    label: 'Base length',
    unit: 'm',
    min: 0.15,
    max: 1.5,
    step: 0.01,
    description: 'Fore-to-aft footprint length of the apparatus base plate or rail.',
  },
  {
    key: 'baseWidth',
    label: 'Base width',
    unit: 'm',
    min: 0.08,
    max: 0.8,
    step: 0.01,
    description: 'Lateral width across the apparatus base plate or stabilizing cross-feet.',
  },
  {
    key: 'projectileDiameter',
    label: 'Projectile diameter',
    unit: 'm',
    min: 0.005,
    max: 0.08,
    step: 0.001,
    description: 'Diameter of the spherical steel, brass, or polymer launch ball.',
  },
];

export const DEFAULT_DIMENSIONS: ProjectileDimensions = {
  barrelLength: 0.48,
  barrelDiameter: 0.065,
  baseLength: 0.52,
  baseWidth: 0.24,
  projectileDiameter: 0.025,
};

export const DEFAULT_VISUAL_CONFIG: ProjectileVisualConfiguration = {
  foot_style: 'solid_plate',
  scale_style: 'circular_dial',
  mount_type: 'foot',
  guide_type: 'slotted_barrel',
  base: 'trunnion_yoke',
  tube_color: 'silver',
  base_color: 'black',
  tube_material: 'metal',
  support_material: 'cast_iron',
  support_position: 'center',
  tube_proportion: 'medium',
  spring_visible: true,
  trigger_visible: true,
  angle_scale: true,
  photogate_bracket: true,
  ramrod_included: true,
};

/**
 * Curated Library of Classroom Apparatus Presets for instant testing & comparison.
 * Each preset produces a dramatically different 3D assembly, material palette, and geometry.
 */
export const VERNIER_VPL_ID = 'vernier-vpl';
export const VERNIER_VPL_LAUNCH_HEIGHT = 0.146;
export const VERNIER_VPL_GATE_SPACING = 0.05;

export const EISCO_PH0343_ID = 'eisco-ph0343';
const EISCO_MOUNT_HEIGHT = 0.325;
const EISCO_BALL_REACH = 0.044;

export const PASCO_MINI_ID = 'pasco-me-6825b';
const PASCO_MINI_PIVOT_HEIGHT = 0.205;

export const PASCO_ME6800_ID = 'pasco-me6800-style';
const PASCO_FIRING_HEIGHT = 0.30;

export const ARBOR_MINI_ID = 'arbor-mini-94-1970';
export const ARBOR_MINI_FORWARD_RATIO = 0.100 / 0.206;

export function arborMiniPivotHeight(angle: number, length: number): number {
  const rad = angle * Math.PI / 180;
  const reach = length * ARBOR_MINI_FORWARD_RATIO;
  const drop = Math.max((length - reach) * Math.sin(rad), -reach * Math.sin(rad));
  return Math.max(0.093, drop + 0.024 * Math.abs(Math.cos(rad)) + 0.009);
}

export const GSC_PROLCH_ID = 'gsc-prolch';

export const CLASSROOM_APPARATUS_PRESETS: Record<string, ProjectileApparatusSpec> = {
  'lab4all-precision-mk2': {
    id: 'lab4all-precision-mk2',
    name: 'Europa Precision Classroom Launcher (Default)',
    manufacturerModel: 'L4A-PM200 Brushed Aluminum / Cast Base',
    kind: 'projectile_motion_apparatus',
    visual: { ...DEFAULT_VISUAL_CONFIG },
    dimensions: { ...DEFAULT_DIMENSIONS },
    dimensionStatus: {
      barrelLength: 'confirmed',
      barrelDiameter: 'confirmed',
      baseLength: 'confirmed',
      baseWidth: 'confirmed',
      projectileDiameter: 'confirmed',
    },
    dimensionSources: {
      barrelLength: { kind: 'manufacturer_spec', quote: '480 mm machined anodized launch barrel' },
      barrelDiameter: { kind: 'manufacturer_spec', quote: '65 mm outer barrel collar diameter' },
      baseLength: { kind: 'manufacturer_spec', quote: '520 mm cast bench baseplate' },
      baseWidth: { kind: 'manufacturer_spec', quote: '240 mm base width with leveling feet' },
      projectileDiameter: { kind: 'manufacturer_spec', quote: '25.0 mm precision brass sphere' },
    },
    missingInformation: [],
    uncertainties: [],
    limits: { minAngle: 0, maxAngle: 90, maxSpeed: 6.0 },
  },
  [PASCO_ME6800_ID]: {
    id: PASCO_ME6800_ID,
    name: 'PASCO Short Range Projectile Launcher',
    manufacturerModel: 'ME-6800',
    kind: 'projectile_motion_apparatus',
    visual: {
      foot_style: 'solid_plate',
      scale_style: 'housing_plumb',
      mount_type: 'clamp',
      guide_type: 'rectangular_housing',
      base: 'post',
      tube_color: 'black',
      base_color: 'black',
      tube_material: 'painted_metal',
      support_material: 'cast_iron',
      support_position: 'front',
      tube_proportion: 'short',
      spring_visible: false,
      trigger_visible: true,
      angle_scale: true,
      photogate_bracket: false,
    },
    dimensions: {
      barrelLength: 0.21,
      barrelDiameter: 0.050,
      baseLength: 0.15,
      baseWidth: 0.145,
      projectileDiameter: 0.025,
    },
    dimensionStatus: {
      barrelLength: 'confirmed',
      barrelDiameter: 'estimated',
      baseLength: 'estimated',
      baseWidth: 'estimated',
      projectileDiameter: 'confirmed',
    },
    dimensionSources: {
      barrelLength: {
        kind: 'manufacturer_spec',
        quote: 'Launcher Length: 21 cm',
        sourceUrl: 'https://www.pasco.com/products/lab-apparatus/mechanics/projectiles/projectile-launcher',
      },
      barrelDiameter: { kind: 'visual_estimate', quote: 'Outer housing width estimated from the product photo' },
      baseLength: { kind: 'visual_estimate', quote: 'Mounting allowance for the cast base' },
      baseWidth: { kind: 'visual_estimate', quote: 'Cast base footprint estimated from the product photo' },
      projectileDiameter: {
        kind: 'manufacturer_spec',
        quote: '3× plastic balls, 25 mm',
        sourceUrl: 'https://cdn.pasco.com/product_document/Projectile-Launcher-ME-6800-Manual.pdf',
      },
    },
    missingInformation: ['Internal spring constant k (N/m)', 'Plunger mass (g)'],
    uncertainties: ['Outer housing width and cast base footprint are estimated from product photos.'],
    limits: { minAngle: 0, maxAngle: 90, maxSpeed: 5.5 },
  },
  'wooden-marble-ramp-launcher': {
    id: 'wooden-marble-ramp-launcher',
    name: 'Hardwood Quadrant Marble Launcher',
    manufacturerModel: 'Pitsco / Arbor Scientific Hardwood Marble Launcher',
    kind: 'projectile_motion_apparatus',
    visual: {
      foot_style: 'solid_plate',
      scale_style: 'printed_arc',
      mount_type: 'foot',
      guide_type: 'tube',
      base: 'panel',
      tube_color: 'clear',
      base_color: 'wood',
      tube_material: 'polycarbonate',
      support_material: 'wood',
      support_position: 'rear',
      tube_proportion: 'medium',
      spring_visible: true,
      trigger_visible: true,
      angle_scale: true,
      photogate_bracket: false,
    },
    dimensions: {
      barrelLength: 0.28,
      barrelDiameter: 0.038,
      baseLength: 0.38,
      baseWidth: 0.22,
      projectileDiameter: 0.019,
    },
    dimensionStatus: {
      barrelLength: 'confirmed',
      barrelDiameter: 'confirmed',
      baseLength: 'confirmed',
      baseWidth: 'confirmed',
      projectileDiameter: 'confirmed',
    },
    dimensionSources: {
      barrelLength: {
        kind: 'manufacturer_spec',
        quote: '28 cm clear polycarbonate launch tube with compression spring plunger',
        sourceUrl: 'https://www.arborsci.com',
      },
      barrelDiameter: {
        kind: 'manufacturer_spec',
        quote: '38 mm outer tube collar with brass locking wingnut',
      },
      baseLength: {
        kind: 'manufacturer_spec',
        quote: '38 cm laser-cut Baltic birch quadrant frame with integral desktop resting feet',
      },
      baseWidth: {
        kind: 'manufacturer_spec',
        quote: '22 cm stance with rear stabilizing foot',
      },
      projectileDiameter: {
        kind: 'manufacturer_spec',
        quote: '19 mm glass and steel classroom marbles',
      },
    },
    missingInformation: [],
    uncertainties: [],
    limits: { minAngle: 0, maxAngle: 90, maxSpeed: 4.8 },
  },
  'cpo-marble-launcher': {
    id: 'cpo-marble-launcher',
    name: 'CPO Science Curved Frame Marble Launcher',
    manufacturerModel: 'CPO Science Marble Launcher (Item #263-2300)',
    kind: 'projectile_motion_apparatus',
    visual: {
      foot_style: 'solid_plate',
      scale_style: 'printed_arc',
      mount_type: 'foot',
      guide_type: 'slotted_barrel',
      base: 'panel',
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
    dimensions: {
      barrelLength: 0.28,
      barrelDiameter: 0.038,
      baseLength: 0.38,
      baseWidth: 0.22,
      projectileDiameter: 0.019,
    },
    dimensionStatus: {
      barrelLength: 'confirmed',
      barrelDiameter: 'confirmed',
      baseLength: 'confirmed',
      baseWidth: 'confirmed',
      projectileDiameter: 'confirmed',
    },
    dimensionSources: {
      barrelLength: {
        kind: 'manufacturer_spec',
        quote: '28 cm slotted satin-silver barrel assembly with 5 repeatable spring detents',
        sourceUrl: 'https://cposcience.com',
      },
      barrelDiameter: {
        kind: 'manufacturer_spec',
        quote: '38 mm outer slotted barrel with O-ring pivot saddle',
      },
      baseLength: {
        kind: 'manufacturer_spec',
        quote: '38 cm curved Baltic birch frame contour with concentric arc guide slot',
      },
      baseWidth: {
        kind: 'manufacturer_spec',
        quote: '22 cm stance with angled right support foot and bolt',
      },
      projectileDiameter: {
        kind: 'manufacturer_spec',
        quote: '19 mm classroom marbles (glass and steel)',
      },
    },
    missingInformation: [],
    uncertainties: [],
    limits: { minAngle: 0, maxAngle: 90, maxSpeed: 6.2 },
  },
  'heavy-frame-rotary-cannon': {
    id: 'heavy-frame-rotary-cannon',
    name: 'Dual-Column Dial Bench Launcher',
    manufacturerModel: 'Europa Lab Dual-Trunnion Frame',
    kind: 'projectile_motion_apparatus',
    visual: {
      foot_style: 'extruded_rail',
      scale_style: 'vernier_protract',
      mount_type: 'foot',
      guide_type: 'tube',
      base: 'frame',
      tube_color: 'black',
      base_color: 'silver',
      tube_material: 'stainless_steel',
      support_material: 'metal',
      support_position: 'center',
      tube_proportion: 'medium',
      spring_visible: false,
      trigger_visible: false,
      angle_scale: true,
      photogate_bracket: false,
    },
    dimensions: {
      barrelLength: 0.52,
      barrelDiameter: 0.06,
      baseLength: 0.60,
      baseWidth: 0.28,
      projectileDiameter: 0.025,
    },
    dimensionStatus: {
      barrelLength: 'confirmed',
      barrelDiameter: 'confirmed',
      baseLength: 'confirmed',
      baseWidth: 'confirmed',
      projectileDiameter: 'confirmed',
    },
    dimensionSources: {
      barrelLength: { kind: 'manufacturer_spec', quote: '520 mm precision honed bore tube' },
      barrelDiameter: { kind: 'manufacturer_spec', quote: '60 mm OD anodized barrel' },
      baseLength: { kind: 'manufacturer_spec', quote: '600 mm T-slot extruded aluminum rail base' },
      baseWidth: { kind: 'manufacturer_spec', quote: '280 mm dual outrigger stance' },
      projectileDiameter: { kind: 'manufacturer_spec', quote: '25 mm chrome steel ball' },
    },
    missingInformation: ['Pneumatic/spring release pressure curve'],
    uncertainties: [],
    limits: { minAngle: 0, maxAngle: 90, maxSpeed: 6.0 },
  },
  'boreal-fundamentals-8884857': {
    id: 'boreal-fundamentals-8884857',
    name: 'Boreal Fundamentals of Physics Projectile Launcher',
    manufacturerModel: 'PRLN01',
    modelNumber: 'PRLN01',
    kind: 'projectile_motion_apparatus',
    visual: {
      foot_style: 'solid_plate',
      scale_style: 'printed_arc',
      mount_type: 'foot',
      guide_type: 'slotted_barrel',
      base: 'panel',
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
    dimensions: {
      barrelLength: 0.273, barrelDiameter: 0.0294, baseLength: 0.40005, baseWidth: 0.1016, projectileDiameter: 0.019,
    },
    dimensionStatus: {
      barrelLength: 'estimated', barrelDiameter: 'estimated', baseLength: 'confirmed', baseWidth: 'confirmed',
      projectileDiameter: 'confirmed',
    },
    dimensionSources: {
      barrelLength: { kind: 'visual_estimate', quote: 'Barrel length estimated from the supplier photo', sourceUrl: 'https://www.boreal.com/ca/en/product/8884857/fundamentals-of-physics-projectile-launcher' },
      barrelDiameter: { kind: 'visual_estimate', quote: 'Outside guide diameter estimated from the supplier photo', sourceUrl: 'https://www.boreal.com/ca/en/product/8884857/fundamentals-of-physics-projectile-launcher' },
      baseLength: { kind: 'manufacturer_spec', quote: '15¾ × 4 × 11¾ in (L × W × H)', sourceUrl: 'https://www.boreal.com/ca/en/product/8884857/fundamentals-of-physics-projectile-launcher' },
      baseWidth: { kind: 'manufacturer_spec', quote: '15¾ × 4 × 11¾ in (L × W × H)', sourceUrl: 'https://www.boreal.com/ca/en/product/8884857/fundamentals-of-physics-projectile-launcher' },
      projectileDiameter: { kind: 'manufacturer_spec', quote: 'Ø19 mm replacement balls', sourceUrl: 'https://www.boreal.com/ca/en/product/8884857/fundamentals-of-physics-projectile-launcher' },
    },
    uncertainties: ['The barrel, pivot, and slot dimensions are estimated from the catalog photograph.'],
    limits: { minAngle: 0, maxAngle: 90, maxSpeed: null },
  },
  [EISCO_PH0343_ID]: {
    id: EISCO_PH0343_ID,
    name: 'Eisco Labs Spring-Loaded Projectile Launcher',
    manufacturerModel: 'PH0343',
    kind: 'projectile_motion_apparatus',
    projectileMaterial: 'aluminum',
    visual: {
      ...DEFAULT_VISUAL_CONFIG,
      foot_style: 'solid_plate',
      scale_style: 'housing_plumb',
      mount_type: 'clamp',
      guide_type: 'open_channel',
      base: 'post',
      tube_color: 'silver',
      base_color: 'black',
      tube_material: 'metal',
      support_material: 'painted_metal',
      support_position: 'front',
      tube_proportion: 'medium',
      spring_visible: true,
      trigger_visible: true,
      angle_scale: true,
      photogate_bracket: false,
      ramrod_included: false,
    },
    dimensions: {
      barrelLength: 0.38,
      barrelDiameter: 0.0835,
      baseLength: 0.15,
      baseWidth: 0.112,
      projectileDiameter: 0.019,
    },
    dimensionStatus: {
      barrelLength: 'estimated',
      barrelDiameter: 'estimated',
      baseLength: 'estimated',
      baseWidth: 'estimated',
      projectileDiameter: 'confirmed',
    },
    dimensionSources: {
      barrelLength: { kind: 'visual_estimate', quote: 'Open channel length estimated from the catalog photo' },
      barrelDiameter: { kind: 'visual_estimate', quote: 'Outside channel width estimated from the catalog photo' },
      baseLength: { kind: 'visual_estimate', quote: 'Bench mounting allowance for the simulator adapter' },
      baseWidth: { kind: 'visual_estimate', quote: 'Footprint width of the simulator adapter' },
      projectileDiameter: {
        kind: 'manufacturer_spec',
        quote: '19 mm diameter ball with hole',
        sourceUrl: 'https://www.eiscolabs.com/products/ph0343',
      },
    },
    uncertainties: ['Channel dimensions are estimated from the catalog photo. Support height and footprint are for the simulator adapter.'],
    limits: { minAngle: 0, maxAngle: 90, maxSpeed: 5.6 },
  },
  [PASCO_MINI_ID]: {
    id: PASCO_MINI_ID,
    name: 'PASCO Mini Projectile Launcher',
    manufacturerModel: 'ME-6825B',
    modelNumber: 'ME-6825B',
    kind: 'projectile_motion_apparatus',
    projectileMaterial: 'steel',
    visual: {
      ...DEFAULT_VISUAL_CONFIG,
      foot_style: 'solid_plate',
      scale_style: 'housing_plumb',
      mount_type: 'clamp',
      guide_type: 'rectangular_housing',
      base: 'post',
      tube_color: 'black',
      base_color: 'black',
      tube_material: 'painted_metal',
      support_material: 'painted_metal',
      support_position: 'front',
      tube_proportion: 'short',
      spring_visible: false,
      trigger_visible: true,
      angle_scale: true,
      photogate_bracket: false,
      ramrod_included: true,
    },
    dimensions: {
      barrelLength: 0.18, barrelDiameter: 0.037, baseLength: 0.152, baseWidth: 0.115, projectileDiameter: 0.016,
    },
    dimensionStatus: {
      barrelLength: 'confirmed', barrelDiameter: 'estimated', baseLength: 'estimated', baseWidth: 'estimated',
      projectileDiameter: 'confirmed',
    },
    dimensionSources: {
      barrelLength: {
        kind: 'manufacturer_spec', quote: 'Launcher Length: 18 cm',
        sourceUrl: 'https://www.pasco.com/products/lab-apparatus/mechanics/projectiles/me-6825',
      },
      projectileDiameter: {
        kind: 'manufacturer_spec', quote: '16 mm steel balls',
        sourceUrl: 'https://cdn.pasco.com/product_document/Mini-Launcher-ME-6825B-Manual.pdf',
      },
    },
    uncertainties: ['The simulator uses the upper pivot and a bench adapter. The housing width and bracket proportions are estimated from product photos.'],
    limits: { minAngle: -45, maxAngle: 90, maxSpeed: null },
  },
  [VERNIER_VPL_ID]: {
    id: VERNIER_VPL_ID,
    name: 'Vernier Pneumatic Projectile Launcher',
    manufacturerModel: 'VPL',
    modelNumber: 'VPL',
    kind: 'projectile_motion_apparatus',
    projectileMaterial: 'steel',
    visual: {
      ...DEFAULT_VISUAL_CONFIG,
      foot_style: 'solid_plate',
      scale_style: 'circular_dial',
      mount_type: 'foot',
      guide_type: 'rectangular_housing',
      base: 'frame',
      tube_color: 'black',
      base_color: 'black',
      tube_material: 'plastic',
      support_material: 'plastic',
      support_position: 'center',
      tube_proportion: 'short',
      spring_visible: false,
      trigger_visible: true,
      angle_scale: true,
      photogate_bracket: false,
      ramrod_included: false,
    },
    dimensions: {
      barrelLength: 0.113, barrelDiameter: 0.054, baseLength: 0.168, baseWidth: 0.142, projectileDiameter: 0.01746,
    },
    dimensionStatus: {
      barrelLength: 'estimated', barrelDiameter: 'estimated', baseLength: 'estimated', baseWidth: 'estimated',
      projectileDiameter: 'confirmed',
    },
    dimensionSources: {
      projectileDiameter: {
        kind: 'manufacturer_spec',
        quote: 'Steel ball diameter: 17.46 mm',
        sourceUrl: 'https://www.vernier.com/manuals/vpl/',
      },
    },
    uncertainties: ['The exterior dimensions and internal sensor placement are estimated from photographs. The 50 mm distance between gates is documented.'],
    limits: { minAngle: 0, maxAngle: 70, maxSpeed: 6 },
  },
  [ARBOR_MINI_ID]: {
    id: ARBOR_MINI_ID,
    name: 'Arbor Scientific Mini Projectile Launcher',
    manufacturerModel: '94-1970',
    kind: 'projectile_motion_apparatus',
    visual: {
      ...DEFAULT_VISUAL_CONFIG,
      guide_type: 'rectangular_housing',
      base: 'panel',
      mount_type: 'foot',
      foot_style: 'solid_plate',
      tube_color: 'black',
      base_color: 'black',
      tube_material: 'painted_metal',
      support_material: 'painted_metal',
      scale_style: 'housing_plumb',
      spring_visible: false,
      trigger_visible: true,
      photogate_bracket: false,
      ramrod_included: false,
    },
    dimensions: { barrelLength: 0.206, barrelDiameter: 0.036, baseLength: 0.155, baseWidth: 0.15, projectileDiameter: 0.016 },
    dimensionStatus: {
      barrelLength: 'estimated', barrelDiameter: 'estimated', baseLength: 'estimated',
      baseWidth: 'confirmed', projectileDiameter: 'confirmed',
    },
    dimensionSources: {
      baseWidth: { kind: 'manufacturer_spec', quote: 'Overall width: 15 cm', sourceUrl: 'https://www.arborsci.com/products/mini-projectile-launcher' },
      projectileDiameter: { kind: 'manufacturer_spec', quote: 'Steel ball diameter: 16 mm', sourceUrl: 'https://www.arborsci.com/products/mini-projectile-launcher' },
    },
    uncertainties: ['Housing and stand proportions are estimated from manufacturer photos. Launch speed is set by the experiment.'],
    limits: { minAngle: 0, maxAngle: 90, maxSpeed: null },
  },
};

const curvedFrame = CLASSROOM_APPARATUS_PRESETS['cpo-marble-launcher'];
CLASSROOM_APPARATUS_PRESETS[GSC_PROLCH_ID] = {
  ...curvedFrame,
  id: GSC_PROLCH_ID,
  name: 'GSC PROLCH Marble Launcher',
  manufacturerModel: 'GSC PROLCH (Fisher S38982)',
  visual: { ...curvedFrame.visual, tube_color: 'blue' },
  dimensions: { ...curvedFrame.dimensions },
  dimensionStatus: {
    barrelLength: 'estimated', barrelDiameter: 'estimated', baseLength: 'estimated',
    baseWidth: 'estimated', projectileDiameter: 'estimated',
  },
  dimensionSources: {},
  uncertainties: ['The curved-frame model represents the GSC launcher. Part dimensions are estimated.'],
  limits: null,
};

// Keep older apparatus IDs resolvable for saved activities and imported equipment.
export const AVAILABLE_CLASSROOM_APPARATUS_PRESETS = Object.values(CLASSROOM_APPARATUS_PRESETS)
  .filter((preset) => preset.id !== 'wooden-marble-ramp-launcher');

export interface GuideCrossSection {
  kind: 'tube' | 'slotted_barrel' | 'open_channel' | 'rectangular_housing';
  wall: number;
  insideWidth: number;
  boreRadius: number;
}

export function computeGuideCrossSection(
  visual: ProjectileVisualConfiguration,
  dimensions: ProjectileDimensions,
  documentedBore?: number
): GuideCrossSection {
  const kind =
    visual.guide_type === 'open_channel'
      ? 'open_channel'
      : visual.guide_type === 'rectangular_housing'
      ? 'rectangular_housing'
      : visual.guide_type === 'tube'
      ? 'tube'
      : 'slotted_barrel';
  const explicitBore = kind !== 'open_channel' && documentedBore !== undefined &&
    documentedBore > 0 && documentedBore < dimensions.barrelDiameter ? documentedBore : undefined;
  const wall = explicitBore === undefined ? Math.min(0.0045, dimensions.barrelDiameter * 0.08)
    : (dimensions.barrelDiameter - explicitBore) / 2;
  const insideWidth = explicitBore ?? dimensions.barrelDiameter - 2 * wall;
  const boreRadius = explicitBore !== undefined ? explicitBore / 2 : Math.min(
    insideWidth / 2,
    Math.max(dimensions.projectileDiameter * 0.53, dimensions.barrelDiameter * 0.25)
  );
  return { kind, wall, insideWidth, boreRadius };
}

export function fittedBarrelBoreRadius(spec: ProjectileApparatusSpec, boreRadius: number): number | undefined {
  const profile = spec.reconstruction?.barrelProfile;
  if (!profile) return undefined;
  const outside = Math.min(...profile.map(point => point.width)) * spec.dimensions.barrelDiameter / 2;
  const inferred = spec.reconstruction?.guideWidthToLengthRatio && spec.reconstruction.guideBoreM === undefined
    ? Math.min(boreRadius, outside - 0.001) : boreRadius;
  if (inferred >= spec.dimensions.projectileDiameter * 0.51 && outside >= inferred + 0.001 - 1e-9) return inferred;
  return undefined;
}

/**
 * Validates apparatus dimensions and checks physical bore clearance.
 * Returns null if valid, or a descriptive human-readable error message.
 */
export function validateApparatusDimensions(spec: ProjectileApparatusSpec): string | null {
  for (const def of DIMENSION_DEFINITIONS) {
    const val = spec.dimensions[def.key];
    if (!Number.isFinite(val) || val < def.min || val > def.max) {
      return `${def.label} must be between ${def.min} and ${def.max} m.`;
    }
  }
  const bore = spec.reconstruction?.guideBoreM;
  if (spec.visual.guide_type !== 'open_channel' && bore !== undefined && bore >= spec.dimensions.barrelDiameter) {
    return 'The documented bore must be smaller than the guide outside width.';
  }
  const cross = computeGuideCrossSection(spec.visual, spec.dimensions, bore);
  if (spec.dimensions.projectileDiameter >= cross.insideWidth) {
    return 'Projectile diameter exceeds the guide inside opening; reduce projectile size or increase guide outside width.';
  }
  return null;
}

export interface ApparatusKinematicsPose {
  /** 3D position [x, y, z] of the projectile center at muzzle exit */
  muzzleCenter: [number, number, number];
  /** 3D position [x, y, z] of the barrel muzzle face center */
  tubeExit: [number, number, number];
  /** 3D position [x, y, z] of the trunnion rotation pivot axis */
  pivot: [number, number, number];
  /** Distance from pivot to muzzle along barrel axis (m) */
  forwardBarrelReach: number;
  /** Distance from pivot to breech along barrel axis (m) */
  rearBarrelLength: number;
  barrelLength: number;
  baseLength: number;
  baseWidth: number;
}

/**
 * Computes exact synchronized 3D coordinates for the apparatus pivot, barrel exit,
 * and projectile launch center given launch angle (deg) and projectile center height (m).
 */
function apparatusForwardRatio(spec: ProjectileApparatusSpec): number {
  if (spec.id === ARBOR_MINI_ID) return ARBOR_MINI_FORWARD_RATIO;
  const measured = spec.visual.base === 'panel' && spec.reconstruction?.panelOutline
    ? spec.reconstruction.guideForwardRatio : undefined;
  return measured ?? (spec.visual.support_position === 'rear' ? 0.72 : spec.visual.support_position === 'front' ? 0.28 : 0.48);
}

export function computeApparatusKinematicsPose(
  spec: ProjectileApparatusSpec,
  angleDeg: number,
  projectileCenterY: number
): ApparatusKinematicsPose {
  const rad = (angleDeg * Math.PI) / 180;
  const L = spec.dimensions.barrelLength;
  const rBall = spec.dimensions.projectileDiameter / 2;

  if (spec.id === BOREAL_ID) {
    const ballReach = BOREAL_EXIT_REACH + rBall;
    return {
      muzzleCenter: [ballReach * (Math.cos(rad) - 1), projectileCenterY, 0],
      tubeExit: [BOREAL_EXIT_REACH * Math.cos(rad) - ballReach, projectileCenterY - rBall * Math.sin(rad), 0],
      pivot: [-ballReach, projectileCenterY - ballReach * Math.sin(rad), 0],
      forwardBarrelReach: BOREAL_EXIT_REACH,
      rearBarrelLength: L - BOREAL_EXIT_REACH,
      barrelLength: L,
      baseLength: spec.dimensions.baseLength,
      baseWidth: spec.dimensions.baseWidth,
    };
  }

  if (spec.id === PASCO_ME6800_ID || spec.id === PASCO_MINI_ID || spec.id === VERNIER_VPL_ID ||
      spec.reconstruction?.launchPointAtPivot) {
    // These launchers tilt around the fixed launch position.
    return {
      muzzleCenter: [0, projectileCenterY, 0],
      tubeExit: [-rBall * Math.cos(rad), projectileCenterY - rBall * Math.sin(rad), 0],
      pivot: [0, projectileCenterY, 0],
      forwardBarrelReach: 0,
      rearBarrelLength: L,
      barrelLength: L,
      baseLength: spec.dimensions.baseLength,
      baseWidth: spec.dimensions.baseWidth,
    };
  }

  if (spec.id === EISCO_PH0343_ID) {
    const pivotX = -EISCO_BALL_REACH;
    const seatReach = EISCO_BALL_REACH - rBall;
    return {
      muzzleCenter: [pivotX + EISCO_BALL_REACH * Math.cos(rad), projectileCenterY, 0],
      tubeExit: [pivotX + seatReach * Math.cos(rad), projectileCenterY - rBall * Math.sin(rad), 0],
      pivot: [pivotX, projectileCenterY - EISCO_BALL_REACH * Math.sin(rad), 0],
      forwardBarrelReach: seatReach,
      rearBarrelLength: L - seatReach,
      barrelLength: L,
      baseLength: spec.dimensions.baseLength,
      baseWidth: spec.dimensions.baseWidth,
    };
  }

  // Center of barrel exit is slightly below projectile center along sin(theta) so ball exits cleanly at muzzle lip
  const exitY = projectileCenterY - rBall * Math.sin(rad);
  const supportRatio = apparatusForwardRatio(spec);

  const fixedPivot = spec.id === ARBOR_MINI_ID ||
    (spec.visual.base === 'panel' && spec.reconstruction?.panelOutline && spec.reconstruction.guideForwardRatio !== undefined);
  const forwardReach = fixedPivot ? L * supportRatio : Math.min(
    L * supportRatio,
    Math.sin(rad) > 0 ? Math.max(0, (exitY - 0.075) / Math.sin(rad)) : L * supportRatio
  );
  const pivotX = -L * supportRatio;
  const pivotY = exitY - forwardReach * Math.sin(rad);
  const tubeExitX = pivotX + forwardReach * Math.cos(rad);
  const muzzleCenterX = tubeExitX + rBall * Math.cos(rad);

  return {
    muzzleCenter: [muzzleCenterX, projectileCenterY, 0],
    tubeExit: [tubeExitX, exitY, 0],
    pivot: [pivotX, pivotY, 0],
    forwardBarrelReach: forwardReach,
    rearBarrelLength: L - forwardReach,
    barrelLength: L,
    baseLength: spec.dimensions.baseLength,
    baseWidth: spec.dimensions.baseWidth,
  };
}

/**
 * Calculates minimum launch height h0 (m) needed so the apparatus
 * does not intersect the laboratory tabletop (y = 0) at angleDeg.
 *
 * Supports two authentic classroom mounting configurations:
 * - 'stand': Apparatus rests on the table surface (or elevated on a vertical support rod).
 *   The solid tabletop acts as a physical boundary: neither the base, nor the tilting barrel
 *   nor any hanging plumb dial can pass through the table.
 * - 'clamp': The edge clamp adds clearance for its upper jaw while keeping the launch path over the bench.
 */
export const LAB_BENCH_DEPTH = 1.56;
export const LAB_BENCH_THICKNESS = 0.11;
export const CLAMP_LAUNCH_AXIS_Z = 0.62;
export const CLAMP_TOP_THICKNESS = 0.016;
export const CPO_MOUNT = { scale: 0.165, floorY: -0.82, pivotY: 0.687, muzzleReach: 0.25 };
export const BOREAL_ID = 'boreal-fundamentals-8884857';
const BOREAL_PIVOT_HEIGHT = 0.267;
const BOREAL_EXIT_REACH = 0.024;
export const BOREAL_MOUNT = { scale: 0.22, floorY: -1.48, pivotY: 0.75, muzzleReach: 0.26, boreOffset: -0.04 };

export function reconstructionPanelWidth(spec: ProjectileApparatusSpec): number {
  const ratio = spec.visual.base === 'panel' && spec.reconstruction?.panelOutline
    ? spec.reconstruction.panelSpanToGuideRatio : undefined;
  return ratio === undefined ? Math.max(spec.dimensions.baseLength * 0.72, 0.24)
    : spec.dimensions.barrelLength * ratio;
}

export function reconstructionPanelHeight(spec: ProjectileApparatusSpec): number | undefined {
  if (spec.visual.base !== 'panel' || !spec.reconstruction?.panelOutline) return undefined;
  return reconstructionPanelWidth(spec) * (spec.reconstruction.panelPivotHeightRatio ?? 0.7);
}

export function reconstructionStandDeck(spec: ProjectileApparatusSpec): number {
  const stand = spec.visual.base === 'panel' && spec.reconstruction?.panelOutline ? spec.reconstruction.panelStand : undefined;
  if (stand) return reconstructionPanelWidth(spec) * stand.thickness;
  return spec.visual.foot_style === 'cross_feet' ? 0.045 : spec.visual.foot_style === 'extruded_rail' ? 0.05 : 0.055;
}

export function computeMinimumClearanceHeight(
  spec: ProjectileApparatusSpec,
  angleDeg: number,
  mountMode: 'stand' | 'clamp' = 'stand'
): number {
  if (!spec || !spec.dimensions) return 0.55;
  const safeAngle = Number.isFinite(angleDeg) ? angleDeg : 35;
  const d = spec.dimensions;
  const barrelLength = Number.isFinite(d.barrelLength) ? d.barrelLength : 0.48;
  const barrelDiameter = Number.isFinite(d.barrelDiameter) ? d.barrelDiameter : 0.052;
  const projectileDiameter = Number.isFinite(d.projectileDiameter) ? d.projectileDiameter : 0.025;
  const rBall = projectileDiameter / 2;

  // Both mounts keep the shot over the measuring mat. The clamp adds a mounting plate.
  const mountClearance = mountMode === 'clamp' ? CLAMP_TOP_THICKNESS : 0;

  const rad = (safeAngle * Math.PI) / 180;
  const sinT = Math.sin(rad);
  const cosT = Math.cos(rad);

  if (spec.id === ARBOR_MINI_ID) {
    const reach = barrelLength * ARBOR_MINI_FORWARD_RATIO;
    return Math.max(0.05, arborMiniPivotHeight(safeAngle, barrelLength) + (reach + rBall) * sinT - rBall + mountClearance);
  }

  if (spec.id === PASCO_ME6800_ID) {
    const addedClearance = Math.max(0, (barrelLength - 0.21) * Math.max(0, sinT) + rBall - 0.0125);
    return PASCO_FIRING_HEIGHT - rBall + mountClearance + addedClearance;
  }

  if (spec.id === BOREAL_ID) {
    return BOREAL_PIVOT_HEIGHT + (BOREAL_EXIT_REACH + rBall) * sinT - rBall + mountClearance;
  }

  if (spec.id === 'cpo-marble-launcher' || spec.id === GSC_PROLCH_ID) {
    const { scale, floorY, pivotY, muzzleReach } = CPO_MOUNT;
    return (pivotY + muzzleReach * sinT - floorY) * scale - rBall + mountClearance;
  }

  if (spec.id === PASCO_MINI_ID) return PASCO_MINI_PIVOT_HEIGHT - rBall + mountClearance;

  if (spec.id === VERNIER_VPL_ID) return VERNIER_VPL_LAUNCH_HEIGHT - rBall + mountClearance;

  if (spec.id === EISCO_PH0343_ID) {
    return EISCO_MOUNT_HEIGHT + EISCO_BALL_REACH * sinT - rBall + mountClearance;
  }

  // Special case: Hardwood Quadrant Marble Launcher (Pitsco / Arbor Scientific)
  if (spec.id === 'wooden-marble-ramp-launcher') {
    const pivotH = 0.082; // Height of trunnion pivot above tabletop feet
    const L = barrelLength;
    const nativeTabletopH = pivotH + L * sinT + rBall;
    return Number.isFinite(nativeTabletopH) ? Math.max(0.08, nativeTabletopH) + mountClearance : 0.25;
  }

  const { kind, wall } = computeGuideCrossSection(spec.visual || DEFAULT_VISUAL_CONFIG, {
    ...DEFAULT_DIMENSIONS,
    ...d,
  });
  const halfOuter =
    kind === 'rectangular_housing'
      ? barrelDiameter * 0.59
      : kind === 'open_channel'
      ? Math.max(rBall + wall, barrelDiameter * 0.6 - rBall)
      : barrelDiameter * 0.52;
  let minH = 0.025 + barrelLength * sinT + halfOuter * cosT - rBall * (1 - sinT);

  // If there is a plumb-bob hanging below the housing/barrel, account for string & bob clearance
  if (spec.visual?.angle_scale && spec.visual?.scale_style === 'housing_plumb') {
    const dialRadius = Math.max(barrelDiameter * 0.85, 0.055);
    const plumbH = 0.028 + (barrelLength * 0.82) * sinT + dialRadius * 0.76 + 0.02 - rBall * (1 - sinT);
    minH = Math.max(minH, plumbH);
  }

  // Allow for the protruding breech cap and the bottom of the optical bracket.
  const guideClearance = Number.isFinite(minH) ? Math.max(0.1, minH + 0.025) + mountClearance : 0.55;
  const panelHeight = reconstructionPanelHeight(spec);
  if (panelHeight === undefined) return guideClearance;
  const ratio = apparatusForwardRatio(spec);
  const deck = mountMode === 'clamp' ? CLAMP_TOP_THICKNESS + 0.014 : reconstructionStandDeck(spec);
  const ballReach = spec.reconstruction?.launchPointAtPivot ? 0 : barrelLength * ratio + rBall;
  const panelClearance = deck + panelHeight + ballReach * sinT - rBall;
  return Math.max(guideClearance, panelClearance);
}

export function computeFixedHeightAngleRange(
  spec: ProjectileApparatusSpec, mount: 'stand' | 'clamp', height: number, angle: number,
  min: number, max: number
): { min: number; max: number } {
  const anchor = Math.max(min, Math.min(max, angle));
  const fits = (value: number) => computeMinimumClearanceHeight(spec, value, mount) <= height + 1e-7;
  if (!fits(anchor)) return { min: anchor, max: anchor };
  const boundary = (end: number) => {
    const steps = Math.max(1, Math.ceil(Math.abs(end - anchor)));
    let safe = anchor;
    for (let i = 1; i <= steps; i++) {
      let next = anchor + (end - anchor) * i / steps;
      if (fits(next)) {
        safe = next;
        continue;
      }
      for (let attempt = 0; attempt < 14; attempt++) {
        const midpoint = (next + safe) / 2;
        if (fits(midpoint)) safe = midpoint;
        else next = midpoint;
      }
      return end < anchor ? Math.min(anchor, Math.ceil(safe * 100) / 100)
        : Math.max(anchor, Math.floor(safe * 100) / 100);
    }
    return end;
  };
  return { min: boundary(min), max: boundary(max) };
}

export function createApparatusFromVisual(
  visual: ProjectileVisualConfiguration,
  name = 'Custom Reconstructed Projectile Apparatus',
  initialDimensions?: Partial<ProjectileDimensions>
): ProjectileApparatusSpec {
  let defaultBarrelLength = DEFAULT_DIMENSIONS.barrelLength;
  let defaultBarrelDiameter = DEFAULT_DIMENSIONS.barrelDiameter;
  let defaultBaseLength = DEFAULT_DIMENSIONS.baseLength;
  let defaultBaseWidth = DEFAULT_DIMENSIONS.baseWidth;
  let defaultProjectileDiameter = DEFAULT_DIMENSIONS.projectileDiameter;

  if (visual.guide_type === 'rectangular_housing') {
    // Compact spring-piston housing (PASCO style)
    defaultBarrelLength = visual.tube_proportion === 'short' ? 0.21 : visual.tube_proportion === 'long' ? 0.38 : 0.26;
    defaultBarrelDiameter = 0.065;
    defaultBaseLength = 0.38;
    defaultBaseWidth = 0.18;
    defaultProjectileDiameter = 0.025;
  } else if (visual.guide_type === 'open_channel') {
    // Slotted extruded U-channel (Eisco style) or wooden ramp
    const isLongRamp = visual.tube_proportion === 'long' || visual.support_material === 'wood' || visual.base_color === 'wood';
    defaultBarrelLength = isLongRamp ? 0.58 : 0.42;
    defaultBarrelDiameter = 0.050;
    defaultBaseLength = isLongRamp ? 0.56 : 0.36;
    defaultBaseWidth = isLongRamp ? 0.24 : 0.18;
    defaultProjectileDiameter = isLongRamp ? 0.025 : 0.019;
  } else if (visual.guide_type === 'tube') {
    // Precision bore cannon (Vernier style)
    defaultBarrelLength = visual.tube_proportion === 'short' ? 0.35 : visual.tube_proportion === 'long' ? 0.65 : 0.52;
    defaultBarrelDiameter = 0.060;
    defaultBaseLength = 0.60;
    defaultBaseWidth = 0.28;
    defaultProjectileDiameter = 0.025;
  } else {
    // Cylindrical slotted barrel (Boreal style)
    defaultBarrelLength = visual.tube_proportion === 'short' ? 0.34 : visual.tube_proportion === 'long' ? 0.68 : 0.48;
    defaultBarrelDiameter = 0.052;
    defaultBaseLength = 0.46;
    defaultBaseWidth = 0.22;
    defaultProjectileDiameter = 0.025;
  }

  const finalDimensions: ProjectileDimensions = {
    barrelLength: initialDimensions?.barrelLength ?? defaultBarrelLength,
    barrelDiameter: initialDimensions?.barrelDiameter ?? defaultBarrelDiameter,
    baseLength: initialDimensions?.baseLength ?? defaultBaseLength,
    baseWidth: initialDimensions?.baseWidth ?? defaultBaseWidth,
    projectileDiameter: initialDimensions?.projectileDiameter ?? defaultProjectileDiameter,
  };

  return {
    id: `custom-${Date.now()}`,
    name,
    kind: 'projectile_motion_apparatus',
    visual: { ...visual },
    dimensions: finalDimensions,
    dimensionStatus: {
      barrelLength: 'estimated',
      barrelDiameter: 'estimated',
      baseLength: 'estimated',
      baseWidth: 'estimated',
      projectileDiameter: 'estimated',
    },
    dimensionSources: {},
    missingInformation: [
      'Exact bore inner diameter (mm)',
      'Internal spring constant k (N/m)',
      'Verified overall base footprint dimensions',
    ],
    uncertainties: [
      'Dimensions calibrated from detected visual apparatus geometry and proportions; confirm with physical ruler or specification sheet.',
    ],
  };
}

/**
 * Calibrate photo estimates from one known measurement. Measurements from a
 * specification and manual edits are independent of the photo scale.
 */
export function calibratePhotoDimensions(
  spec: ProjectileApparatusSpec,
  anchor: DimensionKey,
  meters: number
): { spec: ProjectileApparatusSpec; scaledCount: number } | { error: string } {
  const anchorDefinition = DIMENSION_DEFINITIONS.find(def => def.key === anchor);
  const original = spec.dimensions[anchor];
  if (!anchorDefinition || !Number.isFinite(meters) || meters < anchorDefinition.min || meters > anchorDefinition.max) {
    return { error: 'Enter a measurement within the selected dimension’s range.' };
  }
  if (spec.dimensionStatus[anchor] !== 'estimated' ||
      spec.dimensionSources?.[anchor]?.kind !== 'visual_estimate' ||
      !Number.isFinite(original) || original <= 0) {
    return { error: 'Choose a dimension estimated from the reference.' };
  }
  const ratio = meters / original;
  let scaledCount = 0;
  let calibrated = updateConfirmedDimension(spec, anchor, meters, { kind: 'teacher_entered' });
  for (const def of DIMENSION_DEFINITIONS) {
    if (def.key === anchor || spec.dimensionStatus[def.key] !== 'estimated' ||
        spec.dimensionSources?.[def.key]?.kind !== 'visual_estimate') continue;
    calibrated = updateConfirmedDimension(calibrated, def.key, Number((spec.dimensions[def.key] * ratio).toFixed(6)), {
      kind: 'visual_estimate',
      quote: 'Scaled from the measured ' + anchorDefinition.label.toLowerCase() + '.',
    });
    scaledCount++;
  }
  const error = validateApparatusDimensions(calibrated);
  if (error) return { error: 'Scale could not be applied. ' + error };
  const { kind, boreRadius } = computeGuideCrossSection(calibrated.visual, calibrated.dimensions, calibrated.reconstruction?.guideBoreM);
  if (kind === 'tube' && calibrated.reconstruction?.barrelProfile &&
      fittedBarrelBoreRadius(calibrated, boreRadius) === undefined) {
    return { error: 'Scale could not be applied. The narrowest part of the barrel would no longer clear the bore.' };
  }
  calibrated = {
    ...calibrated,
    missingInformation: calibrated.missingInformation?.filter(item =>
      item !== 'Verify ' + anchorDefinition.label.toLowerCase() + '.'),
    uncertainties: calibrated.uncertainties?.filter(item => !item.startsWith('Absolute scale is estimated.')),
  };
  return { spec: calibrated, scaledCount };
}

export function updateConfirmedDimension(
  spec: ProjectileApparatusSpec,
  key: DimensionKey,
  value: number,
  source: DimensionSourceMetadata,
  explicitStatus?: DimensionVerificationStatus
): ProjectileApparatusSpec {
  const hasApproxQuote = Boolean(
    source.quote &&
      /\b(approx|approximate|estimated|estimate|proportion|proportional|calculated|inferred|assumed|~)\b/i.test(source.quote)
  );
  // "Confirmed" strictly requires a traceable source: teacher entry, or a direct manufacturer/catalog quote with substantive wording
  const hasTraceableProvenance =
    source.kind === 'teacher_entered' ||
    ((source.kind === 'manufacturer_spec' || source.kind === 'product_page' || source.kind === 'datasheet_table') &&
      Boolean(source.quote && source.quote.trim().length >= 3));

  const isEstimated =
    explicitStatus === 'estimated' ||
    source.kind === 'visual_estimate' ||
    source.kind === 'unstated_default' ||
    hasApproxQuote ||
    !hasTraceableProvenance;

  const finalStatus: DimensionVerificationStatus = isEstimated
    ? 'estimated'
    : (explicitStatus || 'confirmed');

  return {
    ...spec,
    dimensions: {
      ...spec.dimensions,
      [key]: value,
    },
    dimensionStatus: {
      ...spec.dimensionStatus,
      [key]: finalStatus,
    },
    dimensionSources: {
      ...(spec.dimensionSources || {}),
      [key]: source,
    },
  };
}
