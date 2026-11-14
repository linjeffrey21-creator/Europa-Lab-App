/**
 * Lab4All — Scientific Physics Engine for Projectile Motion
 *
 * Implements:
 * 1. Idealized 2D projectile kinematics under uniform downward gravity with zero air resistance.
 * 2. Realistic Experimental Aerodynamics with quadratic air drag:
 *    F_d = 0.5 * rho * C_d * A * v_rel^2
 *    accounting for air pressure, temperature, altitude, projectile diameter, and material density
 *    (steel, brass, aluminum, hardwood, polymer, ping-pong ball).
 * 3. Realistic Experimental Error Modeling:
 *    - Spring exit velocity repeatability fluctuation (Gaussian jitter)
 *    - Trunnion launch angle alignment mechanical play
 *    - Photogate & manual stopwatch reaction uncertainty
 *    - Bench landing mark reading uncertainty
 * 4. 4th-Order Runge-Kutta (RK4) numerical integrator with sub-millisecond landing interpolation.
 */

export type PhysicsMode = 'ideal' | 'experimental';

export const LANDING_TARGET_RADIUS_M = 0.075;

export interface LaunchParameters {
  /** Launch angle above the horizontal in degrees (−45° to 90°) */
  angle: number;
  /** Initial launch speed at muzzle exit in m/s */
  speed: number;
  /** Launch elevation above tabletop reference plane in meters (0.0 to 5.0 m) */
  height: number;
  /** Downward gravitational acceleration magnitude in m/s² (0.5 to 30 m/s²) */
  gravity: number;
  /** Optional horizontal launch offset x0 in meters (defaults to 0) */
  x0?: number;
  /**
   * Optional target landing elevation y_landing in meters (defaults to 0 for tabletop landing).
   * When landingHeight === height, symmetric level projectile motion is modeled (y_end = y_start).
   */
  landingHeight?: number;
}

export type ProjectileMaterial = 'steel' | 'brass' | 'aluminum' | 'wood' | 'polymer' | 'pingpong';

export interface MaterialProperties {
  name: string;
  densityKgM3: number;
  defaultCd: number;
  fixedMassKg?: number;
}

export const PROJECTILE_MATERIALS: Record<ProjectileMaterial, MaterialProperties> = {
  steel: { name: 'Chrome Steel', densityKgM3: 7850, defaultCd: 0.47 },
  brass: { name: 'Polished Brass', densityKgM3: 8500, defaultCd: 0.47 },
  aluminum: { name: 'Anodized Aluminum', densityKgM3: 2700, defaultCd: 0.47 },
  wood: { name: 'Birch Hardwood', densityKgM3: 680, defaultCd: 0.50 },
  polymer: { name: 'Solid Polymer', densityKgM3: 1150, defaultCd: 0.47 },
  pingpong: { name: 'Lightweight Ping-Pong Sphere', densityKgM3: 84, defaultCd: 0.47, fixedMassKg: 0.0027 },
};

export interface ExperimentalEnvironment {
  /** Physics simulation mode */
  mode: PhysicsMode;
  /** Barometric air pressure in kPa (standard sea level is 101.325 kPa) */
  airPressureKPa: number;
  /** Ambient air temperature in °C (standard 20 °C) */
  temperatureC: number;
  /** Projectile sphere diameter in meters (e.g. 0.025 m for 25 mm ball) */
  projectileDiameter: number;
  /** Projectile material determining sphere mass */
  material: ProjectileMaterial;
  /** Drag coefficient Cd for sphere (standard smooth sphere is ~0.47) */
  dragCoefficient: number;
  /** Enable aerodynamic drag in experimental mode */
  enableDrag: boolean;
  /** Horizontal wind speed in m/s (positive tailwind, negative headwind) */
  windSpeed: number;
  /** Enable random experimental error sources (spring jitter, angle play, sensor noise) */
  enableErrorSources: boolean;
  /** Spring muzzle velocity repeatability variation percentage (e.g. 1.5%) */
  springInconsistencyPct: number;
  /** Trunnion angle mechanical play standard deviation in degrees (e.g. 0.25°) */
  angleJitterDeg: number;
  /** Measurement resolution / reading noise in meters */
  rulerNoiseM: number;
  /** Stopwatch / photogate measurement noise in seconds */
  timingNoiseS: number;
}

