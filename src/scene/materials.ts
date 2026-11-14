/**
 * Lab4All — Physically Based Material & Procedural Texture Library
 *
 * Generates procedural canvas/data textures (brushed aluminum anisotropy grain,
 * birch/hardwood grain, phenolic bench composite speckle, precision engraved
 * protractor dials, and metric bench ruler tapes) so the 3D scene has realistic
 * roughness, metalness, and surface variation without external network dependencies.
 */

import * as THREE from 'three';

export interface MaterialPBRProps {
  color: string;
  metalness: number;
  roughness: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
}

export const TUBE_COLOR_PALETTE: Record<string, string> = {
  silver: '#b8c3c8',
  blue: '#245d96',
  black: '#283035',
  red: '#ad3831',
  brass: '#c9a34e',
  unknown: '#9aa8ad',
};

export const BASE_COLOR_PALETTE: Record<string, string> = {
  black: '#232a2e',
  silver: '#a8b3b8',
  wood: '#b98b56',
  white: '#dcded8',
  blue_enamel: '#264b6e',
  unknown: '#6e7c80',
};

export function resolveMaterialPBR(kind?: string): MaterialPBRProps {
  switch (kind) {
    case 'stainless_steel':
      return { color: '#cbd4d8', metalness: 0.88, roughness: 0.24 };
    case 'metal':
      return { color: '#b8c3c8', metalness: 0.82, roughness: 0.31 };
    case 'cast_iron':
      return { color: '#242b2f', metalness: 0.58, roughness: 0.58 };
    case 'painted_metal':
      return { color: '#2c5e8a', metalness: 0.42, roughness: 0.38 };
    case 'plastic':
      return { color: '#32383d', metalness: 0.04, roughness: 0.52 };
    case 'wood':
      return { color: '#bc8f5a', metalness: 0.0, roughness: 0.78 };
    default:
      return { color: '#829094', metalness: 0.35, roughness: 0.5 };
  }
}

/**
 * Generates a subtle brushed-metal normal/roughness variation texture.
 */
