/**
 * Lab4All — Main Virtual Physics Laboratory Application
 *
 * Preserves the clean visual identity and layout of the original prototype while
 * fulfilling all 16 parts of the Major Development Directive:
 * - Realistic 3D classroom projectile apparatus with 4 instant apparatus presets
 * - Photo & specification-to-parametric-3D reconstruction pipeline with Teacher Review
 * - Synchronized kinematics & tabletop clearance protection
 * - Full experimental process: Hypothesis -> Configure -> Run -> Measure -> Record -> Analyze
 * - Optional Instrument Resolution Practice Mode (Part 6.4)
 * - Functional Teacher Mode with assignment builder, locked variables, hidden theory, and URL sharing
 * - Skippable 30-second Hackathon Guided Tour & Quick Apparatus Switcher
 */

import React, { useEffect, useRef, useState } from 'react';
import type {
  LaunchParameters,
  PhysicsMode,
  ExperimentalEnvironment,
  ProjectileMaterial,
  TheoreticalSummary,
} from '../physics/projectile.ts';
import {
  calculateTheoreticalSummary,
  calculateExperimentalSummary,
  simulateExperimentalTrial,
  calculateAirDensity,
  calculateProjectileMass,
  calculateProjectileForces,
  evaluateProjectileState,
  LANDING_TARGET_RADIUS_M,
  sampleTrajectory,
  quantizeToResolution,
  DEFAULT_EXPERIMENTAL_ENV,
  PROJECTILE_MATERIALS,
} from '../physics/projectile.ts';
import type { OperatingLimits, ProjectileApparatusSpec } from '../equipment/schema.ts';
import {
  CLASSROOM_APPARATUS_PRESETS,
  VERNIER_VPL_ID,
  PASCO_MINI_ID,
  VERNIER_VPL_LAUNCH_HEIGHT,
  VERNIER_VPL_GATE_SPACING,
  computeApparatusKinematicsPose,
  computeFixedHeightAngleRange,
  computeMinimumClearanceHeight,
} from '../equipment/schema.ts';
import type { EquipmentExtractionResult } from '../ai/extractor.ts';
import type { CameraViewMode, LockedCameraPose } from '../scene/LabViewport.ts';
import { LabViewportCanvas, ReconstructionPreviewCanvas, computeBenchRulerLayout } from '../scene/LabViewport.ts';
import { soundManager } from '../scene/audio.ts';
import type { GraphTabMode, RecordedTrial, StudentPlottedPoint, PlottableVariableKey } from './ScientificCharts.ts';
import { ScientificCharts, displayAxisExpression } from './ScientificCharts.ts';
import type { GraphAxes } from './graph-expressions.ts';
import { compileAxis } from './graph-expressions.ts';
import { EquipmentModal } from './EquipmentModal.ts';
import { ApparatusPicker } from './ApparatusPicker.ts';
import type { ExperimentVariable, TeacherAssignmentConfig } from './TeacherModal.ts';
import { TeacherModal, SAMPLE_TEACHER_ACTIVITIES, EXPERIMENT_VARIABLE_LABELS, normalizeAssignmentVariables } from './TeacherModal.ts';
import {
  assignmentProgressKey, readAssignmentEnvironment, readAssignmentEquipment, readAssignmentLimits,
  readAssignmentProgress, writeAssignmentProgress,
} from './assignmentSetup.ts';
import { SAMPLE_TEACHER_NOTE_IMAGES } from './chalkboard-notes.ts';
import {
  IconTableStand,
  IconEdgeClamp,
  IconVacuum,
  IconExperiment,
  IconTarget,
  IconLevel,
  IconLaunch,
  IconSpeedometer,
  IconSlope,
  IconTrajectory,
  IconCompare,
  IconSliders,
  IconClose,
  IconReset,
  IconChartBars,
  IconPenguin,
  fmtSub,
} from './icons.ts';

const h = React.createElement;
function renderReadings(rows: ReadonlyArray<readonly [React.ReactNode, string]>, layout = '') {
  return h('dl', { className: 'readout-grid ' + layout },
    ...rows.map(([label, value], index) =>
      h('div', { key: index }, h('dt', null, label), h('dd', null, value))
    )
  );
}


const DEFAULT_LAUNCH_PARAMS: LaunchParameters = {
  angle: 40,
  speed: 4.0,
  height: 0.65,
  landingHeight: 0.65,
  gravity: 9.81,
};

const DEFAULT_TEACHER_CONFIG: TeacherAssignmentConfig = {
  ...SAMPLE_TEACHER_ACTIVITIES['open-exploration'],
};

const VARIABLE_TOOLTIPS: Record<keyof LaunchParameters, string> = {
  angle:
    'Launch inclination angle θ above the horizontal (degrees). Rotates the 3D barrel trunnion and protractor pointer.',
  speed:
    'Initial muzzle exit speed v₀ (m/s) as the sphere leaves the barrel. Sets initial velocity components v₀ cos(θ) and v₀ sin(θ).',
  height:
    'Vertical elevation h₀ (meters) of the projectile bottom above the bench landing mat at launch.',
  gravity:
    'Downward gravitational acceleration g (m/s²). Earth standard is 9.81 m/s² (Moon: 1.62 m/s², Mars: 3.72 m/s²).',
  x0: 'Horizontal reference offset.',
  landingHeight:
    'A positive target is above the launch point. A negative target is below it.',
};

function getInitialEquipment(): ProjectileApparatusSpec {
  if (typeof window !== 'undefined') {
    const sp = new URLSearchParams(window.location.search);
    const p = sp.get('preset');
    if (p && Object.hasOwn(CLASSROOM_APPARATUS_PRESETS, p)) return CLASSROOM_APPARATUS_PRESETS[p];
  }
  return CLASSROOM_APPARATUS_PRESETS['boreal-fundamentals-8884857'];
}

function clampVernierSettings(params: LaunchParameters): LaunchParameters {
  const { maxAngle, maxSpeed } = CLASSROOM_APPARATUS_PRESETS[VERNIER_VPL_ID].limits!;
  const angle = Math.max(0, Math.min(maxAngle!, params.angle));
  const speed = Math.max(0, Math.min(maxSpeed!, params.speed));
  return angle === params.angle && speed === params.speed ? params : { ...params, angle, speed };
}

function getInitialParams(): LaunchParameters {
  const p: LaunchParameters = { ...DEFAULT_LAUNCH_PARAMS };
  if (typeof window !== 'undefined') {
    const sp = new URLSearchParams(window.location.search);
    const qA = sp.get('angle');
    const qV = sp.get('speed');
    const qH = sp.get('height');
    const qL = sp.get('landing') || sp.get('landing_mode');
    if (qA && Number.isFinite(Number(qA))) p.angle = Number(qA);
    if (qV && Number.isFinite(Number(qV))) p.speed = Number(qV);
    if (qH && Number.isFinite(Number(qH))) {
      p.height = Number(qH);
      p.landingHeight = Number(qH);
    }
    if (sp.get('preset') === VERNIER_VPL_ID && !qH) {
      const spec = CLASSROOM_APPARATUS_PRESETS[VERNIER_VPL_ID];
      const mount = sp.get('mount') || sp.get('mount_mode');
      p.height = computeMinimumClearanceHeight(spec, p.angle, mount === 'clamp' ? 'clamp' : 'stand');
      p.landingHeight = p.height;
    }
    if (qL === 'tabletop') p.landingHeight = 0;
    else if (qL === 'same') p.landingHeight = p.height;
  }
  return p;
}

function getInitialLandingMode(): 'same' | 'tabletop' | 'custom' {
  if (typeof window !== 'undefined') {
    const sp = new URLSearchParams(window.location.search);
    const qL = sp.get('landing') || sp.get('landing_mode');
    if (qL === 'tabletop') return 'tabletop';
    if (qL === 'same') return 'same';
    if (qL === 'custom') return 'custom';
  }
  return 'same';
}

