import * as THREE from 'three';

export function createPhotogate(benchProps: THREE.Group) {
  const find = (parent: THREE.Object3D, name: string) => {
    let match: THREE.Object3D | undefined;
    parent.traverse(object => {
      if (object.name.replace(/_/g, ' ') === name) match = object;
    });
    return match;
  };
  const group = find(benchProps, 'Photogate');
  if (!group) return;
  const head = find(group, 'Molded photogate head');
  const rod = find(group, 'Stainless support rod');
  const clamp = find(group, 'Swivel rod clamp');
  const base = find(group, 'Weighted cast base');
  const indicator = head && find(head, 'Unlit status indicator');
  if (!head || !rod || !clamp || !base || !(indicator instanceof THREE.Mesh)) return;

  for (const child of [...group.children]) {
    if (child !== head && child !== rod && child !== clamp && child !== base) child.removeFromParent();
  }
  group.rotation.set(0, 0, 0);
  head.rotation.x = Math.PI / 2;
  const led = new THREE.MeshBasicMaterial();
  indicator.material = led;
  const beamMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.65 });
  const beamGeometry = new THREE.CylinderGeometry(0.0018, 0.0018, 0.084, 8);
  const beam = new THREE.Mesh(beamGeometry, beamMaterial);
  beam.rotation.x = Math.PI / 2;
  beam.position.x = 0.045;
  group.add(beam);
  const rodScale = rod.scale.y;

  return {
    group,
    place(x: number, height: number, z: number) {
      group.position.set(x - beam.position.x, 0, z);
      head.position.y = clamp.position.y = beam.position.y = height;
      const baseTop = 0.012;
      rod.position.y = (height + baseTop) / 2;
      rod.scale.y = rodScale * (height - baseTop) / 0.168;
    },
    setDetected(detected: boolean) {
      led.color.set(detected ? '#fbbf24' : '#22c55e');
      beamMaterial.color.copy(led.color);
    },
    dispose() {
      beamGeometry.dispose();
      beamMaterial.dispose();
      led.dispose();
    },
  };
}

type FlightPoint = { x: number; y: number; t: number };

// The marble and the middle of the transverse beam share the launch plane.
// Sweep each path segment against the marble radius so a crossing can fall between frames.
export function findBeamCrossing(
  path: readonly FlightPoint[], x: number, y: number, radius: number
): number | undefined {
  for (let i = 1; i < path.length; i++) {
    const start = path[i - 1];
    const end = path[i];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const offsetX = start.x - x;
    const offsetY = start.y - y;
    const distanceSquared = offsetX * offsetX + offsetY * offsetY;
    if (distanceSquared <= radius * radius) return start.t;
    const segmentSquared = dx * dx + dy * dy;
    if (!segmentSquared) continue;
    const dot = offsetX * dx + offsetY * dy;
    const discriminant = dot * dot - segmentSquared * (distanceSquared - radius * radius);
    if (discriminant < 0) continue;
    const entry = (-dot - Math.sqrt(discriminant)) / segmentSquared;
    if (entry >= 0 && entry <= 1) return start.t + (end.t - start.t) * entry;
  }
}
