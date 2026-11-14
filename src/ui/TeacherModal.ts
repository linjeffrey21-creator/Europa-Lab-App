/**
 * Lab4All — Teacher Mode & Assignment Configuration Modal
 *
 * Implements Part 7 ("Teacher Mode"):
 * - Create a lab assignment & select preset activities (including the mandatory
 *   "Investigation: How does launch angle affect projectile range?")
 * - Choose default parameters & lock selected variables for students
 * - Write investigation question & detailed student instructions
 * - Hide theoretical answers so students must calculate predictions independently
 * - Configure minimum required trials & target cup challenge
 * - Save/Load locally (`localStorage`), Export/Import JSON, and Generate Shareable URL Link
 */

import React, { useRef, useState } from 'react';
import { useDialogFocus } from './useDialogFocus.ts';
import type { ExperimentalEnvironment, LaunchParameters, PhysicsMode, ProjectileMaterial } from '../physics/projectile.ts';
import { calculateTheoreticalSummary, LANDING_TARGET_RADIUS_M } from '../physics/projectile.ts';
import { writeAssignmentEquipment } from './assignmentSetup.ts';
import type { OperatingLimits, ProjectileApparatusSpec } from '../equipment/schema.ts';
import { computeFixedHeightAngleRange, computeMinimumClearanceHeight } from '../equipment/schema.ts';
import { IconClose, IconLink, IconTeacher } from './icons.ts';
import { SAMPLE_TEACHER_NOTE_IMAGES } from './chalkboard-notes.ts';

const h = React.createElement;

export const EXPERIMENT_VARIABLE_LABELS = {
  angle: 'Launch angle',
  speed: 'Initial speed',
  height: 'Launch height',
  landingHeight: 'Landing height',
  gravity: 'Gravity',
};
export type ExperimentVariable = keyof typeof EXPERIMENT_VARIABLE_LABELS;

export interface TeacherAssignmentConfig {
  title: string;
  question: string;
  instructions: string;
  teacherNotes?: string;
  independentVariable: ExperimentVariable;
  requiredTrials: number;
  targetCupDistanceM: number | null;
  adjustable: {
    angle: boolean;
    speed: boolean;
    height: boolean;
    gravity: boolean;
    landingHeight?: boolean;
  };
  showTheory: boolean;
  solveFor?: '' | 'speed' | 'gravity';
  hideLaunchSpeed?: boolean;
  params: LaunchParameters;
  equipment?: ProjectileApparatusSpec;
  limits?: OperatingLimits | null;
  material?: ProjectileMaterial;
  physicsMode?: PhysicsMode;
  mountMode?: 'stand' | 'clamp';
  environment?: ExperimentalEnvironment;
  chalkboardMode?: 'default' | 'erased' | 'custom_image';
  chalkboardCustomImage?: string | null;
}

const experimentVariables = Object.keys(EXPERIMENT_VARIABLE_LABELS) as ExperimentVariable[];

export function normalizeAssignmentVariables(input: unknown, preferred: unknown) {
  const raw = input && typeof input === 'object' ? input as Partial<Record<ExperimentVariable, unknown>> : {};
  const adjustable = Object.fromEntries(experimentVariables.map(key =>
    [key, Object.hasOwn(raw, key) && raw[key] === true])) as TeacherAssignmentConfig['adjustable'];
  const available = experimentVariables.filter(key => adjustable[key]);
  return {
    adjustable, independentVariable: available.find(key => key === preferred) ?? available[0] ?? 'angle',
  };
}