export function createBrushedMetalTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#d8dfe2';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y++) {
      const shade = 210 + Math.round(Math.sin(y * 0.7) * 8 + ((y * 17) % 9) - 4);
      ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 4})`;
      ctx.fillRect(0, y, 256, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a realistic hardwood / birch laminate grain texture.
 */
export function createWoodGrainTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x += 4) {
        const wave =
          Math.sin(y * 0.14 + Math.sin(x * 0.05) * 2.4) +
          0.4 * Math.sin(y * 0.48 + x * 0.03);
        const r = Math.round(Math.max(155, Math.min(225, 192 + wave * 16)));
        const g = Math.round(r * 0.76);
        const b = Math.round(r * 0.48);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, 4, 1);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a high-resolution laser-engraved protractor dial texture (2048x2048)
 * supporting 0.5-degree hairline ticks, 1-degree graduations, 5-degree accented ticks,
 * 10-degree labeled ticks, Vernier sub-scale plates (0.1° resolution), and gravity plumb-bob scales.
 */
export function createEngravedProtractorTexture(
  style: 'circular_dial' | 'printed_arc' | 'vernier_protract' | 'housing_plumb' = 'circular_dial'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = 1024;
    const cy = 1024;
    const outerR = 920;
    const scaleR = 820;

    ctx.clearRect(0, 0, 2048, 2048);

    if (style === 'circular_dial' || style === 'vernier_protract' || style === 'housing_plumb') {
      // 1. Brushed metallic / satin enamel dial plate
      const grad = ctx.createRadialGradient(cx - 120, cy - 120, 80, cx, cy, outerR);
      if (style === 'vernier_protract') {
        grad.addColorStop(0, 'rgba(240, 244, 248, 0.99)');
        grad.addColorStop(0.7, 'rgba(215, 224, 230, 0.98)');
        grad.addColorStop(1, 'rgba(182, 194, 202, 0.99)');
      } else if (style === 'housing_plumb') {
        grad.addColorStop(0, 'rgba(255, 255, 252, 0.99)');
        grad.addColorStop(0.65, 'rgba(244, 242, 230, 0.98)');
        grad.addColorStop(1, 'rgba(220, 216, 198, 0.99)');
      } else {
        grad.addColorStop(0, 'rgba(252, 250, 242, 0.98)');
        grad.addColorStop(0.7, 'rgba(236, 232, 218, 0.97)');
        grad.addColorStop(1, 'rgba(208, 202, 186, 0.98)');
      }
      ctx.fillStyle = grad;
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Outer precision chamfer & mounting screw reliefs
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.45)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR - 22, 0, Math.PI * 2);
      ctx.stroke();

      // 4 Precision Perimeter Countersunk Hex Screws
      for (const ang of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
        const sx = cx + Math.cos(ang) * (outerR - 55);
        const sy = cy + Math.sin(ang) * (outerR - 55);
        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.arc(sx, sy, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Hex socket recess
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        for (let h = 0; h < 6; h++) {
          const hAng = ang + (h * Math.PI) / 3;
          const hx = sx + Math.cos(hAng) * 11;
          const hy = sy + Math.sin(hAng) * 11;
          if (h === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.fill();
      }

      // Concentric machined index groove rings
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, scaleR + 24, 0, Math.PI * 2);
      ctx.arc(cx, cy, scaleR - 110, 0, Math.PI * 2);
      ctx.arc(cx, cy, 260, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Quadrant arc plate background
      ctx.fillStyle = 'rgba(250, 248, 238, 0.98)';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, Math.PI * 0.5, Math.PI, false);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(51, 65, 85, 0.35)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, scaleR + 20, Math.PI * 0.5, Math.PI);
      ctx.stroke();
    }

    // 2. Main degree arc baseline
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    if (style === 'printed_arc') {
      ctx.arc(cx, cy, scaleR, Math.PI * 0.5, Math.PI);
    } else if (style === 'housing_plumb') {
      ctx.arc(cx, cy, scaleR, 0, Math.PI * 2);
    } else {
      ctx.arc(cx, cy, scaleR, Math.PI * 1.5, Math.PI * 2);
    }
    ctx.stroke();

    // Secondary inner baseline for scale framing
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (style === 'printed_arc') {
      ctx.arc(cx, cy, scaleR - 64, Math.PI * 0.5, Math.PI);
    } else if (style === 'housing_plumb') {
      ctx.arc(cx, cy, scaleR - 64, 0, Math.PI * 2);
    } else {
      ctx.arc(cx, cy, scaleR - 64, Math.PI * 1.5, Math.PI * 2);
    }
    ctx.stroke();

    // 3. Precision Graduations (0.5° fine, 1° standard, 5° accented, 10° major)
    const maxDeg = style === 'housing_plumb' ? 360 : 90;
    const step = 0.5;

    for (let deg = 0; deg <= maxDeg; deg += step) {
      if (style !== 'housing_plumb' && deg > 90) break;

      const rad = (deg * Math.PI) / 180;
      let sx: number;
      let sy: number;

      if (style === 'printed_arc') {
        sx = -Math.cos(rad);
        sy = Math.sin(rad);
      } else if (style === 'housing_plumb') {
        // In housing plumb bob, angle 0 is straight down (rad = Math.PI * 0.5)
        // or standard circular quadrant
        sx = Math.cos(rad);
        sy = Math.sin(rad);
      } else {
        sx = Math.cos(rad);
        sy = -Math.sin(rad);
      }

      const isMajor10 = Math.abs(deg % 10) < 1e-4;
      const isMed5 = !isMajor10 && Math.abs(deg % 5) < 1e-4;
      const isOne1 = !isMajor10 && !isMed5 && Math.abs(deg % 1) < 1e-4;

      let tickLen: number;
      let lineW: number;
      let strokeCol: string;

      if (isMajor10) {
        tickLen = 64;
        lineW = 6.0;
        strokeCol = '#0f172a';
      } else if (isMed5) {
        tickLen = 44;
        lineW = 4.0;
        strokeCol = '#1e293b';
      } else if (isOne1) {
        tickLen = 28;
        lineW = 2.4;
        strokeCol = '#334155';
      } else {
        // 0.5° subtle hairline tick
        tickLen = 16;
        lineW = 1.4;
        strokeCol = '#64748b';
      }

      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.moveTo(cx + sx * scaleR, cy + sy * scaleR);
      ctx.lineTo(cx + sx * (scaleR - tickLen), cy + sy * (scaleR - tickLen));
      ctx.stroke();

      // 5° Diamond Accent Markers along baseline
      if (isMed5) {
        const diaR = scaleR + 9;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.moveTo(cx + sx * (diaR + 7), cy + sy * (diaR + 7));
        ctx.lineTo(cx + (sx * diaR - sy * 5), cy + (sy * diaR + sx * 5));
        ctx.lineTo(cx + sx * (diaR - 7), cy + sy * (diaR - 7));
        ctx.lineTo(cx + (sx * diaR + sy * 5), cy + (sy * diaR - sx * 5));
        ctx.closePath();
        ctx.fill();
      }

      // Major Numerals
      if (isMajor10) {
        const displayDeg = style === 'housing_plumb' ? ((deg <= 180 ? deg : 360 - deg) % 91) : Math.round(deg);
        if (displayDeg % 10 === 0) {
          ctx.save();
          const numR = scaleR - 110;
          const nx = cx + sx * numR;
          const ny = cy + sy * numR;
          ctx.translate(nx, ny);

          // Radially rotate numerals for ergonomic instrument alignment
          const rotAngle = Math.atan2(sy, sx) + Math.PI / 2;
          ctx.rotate(rotAngle);

          ctx.font = 'bold 44px "Arial Black", Arial, sans-serif';
          ctx.fillStyle = '#0f172a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${displayDeg}°`, 0, 0);

          // Secondary complementary zenith numerals for circular & vernier
          if (style === 'circular_dial' || style === 'vernier_protract') {
            const zenithDeg = 90 - displayDeg;
            if (zenithDeg >= 0) {
              ctx.font = 'bold 26px Arial, sans-serif';
              ctx.fillStyle = '#64748b';
              ctx.fillText(`${zenithDeg}`, 0, 40);
            }
          }
          ctx.restore();
        }
      }
    }

    // 4. Laser-Etched Vernier Sub-Scale Auxiliary Plate (0.1° / 6 arc-minute resolution)
    if (style === 'vernier_protract') {
      ctx.save();
      const vPlateInnerR = 300;
      const vPlateOuterR = 430;
      const vStartAng = Math.PI * 1.55;
      const vEndAng = Math.PI * 1.82;

      ctx.fillStyle = 'rgba(226, 232, 240, 0.95)';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, vPlateOuterR, vStartAng, vEndAng, false);
      ctx.arc(cx, cy, vPlateInnerR, vEndAng, vStartAng, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Vernier division marks: 10 Vernier intervals span 9 main degrees (each 0.9°)
      ctx.font = 'bold 22px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let v = 0; v <= 10; v++) {
        const vAng = vStartAng + (v * 0.9 * Math.PI) / 180;
        const vx = Math.cos(vAng);
        const vy = Math.sin(vAng);
        const isV5 = v === 0 || v === 5 || v === 10;
        const vTick = isV5 ? 32 : 18;

        ctx.strokeStyle = isV5 ? '#0f172a' : '#475569';
        ctx.lineWidth = isV5 ? 4 : 2.4;
        ctx.beginPath();
        ctx.moveTo(cx + vx * vPlateOuterR, cy + vy * vPlateOuterR);
        ctx.lineTo(cx + vx * (vPlateOuterR - vTick), cy + vy * (vPlateOuterR - vTick));
        ctx.stroke();

        if (isV5) {
          ctx.fillStyle = '#0f172a';
          ctx.fillText(`${v}`, cx + vx * (vPlateOuterR - 48), cy + vy * (vPlateOuterR - 48));
        }
      }

      // Vernier plate legend
      ctx.font = 'bold 20px Arial, sans-serif';
      ctx.fillStyle = '#334155';
      ctx.fillText('VERNIER 0.1° (6\' ARC)', cx + 240, cy - 240);
      ctx.restore();
    }

    // 5. Authentic Instrument Calibration Markings & Typography
    ctx.save();
    if (style !== 'printed_arc') {
      ctx.font = 'bold 36px "Arial Black", Arial, sans-serif';
      ctx.fillStyle = '#1e293b';
      ctx.textAlign = 'center';
      ctx.fillText('EUROPA LAB INSTRUMENTS', cx, cy - 80);

      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText('PRECISION OPTICAL GONIOMETER', cx, cy - 40);
      ctx.fillText('ACCURACY ±0.1° • CALIBRATED 20°C', cx, cy - 10);

      // Center crosshair alignment reticle
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 70, cy);
      ctx.lineTo(cx + 70, cy);
      ctx.moveTo(cx, cy - 70);
      ctx.lineTo(cx, cy + 70);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, 35, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.font = 'bold 30px "Arial Black", Arial, sans-serif';
      ctx.fillStyle = '#1e293b';
      ctx.textAlign = 'center';
      ctx.fillText('BALTIC HARDWOOD QUADRANT', cx - 260, cy + 220);
      ctx.font = 'bold 22px Arial, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText('0°-90° INCLINATION SCALE', cx - 260, cy + 255);
    }
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates an authentic chemical-resistant black phenolic resin science lab countertop texture.
 * Features composite fiber speckle, organic resin flow mottling, and anisotropic sheen.
 */
