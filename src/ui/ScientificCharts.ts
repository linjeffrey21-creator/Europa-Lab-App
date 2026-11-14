import React from 'react';
import { axisVariables, canonicalAxisExpression, checkGraphGoal, compileAxis, fitGraphPoints } from './graph-expressions.ts';
import type { GraphAxes } from './graph-expressions.ts';
import type {
  KinematicState,
  LaunchParameters,
  ExperimentalEnvironment,
  PhysicsMode,
} from '../physics/projectile.ts';
import {
  calculateTheoreticalSummary,
  calculateExperimentalSummary,
} from '../physics/projectile.ts';
import {
  IconTarget,
  IconStar,
  IconRuler,
  IconLightbulb,
  IconSlope,
  IconCheck,
  IconClose,
  IconInstant,
  IconReset,
  IconZoomIn,
  IconZoomOut,
} from './icons.ts';

const h = React.createElement;

type GraphBounds = { xMin: number; xMax: number; yMin: number; yMax: number };
const BUTTON_ZOOM_STEP = 1.07;

function zoomGraph(bounds: GraphBounds, factor: number, anchorX = 0.5, anchorY = 0.5): GraphBounds {
  const spanX = bounds.xMax - bounds.xMin;
  const spanY = bounds.yMax - bounds.yMin;
  const newSpanX = spanX * factor;
  const newSpanY = spanY * factor;
  if (newSpanX < 0.005 || newSpanX > 20000 || newSpanY < 0.005 || newSpanY > 20000) return bounds;

  const xMin = bounds.xMin + anchorX * (spanX - newSpanX);
  const yMin = bounds.yMin + anchorY * (spanY - newSpanY);
  return { xMin, xMax: xMin + newSpanX, yMin, yMax: yMin + newSpanY };
}
const { useState, useRef, useEffect } = React;

interface KatexMathProps {
  math: string;
  display?: boolean;
  className?: string;
  fallbackText?: string;
}

export const KatexMath: React.FC<KatexMathProps> = ({
  math,
  display = false,
  className,
  fallbackText,
}) => {
  const containerRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const w = typeof window !== 'undefined' ? (window as any) : null;
    if (w && w.katex && typeof w.katex.renderToString === 'function') {
      try {
        containerRef.current.innerHTML = w.katex.renderToString(math, {
          displayMode: display,
          throwOnError: false,
        });
        return;
      } catch (err) {
        console.warn('KaTeX rendering error:', err);
      }
    }
    containerRef.current.textContent = fallbackText ?? math;
  }, [math, display, fallbackText]);

  return h('span', {
    ref: containerRef,
    className: className ?? (display ? 'katex-display-box' : 'katex-inline-box'),
    style: {
      display: display ? 'block' : 'inline-block',
      verticalAlign: display ? 'baseline' : 'middle',
    },
  });
};

export type GraphTabMode = 'student_plot' | 'x' | 'y' | 'velocity' | 'trajectory' | 'trials_compare';

export interface RecordedTrial {
  id: number;
  angle: number;
  speed: number;
  height: number;
  landingHeight?: number;
  isSymmetric?: boolean;
  gravity: number;
  time: number;
  maxHeight: number;
  range: number;
  impactSpeed: number;
  predictedRangeNote?: string;
  apparatusName: string;
  isExperimental?: boolean;
  material?: string;
  dragLossRangeM?: number;
  dragLossPct?: number;
}

export type PlottableVariableKey =
  | 'angle'
  | 'sin2Angle'
  | 'speed'
  | 'height'
  | 'time'
  | 'maxHeight'
  | 'range'
  | 'impactSpeed';

const VARIABLE_META: Record<
  PlottableVariableKey,
  { label: string; unit: string; defaultMax: number }
> = {
  angle: { label: 'Launch Angle θ', unit: '°', defaultMax: 90 },
  sin2Angle: { label: 'sin(2θ)', unit: 'unitless', defaultMax: 1.0 },
  speed: { label: 'Initial Speed v₀', unit: 'm/s', defaultMax: 8 },
  height: { label: 'Launch Height h₀', unit: 'm', defaultMax: 1.5 },
  time: { label: 'Flight Time t', unit: 's', defaultMax: 1.5 },
  maxHeight: { label: 'Max Height H', unit: 'm', defaultMax: 2.0 },
  range: { label: 'Horizontal Range R', unit: 'm', defaultMax: 3.0 },
  impactSpeed: { label: 'Impact Speed v₁', unit: 'm/s', defaultMax: 10 },
};

export interface StudentPlottedPoint {
  id: number;
  x: number;
  y: number;
  trialNum?: number;
  xVar?: PlottableVariableKey;
  yVar?: PlottableVariableKey;
  axesKey?: string;
}

const variableExpression: Record<PlottableVariableKey, string> = {
  angle: 'theta', sin2Angle: 'sin(2 theta)', speed: 'v0', height: 'h0',
  time: 't', maxHeight: 'H', range: 'R', impactSpeed: 'impactSpeed',
};

const axisSymbols: Readonly<Record<string, string>> = { theta: 'θ', v0: 'v₀', h0: 'h₀', hend: 'h₁', impactspeed: 'v₁' };
const axisSymbolToken = /(^|[^a-z])((?:sin|cos|tan|sqrt|abs)?)(theta|v0|h0|hEnd|impactSpeed)(?![a-z0-9])/gi;
const squareRootToken = /(^|[^a-z])sqrt(?![a-z])/gi;
const superscriptDigits: Readonly<Record<string, string>> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '-': '⁻', '+': '⁺',
};
const toSuperscript = (text: string) => [...text].map((ch) => superscriptDigits[ch] ?? ch).join('');
const caretSuperscriptToken = /\^([+-]\d*|\d+)/g;
const trailingSuperscriptDigitToken = /([⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺])(\d+)/g;
export const displayAxisExpression = (expression: string) =>
  expression.replace(axisSymbolToken, (_match, boundary, fn, variable) => boundary + fn + axisSymbols[variable.toLowerCase()])
    .replace(squareRootToken, "$1√")
    .replace(caretSuperscriptToken, (_match, exp) => toSuperscript(exp));

function axisMetadata(expression: string) {
  const matching = (Object.keys(variableExpression) as PlottableVariableKey[])
    .find((key) => variableExpression[key].replaceAll(' ', '') === canonicalAxisExpression(expression).replaceAll(' ', ''));
  return matching ? VARIABLE_META[matching] : { label: displayAxisExpression(expression), unit: '', defaultMax: 1 };
}

function boundsForPoints(points: StudentPlottedPoint[], defaultX: number, defaultY: number): GraphBounds {
  if (!points.length) return { xMin: 0, xMax: defaultX, yMin: 0, yMax: defaultY };
  const extent = (values: number[]) => {
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const margin = (max - min) * 0.12;
    return [min < 0 ? min - margin : 0, max > 0 ? max + margin : min < 0 ? margin : 1];
  };
  const [xMin, xMax] = extent(points.map((point) => point.x));
  const [yMin, yMax] = extent(points.map((point) => point.y));
  return { xMin, xMax, yMin, yMax };
}

export interface ScientificChartsProps {
  tab: GraphTabMode;
  axes?: GraphAxes;
  onAxesChange?: (axes: GraphAxes) => void;
  samples: KinematicState[];
  trials: RecordedTrial[];
  showTheory: boolean;
  hideLaunchSpeed?: boolean;
  hideGravity?: boolean;
  elapsedTime: number;
  launchParams?: LaunchParameters;
  experimentalEnv?: ExperimentalEnvironment;
  physicsMode?: PhysicsMode;
  autoPlotTrials?: boolean;
  onToggleAutoPlot?: (enabled: boolean) => void;
  manuallyPlottedTrialIds?: number[];
  onPlotTrial?: (trialId: number) => void;
  customPoints?: StudentPlottedPoint[];
  onCustomPointsChange?: (points: StudentPlottedPoint[]) => void;
  xAxisVar?: PlottableVariableKey;
  yAxisVar?: PlottableVariableKey;
  showTheoryCurve?: boolean;
  onShowTheoryCurveChange?: (v: boolean) => void;
  showLobf?: boolean;
  onShowLobfChange?: (v: boolean) => void;
  lobf?: { x1: number; y1: number; x2: number; y2: number };
  onLobfChange?: (lobf: { x1: number; y1: number; x2: number; y2: number }) => void;
}

function computeNiceStep(span: number, targetCount: number = 7): number {
  if (span <= 0 || !Number.isFinite(span)) return 1;
  const rawStep = span / targetCount;
  const power = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const mantissa = rawStep / power;
  let niceMantissa = 1;
  if (mantissa >= 1.5 && mantissa < 3.5) niceMantissa = 2;
  else if (mantissa >= 3.5 && mantissa < 7.5) niceMantissa = 5;
  else if (mantissa >= 7.5) niceMantissa = 10;
  return niceMantissa * power;
}

function formatTick(val: number, step: number): string {
  if (Math.abs(val) < 1e-9) return '0';
  if (step >= 1) {
    return Math.abs(val % 1) < 1e-5 ? String(Math.round(val)) : val.toFixed(1);
  }
  const decimals = Math.min(4, Math.max(1, -Math.floor(Math.log10(step)) + 1));
  return val.toFixed(decimals);
}

