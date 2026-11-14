/**
 * Lab4All — Procedural 3D Scientific Apparatus Generator & Laboratory Bench Scene
 *
 * Implements Part 3 ("Dramatically Improve the 3D Graphics") and Part 4.3 ("Equipment
 * reconstruction") using pure Three.js procedural geometry with physically based materials,
 * machined bevels, knurled locking knobs, helical spring coils, optical photogate brackets,
 * plumb-bob / engraved Vernier protractor dials, and synchronized kinematics.
 */

import * as THREE from 'three';
import { buildArborLauncher } from './arborLauncher.ts';
import { buildPascoLauncher } from './pascoLauncher.ts';
import { ARBOR_MINI_ID, EISCO_PH0343_ID, PASCO_ME6800_ID, PASCO_MINI_ID, VERNIER_VPL_ID, arborMiniPivotHeight } from '../equipment/schema.ts';
import type { ProjectileApparatusSpec } from '../equipment/schema.ts';
import {
  computeApparatusKinematicsPose,
  reconstructionPanelHeight,
  reconstructionStandDeck,
  reconstructionPanelWidth,
  computeGuideCrossSection,
  fittedBarrelBoreRadius,
} from '../equipment/schema.ts';
import {
  TUBE_COLOR_PALETTE,
  BASE_COLOR_PALETTE,
  resolveMaterialPBR,
  createBrushedMetalTexture,
  createWoodGrainTexture,
  createEngravedProtractorTexture,
} from './materials.ts';
import { createProjectileLauncher } from './borealLauncher.ts';
import { buildBorealLauncher } from './borealAsset.ts';
import { createEiscoLauncher } from './eiscoLauncher.ts';
import { buildEiscoLauncher } from './eiscoAsset.ts';
import { buildVernierLauncher } from './vernierAsset.ts';
import { buildPascoMiniLauncher } from './pascoMiniAsset.ts';
import { createWoodenMarbleLauncher } from './woodenLauncher.ts';
import { createCPOMarbleLauncher } from './cpoLauncher.ts';
import { BOREAL_ID, BOREAL_MOUNT, CLAMP_LAUNCH_AXIS_Z, CLAMP_TOP_THICKNESS, CPO_MOUNT, GSC_PROLCH_ID, LAB_BENCH_DEPTH, LAB_BENCH_THICKNESS } from '../equipment/schema.ts';

export interface ApparatusBuildOptions {
  spec: ProjectileApparatusSpec;
  angleDeg: number;
  projectileCenterY: number;
  mountMode?: 'stand' | 'clamp';
  lightweight?: boolean;
  previewMode?: boolean;
}

/**
 * Helper to create a machined hex socket head cap bolt or knurled thumbscrew.
 */
function createFastenerGroup(size = 0.012, knurled = false): THREE.Group {
  const g = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({
    color: knurled ? '#232a2e' : '#96a2a8',
    metalness: knurled ? 0.25 : 0.85,
    roughness: knurled ? 0.55 : 0.28,
  });
  const washerMat = new THREE.MeshStandardMaterial({
    color: '#b8c2c6',
    metalness: 0.85,
    roughness: 0.3,
  });

  // Washer flange
  const washer = new THREE.Mesh(
    new THREE.CylinderGeometry(size * 1.25, size * 1.25, size * 0.22, 20),
    washerMat
  );
  washer.rotation.x = Math.PI / 2;
  g.add(washer);

  // Bolt head (6-sided hex or 16-sided knurled knob)
  const head = new THREE.Mesh(
    new THREE.CylinderGeometry(
      size,
      size * (knurled ? 1.05 : 1.0),
      size * (knurled ? 1.15 : 0.65),
      knurled ? 20 : 6
    ),
    steelMat
  );
  head.rotation.x = Math.PI / 2;
  head.position.z = size * (knurled ? 0.65 : 0.4);
  g.add(head);

  // Center socket recess
  const socket = new THREE.Mesh(
    new THREE.CylinderGeometry(size * 0.42, size * 0.42, size * 0.15, 6),
    new THREE.MeshStandardMaterial({ color: '#333b3f', metalness: 0.7, roughness: 0.45 })
  );
  socket.rotation.x = Math.PI / 2;
  socket.position.z = size * (knurled ? 1.22 : 0.72);
  g.add(socket);

  return g;
}

/**
 * Builds an authentic Dual Optical Photogate Beam System mounted at the muzzle exit.
 * Features an extruded matte black clamping rail, two U-shaped optical gates spaced
 * at standard 60 mm timing interval, infrared emitter/receiver eye lenses, status LEDs,
 * and sensor wiring harness.
 */
export function buildDualOpticalPhotogateAssembly(
  D: number,
  lightweight: boolean
): THREE.Group {
  const group = new THREE.Group();
  const darkAnodizedMat = new THREE.MeshStandardMaterial({
    color: '#181e24',
    metalness: 0.65,
    roughness: 0.35,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: '#d1d8dc',
    metalness: 0.90,
    roughness: 0.18,
  });
  const ledActiveMat = new THREE.MeshBasicMaterial({ color: '#22c55e' }); // Green LED status
  const ledEmitterMat = new THREE.MeshBasicMaterial({ color: '#ef4444' }); // Red IR transmitter eye
  const ledDetectorMat = new THREE.MeshBasicMaterial({ color: '#1e293b' }); // Dark IR photodiode eye

  // 1. Dovetail mounting clamp gripped on the underside barrel rail
  const clampCollar = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.016, D * 1.05),
    darkAnodizedMat
  );
  clampCollar.position.set(-0.012, -D * 0.54, 0);
  group.add(clampCollar);

  // Knurled thumbscrew securing collar to barrel
  const thumbScrew = new THREE.Mesh(
    new THREE.CylinderGeometry(0.007, 0.007, 0.022, 16),
    chromeMat
  );
  thumbScrew.position.set(-0.012, -D * 0.54 - 0.014, 0);
  group.add(thumbScrew);

  // 2. Rigid Extruded Aluminum Dual-Photogate Mounting Bar extending forward past muzzle
  const barLen = 0.125;
  const mountBar = new THREE.Mesh(
    new THREE.BoxGeometry(barLen, 0.012, 0.018),
    darkAnodizedMat
  );
  mountBar.position.set(barLen * 0.5 - 0.018, -D * 0.58, 0);
  group.add(mountBar);

  // 3. Two Optical Photogates: Gate 1 (Start) and Gate 2 (Stop)
  // Spaced at 60 mm delta x for instant exit velocity computing
  const gatePositions = [
    { x: 0.015, label: 'GATE 1' },
    { x: 0.075, label: 'GATE 2' },
  ];

  const uSpanZ = Math.max(D * 0.64, 0.040);
  const uArmH = Math.max(D * 1.25, 0.075);

  for (const gate of gatePositions) {
    const gateGroup = new THREE.Group();
    gateGroup.position.set(gate.x, 0, 0);

    // Gate Base Saddle Mount on the extruded bar
    const saddle = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.014, 0.024),
      darkAnodizedMat
    );
    saddle.position.set(0, -D * 0.58, 0);
    gateGroup.add(saddle);

    // Cross beam of U-fork below trajectory bore
    const uBeam = new THREE.Mesh(
      new THREE.BoxGeometry(0.016, 0.014, uSpanZ * 2),
      darkAnodizedMat
    );
    uBeam.position.set(0, -uArmH * 0.5, 0);
    gateGroup.add(uBeam);

    // Two vertical upright arms straddling the projectile trajectory
    for (const zSide of [-1, 1]) {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.014, uArmH, 0.016),
        darkAnodizedMat
      );
      arm.position.set(0, 0, zSide * uSpanZ);
      gateGroup.add(arm);

      // Optical IR emitter / photodiode receiver optical eye
      const lensMat = zSide === -1 ? ledEmitterMat : ledDetectorMat;
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0035, 0.0035, 0.005, 14),
        lensMat
      );
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 0, zSide * (uSpanZ - 0.005));
      gateGroup.add(lens);

      // Beveled chrome collar around the lens
      const lensBevel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0055, 0.0055, 0.003, 14),
        chromeMat
      );
      lensBevel.rotation.x = Math.PI / 2;
      lensBevel.position.set(0, 0, zSide * (uSpanZ - 0.007));
      gateGroup.add(lensBevel);
    }

    // Top status indicator LED (green = beam clear/ready)
    const statusLED = new THREE.Mesh(
      new THREE.SphereGeometry(0.003, 12, 12),
      ledActiveMat
    );
    statusLED.position.set(0, uArmH * 0.5 + 0.003, -uSpanZ);
    gateGroup.add(statusLED);

    // Miniature locking thumbscrew on saddle side
    const gateKnob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.014, 12),
      chromeMat
    );
    gateKnob.rotation.z = Math.PI / 2;
    gateKnob.position.set(0.014, -D * 0.58, 0);
    gateGroup.add(gateKnob);

    group.add(gateGroup);
  }

  // Inter-gate flexible sensor data ribbon cable (coiled black line)
  const cablePts: THREE.Vector3[] = [];
  const cableSteps = 24;
  for (let c = 0; c <= cableSteps; c++) {
    const t = c / cableSteps;
    const cx = 0.015 + t * (0.075 - 0.015);
    const cy = -D * 0.58 - 0.012 - Math.sin(t * Math.PI) * 0.018;
    const cz = -uSpanZ * 0.5;
    cablePts.push(new THREE.Vector3(cx, cy, cz));
  }
  const cableGeo = new THREE.BufferGeometry().setFromPoints(cablePts);
  const cableMesh = new THREE.Line(
    cableGeo,
    new THREE.LineBasicMaterial({ color: '#090d16', linewidth: 2 })
  );
  group.add(cableMesh);

  return group;
}

/**
 * Builds an authentic Turned Solid Brass Plumb Bob & Inclinometer Suspension Mechanism.
 * Features knurled brass suspension post, gravity-hanging braided crimson cord,
 * multi-tiered turned solid brass plumb bob weight, and protective clear acrylic lens disc.
 */
