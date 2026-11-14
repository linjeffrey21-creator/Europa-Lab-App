/**
 * Hardwood Quadrant Marble Launcher (Pitsco / Arbor Scientific)
 * Authentic Procedural Three.js Kinematics Assembly & Sculpted 3D Model
 * Source: Classroom Baltic Birch Plywood Quadrant Marble Launcher with Curved Arc Slot
 */

import * as THREE from 'three';

export interface WoodenLauncherOptions {
  initialAngleDeg?: number; // 0° (horizontal) to 90° (vertical)
  barrelLength?: number; // Default 0.28 m (28 cm)
  lightweight?: boolean;
}

export interface WoodenLauncherRig {
  root: THREE.Group;
  quadrantGroup: THREE.Group;
  barrelGroup: THREE.Group;
  tableMarblesGroup: THREE.Group;
  standGroup: THREE.Group;
  setAngleDeg: (deg: number) => void;
  getMuzzleWorldPos: () => THREE.Vector3;
}

// Bounding box for normalized faceplate UV coordinates (in meters relative to pivot (0,0))
const MIN_X = -0.26;
const MAX_X = 0.24;
const MIN_Y = -0.082; // Tabletop surface
const MAX_Y = 0.26;   // Top contour

/**
 * Generates an authentic Baltic birch faceplate texture with wood grain,
 * engraved radial protractor degree scale along the slot, "MARBLE LAUNCHER" logo,
 * and standard classroom safety rules.
 */
export function createBirchFaceTexture(slotRadius: number = 0.16): THREE.CanvasTexture {
  if (typeof document === 'undefined') {
    return new THREE.CanvasTexture({} as any);
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // 1. Warm Amber Baltic Birch Base Wood Grain
  const bgGrad = ctx.createLinearGradient(0, 0, 1024, 1024);
  bgGrad.addColorStop(0, '#f2cf9d');
  bgGrad.addColorStop(0.35, '#e4bc85');
  bgGrad.addColorStop(0.7, '#d8ac70');
  bgGrad.addColorStop(1, '#e8c48e');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Natural undulating wood grain bands & pores
  ctx.fillStyle = 'rgba(160, 110, 55, 0.09)';
  for (let y = 0; y < 1024; y += 4) {
    const wave = Math.sin(y * 0.018) * 16 + Math.sin(y * 0.062) * 6;
    ctx.fillRect(0, y + wave, 1024, 2.2);
  }
  ctx.fillStyle = 'rgba(120, 75, 30, 0.06)';
  for (let i = 0; i < 450; i++) {
    const rx = Math.random() * 1024;
    const ry = Math.random() * 1024;
    const rw = 12 + Math.random() * 32;
    ctx.fillRect(rx, ry, rw, 1.2);
  }

  // Calculate exact pixel position of the pivot (0,0) in UV texture space:
  // u = (x - MIN_X) / (MAX_X - MIN_X)
  // v = (y - MIN_Y) / (MAX_Y - MIN_Y)
  // canvas X = u * 1024, canvas Y = (1 - v) * 1024
  const spanX = MAX_X - MIN_X;
  const spanY = MAX_Y - MIN_Y;
  const uPivot = (0 - MIN_X) / spanX;
  const vPivot = (0 - MIN_Y) / spanY;
  const cx = uPivot * 1024;
  const cy = (1 - vPivot) * 1024;

  // Arc slot radius in pixels
  const rSlotPix = (slotRadius / spanX) * 1024;
  const rScaleInner = rSlotPix - 28;
  const rScaleOuter = rSlotPix + 28;

  // 2. Radial Protractor Graduations Concentric to Arc Slot (0° to 90°)
  // In our coordinate space: 0° is +X (horizontal right), 90° is +Y (vertical up).
  // In canvas coordinates where cy is down:
  // For angle theta: canvas angle is -theta!
  ctx.strokeStyle = '#2d1e12';
  ctx.lineWidth = 2.4;

  // Inner and outer concentric arc guide curves
  ctx.beginPath();
  ctx.arc(cx, cy, rScaleInner, -Math.PI * 0.5, 0, false);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, rScaleOuter, -Math.PI * 0.5, 0, false);
  ctx.stroke();

  // Degree ticks every 1°, 5°, and 10°
  ctx.fillStyle = '#1e140d';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let deg = 0; deg <= 90; deg++) {
    const rad = (deg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    let tickLen = 8;
    ctx.lineWidth = 1.2;

    if (deg % 10 === 0) {
      tickLen = 24;
      ctx.lineWidth = 2.4;
    } else if (deg % 5 === 0) {
      tickLen = 15;
      ctx.lineWidth = 1.8;
    }

    // In canvas: X = cx + r*cosA, Y = cy - r*sinA (minus because canvas Y is inverted)
    const x1 = cx + (rScaleOuter - tickLen) * cosA;
    const y1 = cy - (rScaleOuter - tickLen) * sinA;
    const x2 = cx + rScaleOuter * cosA;
    const y2 = cy - rScaleOuter * sinA;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Bold numerals at 10° intervals
    if (deg % 10 === 0) {
      const xText = cx + (rScaleOuter + 20) * cosA;
      const yText = cy - (rScaleOuter + 20) * sinA;
      ctx.font = 'bold 18px "Cinzel", "Georgia", "Times New Roman", serif';
      ctx.fillText(`${deg}°`, xText, yText);
    }
  }

  // 3. Authentic "MARBLE LAUNCHER" branding text
  ctx.save();
  ctx.translate(cx + rSlotPix * 0.42, cy - rSlotPix * 0.52);
  ctx.rotate(-0.78); // 45 degree angle
  ctx.font = 'bold 30px "Cinzel", "Georgia", serif';
  ctx.fillStyle = '#22160e';
  ctx.letterSpacing = '3px';
  ctx.fillText('MARBLE LAUNCHER', 0, 0);
  ctx.restore();

  // 4. Classroom Safety Rules Box on rear stabilizing panel
  ctx.save();
  ctx.strokeStyle = '#3a2b1f';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(50, 580, 260, 180);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillRect(50, 580, 260, 180);

  ctx.fillStyle = '#1c1209';
  ctx.font = 'bold 18px "IBM Plex Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Safety Rules', 68, 610);

  ctx.font = '12px "IBM Plex Sans", sans-serif';
  ctx.fillStyle = '#2b1b11';
  ctx.fillText('1. ALWAYS wear eye protection.', 68, 642);
  ctx.fillText('2. Keep face clear from barrel exit.', 68, 672);
  ctx.fillText('3. NEVER launch toward people.', 68, 702);
  ctx.fillText('4. Use approved marbles only.', 68, 732);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Creates the high-fidelity procedural Hardwood Quadrant Marble Launcher rig.
 */
