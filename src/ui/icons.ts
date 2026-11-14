/**
 * Lab4All — Custom Vector Scientific Iconography & Math Typography Helpers
 *
 * Provides crisp, lightweight SVG icons that replace unicode emojis across the UI,
 * along with typographic subscript and mathematical formatting helpers.
 */

import React from 'react';

const h = React.createElement;

export interface IconProps {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

function createSvg(
  viewBox: string,
  paths: React.ReactNode,
  props: IconProps = {}
): React.ReactElement {
  const size = props.size ?? 14;
  return h(
    'svg',
    {
      width: size,
      height: size,
      viewBox,
      fill: 'none',
      stroke: props.color || 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: props.className,
      style: {
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...props.style,
      },
    },
    paths
  );
}

// 1. Teacher / Gear Icon
export const IconTeacher: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('circle', { key: 'c', cx: 12, cy: 12, r: 3 }),
      h('path', {
        key: 'p',
        d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z',
      }),
    ],
    props
  );

// 2. Tabletop Stand Mount Icon
export const IconTableStand: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('path', { key: 'p1', d: 'M3 13h18M5 13v7M19 13v7M12 13V5' }),
      h('rect', { key: 'p2', x: 8, y: 3, width: 8, height: 3, rx: 1, fill: props.color || 'currentColor' }),
    ],
    props
  );

// 3. Bench Edge Clamp Icon
export const IconEdgeClamp: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('path', { key: 'p1', d: 'M7 6h8a2 2 0 0 1 2 2v2M7 18h8a2 2 0 0 0 2-2v-2M7 6v12' }),
      h('path', { key: 'p2', d: 'M13 18v3m-2 0h4' }),
      h('line', { key: 'p3', x1: 4, y1: 10, x2: 12, y2: 10 }),
      h('line', { key: 'p4', x1: 4, y1: 14, x2: 12, y2: 14 }),
    ],
    props
  );

// 4. Ideal Vacuum Icon (Clean Atom / Precision Star)
export const IconVacuum: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('circle', { key: 'c', cx: 12, cy: 12, r: 3, fill: props.color || 'currentColor' }),
      h('path', {
        key: 'p',
        d: 'M12 2v3m0 14v3M2 12h3m14 0h3M4.93 4.93l2.12 2.12m9.9 9.9 2.12 2.12M4.93 19.07l2.12-2.12m9.9-9.9 2.12-2.12',
      }),
    ],
    props
  );

// 5. Experiment / Flask Icon
export const IconExperiment: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('path', { key: 'p1', d: 'M10 2v5.5L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 7.5V2' }),
      h('line', { key: 'p2', x1: 8.5, y1: 2, x2: 15.5, y2: 2 }),
      h('path', { key: 'p3', d: 'M7 16h10' }),
    ],
    props
  );

// 6. Target / Bullseye Landing Icon
export const IconTarget: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('circle', { key: 'c1', cx: 12, cy: 12, r: 9 }),
      h('circle', { key: 'c2', cx: 12, cy: 12, r: 4 }),
      h('circle', { key: 'c3', cx: 12, cy: 12, r: 1.5, fill: props.color || 'currentColor' }),
      h('line', { key: 'l1', x1: 12, y1: 1, x2: 12, y2: 4 }),
      h('line', { key: 'l2', x1: 12, y1: 20, x2: 12, y2: 23 }),
      h('line', { key: 'l3', x1: 1, y1: 12, x2: 4, y2: 12 }),
      h('line', { key: 'l4', x1: 20, y1: 12, x2: 23, y2: 12 }),
    ],
    props
  );

// 7. Arrow Right (Horizontal indicator)
export const IconArrowRight: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    h('path', { d: 'M5 12h14m-6-6 6 6-6 6' }),
    props
  );

// 8. Level Launch Balance Icon
export const IconLevel: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('rect', { key: 'r', x: 2, y: 7, width: 20, height: 10, rx: 3 }),
      h('circle', { key: 'c', cx: 12, cy: 12, r: 2.5, fill: props.color || 'currentColor' }),
      h('line', { key: 'l1', x1: 9, y1: 7, x2: 9, y2: 17 }),
      h('line', { key: 'l2', x1: 15, y1: 7, x2: 15, y2: 17 }),
    ],
    props
  );