export function buildTurnedBrassPlumbBob(
  dialRadius: number,
  angleDeg: number,
  brassMat: THREE.Material,
  stringLen = dialRadius * 0.74
): THREE.Group {
  const plumbGroup = new THREE.Group();
  const rad = (angleDeg * Math.PI) / 180;
  const gx = -Math.sin(rad);
  const gy = -Math.cos(rad);

  const chromeMat = new THREE.MeshStandardMaterial({
    color: '#d4dde1',
    metalness: 0.90,
    roughness: 0.16,
  });

  // 1. Knurled Brass Suspension Pivot Pin at origin (0, 0)
  const pinPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, 0.016, 16),
    brassMat
  );
  pinPost.rotation.x = Math.PI / 2;
  pinPost.position.set(0, 0, 0.008);
  plumbGroup.add(pinPost);

  const pinKnurl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0065, 0.0065, 0.005, 16),
    brassMat
  );
  pinKnurl.rotation.x = Math.PI / 2;
  pinKnurl.position.set(0, 0, 0.014);
  plumbGroup.add(pinKnurl);

  // 2. High-Visibility Braided Red Plumb Line
  const cordGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0.009),
    new THREE.Vector3(gx * stringLen, gy * stringLen, 0.009),
  ]);
  const cordLine = new THREE.Line(
    cordGeo,
    new THREE.LineBasicMaterial({ color: '#dc2626', linewidth: 2 })
  );
  plumbGroup.add(cordLine);

  // 3. Precision Lathe-Turned Solid Brass Plumb Bob Weight
  const bobGroup = new THREE.Group();
  bobGroup.position.set(gx * stringLen, gy * stringLen, 0.009);
  bobGroup.rotation.z = -rad;

  // Suspension eyelet ring atop bob
  const eyelet = new THREE.Mesh(
    new THREE.TorusGeometry(0.003, 0.0008, 10, 16),
    brassMat
  );
  eyelet.position.set(0, 0.014, 0);
  bobGroup.add(eyelet);

  // Knurled neck collar
  const bobNeck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0045, 0.0055, 0.006, 16),
    brassMat
  );
  bobNeck.position.set(0, 0.009, 0);
  bobGroup.add(bobNeck);

  // Cylindrical main turned brass body with decorative lathe grooves
  const bobBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.007, 0.007, 0.016, 20),
    brassMat
  );
  bobBody.position.set(0, -0.002, 0);
  bobGroup.add(bobBody);

  // Decorative lathe score rings on body
  const grooveRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.0072, 0.0006, 8, 20),
    chromeMat
  );
  grooveRing.rotation.x = Math.PI / 2;
  grooveRing.position.set(0, -0.002, 0);
  bobGroup.add(grooveRing);

  // Conical pointer tip ending at needle point
  const bobTip = new THREE.Mesh(
    new THREE.ConeGeometry(0.007, 0.022, 20),
    brassMat
  );
  bobTip.rotation.z = Math.PI;
  bobTip.position.set(0, -0.021, 0);
  bobGroup.add(bobTip);

  plumbGroup.add(bobGroup);

  return plumbGroup;
}

/**
 * Builds the rotatable Launch Guide Assembly (barrel / slotted barrel / open channel /
 * rectangular housing + muzzle collar + breech plug + helical spring + piston + photogate).
 * Origin (0,0,0) of this group is at the muzzle exit center (`tubeExit`), extending
 * backward along -X to `-barrelLength`.
 */
