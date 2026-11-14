import { calculateTheoreticalSummary } from '../physics/projectile.ts';
import type { RecordedTrial } from './ScientificCharts.ts';

export const axisVariables = [
  ['theta', 'Launch angle (degrees)'], ['v0', 'Launch speed'], ['h0', 'Muzzle height above tabletop'],
  ['hEnd', 'Landing height above tabletop'], ['t', 'Flight time'], ['R', 'Range'],
  ['H', 'Maximum height above tabletop'], ['impactSpeed', 'Impact speed'], ['g', 'Gravity'],
] as const;

type AxisVariable = typeof axisVariables[number][0];
type Evaluate = (trial: RecordedTrial) => number;
type AxisExpression = Evaluate & { variables: ReadonlySet<AxisVariable> };
export type GraphGoal = '' | 'speed' | 'gravity' | 'horizontal';
export type GraphAxes = { x: string; y: string };

const variables: Record<AxisVariable, Evaluate> = {
  theta: (row) => row.angle,
  v0: (row) => row.speed,
  h0: (row) => row.height,
  hEnd: (row) => row.landingHeight ?? (row.isSymmetric ? row.height : 0),
  t: (row) => row.time,
  R: (row) => row.range,
  H: (row) => row.maxHeight,
  impactSpeed: (row) => row.impactSpeed,
  g: (row) => row.gravity,
};

const radians = Math.PI / 180;
const functions: Record<string, (value: number) => number> = {
  sin: (value) => Math.sin(value * radians),
  cos: (value) => Math.cos(value * radians),
  tan: (value) => Math.tan(value * radians),
  sqrt: Math.sqrt,
  abs: Math.abs,
};

const fromSuperscriptDigits: Readonly<Record<string, string>> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁻': '-', '⁺': '+',
};

export function canonicalAxisExpression(expression: string): string {
  return expression
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (match) => '^' + [...match].map((ch) => fromSuperscriptDigits[ch] ?? ch).join(''))
    .replaceAll('θ', 'theta').replaceAll('₀', '0')
    .replaceAll('h₁', 'hEnd').replaceAll('v₁', 'impactSpeed');
}

export function compileAxis(input: string): AxisExpression {
  const source = canonicalAxisExpression(input)
    .replace(/²/g, '^2').replace(/³/g, '^3').replace(/√/g, 'sqrt ')
    .replace(/×|·/g, '*').replace(/÷/g, '/').replace(/−/g, '-').trim();
  if (!source || source.length > 160) throw new Error('Enter an expression up to 160 characters.');
  const rawTokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[a-zA-Z][a-zA-Z0-9]*|[^\s]/g) ?? [];
  const tokens = rawTokens.flatMap((token) => {
    // Accept joined spellings like sinθ while keeping variable names case-sensitive.
    const lower = token.toLowerCase();
    if (Object.hasOwn(functions, lower)) return [lower];
    const name = Object.keys(functions).find((key) =>
      lower.startsWith(key) && Object.hasOwn(variables, token.slice(key.length)));
    return name ? [name, token.slice(name.length)] : [token];
  });
  const isNumber = (token: string | undefined) => /^(?:\d|\.\d)/.test(token ?? '');
  let cursor = 0;
  const usedVariables = new Set<AxisVariable>();
  const peek = () => tokens[cursor];
  const take = () => tokens[cursor++];
  const consume = (token: string) => peek() === token && Boolean(take());

  function atom(): Evaluate {
    if (consume('(')) {
      const body = sum();
      if (!consume(')')) throw new Error('Add the closing parenthesis.');
      return body;
    }
    const token = take();
    if (!token) throw new Error('Finish the expression.');
    if (isNumber(token)) {
      const value = Number(token);
      return () => value;
    }
    if (token === 'pi') return () => Math.PI;
    if (Object.hasOwn(variables, token)) {
      const key = token as AxisVariable;
      usedVariables.add(key);
      return (row) => variables[key](row);
    }
    if (Object.hasOwn(functions, token)) {
      if (consume('(')) {
        const argument = sum();
        if (!consume(')')) throw new Error('Add the closing parenthesis.');
        return (row) => functions[token](argument(row));
      }
      if (!peek() || peek() === ')') throw new Error('Add an argument after ' + token + ', for example ' + token + '(theta).');

      const first = peek() === '+' || peek() === '-' ? tokens[cursor + 1] : peek();
      const argument = unary();
      // A typed coefficient belongs inside the function, as in sin 2theta.
      const variable = isNumber(first) && Object.hasOwn(variables, peek()) ? unary() : null;
      return (row) => functions[token](argument(row) * (variable ? variable(row) : 1));
    }
    throw new Error('Unknown symbol: ' + token);
  }

  function unary(): Evaluate {
    if (consume('-')) {
      const value = unary();
      return (row) => -value(row);
    }
    if (consume('+')) return unary();
    const base = atom();
    if (!consume('^')) return base;
    const exponent = unary();
    return (row) => base(row) ** exponent(row);
  }

  function product(): Evaluate {
    let result = unary();
    while (peek() === '*' || peek() === '/' || /^(?:[a-zA-Z]|\()/.test(peek() ?? '')) {
      const divide = consume('/');
      if (!divide) consume('*');
      const left = result;
      const right = unary();
      result = divide ? (row) => left(row) / right(row) : (row) => left(row) * right(row);
    }
    return result;
  }

  function sum(): Evaluate {
    let result = product();
    while (peek() === '+' || peek() === '-') {
      const add = take() === '+';
      const left = result;
      const right = product();
      result = add ? (row) => left(row) + right(row) : (row) => left(row) - right(row);
    }
    return result;
  }

  const evaluate = sum();
  if (cursor !== tokens.length) throw new Error('Unexpected symbol: ' + peek());
  return Object.assign(evaluate, { variables: usedVariables });
}