export const ScientificCharts: React.FC<ScientificChartsProps> = ({
  tab,
  axes: controlledAxes,
  onAxesChange,
  samples,
  trials,
  showTheory,
  hideLaunchSpeed = false,
  hideGravity = false,
  elapsedTime,
  launchParams,
  experimentalEnv,
  physicsMode,
  autoPlotTrials: autoPlotProp,
  onToggleAutoPlot,
  manuallyPlottedTrialIds = [],
  onPlotTrial,
  customPoints: customPointsProp,
  onCustomPointsChange,
  xAxisVar: propXAxisVar,
  yAxisVar: propYAxisVar,
  showTheoryCurve: propShowTheoryCurve,
  onShowTheoryCurveChange,
  showLobf: propShowLobf,
  onShowLobfChange,
  lobf: propLobf,
  onLobfChange,
}) => {
  const [localAxes, setLocalAxes] = useState<GraphAxes>();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Student Interactive Graphing State (Simplified & Frictionless for Students)
  const [internalAutoPlot, setInternalAutoPlot] = useState<boolean>(false);
  const isAutoPlot = typeof autoPlotProp === 'boolean' ? autoPlotProp : internalAutoPlot;

  const handleToggleAutoPlot = (nextVal: boolean) => {
    setInternalAutoPlot(nextVal);
    onToggleAutoPlot?.(nextVal);
  };

  const [internalXAxisVar] = useState<PlottableVariableKey>(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('x_var') === 'time' || sp.get('chart_vars') === 'time_range') return 'time';
      if (sp.get('x_var') === 'sin2Angle') return 'sin2Angle';
    }
    return 'angle';
  });
  const xAxisVar = propXAxisVar !== undefined ? propXAxisVar : internalXAxisVar;
  const [internalYAxisVar] = useState<PlottableVariableKey>('range');
  const yAxisVar = propYAxisVar !== undefined ? propYAxisVar : internalYAxisVar;
  const axes = controlledAxes ?? localAxes ?? { x: variableExpression[xAxisVar], y: variableExpression[yAxisVar] };
  const [draftX, setDraftX] = useState(() => displayAxisExpression(axes.x));
  const [draftY, setDraftY] = useState(() => displayAxisExpression(axes.y));
  const [axisError, setAxisError] = useState('');
  const [activeAxis, setActiveAxis] = useState<'x' | 'y'>('x');
  const xInput = useRef<HTMLInputElement>(null);
  const yInput = useRef<HTMLInputElement>(null);
  const hasFocusedAxis = useRef(false);

  const isHiddenVariable = (token: string) =>
    (hideLaunchSpeed && (token === 'v0' || token === 'impactSpeed')) || (hideGravity && token === 'g');

  const changeAxes = (next: GraphAxes) => {
    setLocalAxes(next);
    onAxesChange?.(next);
  };

  const tryApplyDraftAxes = (rawX: string, rawY: string) => {
    const nextX = canonicalAxisExpression(rawX.trim());
    const nextY = canonicalAxisExpression(rawY.trim());
    if (!nextX || !nextY) return;
    try {
      const compiledX = compileAxis(nextX);
      const compiledY = compileAxis(nextY);
      if ([...compiledX.variables, ...compiledY.variables].some(isHiddenVariable)) return;
    } catch {
      return;
    }
    setAxisError('');
    if (nextX !== canonicalAxisExpression(axes.x) || nextY !== canonicalAxisExpression(axes.y)) {
      changeAxes({ ...axes, x: nextX, y: nextY });
    }
  };

  const updateAxisDraft = (axis: 'x' | 'y', input: HTMLInputElement, setDraft: (value: string) => void) => {
    // Work right to left so replacing a token keeps the other offsets valid.
    const replaceTokens = (pattern: RegExp, replacement: (match: RegExpMatchArray) => [string, string]) => {
      for (const match of [...input.value.matchAll(pattern)].reverse()) {
        const end = match.index! + match[0].length;
        const [token, symbol] = replacement(match);
        const start = end - token.length;
        const moveCaret = (position: number) => position >= end
          ? position + symbol.length - token.length
          : Math.min(position, start + symbol.length);
        const selectionStart = moveCaret(input.selectionStart ?? end);
        const selectionEnd = moveCaret(input.selectionEnd ?? end);
        const direction = input.selectionDirection ?? undefined;
        input.setRangeText(symbol, start, end);
        input.setSelectionRange(selectionStart, selectionEnd, direction);
      }
    };
    replaceTokens(axisSymbolToken, match => [match[3], axisSymbols[match[3].toLowerCase()]]);
    replaceTokens(squareRootToken, () => ['sqrt', '√']);
    replaceTokens(caretSuperscriptToken, (match) => [match[0], toSuperscript(match[1])]);
    replaceTokens(trailingSuperscriptDigitToken, (match) => [match[2], toSuperscript(match[2])]);
    setDraft(input.value);
    tryApplyDraftAxes(
      axis === 'x' ? input.value : (xInput.current?.value ?? draftX),
      axis === 'y' ? input.value : (yInput.current?.value ?? draftY)
    );
  };

  const insertAxisKey = (text: string, kind: 'variable' | 'operator' | 'group') => {
    const input = activeAxis === 'x' ? xInput.current : yInput.current;
    if (!input) return;
    const { value } = input;
    const start = hasFocusedAxis.current ? input.selectionStart ?? value.length : 0;
    const end = hasFocusedAxis.current ? input.selectionEnd ?? start : value.length;
    const selected = value.slice(start, end);
    const left = value.slice(0, start);
    const right = value.slice(end);
    const prefix = kind !== 'operator' && /[\p{L}\p{N})]$/u.test(left.trimEnd()) ? ' × ' : '';
    const suffix = kind !== 'operator' && /^[\p{L}\p{N}.(]/u.test(right.trimStart()) ? ' × ' : '';
    const body = kind === 'group' ? text + '(' + selected + ')' : text;
    const inserted = prefix + body + suffix;
    if (value.length - selected.length + inserted.length > input.maxLength) return;

    input.focus({ preventScroll: true });
    input.setRangeText(inserted, start, end, 'end');
    const caret = kind === 'group' && !selected
      ? start + prefix.length + text.length + 1
      : start + inserted.length;
    input.setSelectionRange(caret, caret);
    (activeAxis === 'x' ? setDraftX : setDraftY)(input.value);
    tryApplyDraftAxes(
      activeAxis === 'x' ? input.value : (xInput.current?.value ?? draftX),
      activeAxis === 'y' ? input.value : (yInput.current?.value ?? draftY)
    );
  };

  const [internalCustomPoints, setInternalCustomPoints] = useState<StudentPlottedPoint[]>([]);
  const customPoints = customPointsProp !== undefined ? customPointsProp : internalCustomPoints;
  const setCustomPoints = (action: React.SetStateAction<StudentPlottedPoint[]>) => {
    const nextPoints = typeof action === 'function' ? (action as (prev: StudentPlottedPoint[]) => StudentPlottedPoint[])(customPoints) : action;
    setInternalCustomPoints(nextPoints);
    onCustomPointsChange?.(nextPoints);
  };

  const [internalShowTheoryCurve, setInternalShowTheoryCurve] = useState<boolean>(false);
  const showTheoryCurve = propShowTheoryCurve !== undefined ? propShowTheoryCurve : internalShowTheoryCurve;
  const setShowTheoryCurve = (v: boolean) => {
    setInternalShowTheoryCurve(v);
    onShowTheoryCurveChange?.(v);
  };

  const [internalShowLobf, setInternalShowLobf] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      return sp.get('open_slope') === '1';
    }
    return false;
  });
  const showLobf = propShowLobf !== undefined ? propShowLobf : internalShowLobf;
  const setShowLobf = (v: boolean) => {
    setInternalShowLobf(v);
    onShowLobfChange?.(v);
  };

  // Line of Best Fit endpoints in data coordinates [x1, y1, x2, y2]
  const [internalLobf, setInternalLobf] = useState<{ x1: number; y1: number; x2: number; y2: number }>({
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
  });
  const lobf = propLobf !== undefined ? propLobf : internalLobf;
  const setLobf = (v: { x1: number; y1: number; x2: number; y2: number } | ((prev: { x1: number; y1: number; x2: number; y2: number }) => { x1: number; y1: number; x2: number; y2: number })) => {
    const next = typeof v === 'function' ? v(lobf) : v;
    setInternalLobf(next);
    onLobfChange?.(next);
  };

  const [draggingHandle, setDraggingHandle] = useState<'p1' | 'p2' | null>(null);
  const [studentSlopeGuess, setStudentSlopeGuess] = useState<string>('');
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Desmos-style Free Navigation Viewport State (xMin, xMax, yMin, yMax)
  const [viewBounds, setViewBounds] = useState<GraphBounds>(() => {
    const maxX = VARIABLE_META[xAxisVar]?.defaultMax || 10;
    const maxY = VARIABLE_META[yAxisVar]?.defaultMax || 10;
    return { xMin: 0, xMax: maxX, yMin: 0, yMax: maxY };
  });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{
    clientX: number;
    clientY: number;
    startBounds: { xMin: number; xMax: number; yMin: number; yMax: number };
    moved: boolean;
  }>({
    clientX: 0,
    clientY: 0,
    startBounds: { xMin: 0, xMax: 10, yMin: 0, yMax: 10 },
    moved: false,
  });
  const touchStartRef = useRef<{
    touches: Array<{ clientX: number; clientY: number }>;
    startBounds: { xMin: number; xMax: number; yMin: number; yMax: number };
    startDist: number;
  }>({
    touches: [],
    startBounds: { xMin: 0, xMax: 10, yMin: 0, yMax: 10 },
    startDist: 0,
  });

  const xExpression = React.useMemo(() => compileAxis(axes.x), [axes.x]);
  const yExpression = React.useMemo(() => compileAxis(axes.y), [axes.y]);
  const axesKey = JSON.stringify([axes.x, axes.y].map(canonicalAxisExpression));
  const usesDefaultAxes = canonicalAxisExpression(axes.x) === variableExpression[xAxisVar] && canonicalAxisExpression(axes.y) === variableExpression[yAxisVar];
  const xMeta = axisMetadata(axes.x);
  const yMeta = axisMetadata(axes.y);
  const axisUsesHiddenVariable = [xExpression, yExpression].some(axis => [...axis.variables].some(isHiddenVariable));
  const evaluateTrialPoint = (trial: RecordedTrial, index: number): StudentPlottedPoint[] => {
    const x = xExpression(trial);
    const y = yExpression(trial);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e12 || Math.abs(y) > 1e12) return [];
    return [{ id: trial.id, x, y, trialNum: index + 1 }];
  };
  const plottedTrials = trials.filter((trial) => !axisUsesHiddenVariable && (isAutoPlot || manuallyPlottedTrialIds.includes(trial.id)));
  const trialPoints = plottedTrials.flatMap(evaluateTrialPoint);
  const allTrialPoints = axisUsesHiddenVariable ? [] : trials.flatMap(evaluateTrialPoint);
  const belongsToAxes = (point: StudentPlottedPoint) => point.axesKey
    ? canonicalAxisExpression(point.axesKey) === axesKey
    : usesDefaultAxes && (!point.xVar || point.xVar === xAxisVar) && (!point.yVar || point.yVar === yAxisVar);
  const plottedPoints = [...trialPoints, ...customPoints.filter(belongsToAxes)];
  const dataKey = JSON.stringify(plottedPoints.map(({ x, y }) => [x, y]));
  const trialKey = JSON.stringify(trialPoints.map(({ x, y }) => [x, y]));
  const allTrialKey = JSON.stringify(allTrialPoints.map(({ x, y }) => [x, y]));
  const fitBounds = boundsForPoints(plottedPoints.length ? plottedPoints : allTrialPoints, xMeta.defaultMax, yMeta.defaultMax);
  const goalResults = tab === 'student_plot' && !hideLaunchSpeed && !hideGravity
    ? (['speed', 'gravity', 'horizontal'] as const).flatMap((goal) => {
        const fit = checkGraphGoal(goal, xExpression, yExpression, plottedTrials);
        return fit ? [{ goal, ...fit }] : [];
      })
    : [];

  useEffect(() => {
    if (tab === 'student_plot') setViewBounds(fitBounds);
  }, [tab, axesKey, trialKey, allTrialKey]);

  useEffect(() => {
    if (tab !== 'student_plot') return;
    const fit = fitGraphPoints(plottedPoints);
    if (!fit) {
      setLobf({ x1: 0, y1: 0, x2: 0, y2: 0 });
      return;
    }
    const x1 = Math.min(...plottedPoints.map((point) => point.x));
    const x2 = Math.max(...plottedPoints.map((point) => point.x));
    setLobf({ x1, x2, y1: fit.slope * x1 + fit.intercept, y2: fit.slope * x2 + fit.intercept });
  }, [tab, axesKey, dataKey]);

  const [plotWidth, setPlotWidth] = useState(680);
  useEffect(() => {
    const graph = svgRef.current;
    if (tab !== 'student_plot' || !graph || typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(([entry]) => setPlotWidth(Math.max(220, Math.round(entry.contentRect.width))));
    observer.observe(graph);
    return () => observer.disconnect();
  }, [tab]);
  const width = tab === 'student_plot' ? plotWidth : 560;
  const height = tab === 'student_plot' ? Math.max(280, Math.round(plotWidth * 0.56)) : 225;
  const padLeft = 52;
  const padRight = 24;
  const padTop = 18;
  const padBottom = 36;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  useEffect(() => {
    const svg = svgRef.current;
    if (tab !== 'student_plot' || !svg) return;

    const handleWheel = (event: WheelEvent) => {
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? svg.clientHeight : 1;
      const delta = Math.max(-60, Math.min(60, event.deltaY * unit));
      if (!delta) return;

      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      const anchorX = (point.x - padLeft) / plotW;
      const anchorY = 1 - (point.y - padTop) / plotH;
      if (anchorX < 0 || anchorX > 1 || anchorY < 0 || anchorY > 1) return;

      event.preventDefault();
      setViewBounds((bounds) => zoomGraph(bounds, Math.exp(delta * 0.00032), anchorX, anchorY));
    };

    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [tab, padLeft, padTop, plotW, plotH]);

  // ============================================================================
  // STUDENT GRAPHING WORKSHOP TAB (`student_plot`)
  // ============================================================================
  if (tab === 'student_plot') {
    const spanX = Math.max(1e-5, viewBounds.xMax - viewBounds.xMin);
    const spanY = Math.max(1e-5, viewBounds.yMax - viewBounds.yMin);
    const minXVal = viewBounds.xMin;
    const maxXVal = viewBounds.xMax;
    const minYVal = viewBounds.yMin;
    const maxYVal = viewBounds.yMax;

    const toSvgX = (valX: number) => padLeft + ((valX - minXVal) / spanX) * plotW;
    const toSvgY = (valY: number) => padTop + (1 - (valY - minYVal) / spanY) * plotH;

    const fromSvgCoords = (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const sx = ((clientX - rect.left) / rect.width) * width;
      const sy = ((clientY - rect.top) / rect.height) * height;
      const fx = (sx - padLeft) / plotW;
      const fy = 1 - (sy - padTop) / plotH;
      return {
        x: +(minXVal + fx * spanX).toFixed(3),
        y: +(minYVal + fy * spanY).toFixed(3),
      };
    };

    const handleResetView = () => setViewBounds(fitBounds);
    const applyAxes = (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      for (const [label, expression] of [['X', draftX], ['Y', draftY]]) {
        try {
          const compiled = compileAxis(expression);
          if ([...compiled.variables].some(isHiddenVariable)) {
            throw new Error('That variable is hidden for this investigation.');
          }
        } catch (error) {
          setAxisError(label + ' axis: ' + (error instanceof Error ? error.message : 'Invalid expression.'));
          return;
        }
      }
      setAxisError('');
      changeAxes({ ...axes, x: canonicalAxisExpression(draftX.trim()), y: canonicalAxisExpression(draftY.trim()) });
    };
    const handleZoomStep = (factor: number) => {
      setViewBounds((bounds) => zoomGraph(bounds, factor));
    };

    const zoomPercent = Math.round(((fitBounds.xMax - fitBounds.xMin) / spanX) * 100);
    const isZoomedOrPanned =
      Math.abs(zoomPercent - 100) > 1 || Math.abs(viewBounds.xMin - fitBounds.xMin) > 1e-4 || Math.abs(viewBounds.yMin - fitBounds.yMin) > 1e-4;

    const handleClearPoints = () => {
      setCustomPoints((prev) => prev.filter((point) => !belongsToAxes(point)));
      setShowLobf(false);
    };

    // Calculate theoretical curve points & experimental drag curve points for overlay
    const theoreticalCurvePoints: Array<{ x: number; y: number }> = [];
    const experimentalCurvePoints: Array<{ x: number; y: number }> = [];

    if (usesDefaultAxes && showTheory && showTheoryCurve && launchParams) {
      if (xAxisVar === 'angle') {
        for (let a = 0; a <= 90; a += 2) {
          const lp = { ...launchParams, angle: a };
          const th = calculateTheoreticalSummary(lp);
          const yVal = th[yAxisVar];
          if (Number.isFinite(yVal) && yVal >= 0 && yVal <= maxYVal * 1.4) {
            theoreticalCurvePoints.push({ x: a, y: yVal });
          }
          if (experimentalEnv && physicsMode === 'experimental' && experimentalEnv.enableDrag) {
            const exp = calculateExperimentalSummary(lp, experimentalEnv);
            const expY = exp[yAxisVar];
            if (Number.isFinite(expY) && expY >= 0 && expY <= maxYVal * 1.4) {
              experimentalCurvePoints.push({ x: a, y: expY });
            }
          }
        }
      } else if (xAxisVar === 'sin2Angle') {
        for (let a = 0; a <= 45; a += 1.5) {
          const s2 = Math.sin((2 * a * Math.PI) / 180);
          const lp = { ...launchParams, angle: a };
          const th = calculateTheoreticalSummary(lp);
          const yVal = th[yAxisVar];
          if (Number.isFinite(yVal) && yVal >= 0 && yVal <= maxYVal * 1.4) {
            theoreticalCurvePoints.push({ x: +s2.toFixed(3), y: yVal });
          }
          if (experimentalEnv && physicsMode === 'experimental' && experimentalEnv.enableDrag) {
            const exp = calculateExperimentalSummary(lp, experimentalEnv);
            const expY = exp[yAxisVar];
            if (Number.isFinite(expY) && expY >= 0 && expY <= maxYVal * 1.4) {
              experimentalCurvePoints.push({ x: +s2.toFixed(3), y: expY });
            }
          }
        }
      } else if (xAxisVar === 'time') {
        const vx = launchParams.speed * Math.cos((launchParams.angle * Math.PI) / 180);
        const stepT = maxXVal / 32;
        for (let t = 0; t <= maxXVal; t += stepT) {
          const yVal = yAxisVar === 'range' ? vx * t : undefined;
          if (yVal !== undefined && Number.isFinite(yVal) && yVal >= 0 && yVal <= maxYVal * 1.4) {
            theoreticalCurvePoints.push({ x: +t.toFixed(3), y: yVal });
          }
        }
      } else if (xAxisVar === 'speed') {
        const stepS = maxXVal / 32;
        for (let s = 0.2; s <= maxXVal; s += stepS) {
          const lp = { ...launchParams, speed: s };
          const th = calculateTheoreticalSummary(lp);
          const yVal = th[yAxisVar];
          if (Number.isFinite(yVal) && yVal >= 0 && yVal <= maxYVal * 1.4) {
            theoreticalCurvePoints.push({ x: s, y: yVal });
          }
          if (experimentalEnv && physicsMode === 'experimental' && experimentalEnv.enableDrag) {
            const exp = calculateExperimentalSummary(lp, experimentalEnv);
            const expY = exp[yAxisVar];
            if (Number.isFinite(expY) && expY >= 0 && expY <= maxYVal * 1.4) {
              experimentalCurvePoints.push({ x: s, y: expY });
            }
          }
        }
      } else if (xAxisVar === 'height') {
        const stepH = maxXVal / 32;
        for (let hgt = 0; hgt <= maxXVal; hgt += stepH) {
          const lp = { ...launchParams, height: hgt };
          const th = calculateTheoreticalSummary(lp);
          const yVal = th[yAxisVar];
          if (Number.isFinite(yVal) && yVal >= 0 && yVal <= maxYVal * 1.4) {
            theoreticalCurvePoints.push({ x: hgt, y: yVal });
          }
          if (experimentalEnv && physicsMode === 'experimental' && experimentalEnv.enableDrag) {
            const exp = calculateExperimentalSummary(lp, experimentalEnv);
            const expY = exp[yAxisVar];
            if (Number.isFinite(expY) && expY >= 0 && expY <= maxYVal * 1.4) {
              experimentalCurvePoints.push({ x: hgt, y: expY });
            }
          }
        }
      }
    }

    const buildCurveSvgPath = (pts: Array<{ x: number; y: number }>) => {
      if (pts.length === 0) return '';
      return pts
        .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${toSvgX(pt.x).toFixed(1)} ${toSvgY(pt.y).toFixed(1)}`)
        .join(' ');
    };

    // Determine active slope points:
    // 1) Line of Best Fit is visible and valid
    // 2) Or there are at least 2 plotted data points
    const hasSufficientPoints = plottedPoints.length >= 2;
    const isLobfValid = lobf.x1 !== lobf.x2 || lobf.y1 !== lobf.y2;
    const shouldRenderLobf = showLobf && (hasSufficientPoints || isLobfValid);

    const pA = shouldRenderLobf && isLobfValid
      ? { x: lobf.x1, y: lobf.y1 }
      : hasSufficientPoints
      ? { x: plottedPoints[0].x, y: plottedPoints[0].y }
      : null;

    const pB = shouldRenderLobf && isLobfValid
      ? { x: lobf.x2, y: lobf.y2 }
      : hasSufficientPoints
      ? { x: plottedPoints[plottedPoints.length - 1].x, y: plottedPoints[plottedPoints.length - 1].y }
      : null;

    const hasActivePoints = pA !== null && pB !== null;
    const deltaY = hasActivePoints ? pB.y - pA.y : 0;
    const deltaX = hasActivePoints ? pB.x - pA.x : 0;
    const calculatedSlope =
      hasActivePoints && Math.abs(deltaX) > 1e-6 ? deltaY / deltaX : null;
    const yIntercept =
      hasActivePoints && calculatedSlope !== null ? pA.y - calculatedSlope * pA.x : null;

    const shouldRenderSlopeTriangle =
      shouldRenderLobf &&
      hasActivePoints &&
      (Math.abs(deltaX) > 1e-4 || Math.abs(deltaY) > 1e-4);

    const guessNum = Number(studentSlopeGuess);
    const guessMatches =
      studentSlopeGuess.trim() !== '' &&
      Number.isFinite(guessNum) &&
      calculatedSlope !== null &&
      Math.abs(guessNum - calculatedSlope) <= Math.max(0.05, Math.abs(calculatedSlope) * 0.08);

    // Desmos-style dynamic nice step grid intervals
    const stepX = computeNiceStep(spanX, Math.max(3, Math.min(8, Math.floor(plotW / 54))));
    const stepY = computeNiceStep(spanY, 6);

    const firstTickX = Math.floor(viewBounds.xMin / stepX) * stepX;
    const lastTickX = Math.ceil(viewBounds.xMax / stepX) * stepX;
    const gridLinesX: Array<{ val: number; x: number; isMajor: boolean }> = [];
    for (let v = firstTickX; v <= lastTickX + stepX * 0.01; v += stepX) {
      const sx = toSvgX(v);
      if (sx >= padLeft - 1 && sx <= padLeft + plotW + 1) {
        gridLinesX.push({ val: +v.toFixed(6), x: sx, isMajor: true });
      }
    }

    const firstTickY = Math.floor(viewBounds.yMin / stepY) * stepY;
    const lastTickY = Math.ceil(viewBounds.yMax / stepY) * stepY;
    const gridLinesY: Array<{ val: number; y: number; isMajor: boolean }> = [];
    for (let v = firstTickY; v <= lastTickY + stepY * 0.01; v += stepY) {
      const sy = toSvgY(v);
      if (sy >= padTop - 1 && sy <= padTop + plotH + 1) {
        gridLinesY.push({ val: +v.toFixed(6), y: sy, isMajor: true });
      }
    }

    return h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
      h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: '#334155', cursor: 'pointer' } },
        h('input', { type: 'checkbox', checked: isAutoPlot, disabled: trials.length === 0, onChange: (e: React.ChangeEvent<HTMLInputElement>) => handleToggleAutoPlot(e.target.checked) }),
        'Show recorded points'
      ),
      h('p', { style: { margin: '0 0 4px', fontSize: '12px', color: '#52647a' } }, 'Tap or click the grid to plot a point by hand.'),
      h('form', { className: 'graph-expression-form', onSubmit: applyAxes },
        h('label', null, 'X axis', h('input', {
          ref: xInput, type: 'text', value: draftX, maxLength: 160, spellCheck: false,
          onFocus: () => { hasFocusedAxis.current = true; setActiveAxis('x'); },
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => updateAxisDraft('x', event.currentTarget, setDraftX),
        })),
        h('label', null, 'Y axis', h('input', {
          ref: yInput, type: 'text', value: draftY, maxLength: 160, spellCheck: false,
          onFocus: () => { hasFocusedAxis.current = true; setActiveAxis('y'); },
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => updateAxisDraft('y', event.currentTarget, setDraftY),
        })),
        h('details', { className: 'axis-keypad' },
          h('summary', null, 'Math keypad'),
          h('span', { className: 'axis-keypad-target' }, 'Editing ' + activeAxis.toUpperCase() + ' axis'),
          h('div', { className: 'axis-keypad-row', role: 'group', 'aria-label': 'Variables' },
            ...axisVariables.filter(([token]) => !isHiddenVariable(token)).map(([token, label]) => {
              const symbol = axisSymbols[token.toLowerCase()] ?? token;
              return h('button', {
                key: token, type: 'button', title: label, 'aria-label': 'Insert ' + label,
                onClick: () => insertAxisKey(symbol, 'variable'),
              }, symbol);
            })
          ),
          h('div', { className: 'axis-keypad-row', role: 'group', 'aria-label': 'Operators and functions' },
            ...([
              ['×', 'Multiply'], ['÷', 'Divide'], ['+', 'Add'], ['−', 'Subtract'], ['^', 'Power'], ['²', 'Square'],
            ] as const).map(([symbol, label]) => h('button', {
              key: symbol, type: 'button', title: label, 'aria-label': label,
              onClick: () => insertAxisKey(symbol, 'operator'),
            }, symbol)),
            ...([
              ['()', '', 'Parentheses'], ['sin', 'sin', 'Sine'], ['cos', 'cos', 'Cosine'],
              ['tan', 'tan', 'Tangent'], ['√', 'sqrt', 'Square root'],
            ] as const).map(([symbol, token, label]) => h('button', {
              key: symbol, type: 'button', title: label, 'aria-label': 'Insert ' + label,
              onClick: () => insertAxisKey(token, 'group'),
            }, symbol))
          )
        ),
        h('button', { type: 'submit', className: 'graph-apply-axes' }, 'Apply axes'),
        h('small', null, 'Type theta for θ. Try sin(2θ). Trig uses degrees.'),
        axisError && h('span', { role: 'alert', className: 'graph-axis-error' }, axisError)
      ),
      // Student graphing toolbar
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            background: '#f8fafc',
            border: '1px solid #dbeafe',
            borderRadius: '8px',
            padding: '7px 12px',
            fontSize: '11px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          },
        },
        // Left: Axes & Auto-Scale
        h(
          'div',
          { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' } },
          h('button', { type: 'button', className: 'text-btn', onClick: handleResetView }, 'Fit data'),
          // Desmos-style Navigation Pill Controls (Zoom Out, Reset View, Zoom In)
          h(
            'div',
            {
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '5px',
                padding: '1px 2px',
                marginLeft: '4px',
                gap: '1px',
              },
            },
            h(
              'button',
              {
                type: 'button',
                onClick: () => handleZoomStep(BUTTON_ZOOM_STEP),
                style: {
                  background: 'none',
                  border: 'none',
                  padding: '2px 5px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                },
                title: 'Zoom Out (or scroll down on graph)',
                'aria-label': 'Zoom Out',
              },
              h(IconZoomOut, { size: 12, color: '#1e293b' })
            ),
            h(
              'button',
              {
                type: 'button',
                onClick: handleResetView,
                style: {
                  background: isZoomedOrPanned ? '#e0f2fe' : 'none',
                  border: isZoomedOrPanned ? '1px solid #7dd3fc' : 'none',
                  padding: '2px 6px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: isZoomedOrPanned ? '#0369a1' : '#64748b',
                  cursor: 'pointer',
                  borderRadius: '3px',
                },
                title: 'Reset View / Default Zoom (Click to re-center)',
                'aria-label': 'Reset View',
              },
              `${zoomPercent}%`
            ),
            h(
              'button',
              {
                type: 'button',
                onClick: () => handleZoomStep(1 / BUTTON_ZOOM_STEP),
                style: {
                  background: 'none',
                  border: 'none',
                  padding: '2px 5px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                },
                title: 'Zoom In (or scroll up on graph)',
                'aria-label': 'Zoom In',
              },
              h(IconZoomIn, { size: 12, color: '#1e293b' })
            )
          )
        ),
        // Right: 2 Clear Toggle Pills + Clear
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          showTheory && usesDefaultAxes ? h(
            'button',
            {
              type: 'button',
              onClick: () => setShowTheoryCurve(!showTheoryCurve),
              style: {
                padding: '4px 9px',
                fontSize: '10.5px',
                fontWeight: 600,
                background: showTheoryCurve ? '#fef3c7' : '#fff',
                border: `1.5px solid ${showTheoryCurve ? '#f59e0b' : '#cbd5e1'}`,
                color: showTheoryCurve ? '#b45309' : '#64748b',
                borderRadius: '5px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              },
              title: 'Toggle theoretical vacuum curve on/off',
            },
            h(IconStar, { size: 12, filled: showTheoryCurve }),
            'Theory Curve'
          ) : null,
          h(
            'button',
            {
              type: 'button',
              onClick: () => setShowLobf(!showLobf),
              style: {
                padding: '4px 9px',
                fontSize: '10.5px',
                fontWeight: 600,
                background: showLobf ? '#fee2e2' : '#fff',
                border: `1.5px solid ${showLobf ? '#ef4444' : '#cbd5e1'}`,
                color: showLobf ? '#b91c1c' : '#64748b',
                borderRadius: '5px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              },
              title: 'Toggle Line of Best Fit & Slope Calculation',
            },
            h(IconRuler, { size: 12 }),
            showLobf ? 'Best-Fit Line: ON' : 'Best-Fit Line: OFF'
          ),
          customPoints.length > 0
            ? h(
                'button',
                {
                  type: 'button',
                  onClick: handleClearPoints,
                  style: {
                    padding: '4px 7px',
                    fontSize: '10.5px',
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    color: '#64748b',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  },
                  title: 'Clear manually plotted points',
                },
                h(IconReset, { size: 11 }),
                'Clear Points'
              )
            : null
        )
      ),

      // Interactive SVG Graph Paper Canvas (Desmos-style Free Navigation)
      h(
        'div',
        { className: 'chart student-chart', style: { position: 'relative', userSelect: 'none' } },
        h(
          'svg',
          {
            ref: svgRef,
            viewBox: `0 0 ${width} ${height}`,
            style: {
              width: '100%',
              height: 'auto',
              overflow: 'hidden',
              cursor: draggingHandle ? 'grabbing' : isPanning ? 'grabbing' : 'grab',
            },
            onMouseDown: (e: React.MouseEvent<SVGSVGElement>) => {
              if (draggingHandle) return;
              panStartRef.current = {
                clientX: e.clientX,
                clientY: e.clientY,
                startBounds: { ...viewBounds },
                moved: false,
              };
              setIsPanning(true);
            },
            onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => {
              if (draggingHandle) {
                const pt = fromSvgCoords(e.clientX, e.clientY);
                setLobf((prev) =>
                  draggingHandle === 'p1'
                    ? { ...prev, x1: pt.x, y1: pt.y }
                    : { ...prev, x2: pt.x, y2: pt.y }
                );
                return;
              }
              if (isPanning && panStartRef.current) {
                const dx = e.clientX - panStartRef.current.clientX;
                const dy = e.clientY - panStartRef.current.clientY;
                if (Math.hypot(dx, dy) > 3) {
                  panStartRef.current.moved = true;
                }
                const svg = svgRef.current;
                const rect = svg ? svg.getBoundingClientRect() : { width: plotW, height: plotH };
                const pixelPerSvgX = rect.width / width;
                const pixelPerSvgY = rect.height / height;
                const svgDx = dx / pixelPerSvgX;
                const svgDy = dy / pixelPerSvgY;
                const curSpanX = panStartRef.current.startBounds.xMax - panStartRef.current.startBounds.xMin;
                const curSpanY = panStartRef.current.startBounds.yMax - panStartRef.current.startBounds.yMin;
                const worldDx = (svgDx / plotW) * curSpanX;
                const worldDy = (svgDy / plotH) * curSpanY;

                setViewBounds({
                  xMin: +(panStartRef.current.startBounds.xMin - worldDx).toFixed(4),
                  xMax: +(panStartRef.current.startBounds.xMax - worldDx).toFixed(4),
                  yMin: +(panStartRef.current.startBounds.yMin + worldDy).toFixed(4),
                  yMax: +(panStartRef.current.startBounds.yMax + worldDy).toFixed(4),
                });
              }
            },
            onMouseUp: (e: React.MouseEvent<SVGSVGElement>) => {
              if (draggingHandle) {
                setDraggingHandle(null);
                return;
              }
              const wasMoved = panStartRef.current?.moved;
              setIsPanning(false);
              if (wasMoved) {
                return; // Was a drag pan, don't plot point
              }
              // It's a point plot click!
              const pt = fromSvgCoords(e.clientX, e.clientY);
              const isNear = plottedPoints.some(
                (p) => Math.hypot(toSvgX(p.x) - toSvgX(pt.x), toSvgY(p.y) - toSvgY(pt.y)) < 14
              );
              if (!isNear) {
                setCustomPoints((prev) => [
                  ...prev,
                  { id: Date.now() + Math.random(), x: pt.x, y: pt.y, axesKey },
                ]);
              }
            },
            onMouseLeave: () => {
              setDraggingHandle(null);
              setIsPanning(false);
            },
            onTouchStart: (e: React.TouchEvent<SVGSVGElement>) => {
              if (e.touches.length === 1) {
                const t = e.touches[0];
                panStartRef.current = {
                  clientX: t.clientX,
                  clientY: t.clientY,
                  startBounds: { ...viewBounds },
                  moved: false,
                };
                setIsPanning(true);
              } else if (e.touches.length === 2) {
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                touchStartRef.current = {
                  touches: [{ clientX: t1.clientX, clientY: t1.clientY }, { clientX: t2.clientX, clientY: t2.clientY }],
                  startBounds: { ...viewBounds },
                  startDist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
                };
                setIsPanning(false);
              }
            },
            onTouchMove: (e: React.TouchEvent<SVGSVGElement>) => {
              if (e.touches.length === 1 && isPanning) {
                const t = e.touches[0];
                const dx = t.clientX - panStartRef.current.clientX;
                const dy = t.clientY - panStartRef.current.clientY;
                if (Math.hypot(dx, dy) > 4) {
                  panStartRef.current.moved = true;
                }
                const svg = svgRef.current;
                const rect = svg ? svg.getBoundingClientRect() : { width: plotW, height: plotH };
                const pixelPerSvgX = rect.width / width;
                const pixelPerSvgY = rect.height / height;
                const svgDx = dx / pixelPerSvgX;
                const svgDy = dy / pixelPerSvgY;
                const curSpanX = panStartRef.current.startBounds.xMax - panStartRef.current.startBounds.xMin;
                const curSpanY = panStartRef.current.startBounds.yMax - panStartRef.current.startBounds.yMin;
                const worldDx = (svgDx / plotW) * curSpanX;
                const worldDy = (svgDy / plotH) * curSpanY;

                setViewBounds({
                  xMin: +(panStartRef.current.startBounds.xMin - worldDx).toFixed(4),
                  xMax: +(panStartRef.current.startBounds.xMax - worldDx).toFixed(4),
                  yMin: +(panStartRef.current.startBounds.yMin + worldDy).toFixed(4),
                  yMax: +(panStartRef.current.startBounds.yMax + worldDy).toFixed(4),
                });
              } else if (e.touches.length === 2 && touchStartRef.current.startDist > 0) {
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                const curDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                const scaleFactor = touchStartRef.current.startDist / Math.max(10, curDist);

                const midX = (t1.clientX + t2.clientX) / 2;
                const midY = (t1.clientY + t2.clientY) / 2;
                const svg = svgRef.current;
                if (!svg) return;
                const rect = svg.getBoundingClientRect();
                const sx = ((midX - rect.left) / rect.width) * width;
                const sy = ((midY - rect.top) / rect.height) * height;

                const fx = (sx - padLeft) / plotW;
                const fy = 1 - (sy - padTop) / plotH;

                const origSpanX = touchStartRef.current.startBounds.xMax - touchStartRef.current.startBounds.xMin;
                const origSpanY = touchStartRef.current.startBounds.yMax - touchStartRef.current.startBounds.yMin;
                const cursorX = touchStartRef.current.startBounds.xMin + fx * origSpanX;
                const cursorY = touchStartRef.current.startBounds.yMin + fy * origSpanY;

                const newSpanX = origSpanX * scaleFactor;
                const newSpanY = origSpanY * scaleFactor;

                if (newSpanX >= 0.005 && newSpanX <= 20000 && newSpanY >= 0.005 && newSpanY <= 20000) {
                  setViewBounds({
                    xMin: +(cursorX - fx * newSpanX).toFixed(4),
                    xMax: +(cursorX + (1 - fx) * newSpanX).toFixed(4),
                    yMin: +(cursorY - fy * newSpanY).toFixed(4),
                    yMax: +(cursorY + (1 - fy) * newSpanY).toFixed(4),
                  });
                }
              }
            },
            onTouchEnd: () => {
              setIsPanning(false);
              touchStartRef.current.startDist = 0;
            },
            role: 'img',
            'aria-label': 'Interactive student graphing grid and line of best fit calculator with Desmos navigation',
          },
          // Defs for clipping zoomed content inside plot area
          h(
            'defs',
            null,
            h(
              'clipPath',
              { id: 'student-graph-clip' },
              h('rect', {
                x: padLeft,
                y: padTop,
                width: plotW,
                height: plotH,
              })
            )
          ),

          // Desmos-style Dynamic Grid Lines (Light minor grid + clear major grid)
          ...gridLinesX.map((gl) =>
            h('line', {
              key: `grid-x-${gl.val}`,
              x1: gl.x,
              y1: padTop,
              x2: gl.x,
              y2: padTop + plotH,
              stroke: gl.isMajor ? '#cbd5e1' : '#f1f5f9',
              strokeWidth: gl.isMajor ? '1.0' : '0.6',
            })
          ),
          ...gridLinesY.map((gl) =>
            h('line', {
              key: `grid-y-${gl.val}`,
              x1: padLeft,
              y1: gl.y,
              x2: width - padRight,
              y2: gl.y,
              stroke: gl.isMajor ? '#cbd5e1' : '#f1f5f9',
              strokeWidth: gl.isMajor ? '1.0' : '0.6',
            })
          ),

          // Coordinate Axes (x = 0 and y = 0 lines)
          minYVal <= 0 && maxYVal >= 0
            ? h('line', {
                x1: padLeft,
                y1: toSvgY(0),
                x2: width - padRight,
                y2: toSvgY(0),
                stroke: '#334155',
                strokeWidth: '1.6',
              })
            : null,
          minXVal <= 0 && maxXVal >= 0
            ? h('line', {
                x1: toSvgX(0),
                y1: padTop,
                x2: toSvgX(0),
                y2: padTop + plotH,
                stroke: '#334155',
                strokeWidth: '1.6',
              })
            : null,

          // Plot Bounding Border
          h('rect', {
            x: padLeft,
            y: padTop,
            width: plotW,
            height: plotH,
            fill: 'none',
            stroke: '#94a3b8',
            strokeWidth: '1.2',
          }),

          // Major Grid Tick Labels (along X and Y)
          ...gridLinesX
            .filter((gl) => gl.isMajor)
            .map((gl) =>
              h(
                'text',
                {
                  key: `tick-x-${gl.val}`,
                  x: gl.x,
                  y: padTop + plotH + 13,
                  textAnchor: 'middle',
                  fontSize: '12',
                  fontWeight: '600',
                  fill: '#475569',
                },
                formatTick(gl.val, stepX)
              )
            ),
          ...gridLinesY
            .filter((gl) => gl.isMajor)
            .map((gl) =>
              h(
                'text',
                {
                  key: `tick-y-${gl.val}`,
                  x: padLeft - 6,
                  y: gl.y + 3.5,
                  textAnchor: 'end',
                  fontSize: '12',
                  fontWeight: '600',
                  fill: '#475569',
                },
                formatTick(gl.val, stepY)
              )
            ),

          // Axis Titles
          h(
            'text',
            {
              x: padLeft + plotW / 2,
              y: height - 1,
              textAnchor: 'middle',
              fontSize: '10.5',
              fontWeight: '700',
              fill: '#2c3e4c',
            },
            `${xMeta.label}${!xMeta.unit || xMeta.unit === 'unitless' ? '' : ` (${xMeta.unit})`}`
          ),
          h(
            'text',
            {
              x: padLeft + 6,
              y: padTop + 11,
              textAnchor: 'start',
              fontSize: '10.5',
              fontWeight: '700',
              fill: '#2c3e4c',
            },
            `${yMeta.label}${yMeta.unit ? ' (' + yMeta.unit + ')' : ''}`
          ),

          // Zoom-Clipped Plot Elements (Curves, Fit Line, Triangle, and Plotted Points)
          h(
            'g',
            { clipPath: 'url(#student-graph-clip)' },
            // Theoretical Ideal Vacuum Curve Overlay
            showTheoryCurve && theoreticalCurvePoints.length > 1
              ? h('path', {
                  d: buildCurveSvgPath(theoreticalCurvePoints),
                  fill: 'none',
                  stroke: '#e69500',
                  strokeWidth: '2.4',
                  strokeDasharray: '6 4',
                  opacity: 0.85,
                })
              : null,

            // Experimental Drag Curve Overlay
            showTheoryCurve && experimentalCurvePoints.length > 1
              ? h('path', {
                  d: buildCurveSvgPath(experimentalCurvePoints),
                  fill: 'none',
                  stroke: '#00b4d8',
                  strokeWidth: '2.2',
                  strokeDasharray: '4 3',
                  opacity: 0.95,
                })
              : null,

            shouldRenderLobf && isLobfValid && h('line', {
              x1: toSvgX(lobf.x1), y1: toSvgY(lobf.y1),
              x2: toSvgX(lobf.x2), y2: toSvgY(lobf.y2),
              stroke: '#dc2626', strokeWidth: 2.5, pointerEvents: 'none',
            }),

            // Rise / Run Triangle between active slope points (pA and pB)
            shouldRenderSlopeTriangle && pA && pB
              ? h(
                  'g',
                  null,
                  h('path', {
                    d: `M ${toSvgX(pA.x)} ${toSvgY(pA.y)} L ${toSvgX(pB.x)} ${toSvgY(pA.y)} L ${toSvgX(pB.x)} ${toSvgY(pB.y)}`,
                    fill: 'none',
                    stroke: '#7c3aed',
                    strokeWidth: '1.6',
                    strokeDasharray: '4 3',
                  }),
                  h(
                    'text',
                    {
                      x: (toSvgX(pA.x) + toSvgX(pB.x)) / 2,
                      y: toSvgY(pA.y) + (deltaY >= 0 ? 13 : -5),
                      textAnchor: 'middle',
                      fontSize: '9.5',
                      fontWeight: '700',
                      fill: '#5b21b6',
                    },
                    `Δx = ${deltaX.toFixed(2)}${!xMeta.unit || xMeta.unit === 'unitless' ? '' : ` ${xMeta.unit}`}`
                  ),
                  h(
                    'text',
                    {
                      x: toSvgX(pB.x) + 6,
                      y: (toSvgY(pA.y) + toSvgY(pB.y)) / 2 + 3,
                      textAnchor: 'start',
                      fontSize: '9.5',
                      fontWeight: '700',
                      fill: '#5b21b6',
                    },
                    `Δy = ${deltaY.toFixed(2)}${!yMeta.unit || yMeta.unit === 'unitless' ? '' : ` ${yMeta.unit}`}`
                  )
                )
              : null,

            // Plotted Data Points (Trials + Student Grid Clicks)
            ...plottedPoints.map((pt, idx) => {
              const isCustom = !pt.trialNum;
              return h(
                'g',
                {
                  key: pt.id,
                  style: { cursor: isCustom ? 'pointer' : 'default' },
                  onClick: isCustom
                    ? (e: React.MouseEvent) => {
                        e.stopPropagation();
                        setCustomPoints((prev) => prev.filter((p) => p.id !== pt.id));
                      }
                    : undefined,
                },
                h(
                  'circle',
                  {
                    cx: toSvgX(pt.x),
                    cy: toSvgY(pt.y),
                    r: isCustom ? '6' : '5',
                    fill: isCustom ? '#f97316' : '#1f64a8',
                    stroke: '#fff',
                    strokeWidth: '1.8',
                  },
                  h(
                    'title',
                    null,
                    isCustom
                      ? `Plotted Point #${idx + 1}: (${pt.x} ${xMeta.unit}, ${pt.y} ${yMeta.unit}) — Click to delete`
                      : `Trial #${pt.trialNum}: (${pt.x} ${xMeta.unit}, ${pt.y} ${yMeta.unit})`
                  )
                ),
                h(
                  'text',
                  {
                    x: toSvgX(pt.x) + 6,
                    y: toSvgY(pt.y) - 5,
                    fontSize: '9',
                    fontWeight: '700',
                    fill: isCustom ? '#c2410c' : '#1f4e78',
                  },
                  pt.trialNum ? `#${pt.trialNum}` : `P${idx + 1}`
                )
              );
            }),
            shouldRenderLobf && isLobfValid && ([
              ['p1', lobf.x1, lobf.y1, 'start'],
              ['p2', lobf.x2, lobf.y2, 'end'],
            ] as const).map(([handle, x, y, label]) =>
              h('circle', {
                key: handle, 'data-fit-handle': handle,
                cx: toSvgX(x), cy: toSvgY(y), r: 10,
                fill: 'transparent', stroke: '#dc2626', strokeWidth: 1.8,
                style: { cursor: 'grab' },
                onMouseDown: (e: React.MouseEvent) => {
                  e.stopPropagation();
                  setDraggingHandle(handle);
                },
              }, h('title', null, 'Drag best-fit line ' + label))
            )
          ),

          // Legend inside SVG
          showTheoryCurve && (theoreticalCurvePoints.length > 1 || experimentalCurvePoints.length > 1)
            ? h(
                'g',
                { transform: `translate(${width - 235}, ${padTop + 4})` },
                theoreticalCurvePoints.length > 1
                  ? h(
                      'g',
                      null,
                      h('line', {
                        x1: 0,
                        y1: 5,
                        x2: 14,
                        y2: 5,
                        stroke: '#e69500',
                        strokeWidth: '2.4',
                        strokeDasharray: '4 2',
                      }),
                      h(
                        'text',
                        { x: 18, y: 8, fontSize: '9', fill: '#6e4b00', fontWeight: '600' },
                        'Theory (Vacuum)'
                      )
                    )
                  : null,
                experimentalCurvePoints.length > 1
                  ? h(
                      'g',
                      { transform: 'translate(100, 0)' },
                      h('line', {
                        x1: 0,
                        y1: 5,
                        x2: 14,
                        y2: 5,
                        stroke: '#00b4d8',
                        strokeWidth: '2.2',
                        strokeDasharray: '3 2',
                      }),
                      h(
                        'text',
                        { x: 18, y: 8, fontSize: '9', fill: '#00657a', fontWeight: '600' },
                        'Exp. (Drag)'
                      )
                    )
                  : null
              )
            : null
        )
      ),

      h(
        'div',
        { style: { textAlign: 'right', fontSize: '11px', color: '#64748b', padding: '2px 4px' } },
        plottedPoints.length > 0
          ? h(
              'span',
              { style: { color: '#0369a1', fontWeight: 600 } },
              `${plottedPoints.length} point${plottedPoints.length > 1 ? 's' : ''} on chart (${trialPoints.length} from trials)`
            )
          : 'No points on chart yet'
      ),

      plottedTrials.length > trialPoints.length
        ? h('small', null, `${plottedTrials.length - trialPoints.length} trial(s) skipped because an axis value is undefined or outside the display range.`)
        : null,
      goalResults.length > 0
        ? h('div', { role: 'status' }, h('strong', { className: 'graph-goal-success' }, 'Congrats!'), ...goalResults.map(({ goal, estimated }) => {
            const label = goal === 'gravity' ? 'Gravity' : goal === 'speed' ? 'Launch speed' : 'Horizontal speed';
            const unit = goal === 'gravity' ? 'm/s²' : 'm/s';
            const hasSpeedAndGravity = goalResults.some((result) => result.goal === 'speed') &&
              goalResults.some((result) => result.goal === 'gravity');
            const assumption = hasSpeedAndGravity && goal === 'gravity' ? ' using the recorded launch speed'
              : hasSpeedAndGravity && goal === 'speed' ? ' using the recorded gravity' : '';
            return h('p', { key: goal, className: 'graph-goal-success' },
              label + ' ≈ ' + estimated.toPrecision(4) + ' ' + unit + ' from the fitted slope' + assumption + '.');
          }))
        : null,

      // Step 3: Slope & Line of Best Fit LaTeX Calculator
      !shouldRenderLobf || !hasActivePoints
        ? h(
            'div',
            {
              style: {
                background: '#f8fafc',
                border: '1px solid #dbeafe',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '11.5px',
                color: '#334155',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              },
            },
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
              h(
                'span',
                {
                  style: {
                    fontWeight: 700,
                    color: '#1e3a8a',
                    fontSize: '12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  },
                },
                h(IconSlope, { size: 12 }),
                'Slope Formula:'
              ),
              h(KatexMath, {
                math: 'm = \\frac{\\Delta y}{\\Delta x} = \\frac{y_2 - y_1}{x_2 - x_1}',
                display: false,
                fallbackText: 'm = Δy / Δx = (y₂ - y₁) / (x₂ - x₁)',
              }),
              h(
                'span',
                {
                  style: {
                    color: '#64748b',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  },
                },
                h(IconLightbulb, { size: 11, color: '#f59e0b' }),
                plottedPoints.length < 2
                  ? 'Place at least two points with different X values to find a slope.'
                  : 'Click "Best-Fit Line" above to display the linear fit and calculate slope.'
              )
            ),
            plottedPoints.length >= 2
              ? h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => setShowLobf(true),
                    style: {
                      padding: '4px 9px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: '#fee2e2',
                      border: '1px solid #ef4444',
                      color: '#b91c1c',
                      borderRadius: '5px',
                      cursor: 'pointer',
                    },
                  },
                  'Calculate Slope m'
                )
              : plottedPoints.length === 1
              ? h(
                  'span',
                  {
                    style: {
                      fontSize: '11px',
                      background: '#e0f2fe',
                      color: '#0369a1',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontWeight: 600,
                    },
                  },
                  '1 point plotted — plot 1 more to calculate slope'
                )
              : null
          )
        : (() => {
            const hasXUnit = Boolean(xMeta.unit && xMeta.unit !== 'unitless');
            const hasYUnit = Boolean(yMeta.unit && yMeta.unit !== 'unitless');
            const xUnitLatex =
              xMeta.unit === '°'
                ? '^{\\circ}'
                : !hasXUnit
                ? ''
                : `\\text{ ${xMeta.unit}}`;
            const yUnitLatex = !hasYUnit ? '' : `\\text{ ${yMeta.unit}}`;
            const slopeUnitLatex = !hasYUnit
              ? ''
              : xMeta.unit === '°'
              ? `\\frac{\\text{${yMeta.unit}}}{^{\\circ}}`
              : !hasXUnit
              ? `\\text{ ${yMeta.unit}}`
              : `\\frac{\\text{${yMeta.unit}}}{\\text{${xMeta.unit}}}`;

            const pointsLatex = `P_1 = (${pA.x.toFixed(2)}${xUnitLatex},\\; ${pA.y.toFixed(2)}${yUnitLatex}), \\quad P_2 = (${pB.x.toFixed(2)}${xUnitLatex},\\; ${pB.y.toFixed(2)}${yUnitLatex})`;

            const slopeFormulaLatex = calculatedSlope !== null
              ? `m = \\frac{\\Delta y}{\\Delta x} = \\frac{${pB.y.toFixed(2)} - ${pA.y.toFixed(2)}}{${pB.x.toFixed(2)} - ${pA.x.toFixed(2)}} = \\frac{${deltaY.toFixed(2)}}{${deltaX.toFixed(2)}} = ${calculatedSlope.toFixed(4)} \\; ${slopeUnitLatex}`
              : 'm = \\frac{\\Delta y}{\\Delta x} = \\text{undefined (}\\Delta x = 0\\text{)}';

            const interceptSign = yIntercept !== null && yIntercept < 0 ? '-' : '+';
            const absIntercept = yIntercept !== null ? Math.abs(yIntercept).toFixed(2) : '0.00';
            const lineLatex = calculatedSlope !== null && yIntercept !== null
              ? `y = mx + b \\implies y = ${calculatedSlope.toFixed(3)}x ${interceptSign} ${absIntercept}`
              : 'y = \\text{undefined}';

            return h(
              'div',
              {
                style: {
                  background: '#faf5ff',
                  border: '1px solid #e9d5ff',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  fontSize: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  boxShadow: '0 1px 3px rgba(107, 33, 168, 0.05)',
                },
              },
              // Top row: Title and Point Coordinates
              h(
                'div',
                {
                  style: {
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '10px',
                    borderBottom: '1px solid #f3e8ff',
                    paddingBottom: '6px',
                  },
                },
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
                  h(
                    'b',
                    {
                      style: {
                        color: '#6b21a8',
                        fontSize: '12.5px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                      },
                    },
                    h(IconSlope, { size: 12 }),
                    'Slope & Best-Fit Calculation:'
                  ),
                  h(KatexMath, { math: pointsLatex, display: false })
                ),
                h('span', { style: { color: '#64748b', fontSize: '11px' } }, 'Linear fit')
              ),
              // Bottom row: Formula display & Student Verification Input
              h(
                'div',
                {
                  style: {
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                  },
                },
                h(
                  'div',
                  { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                  h(KatexMath, { math: slopeFormulaLatex, display: false }),
                  h(KatexMath, { math: lineLatex, display: false })
                ),
                h(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      alignItems: 'flex-end',
                    },
                  },
                  h(
                    'div',
                    { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
                    h('span', { style: { fontSize: '11px', color: '#6b21a8', fontWeight: 600 } }, 'Your slope m:'),
                    h('input', {
                      type: 'number',
                      step: 'any',
                      value: studentSlopeGuess,
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                        setStudentSlopeGuess(e.target.value),
                      placeholder: 'e.g. 0.038',
                      style: {
                        width: '90px',
                        padding: '4px 8px',
                        fontSize: '11.5px',
                        borderRadius: '4px',
                        border: '1px solid #c084fc',
                        background: '#fff',
                      },
                    })
                  ),
                  studentSlopeGuess.trim() !== ''
                    ? h(
                        'span',
                        {
                          style: {
                            fontSize: '11px',
                            fontWeight: 700,
                            color: guessMatches ? '#15803d' : '#b91c1c',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          },
                        },
                        guessMatches
                          ? [h(IconCheck, { size: 12, color: '#15803d', key: 'c' }), ' Correct! Matches slope']
                          : [h(IconClose, { size: 11, color: '#b91c1c', key: 'x' }), ' Recheck: m = Δy / Δx']
                      )
                    : null
                )
              )
            );
          })(),

      // Manual Point Coordinate Badges List
      plottedPoints.length > 0
        ? h(
            'div',
            {
              style: {
                display: 'flex',
                flexWrap: 'wrap',
                gap: '5px',
                alignItems: 'center',
                background: '#f8f9fa',
                border: '1px solid #e2e8ec',
                borderRadius: '5px',
                padding: '5px 9px',
                fontSize: '10.5px',
              },
            },
            h('b', { style: { color: '#456' } }, `Plotted Points (${plottedPoints.length}):`),
            ...plottedPoints.map((pt, idx) =>
              h(
                'span',
                {
                  key: pt.id,
                  style: {
                    background: '#e9f1f7',
                    border: '1px solid #bfd7ea',
                    borderRadius: '3px',
                    padding: '2px 6px',
                    color: '#1f4e78',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  },
                },
                `(${pt.x}, ${pt.y})`,
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => {
                      if (pt.trialNum !== undefined) {
                        onPlotTrial?.(pt.id);
                      } else {
                        setCustomPoints((prev) => prev.filter((p) => p.id !== pt.id));
                      }
                    },
                    style: {
                      background: 'none',
                      border: 'none',
                      color: '#993333',
                      cursor: 'pointer',
                      padding: '0 2px',
                      fontWeight: 700,
                    },
                    title: 'Delete point',
                  },
                  '×'
                )
              )
            )
          )
        : null
    );
  }

  if (tab === 'trials_compare') {
    if (trials.length === 0) {
      return h(
        'div',
        {
          style: {
            height: '200px',
            display: 'grid',
            placeItems: 'center',
            color: '#7a8a86',
            fontSize: '12px',
            background: '#fafafa',
            border: '1px dashed #d8e0dc',
            borderRadius: '4px',
          },
        },
        h(
          'span',
          { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } },
          'Launch an experiment (auto-records on landing!) or click',
          h(IconInstant, { size: 12, color: '#2563eb' }),
          'Quick-Collect Sweep to compare trials.'
        )
      );
    }

    const maxRange = Math.max(1, ...trials.map((t) => Math.max(t.range, t.maxHeight))) * 1.15;
    const barGroupW = plotW / Math.max(1, trials.length);
    const barW = Math.min(28, Math.max(10, barGroupW * 0.32));

    return h(
      'div',
      { className: 'chart', style: { position: 'relative' } },
      h(
        'svg',
        {
          viewBox: `0 0 ${width} ${height}`,
          style: { width: '100%', height: '100%', overflow: 'visible' },
          role: 'img',
          'aria-label': 'Trial comparison chart',
        },
        ...[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
          const y = padTop + plotH * (1 - frac);
          const val = (maxRange * frac).toFixed(2);
          return h(
            'g',
            { key: `grid-${i}` },
            h('line', {
              x1: padLeft,
              y1: y,
              x2: width - padRight,
              y2: y,
              stroke: '#e8eeeb',
              strokeWidth: '1',
            }),
            h(
              'text',
              { x: padLeft - 6, y: y + 3, textAnchor: 'end', fontSize: '10', fill: '#7c8b88' },
              val
            )
          );
        }),
        ...trials.map((tr, idx) => {
          const cx = padLeft + (idx + 0.5) * barGroupW;
          const hRange = (tr.range / maxRange) * plotH;
          const hMaxY = (tr.maxHeight / maxRange) * plotH;
          return h(
            'g',
            { key: tr.id },
            h(
              'rect',
              {
                x: cx - barW - 2,
                y: padTop + plotH - hRange,
                width: barW,
                height: Math.max(2, hRange),
                fill: '#2d70b3',
                rx: '2',
              },
              h('title', null, `Trial #${idx + 1} (${tr.angle}°): Range = ${tr.range.toFixed(2)} m`)
            ),
            h(
              'rect',
              {
                x: cx + 2,
                y: padTop + plotH - hMaxY,
                width: barW,
                height: Math.max(2, hMaxY),
                fill: '#388c68',
                rx: '2',
              },
              h(
                'title',
                null,
                `Trial #${idx + 1} (${tr.angle}°): Max Height = ${tr.maxHeight.toFixed(2)} m`
              )
            ),
            h(
              'text',
              { x: cx, y: height - 10, textAnchor: 'middle', fontSize: '10', fill: '#556260' },
              `#${idx + 1} (${tr.angle}°)`
            )
          );
        }),
        h(
          'g',
          { transform: `translate(${width - 195}, ${padTop + 4})` },
          h('rect', { x: '0', y: '0', width: '10', height: '10', fill: '#2d70b3', rx: '2' }),
          h('text', { x: '14', y: '9', fontSize: '10', fill: '#445' }, 'Range (m)'),
          h('rect', { x: '82', y: '0', width: '10', height: '10', fill: '#388c68', rx: '2' }),
          h('text', { x: '96', y: '9', fontSize: '10', fill: '#445' }, 'Max Height (m)')
        )
      )
    );
  }

  const visibleSamples = showTheory
    ? samples
    : samples.filter((s) => s.t <= elapsedTime + 1e-6);

  const maxT = Math.max(0.1, samples[samples.length - 1]?.t ?? 1);
  const maxX = Math.max(0.2, samples[samples.length - 1]?.x ?? 1);

  let minY = 0;
  let maxY = 1;
  let xAxisLabel = 'Time (s)';
  let yAxisLabel = 'Position (m)';

  if (tab === 'x') {
    minY = 0;
    maxY = Math.max(0.2, ...samples.map((s) => s.x)) * 1.08;
    yAxisLabel = 'Horizontal x (m)';
  } else if (tab === 'y') {
    minY = Math.min(0, ...samples.map((s) => s.y)) * 1.12;
    maxY = Math.max(0.2, ...samples.map((s) => s.y)) * 1.12;
    yAxisLabel = 'Height from launch (m)';
  } else if (tab === 'trajectory') {
    minY = Math.min(0, ...samples.map((s) => s.y)) * 1.12;
    maxY = Math.max(0.2, ...samples.map((s) => s.y)) * 1.12;
    xAxisLabel = 'Horizontal Position x (m)';
    yAxisLabel = 'Height from launch (m)';
  } else {
    const allV = samples.flatMap((s) => [s.vx, s.vy]);
    minY = Math.min(0, ...allV) * 1.12;
    maxY = Math.max(0.5, ...allV) * 1.12;
    yAxisLabel = 'Velocity (m/s)';
  }

  const spanY = Math.max(1e-4, maxY - minY);
  const mapX = (s: KinematicState) =>
    padLeft + (tab === 'trajectory' ? s.x / maxX : s.t / maxT) * plotW;
  const mapY = (val: number) => padTop + plotH * (1 - (val - minY) / spanY);

  const buildPath = (getter: (s: KinematicState) => number) => {
    if (visibleSamples.length === 0) return '';
    return visibleSamples
      .map((s, i) => `${i === 0 ? 'M' : 'L'} ${mapX(s).toFixed(1)} ${mapY(getter(s)).toFixed(1)}`)
      .join(' ');
  };

  const activeSample =
    hoverIdx !== null && visibleSamples[hoverIdx]
      ? visibleSamples[hoverIdx]
      : visibleSamples[visibleSamples.length - 1];

  return h(
    'div',
    { className: 'chart', style: { position: 'relative' } },
    h(
      'svg',
      {
        viewBox: `0 0 ${width} ${height}`,
        style: { width: '100%', height: '100%', overflow: 'visible' },
        onMouseLeave: () => setHoverIdx(null),
        onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => {
          if (visibleSamples.length === 0) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * width;
          const frac = Math.max(0, Math.min(1, (relX - padLeft) / plotW));
          const idx = Math.min(
            visibleSamples.length - 1,
            Math.max(0, Math.round(frac * (visibleSamples.length - 1)))
          );
          setHoverIdx(idx);
        },
        role: 'img',
        'aria-label': `Scientific motion graph for ${tab}`,
      },
      ...[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
        const val = minY + spanY * frac;
        const y = mapY(val);
        return h(
          'g',
          { key: `ygrid-${i}` },
          h('line', {
            x1: padLeft,
            y1: y,
            x2: width - padRight,
            y2: y,
            stroke: Math.abs(val) < 1e-3 ? '#c6d2ce' : '#e8eeeb',
            strokeWidth: Math.abs(val) < 1e-3 ? '1.4' : '1',
          }),
          h(
            'text',
            { x: padLeft - 6, y: y + 3, textAnchor: 'end', fontSize: '10', fill: '#7c8b88' },
            val.toFixed(2)
          )
        );
      }),
      ...[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
        const x = padLeft + plotW * frac;
        const val = (tab === 'trajectory' ? maxX : maxT) * frac;
        return h(
          'g',
          { key: `xgrid-${i}` },
          h('line', {
            x1: x,
            y1: padTop + plotH,
            x2: x,
            y2: padTop + plotH + 4,
            stroke: '#cbd6d2',
          }),
          h(
            'text',
            { x: x, y: height - 10, textAnchor: 'middle', fontSize: '10', fill: '#7c8b88' },
            val.toFixed(2)
          )
        );
      }),
      h(
        'text',
        {
          x: width - padRight,
          y: height - 1,
          textAnchor: 'end',
          fontSize: '10',
          fontWeight: '600',
          fill: '#637370',
        },
        xAxisLabel
      ),
      h(
        'text',
        {
          x: padLeft + 4,
          y: padTop + 10,
          textAnchor: 'start',
          fontSize: '10',
          fontWeight: '600',
          fill: '#637370',
        },
        yAxisLabel
      ),
      tab === 'x'
        ? h('path', {
            d: buildPath((s) => s.x),
            fill: 'none',
            stroke: '#c74440',
            strokeWidth: '2.4',
          })
        : null,
      tab === 'y'
        ? h('path', {
            d: buildPath((s) => s.y),
            fill: 'none',
            stroke: '#388c68',
            strokeWidth: '2.4',
          })
        : null,
      tab === 'trajectory'
        ? h('path', {
            d: buildPath((s) => s.y),
            fill: 'none',
            stroke: '#d98b2b',
            strokeWidth: '2.5',
          })
        : null,
      tab === 'velocity'
        ? h(
            React.Fragment,
            null,
            h('path', {
              d: buildPath((s) => s.vx),
              fill: 'none',
              stroke: '#c74440',
              strokeWidth: '2.2',
            }),
            h('path', {
              d: buildPath((s) => s.vy),
              fill: 'none',
              stroke: '#2d70b3',
              strokeWidth: '2.2',
            }),
            h(
              'g',
              { transform: `translate(${width - 150}, ${padTop + 4})` },
              h('line', { x1: '0', y1: '5', x2: '14', y2: '5', stroke: '#c74440', strokeWidth: '2.2' }),
              h(
                'text',
                { x: '18', y: '8', fontSize: '10', fill: '#445' },
                'v',
                h('tspan', { dy: '2', fontSize: '8' }, 'x'),
                h('tspan', { dy: '-2', fontSize: '10' }, ' (m/s)')
              ),
              h('line', { x1: '68', y1: '5', x2: '82', y2: '5', stroke: '#2d70b3', strokeWidth: '2.2' }),
              h(
                'text',
                { x: '86', y: '8', fontSize: '10', fill: '#445' },
                'v',
                h('tspan', { dy: '2', fontSize: '8' }, 'y'),
                h('tspan', { dy: '-2', fontSize: '10' }, ' (m/s)')
              )
            )
          )
        : null,
      activeSample
        ? h(
            'g',
            null,
            h('line', {
              x1: mapX(activeSample),
              y1: padTop,
              x2: mapX(activeSample),
              y2: padTop + plotH,
              stroke: '#94a8a3',
              strokeDasharray: '3 3',
            }),
            h('circle', {
              cx: mapX(activeSample),
              cy: mapY(
                tab === 'x'
                  ? activeSample.x
                  : tab === 'y' || tab === 'trajectory'
                  ? activeSample.y
                  : activeSample.vy
              ),
              r: '4',
              fill: '#2d70b3',
              stroke: '#fff',
              strokeWidth: '1.5',
            })
          )
        : null
    ),
    activeSample
      ? h(
          'div',
          {
            style: {
              position: 'absolute',
              right: '10px',
              bottom: '28px',
              background: 'rgba(255,255,255,0.94)',
              border: '1px solid #d8e2de',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '10px',
              color: '#344240',
              pointerEvents: 'none',
              fontVariantNumeric: 'tabular-nums',
            },
          },
          `t = ${activeSample.t.toFixed(2)}s · x = ${activeSample.x.toFixed(2)}m · y = ${activeSample.y.toFixed(2)}m · vₓ = ${activeSample.vx.toFixed(2)}m/s · vᵧ = ${activeSample.vy.toFixed(2)}m/s`
        )
      : null
  );
};
