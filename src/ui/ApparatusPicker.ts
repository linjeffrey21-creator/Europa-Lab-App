import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { launcherAssetLoaders } from '../scene/launcherAssets.ts';
import { ARBOR_MINI_ID, PASCO_ME6800_ID, PASCO_MINI_ID, VERNIER_VPL_ID } from '../equipment/schema.ts';
import { AVAILABLE_CLASSROOM_APPARATUS_PRESETS, computeMinimumClearanceHeight } from '../equipment/schema.ts';
import type { ProjectileApparatusSpec } from '../equipment/schema.ts';
import { buildProjectileApparatusGroup } from '../scene/apparatus3d.ts';

const h = React.createElement;
const shortNames: Record<string, string> = {
  [ARBOR_MINI_ID]: 'Arbor Mini 94-1970',
  'boreal-fundamentals-8884857': 'Boreal Fundamentals',
  [PASCO_ME6800_ID]: 'PASCO ME-6800',
  [PASCO_MINI_ID]: 'PASCO Mini ME-6825B',
  'eisco-ph0343': 'Eisco Labs PH0343',
  'lab4all-precision-mk2': 'Precision Slotted MK2',
  'cpo-marble-launcher': 'CPO Curved Frame',
  [VERNIER_VPL_ID]: 'Vernier VPL',
  'heavy-frame-rotary-cannon': 'Dual-Column Dial Frame',
};
const previewCache = new WeakMap<ProjectileApparatusSpec, string>();

function renderThumbnail(renderer: THREE.WebGLRenderer, spec: ProjectileApparatusSpec) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f0f4f2');
  scene.add(new THREE.HemisphereLight('#ffffff', '#bccac4', 1.35));
  const light = new THREE.DirectionalLight('#ffffff', 2);
  light.position.set(2, 4, 3);
  scene.add(light);

  const angle = 35;
  const mountMode = spec.visual.mount_type === 'clamp' ? 'clamp' : 'stand';
  const model = buildProjectileApparatusGroup({
    spec,
    angleDeg: angle,
    projectileCenterY: computeMinimumClearanceHeight(spec, angle, mountMode) + (launcherAssetLoaders[spec.id] ? spec.dimensions.projectileDiameter / 2 : 0),
    mountMode,
    lightweight: false,
    previewMode: true,
  });
  scene.add(model);

  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  const worldBounds = new THREE.Box3();
  model.traverseVisible((object) => {
    const geometry = (object as THREE.Mesh).geometry;
    if (!geometry) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (geometry.boundingBox) {
      bounds.union(worldBounds.copy(geometry.boundingBox).applyMatrix4(object.matrixWorld));
    }
  });
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const span = Math.max(size.y, size.x / 1.6, size.z, 0.1) * 0.75;
  const camera = new THREE.OrthographicCamera(-1.6 * span, 1.6 * span, span, -span, 0.01, 20);
  camera.position.copy(center).add(new THREE.Vector3(1.5, 1.0, 4));
  camera.lookAt(center);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL();
}

export function ApparatusPicker({ equipment, specs, onSelect }: {
  equipment: ProjectileApparatusSpec;
  specs: React.ReactNode;
  onSelect: (preset: ProjectileApparatusSpec) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [images, setImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const failedAssets = new Set<string>();
      await Promise.all(Object.entries(launcherAssetLoaders).map(async ([id, load]) => {
        try {
          await load?.();
        } catch {
          failedAssets.add(id);
        }
      }));
      if (cancelled) return;
      let renderer: THREE.WebGLRenderer | undefined;
      const next: Record<string, string> = {};
      try {
        for (const preset of AVAILABLE_CLASSROOM_APPARATUS_PRESETS) {
          let image = previewCache.get(preset);
          if (!image) {
            if (!renderer) {
              renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
              renderer.setSize(384, 240);
              renderer.toneMapping = THREE.ACESFilmicToneMapping;
            }
            image = renderThumbnail(renderer, preset);
            if (!failedAssets.has(preset.id)) previewCache.set(preset, image);
          }
          next[preset.id] = image;
        }
      } catch {
        // The model chooser stays usable even if WebGL is unavailable.
      } finally {
        renderer?.dispose();
        renderer?.forceContextLoss();
        if (!cancelled) {
          setImages(next);
          setLoading(false);
        }
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open]);

  return h('div', { className: 'apparatus-picker' },
    h('div', { className: 'apparatus-picker-row' },
      h('button', {
        type: 'button',
        ref: trigger,
        className: 'apparatus-picker-trigger',
        'aria-label': 'Choose launcher model. Current model: ' + equipment.name,
        'aria-haspopup': 'dialog',
        'aria-controls': 'apparatus-gallery',
        'aria-expanded': open,
        onClick: () => {
          dialog.current?.showModal();
          setLoading(true);
          setOpen(true);
        },
      }, h('span', null, shortNames[equipment.id] || equipment.name), h('span', { 'aria-hidden': true }, '⌄')),
      h('button', {
        type: 'button',
        className: 'apparatus-info-button',
        'aria-label': 'Model specifications',
        'aria-expanded': infoOpen,
        'aria-controls': 'apparatus-specs',
        onClick: () => setInfoOpen((shown) => !shown),
      }, 'i')
    ),
    h('div', { id: 'apparatus-specs', className: 'apparatus-specs', hidden: !infoOpen }, specs),
    h('dialog', {
      ref: dialog,
      id: 'apparatus-gallery',
      className: 'apparatus-gallery',
      'aria-labelledby': 'apparatus-gallery-title',
      onClose: () => {
        setOpen(false);
        trigger.current?.focus();
      },
    },
      h('div', { className: 'apparatus-gallery-header' },
        h('h2', { id: 'apparatus-gallery-title' }, 'Choose a launcher'),
        h('button', { type: 'button', 'aria-label': 'Close model chooser', onClick: () => dialog.current?.close() }, '×')
      ),
      h('div', { className: 'apparatus-gallery-grid', 'aria-busy': loading },
        ...AVAILABLE_CLASSROOM_APPARATUS_PRESETS.map((preset) => h('button', {
          key: preset.id,
          type: 'button',
          className: 'apparatus-gallery-option',
          'aria-pressed': equipment.id === preset.id,
          onClick: () => {
            if (equipment.id !== preset.id) onSelect(preset);
            dialog.current?.close();
          },
        },
          images[preset.id]
            ? h('img', { src: images[preset.id], alt: '', width: 384, height: 240 })
            : h('span', { className: 'apparatus-gallery-placeholder', 'aria-hidden': true }, loading ? 'Rendering…' : '3D preview unavailable'),
          h('span', { className: 'apparatus-gallery-name' }, shortNames[preset.id] || preset.name)
        ))
      )
    )
  );
}