export function createWoodenMarbleLauncher(options: WoodenLauncherOptions = {}): WoodenLauncherRig {
  const { initialAngleDeg = 40, barrelLength = 0.28, lightweight = false } = options;

  const root = new THREE.Group();
  const quadrantGroup = new THREE.Group();
  const barrelGroup = new THREE.Group();
  const tableMarblesGroup = new THREE.Group();
  const standGroup = new THREE.Group();

  root.add(quadrantGroup);
  root.add(barrelGroup);
  root.add(tableMarblesGroup);
  root.add(standGroup);

  let currentAngleDeg = Math.max(0, Math.min(90, initialAngleDeg));

  // Scale factor: standard quadrant profile is designed for a 0.28m barrel length
  const scale = barrelLength / 0.28;

  const plateThickness = 0.018; // 18mm Baltic birch plywood
  const pivotH = 0.082; // Height of pivot trunnion above tabletop (y = 0)
  const slotRadius = 0.160; // Radius of milled arc slot (16cm)
  const slotWidth = 0.010; // Width of milled slot (10mm)

  // -------------------------------------------------------------
  // Materials
  // -------------------------------------------------------------
  const birchTex = createBirchFaceTexture(slotRadius);

  const birchPlywoodMat = new THREE.MeshStandardMaterial({
    color: '#f0c68d',
    roughness: 0.52,
    metalness: 0.05,
    map: birchTex,
  });

  const plywoodEdgeMat = new THREE.MeshStandardMaterial({
    color: '#c28f52',
    roughness: 0.72,
    metalness: 0.04,
  });

  const machinedSteelMat = new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    roughness: 0.22,
    metalness: 0.88,
  });

  const blackenedSteelMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    roughness: 0.45,
    metalness: 0.65,
  });

  const brassWingnutMat = new THREE.MeshStandardMaterial({
    color: '#d4af37',
    roughness: 0.32,
    metalness: 0.82,
  });

  // Authentic Polycarbonate / Acrylic Clear Barrel Tube
  const polycarbonateMat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: 0.08,
    metalness: 0.02,
    transmission: 0.92,
    opacity: 0.42,
    transparent: true,
    ior: 1.49,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
  });

  const greenMarbleMat = new THREE.MeshPhysicalMaterial({
    color: '#15803d',
    roughness: 0.1,
    metalness: 0.15,
    transmission: 0.65,
    opacity: 0.95,
    transparent: true,
    ior: 1.52,
    clearcoat: 1.0,
  });

  const catEyeMarbleMat = new THREE.MeshPhysicalMaterial({
    color: '#b45309',
    roughness: 0.1,
    metalness: 0.15,
    transmission: 0.6,
    opacity: 0.95,
    transparent: true,
    ior: 1.52,
    clearcoat: 1.0,
  });

  // -------------------------------------------------------------
  // 1. Sculpted Quadrant Backboard with Curved Through-Hole Arc Slot
  // -------------------------------------------------------------
  // Origin (0,0) is at the PIVOT point.
  // Tabletop surface sits at y = -pivotH (-0.082m).
  // Launch barrel points into (+X, +Y) quadrant.
  // Counter-Clockwise Outer Boundary:
  const shape = new THREE.Shape();

  // 1. Front foot on tabletop under the horizontal barrel: x = 0.14 to 0.22, y = -pivotH
  shape.moveTo(0.14, -pivotH);
  shape.lineTo(0.22, -pivotH);
  // Curve up around the horizontal 0° position
  shape.lineTo(0.23, -pivotH + 0.03);
  shape.lineTo(0.22, 0.06);
  // Outer perimeter wrapping the circular arc slot (slot radius is 0.160m)
  shape.lineTo(0.20, 0.14);
  shape.lineTo(0.14, 0.21);
  shape.lineTo(0.06, 0.25);
  // Top exit relief notch / contoured crown
  shape.lineTo(0.01, 0.23);
  shape.lineTo(-0.04, 0.25);
  shape.lineTo(-0.09, 0.23);
  // Back contour sweeping down to rear foot for recoil stability
  shape.lineTo(-0.16, 0.14);
  shape.lineTo(-0.22, 0.02);
  shape.lineTo(-0.25, -pivotH);
  // Rear tabletop landing foot: x from -0.25 to -0.16
  shape.lineTo(-0.16, -pivotH);
  // Arched bottom cutout lifting midsection clear of tabletop
  shape.quadraticCurveTo(-0.01, -pivotH + 0.04, 0.14, -pivotH);
  shape.closePath();

  // 2. Geometric Through-Hole Curved Arc Slot (0° to 90°)
  // In Three.js, holes MUST be defined in CLOCKWISE order to properly cut through!
  const rIn = slotRadius - slotWidth * 0.5;
  const rOut = slotRadius + slotWidth * 0.5;
  const slotHole = new THREE.Path();

  // Start at top of outer arc (0, rOut) [90°], trace CW down to (rOut, 0) [0°]
  slotHole.moveTo(0, rOut);
  slotHole.absarc(0, 0, rOut, Math.PI * 0.5, 0, true); // true = Clockwise!
  // Rounded cap at 0° (horizontal): from (rOut, 0) to (rIn, 0)
  slotHole.absarc(slotRadius, 0, slotWidth * 0.5, 0, -Math.PI, true);
  // Inner arc from 0° up to 90° (still Clockwise relative to hole interior):
  slotHole.absarc(0, 0, rIn, 0, Math.PI * 0.5, false);
  // Rounded cap at 90° (vertical): from (0, rIn) to (0, rOut)
  slotHole.absarc(0, slotRadius, slotWidth * 0.5, -Math.PI * 0.5, Math.PI * 0.5, true);
  slotHole.closePath();

  shape.holes.push(slotHole);

  // Extrude the panel to create the 18mm Baltic birch board
  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: plateThickness,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.002,
    bevelThickness: 0.002,
  };

  const panelGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  // Position panel on Z so front face is at z = 0, back face is at z = -plateThickness
  panelGeo.translate(0, 0, -plateThickness);

  // Custom Planar UV Mapping for the Front Face to guarantee sub-millimeter scale alignment
  const uvAttr = panelGeo.attributes.uv;
  const posAttr = panelGeo.attributes.position;
  const spanX = MAX_X - MIN_X;
  const spanY = MAX_Y - MIN_Y;

  for (let i = 0; i < posAttr.count; i++) {
    const vz = posAttr.getZ(i);
    // If vertex is on the front face (z >= -0.003):
    if (vz >= -0.003) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const u = (vx - MIN_X) / spanX;
      const v = (vy - MIN_Y) / spanY;
      uvAttr.setXY(i, Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, v)));
    }
  }
  uvAttr.needsUpdate = true;

  const panelMesh = new THREE.Mesh(panelGeo, [birchPlywoodMat, plywoodEdgeMat]);
  panelMesh.castShadow = !lightweight;
  panelMesh.receiveShadow = !lightweight;
  quadrantGroup.add(panelMesh);

  // -------------------------------------------------------------
  // 2. Rear Triangular Wooden Support Foot (Tabletop Stabilizer)
  // -------------------------------------------------------------
  // Positioned perpendicular (in Z direction) at the rear foot (x = -0.19)
  // Sits flush on table at y = -pivotH, extending from z = -plateThickness to z = -0.12m
  const footShape = new THREE.Shape();
  footShape.moveTo(0, 0); // Bottom table vertex against back of panel
  footShape.lineTo(-0.11, 0); // Tabletop resting base
  footShape.lineTo(0, 0.095); // Vertical edge bolted against panel
  footShape.closePath();

  const footExtrude: THREE.ExtrudeGeometryOptions = {
    depth: plateThickness,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.002,
    bevelThickness: 0.002,
  };
  const footGeo = new THREE.ExtrudeGeometry(footShape, footExtrude);
  footGeo.rotateY(Math.PI * 0.5);
  footGeo.translate(-0.19, -pivotH, -plateThickness);

  const footMesh = new THREE.Mesh(footGeo, [birchPlywoodMat, plywoodEdgeMat]);
  footMesh.castShadow = !lightweight;
  footMesh.receiveShadow = !lightweight;
  quadrantGroup.add(footMesh);

  // Metal carriage bolt and wingnut fastening the rear foot to the panel
  const boltGeo = new THREE.CylinderGeometry(0.005, 0.005, plateThickness * 2.4, 12);
  boltGeo.rotateX(Math.PI * 0.5);
  const footBolt = new THREE.Mesh(boltGeo, machinedSteelMat);
  footBolt.position.set(-0.19, -pivotH + 0.038, -plateThickness * 0.5);
  quadrantGroup.add(footBolt);

  const rearWingnut = new THREE.Mesh(
    new THREE.BoxGeometry(0.024, 0.010, 0.006),
    machinedSteelMat
  );
  rearWingnut.position.set(-0.19, -pivotH + 0.038, -plateThickness - 0.012);
  quadrantGroup.add(rearWingnut);

  // -------------------------------------------------------------
  // 3. Transparent Polycarbonate Barrel + Internal Kinematics
  // -------------------------------------------------------------
  // The barrelGroup rotates around the pivot (0, 0)
  barrelGroup.position.set(0, 0, 0.018); // Mounted on front face of quadrant

  const barrelOD = 0.028; // 28 mm outer diameter
  const barrelID = 0.022; // 22 mm inner diameter
  const tubeLen = 0.25; // 25 cm tube length

  // Clear acrylic / polycarbonate outer tube
  const tubeGeo = new THREE.CylinderGeometry(barrelOD * 0.5, barrelOD * 0.5, tubeLen, 24, 1, true);
  // Lay tube along +X axis with breech at x = -0.02 and muzzle at x = tubeLen - 0.02
  tubeGeo.rotateZ(-Math.PI * 0.5);
  tubeGeo.translate(tubeLen * 0.5 - 0.02, 0, 0);

  const tubeMesh = new THREE.Mesh(tubeGeo, polycarbonateMat);
  tubeMesh.castShadow = false;
  tubeMesh.receiveShadow = false;
  barrelGroup.add(tubeMesh);

  // Black trunnion collar at the breech / pivot (x = 0)
  const pivotCollarGeo = new THREE.CylinderGeometry(barrelOD * 0.56, barrelOD * 0.56, 0.032, 20);
  pivotCollarGeo.rotateZ(-Math.PI * 0.5);
  const pivotCollar = new THREE.Mesh(pivotCollarGeo, blackenedSteelMat);
  pivotCollar.castShadow = !lightweight;
  barrelGroup.add(pivotCollar);

  // Large Phillips pivot screw holding barrel to wood panel
  const pivotScrewHead = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.006, 16),
    machinedSteelMat
  );
  pivotScrewHead.rotateX(Math.PI * 0.5);
  pivotScrewHead.position.set(0, 0, 0.018);
  barrelGroup.add(pivotScrewHead);

  const screwCrossX = new THREE.Mesh(
    new THREE.BoxGeometry(0.014, 0.003, 0.002),
    blackenedSteelMat
  );
  screwCrossX.position.set(0, 0, 0.021);
  barrelGroup.add(screwCrossX);

  const screwCrossY = new THREE.Mesh(
    new THREE.BoxGeometry(0.003, 0.014, 0.002),
    blackenedSteelMat
  );
  screwCrossY.position.set(0, 0, 0.021);
  barrelGroup.add(screwCrossY);

  // -------------------------------------------------------------
  // Internal Components Visible Through Clear Polycarbonate Barrel
  // -------------------------------------------------------------
  // A. Internal Piston Plunger Shaft
  const shaftGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.19, 12);
  shaftGeo.rotateZ(-Math.PI * 0.5);
  shaftGeo.translate(0.05, 0, 0);
  const plungerShaft = new THREE.Mesh(shaftGeo, machinedSteelMat);
  barrelGroup.add(plungerShaft);

  // B. Black Cocking Pull Ring at Breech End (x = -0.038)
  const pullRingGeo = new THREE.TorusGeometry(0.015, 0.0035, 12, 24);
  pullRingGeo.rotateY(Math.PI * 0.5);
  pullRingGeo.translate(-0.038, 0, 0);
  const pullRing = new THREE.Mesh(pullRingGeo, blackenedSteelMat);
  pullRing.castShadow = !lightweight;
  barrelGroup.add(pullRing);

  // C. Volumetric Helical Compression Spring Inside Clear Tube
  const springCoils = 14;
  const springRadius = 0.0085;
  const springStartX = 0.005;
  const springEndX = 0.125;
  const springSteps = 140;
  const springPoints: THREE.Vector3[] = [];

  for (let i = 0; i <= springSteps; i++) {
    const t = i / springSteps;
    const x = springStartX + (springEndX - springStartX) * t;
    const theta = t * springCoils * Math.PI * 2;
    const y = Math.sin(theta) * springRadius;
    const z = Math.cos(theta) * springRadius;
    springPoints.push(new THREE.Vector3(x, y, z));
  }

  const springPath = new THREE.CatmullRomCurve3(springPoints);
  const springGeo = new THREE.TubeGeometry(springPath, 100, 0.0016, 8, false);
  const springMesh = new THREE.Mesh(springGeo, machinedSteelMat);
  springMesh.castShadow = !lightweight;
  barrelGroup.add(springMesh);

  // D. White Delrin / Aluminum Piston Face at x = 0.13
  const pistonHeadGeo = new THREE.CylinderGeometry(barrelID * 0.46, barrelID * 0.46, 0.012, 16);
  pistonHeadGeo.rotateZ(-Math.PI * 0.5);
  pistonHeadGeo.translate(0.13, 0, 0);
  const pistonHead = new THREE.Mesh(pistonHeadGeo, machinedSteelMat);
  barrelGroup.add(pistonHead);

  // E. Projectile Marble Inside Barrel (resting against piston head at x = 0.144)
  const marbleR = 0.0095; // 19 mm marble
  const barrelMarbleGeo = new THREE.SphereGeometry(marbleR, 24, 24);
  const barrelMarble = new THREE.Mesh(barrelMarbleGeo, greenMarbleMat);
  barrelMarble.position.set(0.144, 0, 0);
  barrelMarble.castShadow = !lightweight;
  barrelGroup.add(barrelMarble);

  // F. Range Detent Notches along Tube
  for (const detentX of [0.06, 0.09, 0.12]) {
    const notchGeo = new THREE.BoxGeometry(0.003, barrelOD * 0.58, 0.006);
    const notchMesh = new THREE.Mesh(notchGeo, blackenedSteelMat);
    notchMesh.position.set(detentX, 0, 0);
    barrelGroup.add(notchMesh);
  }

  // -------------------------------------------------------------
  // 4. Clamping Collar & Arc Slide Locking Wingnut
  // -------------------------------------------------------------
  // Positioned along the tube at x = slotRadius (0.160m)
  // Slides along the through-hole arc slot in the wooden plate
  const clampCollarGeo = new THREE.CylinderGeometry(barrelOD * 0.56, barrelOD * 0.56, 0.024, 20);
  clampCollarGeo.rotateZ(-Math.PI * 0.5);
  const clampCollar = new THREE.Mesh(clampCollarGeo, blackenedSteelMat);
  clampCollar.position.set(slotRadius, 0, 0);
  clampCollar.castShadow = !lightweight;
  barrelGroup.add(clampCollar);

  // Slide bolt through the milled curved arc slot
  const slideBoltGeo = new THREE.CylinderGeometry(0.004, 0.004, plateThickness + 0.026, 12);
  slideBoltGeo.rotateX(Math.PI * 0.5);
  const slideBolt = new THREE.Mesh(slideBoltGeo, machinedSteelMat);
  slideBolt.position.set(slotRadius, 0, -plateThickness * 0.5);
  barrelGroup.add(slideBolt);

  // Authentic brass clamping wingnut on the front of the slot
  const wingnutGroup = new THREE.Group();
  wingnutGroup.position.set(slotRadius, 0, 0.022);

  const wingnutBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.007, 0.009, 0.010, 16),
    brassWingnutMat
  );
  wingnutBody.rotateX(Math.PI * 0.5);
  wingnutGroup.add(wingnutBody);

  const wing1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.022, 0.007, 0.004),
    brassWingnutMat
  );
  wingnutGroup.add(wing1);
  barrelGroup.add(wingnutGroup);

  // Rear washer
  const rearSlotWasher = new THREE.Mesh(
    new THREE.CylinderGeometry(0.010, 0.010, 0.003, 16),
    machinedSteelMat
  );
  rearSlotWasher.rotateX(Math.PI * 0.5);
  rearSlotWasher.position.set(slotRadius, 0, -plateThickness - 0.003);
  barrelGroup.add(rearSlotWasher);

  // -------------------------------------------------------------
  // 5. Classroom Tabletop Marbles (Loose on table removed per user request)
  // -------------------------------------------------------------
  // tableMarblesGroup kept empty to avoid extraneous balls on the tabletop

  // Apply user scale factor if customized
  if (scale !== 1.0) {
    quadrantGroup.scale.set(scale, scale, scale);
    barrelGroup.scale.set(scale, scale, scale);
    tableMarblesGroup.scale.set(scale, scale, scale);
  }

  // -------------------------------------------------------------
  // Kinematic Synchronization
  // -------------------------------------------------------------
  function syncAngle(deg: number) {
    currentAngleDeg = Math.max(0, Math.min(90, deg));
    const rad = (currentAngleDeg * Math.PI) / 180;
    // Rotate barrel around pivot point (0, 0)
    barrelGroup.rotation.z = rad;
  }

  syncAngle(currentAngleDeg);

  function getMuzzleWorldPos(): THREE.Vector3 {
    const muzzleLipX = (tubeLen - 0.02) * scale;
    const rad = (currentAngleDeg * Math.PI) / 180;
    const localMuzzle = new THREE.Vector3(
      muzzleLipX * Math.cos(rad),
      muzzleLipX * Math.sin(rad),
      0.018 * scale
    );
    return localMuzzle.add(root.position);
  }

  return {
    root,
    quadrantGroup,
    barrelGroup,
    tableMarblesGroup,
    standGroup,
    setAngleDeg(deg: number) {
      syncAngle(deg);
    },
    getMuzzleWorldPos,
  };
}
