import * as THREE from 'three';

let template: THREE.Group | undefined;
let loading: Promise<void> | undefined;
const movingParts = ['Tilting_channel', 'Display_ball', 'Vertical_plumb_line', 'Plumb_weight', 'Plumb_point'];

export function loadEiscoLauncher(): Promise<void> {
  if (template) return Promise.resolve();
  if (loading) return loading;
  const loaderUrl = new URL('../../assets/vendor/three/loaders/GLTFLoader.js', import.meta.url);
  const assetUrl = new URL('../../assets/eisco-ph0343.glb', import.meta.url);
  loading = (async () => {
    const [{ GLTFLoader }, response] = await Promise.all([import(loaderUrl.href), fetch(assetUrl)]);
    if (!response.ok) throw new Error('Could not load the Eisco launcher');
    const { scene } = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
    if (!movingParts.every(name => scene.getObjectByName(name))) {
      throw new Error('Eisco launcher is missing an articulated part');
    }
    template = scene as THREE.Group;
  })().finally(() => { loading = undefined; });
  return loading;
}

export function buildEiscoLauncher(angleDeg: number, lightweight: boolean): THREE.Group | undefined {
  if (!template) return undefined;
  const model = template.clone(true);
  model.name = 'Eisco PH0343';
  const barrel = model.getObjectByName('Tilting_channel')!;
  const tiePoint = new THREE.Vector3(-0.206, 0.024, 0.022);
  const restTiePoint = barrel.localToWorld(tiePoint.clone());
  barrel.rotation.z = THREE.MathUtils.degToRad(angleDeg);
  barrel.name = 'launcher-body';
  const ball = model.getObjectByName('Display_ball')!;
  const marker = new THREE.Object3D();
  marker.name = 'muzzle-center';
  marker.position.copy(ball.position);
  ball.removeFromParent();
  barrel.add(marker);

  const plumbOffset = barrel.localToWorld(tiePoint).sub(restTiePoint);
  for (const name of ['Vertical_plumb_line', 'Plumb_weight', 'Plumb_point']) {
    model.getObjectByName(name)!.position.add(plumbOffset);
  }
  model.traverse(object => {
    if (object instanceof THREE.Mesh) object.castShadow = !lightweight;
  });
  return model;
}
