/**
 * Boreal Fundamentals of Physics Projectile Launcher (Item #8884857)
 * Authentic Three.js Procedural Assembly & Kinematics Rig
 * Source: Boreal Science / VWR Product 8884857
 */

import * as THREE from 'three';

export type CompressionNotch = 1 | 2 | 3 | 4 | 5;

export interface ProjectileLauncherOptions {
  initialAngleDeg?: number;       // 0° (horizontal left) to 90° (vertical down-to-up)
  initialNotch?: CompressionNotch; // 1..5 spring compression settings
  gravity?: number;               // m/s^2 (default 9.81)
}

export interface ProjectileKinematics {
  angleDeg: number;
  notch: CompressionNotch;
  muzzleSpeed: number;     // m/s
  expectedRange: number;   // m
  maxHeight: number;       // m
  flightTime: number;      // s
}

export interface ProjectileLauncherRig {
  root: THREE.Group;
  backboardGroup: THREE.Group;
  sideStandGroup: THREE.Group;
  pivotArmGroup: THREE.Group;
  springPlungerGroup: THREE.Group;
  projectileGroup: THREE.Group;
  setAngleDeg: (deg: number) => void;
  setCompressionNotch: (notch: CompressionNotch) => void;
  setGravity: (g: number) => void;
  setExplodedView: (exploded: boolean) => void;
  setWireframe: (wireframe: boolean) => void;
  setShowVectors: (visible: boolean) => void;
  setShowTrajectory: (visible: boolean) => void;
  fire: () => void;
  resetProjectile: () => void;
  update: (dt: number) => void;
  getKinematics: () => ProjectileKinematics;
  getMuzzleWorldPosition: () => THREE.Vector3;
}

const NOTCH_SPEEDS: Record<CompressionNotch, number> = {
  1: 4.5,
  2: 5.7,
  3: 6.8,
  4: 7.9,
  5: 9.0,
};

/**
 * Generates the high-DPI canvas texture for the tan MDF backboard,
 * including the 0°-90° curved protractor scale and "PROJECTILE LAUNCHER" stencil.
 */
let backboardTexture: THREE.CanvasTexture | undefined;

function createBackboardProtractorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Warm MDF wood base
  const grad = ctx.createLinearGradient(0, 0, 1024, 1024);
  grad.addColorStop(0, '#dfbf96');
  grad.addColorStop(0.5, '#d4ae83');
  grad.addColorStop(1, '#c89e70');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle wood fiber grain lines
  ctx.strokeStyle = 'rgba(115, 78, 40, 0.05)';
  ctx.lineWidth = 1.8;
  for (let i = 0; i < 180; i++) {
    const y = (i * 1024) / 180;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y + ((i % 3) - 1) * 5);
    ctx.stroke();
  }

  // Protractor pivot in UV canvas coordinates
  const px = 860;
  const py = 135;

  // Flush Guide Slot Cutout (drawn directly on face with zero protruding 3D geometry)
  const slotR = 540;
  const slotWidth = 24;
  ctx.save();
  ctx.beginPath();
  ctx.arc(px, py, slotR, Math.PI * 0.51, Math.PI * 0.99, false);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = slotWidth + 4;
  ctx.stroke();
  ctx.strokeStyle = '#2b1d11';
  ctx.lineWidth = slotWidth;
  ctx.stroke();
  ctx.restore();

  // Dual-band Protractor Scale
  const rOuter = 744; // Outer border of upper tick band
  const rMid = 672;   // Mid-arc separating upper tick band and lower boxed numbers
  const rInner = 600; // Inner border of boxed number band

  ctx.strokeStyle = '#1e1b18';
  ctx.fillStyle = '#1e1b18';

  // Three concentric arc borders
  [rInner, rMid, rOuter].forEach((r, idx) => {
    ctx.lineWidth = idx === 1 ? 2.0 : 3.2;
    ctx.beginPath();
    ctx.arc(px, py, r, Math.PI * 0.49, Math.PI * 1.01, false);
    ctx.stroke();
  });

  function degToRad(deg: number) {
    return Math.PI - (deg * Math.PI) / 180.0;
  }

  // Draw 1-degree, 5-degree, and 10-degree graduation ticks
  for (let deg = 0; deg <= 90; deg++) {
    const rad = degToRad(deg);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const isMajor = deg % 10 === 0;
    const isFive = deg % 5 === 0 && !isMajor;

    // Both 10° major marks and 5° marks extend down to rInner to form the boxed cells
    const tickStart = (isMajor || isFive) ? rInner : rMid + 26;
    const tickEnd = rOuter;

    ctx.lineWidth = isMajor ? 3.2 : isFive ? 2.2 : 1.3;
    ctx.beginPath();
    ctx.moveTo(px + cos * tickStart, py + sin * tickStart);
    ctx.lineTo(px + cos * tickEnd, py + sin * tickEnd);
    ctx.stroke();

    // Downward pointer triangles at each 5° mark in the upper band
    if (isFive) {
      const wSpan = 0.009;
      ctx.beginPath();
      ctx.moveTo(px + cos * rMid, py + sin * rMid);
      ctx.lineTo(px + Math.cos(rad - wSpan) * (rMid + 22), py + Math.sin(rad - wSpan) * (rMid + 22));
      ctx.lineTo(px + Math.cos(rad + wSpan) * (rMid + 22), py + Math.sin(rad + wSpan) * (rMid + 22));
      ctx.closePath();
      ctx.fill();
    }
  }

  // Draw Boxed Angle Numbers (Each digit centered in its own dedicated 5° cell)
  const labelRadius = (rInner + rMid) * 0.5;
  ctx.font = 'bold 26px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 0° cell (spanning 0° to 5°)
  const rad0 = degToRad(2.5);
  ctx.save();
  ctx.translate(px + Math.cos(rad0) * labelRadius, py + Math.sin(rad0) * labelRadius);
  ctx.rotate(rad0 - Math.PI * 0.5);
  ctx.fillText('0', 0, 0);
  ctx.restore();

  // 10° through 90° boxed numbers
  for (let deg = 10; deg <= 90; deg += 10) {
    const str = String(deg);
    const digitTens = str[0];
    const digitUnits = str[1];

    // Tens digit in the (deg - 2.5°) cell
    const radTens = degToRad(deg - 2.5);
    ctx.save();
    ctx.translate(px + Math.cos(radTens) * labelRadius, py + Math.sin(radTens) * labelRadius);
    ctx.rotate(radTens - Math.PI * 0.5);
    ctx.fillText(digitTens, 0, 0);
    ctx.restore();

    // Units digit in the (deg + 2.5°) cell
    const radUnits = degToRad(deg + 2.5);
    ctx.save();
    ctx.translate(px + Math.cos(radUnits) * labelRadius, py + Math.sin(radUnits) * labelRadius);
    ctx.rotate(radUnits - Math.PI * 0.5);
    ctx.fillText(digitUnits, 0, 0);
    ctx.restore();
  }

  // Stencil Title at Bottom-Left: "PROJECTILE LAUNCHER"
  ctx.fillStyle = '#1e1b18';
  ctx.font = '800 68px Inter, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('PROJECTILE', 52, 835);
  ctx.fillText('LAUNCHER', 52, 908);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Builds the complete 3D Projectile Launcher assembly matching the Boreal Science #8884857 reference.
 */