function buildLaunchGuideAssembly(
  spec: ProjectileApparatusSpec,
  angleDeg: number,
  lightweight: boolean,
  brushedTex: THREE.Texture
): THREE.Group {
  const group = new THREE.Group();
  const { visual, dimensions } = spec;
  const { kind, wall, insideWidth, boreRadius } = computeGuideCrossSection(visual, dimensions, spec.reconstruction?.guideBoreM);

  const L = dimensions.barrelLength;
  const D = dimensions.barrelDiameter;
  const rBall = dimensions.projectileDiameter / 2;

  const tubeColor = spec.reconstruction?.guideColor || TUBE_COLOR_PALETTE[visual.tube_color] || TUBE_COLOR_PALETTE.silver;
  const pbr = resolveMaterialPBR(
    visual.tube_material !== 'unknown'
      ? visual.tube_material
      : visual.tube_color === 'silver' || visual.tube_color === 'brass'
      ? 'metal'
      : 'painted_metal'
  );

  const primaryMat = new THREE.MeshStandardMaterial({
    color: tubeColor,
    metalness: pbr.metalness,
    roughness: pbr.roughness,
    map: pbr.metalness > 0.6 && !lightweight ? brushedTex : null,
    side: THREE.DoubleSide,
  });

  const darkAnodizedMat = new THREE.MeshStandardMaterial({
    color: '#232b30',
    metalness: 0.62,
    roughness: 0.36,
  });

  const stainlessMat = new THREE.MeshStandardMaterial({
    color: '#cfd8dc',
    metalness: 0.88,
    roughness: 0.22,
  });

  const brassMat = new THREE.MeshStandardMaterial({
    color: '#cfa64f',
    metalness: 0.84,
    roughness: 0.26,
  });

  const openHousing = kind === 'rectangular_housing' && spec.reconstruction?.housingOpenFace === true;
  if (openHousing) {
    const shellThickness = Math.min(wall, D * 0.12);
    const halfHeight = D * 0.62;
    const shell = (name: string, width: number, height: number, depth: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), primaryMat);
      mesh.name = name;
      mesh.position.set(-L / 2, y, z);
      mesh.castShadow = !lightweight;
      mesh.receiveShadow = !lightweight;
      group.add(mesh);
    };
    shell('open-housing-back', L, 2 * halfHeight - 2 * shellThickness, shellThickness, 0, (shellThickness - D) / 2);
    shell('open-housing-top', L, shellThickness, D, halfHeight - shellThickness / 2, 0);
    shell('open-housing-bottom', L, shellThickness, D, -halfHeight + shellThickness / 2, 0);
  } else if (kind === 'rectangular_housing') {
    // Extruded rectangular housing with rounded corners and cylindrical internal bore
    const halfW = D / 2;
    const halfH = D * 0.62;
    const cornerR = Math.min(0.006, D * 0.1);
    const shape = new THREE.Shape();
    shape.moveTo(-halfW + cornerR, -halfH);
    shape.lineTo(halfW - cornerR, -halfH);
    shape.quadraticCurveTo(halfW, -halfH, halfW, -halfH + cornerR);
    shape.lineTo(halfW, halfH - cornerR);
    shape.quadraticCurveTo(halfW, halfH, halfW - cornerR, halfH);
    shape.lineTo(-halfW + cornerR, halfH);
    shape.quadraticCurveTo(-halfW, halfH, -halfW, halfH - cornerR);
    shape.lineTo(-halfW, -halfH + cornerR);
    shape.quadraticCurveTo(-halfW, -halfH, -halfW + cornerR, -halfH);

    const hole = new THREE.Path();
    hole.absarc(0, 0, boreRadius, 0, Math.PI * 2, true);
    shape.holes.push(hole);

    const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
      depth: L,
      bevelEnabled: true,
      bevelSize: 0.0015,
      bevelThickness: 0.0015,
      bevelSegments: 2,
      curveSegments: lightweight ? 16 : 32,
    });
    const housingMesh = new THREE.Mesh(extrudeGeo, primaryMat);
    housingMesh.position.set(-L, 0, 0);
    housingMesh.rotation.y = Math.PI / 2;
    housingMesh.castShadow = !lightweight;
    housingMesh.receiveShadow = !lightweight;
    group.add(housingMesh);

    // Muzzle precision bezel ring
    const muzzleRing = new THREE.Mesh(
      new THREE.TorusGeometry(boreRadius + 0.003, 0.003, 12, 32),
      darkAnodizedMat
    );
    muzzleRing.position.set(0.001, 0, 0);
    muzzleRing.rotation.y = Math.PI / 2;
    group.add(muzzleRing);

    // Side seam lines & hex fasteners along housing
    for (const frac of [-0.15, -0.42, -0.68, -0.9]) {
      const boltTop = createFastenerGroup(0.0032, false);
      boltTop.position.set(L * frac, halfH * 0.78, halfW + 0.001);
      group.add(boltTop);

      const boltBot = createFastenerGroup(0.0032, false);
      boltBot.position.set(L * frac, -halfH * 0.78, halfW + 0.001);
      group.add(boltBot);
    }

    // Side loading slot / detent track
    const slotMesh = new THREE.Mesh(
      new THREE.BoxGeometry(L * 0.45, 0.007, 0.003),
      new THREE.MeshStandardMaterial({ color: '#14191c', roughness: 0.8 })
    );
    slotMesh.position.set(-L * 0.48, 0, halfW + 0.001);
    group.add(slotMesh);
  } else if (kind === 'open_channel') {
    // Realistic U/V machined aluminum channel rail with side walls, top lip flanges, and rear backstop
    const basePlate = new THREE.Mesh(
      new THREE.BoxGeometry(L, wall * 1.2, D),
      primaryMat
    );
    basePlate.position.set(-L / 2, -rBall - wall * 0.6, 0);
    basePlate.castShadow = !lightweight;
    basePlate.receiveShadow = !lightweight;
    group.add(basePlate);

    for (const side of [-1, 1]) {
      const sideWall = new THREE.Mesh(
        new THREE.BoxGeometry(L, D * 0.62, wall),
        primaryMat
      );
      sideWall.position.set(-L / 2, -rBall + D * 0.28, side * (insideWidth / 2 + wall / 2));
      sideWall.castShadow = !lightweight;
      group.add(sideWall);

      // Top reinforcing flange lip
      const flange = new THREE.Mesh(
        new THREE.BoxGeometry(L, wall * 0.9, wall * 2.2),
        stainlessMat
      );
      flange.position.set(-L / 2, -rBall + D * 0.59, side * (insideWidth / 2 + wall));
      group.add(flange);
    }

    // Rear breech stop block & rubber bumper
    const breechBlock = new THREE.Mesh(
      new THREE.BoxGeometry(0.028, D * 0.7, D * 1.06),
      darkAnodizedMat
    );
    breechBlock.position.set(-L + 0.014, -rBall + D * 0.28, 0);
    group.add(breechBlock);

    // Engraved Centimeter Release Scale Strip along the side wall of the Marble Ramp
    const scaleCanvas = document.createElement('canvas');
    scaleCanvas.width = 512;
    scaleCanvas.height = 64;
    const sCtx = scaleCanvas.getContext('2d');
    if (sCtx) {
      sCtx.fillStyle = '#f4f1e6';
      sCtx.fillRect(0, 0, 512, 64);
      sCtx.strokeStyle = '#222';
      sCtx.fillStyle = '#222';
      sCtx.lineWidth = 2;
      sCtx.font = 'bold 18px monospace';
      for (let cm = 0; cm <= 50; cm++) {
        const px = 12 + (cm / 50) * 488;
        const isMajor = cm % 5 === 0;
        sCtx.beginPath();
        sCtx.moveTo(px, 0);
        sCtx.lineTo(px, isMajor ? 28 : 14);
        sCtx.stroke();
        if (cm % 10 === 0) {
          sCtx.fillText(`${cm}`, px - 10, 50);
        }
      }
    }
    const rampScaleTex = new THREE.CanvasTexture(scaleCanvas);
    const rampScaleStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(L * 0.88, D * 0.28),
      new THREE.MeshBasicMaterial({ map: rampScaleTex })
    );
    rampScaleStrip.position.set(-L * 0.48, -rBall + D * 0.3, insideWidth / 2 + wall + 0.0015);
    group.add(rampScaleStrip);

    // Adjustable Brass Marble Release Gate / Catch Pin Assembly
    const catchCollar = new THREE.Mesh(
      new THREE.BoxGeometry(0.032, D * 0.35, D * 1.18),
      brassMat
    );
    catchCollar.position.set(-L * 0.28, -rBall + D * 0.56, 0);
    group.add(catchCollar);

    const releaseThumbscrew = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 0.026, 16),
      new THREE.MeshStandardMaterial({ color: '#222629', metalness: 0.25, roughness: 0.55 })
    );
    releaseThumbscrew.position.set(-L * 0.28, -rBall + D * 0.82, 0);
    group.add(releaseThumbscrew);

    // Muzzle Horizontal Transition Deflector Lip & Side Safety Cheeks
    const muzzleLip = new THREE.Mesh(
      new THREE.BoxGeometry(0.036, wall * 1.1, D * 1.04),
      stainlessMat
    );
    muzzleLip.position.set(-0.016, -rBall - wall * 0.5, 0);
    group.add(muzzleLip);

    if (!spec.reconstruction) {
      // Spare Marble Storage Caddy Tray mounted near breech
      const caddyBar = new THREE.Mesh(
        new THREE.BoxGeometry(0.095, 0.014, 0.028),
        darkAnodizedMat
      );
      caddyBar.position.set(-L * 0.82, -rBall - wall * 1.1, -(insideWidth / 2 + wall + 0.016));
      group.add(caddyBar);
      for (const [idx, col] of [
        [0, '#b5c0c9'],
        [1, '#d9a441'],
        [2, '#2d70b3'],
      ] as const) {
        const spareBall = new THREE.Mesh(
          new THREE.SphereGeometry(rBall * 0.82, 16, 16),
          new THREE.MeshStandardMaterial({
            color: col,
            metalness: idx === 2 ? 0.15 : 0.85,
            roughness: idx === 2 ? 0.15 : 0.2,
          })
        );
        spareBall.position.set(
          -L * 0.82 - 0.028 + idx * 0.028,
          -rBall - wall * 1.1 + 0.014,
          -(insideWidth / 2 + wall + 0.016)
        );
        group.add(spareBall);
      }
    }
  } else {
    // Cylindrical or Slotted Machined Barrel (`tube` or `slotted_barrel`)
    const radialSegs = lightweight ? 24 : 48;
    const isSlotted = kind === 'slotted_barrel' || (!spec.reconstruction && visual.spring_visible === true);

    const profile = kind === 'tube' && !isSlotted ? spec.reconstruction?.barrelProfile : undefined;
    const inferredBore = profile ? fittedBarrelBoreRadius(spec, boreRadius) : undefined;
    const fittedProfile = inferredBore !== undefined ? profile : undefined;
    if (fittedProfile && inferredBore !== undefined) {
      const sections = [
        new THREE.Vector2(inferredBore, 0),
        ...fittedProfile.map(point => new THREE.Vector2(point.width * D / 2, point.along * L)),
        new THREE.Vector2(inferredBore, L),
        new THREE.Vector2(inferredBore, 0),
      ];
      const barrel = new THREE.Mesh(new THREE.LatheGeometry(sections, radialSegs), primaryMat);
      barrel.name = 'reconstructed-barrel-profile';
      barrel.position.x = -L;
      barrel.rotation.z = -Math.PI / 2;
      barrel.castShadow = !lightweight;
      barrel.receiveShadow = !lightweight;
      group.add(barrel);
    } else if (isSlotted) {
      // Three barrel sections with a central sight/cocking slot window
      const sections: Array<[number, number, boolean]> = [
        [0.14, 0.28, false],
        [0.50, 0.44, true],
        [0.86, 0.28, false],
      ];
      for (const [centerFrac, lenFrac, slottedWindow] of sections) {
        const cyl = new THREE.Mesh(
          new THREE.CylinderGeometry(
            D / 2,
            D / 2,
            L * lenFrac,
            radialSegs,
            1,
            true,
            slottedWindow ? Math.PI * 0.28 : 0,
            slottedWindow ? Math.PI * 1.52 : Math.PI * 2
          ),
          primaryMat
        );
        cyl.position.set(-L * centerFrac, 0, 0);
        cyl.rotation.z = Math.PI / 2;
        cyl.castShadow = !lightweight;
        cyl.receiveShadow = !lightweight;
        group.add(cyl);
      }

      // Precision Reinforcement Collars at Muzzle, Mid-Barrel, and Breech
      for (const collarX of [-0.014, -L * 0.28, -L * 0.72]) {
        const collar = new THREE.Mesh(
          new THREE.LatheGeometry([
            new THREE.Vector2(boreRadius, -0.011),
            new THREE.Vector2(D * 0.54, -0.011),
            new THREE.Vector2(D * 0.54, 0.011),
            new THREE.Vector2(boreRadius, 0.011),
            new THREE.Vector2(boreRadius, -0.011),
          ], radialSegs),
          darkAnodizedMat
        );
        collar.position.set(collarX, 0, 0);
        collar.rotation.z = Math.PI / 2;
        collar.castShadow = !lightweight;
        group.add(collar);
      }
    } else {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(D / 2, D / 2, L, radialSegs, 1, true),
        primaryMat
      );
      barrel.position.set(-L / 2, 0, 0);
      barrel.rotation.z = Math.PI / 2;
      barrel.castShadow = !lightweight;
       barrel.receiveShadow = !lightweight;
      group.add(barrel);
    }

    const sleeves = kind === 'tube' && !isSlotted && !fittedProfile ? spec.reconstruction?.guideSleeves : undefined;
    for (const [index, sleeve] of (sleeves ?? []).entries()) {
      const halfWidth = sleeve.width * D / 2;
      const halfHeight = sleeve.height * D / 2;
      const shape = new THREE.Shape();
      shape.moveTo(-halfWidth, -halfHeight);
      shape.lineTo(halfWidth, -halfHeight);
      shape.lineTo(halfWidth, halfHeight);
      shape.lineTo(-halfWidth, halfHeight);
      shape.closePath();
      const hole = new THREE.Path();
      hole.absarc(0, 0, D / 2, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      const sleeveGeometry = new THREE.ExtrudeGeometry(shape, {
        depth: (sleeve.end - sleeve.start) * L, bevelEnabled: false, curveSegments: lightweight ? 24 : 48,
      });
      sleeveGeometry.rotateY(Math.PI / 2);
      const sleeveMaterial = sleeve.color ? new THREE.MeshStandardMaterial({
        color: sleeve.color, metalness: .35, roughness: .48,
      }) : primaryMat;
      const block = new THREE.Mesh(sleeveGeometry, sleeveMaterial);
      block.name = 'reconstructed-guide-sleeve-' + index;
      block.position.x = (sleeve.start - 1) * L;
      block.castShadow = !lightweight;
      block.receiveShadow = !lightweight;
      group.add(block);
    }

    if (!fittedProfile) {
      // Muzzle Crown Bevel Ring
      const muzzleCrown = new THREE.Mesh(
        new THREE.TorusGeometry((D * 0.5 + boreRadius) / 2, (D * 0.5 - boreRadius) / 2, 16, radialSegs),
        darkAnodizedMat
      );
      muzzleCrown.position.set(-0.002, 0, 0);
      muzzleCrown.rotation.y = Math.PI / 2;
      group.add(muzzleCrown);

      // Knurled Breech Cap & Spring Tension Adjuster at -L
      const breechCap = new THREE.Mesh(
        new THREE.CylinderGeometry(sleeves?.length ? D / 2 : D * 0.55, sleeves?.length ? D / 2 : D * 0.55, 0.032, radialSegs),
        darkAnodizedMat
      );
      breechCap.position.set(-L + 0.016, 0, 0);
      breechCap.rotation.z = Math.PI / 2;
      breechCap.castShadow = !lightweight;
      group.add(breechCap);
    }

    if (!spec.reconstruction || visual.spring_visible) {
      const tensionScrew = new THREE.Mesh(
        new THREE.CylinderGeometry(D * 0.24, D * 0.24, 0.025, 16),
        brassMat
      );
      tensionScrew.position.set(-L - 0.01, 0, 0);
      tensionScrew.rotation.z = Math.PI / 2;
      group.add(tensionScrew);
    }
  }

  // Internal Helical Compression Spring & Machined Brass Plunger Piston (when visible or slotted)
  if (visual.spring_visible !== false && (kind !== 'rectangular_housing' || openHousing)) {
    const springRadius = Math.min(boreRadius * 0.78, D * 0.34);
    const springSpan = openHousing ? spec.reconstruction?.housingSpringSpan : undefined;
    const tracedSpring = springSpan && springSpan.start * L >= 0.021 && (1 - springSpan.end) * L >= 0.032;
    const startX = tracedSpring ? L * (springSpan.start - 1) : -L * 0.84;
    const endX = tracedSpring ? L * (springSpan.end - 1) : -L * 0.36;
    const samples = lightweight ? 120 : 220;
    const springPoints: THREE.Vector3[] = [];
    const totalTurns = 16;

    // Ground flat dead-coils at ends + active working coils in center
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      let turnU: number;
      if (u < 0.12) {
        turnU = (u / 0.12) * 1.5;
      } else if (u > 0.88) {
        turnU = totalTurns - 1.5 + ((u - 0.88) / 0.12) * 1.5;
      } else {
        turnU = 1.5 + ((u - 0.12) / 0.76) * (totalTurns - 3.0);
      }
      const x = startX + u * (endX - startX);
      const theta = turnU * Math.PI * 2;
      const yOffset = kind === 'open_channel' ? 0 : 0;
      springPoints.push(
        new THREE.Vector3(x, yOffset + Math.cos(theta) * springRadius, Math.sin(theta) * springRadius)
      );
    }
    const springCurve = new THREE.CatmullRomCurve3(springPoints);
    const wireRadius = Math.max(0.0022, D * 0.034);
    const springGeo = new THREE.TubeGeometry(
      springCurve,
      samples,
      openHousing ? Math.min(wireRadius, (endX - startX) / 40) : wireRadius,
      lightweight ? 6 : 10,
      false
    );
    const springMat = new THREE.MeshStandardMaterial({
      color: '#d4dde1',
      metalness: 0.92,
      roughness: 0.20,
    });
    const springMesh = new THREE.Mesh(springGeo, springMat);
    springMesh.name = 'compression-spring';
    group.add(springMesh);

    // Turned Brass Plunger Piston Head at front of spring
    const pistonHead = new THREE.Mesh(
      new THREE.CylinderGeometry(boreRadius * 0.92, boreRadius * 0.92, 0.024, 24),
      brassMat
    );
    pistonHead.position.set(endX + 0.012, 0, 0);
    pistonHead.rotation.z = Math.PI / 2;
    group.add(pistonHead);

    // Black Polyurethane Shock Damper Washer / Buffer Ring attached to piston face
    const bufferWasher = new THREE.Mesh(
      new THREE.CylinderGeometry(boreRadius * 0.88, boreRadius * 0.88, 0.006, 20),
      new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.95, metalness: 0.05 })
    );
    bufferWasher.position.set(endX + 0.026, 0, 0);
    bufferWasher.rotation.z = Math.PI / 2;
    group.add(bufferWasher);

    // Ground Center Stainless Steel Guide Shaft inside spring
    const guideShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0048, 0.0048, openHousing ? endX - startX + 0.032 : L * 0.58, 16),
      stainlessMat
    );
    guideShaft.position.set(openHousing ? (startX + endX) / 2 : -L * 0.61, 0, 0);
    guideShaft.rotation.z = Math.PI / 2;
    group.add(guideShaft);

    // Rear Breech Spring Guide Bushing
    const rearBushing = new THREE.Mesh(
      new THREE.CylinderGeometry(boreRadius * 0.90, boreRadius * 0.90, 0.022, 20),
      darkAnodizedMat
    );
    rearBushing.position.set(startX - 0.01, 0, 0);
    rearBushing.rotation.z = Math.PI / 2;
    group.add(rearBushing);
    if (openHousing) {
      const backing = new THREE.Mesh(new THREE.BoxGeometry(0.018, boreRadius * 1.5, D / 2), darkAnodizedMat);
      backing.name = 'open-housing-spring-bracket';
      backing.position.set(startX - 0.01, 0, -D / 4);
      group.add(backing);
    }
  }

  // External Cocking Handle & 3-Detent Notches (Short I, Medium II, Long III)
  if (visual.trigger_visible !== false && !openHousing) {
    const notchPositions = [
      { x: -L * 0.42, label: 'I' },
      { x: -L * 0.58, label: 'II' },
      { x: -L * 0.74, label: 'III' },
    ];

    for (const n of notchPositions) {
      const notchBlock = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, 0.014, 0.010),
        darkAnodizedMat
      );
      notchBlock.position.set(n.x, 0.004, D * 0.52);
      group.add(notchBlock);

      const notchPin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.003, 0.003, 0.004, 10),
        brassMat
      );
      notchPin.rotation.x = Math.PI / 2;
      notchPin.position.set(n.x, 0.012, D * 0.52 + 0.006);
      group.add(notchPin);
    }

    const handleStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, D * 0.58, 16),
      stainlessMat
    );
    handleStem.position.set(-L * 0.42, 0, D * 0.56);
    handleStem.rotation.x = Math.PI / 2;
    group.add(handleStem);

    // Knurled anodized handle knob with brass grip rings
    const knobGroup = new THREE.Group();
    knobGroup.position.set(-L * 0.42, 0, D * 0.86);

    const handleKnob = new THREE.Mesh(
      new THREE.SphereGeometry(0.013, 18, 18),
      new THREE.MeshStandardMaterial({ color: '#b91c1c', metalness: 0.4, roughness: 0.35 })
    );
    knobGroup.add(handleKnob);

    const knurlRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.011, 0.002, 10, 20),
      brassMat
    );
    knurlRing.rotation.y = Math.PI / 2;
    knobGroup.add(knurlRing);

    group.add(knobGroup);

    // Trigger sear block & steel release lanyard eyelet atop barrel
    const searBlock = new THREE.Mesh(
      new THREE.BoxGeometry(0.048, 0.018, 0.024),
      brassMat
    );
    searBlock.position.set(-L * 0.56, D * 0.54, 0);
    group.add(searBlock);

    const searPivotPin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0035, 0.0035, 0.028, 12),
      stainlessMat
    );
    searPivotPin.position.set(-L * 0.56, D * 0.55, 0);
    searPivotPin.rotation.x = Math.PI / 2;
    group.add(searPivotPin);

    const triggerLanyardEye = new THREE.Mesh(
      new THREE.TorusGeometry(0.005, 0.0015, 8, 16),
      brassMat
    );
    triggerLanyardEye.position.set(-L * 0.58, D * 0.54 + 0.014, 0);
    group.add(triggerLanyardEye);
  }

  // Dual Optical Photogate Beam Assembly at Muzzle Exit
  if (visual.photogate_bracket) {
    const dualGates = buildDualOpticalPhotogateAssembly(D, lightweight);
    group.add(dualGates);
  }

  // Housing Plumb-Bob Scale (when scale_style === 'housing_plumb')
  if (visual.angle_scale !== false && visual.scale_style === 'housing_plumb') {
    const plumbGroup = new THREE.Group();
    const dialRadius = openHousing ? Math.min(L * 0.15, D * 0.9) : Math.max(D * 0.85, 0.055);
    const scaleSpan = openHousing ? spec.reconstruction?.housingScaleSpan : undefined;
    const cardWidth = scaleSpan ? (scaleSpan.end - scaleSpan.start) * L : dialRadius * 2;
    const cardHeight = Math.min(cardWidth * 0.5625, D * 1.18);
    const cardX = scaleSpan ? L * ((scaleSpan.start + scaleSpan.end) / 2 - 1) : -L * 0.82;
    plumbGroup.position.set(cardX, openHousing ? cardHeight / 3 : 0,
      openHousing ? D / 2 + 0.001 : D * 0.54);

    // Laser-engraved protractor dial plate with plumb markings
    let cardMesh: THREE.Mesh;
    if (openHousing) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 288;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#f0eee6';
        ctx.fillRect(0, 0, 512, 288);
        ctx.strokeStyle = ctx.fillStyle = '#242528';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '13px sans-serif';
        for (let degrees = -90; degrees <= 90; degrees += 2) {
          const theta = degrees * Math.PI / 180;
          const x = Math.sin(theta), y = Math.cos(theta);
          const major = degrees % 10 === 0;
          const inner = major ? 198 : 206;
          ctx.beginPath();
          ctx.moveTo(256 + x * inner, 48 + y * inner);
          ctx.lineTo(256 + x * 215, 48 + y * 215);
          ctx.stroke();
          if (major) ctx.fillText(String(Math.abs(degrees)), 256 + x * 182, 48 + y * 182);
        }
      }
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      cardMesh = new THREE.Mesh(new THREE.PlaneGeometry(cardWidth, cardHeight),
        new THREE.MeshStandardMaterial({ map, roughness: 0.55, side: THREE.DoubleSide }));
      cardMesh.name = 'open-housing-scale-plate';
      cardMesh.position.y = -cardHeight / 3;
      for (const side of [-1, 1]) {
        const bracket = new THREE.Mesh(new THREE.BoxGeometry(cardWidth * 0.09, D * 1.24, 0.003), darkAnodizedMat);
        bracket.position.set(side * cardWidth * 0.41, -plumbGroup.position.y, -0.0025);
        plumbGroup.add(bracket);
      }
    } else {
      const map = createEngravedProtractorTexture('housing_plumb');
      cardMesh = new THREE.Mesh(new THREE.CircleGeometry(dialRadius * 0.85, 48),
        new THREE.MeshStandardMaterial({ map, roughness: 0.35, metalness: 0.15, side: THREE.DoubleSide }));
      cardMesh.rotation.z = -Math.PI / 2;
    }
    plumbGroup.add(cardMesh);

    // Authentic Turned Solid Brass Plumb Bob & Protective Acrylic Lens
    const plumbBobMesh = buildTurnedBrassPlumbBob(dialRadius, angleDeg, brassMat,
      openHousing ? cardHeight * 1.13 : undefined);
    plumbGroup.add(plumbBobMesh);

    group.add(plumbGroup);
  }

  return group;
}

