import * as THREE from 'three';

let template: THREE.Group | undefined;
let loading: Promise<void> | undefined;
const partNames = [
  'Tilting launcher assembly', 'Protractor cord pin', 'Brass plumb bob', 'Brass cord neck',
  'Vertical plumb cord', 'Remote release cable sheath', 'Housing cable ferrule',
] as const;

function findPart(group: THREE.Group, name: typeof partNames[number]) {
  return group.getObjectByProperty('name', name.replaceAll(' ', '_'));
}

export function loadArborLauncher(): Promise<void> {
  if (template) return Promise.resolve();
  if (loading) return loading;
  const loaderUrl = new URL('../../assets/vendor/three/loaders/GLTFLoader.js', import.meta.url);
  const assetUrl = new URL('../../assets/arbor-94-1970.glb', import.meta.url);
  loading = (async () => {
    const [{ GLTFLoader }, response] = await Promise.all([import(loaderUrl.href), fetch(assetUrl)]);
    if (!response.ok) throw new Error('Could not load the Arbor launcher model');
    const model = (await new GLTFLoader().parseAsync(await response.arrayBuffer(), '')).scene as THREE.Group;
    if (!partNames.every(name => findPart(model, name))) throw new Error('Arbor launcher is missing an articulated part');
    template = model;
  })().finally(() => { loading = undefined; });
  return loading;
}

export function buildArborLauncher(angleDeg: number, pivotHeight: number, barrelLength: number,
  projectileRadius: number, lightweight: boolean): THREE.Group | undefined {
  if (!template) return undefined;
  const model = template.clone(true);
  const part = (name: typeof partNames[number]) => findPart(model, name)!;
  const barrel = part('Tilting launcher assembly');
  const pin = part('Protractor cord pin');
  const weight = part('Brass plumb bob');
  const neck = part('Brass cord neck');
  const ferrule = part('Housing cable ferrule');
  const originalCord = part('Vertical plumb cord') as THREE.Mesh;
  const originalCable = part('Remote release cable sheath') as THREE.Mesh;
  model.updateMatrixWorld(true);
  barrel.attach(pin);
  barrel.attach(ferrule);
  barrel.rotation.z = THREE.MathUtils.degToRad(angleDeg);
  const extension = pivotHeight - barrel.position.y;
  if (extension > 0.001) {
    const upright = model.getObjectByName('Bent_upright_plate') as THREE.Mesh;
    const support = new THREE.Mesh(new THREE.BoxGeometry(0.032, extension + 0.014, 0.009), upright.material);
    support.position.set(0, barrel.position.y + extension / 2, -0.029);
    const pivot = model.getObjectByName('Transverse_angle_pivot');
    const lock = model.getObjectByName('Rear_angle_lock_screw');
    if (pivot) pivot.position.y += extension;
    if (lock) lock.position.y += extension;
    model.add(support);
  }
  barrel.position.y = pivotHeight;
  barrel.scale.x = barrelLength / 0.206;
  barrel.name = 'launcher-body';
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle-center';
  muzzle.position.set(0.100 + projectileRadius / barrel.scale.x, 0, -0.001);
  barrel.add(muzzle);
  model.updateMatrixWorld(true);

  const pinEnd = barrel.localToWorld(new THREE.Vector3(-0.066, 0.012, 0.023));
  const cordEnd = pinEnd.clone();
  cordEnd.y = Math.max(0.021, pinEnd.y - 0.052);
  weight.position.set(cordEnd.x, cordEnd.y - 0.00415, cordEnd.z);
  neck.position.set(cordEnd.x, cordEnd.y - 0.0004, cordEnd.z);
  originalCord.removeFromParent();
  originalCable.removeFromParent();
  const cordDirection = pinEnd.clone().sub(cordEnd);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.00033, 0.00033, cordDirection.length(), 10), originalCord.material);
  cord.name = 'arbor-vertical-plumb-line';
  cord.position.copy(pinEnd).lerp(cordEnd, 0.5);
  model.add(cord);

  const cableStart = barrel.localToWorld(new THREE.Vector3(-0.107, -0.004, -0.004));
  const cable = new THREE.CatmullRomCurve3([
    cableStart,
    new THREE.Vector3(-0.13, Math.max(0.016, cableStart.y * 0.72), 0.001),
    new THREE.Vector3(-0.155, 0.018, 0.010),
    new THREE.Vector3(-0.134, 0.010, 0.027),
    new THREE.Vector3(-0.060, 0.010, 0.045),
    new THREE.Vector3(0.008, 0.013, 0.053),
    new THREE.Vector3(0.102, 0.019, 0.054),
  ]);
  const sheath = new THREE.Mesh(new THREE.TubeGeometry(cable, 36, 0.0024, 8, false), originalCable.material);
  sheath.name = 'arbor-release-cable';
  model.add(sheath);
  model.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = !lightweight;
      object.receiveShadow = !lightweight;
    }
  });
  return model;
}