export function createProjectileLauncher(
  options: ProjectileLauncherOptions = {}
): ProjectileLauncherRig {
  let angleDeg = options.initialAngleDeg ?? 36;
  let notch: CompressionNotch = options.initialNotch ?? 3;
  let gravity = options.gravity ?? 9.81;

  const root = new THREE.Group();
  root.name = 'BorealProjectileLauncherRoot';

  const backboardGroup = new THREE.Group();
  const sideStandGroup = new THREE.Group();
  const pivotArmGroup = new THREE.Group();
  const springPlungerGroup = new THREE.Group();
  const projectileGroup = new THREE.Group();

  root.add(backboardGroup, sideStandGroup, pivotArmGroup, projectileGroup);

  // Materials
  const mdfTex = backboardTexture ??= createBackboardProtractorTexture();
  const mdfFrontMat = new THREE.MeshStandardMaterial({
    map: mdfTex,
    roughness: 0.78,
    metalness: 0.04,
  });
  const mdfEdgeMat = new THREE.MeshStandardMaterial({
    color: 0xb99163,
    roughness: 0.82,
    metalness: 0.04,
  });
  const woodArmMat = new THREE.MeshStandardMaterial({
    color: 0xc89f72,
    roughness: 0.7,
    metalness: 0.05,
  });
  const blueAnodizedMat = new THREE.MeshStandardMaterial({
    color: 0x1d4ed8,
    roughness: 0.26,
    metalness: 0.78,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.2,
    metalness: 0.9,
  });
  const springSteelMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.3,
    metalness: 0.85,
  });
  const ballMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.18,
    metalness: 0.65,
  });

  // 1. Backboard Plate (2.2 x 2.1 x 0.09)
  const boardW = 2.2;
  const boardH = 2.1;
  const boardD = 0.09;
  const boardGeo = new THREE.BoxGeometry(boardW, boardH, boardD);
  const boardMaterials = [
    mdfEdgeMat, mdfEdgeMat, mdfEdgeMat, mdfEdgeMat,
    mdfFrontMat, mdfEdgeMat,
  ];
  const boardMesh = new THREE.Mesh(boardGeo, boardMaterials);
  boardMesh.castShadow = true;
  boardMesh.receiveShadow = true;
  backboardGroup.add(boardMesh);

  // Pivot coordinate in local space (top-right corner of backboard)
  const pivotPos = new THREE.Vector3(0.73, 0.75, 0);

  // Guide slot radius constant (cutout rendered cleanly on the backboard face)
  const slotRadius = 1.24;

  // 2. Right Vertical Stabilizer Leg / Table Bracket + 2 Hex Bolts
  const legGeo = new THREE.BoxGeometry(0.14, 1.52, 0.28);
  const legMesh = new THREE.Mesh(legGeo, woodArmMat);
  legMesh.position.set(boardW * 0.5 + 0.07, -0.72, 0.02);
  legMesh.castShadow = true;
  sideStandGroup.add(legMesh);
  const rearSupport = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.54, 0.26), woodArmMat);
  rearSupport.position.set(-boardW * 0.38, -1.21, -0.10);
  rearSupport.castShadow = true;
  sideStandGroup.add(rearSupport);

  [-0.25, -0.58].forEach((by) => {
    const boltGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.22, 6);
    boltGeo.rotateZ(Math.PI * 0.5);
    const bolt = new THREE.Mesh(boltGeo, chromeMat);
    bolt.position.set(boardW * 0.5 + 0.09, by, 0.02);
    sideStandGroup.add(bolt);
  });

  // 3. Pivoting Anodized Blue Spring Barrel + Pivot Trunnion Bolt
  pivotArmGroup.position.copy(pivotPos);

  // Pivot Bolt passing through backboard from rear to barrel
  const pivotBoltGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.28, 16);
  pivotBoltGeo.rotateX(Math.PI * 0.5);
  const pivotBolt = new THREE.Mesh(pivotBoltGeo, chromeMat);
  pivotBolt.position.set(0, 0, 0.08);
  pivotBolt.castShadow = true;
  pivotArmGroup.add(pivotBolt);

  // Chrome Pivot Cap Nut on front of barrel
  const pivotCapGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.025, 20);
  pivotCapGeo.rotateX(Math.PI * 0.5);
  const pivotCap = new THREE.Mesh(pivotCapGeo, chromeMat);
  pivotCap.position.set(0, 0, 0.23);
  pivotArmGroup.add(pivotCap);

  // Machined barrel mounting collar connecting pivot bolt directly to blue cylinder
  const collarGeo = new THREE.BoxGeometry(0.20, 0.22, 0.16);
  const collarMesh = new THREE.Mesh(collarGeo, blueAnodizedMat);
  collarMesh.position.set(-0.02, -0.04, 0.16);
  collarMesh.castShadow = true;
  pivotArmGroup.add(collarMesh);

  // Blue Anodized Cylindrical Barrel (forward positioned at z = 0.16)
  // Length 1.52m, extending from x = -1.26 forward to muzzle at x = +0.26 (100% open to air)
  const barrelLength = 1.52;
  const barrelRadius = 0.095;
  const barrelGeo = new THREE.CylinderGeometry(barrelRadius, barrelRadius, barrelLength, 32);
  barrelGeo.rotateZ(Math.PI * 0.5);
  const barrelMesh = new THREE.Mesh(barrelGeo, blueAnodizedMat);
  barrelMesh.position.set(-0.50, -0.04, 0.16);
  barrelMesh.castShadow = true;
  pivotArmGroup.add(barrelMesh);

  // Dark Bore Opening recessed at the front Muzzle (x = +0.26)
  const boreGeo = new THREE.CylinderGeometry(0.074, 0.074, 0.05, 24);
  boreGeo.rotateZ(Math.PI * 0.5);
  const boreMat = new THREE.MeshBasicMaterial({ color: 0x090d16 });
  const boreMesh = new THREE.Mesh(boreGeo, boreMat);
  boreMesh.position.set(0.25, -0.04, 0.16);
  pivotArmGroup.add(boreMesh);

  // Muzzle Crown Aluminum Collar Ring
  const muzzleCrownGeo = new THREE.TorusGeometry(0.088, 0.012, 16, 32);
  muzzleCrownGeo.rotateY(Math.PI * 0.5);
  const muzzleCrown = new THREE.Mesh(muzzleCrownGeo, chromeMat);
  muzzleCrown.position.set(0.255, -0.04, 0.16);
  pivotArmGroup.add(muzzleCrown);

  // Dual Optical Photogate Timing Beam Assembly at Muzzle Exit
  const borealGates = new THREE.Group();
  borealGates.position.set(0.26, -0.04, 0.16);

  const pgBaseMat = new THREE.MeshStandardMaterial({ color: 0x181e24, roughness: 0.35, metalness: 0.7 });
  const pgClamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.024, 0.20), pgBaseMat);
  pgClamp.position.set(-0.02, -0.105, 0);
  borealGates.add(pgClamp);

  const pgRail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.018, 0.026), pgBaseMat);
  pgRail.position.set(0.06, -0.112, 0);
  borealGates.add(pgRail);

  for (const gx of [0.03, 0.13]) {
    const uBeam = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.016, 0.24), pgBaseMat);
    uBeam.position.set(gx, -0.112, 0);
    borealGates.add(uBeam);

    for (const zSide of [-0.12, 0.12]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.21, 0.020), pgBaseMat);
      arm.position.set(gx, 0, zSide);
      borealGates.add(arm);

      // IR optical eye
      const eyeMat = zSide < 0
        ? new THREE.MeshBasicMaterial({ color: 0xef4444 })
        : new THREE.MeshBasicMaterial({ color: 0x090d16 });
      const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.008, 12), eyeMat);
      eye.rotation.x = Math.PI * 0.5;
      eye.position.set(gx, 0, zSide - (zSide < 0 ? -0.008 : 0.008));
      borealGates.add(eye);
    }

    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.005, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x22c55e })
    );
    led.position.set(gx, 0.11, -0.12);
    borealGates.add(led);
  }
  pivotArmGroup.add(borealGates);

  // Slotted Side Window Cutout + 5 Cocking Notches on the Blue Barrel
  const slotWindowGeo = new THREE.BoxGeometry(0.72, 0.075, 0.04);
  const slotWindowMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.8,
  });
  const slotWindow = new THREE.Mesh(slotWindowGeo, slotWindowMat);
  slotWindow.position.set(-0.48, -0.04, 0.242);
  pivotArmGroup.add(slotWindow);

  // 5 Notch ribs along the barrel window
  for (let n = 0; n < 5; n++) {
    const ribGeo = new THREE.BoxGeometry(0.025, 0.038, 0.045);
    const rib = new THREE.Mesh(ribGeo, blueAnodizedMat);
    rib.position.set(-0.20 - n * 0.12, -0.012, 0.245);
    pivotArmGroup.add(rib);
  }

  // Lower Guide Screw riding along the 0°-90° slot
  const screwGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.26, 16);
  screwGeo.rotateX(Math.PI * 0.5);
  const guideScrew = new THREE.Mesh(screwGeo, chromeMat);
  guideScrew.position.set(-slotRadius, -0.06, 0.14);
  pivotArmGroup.add(guideScrew);

  // 4. Dynamic Helical Spring & Plunger Pin Assembly
  pivotArmGroup.add(springPlungerGroup);
  const plungerRodGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.12, 20);
  plungerRodGeo.rotateZ(Math.PI * 0.5);
  const plungerHead = new THREE.Mesh(plungerRodGeo, chromeMat);
  springPlungerGroup.add(plungerHead);

  const cockingPinGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.14, 12);
  cockingPinGeo.rotateX(Math.PI * 0.5);
  const cockingPin = new THREE.Mesh(cockingPinGeo, chromeMat);
  springPlungerGroup.add(cockingPin);

  let springMesh: THREE.Mesh | null = null;
  function rebuildSpringGeometry(currentNotch: CompressionNotch) {
    if (springMesh) {
      springPlungerGroup.remove(springMesh);
      springMesh.geometry.dispose();
    }
    const startX = -1.16;
    const endX = -0.16 - (currentNotch - 1) * 0.12;
    const coils = 9;
    const pts: THREE.Vector3[] = [];
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = startX + (endX - startX) * t;
      const theta = t * coils * Math.PI * 2;
      const y = -0.04 + Math.sin(theta) * 0.052;
      const z = 0.20 + Math.cos(theta) * 0.052;
      pts.push(new THREE.Vector3(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 100, 0.012, 8, false);
    springMesh = new THREE.Mesh(geo, springSteelMat);
    springPlungerGroup.add(springMesh);

    plungerHead.position.set(endX + 0.05, -0.04, 0.20);
    cockingPin.position.set(endX + 0.05, -0.02, 0.26);
  }

  // 5. Projectiles (Spare Ball on Table + Active Ball + Trajectory Arc)
  const ballGeo = new THREE.SphereGeometry(0.075, 28, 28);
  const spareBall = new THREE.Mesh(ballGeo, ballMat);
  spareBall.position.set(1.38, -1.40, 0.32);
  spareBall.castShadow = true;
  projectileGroup.add(spareBall);

  const activeBall = new THREE.Mesh(ballGeo, ballMat);
  activeBall.castShadow = true;
  projectileGroup.add(activeBall);

  // Trajectory Preview Line & Velocity Vector Arrow
  const trajMat = new THREE.LineDashedMaterial({
    color: 0x38bdf8,
    dashSize: 0.08,
    gapSize: 0.05,
  });
  const trajGeo = new THREE.BufferGeometry();
  const trajectoryLine = new THREE.Line(trajGeo, trajMat);
  projectileGroup.add(trajectoryLine);

  const velocityArrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 1, 0).normalize(),
    new THREE.Vector3(),
    0.75,
    0xf59e0b,
    0.14,
    0.08
  );
  projectileGroup.add(velocityArrow);

  // Simulation state
  let isFiring = false;
  let simTime = 0;
  const visualScale = 0.42; // Converts physical m/s to scene units

  function getMuzzleWorldPosition(): THREE.Vector3 {
    const rad = (angleDeg * Math.PI) / 180;
    // Muzzle is at local x = +0.26 (front face of 1.52m barrel centered at -0.50), y = -0.04, z = 0.16
    const lx = 0.26;
    const ly = -0.04;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return new THREE.Vector3(
      pivotPos.x + (lx * cos - ly * sin),
      pivotPos.y + (lx * sin + ly * cos),
      0.16
    );
  }

  function syncTransformAndHelpers() {
    const rad = (angleDeg * Math.PI) / 180;
    pivotArmGroup.rotation.z = rad;
    rebuildSpringGeometry(notch);

    const muzzlePos = getMuzzleWorldPosition();
    const dir = new THREE.Vector3(Math.cos(rad), Math.sin(rad), 0).normalize();
    const speed = NOTCH_SPEEDS[notch];
    velocityArrow.position.copy(muzzlePos);
    velocityArrow.setDirection(dir);
    velocityArrow.setLength(0.35 + (speed / 9.0) * 0.55, 0.14, 0.08);

    // Compute parabolic preview points
    const v0 = speed * visualScale;
    const gScaled = gravity * visualScale;
    const vx = v0 * Math.cos(rad);
    const vy = v0 * Math.sin(rad);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 60; i++) {
      const t = (i / 60) * 1.6;
      const x = muzzlePos.x + vx * t;
      const y = muzzlePos.y + vy * t - 0.5 * gScaled * t * t;
      pts.push(new THREE.Vector3(x, y, muzzlePos.z));
      if (y < -1.48 && i > 3) break;
    }
    trajectoryLine.geometry.dispose();
    trajectoryLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    trajectoryLine.computeLineDistances();

    if (!isFiring) {
      activeBall.position.copy(muzzlePos);
    }
  }

  syncTransformAndHelpers();

  return {
    root,
    backboardGroup,
    sideStandGroup,
    pivotArmGroup,
    springPlungerGroup,
    projectileGroup,
    getMuzzleWorldPosition,
    setAngleDeg(deg: number) {
      angleDeg = Math.max(0, Math.min(90, deg));
      isFiring = false;
      syncTransformAndHelpers();
    },
    setCompressionNotch(n: CompressionNotch) {
      notch = n;
      isFiring = false;
      syncTransformAndHelpers();
    },
    setGravity(g: number) {
      gravity = Math.max(0.5, g);
      isFiring = false;
      syncTransformAndHelpers();
    },
    setExplodedView(exploded: boolean) {
      backboardGroup.position.z = exploded ? -0.35 : 0;
      sideStandGroup.position.x = exploded ? 0.35 : 0;
      pivotArmGroup.position.z = exploded ? 0.30 : 0;
      springPlungerGroup.position.z = exploded ? 0.28 : 0;
    },
    setWireframe(wireframe: boolean) {
      root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mat = (obj as THREE.Mesh).material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => ((m as THREE.MeshStandardMaterial).wireframe = wireframe));
          } else {
            (mat as THREE.MeshStandardMaterial).wireframe = wireframe;
          }
        }
      });
    },
    setShowVectors(visible: boolean) {
      velocityArrow.visible = visible;
    },
    setShowTrajectory(visible: boolean) {
      trajectoryLine.visible = visible;
    },
    fire() {
      simTime = 0;
      isFiring = true;
      rebuildSpringGeometry(1); // Spring releases forward on launch
    },
    resetProjectile() {
      isFiring = false;
      simTime = 0;
      syncTransformAndHelpers();
    },
    update(dt: number) {
      if (!isFiring) return;
      simTime += dt;
      const rad = (angleDeg * Math.PI) / 180;
      const muzzlePos = getMuzzleWorldPosition();
      const v0 = NOTCH_SPEEDS[notch] * visualScale;
      const gScaled = gravity * visualScale;
      const x = muzzlePos.x + v0 * Math.cos(rad) * simTime;
      const y = muzzlePos.y + v0 * Math.sin(rad) * simTime - 0.5 * gScaled * simTime * simTime;
      activeBall.position.set(x, Math.max(-1.42, y), muzzlePos.z);
      if (y <= -1.42 && simTime > 0.08) {
        isFiring = false;
      }
    },
    getKinematics(): ProjectileKinematics {
      const rad = (angleDeg * Math.PI) / 180;
      const v0 = NOTCH_SPEEDS[notch];
      const vy = v0 * Math.sin(rad);
      const vx = v0 * Math.cos(rad);
      const h0 = 0.25; // Launch height above table (m)
      const flightTime = (vy + Math.sqrt(vy * vy + 2 * gravity * h0)) / gravity;
      const expectedRange = vx * flightTime;
      const maxHeight = h0 + (vy * vy) / (2 * gravity);
      return {
        angleDeg,
        notch,
        muzzleSpeed: v0,
        expectedRange,
        maxHeight,
        flightTime,
      };
    },
  };
}