function describeTarget(
  target: number, params: LaunchParameters, adjustable: TeacherAssignmentConfig['adjustable'],
  physics: PhysicsMode, equipment: ProjectileApparatusSpec, mount: 'stand' | 'clamp', limits: OperatingLimits | null
) {
  if (physics !== 'ideal' || experimentVariables.some(key => key !== 'angle' && adjustable[key])) {
    return 'Target reach depends on the experiment settings. Check it in Run.';
  }
  const range = adjustable.angle ? computeFixedHeightAngleRange(equipment, mount, params.height, params.angle,
    limits?.minAngle ?? 0, limits?.maxAngle ?? 90) : { min: params.angle, max: params.angle };
  const first = range.min;
  const last = range.max;
  const steps = Math.max(1, Math.ceil((last - first) * 4));
  const height = params.landingHeight ?? 0;
  let crossed = false;
  for (let step = 0; step <= steps; step++) {
    const angle = first + (last - first) * step / steps;
    if (computeMinimumClearanceHeight(equipment, angle, mount) > params.height + 1e-6) continue;
    const shot = calculateTheoreticalSummary({ ...params, angle });
    if (shot.time <= 0 || Math.abs(shot.landingHeight - height) > 1e-6) continue;
    crossed = true;
    if (Math.abs(shot.range - target) <= LANDING_TARGET_RADIUS_M) return 'The target is reachable with these settings.';
  }
  return crossed ? 'No tested launch reached the target within the current limits.'
    : 'No tested launch reached the target height.';
}

const LEVEL_ANGLE_SAMPLE = {
  title: 'Angle and range',
  question:
    'How does launch angle affect range when the marble lands at its launch height?',
  instructions:
    '1. Predict which angle will give the greatest range.\n2. Launch at 15°, 30°, 45°, 60°, and 75°. Record the range for each launch.\n3. Plot range against launch angle. Which angle gave the greatest range? Which pairs traveled about the same distance?',
  independentVariable: 'angle',
  requiredTrials: 5,
  targetCupDistanceM: null,
  adjustable: {
    angle: true,
    speed: false,
    height: false,
    gravity: false,
    landingHeight: false,
  },
  showTheory: false,
  params: {
    angle: 25,
    speed: 4.0,
    height: 0.65,
    gravity: 9.81,
  },
} satisfies TeacherAssignmentConfig;

export const SAMPLE_TEACHER_ACTIVITIES: Record<
  string,
  Omit<TeacherAssignmentConfig, 'equipment' | 'limits'>
> = {
  'angle-vs-range': LEVEL_ANGLE_SAMPLE,
  'find-gravity': {
    ...LEVEL_ANGLE_SAMPLE,
    title: 'Find gravity from range',
    question: 'Can you determine gravity from how far the marble travels?',
    instructions:
      'Keep launch speed fixed and land at the launch height. Make five trials at different angles and record each range. Rearrange the projectile equations to choose axes that give a straight line, then use its slope to estimate gravity.',
    solveFor: 'gravity',
    physicsMode: 'ideal',
    chalkboardMode: 'erased',
    params: { ...LEVEL_ANGLE_SAMPLE.params, landingHeight: LEVEL_ANGLE_SAMPLE.params.height },
  },
  'hit-the-target-challenge': {
    title: 'Hit the target',
    question:
      'Which two launch angles reach the center of a target 1.35 m away?',
    instructions:
      '1. The target and muzzle are at the same height. Use R = v₀² sin(2θ) / g to predict both angles that reach 1.35 m.\n2. Test and record both predictions. Record a third launch at an angle between them.\n3. Compare the measured horizontal distance with 1.35 m in all three trials.',
    teacherNotes:
      'Instructor Solution Key: R = (v₀² sin 2θ) / g. For v₀ = 4.00 m/s, g = 9.81 m/s², and R = 1.35 m: sin(2θ) = (1.35 * 9.81) / 16 ≈ 0.8277 => 2θ ≈ 55.86° => θ₁ ≈ 27.9° (direct low arc) and θ₂ = 90° - 27.9° ≈ 62.1° (high lofted arc). Both predictions put the marble within 0.01 m of the target center.',
    independentVariable: 'angle',
    requiredTrials: 3,
    targetCupDistanceM: 1.35,
    adjustable: {
      angle: true,
      speed: false,
      height: false,
      gravity: false,
      landingHeight: false,
    },
    showTheory: false,
    material: 'solid_brass_19mm',
    physicsMode: 'ideal',
    params: {
      angle: 30,
      speed: 4.0,
      height: 0.65,
      landingHeight: 0.65,
      gravity: 9.81,
    },
    chalkboardMode: 'erased',
    chalkboardCustomImage: null,
  },
  'open-exploration': {
    title: 'Open exploration',
    question:
      'How does changing one variable affect your projectile?',
    instructions:
      '1. Pick one setting to change and predict what it will affect.\n2. Record three trials with different values for that setting. Keep the others fixed.\n3. Plot the quantity you measured against the setting you changed. Describe the pattern.',
    independentVariable: 'angle',
    requiredTrials: 3,
    targetCupDistanceM: null,
    adjustable: {
      angle: true,
      speed: true,
      height: true,
      gravity: true,
      landingHeight: true,
    },
    showTheory: true,
    params: {
      angle: 40,
      speed: 4.0,
      height: 0.65,
      gravity: 9.81,
    },
  },
};

