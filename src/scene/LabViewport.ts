import React from 'react';
import { updateSavedChalkboardPreset } from '../ui/chalkboard-notes.ts';
import * as THREE from 'three';
import { loadBenchInstrumentProps } from './benchInstrumentProps.ts';
import { createPhotogate, findBeamCrossing } from './photogate.ts';
import { launcherAssetLoaders } from './launcherAssets.ts';
import type {
  LaunchParameters,
  PhysicsMode,
  ExperimentalEnvironment,
} from '../physics/projectile.ts';
import {
  calculateTheoreticalSummary,
  calculateExperimentalSummary,
  evaluateProjectileState,
  LANDING_TARGET_RADIUS_M,
  sampleTrajectory,
  calculateProjectileMass,
  calculateAirDensity,
} from '../physics/projectile.ts';
import type { ProjectileApparatusSpec } from '../equipment/schema.ts';
import {
  computeApparatusKinematicsPose,
  VERNIER_VPL_ID,
  computeMinimumClearanceHeight,
} from '../equipment/schema.ts';
import { buildProjectileApparatusGroup } from './apparatus3d.ts';
import { CLAMP_LAUNCH_AXIS_Z, LAB_BENCH_DEPTH, LAB_BENCH_THICKNESS } from '../equipment/schema.ts';
import {
  createBrushedMetalTexture,
  createPhenolicBenchTexture,
  createBenchRoughnessTexture,
  createOakApronTexture,
  createStoolWoodSeatTexture,
  createPowderCoatSteelTexture,
  createLandingMatGridTexture,
} from './materials.ts';

const h = React.createElement;
const { useEffect, useMemo, useRef, useState } = React;

function useLauncherAsset(equipmentId: string) {
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const ready = loadedId === equipmentId;
  useEffect(() => {
    const load = launcherAssetLoaders[equipmentId];
    if (!load || ready) return;
    let active = true;
    load().then(() => {
      if (active) setLoadedId(equipmentId);
    }).catch(() => {
      // Keep the procedural launcher available if the asset cannot be loaded.
    });
    return () => { active = false; };
  }, [equipmentId, ready]);
  return ready;
}

export type CameraViewMode = 'experiment' | 'close' | 'side' | 'top' | 'free';
export type LockedCameraPose = { position: THREE.Vector3; quaternion: THREE.Quaternion };

function fitExperimentOrbit(
  camera: THREE.PerspectiveCamera,
  theta: number, phi: number, halfWidth: number, halfHeight: number
): number {
  const back = new THREE.Vector3(Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta));
  const right = new THREE.Vector3(0, 1, 0).cross(back).normalize();
  const up = back.clone().cross(right);
  const vertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.72;
  const horizontal = vertical * camera.aspect;
  let radius = 1.05;
  const corner = new THREE.Vector3();
  for (const x of [-halfWidth, halfWidth]) {
    for (const y of [-halfHeight, halfHeight]) {
      for (const z of [-0.16, 0.16]) {
        corner.set(x, y, z);
        const depth = corner.dot(back);
        radius = Math.max(radius, depth + Math.abs(corner.dot(right)) / horizontal,
          depth + Math.abs(corner.dot(up)) / vertical);
      }
    }
  }
  return radius;
}

export interface BenchRulerLayout {
  left: number;
  right: number;
  extent: number;
  step: number;
  ticks: Array<{ x: number; distance: number; major: boolean }>;
}

export function computeBenchRulerLayout(
  muzzleX: number,
  rangeM: number,
  mountMode: 'stand' | 'clamp' = 'stand'
): BenchRulerLayout {
  // Both mounting styles need a continuous worktop under the launcher.
  const left = mountMode === 'clamp' ? Math.min(-0.85, muzzleX - 0.22) : -0.85;
  const minimumExtent = 4.2;
  const additionalReach = Math.max(0, muzzleX + rangeM - left + 0.75 - minimumExtent);
  const extent = minimumExtent + Math.ceil(additionalReach * 2) / 2;
  const right = left + extent;
  const usable = Math.max(0, right - 0.2 - muzzleX);
  const rawStep = Math.max(0.1, usable / 32);
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const count = Math.floor((usable + 1e-9) / step);
  const ticks = Array.from({ length: count + 1 }, (_, idx) => ({
    x: muzzleX + idx * step,
    distance: idx * step,
    major: idx % 5 === 0,
  }));
  return { left, right, extent, step, ticks };
}

function createNumberBadgeTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 128, 64);
    ctx.font = 'bold 28px Arial, sans-serif';
    ctx.fillStyle = '#2d3b3e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 32);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createForceArrowMesh(
  dir: THREE.Vector3,
  origin: THREE.Vector3,
  length: number,
  colorHex: string,
  thickness: number = 0.0075
): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(origin);

  const normDir = dir.clone().normalize();
  if (normDir.lengthSq() < 0.0001) return group;

  const headLen = Math.min(0.065, Math.max(0.035, length * 0.28));
  const headWidth = Math.max(0.024, thickness * 3.4);
  const shaftLen = Math.max(0.01, length - headLen);

  const color = new THREE.Color(colorHex);
  const mat = new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false,
  });

  // Shaft cylinder
  const shaftGeo = new THREE.CylinderGeometry(thickness, thickness, shaftLen, 16);
  const shaft = new THREE.Mesh(shaftGeo, mat);
  shaft.position.y = shaftLen / 2;

  // Cone head
  const headGeo = new THREE.ConeGeometry(headWidth, headLen, 20);
  const head = new THREE.Mesh(headGeo, mat);
  head.position.y = shaftLen + headLen / 2;

  const arrow = new THREE.Group();
  arrow.add(shaft);
  arrow.add(head);

  // Robust orientation from (0, 1, 0) to normDir (avoiding collinear -Y singularity)
  if (normDir.y > 0.9999) {
    // Pointing straight up
  } else if (normDir.y < -0.9999) {
    // Pointing straight down (Gravity)
    arrow.rotation.z = Math.PI;
  } else {
    const up = new THREE.Vector3(0, 1, 0);
    arrow.quaternion.setFromUnitVectors(up, normDir);
  }

  group.renderOrder = 998;
  group.add(arrow);
  return group;
}

const forceLabelColors = { g: '#1d4ed8', d: '#b63b0c', net: '#6d28d9' };
const forceLabelMaterials = new Map<keyof typeof forceLabelColors, THREE.SpriteMaterial>();

function createForceLabelSprite(subscript: keyof typeof forceLabelColors): THREE.Sprite {
  let material = forceLabelMaterials.get(subscript);
  if (!material) {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 112;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = forceLabelColors[subscript];
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 5;
      ctx.lineJoin = 'round';
      ctx.textBaseline = 'alphabetic';
      ctx.font = 'italic 700 66px system-ui, sans-serif';
      const mainWidth = ctx.measureText('F').width;
      ctx.font = 'italic 650 39px system-ui, sans-serif';
      const left = (canvas.width - mainWidth - ctx.measureText(subscript).width) / 2;
      ctx.font = 'italic 700 66px system-ui, sans-serif';
      ctx.strokeText('F', left, 73);
      ctx.fillText('F', left, 73);
      ctx.font = 'italic 650 39px system-ui, sans-serif';
      ctx.strokeText(subscript, left + mainWidth, 90);
      ctx.fillText(subscript, left + mainWidth, 90);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    });
    forceLabelMaterials.set(subscript, material);
  }
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.17, 0.119, 1);
  sprite.renderOrder = 4;
  return sprite;
}

function buildElevatedLandingStand(
  landX: number,
  landY: number,
  zMount: number,
  isSymmetric: boolean,
  lightweight: boolean,
  target = false
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(landX, 0, zMount);

  const baseMat = new THREE.MeshStandardMaterial({
    color: '#2a353d',
    metalness: 0.5,
    roughness: 0.6,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: '#d4dde1',
    metalness: 0.9,
    roughness: 0.15,
  });
  const padMat = new THREE.MeshStandardMaterial({
    color: isSymmetric ? '#1e40af' : '#334155',
    metalness: 0.35,
    roughness: 0.45,
  });

  // 1. Heavy Tabletop Base Plate
  const basePlate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.016, 0.18), baseMat);
  basePlate.position.y = 0.008;
  basePlate.castShadow = !lightweight;
  basePlate.receiveShadow = !lightweight;
  g.add(basePlate);

  // 4 Rubber Leveling Feet
  for (const rx of [-0.07, 0.07]) {
    for (const rz of [-0.07, 0.07]) {
      const foot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.006, 12),
        new THREE.MeshBasicMaterial({ color: '#1c2226' })
      );
      foot.position.set(rx, 0.003, rz);
      g.add(foot);
    }
  }

  // 2. Vertical Support Column / Elevation Rod with Locking Clamp Collar
  const rodBase = 0.016;
  const rodH = landY - 0.012 - rodBase;
  if (rodH > 0) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, rodH, 20), chromeMat);
    rod.name = 'landing-support-rod';
    rod.position.y = rodBase + rodH / 2;
    rod.castShadow = !lightweight;
    g.add(rod);
  }

  // Knurled thumb screw lock collar
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.025, 20), baseMat);
  collar.position.y = Math.max(0.03, landY - 0.02);
  g.add(collar);

  const thumbScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.035, 12), chromeMat);
  thumbScrew.rotation.z = Math.PI / 2;
  thumbScrew.position.set(0.015, Math.max(0.03, landY - 0.02), 0);
  g.add(thumbScrew);

  // 3. Elevated Receptor Stage Platform (Adjusted exactly to landY)
  const stage = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.012, 0.18), padMat);
  stage.position.y = landY - 0.006;
  stage.castShadow = !lightweight;
  stage.receiveShadow = !lightweight;
  g.add(stage);

  // Target impact ring on the stage surface
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.045, target ? LANDING_TARGET_RADIUS_M : 0.07, 32),
    new THREE.MeshBasicMaterial({ color: isSymmetric ? '#38bdf8' : '#f59e0b', side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = landY + 0.001;
  g.add(ring);

  const bullseye = new THREE.Mesh(
    new THREE.CircleGeometry(0.018, 24),
    new THREE.MeshBasicMaterial({ color: '#ef4444', side: THREE.DoubleSide })
  );
  bullseye.rotation.x = -Math.PI / 2;
  bullseye.position.y = landY + 0.0015;
  g.add(bullseye);

  // A shallow front plate provides a full-width, padded surface for the height label.
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 512;
  labelCanvas.height = 96;
  const labelContext = labelCanvas.getContext('2d');
  if (labelContext) {
    const text = isSymmetric ? `LEVEL ${landY.toFixed(2)} m` : `h = ${landY.toFixed(2)} m`;
    labelContext.fillStyle = isSymmetric ? '#1e40af' : '#334155';
    labelContext.fillRect(0, 0, labelCanvas.width, labelCanvas.height);
    labelContext.font = 'bold 59px Arial, sans-serif';
    const fontSize = Math.min(59, 59 * (labelCanvas.width - 48) / labelContext.measureText(text).width);
    labelContext.font = `bold ${fontSize}px Arial, sans-serif`;
    labelContext.fillStyle = '#ffffff';
    labelContext.textAlign = 'center';
    labelContext.textBaseline = 'middle';
    labelContext.fillText(text, labelCanvas.width / 2, labelCanvas.height / 2);
  }
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.03),
    new THREE.MeshBasicMaterial({ map: labelTex, toneMapped: false })
  );
  plaque.name = 'landing-height-label';
  plaque.position.set(0, landY - 0.018, 0.091);
  g.add(plaque);

  // Vertical Plumb drop line down to the bench metric ruler
  const plumbGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, landY, 0),
    new THREE.Vector3(0, 0.015, 0),
  ]);
  const plumbLine = new THREE.LineSegments(
    plumbGeo,
    new THREE.LineBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.7 })
  );
  g.add(plumbLine);

  return g;
}

function createChalkboardTexture(
  mode: 'default' | 'erased' | 'custom_image' = 'default',
  customImageSrc?: string | null,
  onUpdate?: () => void
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;

  if (ctx) {
    // 1. Deep matte slate-green chalkboard surface with authentic chalk dust vignette
    const grad = ctx.createRadialGradient(1024, 512, 160, 1024, 512, 1240);
    grad.addColorStop(0, '#233b32');
    grad.addColorStop(1, '#182b24');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2048, 1024);

    // Natural slate grain & erased chalk smudges
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let i = 0; i < 28; i++) {
      const sx = (i * 137) % 1800;
      const sy = (i * 89) % 860;
      ctx.fillRect(sx, sy, 260, 90);
    }

    // Eraser wipe streaks across board
    ctx.fillStyle = 'rgba(240, 248, 240, 0.016)';
    for (let s = 0; s < 12; s++) {
      ctx.beginPath();
      ctx.ellipse(300 + s * 130, 200 + (s % 3) * 220, 240, 60, -0.15, 0, Math.PI * 2);
      ctx.fill();
    }

    if (mode === 'erased') {
      // Clean freshly erased slate-green chalkboard
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
      ctx.font = 'italic bold 28px "Caveat", "Segoe Print", "Architects Daughter", Arial, sans-serif';
      ctx.fillText('✎ Clean Chalkboard — Ready for Notes & Diagrams', 70, 960);
      ctx.restore();
      tex.needsUpdate = true;
      return tex;
    }

    if (mode === 'custom_image' && customImageSrc) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Clear with base green chalkboard
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 2048, 1024);

        // Subtle chalk smudges behind image
        ctx.fillStyle = 'rgba(255,255,255,0.02)';
        for (let i = 0; i < 18; i++) {
          ctx.fillRect((i * 137) % 1800, (i * 89) % 860, 240, 80);
        }

        // Draw custom notes/image contained within chalkboard frame
        const padX = 60;
        const padY = 50;
        const maxW = 2048 - padX * 2;
        const maxH = 1024 - padY * 2;

        const scale = Math.min(maxW / img.width, maxH / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        const dx = (2048 - dw) / 2;
        const dy = (1024 - dh) / 2;

        // Outer note backing drop shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(dx - 6, dy - 6, dw + 12, dh + 12);

        // Draw the custom note image
        ctx.drawImage(img, dx, dy, dw, dh);

        // Subtle tape / pushpin mounts on top corners
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        for (const cxPin of [dx + 18, dx + dw - 18]) {
          for (const cyPin of [dy + 16, dy + dh - 16]) {
            ctx.beginPath();
            ctx.arc(cxPin, cyPin, 6, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        tex.needsUpdate = true;
        if (onUpdate) onUpdate();
      };
      img.onerror = () => {
        ctx.fillStyle = '#fca5a5';
        ctx.font = 'bold 36px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚠️ Could not load custom chalkboard image URL', 1024, 480);
        ctx.font = '24px Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('Please check the image URL or upload an image file.', 1024, 530);
        tex.needsUpdate = true;
        if (onUpdate) onUpdate();
      };
      img.src = updateSavedChalkboardPreset(customImageSrc) ?? customImageSrc;
      tex.needsUpdate = true;
      return tex;
    }

    // mode === 'default' (Original Unit 2 Kinematics Formulas & Diagram in high-DPI 2048x1024)
    // Left Column: Kinematics Formulas in crisp white & yellow chalk (strictly x < 1080)
    ctx.fillStyle = '#f2e8a0';
    ctx.font = 'bold 54px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.fillText('UNIT 2: 2D PROJECTILE MOTION', 88, 116);

    ctx.strokeStyle = 'rgba(242, 232, 160, 0.55)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(88, 148);
    ctx.lineTo(1040, 148);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.font = 'bold 48px "IBM Plex Mono", monospace';
    ctx.fillText('x(t) = v₀ cos(θ) t', 88, 268);
    ctx.fillText('y(t) = h₀ + v₀ sin(θ) t − ½gt²', 88, 380);
    ctx.fillText('vₓ(t) = v₀ cos(θ)', 88, 492);
    ctx.fillText('vᵧ(t) = v₀ sin(θ) − gt', 88, 604);

    ctx.fillStyle = '#a8e4c0';
    ctx.font = 'bold 42px Arial, sans-serif';
    ctx.fillText('Slope of Line:  m = Δy / Δx = (y₂ − y₁) / (x₂ − x₁)', 88, 756);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.font = '38px Arial, sans-serif';
    ctx.fillText('Const. Acceleration: g = 9.81 m/s² downward', 88, 848);

    // Vertical divider line separating text (left) and diagram (right: x = 1110..1960)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(1110, 84);
    ctx.lineTo(1110, 930);
    ctx.stroke();

    // Right Column: Chalk Trajectory Diagram
    ctx.fillStyle = '#f2e8a0';
    ctx.font = 'bold 44px Arial, sans-serif';
    ctx.fillText('Trajectory Profile y(x)', 1310, 128);

    // Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(1240, 240);
    ctx.lineTo(1240, 820);
    ctx.lineTo(1920, 820);
    ctx.stroke();

    // Launch platform step at h0
    ctx.strokeStyle = '#9ecae1';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(1190, 580);
    ctx.lineTo(1290, 580);
    ctx.stroke();

    // Parabolic curve
    ctx.strokeStyle = '#f7a072';
    ctx.lineWidth = 8;
    ctx.setLineDash([18, 14]);
    ctx.beginPath();
    ctx.moveTo(1240, 580);
    ctx.quadraticCurveTo(1510, 220, 1870, 820);
    ctx.stroke();
    ctx.setLineDash([]);

    // Velocity vector arrow at launch
    ctx.strokeStyle = '#a8e4c0';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(1240, 580);
    ctx.lineTo(1390, 430);
    ctx.stroke();

    ctx.fillStyle = '#a8e4c0';
    ctx.font = 'bold 38px Arial, sans-serif';
    ctx.fillText('v₀', 1404, 424);
    ctx.fillStyle = '#9ecae1';
    ctx.fillText('h₀', 1172, 710);
    ctx.fillStyle = '#f7a072';
    ctx.fillText('Apex', 1490, 336);
    ctx.fillText('Range R', 1510, 888);
  }
  tex.needsUpdate = true;
  return tex;
}

function createPeriodicTablePosterTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 340;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#faf8f2';
    ctx.fillRect(0, 0, 512, 340);
    ctx.strokeStyle = '#334';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 500, 328);

    ctx.fillStyle = '#1d3557';
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PERIODIC TABLE OF THE ELEMENTS', 256, 36);

    const cols = 18;
    const rows = 7;
    const cellW = 24;
    const cellH = 28;
    const startX = 40;
    const startY = 56;

    const palette = ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#457b9d', '#9b5de5'];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === 0 && c > 0 && c < 17) continue;
        if ((r === 1 || r === 2) && c > 1 && c < 12) continue;
        const x = startX + c * cellW;
        const y = startY + r * cellH;
        const color =
          c === 0
            ? palette[0]
            : c === 1
            ? palette[1]
            : c >= 12 && c < 17
            ? palette[3]
            : c === 17
            ? palette[5]
            : palette[2];
        ctx.fillStyle = color;
        ctx.fillRect(x, y, cellW - 2, cellH - 2);
      }
    }
    // Lanthanides / Actinides block
    for (let r = 0; r < 2; r++) {
      for (let c = 2; c < 16; c++) {
        const x = startX + c * cellW;
        const y = startY + (rows + 0.4 + r) * cellH;
        ctx.fillStyle = palette[4];
        ctx.fillRect(x, y, cellW - 2, cellH - 3);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createWallClockTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f8f9fa';
    ctx.beginPath();
    ctx.arc(128, 128, 118, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#2b2d42';
    ctx.stroke();

    for (let i = 0; i < 12; i++) {
      const ang = (i * Math.PI) / 6;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(ang) * 92, 128 + Math.sin(ang) * 92);
      ctx.lineTo(128 + Math.cos(ang) * 106, 128 + Math.sin(ang) * 106);
      ctx.lineWidth = i % 3 === 0 ? 5 : 2.5;
      ctx.strokeStyle = '#222';
      ctx.stroke();
    }
    // Hour & Minute hands (10:10)
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(84, 96);
    ctx.stroke();

    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(176, 86);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createWallBrickTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.CanvasTexture({} as any);
  const canvas = document.createElement('canvas');
  const w = 1024;
  const h = 512;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Base warm institutional off-white / light bone tone
    ctx.fillStyle = '#eae6dc';
    ctx.fillRect(0, 0, w, h);

    // 4 rows of running bond cinder blocks
    const rows = 4;
    const rowH = h / rows; // 128px per course
    const blockW = 256;    // 4 blocks per row

    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      const xOffset = (r % 2 === 1) ? blockW / 2 : 0;
      for (let x = -blockW; x < w + blockW; x += blockW) {
        const bx = x + xOffset;

        // Subtle per-block masonry tone variation
        const hash = Math.sin(r * 31.7 + bx * 0.05) * 10000;
        const toneShift = (hash - Math.floor(hash) - 0.5) * 12;
        const rVal = Math.min(255, Math.max(0, 235 + Math.round(toneShift)));
        const gVal = Math.min(255, Math.max(0, 231 + Math.round(toneShift * 0.9)));
        const bVal = Math.min(255, Math.max(0, 222 + Math.round(toneShift * 0.7)));

        ctx.fillStyle = `rgb(${rVal}, ${gVal}, ${bVal})`;
        // Block face with 4px mortar margins
        ctx.fillRect(bx + 3, y + 3, blockW - 6, rowH - 6);

        // Tactile block face paint stippling & concrete aggregate texture
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx + 3, y + 3, blockW - 6, rowH - 6);
        ctx.clip();
        for (let i = 0; i < 95; i++) {
          const sx = bx + 4 + Math.random() * (blockW - 8);
          const sy = y + 4 + Math.random() * (rowH - 8);
          const alpha = 0.03 + Math.random() * 0.06;
          const isDark = Math.random() > 0.5;
          ctx.fillStyle = isDark ? `rgba(90, 85, 75, ${alpha})` : `rgba(255, 255, 255, ${alpha * 1.6})`;
          ctx.fillRect(sx, sy, 2 + Math.random() * 3, 2 + Math.random() * 3);
        }
        ctx.restore();

        // Mortar beveled edge highlights (light on bottom & right)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(bx + 3, y + rowH - 3.5);
        ctx.lineTo(bx + blockW - 3.5, y + rowH - 3.5);
        ctx.lineTo(bx + blockW - 3.5, y + 3);
        ctx.stroke();

        // Mortar recessed shadow (dark on top & left)
        ctx.strokeStyle = 'rgba(80, 75, 65, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(bx + blockW - 3, y + 3.5);
        ctx.lineTo(bx + 3.5, y + 3.5);
        ctx.lineTo(bx + 3.5, y + rowH - 3);
        ctx.stroke();
      }
    }

    // Mortar channels (filled with textured sand mortar)
    ctx.fillStyle = '#a19c8f';
    ctx.fillRect(0, 0, w, 3);
    for (let r = 1; r < rows; r++) {
      ctx.fillRect(0, r * rowH - 2, w, 4);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 5);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function createWallBumpTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.CanvasTexture({} as any);
  const canvas = document.createElement('canvas');
  const w = 1024;
  const h = 512;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Base neutral height (gray 160)
    ctx.fillStyle = '#a0a0a0';
    ctx.fillRect(0, 0, w, h);

    const rows = 4;
    const rowH = h / rows;
    const blockW = 256;

    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      const xOffset = (r % 2 === 1) ? blockW / 2 : 0;
      for (let x = -blockW; x < w + blockW; x += blockW) {
        const bx = x + xOffset;

        // Block face raised height (gray 200)
        ctx.fillStyle = '#c8c8c8';
        ctx.fillRect(bx + 3, y + 3, blockW - 6, rowH - 6);

        // Stipple grain in bump map for tangible surface roughness
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx + 3, y + 3, blockW - 6, rowH - 6);
        ctx.clip();
        for (let i = 0; i < 110; i++) {
          const sx = bx + 3 + Math.random() * (blockW - 6);
          const sy = y + 3 + Math.random() * (rowH - 6);
          const val = Math.random() > 0.5 ? 228 : 172;
          ctx.fillStyle = `rgb(${val}, ${val}, ${val})`;
          ctx.fillRect(sx, sy, 2, 2);
        }
        ctx.restore();

        // Deep recessed mortar channels (dark gray 50)
        ctx.strokeStyle = '#323232';
        ctx.lineWidth = 3;
        ctx.strokeRect(bx + 1.5, y + 1.5, blockW - 3, rowH - 3);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 5);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function createWainscotTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.CanvasTexture({} as any);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Warm architectural ivory/parchment enamel finish
    ctx.fillStyle = '#d8d2c4';
    ctx.fillRect(0, 0, 512, 512);

    // Vertical beadboard slats every 32px
    const slatW = 32;
    for (let x = 0; x < 512; x += slatW) {
      // Subtle gradient on each tongue-and-groove plank
      const grad = ctx.createLinearGradient(x, 0, x + slatW, 0);
      grad.addColorStop(0, '#ccc6b7');
      grad.addColorStop(0.12, '#dfd9cd');
      grad.addColorStop(0.85, '#d6d0c2');
      grad.addColorStop(1, '#c2bcb0');
      ctx.fillStyle = grad;
      ctx.fillRect(x + 1, 0, slatW - 2, 512);

      // Deep groove line
      ctx.fillStyle = '#8f897c';
      ctx.fillRect(x, 0, 1.5, 512);

      // Fine beaded highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(x + 2, 0, 1, 512);

      // Fine vertical wood pores
      ctx.fillStyle = 'rgba(100, 90, 80, 0.04)';
      for (let p = 0; p < 18; p++) {
        const px = x + 3 + Math.random() * (slatW - 6);
        const py = Math.random() * 500;
        ctx.fillRect(px, py, 1, 8 + Math.random() * 24);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 2);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function createWainscotBumpTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.CanvasTexture({} as any);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#b0b0b0';
    ctx.fillRect(0, 0, 512, 512);
    const slatW = 32;
    for (let x = 0; x < 512; x += slatW) {
      // Raised plank surface with rounded bead edge
      ctx.fillStyle = '#d0d0d0';
      ctx.fillRect(x + 2, 0, slatW - 4, 512);
      // Recessed groove
      ctx.fillStyle = '#404040';
      ctx.fillRect(x, 0, 2, 512);
      // Highlight side of bead
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(x + 2, 0, 1, 512);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 2);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function createFloorTileTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#d4d8d2';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#cbd0ca';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillRect(128, 128, 128, 128);
    // Subtle speckled terrazzo vinyl tile flecks
    ctx.fillStyle = 'rgba(90,100,95,0.14)';
    for (let i = 0; i < 90; i++) {
      ctx.fillRect((i * 73) % 254, (i * 41) % 254, 3, 3);
    }
    ctx.strokeStyle = '#babfb8';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(0, 0, 128, 128);
    ctx.strokeRect(128, 0, 128, 128);
    ctx.strokeRect(0, 128, 128, 128);
    ctx.strokeRect(128, 128, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 10);
  tex.needsUpdate = true;
  return tex;
}

function createSafetyPosterTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 360);

    // Hazard yellow header bar
    ctx.fillStyle = '#facc15';
    ctx.fillRect(0, 0, 512, 70);
    ctx.fillStyle = '#000000';
    ctx.font = '900 36px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ CAUTION ⚠', 256, 48);

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 24px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.fillText('PROJECTILE FLIGHT ZONE', 256, 115);

    ctx.font = '600 18px Arial, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText('• EYE PROTECTION MANDATORY BEYOND BENCH PERIMETER', 256, 165);
    ctx.fillText('• CLEAR TRAJECTORY LANDING PATH BEFORE LAUNCH', 256, 205);
    ctx.fillText('• VERIFY BARREL TRUNNION CLAMP BEFORE FIRING', 256, 245);

    // Striped safety border at bottom
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#facc15' : '#000000';
      ctx.beginPath();
      ctx.moveTo(i * 32, 320);
      ctx.lineTo(i * 32 + 24, 320);
      ctx.lineTo(i * 32 + 10, 360);
      ctx.lineTo(i * 32 - 14, 360);
      ctx.fill();
    }

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 504, 352);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function buildFramedPortrait(
  imagePath: string,
  personName: string,
  dates: string,
  formula: string,
  subtext: string,
  width: number = 0.58,
  height: number = 0.78,
  frameColor: string = '#2d1c11'
): THREE.Group {
  const group = new THREE.Group();

  const frameBorder = 0.048;
  const frameDepth = 0.038;
  const outerW = width + frameBorder * 2;
  const outerH = height + frameBorder * 2;

  // 1. Heavy Antiqued Walnut Outer Frame
  const frameMesh = new THREE.Mesh(
    new THREE.BoxGeometry(outerW, outerH, frameDepth),
    new THREE.MeshStandardMaterial({
      color: frameColor,
      roughness: 0.42,
      metalness: 0.12,
    })
  );
  frameMesh.castShadow = true;
  group.add(frameMesh);

  // 2. Gilded Gold Ornate Inner Bevel Lip
  const goldLip = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.016, height + 0.016, frameDepth + 0.005),
    new THREE.MeshStandardMaterial({
      color: '#d4af37',
      roughness: 0.32,
      metalness: 0.88,
    })
  );
  group.add(goldLip);

  // 3. Archival Gallery Mat Board (warm cream linen)
  const matBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({
      color: '#fdfbf7',
      roughness: 0.85,
    })
  );
  matBoard.position.z = frameDepth / 2 + 0.003;
  group.add(matBoard);

  // 4. Authentic Historical Portrait Photograph
  const photoW = width - 0.08;
  const photoH = height - 0.15;
  const texLoader = new THREE.TextureLoader();
  const photoTex = texLoader.load(imagePath);
  photoTex.colorSpace = THREE.SRGBColorSpace;
  photoTex.generateMipmaps = true;

  const photoMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(photoW, photoH),
    new THREE.MeshStandardMaterial({
      color: '#f8f6f0',
      map: photoTex,
      roughness: 0.28,
      metalness: 0.04,
    })
  );
  photoMesh.position.set(0, 0.042, frameDepth / 2 + 0.006);
  group.add(photoMesh);

  // 5. Museum Glazing Glass with Subtle Specular Sheen
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.14,
      roughness: 0.04,
      metalness: 0.95,
    })
  );
  glass.position.z = frameDepth / 2 + 0.009;
  group.add(glass);

  // 6. Engraved Brushed Brass Commemorative Plaque
  const plaqueCanvas = document.createElement('canvas');
  plaqueCanvas.width = 512;
  plaqueCanvas.height = 160;
  const pCtx = plaqueCanvas.getContext('2d');
  if (pCtx) {
    const pGrad = pCtx.createLinearGradient(0, 0, 512, 160);
    pGrad.addColorStop(0, '#caa338');
    pGrad.addColorStop(0.3, '#fef08a');
    pGrad.addColorStop(0.7, '#dfba4a');
    pGrad.addColorStop(1, '#9b7418');
    pCtx.fillStyle = pGrad;
    pCtx.fillRect(0, 0, 512, 160);

    pCtx.strokeStyle = '#5a3f0e';
    pCtx.lineWidth = 6;
    pCtx.strokeRect(5, 5, 502, 150);

    // Simulated corner brass mounting screws
    pCtx.fillStyle = '#453008';
    for (const [cx, cy] of [
      [18, 18],
      [494, 18],
      [18, 142],
      [494, 142],
    ]) {
      pCtx.beginPath();
      pCtx.arc(cx, cy, 5, 0, Math.PI * 2);
      pCtx.fill();
    }

    pCtx.fillStyle = '#1c1917';
    pCtx.font = 'bold 36px "Plus Jakarta Sans", serif, Arial';
    pCtx.textAlign = 'center';
    pCtx.fillText(personName.toUpperCase(), 256, 46);

    pCtx.font = '600 24px "IBM Plex Mono", monospace';
    pCtx.fillStyle = '#3f2e0c';
    pCtx.fillText(dates, 256, 82);

    pCtx.font = 'italic bold 23px "IBM Plex Mono", monospace';
    pCtx.fillStyle = '#0f172a';
    pCtx.fillText(formula, 256, 116);

    pCtx.font = '500 19px "Plus Jakarta Sans", sans-serif';
    pCtx.fillStyle = '#4b3810';
    pCtx.fillText(subtext, 256, 144);
  }
  const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
  plaqueTex.needsUpdate = true;
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(photoW * 0.94, 0.084),
    new THREE.MeshStandardMaterial({
      map: plaqueTex,
      metalness: 0.85,
      roughness: 0.28,
    })
  );
  plaque.position.set(0, -height / 2 + 0.052, frameDepth / 2 + 0.007);
  group.add(plaque);

  return group;
}

function buildFluorescentTroffer(width: number = 1.35, depth: number = 0.42): THREE.Group {
  const group = new THREE.Group();

  const trayMat = new THREE.MeshStandardMaterial({
    color: '#e2e8f0',
    roughness: 0.35,
    metalness: 0.4,
  });
  const tray = new THREE.Mesh(new THREE.BoxGeometry(width, 0.075, depth), trayMat);
  group.add(tray);

  const tubeMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: '#fffbf0',
    emissiveIntensity: 0.95,
    roughness: 0.2,
  });
  for (const zOff of [-depth * 0.24, depth * 0.24]) {
    const tubePanel = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.08, 0.015, depth * 0.38),
      tubeMat
    );
    tubePanel.position.set(0, -0.04, zOff);
    group.add(tubePanel);
  }

  const cableMat = new THREE.MeshStandardMaterial({ color: '#71717a', metalness: 0.9, roughness: 0.2 });
  for (const xOff of [-width * 0.42, width * 0.42]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 1.2, 8), cableMat);
    cable.position.set(xOff, 0.6, 0);
    group.add(cable);
  }

  return group;
}

