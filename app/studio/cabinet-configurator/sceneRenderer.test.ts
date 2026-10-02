// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {createCabinetRenderer} from './sceneRenderer';

beforeEach(() => {
  vi.spyOn(THREE, 'WebGLRenderer').mockImplementation(
    class {
      domElement = document.createElement('canvas');
      shadowMap = {};
      setPixelRatio = () => {};
    } as unknown as typeof THREE.WebGLRenderer,
  );
});
afterEach(() => document.body.replaceChildren());

function lighting(scale: number) {
  const host = document.createElement('div');
  document.body.append(host);
  const {scene, renderer} = createCabinetRenderer(host, scale);
  const sun = scene.children.find(
    (child): child is THREE.DirectionalLight =>
      child instanceof THREE.DirectionalLight,
  )!;
  scene.updateMatrixWorld(true);
  sun.target.updateMatrixWorld(true);
  sun.shadow.updateMatrices(sun);
  return {sun, renderer};
}

// Emulate depth comparisons against texel samples on an exactly flat board.
// No GPU is needed: Three's real shadow camera supplies the projection.
function selfShadowedSamples(
  sun: THREE.DirectionalLight,
  normal: THREE.Vector3,
) {
  const {camera, mapSize, normalBias, bias} = sun.shadow;
  const plane = new THREE.Plane(normal, 0);
  const lookup = normal.clone().multiplyScalar(normalBias).project(camera);
  let shadowed = 0;
  for (const x of [-0.5, 0.5]) {
    for (const y of [-0.5, 0.5]) {
      const uv = lookup.clone();
      uv.x += (2 * x) / mapSize.x;
      uv.y += (2 * y) / mapSize.y;
      const near = new THREE.Vector3(uv.x, uv.y, -1).unproject(camera);
      const far = new THREE.Vector3(uv.x, uv.y, 1).unproject(camera);
      const ray = new THREE.Ray(near, far.sub(near).normalize());
      const hit = ray.intersectPlane(plane, new THREE.Vector3())!;
      const storedDepth = (hit.project(camera).z + 1) / 2;
      if ((lookup.z + 1) / 2 + bias > storedDepth + 1e-12) shadowed++;
    }
  }
  return shadowed;
}

describe.each([1, 1 / 0.0254])('shadow lookup at unit scale %s', (scale) => {
  it.each([
    ['door / drawer front', new THREE.Vector3(0, 0, 1)],
    ['cabinet end', new THREE.Vector3(-1, 0, 0)],
    ['shelf / floor', new THREE.Vector3(0, 1, 0)],
    ['rotated cabinet front', new THREE.Vector3(-0.5, 0, Math.sqrt(0.75))],
  ])('prevents a flat %s from shadowing itself', (_, normal) => {
    const {sun} = lighting(scale);
    expect(selfShadowedSamples(sun, normal)).toBe(0);
    // Reproduce the old zero-bias setup, including its default resolution.
    sun.shadow.bias = 0;
    sun.shadow.normalBias = 0;
    sun.shadow.mapSize.set(512, 512);
    expect(selfShadowedSamples(sun, normal)).toBeGreaterThan(0);
  });

  it('keeps shadow tolerance small in physical units and shadows enabled', () => {
    const {sun, renderer} = lighting(scale);
    const depthTolerance =
      (-sun.shadow.bias * (sun.shadow.camera.far - sun.shadow.camera.near)) /
      scale;
    expect(depthTolerance).toBeGreaterThan(0);
    expect(depthTolerance).toBeLessThan(0.003);
    expect(sun.shadow.normalBias / scale).toBeLessThan(0.006);
    expect(sun.castShadow).toBe(true);
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(renderer.shadowMap.type).toBe(THREE.PCFSoftShadowMap);
  });
});