// 9. Forces / Lightning Vector Icon
export const IconForces: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    h('polygon', { points: '13 2 4 14 11 14 10 22 20 10 13 10 13 2', fill: props.color || 'currentColor' }),
    props
  );

// 10. Sound ON Icon
export const IconSoundOn: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('polygon', { key: 'p', points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5', fill: props.color || 'currentColor' }),
      h('path', { key: 'w1', d: 'M15.54 8.46a5 5 0 0 1 0 7.07' }),
      h('path', { key: 'w2', d: 'M19.07 4.93a10 10 0 0 1 0 14.14' }),
    ],
    props
  );

// 11. Sound Mute Icon
export const IconSoundOff: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('polygon', { key: 'p', points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5', fill: props.color || 'currentColor' }),
      h('line', { key: 'l1', x1: 22, y1: 9, x2: 16, y2: 15 }),
      h('line', { key: 'l2', x1: 16, y1: 9, x2: 22, y2: 15 }),
    ],
    props
  );

// 12. Launch / Rocket Icon
export const IconLaunch: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('path', {
        key: 'p1',
        d: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z',
      }),
      h('path', {
        key: 'p2',
        d: 'm12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z',
      }),
      h('line', { key: 'l1', x1: 9, y1: 12, x2: 4, y2: 12 }),
      h('line', { key: 'l2', x1: 12, y1: 15, x2: 12, y2: 20 }),
    ],
    props
  );

// 13. Instant Record / Bolt
export const IconInstant: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    h('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2', fill: props.color || 'currentColor' }),
    props
  );

// 14. Speed / Slow-Motion Stopwatch
export const IconSpeedometer: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('circle', { key: 'c', cx: 12, cy: 12, r: 9 }),
      h('line', { key: 'l', x1: 12, y1: 12, x2: 16, y2: 8 }),
      h('path', { key: 'p', d: 'M7 12a5 5 0 0 1 5-5' }),
    ],
    props
  );

// 15. Slope Tool / Triangle Ruler
export const IconSlope: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('path', { key: 't', d: 'M3 21h18V5L3 21z' }),
      h('path', { key: 'sq', d: 'M17 21v-4h4' }),
    ],
    props
  );

// 16. Trajectory Arc Chart
export const IconTrajectory: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('line', { key: 'x', x1: 3, y1: 20, x2: 21, y2: 20 }),
      h('line', { key: 'y', x1: 3, y1: 4, x2: 3, y2: 20 }),
      h('path', { key: 'arc', d: 'M3 20 C 7 6, 15 6, 21 20' }),
      h('circle', { key: 'dot', cx: 12, cy: 9, r: 2, fill: props.color || 'currentColor' }),
    ],
    props
  );

// 17. Bar Chart / Compare Icon
export const IconCompare: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('line', { key: 'axis', x1: 3, y1: 20, x2: 21, y2: 20 }),
      h('rect', { key: 'b1', x: 5, y: 11, width: 3, height: 9, rx: 1 }),
      h('rect', { key: 'b2', x: 10.5, y: 5, width: 3, height: 15, rx: 1 }),
      h('rect', { key: 'b3', x: 16, y: 8, width: 3, height: 12, rx: 1 }),
    ],
    props
  );

// 18. Options / Sliders Icon
export const IconSliders: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('line', { key: 'l1', x1: 4, y1: 21, x2: 4, y2: 14 }),
      h('line', { key: 'l2', x1: 4, y1: 10, x2: 4, y2: 3 }),
      h('line', { key: 'l3', x1: 12, y1: 21, x2: 12, y2: 12 }),
      h('line', { key: 'l4', x1: 12, y1: 8, x2: 12, y2: 3 }),
      h('line', { key: 'l5', x1: 20, y1: 21, x2: 20, y2: 16 }),
      h('line', { key: 'l6', x1: 20, y1: 12, x2: 20, y2: 3 }),
      h('circle', { key: 'c1', cx: 4, cy: 12, r: 2 }),
      h('circle', { key: 'c2', cx: 12, cy: 10, r: 2 }),
      h('circle', { key: 'c3', cx: 20, cy: 14, r: 2 }),
    ],
    props
  );

// 19. Observation / Eye Icon
export const IconEye: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('path', { key: 'p', d: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z' }),
      h('circle', { key: 'c', cx: 12, cy: 12, r: 3 }),
    ],
    props
  );

