import * as THREE from 'three';

/** Shared renderer and lighting for room and individual cabinet views. */
export function createCabinetRenderer(host: HTMLElement, unitScale = 1) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f2ec);
  const renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.append(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5b5546, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(-3 * unitScale, 5 * unitScale, 4 * unitScale);
  sun.shadow.camera.left = -5 * unitScale;
  sun.shadow.camera.right = 5 * unitScale;
  sun.shadow.camera.top = 5 * unitScale;
  sun.shadow.camera.bottom = -5 * unitScale;
  sun.shadow.camera.near = 0.5 * unitScale;
  sun.shadow.camera.far = 500 * unitScale;
  sun.shadow.camera.updateProjectionMatrix();
  sun.castShadow = true;
  scene.add(sun);
  return {scene, renderer};
}