/**
 * Builds an authentic laboratory vertical support stand (heavy circular cast iron base +
 * stainless steel upright rod + machined locking collar) connecting the tabletop surface (y = 0)
 * to an elevated apparatus frame or trunnion so it never floats in mid-air.
 */
function buildTabletopSupportStand(
  rodX: number,
  rodZ: number,
  rodH: number,
  clampY: number,
  lightweight: boolean
): THREE.Group {
  const standGroup = new THREE.Group();
  const rodMat = new THREE.MeshStandardMaterial({ color: '#b0bec5', metalness: 0.88, roughness: 0.22 });
  const clampMat = new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.45, roughness: 0.65 });

  // Heavy circular cast iron table base resting flush on tabletop at y = 0
  const tableBase = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.025, 24), clampMat);
  tableBase.position.set(rodX, 0.0125, rodZ);
  tableBase.castShadow = !lightweight;
  tableBase.receiveShadow = !lightweight;
  standGroup.add(tableBase);

  // Vertical stainless steel rod extending from base up to the apparatus
  const actualH = Math.max(0.08, rodH);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, actualH, 20), rodMat);
  rod.position.set(rodX, actualH / 2, rodZ);
  rod.castShadow = !lightweight;
  standGroup.add(rod);

  // Locking clamp collar gripping the apparatus frame/bracket
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.038, 20), clampMat);
  collar.position.set(rodX, clampY, rodZ);
  standGroup.add(collar);

  // Clamp tightening thumbscrew
  const thumbscrew = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.032, 12), rodMat);
  thumbscrew.rotation.z = Math.PI / 2;
  thumbscrew.position.set(rodX - 0.022, clampY, rodZ);
  standGroup.add(thumbscrew);

  return standGroup;
}

