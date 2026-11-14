import { validateReconstructionGeometry } from '../equipment/schema.ts';
import type { ReconstructionGeometry } from '../equipment/schema.ts';

type Point = { x: number; y: number };
export type PanelPhotoFrame = {
  photoIndex: number;
  pivotX: number;
  baselineY: number;
  spanX: number;
  spanY: number;
  guideSpan?: number;
  muzzleRight: boolean;
};
type Raster = Pick<ImageData, 'data' | 'width' | 'height'>;

const colorDistance = (a: number[], b: number[]) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);

function photoColors({ data, width, height }: Raster) {
  const color = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return [Infinity, Infinity, Infinity];
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const corners = [[.03,.03],[.97,.03],[.03,.97],[.97,.97]].map(([x,y]) =>
    color(Math.floor(x * width), Math.floor(y * height)));
  const background = corners.find(corner => corners.filter(other => colorDistance(corner, other) <= 35).length >= 3);
  return background ? { color, background } : undefined;
}

function polygonContains(points: Point[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y)) inside = !inside;
  }
  return inside;
}

function simplify(points: Point[], tolerance: number): Point[] {
  const a = points[0], b = points[points.length - 1];
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  let furthest = 0, distance = tolerance * tolerance;
  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i];
    const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
    const error = (point.x - a.x - dx * t) ** 2 + (point.y - a.y - dy * t) ** 2;
    if (error > distance) { distance = error; furthest = i; }
  }
  if (!furthest) return [a,b];
  return [...simplify(points.slice(0, furthest + 1), tolerance).slice(0, -1), ...simplify(points.slice(furthest), tolerance)];
}

function outline(component: number[], labels: Uint32Array, label: number, width: number, maxPoints = 24): Point[] {
  const stride = width + 1;
  const edges = new Map<number, number[]>();
  const add = (from: number, to: number) => {
    const next = edges.get(from);
    if (next) next.push(to);
    else edges.set(from, [to]);
  };
  for (const cell of component) {
    const x = cell % width, y = Math.floor(cell / width);
    const top = y * stride + x;
    if (labels[cell - width] !== label) add(top, top + 1);
    if (labels[cell + 1] !== label) add(top + 1, top + stride + 1);
    if (labels[cell + width] !== label) add(top + stride + 1, top + stride);
    if (labels[cell - 1] !== label) add(top + stride, top);
  }
  let contour: Point[] = [];
  while (edges.size) {
    const start = edges.keys().next().value!;
    const loop: Point[] = [];
    let vertex = start;
    do {
      loop.push({ x: vertex % stride, y: Math.floor(vertex / stride) });
      const remaining = edges.get(vertex);
      if (!remaining) break;
      const next = remaining.pop()!;
      if (!remaining.length) edges.delete(vertex);
      vertex = next;
    } while (vertex !== start);
    if (vertex === start && loop.length > contour.length) contour = loop;
  }
  if (contour.length < 3) return [];
  const half = Math.floor(contour.length / 2);
  const tolerances = maxPoints === 16 ? [0.8, 1.2, 1.7, 2.2, 2.8, 3.5, 4.2, 5.0, 6.0, 7.0] : [0.8, 1.2, 1.7, 2.2];
  for (const tolerance of tolerances) {
    const a = simplify(contour.slice(0, half + 1), tolerance);
    const b = simplify([...contour.slice(half), contour[0]], tolerance);
    const points = [...a.slice(0,-1), ...b.slice(0,-1)];
    if (points.length >= 3 && points.length <= maxPoints) return points;
  }
  return [];
}

export function refinePanelCutout(image: Raster, geometry: ReconstructionGeometry, frame: PanelPhotoFrame): ReconstructionGeometry | undefined {
  if (!geometry.panelCutout || !geometry.panelOutline || frame.spanX <= 0 || frame.spanY <= 0) return undefined;
  const { width, height } = image;
  const direction = frame.muzzleRight ? 1 : -1;
  const toPixel = (p: Point) => ({
    x: (frame.pivotX + direction * frame.spanX * p.x) * width,
    y: (frame.baselineY - frame.spanY * p.y) * height,
  });
  const expected = geometry.panelCutout.map(toPixel);
  const panel = geometry.panelOutline.map(toPixel);
  const bounds = (axis: 'x' | 'y') => {
    const values = expected.map(p => p[axis]);
    return [Math.min(...values), Math.max(...values)] as const;
  };
  const [left, right] = bounds('x'), [top, bottom] = bounds('y');
  const margin = Math.max(6, Math.ceil(Math.max(right-left, bottom-top) * 0.2));
  const x0 = Math.max(0, Math.floor(left) - margin), x1 = Math.min(width - 1, Math.ceil(right) + margin);
  const y0 = Math.max(0, Math.floor(top) - margin), y1 = Math.min(height - 1, Math.ceil(bottom) + margin);
  if (x1 - x0 < 12 || y1 - y0 < 12) return undefined;
  const colors = photoColors(image);
  if (!colors) return undefined;
  const { color, background } = colors;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const mask = new Uint8Array(w * h);
  const labels = new Uint32Array(w * h);
  let expectedArea = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const index = y * w + x;
    const inEstimate = polygonContains(expected, x + x0 + .5, y + y0 + .5);
    if (inEstimate) expectedArea++;
    if (colorDistance(color(x + x0,y + y0), background) <= 42) mask[index] = inEstimate ? 2 : 1;
  }
  if (expectedArea < 30) return undefined;
  let best: { label: number; component: number[]; overlap: number } | undefined;
  let label = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    label++;
    const component = [start];
    labels[start] = label;
    let shared = 0, outside = false;
    for (let i = 0; i < component.length; i++) {
      const cell = component[i];
      const x = cell % w, y = Math.floor(cell / w);
      if (mask[cell] === 2) shared++;
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1 ||
          !polygonContains(panel, x + x0 + .5, y + y0 + .5)) outside = true;
      const neighbors = [x > 0 ? cell-1 : -1, x+1 < w ? cell+1 : -1,
        y > 0 ? cell-w : -1, y+1 < h ? cell+w : -1];
      for (const next of neighbors) if (next >= 0 && mask[next] && !labels[next]) {
        labels[next] = label;
        component.push(next);
      }
    }
    const overlap = shared / (component.length + expectedArea - shared);
    if (!outside && overlap >= .5 && overlap > (best?.overlap ?? 0) &&
        component.length >= .55 * expectedArea && component.length <= 1.6 * expectedArea) {
      best = { label, component, overlap };
    }
  }
  if (!best) return undefined;
  const panelCutout = outline(best.component, labels, best.label, w).map(p => ({
    x: direction * ((p.x + x0) / width - frame.pivotX) / frame.spanX,
    y: (frame.baselineY - (p.y + y0) / height) / frame.spanY,
  }));
  const checked = validateReconstructionGeometry({ ...geometry, panelCutout });
  return checked?.panelCutout && checked.panelExtraCutouts?.length === geometry.panelExtraCutouts?.length ? checked : undefined;
}

