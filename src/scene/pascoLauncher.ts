import * as THREE from 'three';

let template: THREE.Group | undefined;
let loading: Promise<void> | undefined;
const barrelName = 'Tilting_launcher_assembly';
const pinName = 'Plumb_cord_pin';
const bobName = 'Plumb_bob';
const cordName = 'Vertical_plumb_cord';

export function loadPascoLauncher(): Promise<void> {
  if (template) return Promise.resolve();
  if (loading) return loading;
  const loaderUrl = new URL('../../assets/vendor/three/loaders/GLTFLoader.js', import.meta.url);
  const assetUrl = new URL('../../assets/pasco-me-6800.glb', import.meta.url);
  loading = (async () => {
    const [{ GLTFLoader }, response] = await Promise.all([import(loaderUrl.href), fetch(assetUrl)]);
    if (!response.ok) throw new Error('Could not load the PASCO launcher model');
    const { scene } = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
    if (![barrelName, pinName, bobName, cordName].every(name => scene.getObjectByName(name))) {
      throw new Error('PASCO launcher is missing an articulated part');
    }
    template = scene as THREE.Group;
  })().finally(() => { loading = undefined; });
  return loading;
}

export function buildPascoLauncher(
  angleDeg: number, barrelLength: number, projectileRadius: number, lightweight: boolean
): THREE.Group | undefined {
  if (!template) return undefined;
  const model = template.clone(true);
  model.name = 'PASCO ME-6800';
  const barrel = model.getObjectByName(barrelName)!;
  const pin = model.getObjectByName(pinName)!;
  const bob = model.getObjectByName(bobName)!;
  const cord = model.getObjectByName(cordName)!;
  const tiePoint = new THREE.Vector3(-0.176, 0.015, 0.023);
  const restTiePoint = barrel.localToWorld(tiePoint.clone());

  barrel.attach(pin);
  const pivot = new THREE.Group();
  pivot.name = 'launcher-body';
  pivot.position.copy(barrel.position);
  pivot.rotation.z = THREE.MathUtils.degToRad(angleDeg);
  const marker = new THREE.Object3D();
  marker.name = 'muzzle-center';
  pivot.add(marker, barrel);
  barrel.rotation.set(0, 0, 0);
  barrel.position.set(-projectileRadius, 0, 0);
  barrel.scale.x = barrelLength / 0.21;
  model.add(pivot);

  // Move the hanging parts with the attachment point while preserving their vertical orientation.
  const cordOffset = barrel.localToWorld(tiePoint).sub(restTiePoint);
  cord.position.add(cordOffset);
  bob.position.add(cordOffset);
  model.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = !lightweight;
      // The printed markings sit too close to the housing for the room's shadow map.
      object.receiveShadow = false;
    }
  });
  return model;
}
