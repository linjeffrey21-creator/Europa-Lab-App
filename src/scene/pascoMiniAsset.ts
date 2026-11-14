import * as THREE from 'three';

let template: THREE.Group | undefined;
let loading: Promise<void> | undefined;
const chamberName = 'Tilting_mini_launcher';
const hangingParts = ['Vertical_plumb_cord', 'Brass_plumb_weight'];

export function loadPascoMiniLauncher(): Promise<void> {
  if (template) return Promise.resolve();
  if (loading) return loading;
  const loader = new URL('../../assets/vendor/three/loaders/GLTFLoader.js', import.meta.url);
  const asset = new URL('../../assets/pasco-me-6825b.glb', import.meta.url);
  loading = (async () => {
    const [{ GLTFLoader }, response] = await Promise.all([import(loader.href), fetch(asset)]);
    if (!response.ok) throw new Error('Could not load the PASCO Mini launcher');
    const { scene } = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
    if (!scene.getObjectByName(chamberName)?.getObjectByName('Launch_center') ||
      !hangingParts.every(name => scene.getObjectByName(name))) {
      throw new Error('PASCO Mini launcher is missing its articulated parts');
    }
    template = scene as THREE.Group;
  })().finally(() => { loading = undefined; });
  return loading;
}

export function buildPascoMiniLauncher(angleDeg: number, lightweight: boolean): THREE.Group | undefined {
  if (!template) return undefined;
  const model = template.clone(true);
  model.name = 'PASCO ME-6825B';
  const chamber = model.getObjectByName(chamberName)!;
  const tie = new THREE.Vector3(-0.158, 0.012, 0.021);
  const restTie = chamber.localToWorld(tie.clone());
  chamber.rotation.z = THREE.MathUtils.degToRad(angleDeg);
  chamber.name = 'launcher-body';
  chamber.getObjectByName('Launch_center')!.name = 'muzzle-center';
  const offset = chamber.localToWorld(tie).sub(restTie);
  for (const name of hangingParts) model.getObjectByName(name)!.position.add(offset);
  model.traverse(object => {
    if (object instanceof THREE.Mesh) object.castShadow = !lightweight;
  });
  return model;
}