export const DEFAULT_EXPERIMENTAL_ENV: ExperimentalEnvironment = {
  mode: 'ideal',
  airPressureKPa: 101.325,
  temperatureC: 20,
  projectileDiameter: 0.025,
  material: 'steel',
  dragCoefficient: 0.47,
  enableDrag: true,
  windSpeed: 0,
  enableErrorSources: true,
  springInconsistencyPct: 1.5,
  angleJitterDeg: 0.25,
  rulerNoiseM: 0.005,
  timingNoiseS: 0.01,
};

export interface TheoreticalSummary {
  /** Initial horizontal velocity component v_0x = v_0 * cos(theta) in m/s */
  vx: number;
  /** Initial vertical velocity component v_0y = v_0 * sin(theta) in m/s */
  vy: number;
  /** Landing elevation above tabletop in meters */
  landingHeight: number;
  /** True when landing elevation equals launch height (symmetric level projectile motion) */
  isSymmetricLaunch: boolean;
  /** Total flight duration until landing in seconds */
  time: number;
  /** Total horizontal displacement (range) from x0 in meters */
  range: number;
  /** Peak vertical elevation above tabletop in meters */
  maxHeight: number;
  /** Time at which peak elevation occurs in seconds */
  apexTime: number;
  /** Horizontal position at apex in meters */
  apexX: number;
  /** Impact speed magnitude at landing in m/s */
  impactSpeed: number;
  /** Impact angle below horizontal in degrees (positive value) */
  impactAngle: number;
  /** Vertical velocity component at impact in m/s (negative or zero) */
  impactVy: number;

  // Experimental / Aerodynamic Metrics
  isExperimental?: boolean;
  idealRange?: number;
  idealTime?: number;
  dragLossRangeM?: number;
  dragLossPct?: number;
  projectileMassKg?: number;
  airDensityKgM3?: number;
}

export interface KinematicState {
  /** Elapsed time t in seconds (clamped to [0, flightTime]) */
  t: number;
  /** Horizontal displacement x(t) from x0 in meters */
  x: number;
  /** Vertical elevation y(t) above landing plane in meters */
  y: number;
  /** Instantaneous horizontal velocity vx(t) in m/s */
  vx: number;
  /** Instantaneous vertical velocity vy(t) in m/s */
  vy: number;
  /** Instantaneous speed magnitude |v(t)| in m/s */
  speed: number;
  /** Instantaneous flight angle in degrees */
  angleDeg: number;
}

/**
 * Calculates humid/dry air density (kg/m³) using ideal gas law:
 * rho = (P * 1000 * M) / (R * T_kelvin)
 */
export function calculateAirDensity(airPressureKPa: number, temperatureC: number): number {
  const pPa = Math.max(0, airPressureKPa) * 1000;
  const tKelvin = Math.max(50, temperatureC + 273.15);
  const molarMass = 0.0289652; // kg/mol dry air
  const R = 8.31446; // J/(mol*K)
  return +((pPa * molarMass) / (R * tKelvin)).toFixed(4);
}

/**
 * Calculates sphere mass in kilograms from diameter and material density.
 */
export function calculateProjectileMass(diameterM: number, material: ProjectileMaterial): number {
  const mat = PROJECTILE_MATERIALS[material] || PROJECTILE_MATERIALS.steel;
  if (mat.fixedMassKg !== undefined) {
    return mat.fixedMassKg;
  }
  const radius = Math.max(0.001, diameterM / 2);
  const volume = (4 / 3) * Math.PI * radius ** 3;
  return +(volume * mat.densityKgM3).toFixed(5);
}

/**
 * Validates launch parameters and throws descriptive errors if invalid.
 */
