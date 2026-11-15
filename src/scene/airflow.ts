import * as THREE from 'three';

export function createAirflow(lightweight: boolean) {
  const count = lightweight ? 36 : 72;
  const ambientPositions = new Float32Array(count * 6);
  const localPositions = new Float32Array(18 * 6);
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
          const y = 0.16 + (i % 9) * 0.15;
          const z = ball.z + ((i * 5) % 7 - 3) * 0.085;
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
        const span = Math.max(0.28, 14 * ballRadius);
        relativeTravel = THREE.MathUtils.euclideanModulo(relativeTravel + relativeSpeed * dt, span);
        const tail = Math.min(0.065, span / 6);
        for (let i = 0; i < 18; i++) {
          const lane = (i % 6) - 2.5;
          const x = THREE.MathUtils.euclideanModulo(Math.floor(i / 6) * span / 3 + i * 0.013 + relativeTravel, span) - span / 2;
          const y = lane * Math.max(0.018, ballRadius);
          const deflect = (at: number) => y + Math.sign(y) * ballRadius * Math.exp(-Math.pow(at / (2 * ballRadius), 2));
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
