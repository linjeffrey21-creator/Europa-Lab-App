import * as THREE from 'three';

let pending: Promise<THREE.Group> | undefined;

export async function loadBenchInstrumentProps(lightweight: boolean): Promise<THREE.Group> {
  if (!pending) {
    const loaderUrl = new URL('../../assets/vendor/three/loaders/GLTFLoader.js', import.meta.url);
    const assetUrl = new URL('../../assets/bench-instrument-props.glb', import.meta.url);
    pending = Promise.all([import(loaderUrl.href), fetch(assetUrl)]).then(async ([{ GLTFLoader }, response]) => {
      if (!response.ok) throw new Error('Could not load the bench instrument props');
      const { scene } = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
      return scene as THREE.Group;
    }).catch((error) => {
      pending = undefined;
      throw error;
    });
  }
  const props = (await pending).clone(true);
  props.name = 'Bench instrument props';
  props.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = !lightweight;
      object.receiveShadow = !lightweight;
    }
  });
  return props;
}