export function validateLaunchParameters(p: LaunchParameters): void {
  if (!Number.isFinite(p.angle) || p.angle < -45 || p.angle > 90) {
    throw new RangeError(`Launch angle must be between −45° and 90° (got ${p.angle}).`);
  }
  if (!Number.isFinite(p.speed) || p.speed < 0) {
    throw new RangeError(`Initial speed must be non-negative (got ${p.speed}).`);
  }
  if (!Number.isFinite(p.height) || p.height < 0) {
    throw new RangeError(`Launch height must be non-negative (got ${p.height}).`);
  }
  if (!Number.isFinite(p.gravity) || p.gravity <= 0) {
    throw new RangeError(`Gravity must be positive (got ${p.gravity}).`);
  }
  if (p.landingHeight !== undefined && (!Number.isFinite(p.landingHeight) || p.landingHeight < 0)) {
    throw new RangeError(`Landing height must be non-negative (got ${p.landingHeight}).`);
  }
}

function effectiveLandingHeight(p: LaunchParameters): number {
  const target = Math.max(0, p.landingHeight ?? 0);
  const horizontal = Math.abs(p.angle) <= 0.001 && p.height > 0.005;
  const descendingFromTarget = p.angle < 0 && target >= p.height;
  return (horizontal && target >= p.height) || descendingFromTarget ? 0 : target;
}

/**
 * Computes exact idealized theoretical projectile motion metrics (vacuum, uniform gravity).
 */
export function calculateTheoreticalSummary(p: LaunchParameters): TheoreticalSummary {
  validateLaunchParameters(p);
  const rad = (p.angle * Math.PI) / 180;
  const cosTheta = p.angle === 90 ? 0 : p.angle === 0 ? 1 : Math.cos(rad);
  const sinTheta = p.angle === 0 ? 0 : p.angle === 90 ? 1 : Math.sin(rad);

  const vx = p.speed * cosTheta;
  const vy = p.speed * sinTheta;
  const g = p.gravity;
  const h0 = p.height;
  const target = effectiveLandingHeight(p);
  const maxHeight = h0 + (Math.max(0, vy) ** 2) / (2 * g);
  const yLand = target <= maxHeight + 1e-9 ? target : 0;
  const horizontalWithHeight = Math.abs(p.angle) <= 0.001 && h0 > 0.005;
  const isSymmetric = !horizontalWithHeight && p.angle >= 0 && Math.abs(yLand - h0) < 1e-4;

  const apexTime = Math.max(0, vy / g);
  const apexX = (p.x0 ?? 0) + vx * apexTime;

  let time: number;
  if (isSymmetric) {
    // Exact symmetric level launch formula: t = (2 * v0 * sin(theta)) / g
    time = (2 * vy) / g;
  } else {
    // Vertical motion: y(t) = h0 + vy*t - 0.5*g*t^2 = yLand
    // 0.5*g*t^2 - vy*t + (yLand - h0) = 0
    // discriminant = vy^2 + 2*g*(h0 - yLand)
    const discriminant = vy * vy + 2 * g * (h0 - yLand);
    if (discriminant <= 0) {
      time = apexTime;
    } else {
      time = (vy + Math.sqrt(discriminant)) / g;
    }
  }

  const range = vx * time;
  const impactVy = vy - g * time;
  const impactSpeed = isSymmetric ? p.speed : Math.hypot(vx, impactVy);
  const impactAngle = isSymmetric
    ? p.angle
    : impactSpeed > 0
    ? (Math.atan2(Math.abs(impactVy), vx) * 180) / Math.PI
    : 0;

  return {
    vx,
    vy,
    landingHeight: yLand,
    isSymmetricLaunch: isSymmetric,
    time,
    range,
    maxHeight,
    apexTime,
    apexX,
    impactSpeed,
    impactAngle,
    impactVy,
    isExperimental: false,
    idealRange: range,
    idealTime: time,
    dragLossRangeM: 0,
    dragLossPct: 0,
  };
}

/**
 * High-accuracy Runge-Kutta 4th Order (RK4) projectile simulation with quadratic air drag:
 * m * d(v)/dt = m * g - 0.5 * rho * C_d * A * |v_rel| * v_rel
 */
