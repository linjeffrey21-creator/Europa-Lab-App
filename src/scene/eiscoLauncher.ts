/**
 * Eisco Labs Precision Projectile Launcher (Item # PH0343)
 * Authentic Three.js Procedural Assembly & Kinematics Rig
 * Source: Eisco Scientific PH0343 U-Channel Spring Launcher with Plumb-Bob Protractor
 */

import * as THREE from 'three';

export type EiscoRangeSetting = 'short' | 'medium' | 'long';
export type ProjectileMaterial = 'aluminum' | 'steel';

export interface EiscoLauncherOptions {
  initialAngleDeg?: number;       // -15° to +90°
  rangeSetting?: EiscoRangeSetting; // 'short' | 'medium' | 'long'
  projectileMaterial?: ProjectileMaterial;
  gravity?: number;               // m/s^2 (default 9.81)
}

export interface EiscoKinematics {
  angleDeg: number;
  rangeSetting: EiscoRangeSetting;
  muzzleVelocity: number;    // m/s
  predictedRange: number;    // m
  predictedRangeFeet: number;// ft
  maxHeight: number;         // m
  flightTime: number;        // s
}

export interface EiscoLauncherRig {
  root: THREE.Group;
  channelChassis: THREE.Group;
  tableClampGroup: THREE.Group;
  plumbBobString: THREE.Line;
  plumbBobWeight: THREE.Mesh;
  projectileMesh: THREE.Mesh;
  trajectoryLine: THREE.Line;
  velocityArrow: THREE.ArrowHelper;
  setAngleDeg: (deg: number) => void;
  setRangeSetting: (setting: EiscoRangeSetting) => void;
  setProjectileMaterial: (mat: ProjectileMaterial) => void;
  setWireframe: (wireframe: boolean) => void;
  setShowHelpers: (show: boolean) => void;
  fire: () => void;
  reset: () => void;
  update: (dt: number) => void;
  getKinematics: () => EiscoKinematics;
  getMuzzleWorldPos: () => THREE.Vector3;
}

const LAUNCH_VELOCITIES: Record<EiscoRangeSetting, Record<ProjectileMaterial, number>> = {
  short:  { aluminum: 3.5, steel: 2.8 },
  medium: { aluminum: 4.6, steel: 3.8 },
  long:   { aluminum: 5.6, steel: 4.6 },
};

function createEiscoFaceplateTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') {
    return new THREE.CanvasTexture({} as any);
  }

  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#c5cbd0';
  ctx.fillRect(0, 0, 2048, 1024);

  // Black side mounting brackets with bronze screws
  ctx.fillStyle = '#18181b';
  ctx.fillRect(0, 0, 160, 1024);
  ctx.fillRect(2048 - 160, 0, 160, 1024);

  const screwPts = [[80, 120], [80, 904], [1968, 120], [1968, 904]];
  screwPts.forEach(([sx, sy]) => {
    ctx.fillStyle = '#c59b4c';
    ctx.beginPath();
    ctx.arc(sx, sy, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a3d12';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(sx - 20, sy); ctx.lineTo(sx + 20, sy);
    ctx.moveTo(sx, sy - 20); ctx.lineTo(sx, sy + 20);
    ctx.stroke();
  });

  const cx = 1024;
  const cy = 320;

  // Eisco Logo Oval
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 84, 190, 72, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.font = 'bold 72px Inter, Arial, sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('eisco', cx, cy - 80);

  // Red brand accent dots above logo
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(cx - 76, cy - 124, 10, 0, Math.PI * 2);
  ctx.arc(cx - 60, cy - 134, 8, 0, Math.PI * 2);
  ctx.arc(cx - 46, cy - 120, 8, 0, Math.PI * 2);
  ctx.fill();

  // Pivot pin anchor
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(cx, cy, 16, 0, Math.PI * 2);
  ctx.fill();

  // 90° - 0° - 90° Protractor Arc Baseline
  const rArc = 490;
  ctx.strokeStyle = '#18181b';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, rArc, 0, Math.PI, false);
  ctx.stroke();

  // Inner scale framing line
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, rArc - 56, 0, Math.PI, false);
  ctx.stroke();

  // 0.5° fine graduations, 1° standard, 5° accented, 10° labeled
  for (let deg = -90; deg <= 90; deg += 0.5) {
    const screenAngle = Math.PI * 0.5 - ((deg * Math.PI) / 180.0);
    const cos = Math.cos(screenAngle);
    const sin = Math.sin(screenAngle);

    const isTen = Math.abs(deg % 10) < 1e-4;
    const isFive = !isTen && Math.abs(deg % 5) < 1e-4;
    const isOne = !isTen && !isFive && Math.abs(deg % 1) < 1e-4;

    const tLen = isTen ? 56 : isFive ? 36 : isOne ? 20 : 12;
    ctx.lineWidth = isTen ? 5.2 : isFive ? 3.2 : isOne ? 2.0 : 1.2;
    ctx.strokeStyle = isTen ? '#0f172a' : isFive ? '#1e293b' : '#334155';
    ctx.beginPath();
    ctx.moveTo(cx + cos * (rArc - tLen), cy + sin * (rArc - tLen));
    ctx.lineTo(cx + cos * rArc, cy + sin * rArc);
    ctx.stroke();

    if (isTen) {
      const labelRadius = rArc - 84;
      const lx = cx + cos * labelRadius;
      const ly = cy + sin * labelRadius;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(screenAngle - Math.PI * 0.5);
      ctx.font = 'bold 40px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0f172a';
      ctx.fillText(String(Math.abs(Math.round(deg))), 0, 0);
      ctx.restore();
    }
  }

  // Model & Calibration Subtitle
  ctx.font = 'bold 28px Inter, Arial, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.textAlign = 'center';
  ctx.fillText('MODEL PH0343 • ACCURACY ±0.5° • VERTICAL PLUMB INCLINOMETER', cx, cy + 80);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function createEiscoLauncher(
  options: EiscoLauncherOptions = {}
): EiscoLauncherRig {
  let angleDeg = options.initialAngleDeg ?? 25;
  let rangeSetting: EiscoRangeSetting = options.rangeSetting ?? 'long';
  let projMat: ProjectileMaterial = options.projectileMaterial ?? 'aluminum';
  let gravity = options.gravity ?? 9.81;

  const root = new THREE.Group();
  root.name = 'EiscoPH0343Root';

  // Materials
  const channelGreyMat = new THREE.MeshStandardMaterial({ color: 0xa8afb8, roughness: 0.45, metalness: 0.5 });
  const blackSteelMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.55, metalness: 0.65 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.18, metalness: 0.94 });
  const springSteelMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3, metalness: 0.85 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.28, metalness: 0.82 });
  const clampGreyMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.7, metalness: 0.1 });
  const cordMat = new THREE.LineBasicMaterial({ color: 0x1e293b });

  // Pivot point in local frame
  const pivotPos = new THREE.Vector3(0.55, 0.20, 0);

  // 1. Table Clamp (positioned under the channel near the pivot)
  const tableClampGroup = new THREE.Group();
  root.add(tableClampGroup);

  const clampArmGeo = new THREE.BoxGeometry(0.09, 0.68, 0.08);
  const clampArm = new THREE.Mesh(clampArmGeo, blackSteelMat);
  clampArm.position.set(pivotPos.x, -0.14, -0.10);
  clampArm.castShadow = true;
  tableClampGroup.add(clampArm);

  const clampKnobGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.12, 16);
  const clampKnob = new THREE.Mesh(clampKnobGeo, clampGreyMat);
  clampKnob.position.set(pivotPos.x, -0.52, -0.10);
  tableClampGroup.add(clampKnob);

  // 2. Open-Faced Grey U-Channel Chassis
  const channelChassis = new THREE.Group();
  channelChassis.position.copy(pivotPos);
  root.add(channelChassis);

  const channelLen = 2.5;
  const channelH = 0.46;
  const flangeDepth = 0.14;

  // Back Web of the channel (in the XY plane at Z = 0)
  const backWebGeo = new THREE.BoxGeometry(channelLen, channelH, 0.025);
  const backWeb = new THREE.Mesh(backWebGeo, channelGreyMat);
  backWeb.position.set(-0.25, 0, 0);
  backWeb.castShadow = true;
  channelChassis.add(backWeb);

  // Top Flange (projects forward toward +Z)
  const flangeGeo = new THREE.BoxGeometry(channelLen, 0.025, flangeDepth);
  const topFlange = new THREE.Mesh(flangeGeo, channelGreyMat);
  topFlange.position.set(-0.25, channelH * 0.5 - 0.012, flangeDepth * 0.5);
  channelChassis.add(topFlange);

  // Bottom Flange (projects forward toward +Z)
  const botFlange = new THREE.Mesh(flangeGeo, channelGreyMat);
  botFlange.position.set(-0.25, -channelH * 0.5 + 0.012, flangeDepth * 0.5);
  channelChassis.add(botFlange);

  // 3. Rectangular Faceplate with 90°-0°-90° Protractor
  const faceplateTex = createEiscoFaceplateTexture();
  const faceplateMat = new THREE.MeshStandardMaterial({ map: faceplateTex, roughness: 0.4, metalness: 0.2 });
  const faceplateGeo = new THREE.BoxGeometry(0.96, 0.46, 0.015);
  const faceplateMesh = new THREE.Mesh(faceplateGeo, faceplateMat);
  faceplateMesh.position.set(-0.95, 0, flangeDepth + 0.006);
  channelChassis.add(faceplateMesh);

  // Plumb Bob hanging straight down along -Y in world frame
  const plumbStringPts = [new THREE.Vector3(), new THREE.Vector3(0, -0.42, 0)];
  const plumbBobGeo = new THREE.BufferGeometry().setFromPoints(plumbStringPts);
  const plumbBobString = new THREE.Line(plumbBobGeo, cordMat);
  root.add(plumbBobString);

  // Precision Lathe-Turned Solid Brass Plumb Bob Mechanism
  const bobGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.045, 20);
  const plumbBobWeight = new THREE.Mesh(bobGeo, brassMat);

  // Knurled suspension neck collar
  const bobNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.012, 0.014, 16), brassMat);
  bobNeck.position.set(0, 0.026, 0);
  plumbBobWeight.add(bobNeck);

  // Top suspension eyelet loop
  const eyelet = new THREE.Mesh(new THREE.TorusGeometry(0.007, 0.002, 10, 16), brassMat);
  eyelet.position.set(0, 0.038, 0);
  plumbBobWeight.add(eyelet);

  // Concentric lathe groove ring
  const groove = new THREE.Mesh(new THREE.TorusGeometry(0.0165, 0.0015, 8, 20), chromeMat);
  groove.rotation.x = Math.PI / 2;
  plumbBobWeight.add(groove);

  // Machined conical needle pointer tip pointing down at the scale graduations
  const bobTip = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.048, 20), brassMat);
  bobTip.position.set(0, -0.042, 0);
  bobTip.rotation.x = Math.PI;
  plumbBobWeight.add(bobTip);

  root.add(plumbBobWeight);

  // Dual Optical Photogate Timing Beam Assembly at Muzzle Exit
  const photogateGroup = new THREE.Group();
  photogateGroup.position.set(1.00, 0.08, flangeDepth * 0.5);

  const pgMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.6 });
  const pgMount = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.024, 0.032), pgMat);
  pgMount.position.set(0.06, -0.065, 0);
  photogateGroup.add(pgMount);

  for (const gx of [0.03, 0.12]) {
    const forkBase = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.016, 0.15), pgMat);
    forkBase.position.set(gx, -0.065, 0);
    photogateGroup.add(forkBase);

    for (const sz of [-0.07, 0.07]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.14, 0.016), pgMat);
      arm.position.set(gx, 0.005, sz);
      photogateGroup.add(arm);

      // IR optical eye
      const eyeMat = sz < 0
        ? new THREE.MeshBasicMaterial({ color: 0xef4444 })
        : new THREE.MeshBasicMaterial({ color: 0x090d16 });
      const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.006, 12), eyeMat);
      eye.rotation.x = Math.PI * 0.5;
      eye.position.set(gx, 0, sz - (sz < 0 ? -0.006 : 0.006));
      photogateGroup.add(eye);
    }

    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.004, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x22c55e })
    );
    led.position.set(gx, 0.075, -0.07);
    photogateGroup.add(led);
  }
  channelChassis.add(photogateGroup);

  // 4. Central Black Bridge Block & Dual Guide Rods
  const bridgeGeo = new THREE.BoxGeometry(0.18, 0.42, 0.11);
  const bridge = new THREE.Mesh(bridgeGeo, blackSteelMat);
  bridge.position.set(-0.35, 0, flangeDepth * 0.5);
  channelChassis.add(bridge);

  // Main Cocking Rod (upper, at y = 0.08)
  const mainRodGeo = new THREE.CylinderGeometry(0.012, 0.012, 1.45, 16);
  mainRodGeo.rotateZ(Math.PI * 0.5);
  const mainRod = new THREE.Mesh(mainRodGeo, chromeMat);
  mainRod.position.set(0.05, 0.08, flangeDepth * 0.5);
  channelChassis.add(mainRod);

  // Auxiliary Guide Rod (lower, at y = -0.05)
  const auxRodGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.95, 16);
  auxRodGeo.rotateZ(Math.PI * 0.5);
  const auxRod = new THREE.Mesh(auxRodGeo, chromeMat);
  auxRod.position.set(-0.15, -0.05, flangeDepth * 0.5);
  channelChassis.add(auxRod);

  // Dual Helical Compression Springs Group
  const springGroup = new THREE.Group();
  channelChassis.add(springGroup);

  function rebuildSprings(setting: EiscoRangeSetting) {
    while (springGroup.children.length > 0) {
      const child = springGroup.children[0] as THREE.Mesh;
      if (child.geometry) child.geometry.dispose();
      springGroup.remove(child);
    }

    const startX = setting === 'short' ? -0.55 : setting === 'medium' ? -0.68 : -0.82;
    const endX = -0.37;

    const makeSpringMesh = (y: number) => {
      const pts: THREE.Vector3[] = [];
      const coils = 16;
      for (let i = 0; i <= 90; i++) {
        const t = i / 90;
        const x = startX + (endX - startX) * t;
        const theta = t * coils * Math.PI * 2;
        pts.push(new THREE.Vector3(x, y + Math.sin(theta) * 0.028, flangeDepth * 0.5 + Math.cos(theta) * 0.028));
      }
      return new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.007, 6, false),
        springSteelMat
      );
    };

    springGroup.add(makeSpringMesh(0.08));
    springGroup.add(makeSpringMesh(-0.05));
  }

  rebuildSprings(rangeSetting);

  // Piston Pusher Collar that slides along the guide rod
  const pusherCollarGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.06, 16);
  pusherCollarGeo.rotateZ(Math.PI * 0.5);
  const pusherCollar = new THREE.Mesh(pusherCollarGeo, chromeMat);
  pusherCollar.position.set(0.48, 0.08, flangeDepth * 0.5);
  channelChassis.add(pusherCollar);

  // 5. Single 19mm Drilled Projectile Sphere with Hole
  const ballGeo = new THREE.SphereGeometry(0.068, 28, 28);
  const projectileMesh = new THREE.Mesh(
    ballGeo,
    new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.20, metalness: 0.88 })
  );
  projectileMesh.castShadow = true;

  const ballHoleGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.14, 16);
  ballHoleGeo.rotateZ(Math.PI * 0.5);
  const ballHoleMesh = new THREE.Mesh(ballHoleGeo, new THREE.MeshBasicMaterial({ color: 0x090d16 }));
  projectileMesh.add(ballHoleMesh);
  root.add(projectileMesh);

  // Trajectory Line & Vector Helpers
  const trajMat = new THREE.LineDashedMaterial({ color: 0x10b981, dashSize: 0.08, gapSize: 0.05 });
  const trajectoryLine = new THREE.Line(new THREE.BufferGeometry(), trajMat);
  root.add(trajectoryLine);

  const velocityArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.6, 0x38bdf8, 0.12, 0.06);
  root.add(velocityArrow);

  let isFiring = false;
  let simTime = 0;
  const visualScale = 0.55;

  /**
   * Calculates the exact muzzle launch exit coordinate in root space,
   * accounting for both the 1.00m channel reach and the +0.08m rod elevation!
   */
  function getMuzzleWorldPos(): THREE.Vector3 {
    const rad = (angleDeg * Math.PI) / 180;
    const localMuzzleX = 1.00;
    const localMuzzleY = 0.08;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return new THREE.Vector3(
      pivotPos.x + (localMuzzleX * cos - localMuzzleY * sin),
      pivotPos.y + (localMuzzleX * sin + localMuzzleY * cos),
      flangeDepth * 0.5
    );
  }

  function syncState() {
    channelChassis.rotation.z = (angleDeg * Math.PI) / 180;

    // Plumb bob hangs straight down in XY plane from the printed protractor pivot pin center:
    // cx = 512, cy = 160 on a 1024x512 canvas -> (256 - 160) / 512 * 0.46 = 0.08625m
    const pinLocal = new THREE.Vector3(-0.95, 0.08625, flangeDepth + 0.02);
    pinLocal.applyAxisAngle(new THREE.Vector3(0, 0, 1), (angleDeg * Math.PI) / 180);
    const pinWorld = new THREE.Vector3().addVectors(pivotPos, pinLocal);

    const stringLen = 0.44;
    const bobWorld = new THREE.Vector3(pinWorld.x, pinWorld.y - stringLen, pinWorld.z);

    plumbStringPts[0].copy(pinWorld);
    plumbStringPts[1].copy(bobWorld);
    plumbBobString.geometry.setFromPoints(plumbStringPts);
    plumbBobWeight.position.set(bobWorld.x, bobWorld.y - 0.04, bobWorld.z);

    const v0Real = LAUNCH_VELOCITIES[rangeSetting][projMat];
    const rad = (angleDeg * Math.PI) / 180;
    const muzzle = getMuzzleWorldPos();
    const dir = new THREE.Vector3(Math.cos(rad), Math.sin(rad), 0).normalize();

    velocityArrow.position.copy(muzzle);
    velocityArrow.setDirection(dir);
    velocityArrow.setLength(0.4 + (v0Real / 6.0) * 0.45, 0.12, 0.06);

    const v0 = v0Real * visualScale;
    const gScaled = gravity * visualScale;
    const vx = v0 * Math.cos(rad);
    const vy = v0 * Math.sin(rad);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 65; i++) {
      const t = (i / 65) * 1.6;
      const x = muzzle.x + vx * t;
      const y = muzzle.y + vy * t - 0.5 * gScaled * t * t;
      pts.push(new THREE.Vector3(x, y, muzzle.z));
      if (y < -0.42 && i > 3) break;
    }
    trajectoryLine.geometry.dispose();
    trajectoryLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    trajectoryLine.computeLineDistances();

    if (!isFiring) {
      projectileMesh.position.copy(muzzle);
    }
  }

  syncState();

  return {
    root,
    channelChassis,
    tableClampGroup,
    plumbBobString,
    plumbBobWeight,
    projectileMesh,
    trajectoryLine,
    velocityArrow,
    getMuzzleWorldPos,
    setAngleDeg(deg: number) {
      angleDeg = Math.max(-15, Math.min(90, deg));
      isFiring = false;
      syncState();
    },
    setRangeSetting(setting: EiscoRangeSetting) {
      rangeSetting = setting;
      rebuildSprings(setting);
      isFiring = false;
      syncState();
    },
    setProjectileMaterial(mat: ProjectileMaterial) {
      projMat = mat;
      if (mat === 'steel') {
        (projectileMesh.material as THREE.MeshStandardMaterial).color.setHex(0x334155);
      } else {
        (projectileMesh.material as THREE.MeshStandardMaterial).color.setHex(0xe2e8f0);
      }
      isFiring = false;
      syncState();
    },
    setWireframe(wireframe: boolean) {
      root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = (obj as THREE.Mesh).material;
          if (Array.isArray(m)) {
            m.forEach((mat) => ((mat as THREE.MeshStandardMaterial).wireframe = wireframe));
          } else {
            (m as THREE.MeshStandardMaterial).wireframe = wireframe;
          }
        }
      });
    },
    setShowHelpers(show: boolean) {
      trajectoryLine.visible = show;
      velocityArrow.visible = show;
    },
    fire() {
      simTime = 0;
      isFiring = true;
    },
    reset() {
      isFiring = false;
      simTime = 0;
      syncState();
    },
    update(dt: number) {
      if (!isFiring) return;
      simTime += dt;
      const rad = (angleDeg * Math.PI) / 180;
      const muzzle = getMuzzleWorldPos();
      const v0 = LAUNCH_VELOCITIES[rangeSetting][projMat] * visualScale;
      const gScaled = gravity * visualScale;
      const x = muzzle.x + v0 * Math.cos(rad) * simTime;
      const y = muzzle.y + v0 * Math.sin(rad) * simTime - 0.5 * gScaled * simTime * simTime;
      projectileMesh.position.set(x, Math.max(-0.44, y), muzzle.z);
      if (y <= -0.44 && simTime > 0.08) {
        isFiring = false;
      }
    },
    getKinematics(): EiscoKinematics {
      const v0 = LAUNCH_VELOCITIES[rangeSetting][projMat];
      const rad = (angleDeg * Math.PI) / 180;
      const vy = v0 * Math.sin(rad);
      const vx = v0 * Math.cos(rad);
      const h0 = 0.35;
      const flightTime = (vy + Math.sqrt(vy * vy + 2 * gravity * h0)) / gravity;
      const predictedRange = vx * flightTime;
      const predictedRangeFeet = predictedRange * 3.28084;
      const maxHeight = h0 + (vy > 0 ? (vy * vy) / (2 * gravity) : 0);
      return {
        angleDeg,
        rangeSetting,
        muzzleVelocity: v0,
        predictedRange,
        predictedRangeFeet,
        maxHeight,
        flightTime,
      };
    },
  };
}