export function createPhenolicBenchTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.CanvasTexture({} as any);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx && ctx.createImageData) {
    const imgData = ctx.createImageData(512, 512);
    const data = imgData ? imgData.data : null;
    if (data) {
      for (let i = 0; i < data.length; i += 4) {
        const p = i / 4;
        const x = p % 512;
        const y = Math.floor(p / 512);

        // Low-frequency resin curing flow waves
        const flow = Math.sin(x * 0.024 + y * 0.016) * 3.5 + Math.cos(x * 0.052 - y * 0.038) * 2.5;

        // Micro-scale composite paper/phenolic matrix flecks
        const hash = ((x * 1597 + y * 51749 + (x ^ y) * 23) % 1000) / 1000;
        const speckle = hash > 0.93 ? 14 : hash < 0.07 ? -10 : ((hash * 100) % 5) - 2;

        const baseVal = 42 + flow + speckle;
        data[i] = Math.max(22, Math.min(75, Math.round(baseVal * 0.92)));     // R (deep graphite)
        data[i + 1] = Math.max(26, Math.min(82, Math.round(baseVal * 1.01))); // G
        data[i + 2] = Math.max(30, Math.min(88, Math.round(baseVal * 1.07))); // B
        data[i + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 3);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates physical micro-roughness variations for the phenolic lab countertop
 * so directional classroom lighting produces realistic glints and anisotropic highlights.
 */
export function createBenchRoughnessTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.CanvasTexture({} as any);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx && ctx.createImageData) {
    const imgData = ctx.createImageData(256, 256);
    const data = imgData ? imgData.data : null;
    if (data) {
      for (let i = 0; i < data.length; i += 4) {
        const p = i / 4;
        const x = p % 256;
        const y = Math.floor(p / 256);
        const noise = ((x * 823 + y * 941) % 43) - 21;
        const streak = Math.sin(x * 0.025 + y * 0.45) > 0.93 ? 32 : 0;
        const v = Math.max(90, Math.min(185, 138 + noise + streak));
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 3);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates golden honey-oak wood grain with medullary rays and edge chamfering
 * for the solid hardwood laboratory bench under-apron frame.
 */
export function createOakApronTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.CanvasTexture({} as any);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Rich golden oak gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#caa266');
    grad.addColorStop(0.5, '#bd9253');
    grad.addColorStop(1, '#9b7138');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);

    // Flowing wood grain bands & medullary rays
    for (let y = 0; y < 256; y++) {
      const wave = Math.sin(y * 0.12 + Math.sin(y * 0.03) * 3) * 12 + Math.sin(y * 0.35) * 4;
      const alpha = 0.04 + Math.abs(Math.sin(y * 0.18 + wave * 0.05)) * 0.09;
      ctx.fillStyle = `rgba(85, 52, 18, ${alpha})`;
      ctx.fillRect(0, y, 512, 1.5);
    }

    // Fine wood fiber pores
    ctx.fillStyle = 'rgba(70, 42, 14, 0.12)';
    for (let i = 0; i < 600; i++) {
      const px = (i * 97) % 512;
      const py = (i * 131) % 256;
      const len = 4 + (i % 9);
      ctx.fillRect(px, py, len, 1);
    }

    // Top and bottom edge bevel shadowing for 3D realism
    const edgeShade = ctx.createLinearGradient(0, 0, 0, 256);
    edgeShade.addColorStop(0, 'rgba(0,0,0,0.22)');
    edgeShade.addColorStop(0.08, 'rgba(0,0,0,0)');
    edgeShade.addColorStop(0.92, 'rgba(0,0,0,0)');
    edgeShade.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = edgeShade;
    ctx.fillRect(0, 0, 512, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 1);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates turned hardwood maple/oak grain for circular laboratory stool seats.
 * Features radial growth rings, organic waviness, varnished amber tones, and recessed center finger grip.
 */
export function createStoolWoodSeatTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.CanvasTexture({} as any);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = 256;
    const cy = 256;
    const maxR = 248;

    // Background turned maple / beech warm base
    const radialBase = ctx.createRadialGradient(cx, cy, 10, cx, cy, maxR);
    radialBase.addColorStop(0, '#e5b275');   // Light warm center
    radialBase.addColorStop(0.7, '#cf9755'); // Rich amber wood
    radialBase.addColorStop(0.92, '#ab7236');// Darkened edge
    radialBase.addColorStop(1, '#683f19');   // Outer chamfer bevel
    ctx.fillStyle = radialBase;
    ctx.fillRect(0, 0, 512, 512);

    // Concentric lathe-turned growth rings with natural wood waviness
    for (let r = 8; r < maxR; r += 2) {
      const ringIntensity = Math.sin(r * 0.18 + Math.sin(r * 0.05) * 2.2);
      if (Math.abs(ringIntensity) > 0.3) {
        ctx.strokeStyle = ringIntensity > 0 ? 'rgba(96, 56, 20, 0.09)' : 'rgba(255, 230, 185, 0.07)';
        ctx.lineWidth = 1.4 + Math.abs(ringIntensity);
        ctx.beginPath();
        for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.08) {
          const wobble = Math.sin(a * 4 + r * 0.03) * 1.8 + Math.cos(a * 2) * 1.2;
          const rx = cx + Math.cos(a) * (r + wobble);
          const ry = cy + Math.sin(a) * (r + wobble);
          if (a === 0) ctx.moveTo(rx, ry);
          else ctx.lineTo(rx, ry);
        }
        ctx.stroke();
      }
    }

    // Classic school stool center recessed finger grip / mounting boss
    ctx.save();
    const centerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 38);
    centerGrad.addColorStop(0, 'rgba(40, 24, 10, 0.55)');
    centerGrad.addColorStop(0.65, 'rgba(65, 38, 16, 0.35)');
    centerGrad.addColorStop(0.9, 'rgba(255, 220, 170, 0.4)');
    centerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = centerGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 40, 0, Math.PI * 2);
    ctx.fill();

    // Center brass / dark mounting bolt collar
    ctx.fillStyle = '#422812';
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c59a46';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Outer perimeter bevel highlight ring
    ctx.strokeStyle = 'rgba(255, 240, 210, 0.35)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, 236, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(35, 18, 6, 0.6)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, 246, 0, Math.PI * 2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates an industrial powder-coated textured steel finish
 * for table legs, cross-braces, and stool base discs.
 */
