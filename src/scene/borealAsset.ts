import * as THREE from 'three';

let template: THREE.Group | undefined;
let loading: Promise<void> | undefined;
const launcherName = 'Tilting_blue_launcher';

export function loadBorealLauncher(): Promise<void> {
  if (template) return Promise.resolve();
  if (loading) return loading;
  const loaderUrl = new URL('../../assets/vendor/three/loaders/GLTFLoader.js', import.meta.url);
  const assetUrl = new URL('../../assets/boreal-fundamentals.glb', import.meta.url);
  loading = (async () => {
    const [{ GLTFLoader }, response] = await Promise.all([import(loaderUrl.href), fetch(assetUrl)]);
    if (!response.ok) throw new Error('Could not load the Boreal launcher');
    const { scene } = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
    if (!scene.getObjectByName(launcherName)?.getObjectByName('Muzzle_exit')) {
      throw new Error('Boreal launcher is missing its launch point');
    }
    template = scene as THREE.Group;
  })().finally(() => { loading = undefined; });
  return loading;
}

export function buildBorealLauncher(angleDeg: number, ballRadius: number, lightweight: boolean): THREE.Group | undefined {
  if (!template) return undefined;
  const model = template.clone(true);
  model.name = 'Boreal PRLN01';
  const barrel = model.getObjectByName(launcherName)!;
  barrel.name = 'launcher-body';
  barrel.rotation.z = THREE.MathUtils.degToRad(angleDeg);
  const marker = new THREE.Object3D();
  marker.name = 'muzzle-center';
  marker.position.copy(barrel.getObjectByName('Muzzle_exit')!.position);
  marker.position.x += ballRadius;
  barrel.add(marker);
  model.traverse(object => {
    if (object instanceof THREE.Mesh) object.castShadow = !lightweight;
  });
  return model;
}