/**
 * Builds an authentic heavy laboratory elevator stage / lab jack
 * (heavy cast iron base plate resting flush on tabletop at y = 0, dual telescoping stainless steel
 * riser columns with locking collar handwheels, and a sturdy top deck supporting the apparatus feet).
 */
function buildApparatusElevatorStage(
  centerX: number,
  centerZ: number,
  platformWidth: number,
  platformDepth: number,
  platformTopY: number,
  lightweight: boolean,
  deckColor?: string
): THREE.Group {
  const group = new THREE.Group();
  if (platformTopY <= 0.005) return group;

  const baseMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    metalness: 0.65,
    roughness: 0.35,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: '#d4dde1',
    metalness: 0.90,
    roughness: 0.15,
  });
  const deckMat = new THREE.MeshStandardMaterial({
    color: deckColor ?? '#0f172a',
    metalness: deckColor ? 0.14 : 0.40,
    roughness: 0.60,
  });
  const rubberMat = new THREE.MeshStandardMaterial({
    color: '#111827',
    metalness: 0.1,
    roughness: 0.9,
  });

  const deckThickness = 0.016;
  const inlayThickness = deckColor ? 0 : 0.002;
  const deckSurfaceY = platformTopY - inlayThickness;
  const baseThickness = 0.018;
  const footHeight = 0.006;
  const baseTopY = baseThickness + footHeight;
  const W = Math.max(0.24, platformWidth);
  const D = Math.max(0.18, platformDepth);

  // 1. The base plate rests on four rubber leveling feet.
  const basePlate = new THREE.Mesh(new THREE.BoxGeometry(W, baseThickness, D), baseMat);
  basePlate.name = 'riser-base-plate';
  basePlate.position.set(centerX, footHeight + baseThickness / 2, centerZ);
  basePlate.castShadow = !lightweight;
  basePlate.receiveShadow = !lightweight;
  group.add(basePlate);

  // 4 Rubber Leveling Feet under Base Plate
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const foot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.016, footHeight, 16),
        rubberMat
      );
      foot.name = 'riser-leveling-foot';
      foot.position.set(centerX + sx * (W / 2 - 0.018), footHeight / 2, centerZ + sz * (D / 2 - 0.018));
      group.add(foot);
    }
  }

  // 2. Top Elevator Deck resting flush at platformTopY
  const topDeck = new THREE.Mesh(new THREE.BoxGeometry(W, deckThickness - inlayThickness, D), deckMat);
  topDeck.name = 'riser-top-deck';
  topDeck.position.set(centerX, deckSurfaceY - (deckThickness - inlayThickness) / 2, centerZ);
  topDeck.castShadow = !lightweight;
  topDeck.receiveShadow = !lightweight;
  group.add(topDeck);

  if (!deckColor) {
    // The mat sits above the steel, with its top at the launcher contact height.
    const matInlay = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.94, inlayThickness, D * 0.92),
      rubberMat
    );
    matInlay.position.set(centerX, platformTopY - inlayThickness / 2, centerZ);
    group.add(matInlay);
  }

  // 3. Telescoping Vertical Stainless Steel Columns
  const columnH = Math.max(0.02, platformTopY - deckThickness - baseTopY);
  const colY = baseTopY + columnH / 2;
  const colSpanX = W * 0.35;

  for (const cx of [-colSpanX, colSpanX]) {
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.020, columnH, 20),
      chromeMat
    );
    col.name = 'riser-column';
    col.position.set(centerX + cx, colY, centerZ);
    col.castShadow = !lightweight;
    group.add(col);

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.028, 0.014, 20),
      baseMat
    );
    collar.position.set(centerX + cx, baseTopY + 0.007, centerZ);
    group.add(collar);

    const lockCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.020, 20),
      baseMat
    );
    lockCollar.position.set(centerX + cx, baseTopY + columnH * 0.55, centerZ);
    group.add(lockCollar);

    const knob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.010, 0.010, 0.028, 16),
      chromeMat
    );
    knob.rotation.z = Math.PI / 2;
    knob.position.set(centerX + cx + (cx > 0 ? 0.022 : -0.022), baseTopY + columnH * 0.55, centerZ);
    group.add(knob);
  }

  // Cross-brace for higher elevations
  if (columnH > 0.25) {
    const braceLen = Math.hypot(colSpanX * 2, columnH * 0.7);
    const braceAngle = Math.atan2(columnH * 0.7, colSpanX * 2);
    const brace = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.007, braceLen, 12),
      chromeMat
    );
    brace.position.set(centerX, colY, centerZ - D * 0.15);
    brace.rotation.z = braceAngle;
    group.add(brace);
  }

  return group;
}

/**
 * Builds an authentic bench-edge C-clamp (top jaw on bench at y = 0, spine wrapping around lip,
 * bottom jaw with acme lead screw below bench, and upright riser post extending up to apparatus).
 */
function buildBenchEdgeClamp(
  x: number,
  supportZ: number,
  lightweight: boolean,
  previewMode: boolean = false,
  topWidth = 0.12
): THREE.Group {
  const group = new THREE.Group();
  const edge = LAB_BENCH_DEPTH / 2 - CLAMP_LAUNCH_AXIS_Z;
  const reach = edge - supportZ + 0.035;
  const clampMat = new THREE.MeshStandardMaterial({ color: '#252a30', metalness: 0.35, roughness: 0.52 });
  const steel = new THREE.MeshStandardMaterial({ color: '#a8b1ba', metalness: 0.65, roughness: 0.34 });
  const add = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = !lightweight;
    group.add(mesh);
    return mesh;
  };

  // The top jaw sits on the worktop; the spine and screw wrap around its front edge.
  const jawZ = edge + 0.012 - reach / 2;
  add('bench-clamp-top', new THREE.BoxGeometry(topWidth, CLAMP_TOP_THICKNESS, reach),
    clampMat, CLAMP_TOP_THICKNESS / 2, jawZ);
  const spineHeight = LAB_BENCH_THICKNESS + 0.062;
  add('bench-clamp-spine', new THREE.BoxGeometry(0.11, spineHeight, 0.024),
    clampMat, CLAMP_TOP_THICKNESS - spineHeight / 2, edge + 0.012);
  const lowerY = -LAB_BENCH_THICKNESS - 0.036;
  add('bench-clamp-lower', new THREE.BoxGeometry(0.11, 0.017, 0.103),
    clampMat, lowerY, edge - 0.0275);
  const screwZ = edge - 0.046;
  add('bench-clamp-screw', new THREE.CylinderGeometry(0.007, 0.007, 0.072, 16),
    steel, lowerY - 0.004, screwZ);
  add('bench-clamp-pad', new THREE.CylinderGeometry(0.018, 0.018, 0.007, 20),
    steel, -LAB_BENCH_THICKNESS - 0.0035, screwZ);
  const handle = add('bench-clamp-handle', new THREE.CylinderGeometry(0.004, 0.004, 0.078, 14),
    steel, lowerY - 0.039, screwZ);
  handle.rotation.z = Math.PI / 2;

  if (previewMode) {
    add('preview-bench-edge', new THREE.BoxGeometry(Math.max(0.34, topWidth + 0.12), LAB_BENCH_THICKNESS, reach + 0.11),
      new THREE.MeshStandardMaterial({ color: '#d7d3c8', roughness: 0.82 }),
      -LAB_BENCH_THICKNESS / 2, edge - (reach + 0.11) / 2);
  }
  return group;
}

function alignLauncher(
  body: THREE.Group,
  muzzle: THREE.Vector3,
  target: readonly [number, number, number],
  scale: number
) {
  body.name = 'launcher-body';
  body.scale.setScalar(scale);
  body.position.set(...target).addScaledVector(muzzle, -scale);
  const marker = new THREE.Object3D();
  marker.name = 'muzzle-center';
  marker.position.copy(muzzle);
  body.add(marker);
}

function supportWoodenLauncher(
  root: THREE.Group, x: number, z: number, width: number, depth: number,
  feetY: number, mountMode: 'stand' | 'clamp', lightweight: boolean, previewMode: boolean, deckColor?: string
) {
  const clamp = mountMode === 'clamp';
  const baseY = clamp ? CLAMP_TOP_THICKNESS : 0;
  const lift = feetY - baseY;
  if (clamp) {
    // Support the entire foot or elevator base, including wide two-foot launchers.
    const footprintWidth = lift >= 0.06 ? Math.max(0.24, width) : width;
    const footprintDepth = lift >= 0.06 ? Math.max(0.18, depth) : depth;
    const rearReach = Math.max(0, footprintDepth / 2 - 0.023);
    root.add(buildBenchEdgeClamp(x, z - rearReach, lightweight, previewMode, Math.max(0.12, footprintWidth)));
  }
  if (lift <= 0.0005) return;
  if (lift < 0.06) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(width, lift, depth),
      new THREE.MeshStandardMaterial({ color: deckColor ?? '#343c41', roughness: 0.68 }));
    pad.position.set(x, baseY + lift / 2, z);
    root.add(pad);
  } else {
    const platform = buildApparatusElevatorStage(x, z, width, depth, lift, lightweight, deckColor);
    platform.position.y = baseY;
    root.add(platform);
  }
}