function refinePanelOutline(image: Raster, geometry: ReconstructionGeometry, frame: PanelPhotoFrame): ReconstructionGeometry | undefined {
  const source = geometry.panelOutline;
  const hex = geometry.supportColor;
  if (!source || !hex || !/^#[0-9a-f]{6}$/i.test(hex)) return undefined;
  const colors = photoColors(image);
  if (!colors) return undefined;
  const { color, background } = colors;
  const { width, height } = image;
  const direction = frame.muzzleRight ? 1 : -1;
  const points = source.map(p => ({
    x: (frame.pivotX + direction * frame.spanX * p.x) * width,
    y: (frame.baselineY - frame.spanY * p.y) * height,
  }));
  const area = (poly: Point[]) => poly.reduce((sum, a, i) => {
    const b = poly[(i + 1) % poly.length];
    return sum + a.x * b.y - b.x * a.y;
  }, 0);
  const support = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  if (colorDistance(support, background) < 62) return undefined;
  const sign = Math.sign(area(points));
  const radius = Math.max(3, Math.min(20, Math.round(frame.spanX * width * .095)));
  const edges = points.map((a, i) => {
    const next = (i + 1) % points.length;
    const b = points[next];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = sign * (b.y - a.y) / length;
    const ny = -sign * (b.x - a.x) / length;
    const edge = { nx, ny, shift: 0 };
    // The ground contact comes from the mounting geometry rather than image color.
    if (length < 12 || (source[i].y === 0 && source[next].y === 0)) return edge;
    const hits: number[] = [];
    for (const t of [.14, .26, .38, .5, .62, .74, .86]) {
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const sample = (offset: number) => color(Math.round(x + nx * offset), Math.round(y + ny * offset));
      let bestOffset = 0;
      let bestScore = Infinity;
      for (let offset = -radius; offset <= radius; offset++) {
        const inner = sample(offset - 3);
        const outer = sample(offset + 3);
        const farther = sample(offset + 6);
        if (colorDistance(inner, support) > 64 || colorDistance(outer, background) > 36 ||
            colorDistance(farther, background) > 36 || colorDistance(inner, outer) < 53) continue;
        // Center the bracket at the actual material-to-background transition.
        const closeInner = sample(offset - 1);
        const closeOuter = sample(offset + 1);
        const score = colorDistance(closeInner, support) + colorDistance(closeOuter, background) + Math.abs(offset) * .3;
        if (score < bestScore) { bestScore = score; bestOffset = offset; }
      }
      if (Number.isFinite(bestScore)) hits.push(bestOffset);
    }
    if (hits.length < 4) return edge;
    hits.sort((a,b) => a-b);
    const center = hits[Math.floor(hits.length / 2)];
    if (hits.filter(hit => Math.abs(hit-center) <= 2).length >= 4 && Math.abs(center) >= 2) edge.shift = center;
    return edge;
  });
  if (!edges.some(edge => edge.shift)) return undefined;
  const adjusted = points.map((point, i) => {
    const a = edges[(i + edges.length - 1) % edges.length], b = edges[i];
    const det = a.nx * b.ny - a.ny * b.nx;
    if (Math.abs(det) < .12) return point;
    const dx = (a.shift * b.ny - a.ny * b.shift) / det;
    const dy = (a.nx * b.shift - a.shift * b.nx) / det;
    return Math.hypot(dx,dy) <= radius * 1.6 ? { x: point.x + dx, y: point.y + dy } : point;
  });
  const ratio = area(adjusted) / area(points);
  if (ratio < .82 || ratio > 1.18) return undefined;
  const panelOutline = adjusted.map((p, i) => ({
    x: Math.max(-.5, Math.min(.5, direction * (p.x / width - frame.pivotX) / frame.spanX)),
    y: source[i].y === 0 ? 0 : (frame.baselineY - p.y / height) / frame.spanY,
  }));
  const validated = validateReconstructionGeometry({ ...geometry, panelOutline });
  if (!validated?.panelOutline || (geometry.panelCutout && !validated.panelCutout) ||
      validated.panelExtraCutouts?.length !== geometry.panelExtraCutouts?.length) return undefined;
  return validated;
}

export type HousingPhotoFrame = {
  photoIndex: number;
  muzzleRight: boolean;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function locateSpringSpan(
  prior: { start: number; end: number }, muzzleRight: boolean,
  shell: { left: number; right: number; top: number; bottom: number },
  plateColumns: readonly number[], lightness: (x: number, y: number) => number,
) {
  const { left, right, top, bottom } = shell;
  const width = right - left, height = bottom - top;
  const priorLeft = muzzleRight ? prior.start : 1 - prior.end;
  const priorRight = muzzleRight ? prior.end : 1 - prior.start;
  const startX = Math.ceil(left + Math.max(.025, priorLeft - .12) * width);
  const endX = Math.floor(left + Math.min(.975, priorRight + .12) * width);
  const plate = new Set(plateColumns);
  const hasContrast = (x: number, y: number) => !plate.has(x) && !plate.has(x + 1) &&
    Math.abs(lightness(x, y) - lightness(x + 1, y)) >= 24;
  const halfBand = Math.max(2, Math.round(height * .026));
  let bestY = 0, bestScore = 0;
  for (let y = top + Math.ceil(height * .38); y <= top + Math.floor(height * .81); y++) {
    let score = 0;
    for (let row = y - halfBand; row <= y + halfBand; row++) {
      for (let x = startX; x <= endX; x++) if (hasContrast(x, row)) score++;
    }
    if (score > bestScore) {
      bestY = y;
      bestScore = score;
    }
  }
  if (bestScore < width * (2 * halfBand + 1) * .045) return undefined;
  const textured: number[] = [];
  for (let x = startX; x <= endX; x++) {
    let rows = 0;
    for (let y = bestY - halfBand; y <= bestY + halfBand; y++) if (hasContrast(x, y)) rows++;
    if (rows >= halfBand) textured.push(x);
  }
  const runs: number[][] = [];
  for (const x of textured) {
    const run = runs.at(-1);
    if (run && x - run[run.length - 1] <= 4) run.push(x);
    else runs.push([x]);
  }
  const clusters: number[][] = [];
  for (const run of runs.filter(run => run.length >= 6)) {
    const cluster = clusters.at(-1);
    if (cluster && run[0] - cluster[cluster.length - 1] <= width * .063) cluster.push(...run);
    else clusters.push(run);
  }
  const expectedWidth = priorRight - priorLeft;
  const plausible = clusters.flatMap(cluster => {
    const start = (cluster[0] - left) / width;
    const end = (cluster[cluster.length - 1] + 1 - left) / width;
    const overlap = Math.min(end, priorRight) - Math.max(start, priorLeft);
    if (end - start < expectedWidth * .66 || end - start > expectedWidth * 1.65 ||
        overlap < expectedWidth * .68 || cluster.length < (end - start) * width * .42 ||
        Math.abs(start - priorLeft) > .1 || Math.abs(end - priorRight) > .1) return [];
    return [muzzleRight ? { start, end } : { start: 1 - end, end: 1 - start }];
  });
  return plausible.length === 1 ? plausible[0] : undefined;
}

export function refineHousingScale(raster: Raster, geometry: ReconstructionGeometry, frame: HousingPhotoFrame) {
  const prior = geometry.housingScaleSpan;
  const colors = photoColors(raster);
  if (!geometry.housingOpenFace || (!prior && !geometry.housingSpringSpan) || !colors || Math.min(...colors.background) < 205) return undefined;
  const { width, height } = raster;
  const { left, top, right, bottom, muzzleRight } = frame;
  if (![left, top, right, bottom].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) return undefined;
  const approxWidth = (right - left) * width;
  const approxHeight = (bottom - top) * height;
  if (approxWidth < 90 || approxHeight / approxWidth < .11 || approxHeight / approxWidth > .4) return undefined;
  const x0 = Math.max(0, Math.floor(left * width - approxWidth * .07));
  const x1 = Math.min(width - 1, Math.ceil(right * width + approxWidth * .07));
  const y0 = Math.max(0, Math.floor(top * height - approxHeight * .21));
  const y1 = Math.min(height - 1, Math.ceil(bottom * height + approxHeight * .21));
  const lightness = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    return (raster.data[offset] + raster.data[offset + 1] + raster.data[offset + 2]) / 3;
  };
  const count = (from: number, to: number, predicate: (index: number) => boolean) => {
    let hits = 0;
    for (let i = from; i <= to; i++) if (predicate(i)) hits++;
    return hits;
  };
  const darkCore = [];
  for (let x = x0; x <= x1; x++) {
    if (count(y0, y1, y => lightness(x, y) < 115) >= approxHeight * .55) darkCore.push(x);
  }
  if (darkCore.length < approxWidth * .24) return undefined;
  const rows = [];
  for (let y = y0; y <= y1; y++) {
    if (darkCore.filter(x => lightness(x, y) < 115).length >= darkCore.length * .68) rows.push(y);
  }
  if (rows.length < approxHeight * .65 || rows.length > approxHeight * 1.34) return undefined;
  const firstRow = rows[0];
  const lastRow = rows[rows.length - 1];
  const shellHeight = lastRow - firstRow + 1;
  if (rows.length < shellHeight * .94) return undefined;
  const wallColumns = [];
  for (let x = x0; x <= x1; x++) {
    if (count(firstRow, lastRow, y => lightness(x, y) < 115) >= shellHeight * .37) wallColumns.push(x);
  }
  const shellLeft = wallColumns[0];
  const shellRight = wallColumns[wallColumns.length - 1];
  const shellWidth = shellRight - shellLeft;
  if (!Number.isFinite(shellWidth) || shellWidth < approxWidth * .83 || shellWidth > approxWidth * 1.16 ||
      shellLeft <= x0 + 1 || shellRight >= x1 - 1) return undefined;
  const rail = Math.round(shellHeight * .2);
  const tiltAllowance = Math.round(shellHeight * .16);
  const plateColumns = [];
  for (let x = shellLeft + 2; x < shellRight - 1; x++) {
    const bright = count(firstRow + rail, lastRow - rail, y => lightness(x, y) > 183);
    if (bright >= (shellHeight - 2 * rail) * .72) plateColumns.push(x);
  }
  const gap = Math.max(3, Math.round(shellWidth * .025));
  const groups: number[][] = [];
  for (const x of plateColumns) {
    const group = groups.at(-1);
    if (group && x - group[group.length - 1] <= gap) group.push(x);
    else groups.push([x]);
  }
  const candidates = prior ? groups.flatMap(group => {
    const a = (group[0] - shellLeft) / shellWidth;
    const b = (group[group.length - 1] - shellLeft) / shellWidth;
    const start = muzzleRight ? a : 1 - b;
    const end = muzzleRight ? b : 1 - a;
    const overlap = Math.min(end, prior.end) - Math.max(start, prior.start);
    if (end - start < .12 || group.length < (b - a) * shellWidth * .8 ||
        overlap < (prior.end - prior.start) * .62 || end - start > (prior.end - prior.start) * 1.65 ||
        Math.abs(start + end - prior.start - prior.end) > .25) return [];
    const topRail = group.filter(x => count(Math.max(y0, firstRow - tiltAllowance), firstRow + rail,
      y => lightness(x, y) < 160)).length;
    const bottomRail = group.filter(x => count(lastRow - rail, Math.min(y1, lastRow + tiltAllowance),
      y => lightness(x, y) < 160)).length;
    if (Math.min(topRail, bottomRail) < group.length * .4 ||
        topRail + bottomRail < group.length * 1.35) return [];
    return [{ start, end }];
  }) : [];
  const scale = candidates.length === 1 ? candidates[0] : undefined;
  const spring = geometry.housingSpringSpan && locateSpringSpan(geometry.housingSpringSpan, muzzleRight, {
    left: shellLeft, right: shellRight, top: firstRow, bottom: lastRow,
  }, plateColumns, lightness);
  if (!scale && !spring) return undefined;
  return validateReconstructionGeometry({
    ...geometry, housingScaleSpan: scale ?? prior, housingSpringSpan: spring ?? geometry.housingSpringSpan,
  });
}

export async function refineHousingPhoto(src: string, geometry: ReconstructionGeometry, frame: HousingPhotoFrame) {
  const raster = await readPhotoRaster(src, geometry.housingSpringSpan ? 800 : 520);
  return raster ? refineHousingScale(raster, geometry, frame) : undefined;
}

type SlotComponent = { label: number; pixels: number[]; left: number; right: number; top: number; bottom: number };

export function detectSlottedSupport(
  raster: Raster,
  traced?: { geometry: ReconstructionGeometry; frame: PanelPhotoFrame },
): ReconstructionGeometry | undefined {
  const colors = photoColors(raster);
  const { width, height } = raster;
  if (!colors || Math.min(...colors.background) < 205 || Math.min(width, height) < 160) return undefined;
  const background = (x: number, y: number) => colorDistance(colors.color(x, y), colors.background) < 92;
  const dark = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    return raster.data[offset] + raster.data[offset + 1] + raster.data[offset + 2] < 385;
  };
  const mask = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) {
    let lastBright = -1;
    for (let y = 0; y < height; y++) {
      if (!background(x, y)) continue;
      mask[y * width + x] = 1;
      if (lastBright > height * .34 && y < height * .85 && y - lastBright <= height * .032) {
        for (let gap = lastBright + 1; gap < y; gap++) mask[gap * width + x] = 1;
      }
      lastBright = y;
    }
  }
  const labels = new Uint32Array(width * height);
  const slots: SlotComponent[] = [];
  let label = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (labels[index] || !mask[index]) continue;
      label++;
      const pixels = [index];
      labels[index] = label;
      let left = x, right = x, top = y, bottom = y;
      for (let i = 0; i < pixels.length; i++) {
        const cell = pixels[i];
        const cx = cell % width, cy = Math.floor(cell / width);
        left = Math.min(left, cx);
        right = Math.max(right, cx);
        top = Math.min(top, cy);
        bottom = Math.max(bottom, cy);
        for (const [nx, ny] of [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]]) {
          const next = ny * width + nx;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height || labels[next] || !mask[next]) continue;
          labels[next] = label;
          pixels.push(next);
        }
      }
      const w = right - left + 1, h = bottom - top + 1;
      if (left > width * .1 && right < width * .9 && top > height * .3 && bottom < height * .85 &&
          h >= height * .13 && w >= 4 && w <= width * .075 && h / w >= 4 &&
          pixels.length >= w * h * .52) slots.push({ label, pixels, left, right, top, bottom });
    }
  }
  if (slots.length !== 2) return undefined;
  slots.sort((a, b) => a.left - b.left);
  const [first, second] = slots;
  const slotTop = Math.max(first.top, second.top), slotBottom = Math.min(first.bottom, second.bottom);
  const slotHeight = slotBottom - slotTop;
  const gap = second.left - first.right;
  if (slotHeight < Math.max(first.bottom - first.top, second.bottom - second.top) * .77 ||
      gap < width * .025 || gap > width * .22) return undefined;

  const edge = (y: number, start: number, direction: -1 | 1) => {
    let whites = 0;
    const limit = Math.round(width * .15);
    for (let step = 0; step < limit; step++) {
      const x = start + direction * step;
      whites = background(x, y) ? whites + 1 : 0;
      if (whites >= 5) return x - 4 * direction;
    }
    return NaN;
  };
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const startLeft = first.left - 3, startRight = second.right + 3;
  const rows = Array.from({ length: 9 }, (_, i) => Math.round(slotTop + slotHeight * (.19 + .08 * i)));
  const leftEdges = rows.map(y => edge(y, startLeft, -1)).filter(Number.isFinite);
  const rightEdges = rows.map(y => edge(y, startRight, 1)).filter(Number.isFinite);
  if (leftEdges.length < 7 || rightEdges.length < 7 ||
      rows.filter(y => dark(startLeft, y) && dark(startRight, y)).length < 6) return undefined;
  const left = median(leftEdges), right = median(rightEdges), span = right - left;
  if (span < width * .09 || span > width * .4 ||
      first.left - left < 4 || right - second.right < 4 ||
      leftEdges.filter(x => Math.abs(x - left) <= span * .075).length < 7 ||
      rightEdges.filter(x => Math.abs(x - right) <= span * .075).length < 7) return undefined;

  const footEdge = (x: number, direction: -1 | 1, stem: number) => {
    let consecutive = 0;
    for (let y = slotBottom + 3; y < Math.min(height - 2, slotBottom + slotHeight * .72); y++) {
      const observed = edge(y, x, direction);
      consecutive = (observed - stem) * direction > Math.max(4, span * .07) ? consecutive + 1 : 0;
      if (consecutive === 4) return y - 3;
    }
    return NaN;
  };
  const footEdges = [footEdge(startLeft, -1, left), footEdge(startRight, 1, right)].filter(Number.isFinite);
  if (!footEdges.length) return undefined;
  const baseline = Math.max(...footEdges);

  const lanes = [.15, .26, .42, .58, .74, .85].map(fraction => Math.round(left + span * fraction));
  let top = slotTop;
  let missing = 0;
  for (let y = slotTop - 1; y >= Math.max(1, slotTop - slotHeight * 1.95); y--) {
    if (lanes.filter(x => dark(x, y)).length >= 3) {
      top = y;
      missing = 0;
    } else if (++missing > slotHeight * .42) break;
  }
  const panelHeight = baseline - top;
  if (panelHeight / span < 1.35 || panelHeight / span > 3.9 ||
      slotTop - top < slotHeight * .4 || baseline - slotBottom < slotHeight * .13) return undefined;

  const guideColumns: { x: number; y: number }[] = [];
  const guideBottom = Math.min(height - 2, Math.round(slotTop + slotHeight * .42));
  for (let x = 1; x < width - 1; x++) {
    const points = [];
    for (let y = top; y <= guideBottom; y++) if (dark(x, y)) points.push(y);
    if (points.length >= slotHeight * .11) guideColumns.push({ x, y: median(points) });
  }
  const guideLeft = guideColumns[0], guideRight = guideColumns[guideColumns.length - 1];
  const beyondPlate = guideLeft && guideRight ? Math.max(left - guideLeft.x, guideRight.x - right) : 0;
  if (beyondPlate < span * .65 || beyondPlate > span * 3.5) return undefined;
  const guideSpan = Math.hypot(guideRight.x - guideLeft.x, guideRight.y - guideLeft.y);
  const pivotHeight = panelHeight * .88;
  const transform = (p: Point) => ({ x: (p.x - (left + right) / 2) / span, y: (baseline - p.y) / pivotHeight });
  let project = transform;
  if (traced) {
    const { geometry, frame } = traced;
    if (!geometry.panelOutline || geometry.panelCutout || geometry.panelExtraCutouts?.length) return undefined;
    const direction = frame.muzzleRight ? 1 : -1;
    const points = geometry.panelOutline.map(point => ({
      x: (frame.pivotX + direction * frame.spanX * point.x) * width,
      y: (frame.baselineY - frame.spanY * point.y) * height,
    }));
    const xs = points.map(point => point.x), ys = points.map(point => point.y);
    if (Math.abs(Math.min(...xs) - left) > span * .18 || Math.abs(Math.max(...xs) - right) > span * .18 ||
        Math.abs(Math.min(...ys) - top) > panelHeight * .12 || Math.abs(Math.max(...ys) - baseline) > panelHeight * .12) {
      return undefined;
    }
    project = point => ({
      x: direction * (point.x / width - frame.pivotX) / frame.spanX,
      y: (frame.baselineY - point.y / height) / frame.spanY,
    });
  }
  const holes = slots.map(slot => outline(slot.pixels, labels, slot.label, width).map(project));
  const paintSamples = rows.map(y => colors.color(startLeft, y));
  const supportColor = '#' + [0, 1, 2].map(channel =>
    median(paintSamples.map(sample => sample[channel])).toString(16).padStart(2, '0')).join('');
  const result = validateReconstructionGeometry({
    ...(traced?.geometry ?? {
      panelOutline: [{ x: left, y: baseline }, { x: right, y: baseline }, { x: right, y: top }, { x: left, y: top }].map(transform),
      panelPivotHeightRatio: pivotHeight / span,
      panelSpanToGuideRatio: span / guideSpan,
    }),
    panelCutout: holes[0],
    panelExtraCutouts: [holes[1]],
    supportColor: traced?.geometry.supportColor ?? supportColor,
  });
  return result?.panelExtraCutouts?.length === 1 ? result : undefined;
}

