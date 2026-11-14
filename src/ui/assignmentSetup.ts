import {
  CLASSROOM_APPARATUS_PRESETS, DEFAULT_VISUAL_CONFIG, validateApparatusDimensions, validateReconstructionGeometry,
} from '../equipment/schema.ts';
import type { OperatingLimits, ProjectileApparatusSpec, ProjectileVisualConfiguration } from '../equipment/schema.ts';
import { DEFAULT_EXPERIMENTAL_ENV, PROJECTILE_MATERIALS } from '../physics/projectile.ts';
import type { ExperimentalEnvironment, PhysicsMode } from '../physics/projectile.ts';
import type { RecordedTrial, StudentPlottedPoint } from './ScientificCharts.ts';
import type { GraphAxes } from './graph-expressions.ts';
import { compileAxis } from './graph-expressions.ts';

type AssignmentProgress = {
  trials: RecordedTrial[];
  plottedTrials: number[];
  points: StudentPlottedPoint[];
  axes?: GraphAxes;
  autoPlot: boolean;
  showLine: boolean;
  line?: { x1: number; y1: number; x2: number; y2: number };
  tab: 'run' | 'graph';
};

export function assignmentProgressKey(fragment: string): string {
  // A fixed-length key keeps the assignment payload, including any board image, out of storage keys.
  let hash = 14695981039346656037n;
  for (let i = 0; i < fragment.length; i++) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(fragment.charCodeAt(i))) * 1099511628211n);
  }
  return 'europa.assignment-progress.v1.' + hash.toString(16);
}

export function readAssignmentProgress(key: string): Partial<AssignmentProgress> {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(key) ?? 'null') as Partial<AssignmentProgress> | null;
    if (!saved || typeof saved !== 'object') return {};
    const trialFields = ['id', 'angle', 'speed', 'height', 'gravity', 'time', 'maxHeight', 'range', 'impactSpeed'] as const;
    const trials = Array.isArray(saved.trials) ? saved.trials.filter(trial => trial &&
      typeof trial.apparatusName === 'string' && trialFields.every(field => Number.isFinite(trial[field]))) : [];
    const trialIds = new Set(trials.map(trial => trial.id));
    const plottedTrials = Array.isArray(saved.plottedTrials) ? saved.plottedTrials.filter(id => trialIds.has(id)) : [];
    const points = Array.isArray(saved.points) ? saved.points.filter(point => point &&
      [point.id, point.x, point.y].every(Number.isFinite) &&
      (point.axesKey === undefined || typeof point.axesKey === 'string')) : [];
    let axes: GraphAxes | undefined;
    if (typeof saved.axes?.x === 'string' && typeof saved.axes.y === 'string') {
      try {
        compileAxis(saved.axes.x);
        compileAxis(saved.axes.y);
        axes = saved.axes;
      } catch { /* An invalid expression should not erase the saved trials. */ }
    }
    const line = saved.line && [saved.line.x1, saved.line.y1, saved.line.x2, saved.line.y2].every(Number.isFinite)
      ? saved.line : undefined;
    return {
      trials, plottedTrials, points, axes, line,
      autoPlot: saved.autoPlot === true,
      showLine: saved.showLine === true,
      tab: saved.tab === 'graph' ? 'graph' : 'run',
    };
  } catch {
    return {};
  }
}

export function writeAssignmentProgress(key: string, progress: AssignmentProgress): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(progress));
  } catch { /* Keep the experiment usable when session storage is disabled or full. */ }
}

export function readAssignmentLimits(input: unknown): OperatingLimits | null {
  if (!input || typeof input !== 'object') return null;
  const limits = input as OperatingLimits;
  const angle = (value: unknown) => typeof value === 'number' && value >= -45 && value <= 90 ? value : null;
  const minAngle = angle(limits.minAngle);
  const maxAngle = angle(limits.maxAngle);
  const maxSpeed = Number.isFinite(limits.maxSpeed) && limits.maxSpeed! > 0 && limits.maxSpeed! <= 50 ? limits.maxSpeed : null;
  if (minAngle !== null && maxAngle !== null && minAngle > maxAngle) return null;
  return { minAngle, maxAngle, maxSpeed };
}