export function calculateExperimentalSummary(
  p: LaunchParameters,
  env: ExperimentalEnvironment = DEFAULT_EXPERIMENTAL_ENV
): TheoreticalSummary {
  validateLaunchParameters(p);
  const ideal = calculateTheoreticalSummary(p);
  if (!env.enableDrag || env.airPressureKPa <= 0.01) {
    return { ...ideal, isExperimental: true };
  }

  const rho = calculateAirDensity(env.airPressureKPa, env.temperatureC);
  const mass = calculateProjectileMass(env.projectileDiameter, env.material);
  const radius = env.projectileDiameter / 2;
  const area = Math.PI * radius * radius;
  const cd = env.dragCoefficient;
  const kDrag = (0.5 * rho * cd * area) / mass;
  const g = p.gravity;
  const w = env.windSpeed || 0;

  let yLand = ideal.landingHeight;

  const rad = (p.angle * Math.PI) / 180;
  let vx = p.speed * Math.cos(rad);
  let vy = p.speed * Math.sin(rad);
  let x = p.x0 ?? 0;
  let y = p.height;
  let t = 0;

  let apexTime = 0;
  let maxHeight = y;
  let apexX = x;
  let passedApex = vy <= 0;

  const dt = 0.0005; // 0.5 ms high-accuracy integration step
  const maxSteps = 100000;
  let step = 0;

  // Derivatives helper for RK4
  const derivatives = (curVx: number, curVy: number) => {
    const vrelX = curVx - w;
    const vrel = Math.hypot(vrelX, curVy);
    const ax = -kDrag * vrel * vrelX;
    const ay = -g - kDrag * vrel * curVy;
    return { ax, ay };
  };

  while ((y > yLand || vy > 0) && step < maxSteps) {
    step++;
    const prevX = x;
    const prevY = y;
    const prevVx = vx;
    const prevVy = vy;
    const prevT = t;

    // RK4 integration step
    const k1 = derivatives(vx, vy);
    const k2 = derivatives(vx + 0.5 * dt * k1.ax, vy + 0.5 * dt * k1.ay);
    const k3 = derivatives(vx + 0.5 * dt * k2.ax, vy + 0.5 * dt * k2.ay);
    const k4 = derivatives(vx + dt * k3.ax, vy + dt * k3.ay);

    const ax = (k1.ax + 2 * k2.ax + 2 * k3.ax + k4.ax) / 6;
    const ay = (k1.ay + 2 * k2.ay + 2 * k3.ay + k4.ay) / 6;

    x += vx * dt + 0.5 * ax * dt * dt;
    y += vy * dt + 0.5 * ay * dt * dt;
    vx += ax * dt;
    vy += ay * dt;
    t += dt;

    if (!passedApex) {
      if (y > maxHeight) {
        maxHeight = y;
        apexTime = t;
        apexX = x;
      }
      if (vy <= 0) {
        passedApex = true;
      }
    }

    if (prevY >= yLand && y <= yLand && vy <= 0) {
      // Sub-millisecond linear interpolation to exact landing elevation y = yLand
      const frac = prevY !== y ? (yLand - prevY) / (y - prevY) : 0;
      t = prevT + frac * dt;
      x = prevX + frac * (x - prevX);
      vx = prevVx + frac * (vx - prevVx);
      vy = prevVy + frac * (vy - prevVy);
      y = yLand;
      break;
    }
    // A raised target may be reachable in vacuum but above the apex with drag.
    if (vy <= 0 && prevY < yLand && y < yLand) yLand = 0;
  }

  const range = x - (p.x0 ?? 0);
  const impactSpeed = Math.hypot(vx, vy);
  const impactAngle = impactSpeed > 0 ? (Math.atan2(Math.abs(vy), vx) * 180) / Math.PI : 0;
  const comparisonRange = yLand === ideal.landingHeight ? ideal.range : calculateTheoreticalSummary({ ...p, landingHeight: yLand }).range;
  const dragLossRangeM = +(comparisonRange - range).toFixed(4);
  const dragLossPct = comparisonRange > 0 ? +((dragLossRangeM / comparisonRange) * 100).toFixed(2) : 0;

  return {
    vx: +(p.speed * Math.cos(rad)).toFixed(4),
    vy: +(p.speed * Math.sin(rad)).toFixed(4),
    landingHeight: yLand,
    isSymmetricLaunch: ideal.isSymmetricLaunch && yLand === ideal.landingHeight,
    time: +t.toFixed(4),
    range: +range.toFixed(4),
    maxHeight: +maxHeight.toFixed(4),
    apexTime: +apexTime.toFixed(4),
    apexX: +apexX.toFixed(4),
    impactSpeed: +impactSpeed.toFixed(4),
    impactAngle: +impactAngle.toFixed(2),
    impactVy: +vy.toFixed(4),
    isExperimental: true,
    idealRange: ideal.range,
    idealTime: ideal.time,
    dragLossRangeM,
    dragLossPct,
    projectileMassKg: mass,
    airDensityKgM3: rho,
  };
}