export async function detectSlottedSupportPhoto(src: string) {
  const raster = await readPhotoRaster(src);
  return raster ? detectSlottedSupport(raster) : undefined;
}

async function readPhotoRaster(src: string, maxDimension = 520) {
  try {
    const photo = new Image();
    photo.src = src;
    await photo.decode();
    const scale = Math.min(1, maxDimension / Math.max(photo.naturalWidth, photo.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(photo,0,0,canvas.width,canvas.height);
    return ctx.getImageData(0,0,canvas.width,canvas.height);
  } catch {
    return undefined;
  }
}

function labelPhotoMask(mask: Uint8Array, width: number) {
  const labels = new Uint32Array(mask.length);
  const components: number[][] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const label = components.length + 1;
    const component = [start];
    labels[start] = label;
    for (let i = 0; i < component.length; i++) {
      const cell = component[i];
      const x = cell % width;
      for (const next of [x ? cell - 1 : -1, x + 1 < width ? cell + 1 : -1, cell - width, cell + width]) {
        if (next < 0 || next >= mask.length || !mask[next] || labels[next]) continue;
        labels[next] = label;
        component.push(next);
      }
    }
    components.push(component);
  }
  return { labels, components };
}

function photoConvexHull(points: Point[]) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (points: Point[]) => {
    const edge: Point[] = [];
    for (const point of points) {
      while (edge.length > 1) {
        const a = edge[edge.length - 2], b = edge[edge.length - 1];
        if ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) > 0) break;
        edge.pop();
      }
      edge.push(point);
    }
    return edge.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