export function writeAssignmentEquipment(spec: ProjectileApparatusSpec) {
  const { id, name, dimensions, visual, projectileMaterial, reconstruction, limits } = spec;
  const preset = Object.hasOwn(CLASSROOM_APPARATUS_PRESETS, id) ? CLASSROOM_APPARATUS_PRESETS[id] : undefined;
  if (preset && [preset.visual, preset.dimensions, preset.reconstruction].every(
    (value, i) => JSON.stringify(value) === JSON.stringify([visual, dimensions, reconstruction][i])
  )) return undefined;
  return { id, name, dimensions, visual, projectileMaterial, reconstruction, limits };
}

export function readAssignmentEquipment(input: unknown): ProjectileApparatusSpec | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const incoming = input as Partial<ProjectileApparatusSpec>;
  if (typeof incoming.name !== 'string' || !incoming.name.trim() || !incoming.dimensions || !incoming.visual) return undefined;
  const visual = { ...DEFAULT_VISUAL_CONFIG };
  for (const key of Object.keys(visual) as (keyof ProjectileVisualConfiguration)[]) {
    const value = incoming.visual[key];
    if (typeof value === typeof visual[key] || (visual[key] === null && typeof value === 'boolean')) {
      if (typeof value !== 'string' || /^[a-z_]{1,32}$/.test(value)) Object.assign(visual, { [key]: value });
    }
  }
  const spec: ProjectileApparatusSpec = {
    id: typeof incoming.id === 'string' && /^[-a-z0-9]{1,100}$/i.test(incoming.id) &&
      !Object.hasOwn(CLASSROOM_APPARATUS_PRESETS, incoming.id) ? incoming.id : 'shared-custom-launcher',
    name: incoming.name.trim().slice(0, 120), kind: 'projectile_motion_apparatus',
    dimensions: incoming.dimensions, visual,
    dimensionStatus: { barrelLength: 'estimated', barrelDiameter: 'estimated', baseLength: 'estimated',
      baseWidth: 'estimated', projectileDiameter: 'estimated' },
    reconstruction: validateReconstructionGeometry(incoming.reconstruction),
    projectileMaterial: incoming.projectileMaterial && Object.hasOwn(PROJECTILE_MATERIALS, incoming.projectileMaterial)
      ? incoming.projectileMaterial : undefined,
    limits: readAssignmentLimits(incoming.limits),
  };
  return validateApparatusDimensions(spec) ? undefined : spec;
}

export function readAssignmentEnvironment(input: unknown, mode: PhysicsMode, equipment: ProjectileApparatusSpec): ExperimentalEnvironment {
  const raw = input && typeof input === 'object' ? input as Partial<ExperimentalEnvironment> : {};
  const ranges = {
    airPressureKPa: [0, 150], temperatureC: [-100, 100], windSpeed: [-30, 30], dragCoefficient: [0, 3],
    springInconsistencyPct: [0, 30], angleJitterDeg: [0, 15], rulerNoiseM: [0, 1], timingNoiseS: [0, 1],
  } as const;
  const result = { ...DEFAULT_EXPERIMENTAL_ENV, mode, projectileDiameter: equipment.dimensions.projectileDiameter };
  for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) {
    const value = raw[key];
    const [low, high] = ranges[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high) result[key] = value;
  }
  result.material = raw.material && Object.hasOwn(PROJECTILE_MATERIALS, raw.material) ? raw.material :
    equipment.projectileMaterial ?? result.material;
  for (const key of ['enableDrag', 'enableErrorSources'] as const) {
    if (typeof raw[key] === 'boolean') result[key] = raw[key];
  }
  return result;
}