// 20. Checkmark Icon
export const IconCheck: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    h('polyline', { points: '20 6 9 17 4 12' }),
    props
  );

// 21. Close / Cross Icon
export const IconClose: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('line', { key: 'l1', x1: 18, y1: 6, x2: 6, y2: 18 }),
      h('line', { key: 'l2', x1: 6, y1: 6, x2: 18, y2: 18 }),
    ],
    props
  );

// 22. Reset / Undo Circular Arrow
export const IconReset: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('path', { key: 'p1', d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }),
      h('path', { key: 'p2', d: 'M3 3v5h5' }),
    ],
    props
  );

// 23. Surface Flush Indicator
export const IconSurfaceFlush: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('line', { key: 'surface', x1: 2, y1: 18, x2: 22, y2: 18 }),
      h('rect', { key: 'box', x: 6, y: 9, width: 12, height: 9, rx: 1.5 }),
      h('path', { key: 'arrow', d: 'm9 6 3-3 3 3' }),
    ],
    props
  );

// 24. Elevated Rod Indicator
export const IconElevated: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('line', { key: 'surface', x1: 2, y1: 21, x2: 22, y2: 21 }),
      h('rect', { key: 'box', x: 7, y: 3, width: 10, height: 7, rx: 1.5 }),
      h('line', { key: 'rod', x1: 12, y1: 10, x2: 12, y2: 21 }),
      h('path', { key: 'arrow', d: 'm9 15 3-3 3 3' }),
    ],
    props
  );

// 25. Angle Arc Clinometer Icon
export const IconClinometer: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('path', { key: 'arc', d: 'M4 18 A 14 14 0 0 1 18 4' }),
      h('line', { key: 'h', x1: 4, y1: 18, x2: 20, y2: 18 }),
      h('line', { key: 'needle', x1: 4, y1: 18, x2: 14, y2: 8 }),
    ],
    props
  );

// 26. Aspect Ratio Icon
export const IconAspect: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('rect', { key: 'frame', x: 3, y: 5, width: 18, height: 14, rx: 2 }),
      h('line', { key: 'diag', x1: 3, y1: 19, x2: 21, y2: 5 }),
    ],
    props
  );

// 27. Link / Hyperlink Icon
export const IconLink: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('path', {
        key: 'p1',
        d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
      }),
      h('path', {
        key: 'p2',
        d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
      }),
    ],
    props
  );

// 28. Lightbulb / Tip Icon
export const IconLightbulb: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('path', {
        key: 'bulb',
        d: 'M9 18h6m-4 4h2M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z',
      }),
    ],
    props
  );

// 29. Ruler / Measurement Icon
export const IconRuler: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('path', { key: 'body', d: 'M2 17 17 2l5 5L7 22Z' }),
      h('line', { key: 'm1', x1: '14.5', y1: '4.5', x2: '12', y2: '7' }),
      h('line', { key: 'm2', x1: '11.5', y1: '7.5', x2: '9', y2: '10' }),
      h('line', { key: 'm3', x1: '8.5', y1: '10.5', x2: '6', y2: '13' }),
    ],
    props
  );

// 30. Star (Theory) Icon
export const IconStar: React.FC<IconProps & { filled?: boolean }> = ({ filled, ...props }) =>
  createSvg(
    '0 0 24 24',
    h('polygon', {
      points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2',
      fill: filled ? (props.color || 'currentColor') : 'none',
    }),
    props
  );

// 31. Tab Icon: Set up (Gear)
export const IconGear: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('circle', { key: 'c', cx: 12, cy: 12, r: 3.5 }),
      h('path', {
        key: 'g',
        d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
      }),
    ],
    props
  );

// 32. Tab Icon: Run (Solid Play Triangle)
export const IconPlayFilled: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    h('polygon', {
      points: '6 3 20 12 6 21 6 3',
      fill: props.color || 'currentColor',
      stroke: props.color || 'currentColor',
    }),
    props
  );

// 33. Tab Icon: Record (Drafting Protractor & Pencil)
export const IconDrafting: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('path', { key: 'base', d: 'M3 21h18' }),
      h('path', { key: 'pencil', d: 'M5.5 17.5 16 7l3.5 3.5L9 21H5.5v-3.5z' }),
      h('line', { key: 'tip', x1: 13.5, y1: 9.5, x2: 17, y2: 13 }),
    ],
    props
  );

