import { DEFAULT_GEMINI_MODEL, FLASH_MODELS } from '../ai/geminiReconstruction.ts';
import React from 'react';
import { useDialogFocus } from './useDialogFocus.ts';
import type {
  DimensionKey,
  OperatingLimits,
  ProjectileApparatusSpec,
  ProjectileVisualConfiguration,
} from '../equipment/schema.ts';
import {
  AVAILABLE_CLASSROOM_APPARATUS_PRESETS,
  CLASSROOM_APPARATUS_PRESETS,
  DIMENSION_DEFINITIONS,
  validateApparatusDimensions,
  createApparatusFromVisual,
  updateConfirmedDimension,
  calibratePhotoDimensions,
} from '../equipment/schema.ts';
import type { EquipmentExtractionResult } from '../ai/extractor.ts';
import { analyzeEquipmentInput } from '../ai/extractor.ts';
import { ReconstructionPreviewCanvas } from '../scene/LabViewport.ts';
import {
  IconClose,
  IconCheck,
  IconTarget,
} from './icons.ts';
import { prepareEquipmentPhoto } from './equipmentPhoto.ts';

const h = React.createElement;
const { useState, useEffect, useRef } = React;

interface EquipmentModalProps {
  currentSpec: ProjectileApparatusSpec;
  currentLimits: OperatingLimits | null;
  initialOpenManualEditor: boolean;
  onApplyApparatus: (
    spec: ProjectileApparatusSpec,
    limits: OperatingLimits | null,
    extractionMeta: EquipmentExtractionResult | null
  ) => void;
  onClose: () => void;
}

const VISUAL_SELECT_FIELDS: Array<{
  key: keyof ProjectileVisualConfiguration;
  label: string;
  options: string[];
}> = [
  {
    key: 'guide_type',
    label: 'Launch guide shape',
    options: ['slotted_barrel', 'tube', 'open_channel', 'rectangular_housing', 'unknown'],
  },
  {
    key: 'base',
    label: 'Support structure style',
    options: ['trunnion_yoke', 'post', 'panel', 'frame', 'unknown'],
  },
  {
    key: 'foot_style',
    label: 'Freestanding base style',
    options: ['solid_plate', 'cross_feet', 'extruded_rail', 'unknown'],
  },
  {
    key: 'mount_type',
    label: 'Bench mounting method',
    options: ['foot', 'clamp', 'unknown'],
  },
  {
    key: 'scale_style',
    label: 'Angle indicator style',
    options: ['circular_dial', 'vernier_protract', 'printed_arc', 'housing_plumb', 'unknown'],
  },
  {
    key: 'tube_color',
    label: 'Launch guide finish color',
    options: ['silver', 'blue', 'black', 'red', 'brass', 'unknown'],
  },
  {
    key: 'base_color',
    label: 'Support & base color',
    options: ['black', 'silver', 'wood', 'white', 'blue_enamel', 'unknown'],
  },
  {
    key: 'tube_material',
    label: 'Guide surface material (PBR)',
    options: ['metal', 'stainless_steel', 'painted_metal', 'plastic', 'wood', 'unknown'],
  },
  {
    key: 'support_material',
    label: 'Support surface material (PBR)',
    options: ['cast_iron', 'metal', 'painted_metal', 'wood', 'plastic', 'unknown'],
  },
  {
    key: 'support_position',
    label: 'Pivot location along barrel',
    options: ['center', 'rear', 'front', 'unknown'],
  },
  {
    key: 'tube_proportion',
    label: 'Relative barrel proportion',
    options: ['medium', 'short', 'long', 'unknown'],
  },
];

const VISUAL_BOOLEAN_FIELDS: Array<{
  key: 'spring_visible' | 'trigger_visible' | 'angle_scale' | 'photogate_bracket';
  label: string;
}> = [
  { key: 'spring_visible', label: 'Visible helical spring & piston' },
  { key: 'trigger_visible', label: 'Visible cocking handle & sear trigger' },
  { key: 'angle_scale', label: 'Graduated angle protractor scale' },
  { key: 'photogate_bracket', label: 'Muzzle optical photogate bracket' },
];

export const SAMPLE_SPECIFICATION_SNIPPETS: Array<{ label: string; text: string; url?: string }> = [
  {
    label: 'Boreal Fundamentals (PRLN01)',
    text: 'Boreal Fundamentals of Physics Projectile Launcher, model PRLN01. Overall dimensions: 15.75 × 4 × 11.75 inches. It uses 19 mm balls, five spring positions, and a 0–90° angle scale.',
    url: 'https://www.boreal.com/ca/en/product/8884857/fundamentals-of-physics-projectile-launcher',
  },
  {
    label: 'Eisco Labs Precision Projectile Launcher (PH0343)',
    text: 'Eisco PH0343 Precision Projectile Launcher. 42 cm slotted brushed aluminum U-channel guide (50 mm channel width), visible dual compression springs with 3 cocking settings, cast aluminum vertical support with table clamp mount (36 x 18 cm), engraved 0 to 90 degrees circular protractor dial with plumb-bob line, 19 mm projectile sphere, max speed 5.5 m/s.',
    url: 'https://www.eiscolabs.com/products/ph0343',
  },
  {
    label: 'PASCO ME-6800 Clamp Housing (38 cm)',
    text: 'Compact classroom projectile launcher with 38 cm blue anodized rectangular housing, C-clamp bench mount, side plumb-bob angle scale (0 to 90 degrees), 3 speed settings, photogate bracket, and 25 mm projectile ball. Maximum range up to 2.5 m.',
    url: 'https://www.pasco.com/products/lab-apparatus/physics/mechanics/me-6800',
  },
];