export function fitGraphPoints(points: ReadonlyArray<{ x: number; y: number }>) {
  if (points.length < 2) return null;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  const xx = points.reduce((sum, p) => sum + (p.x - meanX) ** 2, 0);
  const yy = points.reduce((sum, p) => sum + (p.y - meanY) ** 2, 0);
  if (!xx) return null;
  const xy = points.reduce((sum, p) => sum + (p.x - meanX) * (p.y - meanY), 0);
  const slope = xy / xx;
  return { slope, intercept: meanY - slope * meanX, rSquared: yy ? xy ** 2 / (xx * yy) : 0 };
}

type Recipe = {
  goal: Exclude<GraphGoal, ''>;
  controls: Array<keyof Pick<RecordedTrial, 'angle' | 'speed' | 'gravity'>>;
  level?: boolean;
  horizontal?: boolean;
  slope: Evaluate;
  solve: (slope: number, row: RecordedTrial) => number;
};

const angleFactor = (row: RecordedTrial) => Math.sin(2 * row.angle * radians);
const vx = (row: RecordedTrial) => row.speed * Math.cos(row.angle * radians);
const recipes: Recipe[] = [
  { goal: 'speed', controls: ['speed'], slope: (row) => row.speed, solve: (m) => m },
  { goal: 'speed', controls: ['speed'], level: true, slope: (row) => row.speed ** 2, solve: Math.sqrt },
  { goal: 'speed', controls: ['speed', 'gravity'], level: true, slope: (row) => row.speed ** 2 / row.gravity, solve: (m, row) => Math.sqrt(m * row.gravity) },
  { goal: 'gravity', controls: ['gravity'], slope: (row) => row.gravity, solve: (m) => m },
  { goal: 'gravity', controls: ['gravity'], slope: (row) => 1 / row.gravity, solve: (m) => 1 / m },
  { goal: 'gravity', controls: ['gravity'], level: true, slope: (row) => 1 / row.gravity, solve: (m) => 1 / m },
  { goal: 'gravity', controls: ['gravity'], horizontal: true, slope: (row) => row.gravity, solve: (m) => m },
  { goal: 'gravity', controls: ['gravity', 'speed'], level: true, slope: (row) => row.speed ** 2 / row.gravity, solve: (m, row) => row.speed ** 2 / m },
  { goal: 'gravity', controls: ['gravity', 'angle'], level: true, slope: (row) => angleFactor(row) / row.gravity, solve: (m, row) => angleFactor(row) / m },
  { goal: 'horizontal', controls: ['speed', 'angle'], slope: vx, solve: (m) => m },
];

function exampleTrial(angle: number, speed: number, gravity: number, height: number, level: boolean): RecordedTrial {
  const landingHeight = level ? height : height / 3;
  const params = { angle, speed, gravity, height, landingHeight };
  return { id: 0, apparatusName: '', ...params, ...calculateTheoreticalSummary(params) };
}

export function checkGraphGoal(goal: GraphGoal, x: AxisExpression, y: AxisExpression, rows: RecordedTrial[]) {
  if (!goal || rows.length < 3 || rows.some((row) => row.isExperimental)) return null;
  const unknown = goal === 'gravity' ? 'g' : 'v0';
  if (x.variables.has(unknown) || y.variables.has(unknown)) return null;
  const points = rows.map((row) => ({ x: x(row), y: y(row) }));
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  if (new Set(points.map((point) => point.x.toPrecision(8))).size < 3) return null;
  const fit = fitGraphPoints(points);
  const yMagnitude = Math.max(...points.map((point) => Math.abs(point.y)));
  if (!fit || fit.rSquared < 0.98 || Math.abs(fit.intercept) > 0.04 * yMagnitude) return null;

  const first = rows[0];
  const mean = (key: 'gravity' | 'speed' | 'angle') => rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
  const controls = { ...first, gravity: mean('gravity'), speed: mean('speed'), angle: mean('angle') };
  for (const recipe of recipes) {
    if (recipe.goal !== goal || (recipe.level && rows.some((row) => Math.abs(row.height - variables.hEnd(row)) > 1e-5))) continue;
    if (recipe.horizontal && rows.some((row) => Math.abs(row.angle) > 1e-5)) continue;
    if (recipe.controls.some((key) => rows.some((row) => Math.abs(row[key] - controls[key]) > 1e-5))) continue;
    const cases = [
      [18, 3.2, 7.8, 0.6], [39, 5.7, 9.6, 1.4],
      [64, 4.4, 12.1, 0.9], [27, 7.3, 15.5, 1.8],
    ].map(([angle, speed, gravity, height]) =>
      exampleTrial(recipe.horizontal ? 0 : angle, speed, gravity, height, Boolean(recipe.level))
    );
    for (const direction of [1, -1]) {
      const scales = cases.map((row) => y(row) / (x(row) * recipe.slope(row) ** direction));
      const scale = scales[0];
      if (!Number.isFinite(scale) || !scale || scales.some((value) => !Number.isFinite(value) || Math.abs(value / scale - 1) > 1e-6)) continue;
      const estimated = recipe.solve((fit.slope / scale) ** direction, controls);
      if (Number.isFinite(estimated) && estimated > 0) return { estimated, slope: fit.slope };
    }
  }
  return null;
}