function recoverPanelFromPixels(raster: Raster, geometry: ReconstructionGeometry, frame: PanelPhotoFrame) {
  const palette = photoColors(raster);
  const { width, height } = raster;
  if (!palette || !geometry.supportColor) return undefined;
  const { color, background } = palette;
  const decode = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  const support = decode(geometry.supportColor);
  if (colorDistance(support, background) < 95) return undefined;
  const guide = geometry.guideColor ? decode(geometry.guideColor) : undefined;
  const canBridgeGuide = guide && colorDistance(guide, support) > 100 && colorDistance(guide, background) > 100;
  const x0 = Math.max(1, Math.floor((frame.pivotX - frame.spanX / 2) * width) - 1);
  const x1 = Math.min(width - 2, Math.ceil((frame.pivotX + frame.spanX / 2) * width) + 1);
  const y0 = Math.max(1, Math.floor((frame.baselineY - frame.spanY * 1.25) * height));
  const y1 = Math.min(height - 2, Math.ceil((frame.baselineY + frame.spanY * .015) * height));
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  if (w < 30 || h < 30) return undefined;
  const mask = new Uint8Array(w * h);
  const edges: Point[] = [];
  let observed = 0;
  for (let y = 0; y < h; y++) {
    let first = w, last = -1;
    for (let x = 0; x < w; x++) {
      if (colorDistance(color(x + x0, y + y0), support) > 70) continue;
      mask[y * w + x] = 1;
      observed++;
      first = Math.min(first, x);
      last = x;
    }
    if (last >= first) edges.push({ x: first, y }, { x: last, y });
  }
  if (observed < w * h * .19) return undefined;
  if (canBridgeGuide) {
    const hull = photoConvexHull(edges);
    const guideMask = new Uint8Array(mask.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (colorDistance(color(x + x0, y + y0), guide) <= 46) guideMask[y * w + x] = 1;
    }
    const { components: guideComponents } = labelPhotoMask(guideMask, w);
    const guideBody = guideComponents.reduce<number[]>((best, component) => component.length > best.length ? component : best, []);
    const guideHull = photoConvexHull(guideBody.map(cell => ({ x: cell % w, y: Math.floor(cell / w) })));
    // Include the narrow edge and trim around the guide to close the occlusion seam.
    const guideMargin = Math.max(2, Math.round(Math.min(w, h) * .018));
    const guideFootprint = photoConvexHull(guideHull.flatMap(({ x, y }) => [
      { x: x - guideMargin, y }, { x: x + guideMargin, y },
      { x, y: y - guideMargin }, { x, y: y + guideMargin },
    ]));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const index = y * w + x;
      if (!mask[index] && polygonContains(hull, x, y) && polygonContains(guideFootprint, x, y)) mask[index] = 2;
    }
  }
  const { labels, components } = labelPhotoMask(mask, w);
  const largest = components.reduce<number[]>((best, component) => component.length > best.length ? component : best, []);
  if (largest.length < observed * .86 || largest.length > observed * 1.38) return undefined;
  const contour = outline(largest, labels, labels[largest[0]], w, 16);
  if (!contour.length) return undefined;
  const direction = frame.muzzleRight ? 1 : -1;
  const project = (point: Point) => ({
    x: Math.max(-.5, Math.min(.5, direction * ((point.x + x0) / width - frame.pivotX) / frame.spanX)),
    y: (frame.baselineY - (point.y + y0) / height) / frame.spanY,
  });
  const panelOutline = contour.map(project).map(point => ({ ...point, y: point.y < .035 ? 0 : point.y }));
  const panel = validateReconstructionGeometry({ ...geometry, panelOutline,
    panelPivotHeightRatio: frame.spanY * height / (frame.spanX * width),
    panelSpanToGuideRatio: frame.guideSpan ? frame.spanX / frame.guideSpan : undefined });
  if (!panel?.panelOutline) return undefined;
  const bright = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (polygonContains(contour, x + .5, y + .5) && colorDistance(color(x + x0, y + y0), background) <= 24) bright[y * w + x] = 1;
  }
  const holes = labelPhotoMask(bright, w);
  const cutouts = holes.components.filter(component => component.length >= Math.max(35, largest.length * .012) &&
    component.length < largest.length * .42 && component.every(cell => {
      const x = cell % w + .5, y = Math.floor(cell / w) + .5;
      return polygonContains(contour, x - 2, y) && polygonContains(contour, x + 2, y) &&
        polygonContains(contour, x, y - 2) && polygonContains(contour, x, y + 2);
    })).slice(0, 4).map(component => outline(component, holes.labels, holes.labels[component[0]], w).map(project));
  return validateReconstructionGeometry({ ...panel, panelCutout: cutouts[0], panelExtraCutouts: cutouts.slice(1) });
}