export const App: React.FC = () => {
  const [sharedAssignment] = useState(() => typeof window !== 'undefined' && window.location.hash.startsWith('#assignment='));
  const [savedAssignment] = useState(() => {
    if (!sharedAssignment) return null;
    const key = assignmentProgressKey(window.location.hash);
    return { key, progress: readAssignmentProgress(key) };
  });
  const [assignmentReady, setAssignmentReady] = useState(false);
  const [invalidAssignment, setInvalidAssignment] = useState<string | null>(null);
  const [params, setParams] = useState<LaunchParameters>(() => sharedAssignment ? { ...DEFAULT_LAUNCH_PARAMS } : getInitialParams());
  const [landingMode, setLandingMode] = useState<'same' | 'tabletop' | 'custom'>(() => sharedAssignment ? 'same' : getInitialLandingMode());
  const [quickVariable, setQuickVariable] = useState<ExperimentVariable | null>(null);
  const [teacherConfig, setTeacherConfig] =
    useState<TeacherAssignmentConfig>(DEFAULT_TEACHER_CONFIG);
  const [mode, setMode] = useState<'student' | 'teacher'>('student');
  const [activeModal, setActiveModal] = useState<'about' | 'import' | 'teacher' | 'tour' | null>(() => {
    if (sharedAssignment) return null;
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const m = sp.get('modal');
      if (m === 'import' || m === 'teacher' || m === 'about' || m === 'tour') return m;
    }
    return null;
  });
  const [openManualOnImport, setOpenManualOnImport] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('editor') === '1' || sp.get('review') === '1') return true;
    }
    return false;
  });

  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [simState, setSimState] = useState<'ready' | 'running' | 'paused' | 'landed'>('ready');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [trials, setTrials] = useState<RecordedTrial[]>(() => {
    if (sharedAssignment) return savedAssignment?.progress.trials ?? [];
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('sample_trials') === '1') {
        return [
          { id: 1, angle: 15, speed: 4.0, height: 0.65, time: 0.44, maxHeight: 0.70, range: 1.25, impactSpeed: 4.98, apparatusName: 'Boreal Fundamentals', isExperimental: false },
          { id: 2, angle: 30, speed: 4.0, height: 0.65, time: 0.61, maxHeight: 0.85, range: 1.62, impactSpeed: 4.98, apparatusName: 'Boreal Fundamentals', isExperimental: false },
          { id: 3, angle: 45, speed: 4.0, height: 0.65, time: 0.74, maxHeight: 1.06, range: 1.68, impactSpeed: 4.98, apparatusName: 'Boreal Fundamentals', isExperimental: false },
          { id: 4, angle: 60, speed: 4.0, height: 0.65, time: 0.84, maxHeight: 1.26, range: 1.45, impactSpeed: 4.98, apparatusName: 'Boreal Fundamentals', isExperimental: false },
          { id: 5, angle: 75, speed: 4.0, height: 0.65, time: 0.90, maxHeight: 1.41, range: 0.88, impactSpeed: 4.98, apparatusName: 'Boreal Fundamentals', isExperimental: false },
        ];
      }
      if (sp.get('sample_trials') === 'constant_vx') {
        return [
          { id: 1, angle: 30, speed: 4.0, height: 0.20, time: 0.45, maxHeight: 0.40, range: 1.56, impactSpeed: 4.47, apparatusName: 'Boreal Fundamentals', isExperimental: false },
          { id: 2, angle: 30, speed: 4.0, height: 0.50, time: 0.58, maxHeight: 0.70, range: 2.01, impactSpeed: 5.09, apparatusName: 'Boreal Fundamentals', isExperimental: false },
          { id: 3, angle: 30, speed: 4.0, height: 0.80, time: 0.69, maxHeight: 1.00, range: 2.39, impactSpeed: 5.63, apparatusName: 'Boreal Fundamentals', isExperimental: false },
        ];
      }
    }
    return [];
  });

  // Visual & Instrument toggles
  const [showTrajectory, setShowTrajectory] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [showForces, setShowForces] = useState<boolean>(true);
  const [showAirflow, setShowAirflow] = useState(true);
  const [lightweight, setLightweight] = useState<boolean>(false);
  const [instrumentPracticeMode, setInstrumentPracticeMode] = useState<boolean>(false);

  // Classroom Chalkboard Mode & Custom Teacher Image/Diagram
  const [chalkboardMode, setChalkboardMode] = useState<'default' | 'erased' | 'custom_image'>(() => {
    if (sharedAssignment) return 'default';
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const qp = sp.get('board');
      if (qp === 'erased' || qp === 'custom_image' || qp === 'default') return qp;
      const saved = localStorage.getItem('lab4all_chalkboard_mode');
      if (saved === 'erased' || saved === 'custom_image' || saved === 'default') return saved;
    }
    return 'default';
  });
  const [chalkboardCustomImage, setChalkboardCustomImage] = useState<string | null>(() => {
    if (sharedAssignment) return null;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('lab4all_chalkboard_image');
      if (saved) return saved;
    }
    return null;
  });

  useEffect(() => {
    try {
      localStorage.setItem('lab4all_chalkboard_mode', chalkboardMode);
      if (chalkboardCustomImage && chalkboardCustomImage.length < 2_000_000) {
        localStorage.setItem('lab4all_chalkboard_image', chalkboardCustomImage);
      } else if (!chalkboardCustomImage) {
        localStorage.removeItem('lab4all_chalkboard_image');
      }
    } catch {
      // ignore storage quota errors
    }
  }, [chalkboardMode, chalkboardCustomImage]);

  // Student Notes & Predictions
  const [predictedRangeInput, setPredictedRangeInput] = useState<string>('');

  const [resetKey, setResetKey] = useState<number>(0);
  const [cameraLocked, setCameraLocked] = useState(false);
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false);
  const cameraMenuRef = useRef<HTMLDivElement | null>(null);
  const cameraCubeRef = useRef<HTMLDivElement | null>(null);
  const lockedCameraPose = useRef<LockedCameraPose | null>(null);
  const [viewMode, setViewMode] = useState<CameraViewMode>(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const qV = sp.get('view');
      if (qV === 'close' || qV === 'side' || qV === 'top' || qV === 'experiment') return qV;
    }
    return 'experiment';
  });
  const workflowNavRef = useRef<HTMLElement | null>(null);
  const [graphTab, setGraphTab] = useState<GraphTabMode>('student_plot');

  function goToWorkflowStage(stage: 'run' | 'graph') {
    setActiveWorkflowTab(stage);
    const nav = workflowNavRef.current;
    nav?.querySelector<HTMLButtonElement>(stage === 'run' ? '#tab-run-btn' : '#tab-data-graph-btn')
      ?.focus({ preventScroll: true });
    nav?.scrollIntoView({ block: 'start' });
  }

  const [activeWorkflowTab, setActiveWorkflowTab] = useState<'setup' | 'run' | 'record' | 'graph'>(() => {
    if (sharedAssignment) return savedAssignment?.progress.tab ?? 'run';
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const qT = sp.get('tab');
      if (qT === 'setup' || qT === 'run' || qT === 'record' || qT === 'graph') return qT;
    }
    return 'run';
  });
  const [autoPlotTrials, setAutoPlotTrials] = useState<boolean>(() => savedAssignment?.progress.autoPlot ?? false);
  const [manuallyPlottedTrialIds, setManuallyPlottedTrialIds] = useState<number[]>(() => {
    if (sharedAssignment) return savedAssignment?.progress.plottedTrials ?? [];
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('sample_trials') === '1' || sp.get('sample_trials') === 'constant_vx') {
        return [1, 2, 3, 4, 5];
      }
    }
    return [];
  });
  const [customPoints, setCustomPoints] = useState<StudentPlottedPoint[]>(() => savedAssignment?.progress.points ?? []);
  const [chartAxes, setChartAxes] = useState<GraphAxes | undefined>(() => savedAssignment?.progress.axes);
  const [allTrialColumns, setAllTrialColumns] = useState(false);
  const [chartXAxisVar] = useState<PlottableVariableKey>(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('x_var') === 'time' || sp.get('chart_vars') === 'time_range') return 'time';
      if (sp.get('x_var') === 'sin2Angle') return 'sin2Angle';
    }
    return 'angle';
  });
  const [chartYAxisVar] = useState<PlottableVariableKey>('range');
  const [chartShowTheoryCurve, setChartShowTheoryCurve] = useState<boolean>(false);
  const [chartShowLobf, setChartShowLobf] = useState<boolean>(() => {
    if (sharedAssignment) return savedAssignment?.progress.showLine ?? false;
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      return sp.get('open_slope') === '1';
    }
    return false;
  });
  const [chartLobf, setChartLobf] = useState<{ x1: number; y1: number; x2: number; y2: number }>(() => savedAssignment?.progress.line ?? { x1: 0, y1: 0, x2: 0, y2: 0 });
  const [autoRecord, setAutoRecord] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(() => soundManager.isMuted());
  const [isHudCollapsed, setIsHudCollapsed] = useState<boolean>(true);
  const [decimalPlaces, setDecimalPlaces] = useState(3);
  const formatMeasurement = (value: number) => value.toFixed(decimalPlaces);
  const renderDecimalPlaces = () => h('label', { className: 'measurement-precision' },
    'Decimal places',
    h('select', {
      'aria-label': 'Decimal places',
      value: decimalPlaces,
      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setDecimalPlaces(Number(e.currentTarget.value)),
    }, ...[0, 1, 2, 3, 4, 5, 6].map(value => h('option', { key: value, value }, value)))
  );
  const hasAutoRecordedCurrentRunRef = useRef<boolean>(false);

  // Active 3D Apparatus & Operating Limits
  const [equipment, setEquipment] = useState<ProjectileApparatusSpec>(() => sharedAssignment ? CLASSROOM_APPARATUS_PRESETS['boreal-fundamentals-8884857'] : getInitialEquipment());
  const [mountMode, setMountMode] = useState<'stand' | 'clamp'>(() => {
    if (sharedAssignment) return 'stand';
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const qM = sp.get('mount') || sp.get('mount_mode');
      if (qM === 'stand' || qM === 'clamp') return qM;
    }
    return getInitialEquipment().visual.mount_type === 'clamp' ? 'clamp' : 'stand';
  });
  const [limits, setLimits] = useState<OperatingLimits | null>(null);
  const isVernierVPL = equipment.id === VERNIER_VPL_ID;
  const activeLimits = isVernierVPL || equipment.id === PASCO_MINI_ID ? equipment.limits : limits;
  const [importedMeta, setImportedMeta] = useState<EquipmentExtractionResult | null>(null);
  const [showQuickStartBanner, setShowQuickStartBanner] = useState<boolean>(false);

  // Physics Mode & Realistic Environmental Aerodynamics
  const [physicsMode, setPhysicsMode] = useState<PhysicsMode>('ideal');
  const [experimentalEnv, setExperimentalEnv] = useState<ExperimentalEnvironment>(() => ({
    ...DEFAULT_EXPERIMENTAL_ENV,
    projectileDiameter: CLASSROOM_APPARATUS_PRESETS['lab4all-precision-mk2'].dimensions.projectileDiameter,
  }));

  useEffect(() => {
    setExperimentalEnv((prev) => ({
      ...prev,
      projectileDiameter: equipment.dimensions.projectileDiameter,
    }));
  }, [equipment.dimensions.projectileDiameter]);

  const preserveAssignmentMaterial = useRef(false);
  useEffect(() => {
    if (sharedAssignment) return;
    if (preserveAssignmentMaterial.current) {
      preserveAssignmentMaterial.current = false;
      return;
    }
    const material = equipment.projectileMaterial;
    if (material) setExperimentalEnv(previous => ({ ...previous, material }));
  }, [equipment.id, equipment.projectileMaterial, sharedAssignment]);

  const lastFrameTimeRef = useRef<number | null>(null);

  // Parse shared assignment URL hash on mount if present
  useEffect(() => {
    // Dismiss Callisto loading screen with a smooth cosmic fade transition unless hold_loader is set
    const searchParams = new URLSearchParams(window.location.search);
    const holdLoader = searchParams.get('hold_loader') === '1';
    const dismissLoader = searchParams.get('dismiss_loader') === '1' || searchParams.get('no_loader') === '1';

    const loader = document.getElementById('callisto-loader');
    if (loader && dismissLoader) {
      try {
        loader.remove();
      } catch {}
    } else if (loader && !holdLoader) {
      setTimeout(() => {
        loader.classList.add('fade-out');
        setTimeout(() => {
          try {
            loader.remove();
          } catch {}
        }, 750);
      }, 500);
    }

    // Support instant preset loading via ?preset=...
    const urlPreset = searchParams.get('preset');
    if (!sharedAssignment && urlPreset && Object.hasOwn(CLASSROOM_APPARATUS_PRESETS, urlPreset)) {
      setEquipment(CLASSROOM_APPARATUS_PRESETS[urlPreset]);
    }

    // Support query parameters for testing and deep linking (?angle=61&speed=4&landing=same)
    const qAngle = searchParams.get('angle');
    const qSpeed = searchParams.get('speed');
    const qHeight = searchParams.get('height');
    const qLandingMode = searchParams.get('landing_mode') || searchParams.get('landing');
    if (!sharedAssignment && (qAngle || qSpeed || qHeight || qLandingMode)) {
      setParams((prev) => {
        const next = { ...prev };
        if (qAngle && Number.isFinite(Number(qAngle))) next.angle = Number(qAngle);
        if (qSpeed && Number.isFinite(Number(qSpeed))) next.speed = Number(qSpeed);
        if (qHeight && Number.isFinite(Number(qHeight))) next.height = Number(qHeight);
        if (qLandingMode === 'same') {
          next.landingHeight = next.height;
          setLandingMode('same');
        } else if (qLandingMode === 'tabletop') {
          next.landingHeight = 0;
          setLandingMode('tabletop');
        }
        return next;
      });
    }

    if (!sharedAssignment) return;
    try {
      const decoded = JSON.parse(decodeURIComponent(atob(window.location.hash.slice('#assignment='.length))));
      if (!decoded?.p || !decoded.adj || typeof decoded.adj !== 'object') throw new Error('Invalid assignment');
      calculateTheoreticalSummary(decoded.p);
      const assignmentEquipment = decoded.spec ? readAssignmentEquipment(decoded.spec) :
        typeof decoded.eqId === 'string' && Object.hasOwn(CLASSROOM_APPARATUS_PRESETS, decoded.eqId)
          ? CLASSROOM_APPARATUS_PRESETS[decoded.eqId] : undefined;
      if ((decoded.spec || decoded.eqId) && !assignmentEquipment) throw new Error('Invalid assignment equipment');
      const selectedEquipment = assignmentEquipment ?? CLASSROOM_APPARATUS_PRESETS['boreal-fundamentals-8884857'];
      const mount = decoded.mount === 'stand' || decoded.mount === 'clamp' ? decoded.mount
        : assignmentEquipment?.visual.mount_type === 'clamp' ? 'clamp' : 'stand';
      const board = decoded.cm === 'erased' || decoded.cm === 'custom_image' ? decoded.cm : 'default';
      const boardImage = typeof decoded.ci === 'string' ? decoded.ci : null;
      const assignmentPhysics = decoded.physics === 'experimental' ? 'experimental' : 'ideal';
      const studentVariables = normalizeAssignmentVariables(decoded.adj, decoded.iv);
      if (!studentVariables.adjustable.height &&
          computeMinimumClearanceHeight(selectedEquipment, decoded.p.angle, mount) > decoded.p.height + 1e-7) {
        setInvalidAssignment('The locked launch height leaves too little room for the launcher. Ask your teacher for an updated link.');
        return;
      }
      setTeacherConfig({
        ...DEFAULT_TEACHER_CONFIG,
        title: typeof decoded.t === 'string' && decoded.t.trim() ? decoded.t : 'Projectile motion assignment',
        question: typeof decoded.q === 'string' ? decoded.q : '',
        instructions: typeof decoded.i === 'string' ? decoded.i : '',
        ...studentVariables,
        requiredTrials: Number.isFinite(decoded.rt) ? Math.max(1, Math.min(100, Math.round(decoded.rt))) : 3,
        targetCupDistanceM: Number.isFinite(decoded.tc) && decoded.tc > 0 ? decoded.tc : null,
        showTheory: decoded.st === true, params: decoded.p,
        solveFor: decoded.sf === 'gravity' ? 'gravity' : decoded.sf === 'speed' || decoded.hs === true ? 'speed' : '',
        chalkboardMode: board, chalkboardCustomImage: boardImage,
      });
      setParams(decoded.p);
      setLandingMode(decoded.p.landingHeight === 0 ? 'tabletop' :
        decoded.p.landingHeight == null || decoded.p.landingHeight === decoded.p.height ? 'same' : 'custom');
      setMountMode(mount);
      setChalkboardMode(board);
      setChalkboardCustomImage(boardImage);
      setPhysicsMode(assignmentPhysics);
      setExperimentalEnv(readAssignmentEnvironment(decoded.env, assignmentPhysics, selectedEquipment));
      setEquipment(selectedEquipment);
      setLimits(decoded.limits === undefined ? selectedEquipment.limits ?? null : readAssignmentLimits(decoded.limits));
      setAssignmentReady(true);
    } catch {
      setInvalidAssignment('This assignment link is incomplete or invalid. Ask your teacher for a new link.');
    }
  }, [sharedAssignment]);

  useEffect(() => {
    if (!assignmentReady || !savedAssignment) return;
    writeAssignmentProgress(savedAssignment.key, {
      trials, plottedTrials: manuallyPlottedTrialIds, points: customPoints, axes: chartAxes,
      autoPlot: autoPlotTrials, showLine: chartShowLobf, line: chartLobf,
      tab: activeWorkflowTab === 'graph' ? 'graph' : 'run',
    });
  }, [assignmentReady, savedAssignment, trials, manuallyPlottedTrialIds, customPoints, chartAxes,
    autoPlotTrials, chartShowLobf, chartLobf, activeWorkflowTab]);

  useEffect(() => {
    const onHashChange = () => {
      if (sharedAssignment || window.location.hash.startsWith('#assignment=')) window.location.reload();
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [sharedAssignment]);

  const isExp = physicsMode === 'experimental' && Boolean(experimentalEnv.enableDrag);
  const idealSummary = calculateTheoreticalSummary(params);
  const activeSummary = isExp
    ? calculateExperimentalSummary(params, experimentalEnv)
    : idealSummary;
  const summary = activeSummary;
  const liveState = evaluateProjectileState(params, elapsedTime, experimentalEnv);

  // Live Newtonian Forces (FBD)
  const projMaterial = isExp ? experimentalEnv.material : equipment.projectileMaterial ?? 'steel';
  const flightAir = isExp ? experimentalEnv : undefined;
  const { mass: liveMassKg, weight: liveFg, drag: liveFdrag, net: liveFnet } = calculateProjectileForces(
    params.gravity, liveState, flightAir?.projectileDiameter ?? equipment.dimensions.projectileDiameter,
    projMaterial, flightAir
  );

  const isVariableLocked = (key: ExperimentVariable) => (sharedAssignment || mode === 'student') && teacherConfig.adjustable[key] !== true;
  const landingHeightLocked = isVariableLocked('landingHeight');
  const launchHeightLocked = isVariableLocked('height');
  const launchAngleLocked = isVariableLocked('angle');
  const angleMin = activeLimits?.minAngle ?? 0;
  const angleMax = activeLimits?.maxAngle ?? 90;
  const angleRange = React.useMemo(() => launchHeightLocked && !launchAngleLocked
    ? computeFixedHeightAngleRange(equipment, mountMode, params.height, params.angle, angleMin, angleMax)
    : { min: angleMin, max: angleMax },
    [equipment, mountMode, params.height, params.angle, angleMin, angleMax, launchHeightLocked, launchAngleLocked]);
  const angleRestricted = angleRange.min > angleMin || angleRange.max < angleMax;
  useEffect(() => { setQuickVariable(null); }, [teacherConfig.independentVariable]);

  // Tabletop physical clearance and surface flush calculation
  const minClearanceH = computeMinimumClearanceHeight(equipment, params.angle, mountMode);
  const recommendedSafeH = isVernierVPL ? minClearanceH : Math.max(0.05, Math.ceil((minClearanceH - 1e-9) * 20) / 20);
  const usesTabletop = summary.landingHeight === 0 && Math.abs((params.landingHeight ?? 0) - summary.landingHeight) > 1e-6;
  const tabletopOffset = (-params.height).toFixed(2).replace('-', '−');
  const missedTargetNote = (params.landingHeight ?? 0) > summary.maxHeight + 1e-6
    ? 'Target is too high. This shot rises ' + formatMeasurement((summary.maxHeight - params.height)) + ' m and lands on the tabletop (' + tabletopOffset + ' m).'
    : 'This shot lands on the tabletop (' + tabletopOffset + ' m) because it does not rise to the selected surface.';
  const showMissedTargetNote = usesTabletop && teacherConfig.showTheory;
  const targetDistance = teacherConfig.targetCupDistanceM;
  const targetOffset = targetDistance === null ? 0 : summary.range - targetDistance;
  const targetHit = !usesTabletop && Math.abs(targetOffset) <= LANDING_TARGET_RADIUS_M;
  const targetFeedback = simState !== 'landed' || targetDistance === null ? null
    : usesTabletop ? 'Missed target. Marble did not reach target height.'
    : targetHit ? 'Target hit'
    : 'Missed target by ' + Math.abs(targetOffset).toFixed(2) + ' m (' + (targetOffset < 0 ? 'short' : 'long') + ').';
  const crossedTargetHeight = targetFeedback && !targetHit && !usesTabletop && summary.landingHeight > 0;
  const [variableDraft, setVariableDraft] = useState<{ key: ExperimentVariable; text: string } | null>(null);
  const intersectsTabletop = false;
  useEffect(() => {
    if (params.height >= minClearanceH - 1e-7 || (sharedAssignment && launchHeightLocked)) return;
    if (landingHeightLocked && landingMode === 'same') setLandingMode('custom');
    setParams((previous) => ({
      ...previous,
      height: recommendedSafeH,
      landingHeight: !landingHeightLocked && landingMode === 'same' ? recommendedSafeH : previous.landingHeight,
    }));
  }, [params.height, minClearanceH, recommendedSafeH, landingMode, landingHeightLocked, sharedAssignment, launchHeightLocked]);

  useEffect(() => {
    if (!isVernierVPL) return;
    setParams(clampVernierSettings);
  }, [isVernierVPL, params.angle, params.speed]);

  const rBall = equipment.dimensions.projectileDiameter / 2;
  const muzzleX = computeApparatusKinematicsPose(equipment, params.angle, params.height + rBall)
    .muzzleCenter[0];
  const rulerStep = computeBenchRulerLayout(
    muzzleX,
    Math.max(idealSummary.range, summary.range),
    mountMode
  ).step;

  // Animation loop
  useEffect(() => {
    if (simState !== 'running') {
      lastFrameTimeRef.current = null;
      return;
    }
    let rafId: number;
    const step = (now: number) => {
      if (lastFrameTimeRef.current !== null) {
        const dt = ((now - lastFrameTimeRef.current) / 1000) * playbackSpeed;
        setElapsedTime((prev) => {
          const next = Math.min(summary.time, prev + dt);
          if (next >= summary.time) {
            setSimState('landed');
            soundManager.playLanding(summary.impactSpeed);
          }
          return next;
        });
      }
      lastFrameTimeRef.current = now;
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [simState, summary.time, summary.impactSpeed, playbackSpeed]);

  const handleParamChange = (key: ExperimentVariable, value: number) => {
    if (isVariableLocked(key)) return;
    if (landingHeightLocked && landingMode === 'same' && (key === 'height' || (key === 'angle' && !launchHeightLocked))) {
      setLandingMode('custom');
    }
    setParams((prev) => {
      let nextVal = value;
      if (key === 'angle') {
        nextVal = Math.max(angleRange.min, Math.min(angleRange.max, value));
        if (launchHeightLocked && computeMinimumClearanceHeight(equipment, nextVal, mountMode) > prev.height + 1e-7) return prev;
      }
      if (isVernierVPL && key === 'speed') nextVal = Math.max(0, Math.min(activeLimits?.maxSpeed ?? 6, value));
      if (key === 'height') {
        const minH = computeMinimumClearanceHeight(equipment, prev.angle, mountMode);
        nextVal = Math.max(minH, value);
      }
      const next = { ...prev, [key]: nextVal };
      if (key === 'angle' && !launchHeightLocked) {
        const minH = computeMinimumClearanceHeight(equipment, nextVal, mountMode);
        if (next.height < minH) {
          next.height = Math.ceil((minH - 1e-9) * 20) / 20;
        }
      }
      if (!landingHeightLocked && landingMode === 'same' && (key === 'height' || next.height !== prev.height)) {
        next.landingHeight = next.height;
      }
      return next;
    });
    setElapsedTime(0);
    setSimState('ready');
    hasAutoRecordedCurrentRunRef.current = false;
  };

  const handleLandingModeChange = (newMode: 'same' | 'tabletop' | 'custom') => {
    if (landingHeightLocked) return;
    setLandingMode(newMode);
    soundManager.playClick();
    if (newMode === 'same') {
      handleParamChange('landingHeight', params.height);
    } else if (newMode === 'tabletop') {
      handleParamChange('landingHeight', 0);
    }
  };

  const handleResetSimulation = () => {
    soundManager.playClick();
    setSimState('ready');
    setElapsedTime(0);
    hasAutoRecordedCurrentRunRef.current = false;
  };

  const handlePlayToggle = () => {
    if (simState === 'running') {
      setSimState('paused');
    } else {
      if (simState === 'landed') {
        setElapsedTime(0);
        hasAutoRecordedCurrentRunRef.current = false;
      }
      setSimState('running');
      soundManager.playLaunch(params.speed);
    }
  };

  // Optional Instrument Resolution Practice Mode quantization
  const displayTime = instrumentPracticeMode
    ? quantizeToResolution(elapsedTime, 0.02)
    : elapsedTime;
  const displayX = instrumentPracticeMode
    ? quantizeToResolution(liveState.x, 0.005)
    : liveState.x;
  const displayY = instrumentPracticeMode
    ? quantizeToResolution(liveState.y - params.height, 0.005)
    : liveState.y - params.height;

  const appendTrialForParams = (launchParams: LaunchParameters): number => {
    let simResult: TheoreticalSummary;
    let recAngle = launchParams.angle;
    let recSpeed = launchParams.speed;
    let recTime: number;
    let recRange: number;

    if (physicsMode === 'experimental') {
      if (experimentalEnv.enableErrorSources) {
        const expTrial = simulateExperimentalTrial(launchParams, experimentalEnv);
        simResult = expTrial;
        recAngle = expTrial.actualAngle;
        recSpeed = expTrial.actualSpeed;
        recTime = expTrial.measuredTime;
        recRange = expTrial.measuredRange;
      } else {
        simResult = calculateExperimentalSummary(launchParams, experimentalEnv);
        recTime = simResult.time;
        recRange = simResult.range;
      }
    } else {
      simResult = calculateTheoreticalSummary(launchParams);
      recTime = simResult.time;
      recRange = simResult.range;
    }

    if (instrumentPracticeMode) {
      recTime = quantizeToResolution(recTime, 0.02);
      recRange = quantizeToResolution(recRange, 0.005);
    }

    const newId = Date.now() + Math.random();
    const newTrial: RecordedTrial = {
      id: newId,
      angle: recAngle,
      speed: recSpeed,
      height: launchParams.height,
      landingHeight: simResult.landingHeight,
      isSymmetric: simResult.isSymmetricLaunch,
      gravity: launchParams.gravity,
      time: recTime,
      maxHeight: simResult.maxHeight,
      range: recRange,
      impactSpeed: simResult.impactSpeed,
      predictedRangeNote: predictedRangeInput.trim() || undefined,
      apparatusName: equipment.name,
      isExperimental: physicsMode === 'experimental',
      material:
        physicsMode === 'experimental'
          ? PROJECTILE_MATERIALS[experimentalEnv.material]?.name
          : undefined,
      dragLossRangeM: simResult.dragLossRangeM,
      dragLossPct: simResult.dragLossPct,
    };

    setTrials((prev) => [...prev, newTrial]);
    return newId;
  };

  const handleRecordTrial = () => {
    if (simState !== 'landed' || hasAutoRecordedCurrentRunRef.current) return;
    hasAutoRecordedCurrentRunRef.current = true;
    appendTrialForParams(params);
  };

  const handleTogglePlotTrial = (trialId: number) => {
    setManuallyPlottedTrialIds((prev) =>
      prev.includes(trialId) ? prev.filter((id) => id !== trialId) : [...prev, trialId]
    );
  };

  const handleQuickSweepFiveAngles = () => {
    const standardAngles = [15, 30, 45, 60, 75];
    const sweepAngles = standardAngles.every(angle => angle >= angleMin && angle <= angleMax)
      ? standardAngles
      : standardAngles.map((_, index) => angleMin + (angleMax - angleMin) * (index + 1) / 6);
    const trialIds = sweepAngles.map(angle => appendTrialForParams({ ...params, angle }));
    setManuallyPlottedTrialIds(previous => [...previous, ...trialIds]);
    setGraphTab('student_plot');
  };

  // Auto-record when projectile lands if autoRecord is enabled
  useEffect(() => {
    if (simState === 'landed' && autoRecord && !hasAutoRecordedCurrentRunRef.current) {
      hasAutoRecordedCurrentRunRef.current = true;
      appendTrialForParams(params);
    }
  }, [simState, autoRecord]);

  const solveFor = sharedAssignment ? teacherConfig.solveFor : '';
  const hideLaunchSpeed = solveFor === 'speed' && isVariableLocked('speed');
  const hideGravity = solveFor === 'gravity' && isVariableLocked('gravity');
  const showAssignmentTheory = teacherConfig.showTheory && !hideLaunchSpeed && !hideGravity;
  const defaultXExpr = chartXAxisVar === 'sin2Angle' ? 'sin(2 theta)' : chartXAxisVar === 'time' ? 't' : 'theta';
  const activeChartAxes = chartAxes ?? { x: defaultXExpr, y: 'R' };
  const isHiddenAxisVar = (token: string) =>
    (hideLaunchSpeed && (token === 'v0' || token === 'impactSpeed')) || (hideGravity && token === 'g');
  const compiledTableAxes = (() => {
    try {
      const xFn = compileAxis(activeChartAxes.x);
      const yFn = compileAxis(activeChartAxes.y);
      if ([...xFn.variables, ...yFn.variables].some(isHiddenAxisVar)) return null;
      return {
        xFn,
        yFn,
        xLabel: displayAxisExpression(activeChartAxes.x),
        yLabel: displayAxisExpression(activeChartAxes.y),
      };
    } catch {
      return null;
    }
  })();
  const handleExportCSV = () => {
    const header =
      ['Trial','Apparatus','Angle (deg)', ...(!hideLaunchSpeed ? ['Speed (m/s)'] : []),
        'Height (m)', ...(!hideGravity ? ['Gravity (m/s2)'] : []),'Flight Time (s)','Max Height (m)','Horizontal Range (m)',
        ...(compiledTableAxes ? [`"X (${compiledTableAxes.xLabel.replace(/"/g, '""')})"`, `"Y (${compiledTableAxes.yLabel.replace(/"/g, '""')})"`] : []),
        ...(!hideLaunchSpeed ? ['Impact Speed (m/s)'] : []),'Student Predicted Range (m)'].join(',') + '\n';
    const rows = trials
      .map((t, idx) =>
        [
          idx + 1,
          `"${t.apparatusName.replace(/"/g, '""')}"`,
          formatMeasurement(t.angle),
          ...(!hideLaunchSpeed ? [formatMeasurement(t.speed)] : []),
          formatMeasurement(t.height),
          ...(!hideGravity ? [formatMeasurement(t.gravity)] : []),
          formatMeasurement(t.time),
          formatMeasurement(t.maxHeight),
          formatMeasurement(t.range),
          ...(compiledTableAxes ? [compiledTableAxes.xFn(t), compiledTableAxes.yFn(t)].map(v => Number.isFinite(v) ? formatMeasurement(v) : '') : []),
          ...(!hideLaunchSpeed ? [formatMeasurement(t.impactSpeed)] : []),
          t.predictedRangeNote || '',
        ].join(',')
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'boreal-trials.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearTrials = () => {
    setTrials([]);
    setManuallyPlottedTrialIds([]);
    setCustomPoints([]);
  };

  const axisFields = compiledTableAxes
    ? new Set<string>([...compiledTableAxes.xFn.variables, ...compiledTableAxes.yFn.variables])
    : new Set<string>();
  const optionalTrialColumns = ([
    ['h0', 'Muzzle h₀ (m)', (trial: RecordedTrial) => trial.height],
    ['hEnd', 'Landing above table (m)', (trial: RecordedTrial) => trial.landingHeight ?? (trial.isSymmetric ? trial.height : 0)],
    ['H', 'Peak above table (m)', (trial: RecordedTrial) => trial.maxHeight],
    ['g', 'Gravity (m/s²)', (trial: RecordedTrial) => trial.gravity],
    ['impactSpeed', 'Impact speed (m/s)', (trial: RecordedTrial) => trial.impactSpeed],
  ] as const).filter(([key]) => (!hideLaunchSpeed || key !== 'impactSpeed') && (!hideGravity || key !== 'g') && (allTrialColumns || axisFields.has(key)));

  const trajectorySamples = sampleTrajectory(params, 48).map((sample) => ({
    ...sample,
    y: sample.y - params.height,
  }));

  const renderSliderControl = (
    key: 'angle' | 'speed' | 'height' | 'gravity' | 'landingHeight',
    symbol: React.ReactNode,
    label: string,
    unit: string,
    min: number,
    max: number,
    step: number,
    decimals: number,
    helperNode?: React.ReactNode
  ) => {
    const isLocked = isVariableLocked(key);
    const relativeLanding = key === 'landingHeight';
    const offset = relativeLanding ? params.height : 0;
    const value = (params[key] ?? 0) - offset;
    const draft = variableDraft?.key === key ? variableDraft.text : null;
    const applyValue = (value: number) => {
      if (isLocked) return;
      if (key === 'landingHeight') setLandingMode('custom');
      handleParamChange(key, value + offset);
    };
    const commitValue = (raw: string) => {
      if (!raw.trim()) return;
      const number = Number(raw.replace('−', '-'));
      if (Number.isFinite(number)) applyValue(Math.max(min, Math.min(max, number)));
    };
    return h(
      'div',
      { className: 'control', key, title: VARIABLE_TOOLTIPS[key] },
      h(
        'div',
        { className: 'control-top' },
        h(
          'label',
          { htmlFor: key },
          h('span', { className: 'variable-symbol' }, symbol),
          h(
            'span',
            null,
            label,
            isLocked
              ? h(
                  'small',
                  {
                    style: {
                      marginLeft: '6px',
                      padding: '1px 5px',
                      background: '#f2ece1',
                      color: '#7a5c22',
                      borderRadius: '3px',
                      fontSize: '9px',
                      fontWeight: 700,
                    },
                  },
                  'LOCKED BY TEACHER'
                )
              : null
          )
        ),
        h(
          'span',
          { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } },
          h('input', {
            type: relativeLanding ? 'text' : 'number',
            inputMode: relativeLanding ? 'text' : undefined,
            'aria-label': `${label} value in ${unit}`,
            min,
            max,
            step,
            value: draft ?? Number(value.toFixed(decimals)),
            disabled: isLocked,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              setVariableDraft({ key, text: e.currentTarget.value });
            },
            onBlur: () => {
              if (draft !== null) commitValue(draft);
              setVariableDraft(null);
            },
            onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setVariableDraft(null);
            },
            style: {
              width: '68px',
              padding: '4px 6px',
              fontSize: '13px',
              fontWeight: 700,
              fontFamily: '"IBM Plex Mono", monospace',
              textAlign: 'right',
              border: '1px solid #bfd2e3',
              borderRadius: '4px',
              background: isLocked ? '#f5f5f5' : '#ffffff',
              color: '#1f3a52',
            },
          }),
          h('small', null, unit)
        )
      ),
      h('input', {
        id: key,
        type: 'range',
        min,
        max,
        step,
        value,
        'aria-label': label,
        disabled: isLocked,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          applyValue(Number(e.target.value)),
      }),
      h(
        'div',
        { className: 'range-ends', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', null, `${Number(min.toFixed(decimals))} ${unit}`),
        helperNode || null,
        h('span', null, `${Number(max.toFixed(decimals))} ${unit}`)
      )
    );
  };

  const renderMuzzleHeight = () => renderSliderControl(
    'height', fmtSub('h', '0'), 'Muzzle height above tabletop', 'm',
    recommendedSafeH, Math.max(1.2, params.height, recommendedSafeH), 0.05, 2
  );
  const renderLandingOffset = () => renderSliderControl(
    'landingHeight', 'Δy', 'Target height from launch', 'm', -params.height,
    Math.max(1.2, params.landingHeight ?? 0, summary.maxHeight) - params.height, 0.01, 2,
    h('span', null, '0 m = launch point')
  );

  const adjustableVariables = (Object.keys(EXPERIMENT_VARIABLE_LABELS) as ExperimentVariable[])
    .filter(key => !isVariableLocked(key));
  const preferredQuickVariable = quickVariable ?? teacherConfig.independentVariable;
  const selectedQuickVariable = adjustableVariables.includes(preferredQuickVariable) ? preferredQuickVariable : adjustableVariables[0];
  const renderLaunchAngle = () => renderSliderControl('angle', 'θ', 'Launch angle', '°',
    angleRange.min, angleRange.max, angleRestricted ? 0.01 : 1, angleRestricted ? 2 : 0,
    angleRestricted ? h('span', null, 'Limited by the locked launch height') : undefined);
  const tourOpen = !sharedAssignment && (activeModal === 'about' || activeModal === 'tour');
  useEffect(() => {
    if (tourOpen) document.getElementById('lab-tour-title')?.focus({ preventScroll: true });
  }, [tourOpen]);
  const leaveTour = (tab?: 'setup' | 'run' | 'graph') => {
    if (tab) setActiveWorkflowTab(tab);
    setActiveModal(null);
    const destination = tab === 'setup' ? '#tab-setup-btn' : tab === 'run' ? '#launch-marble-btn'
      : tab === 'graph' ? '#tab-data-graph-btn'
      : '#open-lab-tour';
    requestAnimationFrame(() => (document.querySelector<HTMLElement>(destination) ??
      document.getElementById('tab-run-btn'))?.focus());
  };
  const selectCameraView = (view: CameraViewMode) => {
    if (viewMode === view) return;
    lockedCameraPose.current = null;
    setCameraLocked(false);
    setViewMode(view);
  };

  const openCameraMenu = () => {
    setCameraMenuOpen(true);
    requestAnimationFrame(() => cameraMenuRef.current?.querySelector('button')?.focus());
  };

  const closeCameraMenu = () => {
    cameraCubeRef.current?.querySelector<HTMLButtonElement>('[aria-pressed=true], .face-experiment')?.focus();
    setCameraMenuOpen(false);
  };

  const renderQuickVariable = (key: ExperimentVariable) => {
    switch (key) {
      case 'angle': return renderLaunchAngle();
      case 'speed': return renderSliderControl(key, fmtSub('v', '0'), 'Initial speed', 'm/s', 0, activeLimits?.maxSpeed ?? Math.max(6, params.speed), 0.05, 2);
      case 'height': return renderMuzzleHeight();
      case 'landingHeight': return renderLandingOffset();
      case 'gravity': return renderSliderControl(key, 'g', 'Gravity', 'm/s²', 1, 20, 0.01, 2);
    }
  };

  return h(
    React.Fragment,
    null,
    // Application header
    h(
      'header',
      { className: 'lab-header' },
      h(
        'div',
        { className: 'brand' },
        h('div', { className: 'brand-icon', 'aria-hidden': 'true' }, h(IconPenguin, { size: 24 })),
        h('span', null, 'Europa Lab')
      ),
      h(
        'div',
        { className: 'header-actions' },
        !sharedAssignment && h('button', {
          type: 'button',
          className: 'text-btn',
          id: 'open-lab-tour',
          onClick: () => setActiveModal('about'),
        }, 'About & Tour'),
        !sharedAssignment && h('button', {
          type: 'button',
          className: 'text-btn',
          onClick: () => {
            setOpenManualOnImport(false);
            setActiveModal('import');
          },
        }, 'Import equipment'),
        !sharedAssignment && h('button', {
          type: 'button',
          className: 'teacher-btn',
          onClick: () => setActiveModal('teacher'),
        }, mode === 'teacher' ? 'Teacher mode (active)' : 'Teacher mode')
      )
    ),

    h(
      'main',
      { className: 'lab-workspace' },
      h('div', { className: 'page-heading' }, h('h1', null,
        sharedAssignment && !invalidAssignment ? teacherConfig.title : 'Projectile Motion')),
      sharedAssignment && !invalidAssignment && h('section', { className: 'student-assignment-brief', 'aria-label': 'Assignment' },
        h('div', { className: 'assignment-progress' },
          h('strong', null, 'Assignment'),
          h('span', null, Math.min(trials.length, teacherConfig.requiredTrials) + ' / ' + teacherConfig.requiredTrials + ' trials')),
        teacherConfig.question && h('p', null, teacherConfig.question),
        teacherConfig.instructions && h('details', null, h('summary', null, 'Instructions'), h('p', null, teacherConfig.instructions))
      ),
      !invalidAssignment && h(
        'nav',
        { className: 'workflow-nav-wrapper', ref: workflowNavRef, 'aria-label': 'Experiment workspace' },
        h(
          'div',
          { className: 'workflow-tabs-strip' },
          !sharedAssignment && h('button', {
            type: 'button',
            id: 'tab-setup-btn',
            className: 'workflow-tab-btn',
            'aria-current': activeWorkflowTab === 'setup' ? 'true' : undefined,
            onClick: () => setActiveWorkflowTab('setup'),
          }, 'Set up'),
          h('button', {
            type: 'button',
            id: 'tab-run-btn',
            className: 'workflow-tab-btn',
            'aria-current': activeWorkflowTab === 'run' ? 'true' : undefined,
            onClick: () => setActiveWorkflowTab('run'),
          }, 'Run'),
          h('button', {
            type: 'button',
            id: 'tab-data-graph-btn',
            className: 'workflow-tab-btn',
            'aria-current': activeWorkflowTab === 'record' || activeWorkflowTab === 'graph' ? 'true' : undefined,
            onClick: () => setActiveWorkflowTab('graph'),
          }, 'Data & Plotting', trials.length > 0 && h('span', { className: 'workflow-trial-count' }, trials.length))
        )
      ),

      // ACTIVE WORKFLOW STAGE CONTENT
      invalidAssignment ? h('p', { className: 'student-assignment-brief', role: 'alert' },
        invalidAssignment)
        : !sharedAssignment && activeWorkflowTab === 'setup'
        ? h(
            'div',
            { className: 'workflow-stage setup-grid' },
            h('div', { className: 'setup-toolbar' },
              h('h2', null, 'Experiment setup'),
              h('button', {
                type: 'button',
                className: 'setup-run-button',
                onClick: () => goToWorkflowStage('run'),
              }, 'Continue to Run')
            ),
            h('section', { className: 'setup-panel setup-worksheet', 'aria-labelledby': 'setup-launch-heading' },
              h('h3', { id: 'setup-launch-heading' }, 'Launch and landing'),
              renderLaunchAngle(),
              renderSliderControl(
                'speed',
                fmtSub('v', '0'),
                'Initial speed',
                'm/s',
                0,
                activeLimits?.maxSpeed ?? Math.max(6, params.speed),
                0.05,
                2
              ),
              h('div', { className: 'setup-landing' },
                // Dedicated Landing Elevation Control Card (Symmetric Level vs Tabletop vs Custom)
                h(
                  'div',
                  {
                    style: {
                      padding: '0',
                    },
                  },
                  h(
                    'div',
                    {
                      style: {
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px',
                      },
                    },
                    h(
                      'span',
                      {
                        style: {
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#334155',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        },
                      },
                      h(IconTarget, { size: 13, color: '#0d7377' }),
                      'Landing surface'
                    )
                  ),
                  h('p', { className: 'setup-reference-note' },
                    'The ball starts at 0 m. Landing heights are measured from where it leaves the launcher.'
                  ),
                  h(
                    'div',
                    {
                      style: {
                        display: 'flex',
                        gap: '6px',
                        marginBottom: landingMode === 'custom' ? '8px' : '0',
                      },
                    },
                    h(
                      'button',
                      {
                        type: 'button',
                        disabled: landingHeightLocked,
                        onClick: () => handleLandingModeChange('same'),
                        style: {
                          flex: 1,
                          padding: '6px 4px',
                          fontSize: '11px',
                          fontWeight: landingMode === 'same' ? 700 : 500,
                          background: landingMode === 'same' ? '#0d7377' : '#fff',
                          color: landingMode === 'same' ? '#fff' : '#334155',
                          border: `1px solid ${landingMode === 'same' ? '#0d7377' : '#cbd5e1'}`,
                          borderRadius: '5px',
                          cursor: 'pointer',
                          boxShadow: landingMode === 'same' ? '0 1px 3px rgba(13,115,119,0.25)' : 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          whiteSpace: 'nowrap',
                        },
                      },
                      h(IconLevel, { size: 12 }),
                      'Same height (0 m)'
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        disabled: landingHeightLocked,
                        onClick: () => handleLandingModeChange('tabletop'),
                        style: {
                          flex: 1,
                          padding: '6px 4px',
                          fontSize: '11px',
                          fontWeight: landingMode === 'tabletop' ? 700 : 500,
                          background: landingMode === 'tabletop' ? '#2563eb' : '#fff',
                          color: landingMode === 'tabletop' ? '#fff' : '#334155',
                          border: `1px solid ${landingMode === 'tabletop' ? '#1d4ed8' : '#cbd5e1'}`,
                          borderRadius: '5px',
                          cursor: 'pointer',
                          boxShadow: landingMode === 'tabletop' ? '0 1px 2px rgba(37,99,235,0.2)' : 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          whiteSpace: 'nowrap',
                        },
                      },
                      h(IconTableStand, { size: 12 }),
                      'Tabletop (' + tabletopOffset + ' m)'
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        disabled: landingHeightLocked,
                        onClick: () => handleLandingModeChange('custom'),
                        style: {
                          flex: 1,
                          padding: '6px 4px',
                          fontSize: '11px',
                          fontWeight: landingMode === 'custom' ? 700 : 500,
                          background: landingMode === 'custom' ? '#475569' : '#fff',
                          color: landingMode === 'custom' ? '#fff' : '#334155',
                          border: `1px solid ${landingMode === 'custom' ? '#334155' : '#cbd5e1'}`,
                          borderRadius: '5px',
                          cursor: 'pointer',
                          boxShadow: landingMode === 'custom' ? '0 1px 2px rgba(71,85,105,0.2)' : 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          whiteSpace: 'nowrap',
                        },
                      },
                      h(IconSliders, { size: 12 }),
                      'Custom'
                    )
                  ),
                  showMissedTargetNote && h('p', { className: 'setup-reference-note', role: 'status' }, missedTargetNote),
                  landingMode === 'custom' && renderLandingOffset()
                )
              ),
                renderSliderControl('gravity', 'g', 'Gravity', 'm/s²', 1, 20, 0.01, 2),

                // Quick Gravity Environment Presets
                h(
                  'div',
                  {
                    className: 'worksheet-gravity-presets',
                    style: {
                      padding: '4px 0 0',
                      display: 'flex',
                      gap: '6px',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    },
                  },

                  ...[
                    { label: 'Earth (9.81)', g: 9.81 },
                    { label: 'Moon (1.62)', g: 1.62 },
                    { label: 'Mars (3.72)', g: 3.72 },
                  ].map((env) =>
                    h(
                      'button',
                      {
                        key: env.label,
                        type: 'button',
                        disabled: mode === 'student' && !teacherConfig.adjustable.gravity,
                        onClick: () => handleParamChange('gravity', env.g),
                        style: {
                          fontSize: '10px',
                          padding: '4px 9px',
                          borderRadius: '12px',
                          fontWeight: Math.abs(params.gravity - env.g) < 0.01 ? 700 : 500,
                          border:
                            Math.abs(params.gravity - env.g) < 0.01
                              ? '1px solid #2d70b3'
                              : '1px solid #cbd5e1',
                          background:
                            Math.abs(params.gravity - env.g) < 0.01 ? '#eff6ff' : '#ffffff',
                          color: Math.abs(params.gravity - env.g) < 0.01 ? '#1d4ed8' : '#475569',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        },
                      },
                      env.label
                    )
                  )
                ),
            ),
            h('section', { className: 'setup-panel setup-equipment', 'aria-labelledby': 'setup-equipment-heading' },
              h('h3', { id: 'setup-equipment-heading' }, 'Equipment'),
              h(ApparatusPicker, {
                equipment,
                onSelect: (preset: ProjectileApparatusSpec) => {
                  setEquipment(preset);
                  setLimits(preset.limits || null);
                  const defaultMount = preset.visual.mount_type === 'clamp' ? 'clamp' : 'stand';
                  setMountMode(defaultMount);
                  const minAngle = preset.limits?.minAngle ?? 0;
                  const maxAngle = preset.limits?.maxAngle ?? 90;
                  const selectedAngle = Math.max(minAngle, Math.min(maxAngle, params.angle));
                  const reqH = computeMinimumClearanceHeight(preset, selectedAngle, defaultMount);
                  if (preset.id === VERNIER_VPL_ID) {
                    setParams(previous => ({
                      ...clampVernierSettings(previous),
                      height: reqH,
                      landingHeight: !landingHeightLocked && landingMode === 'same' ? reqH : previous.landingHeight,
                    }));
                  } else {
                    setParams(previous => {
                      const height = previous.height < reqH ? Math.ceil((reqH - 1e-9) * 20) / 20 : previous.height;
                      return { ...previous, angle: selectedAngle, height,
                        landingHeight: !landingHeightLocked && landingMode === 'same' ? height : previous.landingHeight };
                    });
                  }
                  handleResetSimulation();
                },
                specs: h(React.Fragment, null,
                  h('h3', null, equipment.name),
                  h('dl', null, ...[
                    ['Guide style', equipment.visual.guide_type.replace(/_/g, ' ')],
                    ['Barrel length', (equipment.dimensions.barrelLength * 100).toFixed(1) + ' cm'],
                    ['Outside guide width', (equipment.dimensions.barrelDiameter * 1000).toFixed(0) + ' mm'],
                    ['Mount', mountMode === 'clamp' ? 'Edge Clamp' : 'Table Stand'],
                    ['Angle scale', equipment.visual.scale_style.replace(/_/g, ' ')],
                    ['Min. clearance', computeMinimumClearanceHeight(equipment, params.angle, mountMode).toFixed(2) + ' m'],
                    ...(isVernierVPL ? [
                      ['Launch height above base', (VERNIER_VPL_LAUNCH_HEIGHT * 1000).toFixed(0) + ' mm'],
                      ['Internal photogate spacing', (VERNIER_VPL_GATE_SPACING * 1000).toFixed(0) + ' mm'],
                    ] : []),
                    ...(equipment.modelNumber ? [['Model number', equipment.modelNumber]] : []),
                  ].map(([label, value]) =>
                    h('div', { key: label }, h('dt', null, label), h('dd', null, value))
                  )),
                  h('p', null, equipment.dimensionStatus?.barrelLength === 'confirmed'
                    ? 'Barrel length verified against manufacturer specifications.'
                    : 'Barrel length is estimated.'),
                  equipment.dimensionSources?.barrelLength?.sourceUrl
                    ? h('a', {
                        href: equipment.dimensionSources.barrelLength.sourceUrl,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                      }, 'Manufacturer specifications')
                    : null
                ),
              }),
              h('figure', { className: 'setup-model-preview', 'aria-label': 'Selected launcher preview' },
                h(ReconstructionPreviewCanvas, {
                  spec: equipment,
                  previewAngle: Math.max(activeLimits?.minAngle ?? 0, Math.min(35, activeLimits?.maxAngle ?? 90)),
                  mountMode,
                  fitToModel: true,
                }),
              ),
              // Mounting Style Selector: Tabletop Stand vs Bench-Edge Clamp
              h(
                'div',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '6px',
                    padding: '5px 8px',
                    background: '#f8fafc',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                  },
                },
                h(
                  'span',
                  { style: { fontSize: '9.5px', fontWeight: 700, color: '#475569', letterSpacing: '0.04em' } },
                  'MOUNT:'
                ),
                h(
                  'div',
                  { style: { display: 'flex', gap: '4px' } },
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => {
                        setMountMode('stand');
                        const newMin = computeMinimumClearanceHeight(equipment, params.angle, 'stand');
                        if (params.height < newMin) {
                          handleParamChange('height', Math.ceil((newMin - 1e-9) * 20) / 20);
                        }
                      },
                      style: {
                        fontSize: '9px',
                        fontWeight: mountMode === 'stand' ? 700 : 500,
                        padding: '3px 7px',
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        background: mountMode === 'stand' ? '#0d7377' : '#e2e8f0',
                        color: mountMode === 'stand' ? '#ffffff' : '#334155',
                        transition: 'all 0.15s ease',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      },
                      title: 'Apparatus rests on tabletop surface with physical collision boundary (zero table penetration)',
                    },
                    h(IconTableStand, { size: 12 }),
                    'Table Stand'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => {
                        setMountMode('clamp');
                      },
                      style: {
                        fontSize: '9px',
                        fontWeight: mountMode === 'clamp' ? 700 : 500,
                        padding: '3px 7px',
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        background: mountMode === 'clamp' ? '#0d7377' : '#e2e8f0',
                        color: mountMode === 'clamp' ? '#ffffff' : '#334155',
                        transition: 'all 0.15s ease',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      },
                      title: 'Apparatus clamped to the bench edge, with the launch path above the measuring mat',
                    },
                    h(IconEdgeClamp, { size: 12 }),
                    'Edge Clamp'
                  )
                )
              ),
              renderMuzzleHeight(),
              h('p', { className: 'setup-reference-note' },
                'The stand or clamp needs clearance above the table. Minimum for this setup: ' + recommendedSafeH.toFixed(2) + ' m.'
              ),
              h('div', { className: 'setup-environment' },
                h('h3', null, 'Environment'),
                // Mode Selection Pill Bar: Ideal Vacuum vs Realistic Experiment
                h(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      border: `1.5px solid ${physicsMode === 'experimental' ? '#0d7377' : '#2d70b3'}`,
                      background: '#f1f6f4',
                    },
                  },
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => {
                        setPhysicsMode('ideal');
                        setExperimentalEnv((prev) => ({ ...prev, mode: 'ideal' }));
                        handleResetSimulation();
                      },
                      style: {
                        flex: 1,
                        padding: '7px 4px',
                        fontSize: '11px',
                        fontWeight: physicsMode === 'ideal' ? 700 : 500,
                        background: physicsMode === 'ideal' ? '#2d70b3' : 'transparent',
                        color: physicsMode === 'ideal' ? '#ffffff' : '#394d48',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'center',
                      },
                    },
                    h(
                      'span',
                      {
                        style: {
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '5px',
                        },
                      },
                      h(IconVacuum, { size: 12 }),
                      'Ideal (Vacuum)'
                    )
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => {
                        setPhysicsMode('experimental');
                        setExperimentalEnv((prev) => ({ ...prev, mode: 'experimental' }));
                        handleResetSimulation();
                      },
                      style: {
                        flex: 1,
                        padding: '7px 4px',
                        fontSize: '11px',
                        fontWeight: physicsMode === 'experimental' ? 700 : 500,
                        background: physicsMode === 'experimental' ? '#0d7377' : 'transparent',
                        color: physicsMode === 'experimental' ? '#ffffff' : '#394d48',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'center',
                      },
                    },
                    h(
                      'span',
                      {
                        style: {
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '5px',
                        },
                      },
                      h(IconExperiment, { size: 12 }),
                      'Experiment (Drag & Error)'
                    )
                  )
                ),
                physicsMode === 'experimental'
                  ? h('details', { className: 'setup-details' },
                      h('summary', null, 'Air and measurement settings'),
                      h(
                        'div',
                        {
                          style: {
                            background: '#f2f9f8',
                            border: '1px solid #bce1dc',
                            borderRadius: '6px',
                            padding: '10px 12px',
                            margin: '10px 0',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            fontSize: '11px',
                          },
                        },
                        h(
                          'div',
                          {
                            style: {
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            },
                          },
                          h(
                            'b',
                            {
                              style: {
                                color: '#0d7377',
                                fontSize: '11.5px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                              },
                            },
                            h(IconExperiment, { size: 13, color: '#0d7377' }),
                            'Atmosphere & Error Sources'
                          ),
                          h(
                            'span',
                            { style: { fontSize: '10px', color: '#147a7e', fontWeight: 600 } },
                            `ρ = ${calculateAirDensity(
                              experimentalEnv.airPressureKPa,
                              experimentalEnv.temperatureC
                            )} kg/m³`
                          )
                        ),
                        // Material Selector
                        h(
                          'div',
                          {
                            style: {
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            },
                          },
                          h('label', null, 'Sphere Material:'),
                          h(
                            'select',
                            {
                              value: experimentalEnv.material,
                              onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                                const mat = e.target.value as ProjectileMaterial;
                                setExperimentalEnv((prev) => ({ ...prev, material: mat }));
                                handleResetSimulation();
                              },
                              style: {
                                padding: '3px 6px',
                                fontSize: '11px',
                                borderRadius: '4px',
                                border: '1px solid #9dc8c3',
                              },
                            },
                            ...Object.entries(PROJECTILE_MATERIALS).map(([k, v]) =>
                              h('option', { key: k, value: k }, `${v.name} (${v.densityKgM3} kg/m³)`)
                            )
                          )
                        ),
                        // Air Pressure
                        h(
                          'div',
                          null,
                          h(
                            'div',
                            {
                              style: {
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '3px',
                              },
                            },
                            h('label', null, 'Air Pressure (P):'),
                            h(
                              'div',
                              { style: { display: 'flex', gap: '3px', alignItems: 'center' } },
                              h('input', {
                                type: 'number',
                                step: '0.5',
                                min: '50',
                                max: '115',
                                value: experimentalEnv.airPressureKPa,
                                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                                  const val = Math.max(
                                    10,
                                    Math.min(120, Number(e.target.value) || 101.325)
                                  );
                                  setExperimentalEnv((prev) => ({ ...prev, airPressureKPa: val }));
                                  handleResetSimulation();
                                },
                                style: {
                                  width: '56px',
                                  padding: '2px 4px',
                                  fontSize: '11px',
                                  borderRadius: '3px',
                                  border: '1px solid #9dc8c3',
                                },
                              }),
                              ' kPa'
                            )
                          ),
                          h('input', {
                            type: 'range',
                            min: '50',
                            max: '110',
                            step: '0.5',
                            value: experimentalEnv.airPressureKPa,
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                              setExperimentalEnv((prev) => ({
                                ...prev,
                                airPressureKPa: Number(e.target.value),
                              }));
                              handleResetSimulation();
                            },
                            style: { width: '100%', accentColor: '#0d7377' },
                          }),
                          h(
                            'div',
                            { style: { display: 'flex', gap: '4px', marginTop: '2px' } },
                            ...[
                              { label: 'Sea Level (101.3)', val: 101.325 },
                              { label: 'Denver (83.4)', val: 83.4 },
                              { label: 'High Alt (70.1)', val: 70.1 },
                            ].map((p) =>
                              h(
                                'button',
                                {
                                  key: p.label,
                                  type: 'button',
                                  onClick: () => {
                                    setExperimentalEnv((prev) => ({ ...prev, airPressureKPa: p.val }));
                                    handleResetSimulation();
                                  },
                                  style: {
                                    fontSize: '9.5px',
                                    padding: '1px 5px',
                                    borderRadius: '3px',
                                    border: '1px solid #badfd9',
                                    background:
                                      Math.abs(experimentalEnv.airPressureKPa - p.val) < 0.2
                                        ? '#0d7377'
                                        : '#fff',
                                    color:
                                      Math.abs(experimentalEnv.airPressureKPa - p.val) < 0.2
                                        ? '#fff'
                                        : '#0d7377',
                                    cursor: 'pointer',
                                  },
                                },
                                p.label
                              )
                            )
                          )
                        ),
                        // Air Temperature
                        h(
                          'div',
                          null,
                          h(
                            'div',
                            {
                              style: {
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '3px',
                              },
                            },
                            h('label', null, 'Air Temperature (T):'),
                            h(
                              'div',
                              { style: { display: 'flex', gap: '3px', alignItems: 'center' } },
                              h('input', {
                                type: 'number',
                                step: '1',
                                min: '-20',
                                max: '50',
                                value: experimentalEnv.temperatureC,
                                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                                  const val = Number(e.target.value) || 20;
                                  setExperimentalEnv((prev) => ({ ...prev, temperatureC: val }));
                                  handleResetSimulation();
                                },
                                style: {
                                  width: '50px',
                                  padding: '2px 4px',
                                  fontSize: '11px',
                                  borderRadius: '3px',
                                  border: '1px solid #9dc8c3',
                                },
                              }),
                              ' °C'
                            )
                          ),
                          h('input', {
                            type: 'range',
                            min: '-20',
                            max: '50',
                            step: '1',
                            value: experimentalEnv.temperatureC,
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                              setExperimentalEnv((prev) => ({
                                ...prev,
                                temperatureC: Number(e.target.value),
                              }));
                              handleResetSimulation();
                            },
                            style: { width: '100%', accentColor: '#0d7377' },
                          })
                        ),
                        // Wind Speed
                        h(
                          'div',
                          {
                            style: {
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            },
                          },
                          h('label', null, 'Horizontal Wind Speed:'),
                          h(
                            'div',
                            { style: { display: 'flex', gap: '3px', alignItems: 'center' } },
                            h('input', {
                              type: 'number',
                              step: '0.5',
                              min: '-15',
                              max: '15',
                              value: experimentalEnv.windSpeed,
                              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                                const val = Number(e.target.value) || 0;
                                setExperimentalEnv((prev) => ({ ...prev, windSpeed: val }));
                                handleResetSimulation();
                              },
                              style: {
                                width: '50px',
                                padding: '2px 4px',
                                fontSize: '11px',
                                borderRadius: '3px',
                                border: '1px solid #9dc8c3',
                              },
                            }),
                            ' m/s'
                          )
                        ),
                        // Error sources toggle
                        h(
                          'label',
                          {
                            style: {
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              cursor: 'pointer',
                              fontWeight: 600,
                              color: '#165751',
                            },
                          },
                          h('input', {
                            type: 'checkbox',
                            checked: experimentalEnv.enableErrorSources,
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                              setExperimentalEnv((prev) => ({
                                ...prev,
                                enableErrorSources: e.target.checked,
                              })),
                          }),
                          'Include Equipment Error Fluctuation (Spring jitter ±1.5%, angle play ±0.25°)'
                        ),
                        // Calculated live stats
                        h(
                          'div',
                          {
                            style: {
                              background: '#fff',
                              border: '1px solid #b5ded8',
                              borderRadius: '4px',
                              padding: '5px 8px',
                              fontSize: '10px',
                              lineHeight: 1.45,
                              color: '#165751',
                            },
                          },
                          h('b', null, 'Aerodynamic Properties: '),
                          `Mass m = ${(
                            calculateProjectileMass(
                              experimentalEnv.projectileDiameter,
                              experimentalEnv.material
                            ) * 1000
                          ).toFixed(1)} g · Drag Loss ΔR = -${(
                            idealSummary.range - activeSummary.range
                          ).toFixed(3)} m (-${(
                            ((idealSummary.range - activeSummary.range) / idealSummary.range) *
                            100
                          ).toFixed(1)}%)`
                        )
                      )
                    )
                  : null
              ),
              h(
                'details',
                {
                  style: {
                    margin: 0,
                    padding: '8px 12px',
                    background: '#f8fafc',
                    border: '1px solid #dce6e1',
                    borderRadius: '6px',
                    fontSize: '11px',
                  },
                },
                h(
                  'summary',
                  {
                    style: {
                      cursor: 'pointer',
                      fontWeight: 600,
                      color: '#2d70b3',
                      userSelect: 'none',
                      padding: '2px 0',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    },
                  },
                  h(IconSliders, { size: 13, color: '#2d70b3' }),
                  'Display and measurement options'
                ),
                h(
                  'div',
                  { style: { marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' } },
                  h(
                    'label',
                    { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' } },
                    h('span', null, 'Show trajectory path'),
                    h('input', {
                      'aria-label': 'Show trajectory',
                      type: 'checkbox',
                      checked: showTrajectory,
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setShowTrajectory(e.target.checked),
                    })
                  ),
                  h(
                    'label',
                    { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' } },
                    h('span', null, 'Measurement labels'),
                    h('input', {
                      'aria-label': 'Measurement labels',
                      type: 'checkbox',
                      checked: showLabels,
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setShowLabels(e.target.checked),
                    })
                  ),
                  h(
                    'label',
                    {
                      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' },
                      title: 'Quantizes stopwatch (±0.02 s) and ruler (±0.005 m) readings.',
                    },
                    h('span', null, 'Instrument resolution mode'),
                    h('input', {
                      'aria-label': 'Instrument resolution mode',
                      type: 'checkbox',
                      checked: instrumentPracticeMode,
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setInstrumentPracticeMode(e.target.checked),
                    })
                  ),
                  h(
                    'label',
                    { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' } },
                    h('span', null, 'Lightweight graphics mode'),
                    h('input', {
                      'aria-label': 'Lightweight graphics',
                      type: 'checkbox',
                      checked: lightweight,
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setLightweight(e.target.checked),
                    })
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'edit-apparatus',
                      style: { width: '100%', margin: '4px 0 0', padding: '6px' },
                      onClick: () => {
                        setOpenManualOnImport(true);
                        setActiveModal('import');
                      },
                    },
                    'Edit apparatus dimensions & appearance'
                  ),
                  h(
                    'div',
                    {
                      style: {
                        marginTop: '10px',
                        paddingTop: '10px',
                        borderTop: '1px solid #e2e8f0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      },
                    },
                    h(
                      'div',
                      { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                      h('span', { style: { fontWeight: 600, fontSize: '11px', color: '#1e293b' } }, 'Chalkboard Background'),
                      chalkboardMode !== 'default'
                        ? h(
                            'button',
                            {
                              type: 'button',
                              style: {
                                background: 'transparent',
                                border: 'none',
                                color: '#2563eb',
                                fontSize: '11px',
                                cursor: 'pointer',
                                padding: 0,
                                textDecoration: 'underline',
                              },
                              onClick: () => {
                                setChalkboardMode('default');
                                setChalkboardCustomImage(null);
                              },
                            },
                            'Restore default'
                          )
                        : null
                    ),
                    h(
                      'div',
                      { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' } },
                      h(
                        'button',
                        {
                          type: 'button',
                          style: {
                            padding: '6px 4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            borderRadius: '4px',
                            border: '1px solid ' + (chalkboardMode === 'default' ? '#059669' : '#cbd5e1'),
                            background: chalkboardMode === 'default' ? '#ecfdf5' : '#ffffff',
                            color: chalkboardMode === 'default' ? '#065f46' : '#475569',
                            cursor: 'pointer',
                          },
                          onClick: () => setChalkboardMode('default'),
                        },
                        'Formulas'
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          style: {
                            padding: '6px 4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            borderRadius: '4px',
                            border: '1px solid ' + (chalkboardMode === 'erased' ? '#b45309' : '#cbd5e1'),
                            background: chalkboardMode === 'erased' ? '#fffbeb' : '#ffffff',
                            color: chalkboardMode === 'erased' ? '#92400e' : '#475569',
                            cursor: 'pointer',
                          },
                          onClick: () => setChalkboardMode('erased'),
                        },
                        'Erase Board'
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          style: {
                            padding: '6px 4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            borderRadius: '4px',
                            border: '1px solid ' + (chalkboardMode === 'custom_image' ? '#4338ca' : '#cbd5e1'),
                            background: chalkboardMode === 'custom_image' ? '#eef2ff' : '#ffffff',
                            color: chalkboardMode === 'custom_image' ? '#3730a3' : '#475569',
                            cursor: 'pointer',
                          },
                          onClick: () => {
                            setChalkboardMode('custom_image');
                            if (!chalkboardCustomImage) {
                              setChalkboardCustomImage(SAMPLE_TEACHER_NOTE_IMAGES.inquiry);
                            }
                          },
                        },
                        'Picture / Notes'
                      )
                    ),
                    chalkboardMode === 'custom_image'
                      ? h(
                          'div',
                          {
                            style: {
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              borderRadius: '6px',
                              padding: '8px',
                              marginTop: '2px',
                            },
                          },
                          h(
                            'label',
                            {
                              style: {
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                padding: '6px 10px',
                                background: '#3b82f6',
                                color: '#ffffff',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                              },
                            },
                            'Upload image (PNG/JPG/SVG)',
                            h('input', {
                              type: 'file',
                              accept: 'image/*',
                              style: { display: 'none' },
                              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (ev) => {
                                    const res = ev.target?.result as string;
                                    if (res) {
                                      setChalkboardCustomImage(res);
                                      setChalkboardMode('custom_image');
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }
                              },
                            })
                          ),
                          h(
                            'div',
                            { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                            h('input', {
                              type: 'text',
                              placeholder: 'Or paste image URL...',
                              value: (chalkboardCustomImage && !chalkboardCustomImage.startsWith('data:')) ? chalkboardCustomImage : '',
                              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                                const val = e.target.value.trim();
                                if (val) {
                                  setChalkboardCustomImage(val);
                                  setChalkboardMode('custom_image');
                                }
                              },
                              style: {
                                flex: 1,
                                fontSize: '11px',
                                padding: '4px 6px',
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                              },
                            })
                          ),
                          h(
                            'div',
                            { style: { fontSize: '10px', color: '#64748b' } },
                            'Quick teacher sample notes:'
                          ),
                          h(
                            'div',
                            { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
                            h(
                              'button',
                              {
                                type: 'button',
                                style: {
                                  fontSize: '10px',
                                  padding: '3px 6px',
                                  borderRadius: '3px',
                                  border: '1px solid #cbd5e1',
                                  background: '#ffffff',
                                  cursor: 'pointer',
                                },
                                onClick: () => {
                                  setChalkboardCustomImage(SAMPLE_TEACHER_NOTE_IMAGES.inquiry);
                                  setChalkboardMode('custom_image');
                                },
                              },
                              '🎯 Target Challenge'
                            ),
                            h(
                              'button',
                              {
                                type: 'button',
                                style: {
                                  fontSize: '10px',
                                  padding: '3px 6px',
                                  borderRadius: '3px',
                                  border: '1px solid #cbd5e1',
                                  background: '#ffffff',
                                  cursor: 'pointer',
                                },
                                onClick: () => {
                                  setChalkboardCustomImage(SAMPLE_TEACHER_NOTE_IMAGES.derivation);
                                  setChalkboardMode('custom_image');
                                },
                              },
                              '📐 Derivations'
                            ),
                            h(
                              'button',
                              {
                                type: 'button',
                                style: {
                                  fontSize: '10px',
                                  padding: '3px 6px',
                                  borderRadius: '3px',
                                  border: '1px solid #cbd5e1',
                                  background: '#ffffff',
                                  cursor: 'pointer',
                                },
                                onClick: () => {
                                  setChalkboardCustomImage(SAMPLE_TEACHER_NOTE_IMAGES.safety);
                                  setChalkboardMode('custom_image');
                                },
                              },
                              '🛡️ Lab Protocol'
                            )
                          )
                        )
                      : null
                  )
                )
              ),
              importedMeta
                ? h(
                    'div',
                    { className: 'tip' },
                    h('b', null, 'RECONSTRUCTED EQUIPMENT'),
                    h('p', null, importedMeta.description)
                  )
                : null,

              limits
                ? h(
                    'div',
                    { className: 'tip' },
                    h('b', null, 'APPLIED OPERATING LIMITS'),
                    h(
                      'p',
                      null,
                      `${limits.minAngle != null ? `Min angle ${limits.minAngle}°. ` : ''}${
                        limits.maxAngle != null ? `Max angle ${limits.maxAngle}°. ` : ''
                      }${limits.maxSpeed != null ? `Max speed ${limits.maxSpeed} m/s.` : ''}`
                    )
                  )
                : null
            )
          )
        : (activeWorkflowTab === 'record' || activeWorkflowTab === 'graph')
        ? h(
            'div',
            { className: 'workflow-stage data-plotting-stage', style: { margin: '16px 0' } },
            // Stage heading banner with mode switch tabs
            h(
              'div',
              {
                className: 'workflow-stage-card',
                style: {
                  padding: '14px 20px',
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                  background: '#ffffff',
                    border: '1px solid #e4e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 1px 3px rgba(33, 36, 44, 0.06)',
                },
              },
              h(
                'div',
                null,
                h(
                  'h2',
                  { style: { margin: '0 0 2px 0', fontSize: '19px', color: '#21242c', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 } },
                  h(IconChartBars, { size: 19, color: '#1865f2' }),
                  'Data & Plotting'
                ),
                h(
                  'p',
                  { style: { margin: 0, fontSize: '12px', color: '#626569' } },
                  trials.length ? 'Use your trial measurements to plot points and fit a line.' : 'Launch and record a trial to collect measurements.'
                )
              ),
              h(
                'div',
                { className: 'tabs' },
                ...(
                  [
                    [
                      'student_plot',
                      h(
                        'span',
                        { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
                        h(IconSlope, { size: 11 }),
                        'Slope Tool'
                      ),
                    ],
                    [
                      'trajectory',
                      h(
                        'span',
                        { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
                        h(IconTrajectory, { size: 11 }),
                        'Trajectory'
                      ),
                    ],
                    [
                      'trials_compare',
                      h(
                        'span',
                        { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
                        h(IconCompare, { size: 11 }),
                        'Compare'
                      ),
                    ],
                    ['velocity', h('span', null, 'Velocity ', fmtSub('v', 't'))],
                    ['x', fmtSub('x', 't')],
                    ['y', fmtSub('y', 't')],
                  ] as const
                ).filter(([key]) => !hideLaunchSpeed || key !== 'velocity').map(([key, label]) =>
                  h(
                    'button',
                    {
                      key,
                      type: 'button',
                      className: graphTab === key ? 'active' : '',
                      onClick: () => setGraphTab(key),
                    },
                    label
                  )
                )
              )
            ),

            // Dual-Pane Layout: Left = Data Table, Right = Scientific Plotting Chart
            h(
              'div',
              { className: 'data-plotting-container' },
              // Plot and recorded trials
              h(
                'div',
                { className: 'workflow-stage-card plotting-panel', style: { padding: '16px' } },
                h(ScientificCharts, {
                  tab: graphTab,
                  samples: trajectorySamples,
                  trials,
                  showTheory: showAssignmentTheory,
                  hideLaunchSpeed,
                  hideGravity,
                  elapsedTime,
                  launchParams: params,
                  experimentalEnv,
                  physicsMode,
                  autoPlotTrials,
                  onToggleAutoPlot: setAutoPlotTrials,
                  manuallyPlottedTrialIds,
                  onPlotTrial: handleTogglePlotTrial,
                  customPoints,
                  onCustomPointsChange: setCustomPoints,
                  axes: chartAxes,
                  onAxesChange: setChartAxes,
                  xAxisVar: chartXAxisVar,
                  yAxisVar: chartYAxisVar,
                  showTheoryCurve: chartShowTheoryCurve,
                  onShowTheoryCurveChange: setChartShowTheoryCurve,
                  showLobf: chartShowLobf,
                  onShowLobfChange: setChartShowLobf,
                  lobf: chartLobf,
                  onLobfChange: setChartLobf,
                })
              ),

              // Recorded lab trials
              h(
                'div',
                { className: 'workflow-stage-card trial-panel', style: { padding: '16px' } },
                renderDecimalPlaces(),
                h(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '8px',
                      marginBottom: '12px',
                      borderBottom: '1px solid #f1f5f9',
                      paddingBottom: '8px',
                    },
                  },
                  h(
                    'div',
                    null,
                    h('h3', { style: { margin: 0, fontSize: '15px', color: '#1e293b' } }, `Recorded Lab Trials (${trials.length})`),
                    trials.length > 0 && h('button', {
                      type: 'button', className: 'text-btn', 'aria-expanded': allTrialColumns,
                      onClick: () => setAllTrialColumns(value => !value),
                    }, allTrialColumns ? 'Fewer columns' : 'More measurements')
                  )
                ),

                // Action Toolbar
                h(
                  'div',
                  { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' } },
                  !sharedAssignment && h('button', {
                    type: 'button', className: 'export', onClick: handleQuickSweepFiveAngles,
                    title: 'Record and plot five trials at different launch angles',
                    style: { padding: '4px 8px', fontSize: '11px' },
                  }, 'Get 5 points'),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'export',
                      onClick: handleExportCSV,
                      disabled: trials.length === 0,
                      style: { padding: '4px 8px', fontSize: '11px' },
                    },
                    'Export CSV ⤓'
                  ),
                  trials.length > 0 && h('details', { className: 'compact-options trial-options' },
                    h('summary', null, 'Trial options'),
                    h('button', {
                      type: 'button', className: 'export', onClick: handleClearTrials,
                    }, 'Clear all trials')
                  )
                ),

                // Table
                h(
                  'div',
                  { className: 'table-wrap', tabIndex: 0, role: 'region', 'aria-label': 'Trial measurements', style: { maxHeight: '380px', overflowY: 'auto' } },
                  trials.length === 0
                    ? h(
                        'div',
                        { style: { padding: '28px 14px', textAlign: 'center', color: '#64748b' } },
                        h('p', { style: { margin: 0 } }, 'No trials recorded yet.')
                      )
                    : h(
                        'table',
                        null,
                        h(
                          'thead',
                          null,
                          h(
                            'tr',
                            null,
                            h('th', null, '#'),
                            h('th', null, 'Mode'),
                            h('th', null, 'Angle θ'),
                            !hideLaunchSpeed && h('th', null, 'v₀'),
                            h('th', null, 'Time t'),
                            h('th', null, 'Range R'),
                            compiledTableAxes && h('th', { style: { background: '#eff6ff', color: '#1d4ed8' } }, `X (${compiledTableAxes.xLabel})`),
                            compiledTableAxes && h('th', { style: { background: '#eff6ff', color: '#1d4ed8' } }, `Y (${compiledTableAxes.yLabel})`),
                            ...optionalTrialColumns.map(([key, label]) => h('th', { key }, label))
                          )
                        ),
                        h(
                          'tbody',
                          null,
                          ...trials.map((tr, idx) => {
                            return h(
                              'tr',
                              { key: tr.id },
                              h('td', null, `#${idx + 1}`),
                              h(
                                'td',
                                null,
                                tr.isExperimental
                                  ? h('span', { style: { fontSize: '9px', color: '#0d7377', fontWeight: 700, background: '#e6f5f4', padding: '1px 4px', borderRadius: '3px' } }, tr.material ? `${tr.material.split(' ')[0]}` : 'Drag')
                                  : h('span', { style: { fontSize: '9px', color: '#20507a', fontWeight: 600, background: '#edf3f8', padding: '1px 4px', borderRadius: '3px' } }, 'Ideal')
                              ),
                              h('td', null, `${formatMeasurement(tr.angle)}°`),
                              !hideLaunchSpeed && h('td', null, `${formatMeasurement(tr.speed)} m/s`),
                              h('td', null, `${formatMeasurement(tr.time)} s`),
                              h('td', null, h('b', { style: { color: '#0f172a' } }, `${formatMeasurement(tr.range)} m`)),
                              compiledTableAxes && (() => {
                                const xv = compiledTableAxes.xFn(tr);
                                return h('td', { style: { background: '#f8fbff', color: '#1e3a8a', fontWeight: 600, fontVariantNumeric: 'tabular-nums' } },
                                  Number.isFinite(xv) ? formatMeasurement(xv) : '—');
                              })(),
                              compiledTableAxes && (() => {
                                const yv = compiledTableAxes.yFn(tr);
                                return h('td', { style: { background: '#f8fbff', color: '#1e3a8a', fontWeight: 600, fontVariantNumeric: 'tabular-nums' } },
                                  Number.isFinite(yv) ? formatMeasurement(yv) : '—');
                              })(),
                              ...optionalTrialColumns.map(([key, , read]) => h('td', { key }, formatMeasurement(read(tr))))
                            );
                          })
                        )
                      )
                )
              )
            )
          )
        : // RUN STAGE (Default View)
          h(
            'div',
            { className: 'workflow-stage run-stage' },
            // Main 3D Viewport
            h(
          'section',
          { className: 'center' },
          h(
            'div',
            { className: 'viewport card' },
            h('div', {
              className: 'view-cube-controls',
              onContextMenu: (e: React.MouseEvent<HTMLDivElement>) => {
                if (!(e.target instanceof Element) || !e.target.closest('.view-cube')) return;
                e.preventDefault();
                openCameraMenu();
              },
              onBlur: (e: React.FocusEvent<HTMLDivElement>) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setCameraMenuOpen(false);
              },
              onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                if (e.key === 'Escape' && cameraMenuOpen) closeCameraMenu();
                if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
                  e.preventDefault();
                  openCameraMenu();
                }
              },
            },
              h('div', { className: 'view-cube', ref: cameraCubeRef, role: 'group', 'aria-label': 'Camera view cube' },
                ...([['top', 'Top'], ['experiment', 'Lab'], ['side', 'Side']] as const).map(([view, label]) =>
                  h('button', {
                    key: view,
                    type: 'button',
                    className: 'view-cube-face face-' + view,
                    title: label + ' view. Right-click or select the active face for options.',
                    'aria-pressed': viewMode === view,
                    onClick: () => viewMode === view ? openCameraMenu() : selectCameraView(view),
                  }, label)),
              ),
              cameraMenuOpen && h('div', { className: 'view-cube-menu', ref: cameraMenuRef, role: 'group', 'aria-label': 'Camera options' },
                h('button', { type: 'button', 'aria-pressed': viewMode === 'free',
                  onClick: () => { selectCameraView('free'); closeCameraMenu(); },
                }, 'Free camera'),
                h('button', { type: 'button', 'aria-pressed': viewMode === 'close',
                  onClick: () => { selectCameraView('close'); closeCameraMenu(); },
                }, 'Close-up'),
                h('button', { type: 'button', 'aria-pressed': viewMode === 'marble',
                  onClick: () => { selectCameraView('marble'); closeCameraMenu(); },
                }, 'Focus on marble'),
                h('button', { type: 'button', onClick: () => {
                  setCameraLocked(false);
                  lockedCameraPose.current = null;
                  if (viewMode === 'free') setViewMode('experiment');
                  setResetKey(k => k + 1);
                  closeCameraMenu();
                } }, 'Reset camera'),
                !hideGravity && h('button', { type: 'button', 'aria-pressed': showForces,
                  onClick: () => { setShowForces(!showForces); closeCameraMenu(); },
                }, 'Show forces'),
                isExp && h('button', {
                  type: 'button', 'aria-pressed': showAirflow,
                  onClick: () => { setShowAirflow(!showAirflow); closeCameraMenu(); },
                }, 'Show airflow'),
                h('button', { type: 'button', 'aria-pressed': !isMuted,
                  onClick: () => { setIsMuted(soundManager.toggleMute()); closeCameraMenu(); },
                }, 'Sound'),
                renderDecimalPlaces(),
              ),
            ),

            h(
              'div',
              { className: 'classroom-stopwatch-hud' },
              h(
                'div',
                { className: 'readout-header' },
                h('strong', null, 'Stopwatch'),
                h(
                  'div',
                  { className: 'readout-controls' },
                  h('button', {
                    type: 'button',
                    'aria-expanded': !isHudCollapsed,
                    'aria-controls': 'lab-readings',
                    onClick: () => setIsHudCollapsed((collapsed) => !collapsed),
                  }, isHudCollapsed ? 'Show readings' : 'Hide readings')
                )
              ),
              h(
                'div',
                { className: 'readout-clock' },
                h('strong', null, formatMeasurement(displayTime), h('small', null, ' s')),
                h('span', { role: 'status' },
                  simState === 'running' ? 'Timing'
                    : simState === 'landed' ? 'Landed'
                    : simState === 'paused' ? 'Paused' : 'Ready'
                )
              ),
              h(
                'div',
                { id: 'lab-readings', hidden: isHudCollapsed },
                h('section', { className: 'readout-section', 'aria-label': 'Motion' },
                  renderReadings([
                    ['Position x', formatMeasurement(displayX) + ' m'],
                    ['Height from launch', formatMeasurement(displayY) + ' m'],
                    ...(!hideLaunchSpeed ? [
                      [h('span', null, 'Velocity ', fmtSub('v', 'x')), formatMeasurement(liveState.vx) + ' m/s'] as const,
                      [h('span', null, 'Velocity ', fmtSub('v', 'y')), formatMeasurement(liveState.vy) + ' m/s'] as const,
                    ] : []),
                  ])
                ),
                showForces && !hideGravity && elapsedTime > 0 && elapsedTime < summary.time
                  && h('section', { className: 'readout-section' },
                  h('div', { className: 'readout-section-title' },
                    h('strong', null, 'Forces'),
                    h('span', null, 'Mass ' + formatMeasurement((liveMassKg * 1000)) + ' g')
                  ),
                  renderReadings([
                    [h('span', null, 'Gravity ', fmtSub('F', 'g')), formatMeasurement(liveFg) + ' N ↓'],
                    ...(isExp ? [[h('span', null, 'Drag ', fmtSub('F', 'd')), formatMeasurement(liveFdrag) + ' N'] as const] : []),
                    [h('span', null, 'Net ', fmtSub('F', 'net')), formatMeasurement(liveFnet) + ' N'],
                  ], isExp ? 'readout-grid-three' : '')
                ),
                showAssignmentTheory && h('section', { className: 'readout-section' },
                  h('div', { className: 'readout-section-title' },
                    h('strong', null, physicsMode === 'experimental' ? 'Predicted flight' : 'Theoretical values'),
                    h('span', null, summary.isSymmetricLaunch ? 'Level'
                      : Math.abs(params.angle) <= 0.001 && params.height > 0.005 ? 'Horizontal' : null)
                  ),
                  renderReadings([
                    ['Range', formatMeasurement(summary.range) + ' m'],
                    ['Rise above launch', formatMeasurement((summary.maxHeight - params.height)) + ' m'],
                    ['Flight time', formatMeasurement(summary.time) + ' s'],
                    ['Impact speed', formatMeasurement(summary.impactSpeed) + ' m/s'],
                  ])
                )
              )
            ),

            h(LabViewportCanvas, {
              params,
              elapsedTime,
              showTrajectory,
              showLabels,
              showForces: showForces && !hideGravity,
              showAirflow: showAirflow && isExp,
              lightweight,
              equipment,
              viewMode,
              cameraLocked,
              lockedCameraPose,
              mountMode,
              resetKey,
              showTheory: showAssignmentTheory,
              targetDistanceM: teacherConfig.targetCupDistanceM,
              recordedLandings: trials,
              physicsMode,
              experimentalEnv,
              chalkboardMode,
              chalkboardCustomImage,
            }),

            h(
              'div',
              { className: 'view-bottom' },
              h(
                'span',
                { style: { opacity: 0.75, fontSize: '9px', marginLeft: 'auto' } },
                cameraLocked ? 'Camera locked' : viewMode === 'free' ? 'Drag to look · WASD to move · Q/E down/up · Shift for speed'
                  : 'Rotate: Drag · Pan: Shift+Drag · Zoom: Scroll'
              )
            )
          ),

          // Experiment Playback Transport Bar
          h(
            'div',
            { className: 'transport card' },
            h(
              'div',
              null,
              h(
                'div',
                { className: 'transport-sub', role: 'status', style: { marginTop: 0 } },
                simState === 'landed'
                  ? `${crossedTargetHeight ? 'Crossed target height' : 'Landed'} at x = ${formatMeasurement(displayX)} m (t = ${formatMeasurement(displayTime)} s)`
                  : simState === 'running'
                  ? 'Flight in progress…'
                  : simState === 'paused'
                  ? 'Paused'
                  : 'Ready to launch',
                simState === 'landed' && autoRecord && hasAutoRecordedCurrentRunRef.current && h('span', { className: 'recorded-confirmation' }, 'Trial recorded'),
                targetFeedback && h('div', { className: 'target-feedback' }, targetFeedback)
              ),
              showMissedTargetNote && simState === 'ready' && h('p', { className: 'setup-reference-note', role: 'status' }, missedTargetNote),
              simState === 'landed' && !hasAutoRecordedCurrentRunRef.current &&
                h('button', { type: 'button', className: 'text-btn', onClick: handleRecordTrial }, 'Record trial'),
              h('details', { className: 'compact-options' },
                h('summary', null, 'Recording settings'),
                h('label', null, h('input', { type: 'checkbox', checked: autoRecord,
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => setAutoRecord(e.currentTarget.checked),
                }), 'Record completed trials automatically'),
              ),
              trials.length > 0 && h('button', { type: 'button', className: 'text-btn', onClick: () => goToWorkflowStage('graph') },
                'Plot trial data (' + trials.length + ')')
            ),

            h(
              'div',
              {
                className: 'transport-actions',
                style: { alignItems: 'center', flexWrap: 'wrap', gap: '8px' },
              },
              (simState === 'running' || simState === 'paused') && h(
                'button',
                {
                  type: 'button',
                  className: 'reset',
                  onClick: handleResetSimulation,
                  style: { display: 'inline-flex', alignItems: 'center', gap: '4px' },
                  title: 'Reset marble position to launcher muzzle exit',
                },
                h(IconReset, { size: 12 }),
                'Reset trial'
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'play',
                  id: 'launch-marble-btn',
                  onClick: handlePlayToggle,
                  style: {
                    background: simState === 'running' ? '#dc2626' : '#2563eb',
                    padding: '11px 20px',
                    fontSize: '13px',
                    fontWeight: 700,
                    borderRadius: '6px',
                    boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  },
                },
                simState === 'running'
                  ? '⏸ Pause Flight'
                  : simState === 'paused'
                  ? '▶ Resume Flight'
                  : simState === 'landed'
                  ? [h(IconReset, { size: 13, key: 'i' }), ' Launch Again']
                  : [h(IconLaunch, { size: 13, key: 'i' }), ' Launch Marble']
              )
            )
          ),

          // Interactive Frame-by-Frame Time Scrubber
          h(
            'div',
            {
              style: {
                padding: '8px 18px',
                borderTop: '1px solid #edf1ef',
                background: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontSize: '11px',
                color: '#475569',
              },
            },
            h(
              'span',
              {
                style: {
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '11px',
                  background: '#eef2f6',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  color: '#334155',
                },
              },
              h(IconSpeedometer, { size: 12, color: '#47677e' }),
              teacherConfig.showTheory
                ? `${formatMeasurement(elapsedTime)} s / ${formatMeasurement(summary.time)} s`
                : `${formatMeasurement(elapsedTime)} s`
            ),
            h('input', {
              'aria-label': 'Simulation time scrubber',
              type: 'range',
              min: 0,
              max: summary.time,
              step: 0.005,
              value: elapsedTime,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                const val = Number(e.target.value);
                setElapsedTime(val);
                setSimState(val >= summary.time ? 'landed' : val > 0 ? 'paused' : 'ready');
              },
              style: { flex: 1, accentColor: '#2563eb', cursor: 'ew-resize' },
            }),
            h('input', {
              'aria-label': 'Simulation time in seconds',
              type: 'number',
              min: 0,
              max: Number(summary.time.toFixed(3)),
              step: 0.01,
              value: Number(elapsedTime.toFixed(2)),
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                const raw = e.target.value;
                if (raw === '') return;
                const val = Math.max(0, Math.min(summary.time, Number(raw) || 0));
                setElapsedTime(val);
                setSimState(val >= summary.time ? 'landed' : val > 0 ? 'paused' : 'ready');
              },
              style: {
                width: '56px',
                padding: '3px 6px',
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: '"IBM Plex Mono", monospace',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                textAlign: 'right',
                background: '#fff',
                color: '#1e293b',
              },
            }),
            h('span', { style: { fontSize: '11px', color: '#64748b' } }, 's'),
            h('select', {
              className: 'playback-speed', 'aria-label': 'Playback speed', title: 'Playback speed',
              value: playbackSpeed,
              onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setPlaybackSpeed(Number(e.currentTarget.value)),
            },
              h('option', { value: 1 }, '1×'),
              h('option', { value: 0.25 }, '0.25×')
            )
          )
        ),

            // Quick Adjust Bar right below 3D viewport
            h(
              'div',
              { className: 'quick-adjust-bar' },
              h(
                'div',
                { className: 'quick-adjust-controls' },
                adjustableVariables.length ? h(React.Fragment, null,
                  h('label', { className: 'quick-adjust-picker' }, 'Adjust variable',
                    h('select', { 'aria-label': 'Adjust variable', value: selectedQuickVariable,
                      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setQuickVariable(e.target.value as ExperimentVariable),
                    }, ...adjustableVariables.map(key => h('option', { key, value: key }, EXPERIMENT_VARIABLE_LABELS[key])))
                  ),
                  selectedQuickVariable && renderQuickVariable(selectedQuickVariable)
                ) : h('span', null, 'All experiment variables are locked.')
              ),
            )
          ),

      h(
        'footer',
        null,
        h('span', null, `Europa Lab · ${equipment.name}`),
        h(
          'span',
          null,
          physicsMode === 'experimental'
            ? 'Realistic Aerodynamics (Quadratic Drag)'
            : 'Ideal Vacuum Kinematics'
        )
      )
    ),

    // Modals
    !sharedAssignment && activeModal === 'import'
      ? h(EquipmentModal, {
          currentSpec: equipment,
          currentLimits: limits,
          initialOpenManualEditor: openManualOnImport,
          onApplyApparatus: (nextSpec, nextLimits, meta) => {
            setEquipment(nextSpec);
            setLimits(nextLimits);
            setImportedMeta(meta);
            setResetKey(key => key + 1);
            if (nextSpec.id !== equipment.id) setMountMode(nextSpec.visual.mount_type === 'clamp' ? 'clamp' : 'stand');
            if (nextLimits) {
              setParams((prev) => ({
                ...prev,
                angle:
                  nextLimits.minAngle != null
                    ? Math.max(
                        nextLimits.minAngle,
                        nextLimits.maxAngle != null
                          ? Math.min(prev.angle, nextLimits.maxAngle)
                          : prev.angle
                      )
                    : nextLimits.maxAngle != null
                    ? Math.min(prev.angle, nextLimits.maxAngle)
                    : prev.angle,
                speed:
                  nextLimits.maxSpeed != null
                    ? Math.min(prev.speed, nextLimits.maxSpeed)
                    : prev.speed,
              }));
            }
            handleResetSimulation();
            setActiveModal(null);
          },
          onClose: () => setActiveModal(null),
        })
      : null,

    !sharedAssignment && activeModal === 'teacher'
      ? h(TeacherModal, {
          config: teacherConfig,
          mode,
          currentParams: params,
          currentEquipment: equipment,
          currentLimits: limits,
          currentMount: mountMode,
          currentPhysics: physicsMode,
          currentEnvironment: experimentalEnv,
          currentBoardMode: chalkboardMode,
          currentBoardImage: chalkboardCustomImage,
          onUpdateConfig: setTeacherConfig,
          onGenerateTrial: () => {
            appendTrialForParams(params);
            setActiveModal(null);
            setActiveWorkflowTab('graph');
          },
          onToggleMode: (nextMode) => {
            setMode(nextMode);
            setActiveModal(null);
          },
          onApplyPresetActivity: (act) => {
            calculateTheoreticalSummary(act.params);
            if (act.equipment && !Object.hasOwn(CLASSROOM_APPARATUS_PRESETS, act.equipment.id) && !readAssignmentEquipment(act.equipment)) {
              throw new Error('Invalid assignment equipment');
            }
            setTeacherConfig(act);
            const targetEquipment = act.equipment || equipment;
            const targetMount = act.mountMode === 'clamp' || act.mountMode === 'stand' ? act.mountMode : mountMode;
            setMountMode(targetMount);
            const minH = computeMinimumClearanceHeight(targetEquipment, act.params.angle, targetMount);
            const safeHeight = Math.max(act.params.height, minH);
            const safeLandingH =
              act.params.landingHeight != null
                ? (act.params.landingHeight === act.params.height ? safeHeight : act.params.landingHeight)
                : safeHeight;
            setParams({
              ...act.params,
              height: safeHeight,
              landingHeight: safeLandingH,
            });
            setLandingMode(safeLandingH === 0 ? 'tabletop' : safeLandingH === safeHeight ? 'same' : 'custom');
            if (act.equipment) setEquipment(act.equipment);
            if (act.limits !== undefined) setLimits(act.limits);
            if (act.environment || act.material || act.physicsMode) {
              const nextPhysics = act.physicsMode ?? physicsMode;
              setPhysicsMode(nextPhysics);
              preserveAssignmentMaterial.current = targetEquipment.id !== equipment.id ||
                targetEquipment.projectileMaterial !== equipment.projectileMaterial;
              setExperimentalEnv(readAssignmentEnvironment(act.environment ?? { ...experimentalEnv, material: act.material },
                nextPhysics, targetEquipment));
            }
            if (act.chalkboardMode) {
              setChalkboardMode(act.chalkboardMode);
            }
            if (act.chalkboardCustomImage !== undefined) {
              setChalkboardCustomImage(act.chalkboardCustomImage);
            }
            handleResetSimulation();
          },
          onClose: () => setActiveModal(null),
        })
      : null,

    tourOpen
      ? h('div', { className: 'overlay', onClick: () => leaveTour() },
          h('div', {
            className: 'modal lab-tour',
            role: 'dialog',
            'aria-modal': true,
            'aria-labelledby': 'lab-tour-title',
            onClick: (event: React.MouseEvent) => event.stopPropagation(),
            onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                leaveTour();
              }
              if (event.key !== 'Tab') return;
              const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
              const first = buttons[0], last = buttons.at(-1);
              const active = document.activeElement as HTMLButtonElement;
              if (!buttons.includes(active) || (event.shiftKey ? active === first : active === last)) {
                event.preventDefault();
                (event.shiftKey ? last : first)?.focus();
              }
            },
          },
            h('button', { type: 'button', className: 'close', onClick: () => leaveTour(), 'aria-label': 'Close' },
              h(IconClose, { size: 14 })),
            h('div', { className: 'lab-tour-intro' },
              h('h2', { id: 'lab-tour-title', tabIndex: -1 }, 'Explore projectile motion'),
              h('p', null, 'Change one setting. Launch a marble. Use your measurements to explain what changed.')),
            h('ul', { className: 'lab-tour-steps' },
              ...([
                ['setup', 'Set up', 'Choose a launcher and a setting to test.'],
                ['run', 'Run a trial', 'Use the ready-to-launch setup and record a result.'],
                ['graph', 'Plot', 'Put recorded measurements on a graph.'],
              ] as const).map(([tab, title, description]) =>
                h('li', { key: tab },
                  h('button', { type: 'button', onClick: () => leaveTour(tab) },
                    h('strong', null, title),
                    h('span', null, description),
                    h('span', { className: 'lab-tour-arrow', 'aria-hidden': true }, '›')
                  )
                )
              )
            )
          )
        )
      : null
  );
};