/**
 * Unified summary calculator taking PhysicsMode into account.
 */
export function calculateTrajectorySummary(
  p: LaunchParameters,
  env?: ExperimentalEnvironment
): TheoreticalSummary {
  if (env && env.mode === 'experimental') {
    return calculateExperimentalSummary(p, env);
  }
  return calculateTheoreticalSummary(p);
}

/**
 * Generates an experimental trial measurement with realistic sources of error:
 * - Gaussian spring launch speed consistency variation
 * - Mechanical trunnion play in launch angle
 * - Air resistance drag calculation
 * - Quantized stopwatch & metric ruler witness reading
 */
export function simulateExperimentalTrial(
  p: LaunchParameters,
  env: ExperimentalEnvironment = DEFAULT_EXPERIMENTAL_ENV
): TheoreticalSummary & {
  actualAngle: number;
  actualSpeed: number;
  measuredTime: number;
  measuredRange: number;
} {
  let launchAngle = p.angle;
  let launchSpeed = p.speed;

  if (env.enableErrorSources) {
    // Box-Muller normal distribution generator
    const u1 = Math.max(1e-6, Math.random());
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);

    const speedSigma = p.speed * (env.springInconsistencyPct / 100);
    launchSpeed = Math.max(0, p.speed + z0 * speedSigma);

    const angleSigma = env.angleJitterDeg;
    launchAngle = Math.max(p.angle < 0 ? -45 : 0, Math.min(90, p.angle + z1 * angleSigma));
  }

  const expParams: LaunchParameters = {
    ...p,
    angle: +launchAngle.toFixed(2),
    speed: +launchSpeed.toFixed(3),
  };

  const expSummary = env.enableDrag
    ? calculateExperimentalSummary(expParams, env)
    : calculateTheoreticalSummary(expParams);

  let measuredTime = expSummary.time;
  let measuredRange = expSummary.range;

  if (env.enableErrorSources) {
    if (env.timingNoiseS > 0) {
      measuredTime = quantizeToResolution(
        measuredTime + (Math.random() - 0.5) * env.timingNoiseS * 0.5,
        env.timingNoiseS
      );
    }
    if (env.rulerNoiseM > 0) {
      measuredRange = quantizeToResolution(
        measuredRange + (Math.random() - 0.5) * env.rulerNoiseM * 0.5,
        env.rulerNoiseM
      );
    }
  }

  return {
    ...expSummary,
    actualAngle: expParams.angle,
    actualSpeed: expParams.speed,
    measuredTime: +measuredTime.toFixed(3),
    measuredRange: +measuredRange.toFixed(3),
  };
}

/**
 * Evaluates instantaneous position and velocity at elapsed time t (seconds).
 */
export function evaluateProjectileState(
  p: LaunchParameters,
  t: number,
  env?: ExperimentalEnvironment
): KinematicState {
  if (env && env.mode === 'experimental' && env.enableDrag) {
    return evaluateExperimentalState(p, t, env);
  }
  const summary = calculateTheoreticalSummary(p);
  const clampedT = Math.max(0, Math.min(Number.isFinite(t) ? t : 0, summary.time));
  const x0 = p.x0 ?? 0;
  const yLand = summary.landingHeight;

  const x = x0 + summary.vx * clampedT;
  const rawY = p.height + summary.vy * clampedT - 0.5 * p.gravity * clampedT * clampedT;
  const y = clampedT >= summary.time ? yLand : rawY;
  const vx = summary.vx;
  const vy = summary.vy - p.gravity * clampedT;
  const speed = Math.hypot(vx, vy);
  const angleDeg = speed > 0 ? (Math.atan2(vy, vx) * 180) / Math.PI : 0;

  return {
    t: clampedT,
    x,
    y,
    vx,
    vy,
    speed,
    angleDeg,
  };
}

/**
 * Evaluates instantaneous position and velocity under quadratic drag at elapsed time t.
 */