function recoverPanelStand(raster: Raster, geometry: ReconstructionGeometry, frame: PanelPhotoFrame) {
  const palette = photoColors(raster);
  if (!palette || !geometry.panelOutline || !geometry.supportColor) return undefined;
  const { width, height } = raster;
  const { color, background } = palette;
  const panelSpan = frame.spanX * width;
  const panelHeight = frame.spanY * height;
  const baseY = Math.round(frame.baselineY * height);
  const pivotX = Math.round(frame.pivotX * width);
  const direction = frame.muzzleRight ? 1 : -1;
  const feet = geometry.panelOutline.filter(point => point.y <= .025)
    .map(point => pivotX + direction * point.x * panelSpan);
  if (feet.length < 2) return undefined;
  const leftFoot = Math.min(...feet);
  const rightFoot = Math.max(...feet);
  const center = Math.round((leftFoot + rightFoot) / 2);
  const supportColor = geometry.supportColor;
  const support = [1, 3, 5].map(index => parseInt(supportColor.slice(index, index + 2), 16));
  const maxThickness = Math.floor(panelSpan * .18);
  const runs: { y: number; left: number; right: number; shade: number[] }[] = [];
  for (let y = baseY + 1; y < Math.min(baseY + maxThickness, height - 1); y++) {
    const shade = color(center, y);
    if (colorDistance(shade, background) < 48 || colorDistance(shade, support) < 60) continue;
    // A bolt head or level bubble can interrupt an otherwise straight plate.
    const maxGap = Math.max(2, Math.round(panelSpan * .055));
    const edge = (step: number) => {
      let last = center;
      for (let x = center + step; x >= 0 && x < width; x += step) {
        const pixel = color(x, y);
        if (colorDistance(pixel, shade) <= 28) last = x;
        else if (colorDistance(pixel, background) <= 22 || Math.abs(x - last) > maxGap) break;
      }
      return last;
    };
    const left = edge(-1), right = edge(1);
    if (left === 0 || right === width - 1 || left > leftFoot + 2 || right < rightFoot - 2 ||
        right - left < panelSpan * .64 || right - left > panelSpan * 1.8) continue;
    runs.push({ y, left, right, shade });
  }
  const first = runs[0];
  if (!first || first.y - baseY > Math.max(4, panelHeight * .035)) return undefined;
  let rows = 1;
  const edgeTolerance = Math.max(2, panelSpan * .025);
  while (rows < runs.length) {
    const row = runs[rows];
    if (row.y !== first.y + rows || Math.abs(row.left - first.left) > edgeTolerance ||
        Math.abs(row.right - first.right) > edgeTolerance || colorDistance(row.shade, first.shade) > 32) break;
    rows++;
  }
  const body = runs[Math.floor(rows / 2)];
  let bottom = first.y + rows;
  // Include a thin contrasting rim when it ends at the sides of the plate.
  const rimLimit = Math.max(1, Math.floor(panelSpan * .012));
  const inset = Math.round((body.right - body.left) * .16);
  for (let extra = 0; extra < rimLimit && bottom < height - 1; extra++) {
    const rim = color(center, bottom);
    if (colorDistance(rim, body.shade) <= 32 || colorDistance(rim, background) < 65 ||
        colorDistance(color(body.left + inset, bottom), rim) > 42 ||
        colorDistance(color(body.right - inset, bottom), rim) > 42 ||
        colorDistance(color(body.left - 4, bottom), rim) < 42 ||
        colorDistance(color(body.right + 4, bottom), rim) < 42) break;
    bottom++;
  }
  const thickness = bottom - baseY;
  if (rows < 4 || thickness < panelSpan * .02 || thickness >= maxThickness - 1) return undefined;
  const [left, right] = [body.left, body.right + 1].map(x => direction * (x - pivotX) / panelSpan).sort((a, b) => a - b);
  const hex = '#' + body.shade.map(value => value.toString(16).padStart(2, '0')).join('');
  return validateReconstructionGeometry({ ...geometry, panelStand: { left, right, thickness: thickness / panelSpan, color: hex } });
}

