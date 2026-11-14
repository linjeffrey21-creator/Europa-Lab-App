import * as THREE from 'three';

let template: THREE.Group | undefined;
let loading: Promise<void> | undefined;

export function loadVernierLauncher(): Promise<void> {
  if (template) return Promise.resolve();
  if (loading) return loading;
  const loaderUrl = new URL('../../assets/vendor/three/loaders/GLTFLoader.js', import.meta.url);
  const assetUrl = new URL('../../assets/vernier-vpl.glb', import.meta.url);
  loading = (async () => {
    const [{ GLTFLoader }, response] = await Promise.all([import(loaderUrl.href), fetch(assetUrl)]);
    if (!response.ok) throw new Error('Could not load the Vernier launcher');
    const { scene } = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
    const chamber = scene.getObjectByName('Tilting_launch_chamber');
    if (!chamber?.getObjectByName('Launch_center')) throw new Error('Vernier launcher is missing its pivot');
    template = scene as THREE.Group;
  })().finally(() => { loading = undefined; });
  return loading;
}

export function buildVernierLauncher(angleDeg: number, lightweight: boolean): THREE.Group | undefined {
  if (!template) return undefined;
  const model = template.clone(true);
  model.name = 'Vernier VPL';
  const chamber = model.getObjectByName('Tilting_launch_chamber')!;
  chamber.rotation.z = THREE.MathUtils.degToRad(angleDeg);
  chamber.name = 'launcher-body';
  chamber.getObjectByName('Launch_center')!.name = 'muzzle-center';
  model.traverse(object => {
    if (object instanceof THREE.Mesh) object.castShadow = !lightweight;
  });
  return model;
}