export function evaluateExperimentalState(
  p: LaunchParameters,
  t: number,
  env: ExperimentalEnvironment = DEFAULT_EXPERIMENTAL_ENV
): KinematicState {
  const summary = calculateExperimentalSummary(p, env);
  const clampedT = Math.max(0, Math.min(Number.isFinite(t) ? t : 0, summary.time));
  if (clampedT <= 1e-6) {
    const rad = (p.angle * Math.PI) / 180;
    return {
      t: 0,
      x: p.x0 ?? 0,
      y: p.height,
      vx: p.speed * Math.cos(rad),
      vy: p.speed * Math.sin(rad),
      speed: p.speed,
      angleDeg: p.angle,
    };
  }

  const rho = calculateAirDensity(env.airPressureKPa, env.temperatureC);
  const mass = calculateProjectileMass(env.projectileDiameter, env.material);
  const radius = env.projectileDiameter / 2;
  const area = Math.PI * radius * radius;
  const cd = env.dragCoefficient;
  const kDrag = (0.5 * rho * cd * area) / mass;
  const g = p.gravity;
  const w = env.windSpeed || 0;

  const rad = (p.angle * Math.PI) / 180;
  let vx = p.speed * Math.cos(rad);
  let vy = p.speed * Math.sin(rad);
  let x = p.x0 ?? 0;
  let y = p.height;
  let curT = 0;

  const dt = 0.001;
  const steps = Math.floor(clampedT / dt);
  const remainder = clampedT - steps * dt;

  const derivatives = (curVx: number, curVy: number) => {
    const vrelX = curVx - w;
    const vrel = Math.hypot(vrelX, curVy);
    const ax = -kDrag * vrel * vrelX;
    const ay = -g - kDrag * vrel * curVy;
    return { ax, ay };
  };

  for (let i = 0; i < steps; i++) {
    const k1 = derivatives(vx, vy);
    const k2 = derivatives(vx + 0.5 * dt * k1.ax, vy + 0.5 * dt * k1.ay);
    const k3 = derivatives(vx + 0.5 * dt * k2.ax, vy + 0.5 * dt * k2.ay);
    const k4 = derivatives(vx + dt * k3.ax, vy + dt * k3.ay);

    const ax = (k1.ax + 2 * k2.ax + 2 * k3.ax + k4.ax) / 6;
    const ay = (k1.ay + 2 * k2.ay + 2 * k3.ay + k4.ay) / 6;

    x += vx * dt + 0.5 * ax * dt * dt;
    y += vy * dt + 0.5 * ay * dt * dt;
    vx += ax * dt;
    vy += ay * dt;
    curT += dt;
  }

  if (remainder > 1e-7) {
    const k1 = derivatives(vx, vy);
    x += vx * remainder;
    y += vy * remainder;
    vx += k1.ax * remainder;
    vy += k1.ay * remainder;
  }

  const yLand = summary.landingHeight;
  const speed = Math.hypot(vx, vy);
  const angleDeg = speed > 0 ? (Math.atan2(vy, vx) * 180) / Math.PI : 0;

  return {
    t: clampedT,
    x,
    y: clampedT >= summary.time ? yLand : y,
    vx,
    vy,
    speed,
    angleDeg,
  };
}

/**
 * Generates an array of sampled trajectory states across [0, maxTime].
 */
export function sampleTrajectory(
  p: LaunchParameters,
  steps = 64,
  upToTime?: number,
  env?: ExperimentalEnvironment
): KinematicState[] {
  const summary = calculateTrajectorySummary(p, env);
  const targetTime = upToTime !== undefined ? Math.min(upToTime, summary.time) : summary.time;
  const count = Math.max(2, Math.floor(steps));
  const samples: KinematicState[] = [];
  for (let i = 0; i <= count; i++) {
    const t = (targetTime * i) / count;
    samples.push(evaluateProjectileState(p, t, env));
  }
  return samples;
}

/**
 * Quantizes a value to an explicit instrument resolution step (deterministic).
 */
export function quantizeToResolution(value: number, resolution: number): number {
  if (!Number.isFinite(resolution) || resolution <= 0) return value;
  return Math.round(value / resolution) * resolution;
}