function measureBarrelProfile(points: Point[], rear: number, length: number,
  centerX: number, centerY: number, ux: number, uy: number) {
  const count = 40;
  const sections: number[][] = Array.from({ length: count }, () => []);
  for (const point of points) {
    const x = point.x - centerX, y = point.y - centerY;
    const along = (x * ux + y * uy - rear) / length;
    if (along < 0 || along > 1) continue;
    sections[Math.min(count - 1, Math.floor(along * count))].push(y * ux - x * uy);
  }
  if (sections.some(section => section.length < 6)) return undefined;
  const sectionWidths = sections.map(section => {
    section.sort((a, b) => a - b);
    return section[Math.floor((section.length - 1) * .97)] - section[Math.ceil((section.length - 1) * .03)];
  });
  // A centered median removes single-column nicks and specular gaps.
  const widths = sectionWidths.map((width, i) => i === 0 || i === count - 1 ? width
    : [sectionWidths[i - 1], width, sectionWidths[i + 1]].sort((a, b) => a - b)[1]);
  widths[0] = widths[1];
  widths[count - 1] = widths[count - 2];
  const maximum = Math.max(...widths), minimum = Math.min(...widths);
  if (minimum / maximum < .43 || minimum / maximum > .86) return undefined;
  const profile = widths.map((width, i) => ({
    x: i === 0 ? 0 : i === count - 1 ? 1 : (i + .5) / count,
    y: Math.max(.45, width / maximum),
  }));
  const reduced = simplify(profile, .034);
  if (reduced.length > 14) return undefined;
  const peak = Math.max(...reduced.map(point => point.y));
  return {
    barrelProfile: reduced.map(({ x, y }) => ({ along: x, width: y / peak })),
    guideWidthToLengthRatio: maximum / length,
  };
}