/**
 * Builds the complete 3D Projectile Motion Apparatus Group (Base + Support + Protractor Dial +
 * Trunnion Pivot + Launch Guide Assembly).
 */
export function buildProjectileApparatusGroup(options: ApparatusBuildOptions): THREE.Group {
  const { spec, angleDeg, projectileCenterY, lightweight = false, previewMode = false } = options;
  const root = new THREE.Group();
  const { visual, dimensions } = spec;
  const mountMode = options.mountMode || (visual.mount_type === 'clamp' ? 'clamp' : 'stand');

  const pose = computeApparatusKinematicsPose(spec, angleDeg, projectileCenterY);
  const [pivotX, pivotY] = pose.pivot;
  const [exitX, exitY] = pose.tubeExit;
  const pivotHeight = Math.max(0.045, pivotY);
  if (spec.id === PASCO_MINI_ID) {
    const model = buildPascoMiniLauncher(angleDeg, lightweight);
    if (model) {
      const marker = model.getObjectByName('muzzle-center')!;
      model.position.copy(new THREE.Vector3(...pose.muzzleCenter).sub(marker.getWorldPosition(new THREE.Vector3())));
      supportWoodenLauncher(root, model.position.x + 0.030, model.position.z - 0.048, 0.152, 0.115,
        model.position.y, mountMode, lightweight, previewMode, '#a8b0b4');
      root.add(model);
      return root;
    }
  }

  if (spec.id === VERNIER_VPL_ID) {
    const model = buildVernierLauncher(angleDeg, lightweight);
    if (model) {
      const marker = model.getObjectByName('muzzle-center')!;
      model.position.copy(new THREE.Vector3(...pose.muzzleCenter).sub(marker.getWorldPosition(new THREE.Vector3())));
      supportWoodenLauncher(root, model.position.x, model.position.z + 0.041, 0.168, 0.142,
        model.position.y, mountMode, lightweight, previewMode, '#a8b0b4');
      root.add(model);
      return root;
    }
  }

  if (spec.id === PASCO_ME6800_ID) {
    const model = buildPascoLauncher(angleDeg, dimensions.barrelLength, dimensions.projectileDiameter / 2, lightweight);
    if (model) {
      const marker = model.getObjectByName('muzzle-center')!;
      model.position.copy(new THREE.Vector3(...pose.muzzleCenter).sub(marker.getWorldPosition(new THREE.Vector3())));
      // The cast foot is offset behind the launch axis in the Blender model.
      supportWoodenLauncher(root, model.position.x, model.position.z - 0.033, 0.123, 0.145,
        model.position.y, mountMode, lightweight, previewMode, '#a8b0b4');
      root.add(model);
      return root;
    }
  }

  if (spec.id === ARBOR_MINI_ID) {
    const nativePivotHeight = arborMiniPivotHeight(angleDeg, dimensions.barrelLength);
    const model = buildArborLauncher(angleDeg, nativePivotHeight, dimensions.barrelLength, dimensions.projectileDiameter / 2, lightweight);
    if (model) {
      const marker = model.getObjectByName('muzzle-center')!;
      model.position.copy(new THREE.Vector3(...pose.muzzleCenter).sub(marker.getWorldPosition(new THREE.Vector3())));
      supportWoodenLauncher(root, model.position.x - 0.033, model.position.z, 0.155, 0.15,
        model.position.y, mountMode, lightweight, previewMode, '#a8b0b4');
      root.add(model);
      return root;
    }
  }

  if (spec.id === BOREAL_ID) {
    const model = buildBorealLauncher(angleDeg, dimensions.projectileDiameter / 2, lightweight);
    if (model) {
      const marker = model.getObjectByName('muzzle-center')!;
      model.position.copy(new THREE.Vector3(...pose.muzzleCenter).sub(marker.getWorldPosition(new THREE.Vector3())));
      supportWoodenLauncher(root, model.position.x - 0.146, model.position.z - 0.024, 0.414, 0.104,
        model.position.y, mountMode, lightweight, previewMode, '#606b70');
      root.add(model);
      return root;
    }
    const borealRig = createProjectileLauncher({
      initialAngleDeg: angleDeg,
      initialNotch: 3,
    });
    borealRig.setShowVectors(false);
    borealRig.setShowTrajectory(false);
    borealRig.projectileGroup.visible = false;
    borealRig.setAngleDeg(angleDeg);

    const { scale: legacyScale, floorY } = BOREAL_MOUNT;
    const muzzle = borealRig.getMuzzleWorldPosition();
    const mountHeight = mountMode === 'clamp' ? CLAMP_TOP_THICKNESS : 0;
    const scale = Math.min(legacyScale, (projectileCenterY - mountHeight) / (muzzle.y - floorY));
    alignLauncher(borealRig.root, muzzle, pose.muzzleCenter, scale);
    const { x, y, z } = borealRig.root.position;
    supportWoodenLauncher(root, x + 0.01, z, 0.54, 0.13, y + floorY * scale,
      mountMode, lightweight, previewMode, '#606b70');

    if (lightweight) {
      borealRig.root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = false;
          obj.receiveShadow = false;
        }
      });
    }

    root.add(borealRig.root);
    return root;
  }

  if (spec.id === EISCO_PH0343_ID) {
    const model = buildEiscoLauncher(angleDeg, lightweight);
    if (model) {
      const marker = model.getObjectByName('muzzle-center')!;
      model.position.copy(new THREE.Vector3(...pose.muzzleCenter).sub(marker.getWorldPosition(new THREE.Vector3())));
      // The adapter's center is behind the channel's axis.
      supportWoodenLauncher(root, model.position.x, model.position.z - 0.035, 0.108, 0.112,
        model.position.y, mountMode, lightweight, previewMode, '#a8b0b4');
      root.add(model);
      return root;
    }

    const eiscoRig = createEiscoLauncher({
      initialAngleDeg: angleDeg,
      rangeSetting: 'long',
      projectileMaterial: 'steel',
    });
    eiscoRig.setShowHelpers(false);
    eiscoRig.projectileMesh.visible = false;
    eiscoRig.setAngleDeg(angleDeg);

    // If the GLB is unavailable, fit the procedural model to the same launch point and clearance.
    eiscoRig.tableClampGroup.removeFromParent();
    eiscoRig.projectileMesh.removeFromParent();
    const muzzle = eiscoRig.getMuzzleWorldPos();
    const bounds = new THREE.Box3().setFromObject(eiscoRig.root, true);
    const drop = Math.max(0.001, muzzle.y - bounds.min.y);
    const scale = Math.min(0.17, Math.max(0.01, projectileCenterY - 0.04) / drop);
    alignLauncher(eiscoRig.root, muzzle, pose.muzzleCenter, scale);
    const { x, y, z } = eiscoRig.root.position;
    const pivotX = x + 0.55 * scale;
    const pivotY = y + 0.20 * scale;
    const postZ = z - 0.05;
    const stand = buildTabletopSupportStand(pivotX, postZ, pivotY + 0.015, pivotY, lightweight);
    if (mountMode === 'clamp') {
      root.add(buildBenchEdgeClamp(pivotX, postZ, lightweight, previewMode));
      // This bracket fastens directly to the clamp jaw; omit the freestanding base.
      stand.remove(stand.children[0]);
    }
    root.add(stand);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.03, 0.054),
      new THREE.MeshStandardMaterial({ color: '#303840', roughness: 0.55 }));
    bracket.position.set(pivotX, pivotY, z - 0.026);
    root.add(bracket);

    if (lightweight) {
      eiscoRig.root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = false;
          obj.receiveShadow = false;
        }
      });
    }

    root.add(eiscoRig.root);
    return root;
  }

  if (spec.id === 'cpo-marble-launcher' || spec.id === GSC_PROLCH_ID) {
    const cpoRig = createCPOMarbleLauncher({
      initialAngleDeg: angleDeg,
      springSlot: 3,
      showProjectile: false,
      barrelColor: spec.id === GSC_PROLCH_ID ? '#175bb5' : undefined,
      showPhotogates: spec.id !== GSC_PROLCH_ID,
    });
    cpoRig.setAngle(angleDeg);

    const { scale, floorY } = CPO_MOUNT;
    alignLauncher(cpoRig.group, cpoRig.getMuzzleWorldPos(), pose.muzzleCenter, scale);
    const { x, y, z } = cpoRig.group.position;
    supportWoodenLauncher(root, x + 0.005, z, 0.43, 0.19, y + floorY * scale,
      mountMode, lightweight, previewMode, '#606b70');

    if (lightweight) {
      cpoRig.group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = false;
          obj.receiveShadow = false;
        }
      });
    }

    root.add(cpoRig.group);
    return root;
  }

  if (spec.id === 'wooden-marble-ramp-launcher') {
    const woodenRig = createWoodenMarbleLauncher({
      initialAngleDeg: angleDeg,
      barrelLength: dimensions.barrelLength || 0.28,
      lightweight,
    });
    woodenRig.setAngleDeg(angleDeg);

    // Coordinate kinematics alignment:
    const muzzleLocal = woodenRig.getMuzzleWorldPos();
    const muzzleCenterX = pose.muzzleCenter[0];
    const muzzleCenterY = projectileCenterY;
    const launcherPosX = muzzleCenterX - muzzleLocal.x;
    const launcherPosY = muzzleCenterY - muzzleLocal.y;
    const launcherPosZ = -muzzleLocal.z;

    // Desktop Stand mode:
    // The wooden launcher rests flush on the tabletop with zero penetration below y = 0.
    // In woodenRig, the pivot is at y = 0, and the integral Baltic birch resting feet sit at y = -pivotH (-0.082m).
    // Therefore, placing feet flush on the table/grid requires woodenRig.root.position.y = pivotH = 0.082m.
    const nativeTabletopPosY = 0.082;

    if (previewMode) {
      // In reconstruction preview modal: apparatus rests directly on the tabletop grid surface at y = 0.
      // Wooden quadrant launchers are self-supporting desktop units with integral wooden feet;
      // they never spawn laboratory stand rods or pedestal bases.
      woodenRig.root.position.set(-0.02, nativeTabletopPosY, 0);
    } else {
      woodenRig.root.position.set(launcherPosX, launcherPosY, launcherPosZ);
      if (mountMode === 'stand') {
        if (launcherPosY > nativeTabletopPosY + 0.015) {
          const elevY = launcherPosY - nativeTabletopPosY;
          // Heavy laboratory elevator stage resting on table surface at y = 0 directly under wooden feet
          const stage = buildApparatusElevatorStage(
            launcherPosX - 0.035,
            launcherPosZ + 0.01,
            0.40,
            0.22,
            elevY,
            lightweight
          );
          root.add(stage);
        }
      } else {
        // Bench-Edge Clamp mode
        const clamp = buildBenchEdgeClamp(
          launcherPosX + 0.08,
          launcherPosZ + 0.02,
          lightweight,
          previewMode
        );
        root.add(clamp);
      }
    }

    if (lightweight) {
      woodenRig.root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = false;
          obj.receiveShadow = false;
        }
      });
    }

    root.add(woodenRig.root);
    return root;
  }

  const brushedTex = createBrushedMetalTexture();
  const woodTex = createWoodGrainTexture();

  const isWood =
    visual.support_material === 'wood' || visual.base_color === 'wood';
  const baseColor = spec.reconstruction?.supportColor || BASE_COLOR_PALETTE[visual.base_color] || BASE_COLOR_PALETTE.black;
  const supportPBR = resolveMaterialPBR(
    visual.support_material !== 'unknown'
      ? visual.support_material
      : isWood
      ? 'wood'
      : visual.base_color === 'silver'
      ? 'metal'
      : 'cast_iron'
  );

  const baseMat = new THREE.MeshStandardMaterial({
    color: baseColor,
    metalness: supportPBR.metalness,
    roughness: supportPBR.roughness,
    map: isWood ? woodTex : supportPBR.metalness > 0.6 && !lightweight ? brushedTex : null,
  });

  const rubberMat = new THREE.MeshStandardMaterial({
    color: '#1b2022',
    metalness: 0.05,
    roughness: 0.92,
  });

  const machinedSteelMat = new THREE.MeshStandardMaterial({
    color: '#aeb8bd',
    metalness: 0.82,
    roughness: 0.28,
  });

  const zOffset = -Math.max(dimensions.barrelDiameter * 0.85, 0.052);
  const isClamp = mountMode === 'clamp';

  const safeExitY = exitY;
  const safePivotY = pivotY;
  const safePivotHeight = Math.max(0.045, pivotY);
  const supportBaseY = isClamp ? CLAMP_TOP_THICKNESS : reconstructionStandDeck(spec);
  const span = reconstructionPanelWidth(spec);
  const isPanel = visual.base === 'panel';
  const customPanel = isPanel ? spec.reconstruction?.panelOutline : undefined;
  const adapterThickness = isClamp && (visual.base === 'frame' || isPanel) ? 0.014 : 0;
  const pedestalY = supportBaseY + adapterThickness;
  const uprightHeight = Math.max(0.025, safePivotHeight - pedestalY + 0.012);

  // Base / Bench Mounting Assembly
  if (isClamp) {
    const frame = visual.base === 'frame';
    const footX = pivotX - (frame ? dimensions.baseLength * 0.15 : isPanel && !customPanel ? span * 0.1 : 0);
    const footZ = zOffset - (isPanel ? 0.012 : 0);
    const footWidth = frame ? dimensions.baseLength * 0.3 + 0.09 : isPanel ? span + 0.012 : 0.095;
    const footDepth = isPanel ? 0.115 : 0.10;
    root.add(buildBenchEdgeClamp(footX, footZ - footDepth / 2 + 0.023, lightweight, previewMode,
      Math.max(0.12, footWidth)));
    if (adapterThickness) {
      const adapter = new THREE.Mesh(new THREE.BoxGeometry(footWidth, adapterThickness, footDepth), baseMat);
      adapter.name = 'clamp-mount-adapter';
      adapter.position.set(footX, supportBaseY + adapterThickness / 2, footZ);
      root.add(adapter);
    }
  } else if (customPanel && spec.reconstruction?.panelStand) {
    const { left, right, color } = spec.reconstruction.panelStand;
    const thickness = span * (spec.reconstruction.panelThicknessRatio ?? 0);
    const depth = Math.max(dimensions.baseWidth, thickness + 0.016, 0.06);
    const stand = new THREE.Mesh(
      new THREE.BoxGeometry((right - left) * span, supportBaseY, depth),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7 })
    );
    stand.name = 'reconstructed-panel-stand';
    stand.position.set(pivotX + (left + right) * span / 2, supportBaseY / 2, zOffset - 0.002 - (thickness || 0.024) / 2);
    stand.castShadow = !lightweight;
    stand.receiveShadow = !lightweight;
    root.add(stand);
  } else if (visual.foot_style === 'cross_feet') {
    // Two stabilizing outrigger cross-feet with rubber leveling pads
    const span = Math.max(dimensions.baseLength * 0.74, 0.24);
    for (const xFrac of [-0.46, 0.30]) {
      const footGroup = new THREE.Group();
      footGroup.position.set(pivotX + span * xFrac, 0, zOffset * 0.5);

      const crossbar = new THREE.Mesh(
        new THREE.BoxGeometry(Math.min(0.065, dimensions.baseLength * 0.14), 0.038, dimensions.baseWidth),
        baseMat
      );
      crossbar.position.set(0, 0.025, 0);
      crossbar.castShadow = !lightweight;
      crossbar.receiveShadow = !lightweight;
      footGroup.add(crossbar);

      for (const zDir of [-1, 1]) {
        const pad = new THREE.Mesh(
          new THREE.CylinderGeometry(0.016, 0.018, 0.01, 16),
          rubberMat
        );
        pad.position.set(0, 0.005, zDir * dimensions.baseWidth * 0.42);
        footGroup.add(pad);
      }
      root.add(footGroup);
    }

    // Longitudinal connecting tie-beam between cross feet
    const tieBeam = new THREE.Mesh(
      new THREE.BoxGeometry(dimensions.baseLength * 0.88, 0.028, 0.055),
      baseMat
    );
    tieBeam.position.set(pivotX - span * 0.08, 0.032, zOffset);
    tieBeam.castShadow = !lightweight;
    root.add(tieBeam);
  } else if (visual.foot_style === 'extruded_rail') {
    // T-slot extruded aluminum rail bed with end caps and outrigger pads
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(dimensions.baseLength, 0.044, dimensions.baseWidth * 0.65),
      machinedSteelMat
    );
    rail.name = 'stand-rail';
    rail.position.set(pivotX, 0.028, zOffset * 0.45);
    rail.castShadow = !lightweight;
    rail.receiveShadow = !lightweight;
    root.add(rail);

    // T-slot dark grooves along rail top
    for (const zG of [-0.03, 0.03]) {
      const groove = new THREE.Mesh(
        new THREE.BoxGeometry(dimensions.baseLength * 0.96, 0.003, 0.01),
        rubberMat
      );
      groove.position.set(pivotX, 0.051, zOffset * 0.45 + zG);
      root.add(groove);
    }

    // Black end caps & 4 leveling feet
    for (const xSign of [-1, 1]) {
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.046, dimensions.baseWidth * 0.67),
        rubberMat
      );
      cap.position.set(pivotX + xSign * (dimensions.baseLength / 2), 0.028, zOffset * 0.45);
      root.add(cap);

      for (const zSign of [-1, 1]) {
        const foot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.02, 0.012, 16),
          rubberMat
        );
        foot.position.set(
          pivotX + xSign * dimensions.baseLength * 0.4,
          0.006,
          zOffset * 0.45 + zSign * dimensions.baseWidth * 0.26
        );
        root.add(foot);
      }
    }
  } else {
    // Solid heavy machined baseplate with chamfered upper deck, recessed spirit level bubble, and 4 rubber leveling feet
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(dimensions.baseLength, 0.042, dimensions.baseWidth),
      baseMat
    );
    plate.position.set(pivotX, 0.027, 0);
    plate.castShadow = !lightweight;
    plate.receiveShadow = !lightweight;
    root.add(plate);

    // Top machined sub-plate trim
    const topDeck = new THREE.Mesh(
      new THREE.BoxGeometry(dimensions.baseLength * 0.92, 0.008, dimensions.baseWidth * 0.86),
      new THREE.MeshStandardMaterial({
        color: isWood ? '#a67946' : '#323b40',
        metalness: isWood ? 0.0 : 0.65,
        roughness: isWood ? 0.8 : 0.35,
      })
    );
    topDeck.name = 'stand-top-deck';
    topDeck.position.set(pivotX, 0.051, 0);
    root.add(topDeck);

    // Circular Bullseye Spirit Level on baseplate corner
    const levelHousing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 0.008, 20),
      machinedSteelMat
    );
    levelHousing.position.set(pivotX + dimensions.baseLength * 0.34, 0.056, dimensions.baseWidth * 0.28);
    root.add(levelHousing);

    const levelVial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.009, 20),
      new THREE.MeshBasicMaterial({ color: '#7ad456' })
    );
    levelVial.position.set(pivotX + dimensions.baseLength * 0.34, 0.057, dimensions.baseWidth * 0.28);
    root.add(levelVial);

    // 4 Corner Anti-Vibration Rubber Leveling Feet + Brass Knurled Lock Nuts
    for (const rx of [-1, 1]) {
      for (const rz of [-1, 1]) {
        const fx = pivotX + rx * dimensions.baseLength * 0.4;
        const fz = rz * dimensions.baseWidth * 0.38;
        const pad = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.023, 0.012, 20),
          rubberMat
        );
        pad.position.set(fx, 0.006, fz);
        root.add(pad);
      }
    }
  }

  // 2. Vertical Support Structure (Trunnion Yoke / Contoured Side Panel / Dual-Column Frame / Post)
  if (isPanel) {
    const H = Math.max(safePivotHeight, 0.14);
    const panelShape = new THREE.Shape();
    const outline = customPanel;
    const panelHeight = reconstructionPanelHeight(spec);
    const panelBaseY = panelHeight === undefined ? pedestalY : Math.max(pedestalY, safePivotHeight - panelHeight);
    if (outline && panelHeight !== undefined) {
      const height = panelHeight;
      outline.forEach(({ x, y }, i) => {
        if (i === 0) panelShape.moveTo(x * span, y * height);
        else panelShape.lineTo(x * span, y * height);
      });
    } else {
      panelShape.moveTo(-span * 0.48, 0);
      panelShape.lineTo(span * 0.48, 0);
      panelShape.lineTo(span * 0.19, H * 0.99);
      panelShape.lineTo(-span * 0.11, H * 1.05);
    }
    panelShape.closePath();
    const cutout = outline ? spec.reconstruction?.panelCutout : undefined;
    if (cutout && panelHeight !== undefined) {
      for (const ring of [cutout, ...(spec.reconstruction?.panelExtraCutouts ?? [])]) {
        const opening = new THREE.Path(ring.map(({ x, y }) => new THREE.Vector2(x * span, y * panelHeight)));
        opening.closePath();
        panelShape.holes.push(opening);
      }
    }
    const thicknessRatio = outline ? spec.reconstruction?.panelThicknessRatio : undefined;
    const panelThickness = thicknessRatio === undefined ? 0.024 : span * thicknessRatio;
    const panelGeo = new THREE.ExtrudeGeometry(panelShape, {
      depth: panelThickness,
      bevelEnabled: !cutout,
      bevelSize: 0.003,
      bevelThickness: 0.003,
      bevelSegments: 2,
    });
    const panelMesh = new THREE.Mesh(panelGeo, baseMat);
    panelMesh.name = 'launcher-side-panel';
    panelMesh.position.set(pivotX - (outline ? 0 : span * 0.1), panelBaseY, zOffset - 0.002 - panelThickness);
    const riserHeight = panelBaseY - pedestalY;
    if (riserHeight > 0.001) {
      const riser = new THREE.Mesh(new THREE.BoxGeometry(span, riserHeight, 0.075), machinedSteelMat);
      riser.position.set(pivotX, pedestalY + riserHeight / 2, zOffset);
      riser.castShadow = !lightweight;
      riser.receiveShadow = !lightweight;
      root.add(riser);
    }
    panelMesh.castShadow = !lightweight;
    panelMesh.receiveShadow = !lightweight;
    root.add(panelMesh);

    if (!outline) {
      const bolt1 = createFastenerGroup(0.011, false);
      bolt1.position.set(pivotX - span * 0.35, 0.085, zOffset - 0.005);
      root.add(bolt1);
      const bolt2 = createFastenerGroup(0.011, false);
      bolt2.position.set(pivotX + span * 0.2, 0.085, zOffset - 0.005);
      root.add(bolt2);
    }
  } else if (visual.base === 'frame') {
    // Dual-column portal frame with upper & lower crossbeams and diagonal brace
    const colPositions = [pivotX, pivotX - dimensions.baseLength * 0.3];
    for (const cx of colPositions) {
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(0.042, uprightHeight, 0.042),
        baseMat
      );
      col.position.set(cx, pedestalY + uprightHeight / 2, zOffset);
      col.castShadow = !lightweight;
      root.add(col);

      // Base mounting flange
      const flange = new THREE.Mesh(
        new THREE.BoxGeometry(0.075, 0.014, 0.075),
        machinedSteelMat
      );
      flange.name = 'frame-base-flange';
      flange.position.set(cx, pedestalY + 0.007, zOffset);
      root.add(flange);
    }

    const tieBar = new THREE.Mesh(
      new THREE.BoxGeometry(dimensions.baseLength * 0.34, 0.034, 0.034),
      baseMat
    );
    tieBar.position.set(pivotX - dimensions.baseLength * 0.15, Math.min(safePivotHeight * 0.65, 0.22), zOffset);
    root.add(tieBar);
  } else {
    // Precision Trunnion Yoke / Heavy Support Column (`trunnion_yoke` or `post`)
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.052, uprightHeight, 0.052),
      baseMat
    );
    post.position.set(pivotX, supportBaseY + uprightHeight / 2, zOffset);
    post.castShadow = !lightweight;
    post.receiveShadow = !lightweight;
    root.add(post);

    // Flanged base pedestal collar with 4 hex bolts
    const pedestal = new THREE.Mesh(
      new THREE.BoxGeometry(0.095, 0.016, 0.095),
      machinedSteelMat
    );
    pedestal.name = 'trunnion-pedestal';
    pedestal.position.set(pivotX, supportBaseY + 0.008, zOffset);
    root.add(pedestal);

    // Diagonal structural rib gusset
    const ribLen = Math.min(safePivotHeight * 0.55, 0.18);
    const rib = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, ribLen, 0.032),
      baseMat
    );
    rib.position.set(pivotX - 0.034, supportBaseY + ribLen / 2, zOffset);
    rib.rotation.z = -0.42;
    root.add(rib);

    // Front Cradle Arm if `trunnion_yoke`
    if (visual.base === 'trunnion_yoke') {
      const yokeBridge = new THREE.Mesh(
        new THREE.BoxGeometry(0.056, 0.026, Math.abs(zOffset) * 1.45),
        baseMat
      );
      yokeBridge.position.set(pivotX, Math.max(0.06, safePivotHeight - 0.06), zOffset * 0.35);
      root.add(yokeBridge);
    }
  }

  // 3. Engraved Protractor Angle Scale & Indicator Needle
  if (visual.angle_scale !== false && visual.scale_style !== 'housing_plumb') {
    const dialStyle =
      visual.scale_style === 'printed_arc'
        ? 'printed_arc'
        : visual.scale_style === 'vernier_protract'
        ? 'vernier_protract'
        : 'circular_dial';
    const dialRadius = Math.min(span * 0.44, (safePivotHeight - 0.005) / 1.15,
      dialStyle === 'vernier_protract' ? 0.092 : 0.081);
    const dialTex = createEngravedProtractorTexture(dialStyle);

    const dialGroup = new THREE.Group();
    const dialZ = dimensions.barrelDiameter * 0.62 + 0.012;
    dialGroup.position.set(pivotX, safePivotY, dialZ);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, dialZ - zOffset, 16), machinedSteelMat);
    axle.rotation.x = Math.PI / 2;
    axle.position.set(pivotX, safePivotY, (dialZ + zOffset) / 2);
    root.add(axle);

    const size = dialRadius * 2.3;
    const dialPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({
        map: dialTex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    dialGroup.add(dialPlate);

    // Precision Laser Pointer Needle & Vernier Index Hairline Cursor
    const rad = (angleDeg * Math.PI) / 180;
    const dirSign = dialStyle === 'printed_arc' ? -1 : 1;
    const needleLen = dialRadius * 0.86;
    const needleGroup = new THREE.Group();
    needleGroup.rotation.z = dirSign * rad;

    // Tapered knife-edge indicator arm
    const needleBar = new THREE.Mesh(
      new THREE.BoxGeometry(needleLen, 0.006, 0.003),
      new THREE.MeshStandardMaterial({ color: '#dc2626', metalness: 0.6, roughness: 0.25 })
    );
    needleBar.position.set((dirSign * needleLen) / 2, 0, 0.004);
    needleGroup.add(needleBar);

    // Knife-edge arrowhead tip at end of needle
    const needleTip = new THREE.Mesh(
      new THREE.ConeGeometry(0.006, 0.016, 12),
      new THREE.MeshStandardMaterial({ color: '#ef4444', metalness: 0.7, roughness: 0.2 })
    );
    needleTip.rotation.z = dirSign * -Math.PI / 2;
    needleTip.position.set(dirSign * needleLen, 0, 0.004);
    needleGroup.add(needleTip);

    // Transparent Vernier cursor reading window with optical index hairline
    const vernierWindow = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.018, 0.002),
      new THREE.MeshPhysicalMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.7,
        roughness: 0.1,
      })
    );
    vernierWindow.position.set(dirSign * (needleLen * 0.82), 0, 0.0055);
    needleGroup.add(vernierWindow);

    // Hairline index line across cursor window
    const hairlineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(dirSign * (needleLen * 0.82), -0.009, 0.0068),
      new THREE.Vector3(dirSign * (needleLen * 0.82), 0.009, 0.0068),
    ]);
    const hairline = new THREE.Line(
      hairlineGeo,
      new THREE.LineBasicMaterial({ color: '#090d16', linewidth: 2 })
    );
    needleGroup.add(hairline);

    // Center pivot boss collar & brass retainer screw
    const pivotCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.008, 20),
      machinedSteelMat
    );
    pivotCap.rotation.x = Math.PI / 2;
    pivotCap.position.set(0, 0, 0.006);
    needleGroup.add(pivotCap);

    const brassPivotScrew = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.010, 16),
      new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.88, roughness: 0.20 })
    );
    brassPivotScrew.rotation.x = Math.PI / 2;
    brassPivotScrew.position.set(0, 0, 0.010);
    needleGroup.add(brassPivotScrew);

    dialGroup.add(needleGroup);
    root.add(dialGroup);
  }

  // 4. Trunnion Pivot Bearing Hub & Knurled Elevation Lock Knob
  const bearingHub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.034, 0.034, 0.052, 28),
    machinedSteelMat
  );
  bearingHub.position.set(pivotX, safePivotY, zOffset + 0.028);
  bearingHub.rotation.x = Math.PI / 2;
  root.add(bearingHub);

  const lockKnob = createFastenerGroup(0.016, true);
  lockKnob.position.set(pivotX, safePivotY, zOffset + 0.056);
  root.add(lockKnob);

  // 5. Launch Guide Assembly rotated to `angleDeg` and positioned at `tubeExit`
  const guideGroup = buildLaunchGuideAssembly(spec, angleDeg, lightweight, brushedTex);
  guideGroup.position.set(exitX, safeExitY, 0);
  guideGroup.rotation.z = (angleDeg * Math.PI) / 180;
  guideGroup.name = 'launcher-body';
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle-center';
  muzzle.position.x = dimensions.projectileDiameter / 2;
  guideGroup.add(muzzle);
  root.add(guideGroup);

  return root;
}
