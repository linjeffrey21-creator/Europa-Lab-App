import * as THREE from 'three';

export function createAirflow(lightweight: boolean) {
  const count = lightweight ? 105 : 224;
  const laneCount = lightweight ? 8 : 14;
  const localCount = laneCount * 7;
  const ambientPositions = new Float32Array(count * 6);
  const localPositions = new Float32Array(localCount * 6);
  const ambientGeometry = new THREE.BufferGeometry();
  const localGeometry = new THREE.BufferGeometry();
  const ambient = new THREE.BufferAttribute(ambientPositions, 3);
  const local = new THREE.BufferAttribute(localPositions, 3);
  ambientGeometry.setAttribute('position', ambient.setUsage(THREE.DynamicDrawUsage));
  localGeometry.setAttribute('position', local.setUsage(THREE.DynamicDrawUsage));
  const ambientMaterial = new THREE.LineBasicMaterial({ color: '#087d9a', transparent: true, opacity: 0.56, depthWrite: false });
  const localMaterial = new THREE.LineBasicMaterial({ color: '#00a9c9', transparent: true, opacity: 0.85, depthWrite: false });
  const wind = new THREE.LineSegments(ambientGeometry, ambientMaterial);
  const relative = new THREE.LineSegments(localGeometry, localMaterial);
  wind.frustumCulled = relative.frustumCulled = false;
  const group = new THREE.Group();
  group.add(wind, relative);
  let windTravel = 0;
  let relativeTravel = 0;

  return {
    group,
    update(dt: number, left: number, right: number, windSpeed: number,
      ball: THREE.Vector3, vx: number, vy: number, flying: boolean, ballRadius: number) {
      wind.visible = Math.abs(windSpeed) > 0.01;
      const length = right - left;
      if (wind.visible) {
        windTravel = THREE.MathUtils.euclideanModulo(windTravel + windSpeed * dt, length);
        const trail = Math.sign(windSpeed) * Math.min(0.22, 0.055 + Math.abs(windSpeed) * 0.025);
        for (let i = 0; i < count; i++) {
          const x = left + THREE.MathUtils.euclideanModulo(i * length * 0.618 + windTravel, length);
          const y = 0.18 + (i % 17) * 0.074;
          const z = ball.z + ((i * 5) % 11 - 5) * 0.047;
          ambient.setXYZ(i * 2, x, y, z);
          ambient.setXYZ(i * 2 + 1, THREE.MathUtils.clamp(x - trail, left, right), y, z);
        }
        ambient.needsUpdate = true;
      }

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
    },
  };
}