function recoverGuidePivot(raster: Raster, geometry: ReconstructionGeometry, frame: PanelPhotoFrame, guideType?: string) {
  const palette = photoColors(raster);
  if (!palette || !geometry.panelOutline || !geometry.guideColor || !geometry.supportColor) return undefined;
  const { width, height } = raster;
  const { color, background } = palette;
  const decode = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  const guide = decode(geometry.guideColor);
  if (colorDistance(guide, background) < 100 || colorDistance(guide, decode(geometry.supportColor)) < 100) return undefined;
  const mask = new Uint8Array(width * height);
  const redGreen = guide[0] - guide[1];
  const blueGreen = guide[2] - guide[1];
  const chroma = Math.hypot(redGreen, blueGreen);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const pixel = color(x, y);
    const red = pixel[0] - pixel[1], blue = pixel[2] - pixel[1];
    const pixelChroma = Math.hypot(red, blue);
    // Painted guides can have a bright highlight along one side and shadow along the other.
    const sameHue = chroma > 60 && pixelChroma > chroma * .31 &&
      redGreen * red + blueGreen * blue > pixelChroma * chroma * .96;
    if (sameHue || colorDistance(pixel, guide) < 54) mask[y * width + x] = 1;
  }
  const { components } = labelPhotoMask(mask, width);
  const component = components.reduce<number[]>((best, part) => part.length > best.length ? part : best, []);
  if (component.length < 100) return undefined;
  const points = component.map(cell => ({ x: cell % width, y: Math.floor(cell / width) }));
  const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  let xx = 0, xy = 0, yy = 0;
  for (const point of points) {
    const x = point.x - centerX, y = point.y - centerY;
    xx += x * x;
    xy += x * y;
    yy += y * y;
  }
  // The major axis of the connected guide pixels estimates the bore direction.
  const angle = Math.atan2(2 * xy, xx - yy) / 2;
  const direction = frame.muzzleRight ? 1 : -1;
  const ux = Math.cos(angle) * direction, uy = Math.sin(angle) * direction;
  if (Math.abs(ux) < .4) return undefined;
  const along: number[] = [], across: number[] = [];
  for (const point of points) {
    const x = point.x - centerX, y = point.y - centerY;
    along.push(x * ux + y * uy);
    across.push(y * ux - x * uy);
  }
  along.sort((a, b) => a - b);
  across.sort((a, b) => a - b);
  const percentile = (values: number[], fraction: number) => values[Math.round((values.length - 1) * fraction)];
  const rear = percentile(along, .003), front = percentile(along, .997);
  const length = front - rear;
  const breadth = percentile(across, .98) - percentile(across, .02);
  if (length < width * .12 || breadth < 4 || breadth > length * .3) return undefined;
  if (frame.guideSpan && Math.abs(length / (frame.guideSpan * width) - 1) > .24) return undefined;
  const dx = frame.pivotX * width - centerX;
  const dy = (frame.baselineY - frame.spanY) * height - centerY;
  const pivot = dx * ux + dy * uy;
  const pivotAcross = dy * ux - dx * uy;
  if (Math.abs(pivotAcross) > breadth * .42) return undefined;
  const guideForwardRatio = (front - pivot) / length;
  const panelSpanToGuideRatio = frame.spanX * width / length;
  if (guideForwardRatio < .03 || guideForwardRatio > .97 ||
      panelSpanToGuideRatio < .25 || panelSpanToGuideRatio > 2.5) return undefined;
  const observedProfile = guideType === 'tube' && !geometry.guideSleeves?.length
    ? measureBarrelProfile(points, rear, length, centerX, centerY, ux, uy)
    : undefined;
  return validateReconstructionGeometry({ ...geometry, ...observedProfile, guideForwardRatio, panelSpanToGuideRatio });
}

export async function refinePhotoGeometry(src: string, geometry: ReconstructionGeometry, frame: PanelPhotoFrame, guideType?: string) {
  if (![frame.pivotX, frame.baselineY, frame.spanX, frame.spanY].every(Number.isFinite) ||
      frame.spanX <= 0 || frame.spanY <= 0) return undefined;
  const raster = await readPhotoRaster(src);
  if (!raster) return undefined;
  if (!geometry.panelOutline) {
    const panel = recoverPanelFromPixels(raster, geometry, frame);
    if (!panel) return undefined;
    const stand = recoverPanelStand(raster, panel, frame) ?? panel;
    return recoverGuidePivot(raster, stand, frame, guideType) ?? stand;
  }
  const outline = refinePanelOutline(raster, geometry, frame);
  const panel = outline ?? geometry;
  const cutout = panel.panelCutout
    ? refinePanelCutout(raster, panel, frame)
    : panel.panelOutline ? detectSlottedSupport(raster, { geometry: panel, frame }) : undefined;
  const stand = recoverPanelStand(raster, cutout ?? panel, frame);
  return recoverGuidePivot(raster, stand ?? cutout ?? panel, frame, guideType) ?? stand ?? cutout ?? outline;
}