export const EquipmentModal: React.FC<EquipmentModalProps> = ({
  currentSpec,
  currentLimits,
  initialOpenManualEditor,
  onApplyApparatus,
  onClose,
}) => {
  const category = 'projectile_motion_apparatus';
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, onClose);
  const [urlInput, setUrlInput] = useState<string>('');
  const [specText, setSpecText] = useState<string>('');
  const [primaryPhoto, setPrimaryPhoto] = useState<string>(() => {
    if (currentSpec.id === 'wooden-marble-ramp-launcher') {
      return 'assets/hardwood_marble_launcher.png';
    }
    return '';
  });
  const [extraPhotos, setExtraPhotos] = useState<string[]>([]);
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState<number | null>(null);

  const [extraction, setExtraction] = useState<EquipmentExtractionResult | null>(() => {
    if (currentSpec.id === 'wooden-marble-ramp-launcher') {
      return {
        equipment_type: 'projectile_motion_apparatus',
        matched_preset_id: 'wooden-marble-ramp-launcher',
        detected_vendor: 'Pitsco / Arbor Scientific',
        fetched_title: 'Hardwood Quadrant Marble Launcher',
        description:
          'Baltic birch quadrant launcher with 28 cm clear tube, spring plunger, degree arc, and tabletop resting feet.',
        visual: currentSpec.visual,
        dimension_candidates: {},
        confidence_score: 0.95,
        missing_information: [],
        components: [
          'Baltic birch quadrant',
          '28 cm clear barrel',
          'Plunger spring',
          'Locking wingnut',
          'Tabletop feet',
        ],
        notes: [],
        image_analysis: {
          detectedArchetype: 'wood_quadrant',
          archetypeName: 'Hardwood Quadrant Marble Launcher',
          confidence: 0.95,
          dominantTubeColor: 'silver',
          dominantBaseColor: 'wood',
          tubeColorHex: '#64748b',
          baseColorHex: '#d97706',
          guideType: 'tube',
          mountType: 'foot',
          scaleStyle: 'printed_arc',
          aspectRatio: 1.41,
        },
      };
    }
    return null;
  });
  const [draftSpec, setDraftSpec] = useState<ProjectileApparatusSpec>(() => ({
    ...currentSpec,
    visual: { ...currentSpec.visual },
    dimensions: { ...currentSpec.dimensions },
    dimensionStatus: { ...currentSpec.dimensionStatus },
    dimensionSources: { ...(currentSpec.dimensionSources || {}) },
  }));

  const [showManualEditor, setShowManualEditor] = useState<boolean>(initialOpenManualEditor);
  const [previewAngle, setPreviewAngle] = useState<number>(35);
  const [scaleDimension, setScaleDimension] = useState<DimensionKey>('barrelLength');
  const [scaleInput, setScaleInput] = useState('');
  const [previewView, setPreviewView] = useState<'orbit' | 'side' | 'end'>('orbit');
  const [scaleUnit, setScaleUnit] = useState<'mm' | 'cm' | 'm' | 'in'>('mm');
  const [scaleFeedback, setScaleFeedback] = useState<{ specId: string; message: string; error: boolean } | null>(null);
  const [applyLimitsCheck, setApplyLimitsCheck] = useState<boolean>(true);
  const [limitsDraft, setLimitsDraft] = useState<{
    minAngle: string;
    maxAngle: string;
    maxSpeed: string;
  }>({
    minAngle: currentLimits?.minAngle != null ? String(currentLimits.minAngle) : '',
    maxAngle: currentLimits?.maxAngle != null ? String(currentLimits.maxAngle) : '',
    maxSpeed: currentLimits?.maxSpeed != null ? String(currentLimits.maxSpeed) : '',
  });
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const photoPreparation = useRef(false);
  const [aiApiKey, setAiApiKey] = useState<string>('');
  const [aiModel, setAiModel] = useState(DEFAULT_GEMINI_MODEL);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('scroll_to_preview') === '1') {
        setTimeout(() => {
          const el = document.getElementById('manual-editor') || document.querySelector('.reconstruction');
          if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
        }, 500);
      }
    }
  }, []);

  const allPhotos = [
    ...(primaryPhoto ? [{ label: 'Primary reference photo', src: primaryPhoto }] : []),
    ...extraPhotos.map((src, i) => ({ label: `Reference photo ${i + 2}`, src })),
  ];

  const geometryReference = extraction?.geometry_reference_image;
  const reviewPhotos = [...allPhotos];
  let productPhotoNumber = 0;
  for (const src of [extraction?.fetched_image, ...(extraction?.alternate_product_photos ?? []), geometryReference]) {
    if (src && !reviewPhotos.some(photo => photo.src === src)) {
      reviewPhotos.push({ label: 'Product photo ' + ++productPhotoNumber, src });
    }
  }
  const tracedPhotoIdx = reviewPhotos.findIndex(photo => photo.src === geometryReference);
  const reviewPhotoIdx = selectedPhotoIdx !== null && selectedPhotoIdx < reviewPhotos.length
    ? selectedPhotoIdx : Math.max(0, tracedPhotoIdx);
  const reviewPhoto = reviewPhotos[reviewPhotoIdx];

  const analysisRequest = useRef(0);
  const showLatestResult = useRef(false);
  const moveTo = (id: string, selector?: string) => {
    const area = document.getElementById(id);
    if (area instanceof HTMLDetailsElement) area.open = true;
    area?.scrollIntoView({ block: 'start' });
    if (selector) area?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!showLatestResult.current || extraction?.equipment_type !== 'projectile_motion_apparatus') return;
    showLatestResult.current = false;
    moveTo('rebuild-result', 'h3');
  }, [extraction]);

  const handleAnalyzeSpecifications = async (
    overrideText?: string,
    overrideUrl?: string,
    overridePhoto?: string,
    overrideExtraPhotos?: string[]
  ) => {
    const request = ++analysisRequest.current;
    setSelectedPhotoIdx(null);
    setErrorMsg('');
    setExtraction(null);
    setShowManualEditor(false);
    setIsAnalyzing(true);
    try {
      const effectiveText = overrideText !== undefined ? overrideText : specText;
      const effectiveUrl = overrideUrl !== undefined ? overrideUrl : urlInput;
      const effectivePhoto = overridePhoto !== undefined ? overridePhoto : primaryPhoto;
      const parsed = await analyzeEquipmentInput({
        specText: effectiveText,
        category,
        urlInput: effectiveUrl,
        primaryPhoto: effectivePhoto,
        extraPhotos: overrideExtraPhotos ?? extraPhotos,
        aiApiKey,
        aiModel,
      });
      if (request !== analysisRequest.current) return;
      if (parsed.equipment_type === 'projectile_motion_apparatus') {
        showLatestResult.current = true;
        setExtraction(parsed);
      }

      if (parsed.equipment_type === 'projectile_motion_apparatus') {
        let nextSpec: ProjectileApparatusSpec;

        const hasReconstruction = parsed.analysis_mode === 'ai_vision_provider' || Boolean(parsed.geometry);
        const effectivePresetId = parsed.exact_catalog_match ? parsed.matched_preset_id : undefined;

        // If matched to a verified physical classroom preset (Boreal, Eisco, PASCO)
        if (effectivePresetId && CLASSROOM_APPARATUS_PRESETS[effectivePresetId]) {
          const matchedPreset = CLASSROOM_APPARATUS_PRESETS[effectivePresetId];
          nextSpec = {
            ...matchedPreset,
            name: parsed.fetched_title || matchedPreset.name,
            visual: parsed.exact_catalog_match ? { ...matchedPreset.visual } : { ...matchedPreset.visual, ...parsed.visual },
            dimensions: { ...matchedPreset.dimensions },
            dimensionStatus: { ...matchedPreset.dimensionStatus },
            dimensionSources: { ...(matchedPreset.dimensionSources || {}) },
          };
        } else {
          nextSpec = createApparatusFromVisual(
            parsed.visual,
            parsed.fetched_title
              ? parsed.fetched_title
              : effectiveUrl
              ? 'Imported Listing Apparatus'
              : effectiveText.trim()
              ? 'Custom launcher'
              : 'Photo-based launcher'
          );
        }

        if (hasReconstruction) nextSpec.reconstruction = parsed.geometry || {};

        for (const [k, cand] of Object.entries(parsed.dimension_candidates)) {
          if (cand) {
            nextSpec = updateConfirmedDimension(nextSpec, k as DimensionKey, cand.value_m, {
              kind: cand.source,
              quote: cand.quote,
              sourceUrl: effectiveUrl || undefined,
            });
          }
        }

        const observedWidthRatio = nextSpec.reconstruction?.guideWidthToLengthRatio;
        if (observedWidthRatio && nextSpec.dimensionStatus.barrelDiameter === 'estimated') {
          const photoDimensions = updateConfirmedDimension(nextSpec, 'barrelDiameter',
            Number((nextSpec.dimensions.barrelLength * observedWidthRatio).toFixed(6)), {
              kind: 'visual_estimate',
              quote: 'Estimated from the visible guide width and length in the source photo.',
              sourceUrl: effectiveUrl || undefined,
            });
          if (!validateApparatusDimensions(photoDimensions)) nextSpec = photoDimensions;
        }

        nextSpec.missingInformation = parsed.missing_information;
        nextSpec.uncertainties = parsed.uncertainty;
        if (parsed.photo_preset_match) {
          onApplyApparatus(nextSpec, nextSpec.limits ?? null, parsed);
          return;
        }
        setScaleInput('');
        setScaleFeedback(null);
        setDraftSpec(nextSpec);
        setLimitsDraft({
          minAngle:
            parsed.documented_limits.minAngle != null
              ? String(parsed.documented_limits.minAngle)
              : '',
          maxAngle:
            parsed.documented_limits.maxAngle != null
              ? String(parsed.documented_limits.maxAngle)
              : '',
          maxSpeed:
            parsed.documented_limits.maxSpeed != null
              ? String(parsed.documented_limits.maxSpeed)
              : '',
        });
        setShowManualEditor(true);
      } else {
        setErrorMsg(parsed.description);
      }
    } catch (err) {
      if (request !== analysisRequest.current) return;
      setErrorMsg(err instanceof Error ? err.message : 'Could not analyze equipment details.');
    } finally {
      if (request === analysisRequest.current) setIsAnalyzing(false);
    }
  };

  const handleLoadPreset = (presetId: string) => {
    const preset = CLASSROOM_APPARATUS_PRESETS[presetId];
    if (!preset) return;
    setErrorMsg('');
    if (presetId === 'cpo-marble-launcher') {
      setPrimaryPhoto('assets/hardwood_marble_launcher.png');
      setExtraction({
        equipment_type: 'projectile_motion_apparatus',
        matched_preset_id: 'cpo-marble-launcher',
        detected_vendor: 'CPO Science / School Specialty',
        fetched_title: 'CPO Science Curved Frame Marble Launcher',
        description:
          'Baltic birch curved quadrant frame (38 x 22 cm) with concentric guide slot, satin-silver slotted barrel with 5 spring compression settings, angled right support foot, and 19 mm marbles.',
        visual: preset.visual,
        dimension_candidates: {},
        confidence_score: 0.96,
        missing_information: [],
        components: [
          'Baltic birch curved frame',
          '28 cm slotted satin-silver barrel',
          'Internal spring with 5 speed notches',
          'Right support foot & bolt',
          'Tabletop resting feet',
        ],
        notes: [],
        image_analysis: {
          detectedArchetype: 'cpo_curved_frame',
          archetypeName: 'CPO Science Curved Frame Marble Launcher',
          confidence: 0.96,
          dominantTubeColor: 'silver',
          dominantBaseColor: 'wood',
          tubeColorHex: '#cbd5e1',
          baseColorHex: '#d97706',
          guideType: 'slotted_barrel',
          mountType: 'foot',
          scaleStyle: 'printed_arc',
          aspectRatio: 1.41,
        },
      });
    } else if (presetId === 'wooden-marble-ramp-launcher') {
      setPrimaryPhoto('assets/hardwood_marble_launcher.png');
      setExtraction({
        equipment_type: 'projectile_motion_apparatus',
        matched_preset_id: 'wooden-marble-ramp-launcher',
        detected_vendor: 'Pitsco / Arbor Scientific',
        fetched_title: 'Hardwood Quadrant Marble Launcher',
        description:
          'Baltic birch quadrant launcher with 28 cm clear tube, spring plunger, degree arc, and tabletop resting feet.',
        visual: preset.visual,
        dimension_candidates: {},
        confidence_score: 0.95,
        missing_information: [],
        components: [
          'Baltic birch quadrant',
          '28 cm clear barrel',
          'Plunger spring',
          'Locking wingnut',
          'Tabletop feet',
        ],
        notes: [],
        image_analysis: {
          detectedArchetype: 'wood_quadrant',
          archetypeName: 'Hardwood Quadrant Marble Launcher',
          confidence: 0.95,
          dominantTubeColor: 'silver',
          dominantBaseColor: 'wood',
          tubeColorHex: '#64748b',
          baseColorHex: '#d97706',
          guideType: 'tube',
          mountType: 'foot',
          scaleStyle: 'printed_arc',
          aspectRatio: 1.41,
        },
      });
    }
    setDraftSpec({
      ...preset,
      visual: { ...preset.visual },
      dimensions: { ...preset.dimensions },
      dimensionStatus: { ...preset.dimensionStatus },
      dimensionSources: { ...(preset.dimensionSources || {}) },
    });
    setLimitsDraft({
      minAngle: preset.limits?.minAngle != null ? String(preset.limits.minAngle) : '',
      maxAngle: preset.limits?.maxAngle != null ? String(preset.limits.maxAngle) : '',
      maxSpeed: preset.limits?.maxSpeed != null ? String(preset.limits.maxSpeed) : '',
    });
    setShowManualEditor(true);
  };

  const validationError = validateApparatusDimensions(draftSpec);
  const scaleChoices = DIMENSION_DEFINITIONS.filter(def =>
    draftSpec.dimensionStatus[def.key] === 'estimated' &&
    draftSpec.dimensionSources?.[def.key]?.kind === 'visual_estimate');
  const selectedScaleDimension = scaleChoices.find(def => def.key === scaleDimension) || scaleChoices[0];
  const scaleMessage = scaleFeedback?.specId === draftSpec.id ? scaleFeedback : null;
  const applyPhotoScale = () => {
    if (!selectedScaleDimension || !scaleInput.trim()) return;
    const unitMeters = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254 };
    const result = calibratePhotoDimensions(draftSpec, selectedScaleDimension.key, Number(scaleInput) * unitMeters[scaleUnit]);
    if ('error' in result) {
      setScaleFeedback({ specId: draftSpec.id, message: result.error, error: true });
      return;
    }
    setDraftSpec(result.spec);
    setScaleInput('');
    const count = result.scaledCount;
    setScaleFeedback({ specId: draftSpec.id,
      message: count ? `Measurement saved. Rescaled ${count} other estimate${count === 1 ? '' : 's'}.` : 'Measurement saved.',
      error: false });
  };
  const hasEstimatedDims = Object.values(draftSpec.dimensionStatus).includes('estimated');

  const parseLimitsDraft = (): OperatingLimits | null | undefined => {
    const parseNum = (s: string) => (s.trim() === '' ? null : Number(s));
    const minAngle = parseNum(limitsDraft.minAngle);
    const maxAngle = parseNum(limitsDraft.maxAngle);
    const maxSpeed = parseNum(limitsDraft.maxSpeed);
    if (minAngle === null && maxAngle === null && maxSpeed === null) return null;
    if (
      (minAngle !== null && (!Number.isFinite(minAngle) || minAngle < -45 || minAngle >= 90)) ||
      (maxAngle !== null && (!Number.isFinite(maxAngle) || maxAngle < -45 || maxAngle > 90)) ||
      (minAngle !== null && maxAngle !== null && minAngle >= maxAngle) ||
      (maxSpeed !== null && (!Number.isFinite(maxSpeed) || maxSpeed < 0.5 || maxSpeed > 20))
    ) {
      return undefined;
    }
    return { minAngle, maxAngle, maxSpeed };
  };

  const exactPresetActive = Boolean(extraction?.exact_catalog_match && draftSpec.id === extraction.matched_preset_id);
  const approximateDraft = !exactPresetActive && extraction?.analysis_mode !== 'ai_vision_provider' &&
    Boolean(extraction || hasEstimatedDims);
  const fallbackPhoto = approximateDraft && Boolean(extraction && reviewPhoto);
  const applyLabel = approximateDraft ? 'Use approximate model' : 'Use in lab';
  const parsedLimits = parseLimitsDraft();
  const canSubmit =
    (!extraction || extraction.equipment_type === 'projectile_motion_apparatus') &&
    !validationError &&
    !isAnalyzing && !preparingPhotos &&
    parsedLimits !== undefined;

  const addPhotos = async (files: File[]) => {
    if (!files.length || isAnalyzing || photoPreparation.current) return;
    const remaining = 4 - allPhotos.length;
    if (files.length > remaining) {
      setErrorMsg(remaining > 0 ? 'Choose up to ' + remaining + ' more photos.' : 'Clear the existing photos to use a new set.');
      return;
    }
    photoPreparation.current = true;
    setPreparingPhotos(true);
    setErrorMsg('');
    try {
      const prepared = await Promise.all(files.map(prepareEquipmentPhoto));
      const [primary, ...additional] = [...allPhotos.map(photo => photo.src), ...prepared];
      setPrimaryPhoto(primary);
      setExtraPhotos(additional);
      void handleAnalyzeSpecifications(specText, urlInput, primary, additional);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Could not read the photo.');
    } finally {
      photoPreparation.current = false;
      setPreparingPhotos(false);
    }
  };
  const handleAddPhotos = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    void addPhotos(files);
  };
  const clearPhotos = () => {
    setPrimaryPhoto('');
    setExtraPhotos([]);
    setSelectedPhotoIdx(null);
    setExtraction(null);
    setShowManualEditor(false);
    setErrorMsg('');
  };

  const confirmedDims = DIMENSION_DEFINITIONS.filter(
    (d) => draftSpec.dimensionStatus[d.key] === 'confirmed'
  );
  const estimatedDims = DIMENSION_DEFINITIONS.filter(
    (d) => draftSpec.dimensionStatus[d.key] !== 'confirmed'
  );

  return h(
    'div',
    {
      className: 'overlay',
      onClick: onClose,
      onPaste: (event: React.ClipboardEvent) => {
        const images = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'));
        if (images.length) {
          event.preventDefault();
          void addPhotos(images);
        }
      },
    },
    h(
      'div',
      {
        ref: dialogRef,
        className: 'modal equipment-import-modal',
        style: { width: 'min(780px, 100%)' },
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'equipment-modal-title',
      },
      h(
        'button',
        { className: 'close', onClick: onClose, 'aria-label': 'Close modal' },
        h(IconClose, { size: 14 })
      ),
      h('h2', { id: 'equipment-modal-title', tabIndex: -1 }, initialOpenManualEditor ? 'Edit launcher' : 'Import a launcher'),
      h('p', { className: 'rebuild-intro' }, 'Upload a photo or paste a product link. You can check the draft before placing it in the lab.'),
      h('fieldset', { id: 'rebuild-references', className: 'import-inputs rebuild-form', disabled: isAnalyzing || preparingPhotos },
        h('div', { className: 'rebuild-source-grid' },
          h('div', { className: 'rebuild-source' },
            h('label', { className: 'field' }, 'Upload photos',
              h('input', {
                type: 'file',
                accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif',
                multiple: true,
                onChange: handleAddPhotos,
              })),
            h('p', null, allPhotos.length ? allPhotos.length + ' of 4 photos added' : 'One photo to start. Add up to four views.'),
            allPhotos.length > 0 && h('button', { type: 'button', className: 'text-btn', onClick: clearPhotos }, 'Clear photos')
          ),
          h('div', { className: 'rebuild-source' },
            h('label', { className: 'field' }, 'Product page URL or catalog reference',
              h('input', {
                type: 'text', inputMode: 'url', value: urlInput, placeholder: 'Paste a product or photo link',
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => setUrlInput(event.currentTarget.value),
                onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
                  if (event.key === 'Enter' && urlInput.trim()) {
                    event.preventDefault();
                    void handleAnalyzeSpecifications();
                  }
                },
              })),
            h('p', null, 'A catalog match opens the existing model.')
          )
        ),
        h('details', { className: 'rebuild-extra' },
          h('summary', null, 'Specifications and settings'),
          h('label', { className: 'field' }, 'Known measurements or product notes',
            h('textarea', {
              id: 'spec-textarea', value: specText, rows: 3,
              onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setSpecText(event.currentTarget.value),
              placeholder: 'Example: guide length 31 cm, ball diameter 19 mm.',
            })),
          h('div', { className: 'rebuild-options' },
            ...SAMPLE_SPECIFICATION_SNIPPETS.map(sample => h('button', {
              key: sample.label, type: 'button', className: 'text-btn',
              onClick: () => {
                setSpecText(sample.text);
                setUrlInput(sample.url ?? '');
                setPrimaryPhoto('');
                setExtraPhotos([]);
                void handleAnalyzeSpecifications(sample.text, sample.url ?? '', '', []);
              },
            }, sample.label))
          ),
          h('details', { className: 'rebuild-extra' },
            h('summary', null, 'Gemini settings'),
            h('label', { className: 'field' }, 'Preferred Flash model', h('select', {
              value: aiModel,
              onChange: (event: React.ChangeEvent<HTMLSelectElement>) => setAiModel(event.currentTarget.value),
            }, ...FLASH_MODELS.map(model => h('option', { key: model, value: model },
              'Gemini ' + model.split('-')[1] + ' Flash'))))
          )
        ),
        h('label', { className: 'field' }, 'Gemini API key (optional)', h('input', {
          type: 'password', value: aiApiKey, autoComplete: 'off', disabled: isAnalyzing,
          placeholder: 'Use your own key for this import',
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => setAiApiKey(event.currentTarget.value),
        })),
        h('div', { className: 'rebuild-options' },
          h('button', {
            type: 'button', className: 'play',
            disabled: isAnalyzing || preparingPhotos || (!specText.trim() && !urlInput.trim() && !allPhotos.length),
            onClick: () => void handleAnalyzeSpecifications(),
          }, preparingPhotos ? 'Preparing photos…' : isAnalyzing ? 'Building model…' : extraction ? 'Rebuild model' : 'Build 3D model'),
          h('button', {
            type: 'button', className: 'text-btn',
            onClick: () => extraction ? moveTo('rebuild-result', 'h3') : setShowManualEditor(value => !value),
          }, extraction ? 'Review model' : showManualEditor ? 'Hide manual editor' : 'Open manual editor')
        )
      ),
      h('details', { className: 'rebuild-extra' },
        h('summary', null, 'Browse launcher presets'),
        h('div', { className: 'rebuild-options' },
          ...AVAILABLE_CLASSROOM_APPARATUS_PRESETS.map(preset => h('button', {
            key: preset.id, type: 'button', className: 'text-btn',
            onClick: () => handleLoadPreset(preset.id),
            disabled: isAnalyzing || preparingPhotos,
          }, preset.name))
        )
      ),
      errorMsg
        ? h('p', { role: 'alert', style: { color: '#a3342c', fontWeight: 700 } }, errorMsg)
        : null,
      extraction && extraction.equipment_type === 'projectile_motion_apparatus'
        ? h(
            'details',
            { className: 'rebuild-extra rebuild-evidence' },
            h('summary', null, 'Measurements and source details'),
            !exactPresetActive && h('p', { style: { margin: '6px 0 10px', fontSize: '12px' } }, extraction.description),
            h(
              'div',
              {
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: '10px',
                  fontSize: '11px',
                },
              },
              h(
                'div',
                {
                  style: {
                    background: '#ffffff',
                    border: '1px solid #d5e6de',
                    borderRadius: '5px',
                    padding: '10px',
                  },
                },
                h(
                  'b',
                  { style: { color: '#2b7a58', display: 'block', marginBottom: '6px' } },
                  `1. Confirmed Information (${confirmedDims.length}/5 traceable dims)`
                ),
                confirmedDims.length === 0
                  ? h(
                      'p',
                      { style: { margin: 0, fontSize: '11px', color: '#778' } },
                      'No exact numerical dimensions found in text. Please enter or confirm dimensions below.'
                    )
                  : confirmedDims.map((d) =>
                      h(
                        'div',
                        { key: d.key, style: { marginBottom: '4px', color: '#334' } },
                        '• ',
                        h('b', null, `${d.label}: `),
                        `${draftSpec.dimensions[d.key]} m `,
                        draftSpec.dimensionSources?.[d.key]?.quote
                          ? h(
                              'span',
                              { style: { color: '#667' } },
                              `(“${draftSpec.dimensionSources[d.key]?.quote}”)`
                            )
                          : null
                      )
                    ),
                extraction.components.length > 0
                  ? h(
                      'div',
                      { style: { marginTop: '6px', color: '#455' } },
                      h('b', null, 'Identified assemblies: '),
                      extraction.components.join(', ')
                    )
                  : null
              ),
              h(
                'div',
                {
                  style: {
                    background: '#ffffff',
                    border: '1px solid #e6dec5',
                    borderRadius: '5px',
                    padding: '10px',
                  },
                },
                h(
                  'b',
                  { style: { color: '#8a681b', display: 'block', marginBottom: '6px' } },
                  `2. Estimated Properties (${estimatedDims.length} approximate / default dims)`
                ),
                ...estimatedDims.map((d) =>
                  h(
                    'div',
                    { key: d.key, style: { marginBottom: '4px', color: '#554' } },
                    '• ',
                    h('b', null, `${d.label}: `),
                    `${draftSpec.dimensions[d.key]} m `,
                    draftSpec.dimensionSources?.[d.key]?.quote
                      ? h(
                          'span',
                          { style: { color: '#887' } },
                          `(approximate estimate · “${draftSpec.dimensionSources[d.key]?.quote}”)`
                        )
                      : h('span', { style: { color: '#887' } }, '(default visual estimate)')
                  )
                ),
                h(
                  'div',
                  { style: { marginTop: '6px', color: '#665' } },
                  'Surface finish: ',
                  h('b', null, draftSpec.visual.tube_color),
                  ` (${draftSpec.visual.tube_material}) on `,
                  h('b', null, draftSpec.visual.base_color),
                  ` ${draftSpec.visual.base.replace(/_/g, ' ')}`
                )
              ),
              h(
                'div',
                {
                  style: {
                    background: '#ffffff',
                    border: '1px solid #e6d2ce',
                    borderRadius: '5px',
                    padding: '10px',
                  },
                },
                h(
                  'b',
                  { style: { color: '#9c382f', display: 'block', marginBottom: '6px' } },
                  '3. Unverified / Missing Details'
                ),
                ...[...(draftSpec.uncertainties ?? extraction.uncertainty), ...(draftSpec.missingInformation ?? extraction.missing_information)].map((item, i) =>
                  h('div', { key: i, style: { marginBottom: '4px', color: '#544' } }, `• ${item}`)
                )
              )
            )
          )
        : null,
      (showManualEditor || extraction)
        ? h(
            'div',
            { id: 'manual-editor', className: 'reconstruction' },
            // Authentic Product Rig Match Banner
            !extraction?.exact_catalog_match && extraction?.matched_preset_id && CLASSROOM_APPARATUS_PRESETS[extraction.matched_preset_id]
              ? h(
                  'div',
                  {
                    style: {
                      background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)',
                      border: '1.5px solid #38bdf8',
                      borderRadius: '6px',
                      padding: '10px 14px',
                      marginBottom: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    },
                  },
                  h(
                    'div',
                    null,
                    h(
                      'div',
                      {
                        style: {
                          fontWeight: 700,
                          fontSize: '12px',
                          color: '#0369a1',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                        },
                      },
                      h(IconCheck, { size: 13, color: '#0369a1' }),
                      `Authentic Apparatus Match: ${CLASSROOM_APPARATUS_PRESETS[extraction.matched_preset_id].name}`
                    ),
                    h(
                      'div',
                      { style: { fontSize: '11px', color: '#475569', marginTop: '2px' } },
                      'A matching launcher is available in the equipment library.'
                    )
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => handleLoadPreset(extraction.matched_preset_id!),
                      style: {
                        padding: '6px 12px',
                        background: draftSpec.id === extraction.matched_preset_id ? '#0284c7' : '#ffffff',
                        color: draftSpec.id === extraction.matched_preset_id ? '#ffffff' : '#0284c7',
                        border: '1px solid #0284c7',
                        borderRadius: '4px',
                        fontWeight: 700,
                        fontSize: '11px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      },
                    },
                    draftSpec.id === extraction.matched_preset_id
                      ? h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } }, [
                          h(IconCheck, { size: 12 }),
                          'High-Fidelity Rig Active',
                        ])
                      : 'Switch to High-Fidelity Rig'
                  )
                )
              : null,
            h('section', { id: 'rebuild-result', className: 'modal-note' },
              h('h3', { tabIndex: -1 }, 'Review your model'),
              extraction?.vision_retry_at && extraction.vision_retry_at > Date.now() &&
                h('p', { role: 'status' }, 'Photo reconstruction has reached its request limit. Try again after ' +
                  new Date(extraction.vision_retry_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + '.'),
              h('p', null, exactPresetActive
                ? 'This reference matches a built-in launcher.'
                : fallbackPhoto
                  ? geometryReference
                    ? 'The photo supplied part of the geometry. Other shapes and sizes are approximate.'
                    : 'The photo is shown for comparison. This preview uses an approximate launcher shape.'
                  : approximateDraft
                    ? 'The preview uses any available specifications and estimates the remaining details.'
                    : 'Compare the draft with your reference. Unmeasured dimensions are estimates.'),
              h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
                h('button', { type: 'button', className: 'play', disabled: !canSubmit,
                  onClick: () => onApplyApparatus(draftSpec, applyLimitsCheck && parsedLimits ? parsedLimits : null, extraction),
                }, applyLabel),
                exactPresetActive && h('button', { type: 'button', onClick: () => {
                  setDraftSpec(previous => ({ ...previous, id: 'custom-edited', name: previous.name + ' (custom)' }));
                  moveTo('rebuild-dimensions');
                } }, 'Edit a copy'),
                fallbackPhoto && h('button', { type: 'button', disabled: isAnalyzing,
                  onClick: () => void handleAnalyzeSpecifications() }, 'Retry reconstruction'),
                !exactPresetActive && h('button', { type: 'button', disabled: isAnalyzing,
                  onClick: () => moveTo('rebuild-references', 'input[type=file][multiple]') }, 'Add another angle'),
                !exactPresetActive && draftSpec.reconstruction && selectedScaleDimension &&
                  h('button', { type: 'button', onClick: () => moveTo('rebuild-scale', 'input') }, 'Set scale'),
                !exactPresetActive && h('button', { type: 'button', onClick: () => moveTo('rebuild-dimensions') }, 'Edit dimensions'),
              )
            ),
            h(
              'div',
              { className: 'reference-pair' },
              reviewPhoto
                ? h(
                    'div',
                    { className: 'reference-image', style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                    h(
                      'div',
                      {
                        style: {
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '10px',
                          fontWeight: 700,
                          color: '#475569',
                          letterSpacing: '0.04em',
                        },
                      },
                      h('span', null, reviewPhoto.src === geometryReference ? 'Photo used for geometry' : 'Reference photo'),
                      reviewPhotos.length > 1
                        ? h(
                            'select',
                            {
                              'aria-label': 'Compare reference photos',
                              value: reviewPhotoIdx,
                              onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                                setSelectedPhotoIdx(Number(e.target.value)),
                              style: { fontSize: '10px', padding: '1px 4px' },
                            },
                            ...reviewPhotos.map((p, idx) =>
                              h('option', { key: idx, value: idx }, p.label + (idx === tracedPhotoIdx ? ' (used for geometry)' : ''))
                            )
                          )
                        : null
                    ),
                    h('img', {
                      src: reviewPhoto.src,
                      alt: 'Equipment reference photo',
                      style: { width: '100%', height: '220px', objectFit: 'contain' },
                    }),
                  )
                : null,
              h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                h(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#475569',
                      letterSpacing: '0.04em',
                    },
                  },
                  h('span', null, '3D preview'),
                  draftSpec.reconstruction ? h('select', {
                    'aria-label': 'Reconstruction view',
                    value: previewView,
                    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setPreviewView(e.target.value as typeof previewView),
                  }, h('option', { value: 'orbit' }, '3D view'), h('option', { value: 'side' }, 'Side view'),
                    h('option', { value: 'end' }, 'Muzzle view')) : null,
                  h('span', { style: { fontSize: '10px', color: '#64748b', fontWeight: 500 } }, 'Drag to rotate · Scroll to zoom')
                ),
                h(
                  'div',
                  {
                    className: 'reconstruction-canvas',
                    style: { height: '220px', borderRadius: '6px', overflow: 'hidden' },
                  },
                  validationError
                    ? h('p', { className: 'preview-unavailable', role: 'status' }, validationError)
                    : h(ReconstructionPreviewCanvas, { spec: draftSpec, previewAngle, view: draftSpec.reconstruction ? previewView : 'orbit' })
                )
              )
            ),
            h(
              'div',
              {
                style: {
                  margin: '12px 0 14px',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '10px 12px',
                },
              },
              h(
                'div',
                {
                  style: {
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#1e293b',
                    marginBottom: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '6px',
                  },
                },
                h('span', null, 'AUTHENTIC APPARATUS ARCHETYPES (1-CLICK HIGH-FIDELITY PRESET)'),
                h(
                  'span',
                  { style: { fontSize: '10px', color: '#64748b', fontWeight: 500 } },
                  'Instantly calibrate procedural 3D rig, materials & dimensions to verified classroom hardware'
                )
              ),
              h(
                'div',
                { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
                ...[
                  { id: 'pasco-me6800-style', label: 'PASCO ME-6800' },
                  { id: 'eisco-ph0343', label: 'Eisco Open U-Channel (Clamp)' },
                  { id: 'boreal-fundamentals-8884857', label: 'Boreal Slotted Tube (Stand)' },
                  { id: 'cpo-marble-launcher', label: 'CPO Curved Frame (Stand)' },
                  { id: 'heavy-frame-rotary-cannon', label: 'Vernier Dial Cannon (Stand)' },
                  { id: 'lab4all-precision-mk2', label: 'Lab4All Standard (Stand)' },
                ].map((arch) => {
                  const isActive = draftSpec.id === arch.id;
                  return h(
                    'button',
                    {
                      key: arch.id,
                      type: 'button',
                      onClick: () => handleLoadPreset(arch.id),
                      style: {
                        padding: '6px 10px',
                        fontSize: '11px',
                        fontWeight: isActive ? 700 : 500,
                        background: isActive ? '#0284c7' : '#ffffff',
                        color: isActive ? '#ffffff' : '#334155',
                        border: isActive ? '1px solid #0284c7' : '1px solid #cbd5e1',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      },
                    },
                    isActive ? h(IconCheck, { size: 12, color: '#ffffff' }) : null,
                    arch.label
                  );
                })
              )
            ),
            h(
              'label',
              { className: 'preview-angle' },
              'Preview inspection inclination angle ',
              h('input', {
                'aria-label': 'Preview angle in degrees',
                type: 'number',
                min: '0',
                max: '90',
                step: '1',
                value: previewAngle,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = Math.max(0, Math.min(90, Number(e.target.value) || 0));
                  setPreviewAngle(val);
                },
                style: {
                  width: '56px',
                  padding: '3px 6px',
                  marginLeft: '6px',
                  marginRight: '4px',
                  fontSize: '12px',
                  fontWeight: 700,
                  border: '1px solid #bfd2e3',
                  borderRadius: '4px',
                },
              }),
              h('span', null, '°'),
              h('input', {
                'aria-label': 'Preview angle',
                type: 'range',
                min: '0',
                max: '90',
                step: '1',
                value: previewAngle,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                  setPreviewAngle(Number(e.target.value)),
              })
            ),
            h(
              'h3',
              { id: 'rebuild-dimensions', style: { marginTop: '20px' } },
              draftSpec.reconstruction?.guideBoreM !== undefined && h('p', { className: 'setup-reference-note' },
                'Documented guide bore ' + Number((draftSpec.reconstruction.guideBoreM * 1000).toFixed(2)) + ' mm'),
              'Apparatus dimensions'
            ),
            draftSpec.reconstruction && (selectedScaleDimension || scaleMessage)
              ? h('details', { id: 'rebuild-scale', className: 'modal-note', style: { marginBottom: '12px' }, open: scaleMessage ? true : undefined },
                  h('summary', null, 'Adjust scale (optional)'),
                  selectedScaleDimension
                    ? h(React.Fragment, null,
                        h('b', null, 'Set the scale from one measurement'),
                        h('p', null, 'Measure a visible part, such as the length of the launch guide. The preview rescales the other dimensions estimated from the reference.'),
                        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'end' } },
                          h('label', { className: 'field' }, 'Part measured',
                            h('select', { value: selectedScaleDimension.key, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                              setScaleDimension(e.target.value as DimensionKey);
                              setScaleInput('');
                              setScaleFeedback(null);
                            } }, ...scaleChoices.map(def => h('option', { key: def.key, value: def.key }, def.label)))),
                          h('label', { className: 'field' }, 'Measurement',
                            h('input', { type: 'number', min: '0', step: 'any', inputMode: 'decimal', value: scaleInput,
                              onChange: (e: React.ChangeEvent<HTMLInputElement>) => setScaleInput(e.target.value),
                              onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                                if (e.key === 'Enter') { e.preventDefault(); applyPhotoScale(); }
                              } })),
                          h('label', { className: 'field' }, 'Unit',
                            h('select', { value: scaleUnit, onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                              setScaleUnit(e.target.value as typeof scaleUnit) },
                              ...['mm', 'cm', 'm', 'in'].map(unit => h('option', { key: unit, value: unit }, unit)))),
                          h('button', { type: 'button', onClick: applyPhotoScale, disabled: !scaleInput.trim() }, 'Apply scale')
                        ))
                    : null,
                  scaleMessage ? h('p', { role: scaleMessage.error ? 'alert' : 'status' }, scaleMessage.message) : null)
              : null,
            h(
              'div',
              {
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: '12px',
                },
              },
              ...DIMENSION_DEFINITIONS.map((def) => {
                const status = draftSpec.dimensionStatus[def.key];
                const src = draftSpec.dimensionSources?.[def.key];
                return h(
                  'label',
                  {
                    key: def.key,
                    className: 'field',
                    style: {
                      margin: 0,
                      padding: '10px',
                      border:
                        status === 'confirmed' ? '1px solid #a8d5be' : '1px solid #e2ddd0',
                      background: status === 'confirmed' ? '#f7fcf9' : '#fffdf9',
                      borderRadius: '5px',
                    },
                  },
                  h(
                    'div',
                    { style: { display: 'flex', justifyContent: 'space-between' } },
                    h('span', null, `${def.label} (${def.unit})`),
                    h(
                      'small',
                      {
                        style: {
                          display: 'inline',
                          margin: 0,
                          fontWeight: 700,
                          color: status === 'confirmed' ? '#257a54' : '#9c6e1e',
                        },
                      },
                      `● ${status === 'confirmed' ? 'confirmed' : 'estimated (approximate)'}`
                    )
                  ),
                  h('input', {
                    type: 'number',
                    min: def.min,
                    max: def.max,
                    step: def.step,
                    disabled: exactPresetActive,
                    value: draftSpec.dimensions[def.key],
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                      const raw = e.target.value;
                      if (raw === '') return;
                      setDraftSpec((prev) =>
                        updateConfirmedDimension(prev, def.key, Number(raw), {
                          kind: 'teacher_entered',
                        })
                      );
                    },
                  }),
                  h('small', { style: { fontSize: '10px', color: '#6b7c77' } }, def.description),
                  src
                    ? h(
                        'span',
                        { className: 'measurement-source' },
                        `Source: ${src.kind.replace(/_/g, ' ')}${src.quote ? ` · “${src.quote}”` : ''}`
                      )
                    : null
                );
              })
            ),
            validationError
              ? h(
                  'p',
                  { role: 'alert', style: { color: '#a3342c', fontWeight: 700, marginTop: '10px' } },
                  validationError
                )
              : null,
            h(
              'h3',
              { style: { marginTop: '22px' } },
              'Modular Assembly & Surface Material Configuration'
            ),
            h(
              'div',
              {
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: '10px',
                },
              },
              ...VISUAL_SELECT_FIELDS.map(({ key, label, options }) =>
                h(
                  'label',
                  { key, className: 'field', style: { margin: 0 } },
                  label,
                  h(
                    'select',
                    {
                      disabled: exactPresetActive,
                      value: String(draftSpec.visual[key] ?? 'unknown'),
                      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                        const val = e.target.value;
                        setDraftSpec((prev) => {
                          const nextVisual = {
                            ...prev.visual,
                            [key]: val,
                          } as ProjectileVisualConfiguration;
                          const nextBarrelLen =
                            key === 'tube_proportion' &&
                            prev.dimensionStatus.barrelLength === 'estimated'
                              ? createApparatusFromVisual(nextVisual).dimensions.barrelLength
                              : prev.dimensions.barrelLength;
                          return {
                            ...prev,
                            id: 'custom-edited',
                            visual: nextVisual,
                            dimensions: {
                              ...prev.dimensions,
                              barrelLength: nextBarrelLen,
                            },
                          };
                        });
                      },
                    },
                    ...options.map((opt) =>
                      h('option', { key: opt, value: opt }, opt.replace(/_/g, ' '))
                    )
                  )
                )
              ),
              ...VISUAL_BOOLEAN_FIELDS.map(({ key, label }) =>
                h(
                  'label',
                  { key, className: 'field', style: { margin: 0 } },
                  label,
                  h(
                    'select',
                    {
                      disabled: exactPresetActive,
                      value: String(draftSpec.visual[key] ?? null),
                      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                        const raw = e.target.value;
                        const boolVal = raw === 'null' ? null : raw === 'true';
                        setDraftSpec((prev) => ({
                          ...prev,
                          id: 'custom-edited',
                          visual: {
                            ...prev.visual,
                            [key]: boolVal,
                          },
                        }));
                      },
                    },
                    h('option', { value: 'true' }, 'Yes (Installed)'),
                    h('option', { value: 'false' }, 'No (Omitted)'),
                    h('option', { value: 'null' }, 'Unknown / Default')
                  )
                )
              )
            ),
            h('h3', { style: { marginTop: '20px' } }, 'Documented Operating Bounds (Optional)'),
            h(
              'div',
              { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' } },
              h(
                'label',
                { className: 'field', style: { margin: 0 } },
                'Minimum angle (°)',
                h('input', {
                  type: 'number',
                  min: '-45',
                  max: '89',
                  placeholder: '0',
                  value: limitsDraft.minAngle,
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                    setLimitsDraft((p) => ({ ...p, minAngle: e.target.value })),
                })
              ),
              h(
                'label',
                { className: 'field', style: { margin: 0 } },
                'Maximum angle (°)',
                h('input', {
                  type: 'number',
                  min: '-45',
                  max: '90',
                  placeholder: '90',
                  value: limitsDraft.maxAngle,
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                    setLimitsDraft((p) => ({ ...p, maxAngle: e.target.value })),
                })
              ),
              h(
                'label',
                { className: 'field', style: { margin: 0 } },
                'Maximum speed (m/s)',
                h('input', {
                  type: 'number',
                  min: '0.5',
                  max: '20',
                  step: '0.1',
                  placeholder: '6.0',
                  value: limitsDraft.maxSpeed,
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                    setLimitsDraft((p) => ({ ...p, maxSpeed: e.target.value })),
                })
              )
            ),
            parsedLimits === undefined
              ? h(
                  'p',
                  { role: 'alert', style: { color: '#a3342c', fontSize: '12px' } },
                  'Check operating bounds: angles must be between −45° and 90° (min < max) and max speed between 0.5 and 20 m/s.'
                )
              : null,
            h(
              'div',
              { style: { marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' } },
              parsedLimits
                ? h(
                    'label',
                    { className: 'check' },
                    h('input', {
                      type: 'checkbox',
                      checked: applyLimitsCheck,
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                        setApplyLimitsCheck(e.target.checked),
                    }),
                    ' Constrain experiment sliders to the documented operating limits above.'
                  )
                : null
            ),
            h(
              'div',
              { style: { marginTop: '16px', display: 'flex', gap: '10px', alignItems: 'center' } },
              h(
                'button',
                {
                  type: 'button',
                  className: 'play',
                  disabled: !canSubmit,
                  onClick: () => {
                    onApplyApparatus(
                      draftSpec,
                      applyLimitsCheck && parsedLimits ? parsedLimits : null,
                      extraction
                    );
                  },
                },
                approximateDraft ? 'Apply approximate model' : 'Apply to lab'
              ),
              h('button', { type: 'button', className: 'reset', onClick: onClose }, 'Cancel')
            )
          )
        : null
    )
  );
};
