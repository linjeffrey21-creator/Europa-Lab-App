import * as THREE from 'three';

export function createAirflow(lightweight: boolean) {
  const count = lightweight ? 24000 : 120000;
  const localCount = lightweight ? 8000 : 42000;
  const ambientPositions = new Float32Array(count * 3);
  const localPositions = new Float32Array(localCount * 3);
  const localColors = new Float32Array(localCount * 3);
  const ambientGeometry = new THREE.BufferGeometry();
  const localGeometry = new THREE.BufferGeometry();
  const ambient = new THREE.BufferAttribute(ambientPositions, 3);
  const local = new THREE.BufferAttribute(localPositions, 3);
  const colors = new THREE.BufferAttribute(localColors, 3);
  ambientGeometry.setAttribute('position', ambient);
  localGeometry.setAttribute('position', local);
  localGeometry.setAttribute('color', colors);
  const backgroundColor = new THREE.Color('#398996');
  const pathColor = new THREE.Color('#ffca65');
  const samplesPerPath = 80;
  const highlightedPaths = 10;
  for (let i = 0; i < localCount; i++) {
    const highlight = i < samplesPerPath * highlightedPaths;
    const path = Math.floor(i / samplesPerPath);
    const phase = highlight ? (i % samplesPerPath) / samplesPerPath : i * 0.61803398875 % 1;
    const azimuth = (highlight ? path / highlightedPaths : i * 0.75487766625 % 1) * Math.PI * 2;
    const radius = highlight ? 0.73 + (path % 3) * 0.20 : 0.02 + Math.sqrt(i * 0.56984029099 % 1) * 7;
    local.setXYZ(i, phase, radius * Math.cos(azimuth), radius * Math.sin(azimuth));
    const color = highlight ? pathColor : backgroundColor;
    colors.setXYZ(i, color.r, color.g, color.b);
  }
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
    size: 0.011,
    map: dotTexture,
    transparent: true,
    opacity: 0.48,
    alphaTest: 0.08,
    depthWrite: false,
  });
  const airOffset = { value: 0 };
  const roomOrigin = { value: 0 };
  const roomWidth = { value: 1 };
  ambientMaterial.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { airOffset, roomOrigin, roomWidth });
    shader.vertexShader = `
      uniform float airOffset, roomOrigin, roomWidth;
      ${shader.vertexShader}
    `.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      transformed.x = roomOrigin + mod(position.x - roomOrigin + airOffset, roomWidth);
    `);
  };
  const flowPhase = { value: 0 };
  const localMaterial = new THREE.PointsMaterial({
    color: '#ffffff', vertexColors: true, size: 0.0017, map: dotTexture, transparent: true,
    opacity: 0.69, alphaTest: 0.08, depthWrite: false,
  });
  localMaterial.onBeforeCompile = shader => {
    shader.uniforms.flowPhase = flowPhase;
    shader.vertexShader = 'uniform float flowPhase;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      // Display streamlines in marble radii, curving in all azimuths around the sphere.
      float x = fract(position.x + flowPhase) * 30.0 - 11.0;
      float radius = length(position.yz);
      float bend = 1.42 * exp(-x * x * 0.23 - radius * radius * 0.32);
      float exclusion = sqrt(max(0.0, 1.04 * 1.04 - x * x));
      float offset = max(radius + bend, exclusion);
      transformed = vec3(x, position.yz * (offset / radius));
    `).replace('gl_PointSize = size;', 'gl_PointSize = size * (color.r > 0.5 ? 2.4 : 0.75);');
  };
  // PointsMaterial otherwise shares its stock shader cache with standard point clouds.
  localMaterial.customProgramCacheKey = () => 'marble-relative-airflow';
  const wind = new THREE.Points(ambientGeometry, ambientMaterial);
  const relative = new THREE.Points(localGeometry, localMaterial);
  wind.frustumCulled = relative.frustumCulled = false;
  const group = new THREE.Group();
  group.add(wind, relative);
  let previousBounds: THREE.Box3 | null = null;

  return {
    group,
    update(dt: number, bounds: THREE.Box3, windSpeed: number,
      ball: THREE.Vector3, vx: number, vy: number, flying: boolean, ballRadius: number, focusOnMarble: boolean) {
      wind.visible = !focusOnMarble && windSpeed !== 0;
      const length = bounds.max.x - bounds.min.x;
      airOffset.value = THREE.MathUtils.euclideanModulo(airOffset.value + windSpeed * dt, length);
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
      relative.visible = focusOnMarble && flying && relativeSpeed > 0.01;
      if (relative.visible) {
        relative.position.copy(ball);
        relative.rotation.z = Math.atan2(flowY, flowX);
        relative.scale.setScalar(ballRadius);
        flowPhase.value = (flowPhase.value + relativeSpeed * dt / (30 * ballRadius)) % 1;
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