export interface TeacherModalProps {
  config: TeacherAssignmentConfig;
  mode: 'student' | 'teacher';
  currentParams: LaunchParameters;
  currentEquipment: ProjectileApparatusSpec;
  currentLimits: OperatingLimits | null;
  currentMount: 'stand' | 'clamp';
  currentPhysics: PhysicsMode;
  currentEnvironment: ExperimentalEnvironment;
  currentBoardMode: NonNullable<TeacherAssignmentConfig['chalkboardMode']>;
  currentBoardImage: string | null;
  onUpdateConfig: (next: TeacherAssignmentConfig) => void;
  onGenerateTrial: () => void;
  onToggleMode: (nextMode: 'student' | 'teacher') => void;
  onApplyPresetActivity: (activity: TeacherAssignmentConfig) => void;
  onClose: () => void;
}

export const TeacherModal: React.FC<TeacherModalProps> = ({
  config,
  mode,
  currentParams,
  currentEquipment,
  currentLimits,
  currentMount,
  currentPhysics,
  currentEnvironment,
  currentBoardMode,
  currentBoardImage,
  onUpdateConfig,
  onGenerateTrial,
  onToggleMode,
  onApplyPresetActivity,
  onClose,
}) => {
  const [statusNotice, setStatusNotice] = useState<string>('');
  const [lastLink, setLastLink] = useState<{ url: string; payload: string } | null>(null);
  const [targetInput, setTargetInput] = useState<string>(
    config.targetCupDistanceM != null ? String(config.targetCupDistanceM) : ''
  );

  const studentVariables = normalizeAssignmentVariables(config.adjustable, config.independentVariable);
  const hasAdjustableVariable = experimentVariables.some(key => studentVariables.adjustable[key]);
  const target = targetInput.trim() ? Number(targetInput) : null;
  const targetError = target !== null && (!Number.isFinite(target) || target < 0.2 || target > 10);
  const fixedHeightError = !studentVariables.adjustable.height &&
    computeMinimumClearanceHeight(currentEquipment, currentParams.angle, currentMount) > currentParams.height + 1e-7;
  const minAngle = (currentLimits ?? currentEquipment.limits)?.minAngle ?? 0;
  const maxAngle = (currentLimits ?? currentEquipment.limits)?.maxAngle ?? 90;
  const fixedAngleRange = studentVariables.adjustable.angle && !studentVariables.adjustable.height && !fixedHeightError
    ? computeFixedHeightAngleRange(currentEquipment, currentMount, currentParams.height, currentParams.angle, minAngle, maxAngle)
    : null;
  const limitedAngles = fixedAngleRange && (fixedAngleRange.min > minAngle || fixedAngleRange.max < maxAngle);

  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, onClose);

  const handleLoadSample = (key: string) => {
    const sample = SAMPLE_TEACHER_ACTIVITIES[key];
    if (!sample) return;
    const rawH = Number.isFinite(sample.params?.height) ? sample.params.height : 0.65;
    const bounds = currentLimits ?? currentEquipment.limits;
    const minAngle = bounds?.minAngle ?? 0;
    const maxAngle = bounds?.maxAngle ?? 90;
    const angle = Math.min(maxAngle, Math.max(minAngle, sample.params.angle));
    const requiredAngles = [angle];
    let instructions = sample.instructions;
    if (key === 'angle-vs-range' || key === 'find-gravity') {
      const standard = [15, 30, 45, 60, 75];
      const supported = standard[0] >= minAngle && standard.at(-1)! <= maxAngle;
      const first = Math.max(1, minAngle);
      const last = Math.min(89, maxAngle);
      if (!supported && last <= first) {
        setStatusNotice('This sample needs a range of launch angles above horizontal. Choose a different launcher or sample.');
        return;
      }
      const angles = supported ? standard
        : Array.from({ length: 5 }, (_, index) => first + (last - first) * index / 4);
      requiredAngles.push(...angles);
      if (!supported) {
        if (key === 'angle-vs-range') instructions = '1. Predict how angle will affect range.\n2. Make five launches at different angles above horizontal. Record the range each time.\n3. Plot range against launch angle and describe the pattern.';
      }
    }
    if (key === 'hit-the-target-challenge') {
      const low = Math.asin(1.35 * sample.params.gravity / sample.params.speed ** 2) * 90 / Math.PI;
      const high = 90 - low;
      if (minAngle > low || maxAngle < high || (bounds?.maxSpeed ?? Infinity) < sample.params.speed) {
        setStatusNotice('This launcher needs both target angles and a speed of 4 m/s for this sample. Choose a different launcher or sample.');
        return;
      }
      requiredAngles.push(low, 45, high);
    }
    const minH = Math.max(...requiredAngles.map(value => computeMinimumClearanceHeight(currentEquipment, value, currentMount)));
    const safeHeight = Number.isFinite(minH) ? Math.max(rawH, minH) : rawH;
    const safeLandingH =
      sample.params.landingHeight != null && Number.isFinite(sample.params.landingHeight)
        ? sample.params.landingHeight === rawH ? safeHeight : Math.max(sample.params.landingHeight, 0)
        : safeHeight;
    const merged: TeacherAssignmentConfig = {
      ...sample,
      instructions,
      physicsMode: sample.physicsMode ?? 'ideal',
      mountMode: currentMount,
      equipment: currentEquipment,
      limits: currentLimits,
      params: {
        ...sample.params,
        angle,
        speed: Math.min(sample.params.speed, bounds?.maxSpeed ?? Infinity),
        height: safeHeight,
        landingHeight: safeLandingH,
      },
    };
    setTargetInput(sample.targetCupDistanceM != null ? String(sample.targetCupDistanceM) : '');
    onApplyPresetActivity(merged);
    setStatusNotice(`Loaded activity: "${sample.title}"`);
  };

  const snapshot = (): TeacherAssignmentConfig => ({
    ...config, ...studentVariables, params: currentParams, equipment: currentEquipment, limits: currentLimits,
    mountMode: currentMount, physicsMode: currentPhysics, environment: currentEnvironment,
    chalkboardMode: config.chalkboardMode ?? currentBoardMode,
    chalkboardCustomImage: config.chalkboardCustomImage !== undefined ? config.chalkboardCustomImage : currentBoardImage,
  });

  const handleSaveLocally = () => {
    const payload = snapshot();
    localStorage.setItem('lab4all-config', JSON.stringify(payload));
    onUpdateConfig(payload);
    setStatusNotice('Assignment saved to browser localStorage.');
  };

  const handleLoadSaved = () => {
    try {
      const raw = localStorage.getItem('lab4all-config');
      if (!raw) {
        setStatusNotice('No saved assignment found in localStorage.');
        return;
      }
      const parsed = JSON.parse(raw) as TeacherAssignmentConfig;
      onApplyPresetActivity(parsed);
      setTargetInput(parsed.targetCupDistanceM != null ? String(parsed.targetCupDistanceM) : '');
      setStatusNotice('Saved assignment loaded from browser storage.');
    } catch {
      setStatusNotice('Could not load saved assignment file.');
    }
  };

  const handleExportJSON = () => {
    const payload = snapshot();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lab4all-assignment.json';
    a.click();
    URL.revokeObjectURL(url);
    setStatusNotice('Downloaded lab4all-assignment.json');
  };

  const solveFor = config.solveFor ?? (config.hideLaunchSpeed ? 'speed' : '');
  const levelAngleInvestigation = currentPhysics === 'ideal' &&
    Math.abs((currentParams.landingHeight ?? 0) - currentParams.height) < 1e-6 &&
    studentVariables.independentVariable === 'angle' && studentVariables.adjustable.angle &&
    experimentVariables.every(key => key === 'angle' || !studentVariables.adjustable[key]) && target == null;
  const sharePayload = () => JSON.stringify({
        t: config.title,
        q: config.question,
        i: config.instructions,
        iv: studentVariables.independentVariable,
        rt: config.requiredTrials,
        tc: target,
        adj: studentVariables.adjustable,
        st: config.showTheory,
        sf: solveFor && !studentVariables.adjustable[solveFor] ? solveFor : undefined,
        p: currentParams,
        eqId: currentEquipment.id,
        spec: writeAssignmentEquipment(currentEquipment),
        limits: currentLimits ?? currentEquipment.limits,
        env: currentEnvironment,
        mount: currentMount,
        physics: currentPhysics,
        cm: config.chalkboardMode ?? currentBoardMode,
        ci: config.chalkboardCustomImage !== undefined ? config.chalkboardCustomImage : currentBoardImage,
  });
  const studentLink = lastLink && !targetError && !fixedHeightError && lastLink.payload === sharePayload() ? lastLink.url : '';
  const notice = lastLink && !studentLink && /student link (copied|to copy)/i.test(statusNotice)
    ? 'Assignment changed. Copy a new student link.' : statusNotice;

  const handleCopyShareLink = async () => {
    if (targetError || fixedHeightError) return;
    try {
      const payload = sharePayload();
      const encoded = btoa(encodeURIComponent(payload));
      if (encoded.length > 60_000) {
        setLastLink(null);
        setStatusNotice('This assignment contains a large board image. Choose a smaller image or remove it before sharing.');
        return;
      }
      const shareUrl = `${window.location.origin}${window.location.pathname}#assignment=${encoded}`;
      setLastLink({ url: shareUrl, payload });
      try {
        if (!navigator.clipboard?.writeText) throw new Error();
        await navigator.clipboard.writeText(shareUrl);
        setStatusNotice('Student link copied.');
      } catch {
        setStatusNotice('Select the student link to copy it.');
      }
    } catch {
      setStatusNotice('Could not encode share link.');
    }
  };

  return h(
    'div',
    { className: 'overlay', onClick: onClose },
    h(
      'div',
      {
        ref: dialogRef,
        className: 'modal assignment-editor',
        style: { width: 'min(680px, 100%)' },
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'teacher-modal-title',
      },
      h(
        'button',
        { className: 'close', onClick: onClose, 'aria-label': 'Close' },
        h(IconClose, { size: 14 })
      ),
      h('h2', { id: 'teacher-modal-title', tabIndex: -1 }, 'Build an assignment'),
      h(
        'p',
        null,
        'Write the task, choose what students can change, and share the experiment.'
      ),

      h(
        'div',
        {
          style: {
            background: '#f3f7fb',
            border: '1px solid #d4e2f0',
            borderRadius: '6px',
            padding: '12px',
            marginBottom: '14px',
          },
        },
        h(
          'div',
          { style: { fontSize: '11px', fontWeight: 700, color: '#2d70b3', marginBottom: '8px' } },
          'Start from a sample'
        ),
        h(
          'div',
          { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
          ...Object.entries(SAMPLE_TEACHER_ACTIVITIES).map(([k, act]) =>
            h(
              'button',
              {
                key: k,
                type: 'button',
                onClick: () => handleLoadSample(k),
                style: {
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: '#ffffff',
                  border: '1px solid #b8cde0',
                  borderRadius: '4px',
                  color: '#234a70',
                },
              },
              act.title
            )
          )
        )
      ),

      h(
        'label',
        { className: 'field' },
        'Assignment title',
        h('input', {
          type: 'text',
          value: config.title,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
            onUpdateConfig({ ...config, title: e.target.value }),
          style: {
            display: 'block',
            width: '100%',
            marginTop: '6px',
            padding: '9px',
            border: '1px solid #dce7e2',
            borderRadius: '5px',
          },
        })
      ),

      h(
        'label',
        { className: 'field' },
        'Investigation question',
        h('textarea', {
          value: config.question,
          onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
            onUpdateConfig({ ...config, question: e.target.value }),
        })
      ),

      h(
        'label',
        { className: 'field' },
        'Student instructions',
        h('textarea', {
          value: config.instructions,
          onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
            onUpdateConfig({ ...config, instructions: e.target.value }),
          style: { minHeight: '70px' },
        })
      ),

      h(
        'div',
        { className: 'assignment-rules' },
        h(
          'label',
          { className: 'field', style: { margin: 0 } },
          'Variable to investigate',
          h(
            'select',
            {
              'aria-label': 'Variable to investigate',
              value: hasAdjustableVariable ? studentVariables.independentVariable : '',
              onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                const independentVariable = e.target.value as ExperimentVariable;
                onUpdateConfig({
                  ...config,
                  independentVariable,
                  adjustable: { ...config.adjustable, [independentVariable]: true },
                });
              },
            },
            !hasAdjustableVariable && h('option', { value: '', disabled: true }, 'Fixed settings'),
            h('option', { value: 'angle' }, 'Launch angle (θ)'),
            h('option', { value: 'speed', disabled: solveFor === 'speed' }, 'Initial speed (v₀)'),
            h('option', { value: 'height' }, 'Launch height (h₀)'),
            h('option', { value: 'landingHeight' }, 'Landing height'),
            h('option', { value: 'gravity', disabled: solveFor === 'gravity' }, 'Gravity (g)')
          )
        ),

        h(
          'label',
          { className: 'field', style: { margin: 0 } },
          'Required student trials',
          h('input', {
            type: 'number',
            min: '1',
            max: '20',
            value: config.requiredTrials,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
              onUpdateConfig({
                ...config,
                requiredTrials: Math.max(1, Math.min(20, Math.round(Number(e.target.value)) || 1)),
              }),
          })
        ),

        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '3px' } },
          h(
            'label',
            { className: 'field', style: { margin: 0 } },
            'Target distance (m, optional)',
            h('input', {
              type: 'number',
              min: '0.2',
              max: '10',
              step: '0.05',
              placeholder: 'e.g. 1.35',
              'aria-invalid': targetError,
              value: targetInput,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                const v = e.target.value;
                setTargetInput(v);
                onUpdateConfig({
                  ...config,
                  targetCupDistanceM: v.trim() === '' ? null : Number(v),
                });
              },
            })
          ),
          target !== null && h('small', { className: 'assignment-target-note', role: targetError ? 'alert' : undefined },
            targetError ? 'Enter a distance from 0.2 to 10 m.'
              : describeTarget(target, currentParams, studentVariables.adjustable, currentPhysics,
                currentEquipment, currentMount, currentLimits ?? currentEquipment.limits ?? null)),
          config.teacherNotes
            ? h(
                'div',
                {
                  style: {
                    padding: '8px 12px',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: '#166534',
                    marginTop: '6px',
                  },
                },
                h('b', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' } }, [
                  h(IconTeacher, { size: 14, key: 'ic', color: '#166534' }),
                  'Teacher notes'
                ]),
                config.teacherNotes
              )
            : null
        )
      ),

      h(
        'div',
        { className: 'field' },
        h('b', null, 'Students can change'),
        limitedAngles && h('small', { className: 'assignment-target-note' },
          'At this locked launch height, students can set angles from ' + fixedAngleRange.min + '° to ' + fixedAngleRange.max + '°.'),
        h(
          'div',
          { className: 'checks' },
          ...experimentVariables.map((key) =>
            h(
              'label',
              { key },
              h('input', {
                type: 'checkbox',
                checked: studentVariables.adjustable[key] === true,
                disabled: key === solveFor && !studentVariables.adjustable[key],
                onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                  onUpdateConfig({
                    ...config,
                    ...normalizeAssignmentVariables({ ...studentVariables.adjustable, [key]: e.target.checked },
                      studentVariables.independentVariable),
                  }),
              }),
              EXPERIMENT_VARIABLE_LABELS[key]
            )
          )
        )
      ),

      h(
        'label',
        { className: 'check', style: { display: 'block', marginBottom: '12px' } },
        h('input', {
          type: 'checkbox',
          checked: config.showTheory,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
            onUpdateConfig({ ...config, showTheory: e.target.checked }),
        }),
        ' Show predictions before launch'
      ),
      h('label', { className: 'field' }, 'Solve for',
        h('select', {
          value: solveFor && !studentVariables.adjustable[solveFor] ? solveFor : '',
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
            const variable = e.currentTarget.value as NonNullable<TeacherAssignmentConfig['solveFor']>;
            const adjustable = variable ? { ...studentVariables.adjustable, [variable]: false } : studentVariables.adjustable;
            onUpdateConfig({ ...config, ...normalizeAssignmentVariables(adjustable, studentVariables.independentVariable), solveFor: variable });
          },
        },
          h('option', { value: '' }, 'No hidden variable'),
          h('option', { value: 'speed' }, 'Launch speed (v₀)'),
          h('option', { value: 'gravity' }, 'Gravity (g)')
        )
      ),

      levelAngleInvestigation && h('section', { className: 'teacher-graph-reference', 'aria-label': 'Teacher graph reference' },
        h('h3', null, 'Teacher graph reference'),
        h('p', null, 'At equal launch and landing heights, t = 2v₀ sin(θ)/g. Substitute into R = v₀ cos(θ)t to get R = (v₀²/g) sin(2θ).'),
        h('p', null, 'For a straight line, use sin(2θ) on X and range R on Y. Plotting R against θ gives a curve.'),
        h('p', null, 'Expected slope m = v₀²/g ≈ ' + (currentParams.speed ** 2 / currentParams.gravity).toFixed(3) + ' m. ',
          solveFor === 'gravity' ? 'Find gravity with g = v₀²/m.' :
          solveFor === 'speed' ? 'Find launch speed with v₀ = √(mg).' : 'The intercept should be near zero.'),
      ),

      h(
        'details',
        { className: 'assignment-extra' },
        h('summary', { style: { marginBottom: '6px' } }, 'Chalkboard'),
        h(
          'div',
          { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          h(
            'button',
            {
              type: 'button',
              style: {
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '4px',
                border: '1px solid ' + ((config.chalkboardMode || 'default') === 'default' ? '#065f46' : '#cbd5e1'),
                background: (config.chalkboardMode || 'default') === 'default' ? '#065f46' : '#ffffff',
                color: (config.chalkboardMode || 'default') === 'default' ? '#ffffff' : '#334155',
                cursor: 'pointer',
              },
              onClick: () => onUpdateConfig({ ...config, chalkboardMode: 'default' }),
            },
            'Standard Kinematics Formulas'
          ),
          h(
            'button',
            {
              type: 'button',
              style: {
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '4px',
                border: '1px solid ' + (config.chalkboardMode === 'erased' ? '#b45309' : '#cbd5e1'),
                background: config.chalkboardMode === 'erased' ? '#b45309' : '#ffffff',
                color: config.chalkboardMode === 'erased' ? '#ffffff' : '#334155',
                cursor: 'pointer',
              },
              onClick: () => onUpdateConfig({ ...config, chalkboardMode: 'erased' }),
            },
            'Erase Board (Clean Slate)'
          ),
          h(
            'button',
            {
              type: 'button',
              style: {
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '4px',
                border: '1px solid ' + (config.chalkboardMode === 'custom_image' ? '#4338ca' : '#cbd5e1'),
                background: config.chalkboardMode === 'custom_image' ? '#4338ca' : '#ffffff',
                color: config.chalkboardMode === 'custom_image' ? '#ffffff' : '#334155',
                cursor: 'pointer',
              },
              onClick: () =>
                onUpdateConfig({
                  ...config,
                  chalkboardMode: 'custom_image',
                  chalkboardCustomImage: config.chalkboardCustomImage || SAMPLE_TEACHER_NOTE_IMAGES.inquiry,
                }),
            },
            'Custom Notes Picture / Diagram'
          )
        )
      ),

      h(
        'p',
        { className: 'modal-note' },
        `Current launch settings (θ = ${currentParams.angle}°, v₀ = ${currentParams.speed.toFixed(
          2
        )} m/s, h₀ = ${currentParams.height.toFixed(
          2
        )} m, g = ${currentParams.gravity.toFixed(2)} m/s²) and the active 3D apparatus (${
          currentEquipment.name
        }) are bundled when you save, export, or share this activity.`
      ),

      notice
        ? h(
            'p',
            {
              role: 'status',
              style: {
                background: '#e9f5ee',
                border: '1px solid #b7dec7',
                color: '#1f5e3b',
                padding: '8px 12px',
                borderRadius: '5px',
                fontSize: '12px',
                fontWeight: 600,
              },
            },
            notice
          )
        : null,

      fixedHeightError && h('p', { role: 'alert', className: 'assignment-target-note' },
        'Raise the launch height or unlock it before sharing.'),
      h('div', { className: 'modal-actions assignment-share-actions' },
        h('button', { type: 'button', className: 'play', onClick: handleCopyShareLink, disabled: targetError || fixedHeightError },
          'Copy student link', h(IconLink, { size: 13 })),
      ),
      h('details', { className: 'assignment-extra' },
        h('summary', null, 'Save, restore, or export'),
        h('div', { className: 'modal-actions' },
        h(
          'button',
          {
            type: 'button',
            className: 'play',
            onClick: () => {
              onToggleMode(mode === 'teacher' ? 'student' : 'teacher');
            },
          },
          mode === 'teacher' ? 'Use student controls here' : 'Unlock controls here'
        ),
        h('button', { type: 'button', onClick: onGenerateTrial }, 'Generate trial'),
        h('button', { type: 'button', onClick: handleSaveLocally }, 'Save locally'),
        h('button', { type: 'button', onClick: handleLoadSaved }, 'Load saved'),
        h('button', { type: 'button', onClick: handleExportJSON }, 'Export activity JSON'),
        h(
          'label',
          { className: 'file-button' },
          'Import activity JSON',
          h('input', {
            type: 'file',
            accept: 'application/json',
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              const file = e.target.files?.[0];
              if (!file) return;
              file.text().then((txt) => {
                try {
                  const parsed = JSON.parse(txt) as TeacherAssignmentConfig;
                  onApplyPresetActivity(parsed);
                  setStatusNotice('Imported activity configuration.');
                } catch {
                  setStatusNotice('Invalid activity JSON file.');
                }
              });
            },
          })
        ),
        )
      ),

      studentLink && h('div', { className: 'assignment-link' },
        h('label', null, 'Student link', h('input', { value: studentLink, readOnly: true, onFocus: (event: React.FocusEvent<HTMLInputElement>) => event.currentTarget.select() })),
        h('a', { href: studentLink, target: '_blank', rel: 'noopener' }, 'Open student view')
      )
    )
  );
};
