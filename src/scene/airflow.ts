import * as THREE from 'three';

export function createAirflow(lightweight: boolean) {
  const count = lightweight ? 6500 : 18000;
  const laneCount = lightweight ? 8 : 14;
  const localCount = laneCount * 7;
  const ambientPositions = new Float32Array(count * 3);
  const localPositions = new Float32Array(localCount * 6);
  const ambientGeometry = new THREE.BufferGeometry();
  const localGeometry = new THREE.BufferGeometry();
  const ambient = new THREE.BufferAttribute(ambientPositions, 3);
  const local = new THREE.BufferAttribute(localPositions, 3);
  ambientGeometry.setAttribute('position', ambient);
  localGeometry.setAttribute('position', local.setUsage(THREE.DynamicDrawUsage));
  const dot = document.createElement('canvas');
  dot.width = dot.height = 16;
  const dotContext = dot.getContext('2d');
  dotContext?.beginPath();
  dotContext?.arc(8, 8, 7, 0, Math.PI * 2);
  if (dotContext) {
    dotContext.fillStyle = '#fff';
    dotContext.fill();
  }
  const dotTexture = new THREE.CanvasTexture(dot);
  const ambientMaterial = new THREE.PointsMaterial({
    color: '#32bed8',
    size: 0.024,
    map: dotTexture,
    transparent: true,
    opacity: 0.82,
    alphaTest: 0.08,
    depthWrite: false,
  });
  const airClock = { value: 0 };
  const airOffset = { value: 0 };
  const calmMotion = { value: 1 };
  const roomOrigin = { value: 0 };
  const roomWidth = { value: 1 };
  ambientMaterial.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { airClock, airOffset, calmMotion, roomOrigin, roomWidth });
    shader.vertexShader = `
      uniform float airClock, airOffset, calmMotion, roomOrigin, roomWidth;
      ${shader.vertexShader}
    `.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      // Small, zero-mean circulation makes still air visible without adding wind to the simulation.
      float phase = airClock * 1.25 + dot(position, vec3(3.7, 2.4, 5.1));
      transformed.x = roomOrigin + mod(position.x - roomOrigin + airOffset + calmMotion * 0.20 * sin(phase), roomWidth);
      transformed.y += calmMotion * 0.095 * cos(phase * 1.37);
      transformed.z += calmMotion * 0.085 * sin(phase * 0.83);
    `);
  };
  const localMaterial = new THREE.LineBasicMaterial({ color: '#00a9c9', transparent: true, opacity: 0.85, depthWrite: false });
  const wind = new THREE.Points(ambientGeometry, ambientMaterial);
  const relative = new THREE.LineSegments(localGeometry, localMaterial);
  wind.frustumCulled = relative.frustumCulled = false;
  const group = new THREE.Group();
  group.add(wind, relative);
  let previousBounds: THREE.Box3 | null = null;
  let relativeTravel = 0;

  return {
    group,
    update(dt: number, bounds: THREE.Box3, windSpeed: number,
      ball: THREE.Vector3, vx: number, vy: number, flying: boolean, ballRadius: number) {
      const length = bounds.max.x - bounds.min.x;
      const moving = Math.abs(windSpeed) > 0.01;
      airClock.value += dt;
      airOffset.value = THREE.MathUtils.euclideanModulo(airOffset.value + windSpeed * dt, length);
      calmMotion.value = moving ? 0 : 1;
      if (bounds !== previousBounds) {
        roomOrigin.value = bounds.min.x;
        roomWidth.value = length;
        const height = bounds.max.y - bounds.min.y;
        const depth = bounds.max.z - bounds.min.z;
        for (let i = 0; i < count; i++) {
          const x = bounds.min.x + (i * 0.8191725 % 1) * length;
          const y = bounds.min.y + 0.10 + (i * 0.6710436 % 1) * (height - 0.20);
          const z = bounds.min.z + 0.09 + (i * 0.5497005 % 1) * (depth - 0.18);
          ambient.setXYZ(i, x, y, z);
        }
        ambient.needsUpdate = true;
      }
      previousBounds = bounds;

      const flowX = windSpeed - vx;
      const flowY = -vy;
      const relativeSpeed = Math.hypot(flowX, flowY);
      relative.visible = flying && relativeSpeed > 0.01;
      if (relative.visible) {
        relative.position.copy(ball);
        relative.rotation.z = Math.atan2(flowY, flowX);
        const span = Math.max(0.54, 24 * ballRadius);
        relativeTravel = THREE.MathUtils.euclideanModulo(relativeTravel + relativeSpeed * dt, span);
        const tail = THREE.MathUtils.clamp(relativeSpeed * 0.012, 0.018, 0.06);
        for (let i = 0; i < localCount; i++) {
          const lane = i % laneCount - (laneCount - 1) / 2;
          const x = THREE.MathUtils.euclideanModulo(Math.floor(i / laneCount) * span / 7 + i * 0.013 + relativeTravel, span) - span * 0.35;
          const y = lane * Math.max(0.012, ballRadius * 0.65);
          const deflect = (at: number) => y + Math.sign(y) * ballRadius * Math.exp(-Math.pow(at / (2.4 * ballRadius), 2) - Math.abs(lane) * 0.25);
          local.setXYZ(i * 2, x, deflect(x), 0);
          local.setXYZ(i * 2 + 1, x - tail, deflect(x - tail), 0);
        }
        local.needsUpdate = true;
      }
    },
    dispose() {
      group.removeFromParent();
      ambientGeometry.dispose();
      localGeometry.dispose();
      ambientMaterial.dispose();
      localMaterial.dispose();
      dotTexture.dispose();
    },
  };
}