export function createPowderCoatSteelTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.CanvasTexture({} as any);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx && ctx.createImageData) {
    const imgData = ctx.createImageData(256, 256);
    const data = imgData ? imgData.data : null;
    if (data) {
      for (let i = 0; i < data.length; i += 4) {
        const p = i / 4;
        const x = p % 256;
        const y = Math.floor(p / 256);
        const stipple = ((x * 491 + y * 853 + (x ^ y) * 17) % 31) - 15;
        const v = Math.max(30, Math.min(68, 46 + stipple));
        data[i] = Math.round(v * 0.94);     // R
        data[i + 1] = Math.round(v * 1.0);  // G
        data[i + 2] = Math.round(v * 1.06); // B
        data[i + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 6);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a calibrated laboratory landing mat grid texture
 * with metric grid divisions, alignment crosshair, and non-slip micro-texture.
 */
export function createLandingMatGridTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.CanvasTexture({} as any);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // High-contrast clean scientific mat base
    ctx.fillStyle = '#f4f5ee';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle vinyl/rubber texture noise
    ctx.fillStyle = 'rgba(0, 0, 0, 0.018)';
    for (let i = 0; i < 1200; i++) {
      const x = (i * 47) % 512;
      const y = (i * 89) % 512;
      ctx.fillRect(x, y, 2, 2);
    }

    // Minor grid (every 32 px = ~2.5 cm)
    ctx.strokeStyle = '#e0e4d7';
    ctx.lineWidth = 1;
    for (let p = 0; p <= 512; p += 32) {
      ctx.beginPath();
      ctx.moveTo(p, 0); ctx.lineTo(p, 512);
      ctx.moveTo(0, p); ctx.lineTo(512, p);
      ctx.stroke();
    }

    // Major grid (every 128 px = ~10 cm)
    ctx.strokeStyle = '#c4cbba';
    ctx.lineWidth = 1.8;
    for (let p = 0; p <= 512; p += 128) {
      ctx.beginPath();
      ctx.moveTo(p, 0); ctx.lineTo(p, 512);
      ctx.moveTo(0, p); ctx.lineTo(512, p);
      ctx.stroke();
    }

    // Center trajectory line with subtle teal crosshairs
    ctx.strokeStyle = 'rgba(13, 115, 119, 0.45)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, 256);
    ctx.lineTo(512, 256);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 2);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