function createOakWoodTexture(
  width: number = 512,
  height: number = 512,
  grainDirection: 'vertical' | 'horizontal' = 'horizontal',
  darkness: number = 1.0
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // 1. Rich Honey Oak Stain Base
    const baseGrad = ctx.createLinearGradient(0, 0, width, height);
    if (darkness >= 1.2) {
      baseGrad.addColorStop(0, '#784824');
      baseGrad.addColorStop(0.3, '#8c552c');
      baseGrad.addColorStop(0.7, '#6b3e1d');
      baseGrad.addColorStop(1, '#5a3215');
    } else {
      baseGrad.addColorStop(0, '#b8824f');
      baseGrad.addColorStop(0.25, '#c9955d');
      baseGrad.addColorStop(0.5, '#ab7745');
      baseGrad.addColorStop(0.75, '#be8a54');
      baseGrad.addColorStop(1, '#9e6a39');
    }
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Parallel Undulating Wood Grain Fibers
    const isVert = grainDirection === 'vertical';
    const mainLen = isVert ? height : width;
    const crossLen = isVert ? width : height;

    for (let i = 0; i < 420; i++) {
      const crossPos = (i * 2.5 + Math.sin(i * 0.19) * 14) % crossLen;
      const alpha = 0.04 + (Math.sin(i * 0.37) * 0.5 + 0.5) * 0.09;
      const isDark = i % 3 !== 0;
      ctx.strokeStyle = isDark
        ? `rgba(50, 26, 10, ${alpha})`
        : `rgba(245, 210, 160, ${alpha * 0.75})`;
      ctx.lineWidth = 1 + (i % 2) * 1.2;

      ctx.beginPath();
      const waveAmp = 4 + (i % 5) * 2.8;
      const waveFreq = 0.016 + (i % 3) * 0.009;
      for (let s = 0; s <= mainLen; s += 16) {
        const offset =
          Math.sin(s * waveFreq + i) * waveAmp +
          Math.cos(s * waveFreq * 0.5) * (waveAmp * 0.5);
        const x = isVert ? crossPos + offset : s;
        const y = isVert ? s : crossPos + offset;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // 3. Flat-Sawn Cathedral Arches (Growth Rings)
    for (let c = 0; c < 3; c++) {
      const centerPos = (c + 1) * (crossLen / 4) + (c % 2 === 0 ? 20 : -20);
      for (let r = 0; r < 7; r++) {
        const ringSpan = 16 + r * 15;
        ctx.strokeStyle = `rgba(45, 20, 8, ${0.05 + (7 - r) * 0.009})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let s = 0; s <= mainLen; s += 20) {
          const archT = (s - mainLen * 0.45) / (mainLen * 0.38);
          const archW = Math.max(0, 1 - archT * archT) * ringSpan;
          const x = isVert ? centerPos + archW : s;
          const y = isVert ? s : centerPos + archW;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    // 4. Subtle Oak Pores & Ray Flecks
    ctx.fillStyle = 'rgba(40, 18, 6, 0.13)';
    for (let p = 0; p < 280; p++) {
      const px = (p * 83) % width;
      const py = (p * 59) % height;
      const pw = isVert ? 1.5 : 5;
      const ph = isVert ? 5 : 1.5;
      ctx.fillRect(px, py, pw, ph);
    }

    // 5. Satin Finish Varnish Sheen
    const varnish = ctx.createLinearGradient(0, 0, 0, height);
    varnish.addColorStop(0, 'rgba(255, 230, 170, 0.07)');
    varnish.addColorStop(0.5, 'rgba(0, 0, 0, 0.03)');
    varnish.addColorStop(1, 'rgba(35, 18, 5, 0.08)');
    ctx.fillStyle = varnish;
    ctx.fillRect(0, 0, width, height);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function createBookCoverTexture(
  title: string,
  author: string,
  baseColorHex: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = baseColorHex;
    ctx.fillRect(0, 0, 128, 512);

    // Leather stippling
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    for (let i = 0; i < 200; i++) {
      ctx.fillRect((i * 37) % 126, (i * 71) % 510, 2, 2);
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    for (let i = 0; i < 150; i++) {
      ctx.fillRect((i * 59) % 126, (i * 83) % 510, 2, 2);
    }

    // Gold embossed horizontal spine cords
    const bandYPositions = [35, 95, 415, 475];
    for (const by of bandYPositions) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(6, by - 2, 116, 10);
      const gGrad = ctx.createLinearGradient(10, 0, 118, 0);
      gGrad.addColorStop(0, '#caa338');
      gGrad.addColorStop(0.5, '#fef08a');
      gGrad.addColorStop(1, '#b48a1a');
      ctx.fillStyle = gGrad;
      ctx.fillRect(10, by, 108, 6);
    }

    // Gold Title & Author Text rotated vertically along spine
    ctx.save();
    ctx.translate(64, 255);
    ctx.rotate(-Math.PI / 2);

    const titleGrad = ctx.createLinearGradient(-120, 0, 120, 0);
    titleGrad.addColorStop(0, '#eab308');
    titleGrad.addColorStop(0.5, '#fef9c3');
    titleGrad.addColorStop(1, '#ca8a04');
    ctx.fillStyle = titleGrad;

    ctx.font = 'bold 24px "Plus Jakarta Sans", serif, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title.toUpperCase(), 0, -8);

    ctx.font = '600 16px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#fef08a';
    ctx.fillText(author.toUpperCase(), 0, 16);

    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createBeadboardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#7a4e28';
    ctx.fillRect(0, 0, 256, 256);

    for (let x = 0; x < 256; x += 32) {
      ctx.fillStyle = 'rgba(25, 12, 4, 0.45)';
      ctx.fillRect(x, 0, 3, 256);
      ctx.fillStyle = 'rgba(255, 220, 160, 0.22)';
      ctx.fillRect(x + 3, 0, 2, 256);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.needsUpdate = true;
  return tex;
}

function createAcadiaWindowSillPlateTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 100;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 512, 100);
    grad.addColorStop(0, '#caa338');
    grad.addColorStop(0.3, '#fef08a');
    grad.addColorStop(0.7, '#dfba4a');
    grad.addColorStop(1, '#9b7418');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 100);

    ctx.strokeStyle = '#5a3f0e';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 504, 92);

    ctx.fillStyle = '#1c1917';
    ctx.font = 'bold 30px "Plus Jakarta Sans", serif, Arial';
    ctx.textAlign = 'center';
    const maxTextWidth = canvas.width - 48;
    ctx.fillText('ACADIA NATIONAL PARK, MAINE', 256, 42, maxTextWidth);

    ctx.font = '600 16px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#3f2e0c';
    ctx.fillText('Jordan Pond & The Bubbles · 44.3386° N, 68.2533° W', 256, 74, maxTextWidth);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function buildRealisticClassroomEnvironment(
  benchCenterX: number,
  benchExtent: number,
  lightweight: boolean,
  chalkboardMode: 'default' | 'erased' | 'custom_image' = 'default',
  chalkboardCustomImage?: string | null,
  onChalkboardUpdate?: () => void
): THREE.Group {
  const roomGroup = new THREE.Group();
  const floorY = -0.92;
  const backWallZ = -2.45;

  // Architectural Layout Coordinates (carefully computed so zero walls or furniture overlap or penetrate)
  const cbWidth = 2.85;
  const cbHeight = 1.25;
  const cbX = benchCenterX - 0.35;
  const cbY = 1.02;

  const newtonX = cbX - cbWidth / 2 - 0.46;
  const newtonY = 1.15;

  const diracX = cbX + cbWidth / 2 + 0.46;
  const diracY = 1.15;

  const posterX = newtonX - 0.58 / 2 - 0.62;
  const posterY = 1.05;

  const cabWidth = 1.35;
  const cabHeight = 2.15;
  const cabDepth = 0.42;
  const cabX = diracX + 0.58 / 2 + 0.85;
  const cabLeft = cabX - cabWidth / 2;
  const cabRight = cabX + cabWidth / 2;

  // Architectural Room Limits (clean 90° miter corner; left wall starts at backWallZ, back wall starts at leftWallX)
  const leftWallX = Math.min(-3.6, posterX - 0.53 - 0.75);
  const roomRightX = Math.max(benchCenterX + benchExtent / 2 + 3.2, cabRight + 2.0);
  const backWallWidth = roomRightX - leftWallX;
  const leftWallDepth = 12.0;
  const frontZ = backWallZ + leftWallDepth;
  const wallTop = floorY + 5.5;
  const windowCenterY = 1.20;
  const windowCenterZ = -0.45;
  const winW = 1.90;
  const winH = 1.38;
  const windowLowZ = windowCenterZ - winW / 2;
  const windowHighZ = windowCenterZ + winW / 2;
  const windowSillY = windowCenterY - winH / 2;
  const windowHeadY = windowCenterY + winH / 2;
  roomGroup.userData.freeCameraBounds = new THREE.Box3(
    new THREE.Vector3(leftWallX + 0.14, floorY + 0.14, backWallZ + 0.14),
    new THREE.Vector3(roomRightX - 0.14, wallTop - 0.14, frontZ - 0.14)
  );

  // 1. Tiled Science Classroom Floor (fits room boundary seamlessly)
  const floorMat = new THREE.MeshStandardMaterial({
    map: lightweight ? null : createFloorTileTexture(),
    color: '#d4d8d2',
    roughness: 0.72,
    metalness: 0.05,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(backWallWidth + 2.0, leftWallDepth + 4.0), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(leftWallX + backWallWidth / 2, floorY, backWallZ + leftWallDepth / 2);
  floor.receiveShadow = !lightweight;
  roomGroup.add(floor);

  // 2. Painted Institutional Block Upper Wall & Architectural Wainscoting (High-Texture Bump Mapped)
  const upperWallTex = lightweight ? null : createWallBrickTexture();
  const upperWallBump = lightweight ? null : createWallBumpTexture();
  const upperWallMat = new THREE.MeshStandardMaterial({
    map: upperWallTex,
    bumpMap: upperWallBump,
    bumpScale: 0.015,
    color: '#ffffff',
    roughness: 0.78,
    metalness: 0.02,
  });

  // Back wall plane starts EXACTLY at leftWallX and extends right to roomRightX (no penetration past left wall!)
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(backWallWidth, 5.5), upperWallMat);
  backWall.name = 'classroom-back-wall';
  backWall.position.set(leftWallX + backWallWidth / 2, floorY + 2.75, backWallZ);
  backWall.receiveShadow = !lightweight;
  roomGroup.add(backWall);

  // Left wall plane starts EXACTLY at backWallZ and extends forward towards +Z (scaled texture repeat)
  const leftWallMat = upperWallMat.clone();
  if (upperWallTex && upperWallBump) {
    const leftTex = upperWallTex.clone();
    leftTex.repeat.set(Math.round(leftWallDepth / 1.4), 5);
    leftTex.needsUpdate = true;
    const leftBump = upperWallBump.clone();
    leftBump.repeat.set(Math.round(leftWallDepth / 1.4), 5);
    leftBump.needsUpdate = true;
    leftWallMat.map = leftTex;
    leftWallMat.bumpMap = leftBump;
  }
  const addLeftWall = (name: string, lowZ: number, highZ: number, lowY: number, highY: number) => {
    const geometry = new THREE.PlaneGeometry(highZ - lowZ, highY - lowY);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (frontZ - highZ + uv.getX(i) * (highZ - lowZ)) / leftWallDepth,
        (lowY - floorY + uv.getY(i) * (highY - lowY)) / (wallTop - floorY));
    }
    const wall = new THREE.Mesh(geometry, leftWallMat);
    wall.name = name;
    wall.rotation.y = Math.PI / 2;
    wall.position.set(leftWallX, (lowY + highY) / 2, (lowZ + highZ) / 2);
    wall.receiveShadow = !lightweight;
    roomGroup.add(wall);
  };
  addLeftWall('left-wall-back', backWallZ, windowLowZ, floorY, wallTop);
  addLeftWall('left-wall-front', windowHighZ, frontZ, floorY, wallTop);
  addLeftWall('left-wall-below-window', windowLowZ, windowHighZ, floorY, windowSillY);
  addLeftWall('left-wall-above-window', windowLowZ, windowHighZ, windowHeadY, wallTop);

  // Lower Wainscoting Paneling, Dark Vinyl Cove Baseboard & Warm Hardwood Chair Rail
  const wainscotTex = lightweight ? null : createWainscotTexture();
  const wainscotBump = lightweight ? null : createWainscotBumpTexture();
  const wainscotMat = new THREE.MeshStandardMaterial({
    map: wainscotTex,
    bumpMap: wainscotBump,
    bumpScale: 0.009,
    color: '#ffffff',
    roughness: 0.62,
    metalness: 0.03,
  });
  const baseboardMat = new THREE.MeshStandardMaterial({
    color: '#1a1e22',
    roughness: 0.45,
    metalness: 0.1,
  });
  const chairRailMat = new THREE.MeshStandardMaterial({
    color: '#7a5734',
    roughness: 0.48,
    metalness: 0.06,
  });

  // Back wall wainscot stops cleanly at left corner chair rail and at cabinet gables
  // so it never intersects or penetrates the left wall trim or the cabinet!
  const backWainscotSegments = [
    { startX: leftWallX, endX: cabLeft },
    { startX: cabRight, endX: roomRightX },
  ];
  for (const seg of backWainscotSegments) {
    const addBackTrim = (name: string, height: number, depth: number, centerY: number, offset: number, material: THREE.Material) => {
      const start = seg.startX + (seg.startX === leftWallX ? offset + depth / 2 : 0);
      const width = seg.endX - start;
      if (width <= 0.05) return;
      const trim = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      trim.name = 'back-' + name;
      trim.position.set(start + width / 2, floorY + centerY, backWallZ + offset);
      roomGroup.add(trim);
    };
    addBackTrim('wainscot', 1.15, 0.015, 0.575, 0.008, wainscotMat);
    addBackTrim('baseboard', 0.12, 0.028, 0.06, 0.015, baseboardMat);
    addBackTrim('chair-rail', 0.05, 0.032, 1.15, 0.016, chairRailMat);
  }

  // Left wall matching wainscot, baseboard, and chair rail meeting back wall cleanly at 90°
  const leftWainscot = new THREE.Mesh(new THREE.BoxGeometry(leftWallDepth, 1.15, 0.015), wainscotMat);
  leftWainscot.name = 'left-wainscot';
  leftWainscot.rotation.y = Math.PI / 2;
  leftWainscot.position.set(leftWallX + 0.008, floorY + 0.575, backWallZ + leftWallDepth / 2);
  roomGroup.add(leftWainscot);

  const leftBaseboard = new THREE.Mesh(new THREE.BoxGeometry(leftWallDepth, 0.12, 0.028), baseboardMat);
  leftBaseboard.name = 'left-baseboard';
  leftBaseboard.rotation.y = Math.PI / 2;
  leftBaseboard.position.set(leftWallX + 0.015, floorY + 0.06, backWallZ + leftWallDepth / 2);
  roomGroup.add(leftBaseboard);

  const leftChairRail = new THREE.Mesh(new THREE.BoxGeometry(leftWallDepth, 0.05, 0.032), chairRailMat);
  leftChairRail.name = 'left-chair-rail';
  leftChairRail.rotation.y = Math.PI / 2;
  leftChairRail.position.set(leftWallX + 0.016, floorY + 1.15, backWallZ + leftWallDepth / 2);
  roomGroup.add(leftChairRail);

  // 3. Heavy-Duty Lab Bench Tubular Steel Legs & Cross-Braces
  const legHeight = 0.755;
  const legCenterY = -0.165 - legHeight / 2;
  const powderCoatTex = createPowderCoatSteelTexture();
  const legMat = new THREE.MeshStandardMaterial({
    color: '#363e42',
    map: powderCoatTex,
    roughness: 0.48,
    metalness: 0.58,
  });
  const footMat = new THREE.MeshStandardMaterial({
    color: '#1b1e20',
    roughness: 0.85,
  });

  const leftLegX = benchCenterX - benchExtent / 2 + 0.28;
  const rightLegX = benchCenterX + benchExtent / 2 - 0.28;
  const legZPositions = [-0.62, 0.62];

  for (const lx of [leftLegX, rightLegX]) {
    for (const lz of legZPositions) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.065, legHeight, 0.065), legMat);
      leg.position.set(lx, legCenterY, lz);
      leg.castShadow = !lightweight;
      roomGroup.add(leg);

      const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.04, 16), footMat);
      boot.position.set(lx, floorY + 0.02, lz);
      roomGroup.add(boot);
    }
    const sideCross = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 1.24), legMat);
    sideCross.position.set(lx, floorY + 0.18, 0);
    roomGroup.add(sideCross);
  }

  const longStretcher = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(1.0, rightLegX - leftLegX), 0.045, 0.045),
    legMat
  );
  longStretcher.position.set(benchCenterX, floorY + 0.18, 0);
  roomGroup.add(longStretcher);

  // Rectangular lab mass and gas fixture on the back edge of the bench.
  const brushedMetal = lightweight ? null : createBrushedMetalTexture();
  if (brushedMetal) brushedMetal.colorSpace = THREE.SRGBColorSpace;
  const steelMat = new THREE.MeshStandardMaterial({
    color: '#afb9bf', map: brushedMetal, bumpMap: brushedMetal, bumpScale: 0.00007,
    metalness: 0.54, roughness: 0.43,
  });
  const brassTapMat = new THREE.MeshStandardMaterial({
    color: '#c49342', metalness: 0.56, roughness: 0.38,
  });
  const castBaseMat = new THREE.MeshStandardMaterial({
    color: '#465155', roughness: 0.67, metalness: 0.29,
    bumpMap: lightweight ? null : powderCoatTex, bumpScale: 0.00035,
  });

  const blockOutline = new THREE.Shape();
  blockOutline.moveTo(-0.087, 0.003);
  blockOutline.lineTo(0.087, 0.003);
  blockOutline.lineTo(0.087, 0.087);
  blockOutline.lineTo(-0.087, 0.087);
  blockOutline.closePath();
  const blockGeometry = new THREE.ExtrudeGeometry(blockOutline, {
    depth: 0.094, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2,
  });
  // ExtrudeGeometry uses world-space UVs. Scale them for the brushed finish.
  const blockUv = blockGeometry.attributes.uv;
  for (let i = 0; i < blockUv.count; i++) {
    blockUv.setXY(i, blockUv.getX(i) * 10, blockUv.getY(i) * 10);
  }
  const blockMass = new THREE.Mesh(blockGeometry, steelMat);
  blockMass.name = 'Rectangular lab mass';
  blockMass.position.set(leftLegX + 0.35, 0, -0.66 - 0.047);

  const gasTurret = new THREE.Group();
  gasTurret.name = 'Bench gas fixture';
  gasTurret.position.set(leftLegX + 0.62, 0, -0.65);
  const baseProfile = [
    [0, 0], [0.030, 0], [0.033, 0.003], [0.033, 0.008], [0.029, 0.011],
    [0.027, 0.017], [0.023, 0.070], [0.024, 0.074], [0.022, 0.078], [0, 0.078],
  ];
  gasTurret.add(new THREE.Mesh(new THREE.LatheGeometry(
    baseProfile.map(([r, y]) => new THREE.Vector2(r, y)), 40,
  ), castBaseMat));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.004, 32), steelMat);
  cap.position.y = 0.079;
  gasTurret.add(cap);

  const nozzleProfile = [
    [0, 0], [0.011, 0], [0.011, 0.010], [0.009, 0.012],
    [0.007, 0.015], [0.0085, 0.017], [0.0065, 0.019],
    [0.008, 0.022], [0.006, 0.024], [0.007, 0.027], [0.006, 0.030],
    [0.0035, 0.030], [0.0035, 0.025], [0, 0.025],
  ];
  const nozzleGeometry = new THREE.LatheGeometry(
    nozzleProfile.map(([r, y]) => new THREE.Vector2(r, y)), 28,
  );
  for (const dir of [-1, 1]) {
    const nozzle = new THREE.Mesh(nozzleGeometry, brassTapMat);
    nozzle.rotation.z = -dir * 2.15;
    nozzle.position.set(dir * 0.019, 0.069, 0);
    gasTurret.add(nozzle);
    const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.012, 6), brassTapMat);
    valve.position.set(dir * 0.010, 0.085, 0);
    gasTurret.add(valve);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.004, 0.008), brassTapMat);
    handle.position.set(dir * 0.010, 0.093, 0);
    gasTurret.add(handle);
  }
  for (const fixture of [blockMass, gasTurret]) {
    fixture.traverse((part) => {
      if (part instanceof THREE.Mesh) {
        part.castShadow = !lightweight;
        part.receiveShadow = !lightweight;
      }
    });
    roomGroup.add(fixture);
  }

  // 4. Oak-Framed Slate Green Chalkboard on Back Wall (Positioned cleanly above wainscoting)
  const cbFrame = new THREE.Mesh(
    new THREE.BoxGeometry(cbWidth + 0.09, cbHeight + 0.09, 0.038),
    new THREE.MeshStandardMaterial({
      map: createOakWoodTexture(512, 128, 'horizontal'),
      color: '#c9955d',
      roughness: 0.45,
      metalness: 0.05,
    })
  );
  cbFrame.position.set(cbX, cbY, backWallZ + 0.02);
  roomGroup.add(cbFrame);

  const cbSurface = new THREE.Mesh(
    new THREE.PlaneGeometry(cbWidth, cbHeight),
    new THREE.MeshStandardMaterial({
      map: createChalkboardTexture(chalkboardMode, chalkboardCustomImage, onChalkboardUpdate),
      roughness: 0.78,
      metalness: 0.02,
    })
  );
  cbSurface.position.set(cbX, cbY, backWallZ + 0.042);
  roomGroup.add(cbSurface);

  // Chalk rail + wooden felt eraser & colored chalk sticks
  const chalkTray = new THREE.Mesh(
    new THREE.BoxGeometry(cbWidth + 0.04, 0.024, 0.075),
    new THREE.MeshStandardMaterial({
      map: createOakWoodTexture(512, 64, 'horizontal'),
      color: '#c9955d',
      roughness: 0.48,
    })
  );
  chalkTray.position.set(cbX, cbY - cbHeight / 2 - 0.03, backWallZ + 0.055);
  roomGroup.add(chalkTray);

  const eraser = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.035, 0.045),
    new THREE.MeshStandardMaterial({ color: '#3b3734', roughness: 0.85 })
  );
  eraser.position.set(cbX - 0.55, cbY - cbHeight / 2 - 0.005, backWallZ + 0.065);
  roomGroup.add(eraser);

  const chalkColors = ['#ffffff', '#f2e8a0', '#f7a072', '#a8e4c0'];
  chalkColors.forEach((col, idx) => {
    const chalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.007, 0.085, 10),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 })
    );
    chalk.rotation.z = Math.PI / 2;
    chalk.position.set(cbX - 0.15 + idx * 0.18, cbY - cbHeight / 2 - 0.012, backWallZ + 0.065);
    roomGroup.add(chalk);
  });

  // 5. Historical Framed Gallery Portraits: Sir Isaac Newton & Paul Dirac Flanking Chalkboard
  const newtonPortrait = buildFramedPortrait(
    './assets/portraits/newton.jpg',
    'Sir Isaac Newton',
    '1643 – 1727 · Lucasian Professor, Cambridge',
    'F = dp/dt · F_g = G(m₁m₂)/r²',
    'Philosophiæ Naturalis Principia Mathematica (1687)',
    0.58,
    0.80,
    '#2b1810'
  );
  newtonPortrait.position.set(newtonX, newtonY, backWallZ + 0.022);
  roomGroup.add(newtonPortrait);

  const diracPortrait = buildFramedPortrait(
    './assets/portraits/dirac.jpg',
    'Paul A. M. Dirac',
    '1902 – 1984 · Nobel Laureate 1933',
    '(iℏ γ^μ ∂_μ - mc) ψ = 0',
    'The Principles of Quantum Mechanics (1930)',
    0.58,
    0.80,
    '#1e293b'
  );
  diracPortrait.position.set(diracX, diracY, backWallZ + 0.022);
  roomGroup.add(diracPortrait);

  // 6. Framed Periodic Table of Elements Poster & School Wall Clock (Left of Newton)
  const posterFrame = new THREE.Mesh(
    new THREE.BoxGeometry(1.06, 0.72, 0.022),
    new THREE.MeshStandardMaterial({ color: '#2b3033', roughness: 0.5 })
  );
  posterFrame.position.set(posterX, posterY, backWallZ + 0.015);
  roomGroup.add(posterFrame);

  const posterPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 0.66),
    new THREE.MeshStandardMaterial({ map: createPeriodicTablePosterTexture(), roughness: 0.45 })
  );
  posterPlane.position.set(posterX, posterY, backWallZ + 0.028);
  roomGroup.add(posterPlane);

  // Round Analog Classroom Clock above the Periodic Table
  const clockGroup = new THREE.Group();
  clockGroup.position.set(posterX, 1.68, backWallZ + 0.025);
  const clockRim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.035, 28),
    new THREE.MeshStandardMaterial({ color: '#222629', roughness: 0.4, metalness: 0.3 })
  );
  clockRim.rotation.x = Math.PI / 2;
  clockGroup.add(clockRim);
  const clockFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.145, 28),
    new THREE.MeshBasicMaterial({ map: createWallClockTexture() })
  );
  clockFace.position.z = 0.019;
  clockGroup.add(clockFace);
  roomGroup.add(clockGroup);

  // 7. Architectural Oak Science Storage Cabinet & Deep Library Shelves (Right of Dirac)
  // Real Oak Wood Textures
  const oakHorizTex = createOakWoodTexture(512, 512, 'horizontal');
  const oakVertTex = createOakWoodTexture(512, 512, 'vertical');

  const cabWoodMat = new THREE.MeshStandardMaterial({
    map: oakVertTex,
    color: '#deb887',
    roughness: 0.42,
    metalness: 0.06,
  });

  const shelfWoodMat = new THREE.MeshStandardMaterial({
    map: oakHorizTex,
    color: '#deb887',
    roughness: 0.38,
    metalness: 0.05,
  });

  const cabGroup = new THREE.Group();
  cabGroup.position.set(cabX, floorY, backWallZ + cabDepth / 2);

  // A. Top Crown Molding (Cornice Overhang)
  const cornice = new THREE.Mesh(
    new THREE.BoxGeometry(cabWidth + 0.08, 0.06, cabDepth + 0.06),
    shelfWoodMat
  );
  cornice.position.set(0, cabHeight + 0.03, 0);
  cabGroup.add(cornice);

  // B. Left and Right Vertical Side Gable Planks
  const sideThick = 0.045;
  for (const sideDir of [-1, 1]) {
    const sideGable = new THREE.Mesh(
      new THREE.BoxGeometry(sideThick, cabHeight, cabDepth),
      cabWoodMat
    );
    sideGable.position.set(sideDir * (cabWidth / 2 - sideThick / 2), cabHeight / 2, 0);
    sideGable.castShadow = !lightweight;
    cabGroup.add(sideGable);
  }

  // C. Bottom Baseboard Plinth
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(cabWidth + 0.04, 0.12, cabDepth + 0.03),
    cabWoodMat
  );
  plinth.position.set(0, 0.06, 0);
  cabGroup.add(plinth);

  // D. Cabinet Top & Bottom Interior Panels
  const topPanel = new THREE.Mesh(
    new THREE.BoxGeometry(cabWidth - sideThick * 2, 0.03, cabDepth - 0.02),
    shelfWoodMat
  );
  topPanel.position.set(0, cabHeight - 0.015, 0);
  cabGroup.add(topPanel);

  const bottomPanel = new THREE.Mesh(
    new THREE.BoxGeometry(cabWidth - sideThick * 2, 0.03, cabDepth - 0.02),
    shelfWoodMat
  );
  bottomPanel.position.set(0, 0.135, 0);
  cabGroup.add(bottomPanel);

  // E. Solid Architectural Beadboard Backing Panel (2cm thick solid panel with vertical beadboard)
  const backBoard = new THREE.Mesh(
    new THREE.BoxGeometry(cabWidth - sideThick * 2, cabHeight - 0.16, 0.02),
    new THREE.MeshStandardMaterial({
      map: createBeadboardTexture(),
      roughness: 0.65,
    })
  );
  backBoard.position.set(0, cabHeight / 2 + 0.06, -cabDepth / 2 + 0.01);
  cabGroup.add(backBoard);

  // F. Deep Heavy Oak Shelves with Front Rounded Bullnose Molding
  const shelfYPositions = [0.65, 1.15, 1.62]; // 3 deep shelves
  const shelfInnerW = cabWidth - sideThick * 2 - 0.005;
  const shelfInnerD = cabDepth - 0.04;

  shelfYPositions.forEach((sy) => {
    // Solid deep shelf plank with oak grain
    const shelfMesh = new THREE.Mesh(
      new THREE.BoxGeometry(shelfInnerW, 0.026, shelfInnerD),
      shelfWoodMat
    );
    shelfMesh.position.set(0, sy, 0.01);
    shelfMesh.castShadow = !lightweight;
    shelfMesh.receiveShadow = !lightweight;
    cabGroup.add(shelfMesh);

    // Front rounded bullnose edge
    const bullnose = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.013, shelfInnerW, 16),
      shelfWoodMat
    );
    bullnose.rotation.z = Math.PI / 2;
    bullnose.position.set(0, sy, shelfInnerD / 2 + 0.01);
    cabGroup.add(bullnose);

    // Small brass shelf support bracket pins on sides
    const pinMat = new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.85, roughness: 0.3 });
    for (const sx of [-shelfInnerW / 2 + 0.006, shelfInnerW / 2 - 0.006]) {
      for (const sz of [-shelfInnerD * 0.32, shelfInnerD * 0.32]) {
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.018, 10), pinMat);
        pin.rotation.z = Math.PI / 2;
        pin.position.set(sx, sy - 0.016, sz);
        cabGroup.add(pin);
      }
    }
  });

  // G. Lower Shaker Cabinet Doors (y from 0.12 to 0.64)
  const doorMat = new THREE.MeshStandardMaterial({
    map: oakVertTex,
    color: '#deb887',
    roughness: 0.45,
    metalness: 0.05,
  });
  const doorW = (cabWidth - sideThick * 2 - 0.01) / 2;
  const doorH = 0.50;
  const doorZ = cabDepth / 2 + 0.005;

  for (const [dIdx, dX] of [[-1, -doorW / 2 - 0.002], [1, doorW / 2 + 0.002]] as const) {
    const doorFrame = new THREE.Mesh(
      new THREE.BoxGeometry(doorW, doorH, 0.022),
      doorMat
    );
    doorFrame.position.set(dX, 0.12 + doorH / 2, doorZ);
    cabGroup.add(doorFrame);

    // Recessed center panel
    const recessed = new THREE.Mesh(
      new THREE.BoxGeometry(doorW - 0.09, doorH - 0.09, 0.01),
      doorMat
    );
    recessed.position.set(dX, 0.12 + doorH / 2, doorZ - 0.004);
    cabGroup.add(recessed);

    // Antiqued brass door drop pull handle
    const handleMat = new THREE.MeshStandardMaterial({ color: '#caa338', metalness: 0.9, roughness: 0.25 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 12), handleMat);
    handle.position.set(dX - dIdx * (doorW / 2 - 0.035), 0.12 + doorH / 2, doorZ + 0.018);
    cabGroup.add(handle);
  }

  // Mid-cabinet horizontal face frame divider rail between lower doors and upper shelves
  const midDividerRail = new THREE.Mesh(
    new THREE.BoxGeometry(cabWidth - sideThick * 2, 0.032, 0.024),
    doorMat
  );
  midDividerRail.position.set(0, 0.635, doorZ);
  cabGroup.add(midDividerRail);

  // H. Middle Shelf (sy = 1.15): Hardcover Physics Library with Embossed Spines
  const bookLibrary = [
    { title: 'Principia', author: 'Newton', col: '#831843', w: 0.042, h: 0.26 },
    { title: 'Quantum', author: 'Dirac', col: '#1e3a8a', w: 0.046, h: 0.28 },
    { title: 'Feynman I', author: 'Feynman', col: '#065f46', w: 0.038, h: 0.25 },
    { title: 'Mechanics', author: 'Goldstein', col: '#78350f', w: 0.048, h: 0.27 },
    { title: 'Relativity', author: 'Einstein', col: '#581c87', w: 0.036, h: 0.24 },
  ];

  let bkX = -shelfInnerW / 2 + 0.12;
  bookLibrary.forEach((bk, bIdx) => {
    const bookGroup = new THREE.Group();
    bookGroup.position.set(bkX, 1.15 + 0.013 + bk.h / 2, 0.04);

    const spineMat = new THREE.MeshStandardMaterial({
      map: createBookCoverTexture(bk.title, bk.author, bk.col),
      roughness: 0.55,
      metalness: 0.08,
    });
    const bodyMat = new THREE.MeshStandardMaterial({ color: bk.col, roughness: 0.6 });
    const pagesMat = new THREE.MeshStandardMaterial({ color: '#fef3c7', roughness: 0.9 });

    const bookMesh = new THREE.Mesh(
      new THREE.BoxGeometry(bk.w, bk.h, 0.18),
      [pagesMat, bodyMat, pagesMat, pagesMat, spineMat, pagesMat]
    );
    if (bIdx === bookLibrary.length - 1) {
      bookMesh.rotation.z = -0.14;
      bookMesh.position.x += 0.02;
    }
    bookGroup.add(bookMesh);
    cabGroup.add(bookGroup);

    bkX += bk.w + 0.008;
  });

  // I. Middle Shelf: Birch Wood Test Tube Rack with 5 Colorful Chemical Solutions
  const rackGroup = new THREE.Group();
  rackGroup.position.set(0.18, 1.15 + 0.013, 0.04);

  const rackWoodMat = new THREE.MeshStandardMaterial({ color: '#d4a373', roughness: 0.5 });
  const rackBase = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.014, 0.07), rackWoodMat);
  rackBase.position.y = 0.007;
  rackGroup.add(rackBase);

  const rackTop = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.012, 0.07), rackWoodMat);
  rackTop.position.y = 0.11;
  rackGroup.add(rackTop);

  for (const rx of [-0.11, 0.11]) {
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.12, 0.065), rackWoodMat);
    upright.position.set(rx, 0.06, 0);
    rackGroup.add(upright);
  }

  const tubeReagents = ['#0284c7', '#10b981', '#a855f7', '#f59e0b', '#ec4899'];
  tubeReagents.forEach((color, tIdx) => {
    const tx = -0.08 + tIdx * 0.04;
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 0.13, 14),
      new THREE.MeshStandardMaterial({ color: '#e0f2fe', transparent: true, opacity: 0.42, roughness: 0.08 })
    );
    tube.position.set(tx, 0.075, 0);
    rackGroup.add(tube);

    const liquid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.009, 0.08, 14),
      new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.88, roughness: 0.2 })
    );
    liquid.position.set(tx, 0.05, 0);
    rackGroup.add(liquid);
  });
  cabGroup.add(rackGroup);

  // J. Middle Shelf: Realistic Graduated Cylinder
  const cylGroup = new THREE.Group();
  cylGroup.position.set(shelfInnerW / 2 - 0.12, 1.15 + 0.013, 0.03);

  const cylBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.04, 0.014, 6),
    new THREE.MeshStandardMaterial({ color: '#dbeafe', transparent: true, opacity: 0.65, roughness: 0.1 })
  );
  cylBase.position.y = 0.007;
  cylGroup.add(cylBase);

  const cylCol = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.28, 18),
    new THREE.MeshStandardMaterial({ color: '#e0f2fe', transparent: true, opacity: 0.45, roughness: 0.08 })
  );
  cylCol.position.y = 0.15;
  cylGroup.add(cylCol);

  const cylLiq = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.18, 16),
    new THREE.MeshStandardMaterial({ color: '#0369a1', transparent: true, opacity: 0.9, roughness: 0.15 })
  );
  cylLiq.position.y = 0.10;
  cylGroup.add(cylLiq);
  cabGroup.add(cylGroup);

  // K. Top Shelf (sy = 1.62): Glass Flasks & Beakers with Corks
  const beakerCols = ['#4ea8de', '#e07a5f', '#81b29a', '#f2cc8f'];
  beakerCols.forEach((bCol, i) => {
    const beaker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.095, 14),
      new THREE.MeshStandardMaterial({
        color: bCol,
        transparent: true,
        opacity: 0.75,
        roughness: 0.15,
      })
    );
    beaker.position.set(-0.36 + i * 0.24, 1.62 + 0.013 + 0.048, 0.03);
    cabGroup.add(beaker);
  });

  // L. Upper Glazed Display Doors with Slender Wood Stiles & Crystal Clear Panes (so shelves, books & glassware are fully visible!)
  const upperDoorH = 1.05;
  const upperDoorZ = cabDepth / 2 + 0.006;
  const stileW = 0.034;
  const railH = 0.038;

  for (const [dIdx, dX] of [[-1, -doorW / 2 - 0.002], [1, doorW / 2 + 0.002]] as const) {
    // Transparent glass pane (reveals textured shelves, books, flasks, and test tubes)
    const glassPane = new THREE.Mesh(
      new THREE.PlaneGeometry(doorW - stileW * 2, upperDoorH - railH * 2),
      new THREE.MeshStandardMaterial({
        color: '#d4ebf2',
        transparent: true,
        opacity: 0.16,
        roughness: 0.06,
        metalness: 0.15,
      })
    );
    glassPane.position.set(dX, 0.65 + upperDoorH / 2, upperDoorZ + 0.002);
    cabGroup.add(glassPane);

    // Perimeter wooden frame rails and stiles (open center, NOT a solid box!)
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(doorW, railH, 0.016), doorMat);
    topRail.position.set(dX, 0.65 + upperDoorH - railH / 2, upperDoorZ);
    cabGroup.add(topRail);

    const bottomRail = new THREE.Mesh(new THREE.BoxGeometry(doorW, railH, 0.016), doorMat);
    bottomRail.position.set(dX, 0.65 + railH / 2, upperDoorZ);
    cabGroup.add(bottomRail);

    const leftStile = new THREE.Mesh(new THREE.BoxGeometry(stileW, upperDoorH - railH * 2, 0.016), doorMat);
    leftStile.position.set(dX - doorW / 2 + stileW / 2, 0.65 + upperDoorH / 2, upperDoorZ);
    cabGroup.add(leftStile);

    const rightStile = new THREE.Mesh(new THREE.BoxGeometry(stileW, upperDoorH - railH * 2, 0.016), doorMat);
    rightStile.position.set(dX + doorW / 2 - stileW / 2, 0.65 + upperDoorH / 2, upperDoorZ);
    cabGroup.add(rightStile);

    const handleMat = new THREE.MeshStandardMaterial({ color: '#caa338', metalness: 0.9, roughness: 0.25 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 12), handleMat);
    handle.position.set(dX - dIdx * (doorW / 2 - stileW / 2), 0.65 + upperDoorH / 2, upperDoorZ + 0.016);
    cabGroup.add(handle);
  }

  roomGroup.add(cabGroup);

  // 8. Overhead Fluorescent Troffers (Realistic Ceiling Lighting Fixtures)
  for (const trofferX of [benchCenterX - 0.85, benchCenterX + 1.15]) {
    const troffer = buildFluorescentTroffer(1.35, 0.42);
    troffer.position.set(trofferX, 2.45, -0.15);
    roomGroup.add(troffer);
  }

  // 9. Eye Protection & Laboratory Safety Poster on Left Wall
  // Positioned at z = 1.70 so it is right next to the projectile flight zone and 65cm clear of the window casing
  const safetyPoster = new THREE.Mesh(
    new THREE.PlaneGeometry(0.88, 0.62),
    new THREE.MeshStandardMaterial({
      map: createSafetyPosterTexture(),
      roughness: 0.45,
    })
  );
  safetyPoster.rotation.y = Math.PI / 2;
  safetyPoster.position.set(leftWallX + 0.025, 1.25, 1.70);
  roomGroup.add(safetyPoster);

  // 7. Daylight Classroom Window Opening Out to Acadia National Park (Jordan Pond & The Bubbles, ME)
  const winGroup = new THREE.Group();
  winGroup.name = 'classroom-window';
  winGroup.position.set(leftWallX + 0.02, windowCenterY, windowCenterZ);
  winGroup.rotation.y = Math.PI / 2;

  // A. Heavy Architectural Window Casing & Deep Wall Reveal (Warm white painted wood)
  const casingMat = new THREE.MeshStandardMaterial({
    color: '#e2e6e7',
    roughness: 0.42,
    metalness: 0.1,
  });

  // Close the four wall returns between the opening and the exterior backdrop.
  const revealDepth = 0.11;
  for (const side of [-1, 1]) {
    const jambReturn = new THREE.Mesh(new THREE.BoxGeometry(0.02, winH, revealDepth), casingMat);
    jambReturn.position.set(side * (winW / 2 + 0.01), 0, -0.065);
    winGroup.add(jambReturn);
    const lintelReturn = new THREE.Mesh(new THREE.BoxGeometry(winW, 0.02, revealDepth), casingMat);
    lintelReturn.position.set(0, side * (winH / 2 + 0.01), -0.065);
    winGroup.add(lintelReturn);
  }

  // Top casing
  const topCasing = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.14, 0.075, 0.055), casingMat);
  topCasing.position.set(0, winH / 2 + 0.035, 0.02);
  winGroup.add(topCasing);

  // Left & Right Side Jamb Casings
  for (const dir of [-1, 1]) {
    const sideJamb = new THREE.Mesh(new THREE.BoxGeometry(0.065, winH, 0.05), casingMat);
    sideJamb.position.set(dir * (winW / 2 + 0.03), 0, 0.018);
    winGroup.add(sideJamb);
  }

  // Deep Solid Window Stool & Apron (Sill) projecting into classroom
  const sill = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.22, 0.045, 0.16), casingMat);
  sill.position.set(0, -winH / 2 - 0.015, 0.065);
  winGroup.add(sill);

  const apron = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.14, 0.055, 0.03), casingMat);
  apron.position.set(0, -winH / 2 - 0.065, 0.015);
  winGroup.add(apron);

  // Small engraved brass plaque on window stool
  const sillPlateTex = createAcadiaWindowSillPlateTexture();
  const sillPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.44, 0.065),
    new THREE.MeshStandardMaterial({ map: sillPlateTex, metalness: 0.8, roughness: 0.28 })
  );
  sillPlate.rotation.x = -Math.PI / 2;
  sillPlate.position.set(0, -winH / 2 + 0.008, 0.075);
  winGroup.add(sillPlate);

  // B. Acadia National Park Panoramic Vista Outside the Window
  const texLoader = new THREE.TextureLoader();
  const acadiaTex = texLoader.load('./assets/acadia.jpg');
  acadiaTex.colorSpace = THREE.SRGBColorSpace;
  acadiaTex.generateMipmaps = true;

  const acadiaVistaMat = new THREE.MeshStandardMaterial({
    map: acadiaTex,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: acadiaTex,
    emissiveIntensity: 0.55, // Crisp, natural morning sunlight from Acadia National Park
    roughness: 0.85,
    metalness: 0.0,
  });

  const vistaMesh = new THREE.Mesh(new THREE.PlaneGeometry(winW + 0.5, winH + 0.36), acadiaVistaMat);
  vistaMesh.name = 'window-exterior-backdrop';
  vistaMesh.position.set(0, 0, -0.12);
  winGroup.add(vistaMesh);

  // C. Central Vertical Mullion dividing the double window
  const centerMullion = new THREE.Mesh(new THREE.BoxGeometry(0.045, winH, 0.045), casingMat);
  centerMullion.position.set(0, 0, 0.01);
  winGroup.add(centerMullion);

  // D. Left Casement Sash (Closed sash with colonial cross-grids & clear glass)
  const sashW = (winW - 0.08) / 2;
  const sashH = winH - 0.08;
  const sashMat = new THREE.MeshStandardMaterial({ color: '#f1f5f6', roughness: 0.38 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#e8f4f8',
    transparent: true,
    opacity: 0.18,
    roughness: 0.06,
    metalness: 0.25,
  });

  // Left Window Pane (Stationary)
  const leftGlass = new THREE.Mesh(new THREE.PlaneGeometry(sashW - 0.06, sashH - 0.06), glassMat);
  leftGlass.position.set(-winW / 4, 0, 0.008);
  winGroup.add(leftGlass);

  // Left Sash Muntin Grids (Colonial 4-lite grid)
  const leftVMuntin = new THREE.Mesh(new THREE.BoxGeometry(0.018, sashH - 0.06, 0.022), sashMat);
  leftVMuntin.position.set(-winW / 4, 0, 0.008);
  winGroup.add(leftVMuntin);
  const leftHMuntin = new THREE.Mesh(new THREE.BoxGeometry(sashW - 0.06, 0.018, 0.022), sashMat);
  leftHMuntin.position.set(-winW / 4, 0, 0.008);
  winGroup.add(leftHMuntin);

  // E. Right Casement Window Opening Out to Acadia National Park!
  // Hinged at the right outer jamb and swung open inward into the classroom (never penetrating the wall)
  const openSashGroup = new THREE.Group();
  const rightHingeX = winW / 2 - 0.02;
  openSashGroup.position.set(rightHingeX, 0, 0.02);
  openSashGroup.rotation.y = Math.PI * 0.12; // Swung open inward into room towards student, no wall clipping!

  // The sash door relative to the hinge
  const openGlass = new THREE.Mesh(new THREE.PlaneGeometry(sashW - 0.06, sashH - 0.06), glassMat);
  openGlass.position.set(-sashW / 2, 0, 0);
  openSashGroup.add(openGlass);

  // Sash perimeter frame
  const sashBorder = 0.035;
  const sTopRail = new THREE.Mesh(new THREE.BoxGeometry(sashW, sashBorder, 0.028), sashMat);
  sTopRail.position.set(-sashW / 2, sashH / 2 - sashBorder / 2, 0);
  openSashGroup.add(sTopRail);

  const sBotRail = new THREE.Mesh(new THREE.BoxGeometry(sashW, sashBorder, 0.028), sashMat);
  sBotRail.position.set(-sashW / 2, -sashH / 2 + sashBorder / 2, 0);
  openSashGroup.add(sBotRail);

  const sLeftStile = new THREE.Mesh(new THREE.BoxGeometry(sashBorder, sashH - sashBorder * 2, 0.028), sashMat);
  sLeftStile.position.set(-sashW + sashBorder / 2, 0, 0);
  openSashGroup.add(sLeftStile);

  const sRightStile = new THREE.Mesh(new THREE.BoxGeometry(sashBorder, sashH - sashBorder * 2, 0.028), sashMat);
  sRightStile.position.set(-sashBorder / 2, 0, 0);
  openSashGroup.add(sRightStile);

  // Open sash muntins
  const openVMuntin = new THREE.Mesh(new THREE.BoxGeometry(0.016, sashH - sashBorder * 2, 0.022), sashMat);
  openVMuntin.position.set(-sashW / 2, 0, 0);
  openSashGroup.add(openVMuntin);
  const openHMuntin = new THREE.Mesh(new THREE.BoxGeometry(sashW - sashBorder * 2, 0.016, 0.022), sashMat);
  openHMuntin.position.set(-sashW / 2, 0, 0);
  openSashGroup.add(openHMuntin);

  // Polished Brass Casement Operator Crank & Locking Lever
  const brassMat = new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.88, roughness: 0.25 });
  const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.015, 0.015), brassMat);
  crankArm.position.set(-sashW * 0.45, -sashH / 2 + 0.06, 0.03);
  crankArm.rotation.z = 0.2;
  openSashGroup.add(crankArm);

  const handleKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.035, 12), brassMat);
  handleKnob.position.set(-sashW + 0.045, -0.05, 0.025);
  openSashGroup.add(handleKnob);

  winGroup.add(openSashGroup);
  roomGroup.add(winGroup);

  // 8. Lab Stools Tucked Under / Beside Bench
  const stoolPositions = [
    [benchCenterX - 0.65, -0.78],
    [benchCenterX + 0.75, -0.78],
  ];
  const stoolSeatTex = createStoolWoodSeatTexture();
  const seatMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    map: stoolSeatTex,
    roughness: 0.42,
    metalness: 0.05,
  });
  const chromeRingMat = new THREE.MeshStandardMaterial({
    color: '#e4ebed',
    metalness: 0.92,
    roughness: 0.15,
  });
  const stoolBaseMat = new THREE.MeshStandardMaterial({
    color: '#282e32',
    map: powderCoatTex,
    roughness: 0.52,
    metalness: 0.55,
  });

  for (const [sx, sz] of stoolPositions) {
    const stool = new THREE.Group();
    stool.position.set(sx, floorY, sz);

    // Turned hardwood maple seat with concentric lathe rings & center finger grip
    const seat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.175, 0.175, 0.042, 32),
      seatMat
    );
    seat.position.y = 0.56;
    seat.castShadow = !lightweight;
    seat.receiveShadow = !lightweight;
    stool.add(seat);

    // Steel under-seat swivel mounting hub plate
    const seatFlange = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.014, 16),
      stoolBaseMat
    );
    seatFlange.position.y = 0.535;
    stool.add(seatFlange);

    // Height adjustment swivel collar with knurled locking knob
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.038, 0.035, 16),
      chromeRingMat
    );
    collar.position.y = 0.51;
    stool.add(collar);

    const lockPin = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.012, 0.05),
      stoolBaseMat
    );
    lockPin.position.set(0.032, 0.51, 0);
    stool.add(lockPin);

    // Powder-coated central tubular steel column
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.50, 16),
      legMat
    );
    post.position.y = 0.27;
    post.castShadow = !lightweight;
    stool.add(post);

    // Polished chrome circular footrest ring with 4 welded radial steel spokes
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.145, 0.012, 12, 28),
      chromeRingMat
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.22;
    stool.add(ring);

    for (let spokeIdx = 0; spokeIdx < 4; spokeIdx++) {
      const a = (spokeIdx * Math.PI) / 2;
      const spoke = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.14, 8),
        legMat
      );
      spoke.rotation.z = Math.PI / 2;
      spoke.rotation.y = a;
      spoke.position.set(Math.cos(a) * 0.07, 0.22, Math.sin(a) * 0.07);
      stool.add(spoke);
    }

    // Heavy cast-iron flared disc base with stippled powder coat
    const baseDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.245, 0.028, 28),
      stoolBaseMat
    );
    baseDisc.position.y = 0.014;
    baseDisc.receiveShadow = !lightweight;
    stool.add(baseDisc);

    // 4 non-marring rubber floor glides
    for (const ga of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      const glide = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.018, 0.008, 12),
        footMat
      );
      glide.position.set(Math.cos(ga) * 0.20, 0.004, Math.sin(ga) * 0.20);
      stool.add(glide);
    }

    roomGroup.add(stool);
  }

  return roomGroup;
}

export interface LabViewportProps {
  params: LaunchParameters;
  elapsedTime: number;
  showTrajectory: boolean;
  showLabels: boolean;
  showForces?: boolean;
  lightweight: boolean;
  equipment: ProjectileApparatusSpec;
  viewMode: CameraViewMode;
  cameraLocked: boolean;
  lockedCameraPose: React.MutableRefObject<LockedCameraPose | null>;
  mountMode?: 'stand' | 'clamp';
  resetKey: number;
  showTheory: boolean;
  targetDistanceM: number | null;
  recordedLandings: { range: number; landingHeight?: number }[];
  physicsMode?: PhysicsMode;
  experimentalEnv?: ExperimentalEnvironment;
  chalkboardMode?: 'default' | 'erased' | 'custom_image';
  chalkboardCustomImage?: string | null;
}

export const LabViewportCanvas: React.FC<LabViewportProps> = ({
  params,
  elapsedTime,
  showTrajectory,
  showLabels,
  showForces = true,
  lightweight,
  equipment,
  viewMode,
  cameraLocked,
  lockedCameraPose,
  mountMode: userMountMode,
  resetKey,
  showTheory,
  targetDistanceM,
  recordedLandings,
  physicsMode,
  experimentalEnv,
  chalkboardMode = 'default',
  chalkboardCustomImage,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [gate, setGate] = useState<ReturnType<typeof createPhotogate>>();
  const [gateDistance, setGateDistance] = useState(0.8);
  const [gateHeight, setGateHeight] = useState(0.99);
  const gateDragRef = useRef<{ group?: THREE.Object3D; distance: number; max: number }>({ distance: 0.8, max: 3 });

  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const cameraLockedRef = useRef(cameraLocked);
  cameraLockedRef.current = cameraLocked;
  const orbitStateRef = useRef({
    theta: -0.34,
    phi: 1.12,
    radius: 3.6,
    target: new THREE.Vector3(0.75, 0.38, 0),
    isDragging: false,
    isPanning: false,
    lastX: 0,
    lastY: 0,
  });

  // Persistent refs so smooth 60fps animation & parameter drags never destroy/recreate the WebGL context!
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const assetLoaded = useLauncherAsset(equipment.id);
  const dynamicGroupRef = useRef<THREE.Group | null>(null);
  const freeCameraBoundsRef = useRef<THREE.Box3 | null>(null);
  const ballMeshRef = useRef<THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial> | null>(null);
  const trajectoryHolderRef = useRef<THREE.Group | null>(null);
  const updateCameraFnRef = useRef<(() => void) | null>(null);
  const apparatusRef = useRef<THREE.Group | null>(null);
  const apparatusBounds = useRef(new THREE.Box3());
  const landingStandRef = useRef<THREE.Group | null>(null);
  const targetRef = useRef<THREE.Group | null>(null);
  const framedViewRef = useRef<{ viewMode: CameraViewMode; resetKey: number; lightweight: boolean } | null>(null);

  const mountMode = userMountMode || (equipment.visual.mount_type === 'clamp' ? 'clamp' : 'stand');
  const isExp = physicsMode === 'experimental' && Boolean(experimentalEnv?.enableDrag);
  const idealSummary = calculateTheoreticalSummary(params);
  const activeSummary =
    isExp && experimentalEnv
      ? calculateExperimentalSummary(params, experimentalEnv)
      : idealSummary;
  const summary = activeSummary;
  const landY = summary.landingHeight;
  const standHeight = targetDistanceM === null ? landY : params.landingHeight ?? 0;
  const currentState = evaluateProjectileState(params, elapsedTime, experimentalEnv);
  const rBall = equipment.dimensions.projectileDiameter / 2;
  const zMountOffset = mountMode === 'clamp' ? CLAMP_LAUNCH_AXIS_Z : 0;
  const pose = computeApparatusKinematicsPose(equipment, params.angle, params.height + rBall);
  const muzzleX = pose.muzzleCenter[0];
  const ruler = computeBenchRulerLayout(
    muzzleX,
    Math.max(idealSummary.range, summary.range, targetDistanceM ?? 0),
    mountMode
  );
  const maxGateDistance = Math.max(0.25, Math.floor((ruler.right - muzzleX - 0.2) * 100) / 100);
  const gateX = Math.min(gateDistance, maxGateDistance);
  gateDragRef.current = { group: gate?.group, distance: gateX, max: maxGateDistance };
  const gatePath = useMemo(() => sampleTrajectory(params, 256, undefined, experimentalEnv),
    [params, experimentalEnv]);
  const crossing = useMemo(() => findBeamCrossing(gatePath, gateX, gateHeight - rBall, rBall),
    [gatePath, gateX, gateHeight, rBall]);
  const gateDetected = elapsedTime > 0 && crossing !== undefined && elapsedTime >= crossing;

  // 1. Initialize WebGLRenderer, Scene, Lights & Pointer Listeners ONCE (or when lightweight mode toggles)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e6e8e1');
    scene.fog = new THREE.Fog('#e6e8e1', 10, 24);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.05, 45);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !lightweight,
        powerPreference: 'high-performance',
      });
    } catch (err) {
      console.warn('High-performance WebGL context failed, trying default WebGL renderer:', err);
      try {
        renderer = new THREE.WebGLRenderer({ antialias: false, precision: 'mediump' });
      } catch (err2) {
        console.error('Fatal: WebGL is not available in this environment:', err2);
        container.innerHTML = '<div style="padding:40px;text-align:center;color:#6b7280;font-family:sans-serif;"><h3>3D Hardware Acceleration Unavailable</h3><p>Please enable WebGL in your browser to view the interactive 3D laboratory apparatus.</p></div>';
        return;
      }
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lightweight ? 1 : 2));
    renderer.shadowMap.enabled = !lightweight;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight('#fffdf9', '#b8c0ba', 0.95);
    hemiLight.position.set(0, 6, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight('#fffcf5', 1.95);
    dirLight.position.set(1.8, 4.8, 3.6);
    dirLight.castShadow = !lightweight;
    if (!lightweight) {
      dirLight.shadow.mapSize.width = 2048;
      dirLight.shadow.mapSize.height = 2048;
      dirLight.shadow.camera.near = 0.5;
      dirLight.shadow.camera.far = 18;
      dirLight.shadow.camera.left = -4.5;
      dirLight.shadow.camera.right = 7.5;
      dirLight.shadow.camera.top = 4.0;
      dirLight.shadow.camera.bottom = -3.0;
      dirLight.shadow.bias = -0.0004;
    }
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight('#dcebf7', 0.65);
    fillLight.position.set(-3.2, 2.5, -2.0);
    scene.add(fillLight);

    const dynamicGroup = new THREE.Group();
    dynamicGroup.name = 'lab-setup';
    scene.add(dynamicGroup);
    dynamicGroupRef.current = dynamicGroup;

    const trajectoryHolder = new THREE.Group();
    scene.add(trajectoryHolder);
    trajectoryHolderRef.current = trajectoryHolder;

    const ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.0125, lightweight ? 20 : 36, lightweight ? 16 : 28),
      new THREE.MeshStandardMaterial({
        color: '#e5b554',
        metalness: 0.84,
        roughness: 0.18,
      })
    );
    ballMesh.castShadow = !lightweight;
    scene.add(ballMesh);
    ballMeshRef.current = ballMesh;

    const updateCameraFromOrbit = () => {
      const st = orbitStateRef.current;
      st.phi = Math.max(0.08, Math.min(Math.PI / 2 + 0.12, st.phi));
      const minRadius = viewModeRef.current === 'close' ? 0.34 : 0.65;
      st.radius = Math.max(minRadius, Math.min(11, st.radius));

      const x = st.target.x + st.radius * Math.sin(st.phi) * Math.sin(st.theta);
      const y = st.target.y + st.radius * Math.cos(st.phi);
      const z = st.target.z + st.radius * Math.sin(st.phi) * Math.cos(st.theta);

      camera.position.set(x, y, z);
      camera.lookAt(st.target);
    };
    updateCameraFnRef.current = updateCameraFromOrbit;
    const locked = cameraLockedRef.current ? lockedCameraPose.current : null;
    if (locked) {
      camera.position.copy(locked.position);
      camera.quaternion.copy(locked.quaternion);
    } else {
      updateCameraFromOrbit();
    }

    const dom = renderer.domElement;
    dom.tabIndex = 0;
    dom.setAttribute('aria-label', 'Projectile lab camera');
    const keys = new Set<string>();
    const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight']);
    const direction = new THREE.Vector3();
    const right = new THREE.Vector3();
    const motion = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const look = new THREE.Euler(0, 0, 0, 'YXZ');
    let motionFrame = 0;
    let previousFrame = 0;

    const moveCamera = (time: number) => {
      motionFrame = 0;
      if (cameraLockedRef.current) { clearKeys(); return; }
      if (viewModeRef.current !== 'free' || !keys.size) {
        previousFrame = 0;
        return;
      }
      const dt = previousFrame ? Math.min((time - previousFrame) / 1000, 0.05) : 0;
      previousFrame = time;
      camera.getWorldDirection(direction);
      right.crossVectors(direction, up).normalize();
      motion.set(0, 0, 0)
        .addScaledVector(direction, Number(keys.has('KeyW')) - Number(keys.has('KeyS')))
        .addScaledVector(right, Number(keys.has('KeyD')) - Number(keys.has('KeyA')))
        .addScaledVector(up, Number(keys.has('KeyE')) - Number(keys.has('KeyQ')));
      if (motion.lengthSq() > 0) {
        const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3.6 : 1.35;
        camera.position.addScaledVector(motion.normalize(), speed * dt);
        const bounds = freeCameraBoundsRef.current;
        if (bounds) camera.position.clamp(bounds.min, bounds.max);
        renderer.render(scene, camera);
      }
      motionFrame = requestAnimationFrame(moveCamera);
    };
    const clearKeys = () => {
      keys.clear();
      cancelAnimationFrame(motionFrame);
      motionFrame = 0;
      previousFrame = 0;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (cameraLockedRef.current || viewModeRef.current !== 'free' || !movementKeys.has(e.code) || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      keys.add(e.code);
      if (!motionFrame) motionFrame = requestAnimationFrame(moveCamera);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.code);
      if (!keys.size) clearKeys();
    };
    const gateRay = new THREE.Raycaster();
    const gatePointer = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
    const dragPoint = new THREE.Vector3();
    let gateDrag: { pointerId: number; offset: number } | undefined;
    const aimGateRay = (e: PointerEvent) => {
      const rect = dom.getBoundingClientRect();
      gatePointer.set((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2);
      gateRay.setFromCamera(gatePointer, camera);
    };
    const onPointerDown = (e: PointerEvent) => {
      const currentGate = gateDragRef.current;
      if (e.button === 0 && !e.shiftKey && currentGate.group) {
        aimGateRay(e);
        const hit = gateRay.intersectObject(currentGate.group, true)[0];
        if (hit) {
          dragPlane.constant = -hit.point.y;
          gateDrag = { pointerId: e.pointerId, offset: currentGate.distance - hit.point.x };
          dom.setPointerCapture(e.pointerId);
          dom.style.cursor = 'grabbing';
          return;
        }
      }
      if (cameraLockedRef.current) return;
      if (viewModeRef.current === 'free') dom.focus({ preventScroll: true });
      orbitStateRef.current.isDragging = true;
      orbitStateRef.current.isPanning = e.button === 2 || e.shiftKey;
      orbitStateRef.current.lastX = e.clientX;
      orbitStateRef.current.lastY = e.clientY;
      dom.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (gateDrag?.pointerId === e.pointerId) {
        aimGateRay(e);
        if (gateRay.ray.intersectPlane(dragPlane, dragPoint)) {
          const distance = Math.round((dragPoint.x + gateDrag.offset) * 100) / 100;
          setGateDistance(THREE.MathUtils.clamp(distance, 0.25, gateDragRef.current.max));
        }
        return;
      }
      const st = orbitStateRef.current;
      if (!st.isDragging || cameraLockedRef.current) return;
      const dx = e.clientX - st.lastX;
      const dy = e.clientY - st.lastY;
      st.lastX = e.clientX;
      st.lastY = e.clientY;

      if (viewModeRef.current === 'free') {
        look.setFromQuaternion(camera.quaternion);
        look.y -= dx * 0.0045;
        look.x = THREE.MathUtils.clamp(look.x - dy * 0.0045, -1.55, 1.55);
        look.z = 0;
        camera.quaternion.setFromEuler(look);
        renderer.render(scene, camera);
        return;
      }
      if (st.isPanning) {
        const panScale = st.radius * 0.0015;
        st.target.x -= dx * panScale;
        st.target.y = Math.max(-0.4, Math.min(2.5, st.target.y + dy * panScale));
      } else {
        st.theta -= dx * 0.0065;
        st.phi -= dy * 0.0065;
      }
      updateCameraFromOrbit();
      renderer.render(scene, camera);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (gateDrag?.pointerId === e.pointerId) {
        gateDrag = undefined;
        dom.style.cursor = '';
      }
      orbitStateRef.current.isDragging = false;
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (cameraLockedRef.current) return;
      e.preventDefault();
      if (viewModeRef.current === 'free') {
        camera.getWorldDirection(direction);
        camera.position.addScaledVector(direction, -Math.sign(e.deltaY) * 0.16);
        const bounds = freeCameraBoundsRef.current;
        if (bounds) camera.position.clamp(bounds.min, bounds.max);
        renderer.render(scene, camera);
        return;
      }
      orbitStateRef.current.radius *= e.deltaY > 0 ? 1.08 : 0.92;
      updateCameraFromOrbit();
      renderer.render(scene, camera);
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const hgt = container.clientHeight || 500;
      camera.aspect = w / hgt;
      camera.updateProjectionMatrix();
      renderer.setSize(w, hgt);
      renderer.render(scene, camera);
    };

    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointermove', onPointerMove);
    dom.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('pointercancel', onPointerUp);
    dom.addEventListener('lostpointercapture', onPointerUp);
    dom.addEventListener('keydown', onKeyDown);
    dom.addEventListener('keyup', onKeyUp);
    dom.addEventListener('blur', clearKeys);
    window.addEventListener('blur', clearKeys);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('resize', onResize);

    return () => {
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointercancel', onPointerUp);
      dom.removeEventListener('lostpointercapture', onPointerUp);
      dom.removeEventListener('keydown', onKeyDown);
      dom.removeEventListener('keyup', onKeyUp);
      dom.removeEventListener('blur', clearKeys);
      window.removeEventListener('blur', clearKeys);
      clearKeys();
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, [lightweight]);

  useEffect(() => {
    if (viewMode === 'free' && !cameraLocked) rendererRef.current?.domElement.focus({ preventScroll: true });
  }, [viewMode, lightweight, cameraLocked]);

  useEffect(() => {
    const camera = cameraRef.current;
    if (!cameraLocked || !camera) return;
    orbitStateRef.current.isDragging = false;
    lockedCameraPose.current = { position: camera.position.clone(), quaternion: camera.quaternion.clone() };
  }, [cameraLocked, lockedCameraPose, lightweight]);

  // Grow the bench in sections so small slider changes don't rebuild the classroom.
  const benchExtent = ruler.extent;
  const benchRight = ruler.right;
  const recordedDistanceKey = JSON.stringify(recordedLandings
    .filter(trial => Math.abs((trial.landingHeight ?? 0) - landY) < .005).map(trial => trial.range));
  const landingPlatformRange = targetDistanceM ?? activeSummary.range;

  useEffect(() => {
    const dynamicGroup = dynamicGroupRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!dynamicGroup || !scene || !camera || !renderer) return;
    let active = true;
    const benchCenterX = benchExtent / 2 + ruler.left;

    // Add realistic physics classroom architecture (walls, whiteboard, storage cabinet, window, bench legs, stools)
    const classroomGroup = buildRealisticClassroomEnvironment(
      benchCenterX,
      benchExtent,
      lightweight,
      chalkboardMode,
      chalkboardCustomImage,
      () => {
        if (active) renderer.render(scene, camera);
      }
    );
    classroomGroup.name = 'lab-classroom';
    freeCameraBoundsRef.current = classroomGroup.userData.freeCameraBounds;
    dynamicGroup.add(classroomGroup);

    const benchGroup = new THREE.Group();
    benchGroup.name = 'lab-bench';

    // Phenolic Resin Science Lab Countertop (dark charcoal laboratory top with realistic micro-speckle & sheen)
    const phenolicTex = createPhenolicBenchTexture();
    const benchRoughnessTex = createBenchRoughnessTexture();
    const oakApronTex = createOakApronTexture();
    const matGridTex = createLandingMatGridTexture();

    const benchTop = new THREE.Mesh(
      new THREE.BoxGeometry(benchExtent, LAB_BENCH_THICKNESS, LAB_BENCH_DEPTH),
      new THREE.MeshStandardMaterial({
        color: '#2d3336',
        map: phenolicTex,
        roughnessMap: benchRoughnessTex,
        roughness: 0.52,
        metalness: 0.12,
      })
    );
    benchTop.position.set(benchCenterX, -LAB_BENCH_THICKNESS / 2, 0);
    benchTop.receiveShadow = !lightweight;
    benchGroup.add(benchTop);

    // Solid oak under-apron frame with rich natural wood grain
    const benchApron = new THREE.Mesh(
      new THREE.BoxGeometry(benchExtent - 0.06, 0.065, 1.48),
      new THREE.MeshStandardMaterial({
        color: '#e4b882',
        map: oakApronTex,
        roughness: 0.58,
        metalness: 0.04,
      })
    );
    benchApron.position.set(benchCenterX, -0.142, 0);
    benchGroup.add(benchApron);

    // Calibrated High-Contrast Laboratory Landing Mat with precision metric grid
    const landingMat = new THREE.Mesh(
      new THREE.BoxGeometry(benchExtent - 0.24, 0.01, 1.05),
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        map: matGridTex,
        roughness: 0.72,
        metalness: 0.02,
      })
    );
    landingMat.position.set(benchCenterX, 0.005, 0);
    landingMat.receiveShadow = !lightweight;
    benchGroup.add(landingMat);
    dynamicGroup.add(benchGroup);
    return () => {
      active = false;
      classroomGroup.removeFromParent();
      benchGroup.removeFromParent();
    };
  }, [benchExtent, ruler.left, lightweight, chalkboardMode, chalkboardCustomImage]);

  useEffect(() => {
    const dynamicGroup = dynamicGroupRef.current;
    if (!dynamicGroup) return;
    let active = true;
    let instruments: THREE.Group | undefined;
    let photogate: ReturnType<typeof createPhotogate>;
    loadBenchInstrumentProps(lightweight).then((props) => {
      if (!active) return;
      instruments = props;
      props.position.set(ruler.left + 1.28, 0, -0.65);
      dynamicGroup.add(props);
      photogate = createPhotogate(props);
      if (photogate) {
        dynamicGroup.add(photogate.group);
        setGate(photogate);
      }
    }).catch((error) => {
      if (active) console.warn('Bench props could not be displayed:', error);
    });
    return () => {
      active = false;
      instruments?.removeFromParent();
      photogate?.group.removeFromParent();
      photogate?.dispose();
    };
  }, [ruler.left, lightweight]);

  useEffect(() => {
    if (!gate) return;
    gate.place(muzzleX + gateX, gateHeight, zMountOffset);
    gate.setDetected(gateDetected);
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (scene && camera) rendererRef.current?.render(scene, camera);
  }, [gate, muzzleX, gateX, gateHeight, zMountOffset, gateDetected]);

  useEffect(() => {
    const dynamicGroup = dynamicGroupRef.current;
    if (!dynamicGroup) return;
    const benchCenterX = benchExtent / 2 + ruler.left;
    const rulerGroup = new THREE.Group();
    rulerGroup.name = 'lab-ruler';
    const trackStrip = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(1, benchRight - muzzleX - 0.15), 0.003, 0.18),
      new THREE.MeshStandardMaterial({
        color: '#e2e7e3',
        roughness: 0.75,
      })
    );
    trackStrip.position.set(muzzleX + (benchRight - muzzleX - 0.15) / 2, 0.011, zMountOffset);
    trackStrip.receiveShadow = !lightweight;
    rulerGroup.add(trackStrip);

    const rulerBar = new THREE.Mesh(
      new THREE.BoxGeometry(benchExtent - 0.26, 0.008, 0.095),
      new THREE.MeshStandardMaterial({
        color: '#d8e0dc',
        metalness: 0.45,
        roughness: 0.4,
      })
    );
    rulerBar.position.set(benchCenterX, 0.012, 0.46);
    rulerGroup.add(rulerBar);

    for (const tick of ruler.ticks) {
      const tickMesh = new THREE.Mesh(
        new THREE.BoxGeometry(tick.major ? 0.006 : 0.0035, 0.004, tick.major ? 0.082 : 0.042),
        new THREE.MeshBasicMaterial({ color: tick.major ? '#2c3d3f' : '#637673' })
      );
      tickMesh.position.set(tick.x, 0.017, 0.46);
      rulerGroup.add(tickMesh);

      if (tick.major) {
        const badgeTex = createNumberBadgeTexture(
          `${tick.distance.toFixed(ruler.step < 0.2 ? 2 : 1)}m`
        );
        const badgePlane = new THREE.Mesh(
          new THREE.PlaneGeometry(0.11, 0.055),
          new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true, depthWrite: false })
        );
        badgePlane.rotation.x = -Math.PI / 2;
        badgePlane.position.set(tick.x, 0.018, 0.36);
        rulerGroup.add(badgePlane);
      }
    }

    const zeroMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.006, 20),
      new THREE.MeshStandardMaterial({ color: '#2d70b3', metalness: 0.5, roughness: 0.3 })
    );
    zeroMarker.position.set(muzzleX, 0.014, zMountOffset);
    rulerGroup.add(zeroMarker);

    dynamicGroup.add(rulerGroup);
    return () => { rulerGroup.removeFromParent(); };
  }, [benchExtent, benchRight, ruler.left, ruler.step, ruler.ticks.length, muzzleX, zMountOffset, lightweight]);

  useEffect(() => {
    const dynamicGroup = dynamicGroupRef.current;
    if (!dynamicGroup) return;
    // Build 3D Apparatus
    const apparatusGroup = buildProjectileApparatusGroup({
      spec: equipment,
      angleDeg: params.angle,
      projectileCenterY: params.height + rBall,
      mountMode,
      lightweight,
      previewMode: false,
    });
    apparatusGroup.position.set(0, 0, zMountOffset);
    dynamicGroup.add(apparatusGroup);
    apparatusRef.current = apparatusGroup;
    apparatusBounds.current.setFromObject(apparatusGroup, true);
    return () => {
      apparatusGroup.removeFromParent();
      apparatusRef.current = null;
      apparatusBounds.current.makeEmpty();
    };
  }, [equipment, params.angle, params.height, rBall, mountMode, zMountOffset, lightweight, assetLoaded]);

  const isSymmetric = activeSummary.isSymmetricLaunch;
  useEffect(() => {
    const dynamicGroup = dynamicGroupRef.current;
    if (!dynamicGroup || standHeight <= 0.005) return;
    const stand = buildElevatedLandingStand(0, standHeight, 0, isSymmetric, lightweight, targetDistanceM !== null);
    stand.name = targetDistanceM === null ? 'lab-landing-stand' : 'lab-target-stand';
    dynamicGroup.add(stand);
    landingStandRef.current = stand;
    return () => { stand.removeFromParent(); landingStandRef.current = null; };
  }, [standHeight, isSymmetric, lightweight, targetDistanceM]);

  useEffect(() => {
    // Update projectile sphere radius if equipment changed
    if (ballMeshRef.current) {
      ballMeshRef.current.geometry.dispose();
      ballMeshRef.current.geometry = new THREE.SphereGeometry(
        rBall,
        lightweight ? 20 : 36,
        lightweight ? 16 : 28
      );
    }
  }, [rBall, lightweight]);

  useEffect(() => {
    const dynamicGroup = dynamicGroupRef.current;
    if (!dynamicGroup) return;
    // An elevated target uses the stand's marked platform. A tabletop target uses this disc.
    if (targetDistanceM !== null && Number.isFinite(targetDistanceM) && targetDistanceM > 0 && standHeight <= 0.005) {
      const targetGroup = new THREE.Group();
      targetRef.current = targetGroup;

      const targetBase = new THREE.Mesh(
        new THREE.CylinderGeometry(LANDING_TARGET_RADIUS_M, 0.085, 0.014, 32),
        new THREE.MeshStandardMaterial({ color: '#2d70b3', metalness: 0.3, roughness: 0.4 })
      );
      targetBase.position.y = 0.007;
      targetGroup.add(targetBase);

      const bullseye = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 0.016, 32),
        new THREE.MeshBasicMaterial({ color: '#ffffff' })
      );
      bullseye.position.y = 0.0075;
      targetGroup.add(bullseye);

      const centerSpot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.018, 24),
        new THREE.MeshBasicMaterial({ color: '#c74440' })
      );
      centerSpot.position.y = 0.008;
      targetGroup.add(centerSpot);

      dynamicGroup.add(targetGroup);
      return () => { targetGroup.removeFromParent(); targetRef.current = null; };
    }
  }, [targetDistanceM, standHeight, lightweight]);

  useEffect(() => {
    const dynamicGroup = dynamicGroupRef.current;
    if (!dynamicGroup) return;
    const marksGroup = new THREE.Group();
    marksGroup.name = 'recorded-landing-marks';
    const markedDistances: number[] = [];
    for (const dist of JSON.parse(recordedDistanceKey) as number[]) {
      const fromPlatform = Math.abs(dist - landingPlatformRange);
      if (landY > .005 && (Math.abs(landY - standHeight) >= .005 || fromPlatform > .08)) continue;
      if (landY <= .005 && targetDistanceM !== null && standHeight <= .005 && fromPlatform < LANDING_TARGET_RADIUS_M + .006) continue;
      if (markedDistances.some(previous => Math.abs(previous - dist) < .012)) continue;
      markedDistances.push(dist);
      const mark = new THREE.Mesh(
        new THREE.CircleGeometry(.006, 18),
        new THREE.MeshBasicMaterial({ color: '#257a55', side: THREE.DoubleSide })
      );
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(muzzleX + dist, landY + (landY > .005 ? .0025 : .006), zMountOffset);
      marksGroup.add(mark);
    }
    dynamicGroup.add(marksGroup);
    return () => {
      marksGroup.removeFromParent();
      for (const mark of marksGroup.children as THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[]) {
        mark.geometry.dispose();
        mark.material.dispose();
      }
    };
  }, [recordedDistanceKey, muzzleX, landY, zMountOffset, landingPlatformRange, standHeight, targetDistanceM]);

  // 3. Frame the rebuilt apparatus after switching camera presets.
  useEffect(() => {
    if (viewMode === 'free') {
      framedViewRef.current = null;
      const camera = cameraRef.current;
      const bounds = freeCameraBoundsRef.current;
      if (camera && bounds && !cameraLockedRef.current && !bounds.containsPoint(camera.position)) {
        camera.position.clamp(bounds.min, bounds.max);
        if (sceneRef.current) rendererRef.current?.render(sceneRef.current, camera);
      }
      return;
    }
    if (cameraLockedRef.current) return;
    const previous = framedViewRef.current;
    if (previous?.viewMode === viewMode && previous.resetKey === resetKey && previous.lightweight === lightweight) return;
    framedViewRef.current = { viewMode, resetKey, lightweight };
    const midX = muzzleX + Math.max(0.75, summary.range * 0.45);
    const st = orbitStateRef.current;
    if (viewMode === 'close') {
      st.target.set(pose.pivot[0] * 0.5, Math.max(0.28, params.height * 0.52), zMountOffset);
      st.theta = 0.52;
      st.phi = 1.12;
      st.radius = 1.35;
      const body = apparatusRef.current?.getObjectByName('launcher-body');
      const model = launcherAssetLoaders[equipment.id] && assetLoaded ? body?.parent : body;
      const camera = cameraRef.current;
      if (model && camera) {
        const bounds = new THREE.Box3().setFromObject(model, true);
        if (!bounds.isEmpty()) {
          const sphere = bounds.getBoundingSphere(new THREE.Sphere());
          const halfVertical = THREE.MathUtils.degToRad(camera.fov / 2);
          const halfHorizontal = Math.atan(Math.tan(halfVertical) * camera.aspect);
          st.target.copy(sphere.center);
          st.radius = sphere.radius * 1.25 / Math.sin(Math.min(halfVertical, halfHorizontal));
        }
      }
    } else if (viewMode === 'side') {
      st.target.set(midX, Math.max(0.38, summary.maxHeight * 0.42), zMountOffset);
      st.theta = 0.0;
      st.phi = Math.PI / 2 - 0.08;
      st.radius = Math.max(3.6, ruler.extent * 0.88);
    } else if (viewMode === 'top') {
      st.target.set(midX, 0.05, zMountOffset);
      st.theta = 0.0;
      st.phi = 0.08;
      st.radius = Math.max(3.6, ruler.extent * 0.92);
    } else {
      const left = muzzleX + Math.min(0, summary.range, showTheory ? idealSummary.range : 0) - 0.32;
      const right = muzzleX + Math.max(0, summary.range, showTheory ? idealSummary.range : 0, targetDistanceM ?? 0) + 0.23;
      const height = Math.max(0.35, params.height, summary.maxHeight, showTheory ? idealSummary.maxHeight : 0) + 0.13;
      st.target.set((left + right) / 2, height / 2, zMountOffset);
      st.theta = -0.22;
      st.phi = 1.22;
      const camera = cameraRef.current;
      st.radius = camera ? fitExperimentOrbit(camera, st.theta, st.phi, (right - left) / 2, height / 2) : 2.3;
    }
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    updateCameraFnRef.current?.();
    if (camera && scene) rendererRef.current?.render(scene, camera);
  }, [viewMode, resetKey, muzzleX, zMountOffset, equipment, assetLoaded, lightweight, params.height,
    summary.range, summary.maxHeight, showTheory, idealSummary.range, idealSummary.maxHeight, targetDistanceM]);

  // 4. Lightweight 60fps Update for Projectile Position & Trajectory Curve during Flight
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const ballMesh = ballMeshRef.current;
    const trajectoryHolder = trajectoryHolderRef.current;
    if (!scene || !camera || !renderer || !ballMesh || !trajectoryHolder) return;

    ballMesh.position.set(muzzleX + currentState.x, currentState.y + rBall, zMountOffset);
    const stand = landingStandRef.current;
    if (stand) {
      const standX = muzzleX + (targetDistanceM ?? activeSummary.range);
      const bounds = apparatusBounds.current;
      const overlapsLauncher = standX - 0.09 < bounds.max.x && standX + 0.09 > bounds.min.x;
      stand.position.set(standX, 0, zMountOffset);
      stand.visible = !overlapsLauncher &&
        (targetDistanceM !== null || showTheory || (summary.time > 0 && elapsedTime >= summary.time));
    }
    targetRef.current?.position.set(muzzleX + (targetDistanceM ?? 0), standHeight, zMountOffset);

    // Overlay meshes are rebuilt as the shot changes. Cached force sprites are shared.
    const oldMaterials = new Set<THREE.Material>();
    trajectoryHolder.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        oldMaterials.add(material);
      }
    });
    for (const material of oldMaterials) material.dispose();
    trajectoryHolder.clear();

    if (showTrajectory) {
      if (isExp && experimentalEnv) {
        // 1. Ideal Vacuum Theoretical Path (dashed amber tube) - strictly ONLY when showTheory is true!
        if (showTheory) {
          const idealMaxT = idealSummary.time;
          if (idealMaxT > 0.0001) {
            const idealStates = sampleTrajectory(params, 72, idealMaxT);
            const idealPts = idealStates.map(
              (s) => new THREE.Vector3(muzzleX + s.x, s.y + rBall, zMountOffset)
            );
            if (idealPts.length >= 2) {
              const curve = new THREE.CatmullRomCurve3(idealPts);
              const tubeGeo = new THREE.TubeGeometry(curve, 72, 0.0035, 8, false);
              const tubeMat = new THREE.MeshBasicMaterial({
                color: '#d98829',
                transparent: true,
                opacity: 0.5,
              });
              trajectoryHolder.add(new THREE.Mesh(tubeGeo, tubeMat));
            }
          }
        }
        // 2. Realistic Aerodynamic Drag Trajectory (solid vibrant cyan tube)
        // If showTheory is true, draw full path; if false, draw only the physical breadcrumb path up to elapsedTime!
        const expMaxT = showTheory ? activeSummary.time : Math.min(activeSummary.time, elapsedTime);
        if (expMaxT > 0.0001) {
          const expStates = sampleTrajectory(params, 72, expMaxT, experimentalEnv);
          const expPts = expStates.map(
            (s) => new THREE.Vector3(muzzleX + s.x, s.y + rBall, zMountOffset)
          );
          if (expPts.length >= 2) {
            const curve = new THREE.CatmullRomCurve3(expPts);
            const tubeGeo = new THREE.TubeGeometry(curve, 72, 0.0052, 8, false);
            const tubeMat = new THREE.MeshBasicMaterial({
              color: '#00b4d8',
              transparent: true,
              opacity: 0.95,
            });
            trajectoryHolder.add(new THREE.Mesh(tubeGeo, tubeMat));
          }
        }
      } else {
        // In vacuum mode: if showTheory is true, draw full path; if false, draw only the marble's actual flight path so far!
        const maxT = showTheory ? summary.time : Math.min(summary.time, elapsedTime);
        if (maxT > 0.0001) {
          const states = sampleTrajectory(params, 72, maxT);
          const pts = states.map(
            (s) => new THREE.Vector3(muzzleX + s.x, s.y + rBall, zMountOffset)
          );
          if (pts.length >= 2) {
            const curve = new THREE.CatmullRomCurve3(pts);
            const tubeGeo = new THREE.TubeGeometry(curve, 72, 0.0045, 8, false);
            const tubeMat = new THREE.MeshBasicMaterial({
              color: '#d98829',
              transparent: true,
              opacity: 0.9,
            });
            trajectoryHolder.add(new THREE.Mesh(tubeGeo, tubeMat));
          }
        }
      }
    }

    const overlapsPlatform = (range: number, height: number) =>
      (Boolean(stand?.visible) || (standHeight <= .005 && targetDistanceM !== null)) &&
      Math.abs(height - standHeight) < .005 && Math.abs(range - landingPlatformRange) < .172;
    const predictionRings = new THREE.Group();
    predictionRings.name = 'landing-prediction-rings';
    trajectoryHolder.add(predictionRings);
    if (showTheory) {
      if (isExp) {
        // Ideal Landing Marker (translucent amber)
        if (!overlapsPlatform(idealSummary.range, idealSummary.landingHeight)) {
          const idealRingGroup = new THREE.Group();
          idealRingGroup.position.set(muzzleX + idealSummary.range, idealSummary.landingHeight + 0.015, zMountOffset);
          const idealOuterRing = new THREE.Mesh(
            new THREE.RingGeometry(0.065, 0.082, 36),
            new THREE.MeshBasicMaterial({
              color: '#c97e24',
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.55,
            })
          );
          idealOuterRing.rotation.x = -Math.PI / 2;
          idealRingGroup.add(idealOuterRing);
          predictionRings.add(idealRingGroup);
        }

        // Experimental Landing Target (vibrant cyan with red bullseye center)
        if (!overlapsPlatform(activeSummary.range, landY)) {
          const expRingGroup = new THREE.Group();
          expRingGroup.position.set(muzzleX + activeSummary.range, landY + 0.015, zMountOffset);
          const expOuterRing = new THREE.Mesh(
            new THREE.RingGeometry(0.065, 0.082, 36),
            new THREE.MeshBasicMaterial({ color: '#00b4d8', side: THREE.DoubleSide })
          );
          expOuterRing.rotation.x = -Math.PI / 2;
          expRingGroup.add(expOuterRing);

          const expInnerDot = new THREE.Mesh(
            new THREE.CircleGeometry(0.016, 24),
            new THREE.MeshBasicMaterial({ color: '#c74440', side: THREE.DoubleSide })
          );
          expInnerDot.rotation.x = -Math.PI / 2;
          expInnerDot.position.y = 0.001;
          expRingGroup.add(expInnerDot);
          predictionRings.add(expRingGroup);
        }
      } else {
        if (!overlapsPlatform(summary.range, landY)) {
          const ringGroup = new THREE.Group();
          ringGroup.position.set(muzzleX + summary.range, landY + 0.015, zMountOffset);

          const outerRing = new THREE.Mesh(
            new THREE.RingGeometry(0.065, 0.082, 36),
            new THREE.MeshBasicMaterial({ color: '#c97e24', side: THREE.DoubleSide })
          );
          outerRing.rotation.x = -Math.PI / 2;
          ringGroup.add(outerRing);

          const innerDot = new THREE.Mesh(
            new THREE.CircleGeometry(0.016, 24),
            new THREE.MeshBasicMaterial({ color: '#c74440', side: THREE.DoubleSide })
          );
          innerDot.rotation.x = -Math.PI / 2;
          innerDot.position.y = 0.001;
          ringGroup.add(innerDot);

          predictionRings.add(ringGroup);
        }
      }
    } else if (summary.time > 0 && elapsedTime >= summary.time && !overlapsPlatform(summary.range, landY)) {
      // Physical landing marker (carbon paper impact dot where projectile physically struck surface)
      const impactGroup = new THREE.Group();
      impactGroup.position.set(muzzleX + summary.range, landY + 0.006, zMountOffset);
      const impactDot = new THREE.Mesh(
        new THREE.CircleGeometry(0.014, 24),
        new THREE.MeshBasicMaterial({ color: '#334155', side: THREE.DoubleSide })
      );
      impactDot.rotation.x = -Math.PI / 2;
      impactGroup.add(impactDot);
      trajectoryHolder.add(impactGroup);
    }

    const projMaterial = isExp ? experimentalEnv?.material : equipment.projectileMaterial;
    const aluminumBall = projMaterial === 'aluminum';
    const vernierSteelBall = equipment.id === VERNIER_VPL_ID && projMaterial === 'steel';
    ballMesh.material.color.set(aluminumBall ? '#c6cbd0' : vernierSteelBall ? '#b7c1cb' : '#e5b554');
    ballMesh.material.metalness = aluminumBall ? 0.56 : 0.84;
    ballMesh.material.roughness = aluminumBall ? 0.29 : 0.18;

    // 5. 3D Free-Body Diagram (FBD) Force Vectors & Billboard Labels
    if (showForces) {
      const massKg = calculateProjectileMass(
        equipment.dimensions.projectileDiameter,
        projMaterial ?? 'steel'
      );
      const fgMag = massKg * params.gravity;
      const ballCenter = new THREE.Vector3(
        muzzleX + currentState.x,
        currentState.y + rBall,
        zMountOffset
      );

      // 1. Gravity Force Vector (Downward - Blue)
      const fgDir = new THREE.Vector3(0, -1, 0);
      const fgLen = 0.22;
      const fgArrow = createForceArrowMesh(fgDir, ballCenter, fgLen, '#2563eb', 0.0075);
      trajectoryHolder.add(fgArrow);

      const fgLabelPos = ballCenter.clone().add(new THREE.Vector3(0.065, -fgLen, 0));
      const fgLabel = createForceLabelSprite('g');
      fgLabel.position.copy(fgLabelPos);
      trajectoryHolder.add(fgLabel);

      // 2. Aerodynamic Drag & Net Resultant Force (when drag is active and in flight)
      if (isExp && experimentalEnv && experimentalEnv.enableDrag) {
        const rho = calculateAirDensity(
          experimentalEnv.airPressureKPa,
          experimentalEnv.temperatureC
        );
        const radius = equipment.dimensions.projectileDiameter / 2;
        const area = Math.PI * radius * radius;
        const cd = experimentalEnv.dragCoefficient;
        const w = experimentalEnv.windSpeed || 0;
        const vrelX = currentState.vx - w;
        const vrelY = currentState.vy;
        const vrel = Math.hypot(vrelX, vrelY);

        if (vrel > 0.02) {
          const fdragMag = 0.5 * rho * cd * area * vrel * vrel;
          const fdNormX = -vrelX / vrel;
          const fdNormY = -vrelY / vrel;
          const fdDir = new THREE.Vector3(fdNormX, fdNormY, 0);

          if (fdragMag > 0.0003) {
            const fdLen = Math.max(
              0.08,
              Math.min(0.30, (fdragMag / Math.max(fgMag, 0.01)) * 0.22)
            );
            const fdArrow = createForceArrowMesh(fdDir, ballCenter, fdLen, '#ea580c', 0.0075);
            trajectoryHolder.add(fdArrow);

            const fdLabelPos = ballCenter.clone().addScaledVector(fdDir, fdLen + 0.055);
            const fdLabel = createForceLabelSprite('d');
            fdLabel.position.copy(fdLabelPos);
            trajectoryHolder.add(fdLabel);

            // Net Force (Vector sum of Fg and Fdrag)
            const fnetX = fdragMag * fdNormX;
            const fnetY = -fgMag + fdragMag * fdNormY;
            const fnetMag = Math.hypot(fnetX, fnetY);
            if (fnetMag > 0.001) {
              const fnetDir = new THREE.Vector3(fnetX / fnetMag, fnetY / fnetMag, 0);
              const fnetLen = Math.max(
                0.08,
                Math.min(0.35, (fnetMag / Math.max(fgMag, 0.01)) * 0.22)
              );
              const fnetArrow = createForceArrowMesh(
                fnetDir,
                ballCenter,
                fnetLen,
                '#7c3aed',
                0.008
              );
              trajectoryHolder.add(fnetArrow);

              const fnetLabelPos = ballCenter.clone()
                .addScaledVector(fnetDir, fnetLen)
                .add(new THREE.Vector3(-0.07, 0, 0));
              const fnetLabel = createForceLabelSprite('net');
              fnetLabel.position.copy(fnetLabelPos);
              trajectoryHolder.add(fnetLabel);
            }
          }
        }
      }
    }

    renderer.render(scene, camera);
  }, [
    assetLoaded,
    equipment,
    lightweight,
    landY,
    standHeight,
    targetDistanceM,
    recordedDistanceKey,
    chalkboardMode,
    chalkboardCustomImage,
    elapsedTime,
    params.angle,
    params.speed,
    params.height,
    params.gravity,
    showTrajectory,
    showTheory,
    showForces,
    muzzleX,
    rBall,
    zMountOffset,
    physicsMode,
    isExp,
    equipment.dimensions.projectileDiameter,
    experimentalEnv?.material,
    experimentalEnv?.airPressureKPa,
    experimentalEnv?.temperatureC,
    experimentalEnv?.dragCoefficient,
    experimentalEnv?.windSpeed,
    experimentalEnv?.enableDrag,
  ]);

  return h(
    'div',
    { style: { width: '100%', height: '100%', position: 'relative' } },
    h('div', { ref: containerRef, style: { width: '100%', height: '100%' } }),
    gate && h(
      'details',
      { className: 'photogate-controls' },
      h('summary', null, 'Photogate', h('span', { role: 'status', 'data-detected': gateDetected },
        gateDetected ? 'Marble detected' : 'Beam clear')),
      h('div', { className: 'photogate-hint' }, 'Drag the gate to move it along the bench.'),
      h('label', null, `Distance from launcher · ${gateX.toFixed(2)} m`,
        h('input', { type: 'range', min: 0.25, max: maxGateDistance, step: 0.01, value: gateX,
          'aria-label': 'Photogate distance', onChange: (event: React.ChangeEvent<HTMLInputElement>) => setGateDistance(Number(event.target.value)) })),
      h('label', null, `Beam height above tabletop · ${gateHeight.toFixed(2)} m`,
        h('input', { type: 'range', min: 0.12, max: 2.5, step: 0.01, value: gateHeight,
          'aria-label': 'Photogate height', onChange: (event: React.ChangeEvent<HTMLInputElement>) => setGateHeight(Number(event.target.value)) }))
    ),
    showLabels && targetDistanceM !== null
      ? h(
          'div',
          {
            style: {
              position: 'absolute',
              left: '18px',
              bottom: '36px',
              display: 'flex',
              gap: '6px',
              flexWrap: 'wrap',
              pointerEvents: 'none',
              zIndex: 2,
            },
          },
          h(
                'div',
                { className: 'scene-label', style: { borderColor: '#2d70b3', color: '#2d70b3', fontSize: '10px', padding: '4px 8px' } },
                `Target at ${targetDistanceM.toFixed(2)} m` + (showTheory ? ` (Δ: ${(summary.range - targetDistanceM >= 0 ? '+' : '') + (summary.range - targetDistanceM).toFixed(2)} m)` : '')
          )
        )
      : null
  );
};

export const ReconstructionPreviewCanvas: React.FC<{
  spec: ProjectileApparatusSpec;
  previewAngle: number;
  view?: 'orbit' | 'side' | 'end';
  mountMode?: 'stand' | 'clamp';
  fitToModel?: boolean;
}> = ({ spec, previewAngle, view = 'orbit', mountMode: selectedMount, fitToModel = false }) => {
  const assetLoaded = useLauncherAsset(spec.id);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const orbitRef = useRef({
    theta: 0.58,
    phi: 1.12,
    radius: 1.05,
    isDragging: false,
    lastX: 0,
    lastY: 0,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 320;
    const height = container.clientHeight || 240;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#edf1f0');

    const camera = new THREE.PerspectiveCamera(34, width / height, 0.05, 15);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      container.textContent = '3D preview unavailable';
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight('#ffffff', '#b5c2bc', 1.1));
    const dir = new THREE.DirectionalLight('#ffffff', 1.9);
    dir.position.set(2, 4, 3);
    scene.add(dir);

    const isWooden = spec.id === 'wooden-marble-ramp-launcher' || spec.visual.base === 'panel';
    const rBall = spec.dimensions.projectileDiameter / 2;
    const mountMode = selectedMount ?? (spec.visual.mount_type === 'clamp' ? 'clamp' : 'stand');
    const clearance = computeMinimumClearanceHeight(spec, previewAngle, mountMode);
    const hPreview = fitToModel || launcherAssetLoaders[spec.id] || spec.reconstruction?.panelOutline ? clearance + rBall
      : isWooden ? clearance
      : Math.max(0.45, clearance + 0.05) + rBall;
    const group = buildProjectileApparatusGroup({
      spec,
      angleDeg: previewAngle,
      projectileCenterY: hPreview,
      mountMode,
      lightweight: false,
      previewMode: true,
    });
    scene.add(group);

    const grid = new THREE.GridHelper(1.2, 12, '#b8c7c2', '#d5dfdc');
    grid.position.set(isWooden ? 0 : -0.2, 0, 0);
    if (!fitToModel) scene.add(grid);

    const bounds = fitToModel || spec.reconstruction || launcherAssetLoaders[spec.id] ? new THREE.Box3() : null;
    if (bounds) {
      group.updateMatrixWorld(true);
      const meshBounds = new THREE.Box3();
      // Hidden trajectories, projectiles, and helpers should not affect the preview framing.
      group.traverseVisible(object => {
        if (!(object instanceof THREE.Mesh)) return;
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        if (object.geometry.boundingBox) {
          bounds.union(meshBounds.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld));
        }
      });
    }
    const target = bounds && !bounds.isEmpty()
      ? bounds.getCenter(new THREE.Vector3())
      : isWooden
      ? new THREE.Vector3(0, 0.09, 0)
      : new THREE.Vector3(-0.18, 0.24, 0);

    if (bounds && !bounds.isEmpty()) {
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      const halfVertical = THREE.MathUtils.degToRad(camera.fov / 2);
      const halfHorizontal = Math.atan(Math.tan(halfVertical) * camera.aspect);
      orbitRef.current.radius = sphere.radius * (fitToModel ? 0.92 : 1.08) / Math.sin(Math.min(halfVertical, halfHorizontal));
      orbitRef.current.phi = view === 'orbit' ? 1.18 : Math.PI / 2;
      orbitRef.current.theta = view === 'side' ? 0 : view === 'end' ? Math.PI / 2 : 0.50;
    } else if (isWooden) {
      orbitRef.current.radius = 0.75;
      orbitRef.current.phi = 1.18;
      orbitRef.current.theta = 0.50;
    }
    const updateCam = () => {
      const st = orbitRef.current;
      st.phi = Math.max(0.15, Math.min(Math.PI / 2, st.phi));
      st.radius = Math.max(bounds ? 0.15 : 0.5, Math.min(bounds ? 8 : 3.5, st.radius));
      camera.position.set(
        target.x + st.radius * Math.sin(st.phi) * Math.sin(st.theta),
        target.y + st.radius * Math.cos(st.phi),
        target.z + st.radius * Math.sin(st.phi) * Math.cos(st.theta)
      );
      camera.lookAt(target);
      renderer.render(scene, camera);
    };
    updateCam();
    const observer = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h || (renderer.domElement.style.width === `${w}px` && renderer.domElement.style.height === `${h}px`)) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      updateCam();
    });
    observer.observe(container);

    const dom = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      orbitRef.current.isDragging = true;
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;
      dom.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!orbitRef.current.isDragging) return;
      const dx = e.clientX - orbitRef.current.lastX;
      const dy = e.clientY - orbitRef.current.lastY;
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;
      orbitRef.current.theta -= dx * 0.008;
      orbitRef.current.phi -= dy * 0.008;
      updateCam();
    };
    const onUp = () => {
      orbitRef.current.isDragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbitRef.current.radius *= e.deltaY > 0 ? 1.08 : 0.92;
      updateCam();
    };

    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      observer.disconnect();
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('wheel', onWheel);
      renderer.dispose();
    };
  }, [spec, previewAngle, view, assetLoaded, selectedMount, fitToModel]);

  return h('div', { ref: containerRef, style: { width: '100%', height: '100%' } });
};