// 34. Tab Icon: Graph (Histogram / Frequency Bars)
export const IconChartBars: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('line', { key: 'base', x1: 3, y1: 21, x2: 21, y2: 21 }),
      h('line', { key: 'b1', x1: 7, y1: 21, x2: 7, y2: 13 }),
      h('line', { key: 'b2', x1: 12, y1: 21, x2: 12, y2: 5 }),
      h('line', { key: 'b3', x1: 17, y1: 21, x2: 17, y2: 9 }),
    ],
    props
  );

/** Cute retro pixel-art penguin mascot logo for Boreal Lab */
export const IconPenguin: React.FC<IconProps> = (props) => {
  const size = props.size ?? 28;
  return h(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      style: {
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        shapeRendering: 'crispEdges',
        ...props.style,
      },
    },
    // Body / head silhouette
    h('path', {
      d: 'M5 1h6v1h2v2h1v7h-1v2h-1v1H4v-1H3v-2H2V4h1V2h2V1z',
      fill: '#0f172a',
    }),
    // White face & belly
    h('path', {
      d: 'M5 4h6v2h1v5h-1v1H5v-1H4V6h1V4z',
      fill: '#ffffff',
    }),
    // Cyan scientist goggles
    h('rect', { x: 4, y: 2, width: 3, height: 2, fill: '#0284c7' }),
    h('rect', { x: 9, y: 2, width: 3, height: 2, fill: '#0284c7' }),
    h('rect', { x: 7, y: 2, width: 2, height: 1, fill: '#64748b' }),
    h('rect', { x: 5, y: 2, width: 1, height: 1, fill: '#bae6fd' }),
    h('rect', { x: 10, y: 2, width: 1, height: 1, fill: '#bae6fd' }),
    // Cute glossy eyes
    h('rect', { x: 5, y: 5, width: 2, height: 2, fill: '#0f172a' }),
    h('rect', { x: 9, y: 5, width: 2, height: 2, fill: '#0f172a' }),
    h('rect', { x: 5, y: 5, width: 1, height: 1, fill: '#ffffff' }),
    h('rect', { x: 9, y: 5, width: 1, height: 1, fill: '#ffffff' }),
    // Blush pink cheeks
    h('rect', { x: 4, y: 7, width: 1, height: 1, fill: '#f472b6' }),
    h('rect', { x: 11, y: 7, width: 1, height: 1, fill: '#f472b6' }),
    // Orange beak
    h('rect', { x: 7, y: 6, width: 2, height: 2, fill: '#f97316' }),
    // Orange feet
    h('rect', { x: 4, y: 14, width: 3, height: 1, fill: '#f97316' }),
    h('rect', { x: 9, y: 14, width: 3, height: 1, fill: '#f97316' })
  );
};

// Zoom In (magnifying glass with plus)
export const IconZoomIn: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('circle', { key: 'c', cx: 11, cy: 11, r: 7 }),
      h('line', { key: 'l1', x1: 21, y1: 21, x2: 16, y2: 16 }),
      h('line', { key: 'l2', x1: 11, y1: 8, x2: 11, y2: 14 }),
      h('line', { key: 'l3', x1: 8, y1: 11, x2: 14, y2: 11 }),
    ],
    props
  );

// Zoom Out (magnifying glass with minus)
export const IconZoomOut: React.FC<IconProps> = (props) =>
  createSvg(
    '0 0 24 24',
    [
      h('circle', { key: 'c', cx: 11, cy: 11, r: 7 }),
      h('line', { key: 'l1', x1: 21, y1: 21, x2: 16, y2: 16 }),
      h('line', { key: 'l2', x1: 8, y1: 11, x2: 14, y2: 11 }),
    ],
    props
  );

/**
 * Typographic Subscript Helper for Scientific Variables
 * Renders authentic HTML subscript typography (e.g. y_start -> y<sub>start</sub>).
 */
export function fmtSub(base: string, sub: string): React.ReactElement {
  return h('span', { className: 'math-var' }, [
    base,
    h('sub', { key: 'sub', className: 'math-sub' }, sub),
  ]);
}
