import {afterEach, expect, test, vi} from 'vitest';
import * as THREE from 'three';
import {denoisePhoto} from './photoDenoise';
import {photoNoiseOffsets} from './photoNoise';

vi.mock('./photoGpu', () => ({waitForPhotoGpu: vi.fn()}));

afterEach(() => vi.restoreAllMocks());

test('guide/filter passes preserve source materials, geometry, texture ownership and renderer state', async () => {
  const scene = new THREE.Scene();
  const texture = new THREE.Texture();
  const original = new THREE.MeshStandardMaterial({
    color: '#886644',
    map: texture,
    normalMap: texture,
    normalScale: new THREE.Vector2(2, 2),
  });
  const geometry = new THREE.BoxGeometry();
  scene.add(new THREE.Mesh(geometry, [original, original]));
  const previousTarget = new THREE.WebGLRenderTarget(16, 16);
  let currentTarget = previousTarget;
  let normalGuide: THREE.MeshNormalMaterial[] = [];
  const render = vi.fn((rendered: THREE.Scene) => {
    if (normalGuide.length || !(rendered instanceof THREE.Scene)) return;
    normalGuide = (rendered.children[0] as THREE.Mesh)
      .material as THREE.MeshNormalMaterial[];
  });
  const renderer = {
    getRenderTarget: () => currentTarget,
    setRenderTarget: (value: THREE.WebGLRenderTarget) => {
      currentTarget = value;
    },
    render,
    getContext: vi.fn(),
    toneMapping: THREE.ACESFilmicToneMapping,
    outputColorSpace: THREE.SRGBColorSpace,
    autoClear: false,
  };
  const releaseTexture = vi.spyOn(texture, 'dispose');
  const releaseSource = vi.spyOn(original, 'dispose');
  const releaseGeometry = vi.spyOn(geometry, 'dispose');
  const releaseTarget = vi.spyOn(THREE.WebGLRenderTarget.prototype, 'dispose');
  await denoisePhoto(
    renderer as unknown as THREE.WebGLRenderer,
    scene,
    new THREE.PerspectiveCamera(),
    texture,
    128,
    128,
  );
  expect(render).toHaveBeenCalledTimes(6);
  const guide = render.mock.calls[0][0] as THREE.Scene;
  expect(guide).not.toBe(scene);
  expect((guide.children[0] as THREE.Mesh).geometry).toBe(geometry);
  expect((scene.children[0] as THREE.Mesh).material).toEqual([
    original,
    original,
  ]);
  expect(scene.overrideMaterial).toBeNull();
  expect(normalGuide).toHaveLength(2);
  normalGuide.forEach((value) => {
    expect(value.normalMap).toBe(texture);
    expect(value.normalScale.toArray()).toEqual([2, 2]);
    expect(value.normalScale).not.toBe(original.normalScale);
  });
  expect(original.normalMap).toBe(texture);
  expect(original.normalScale.toArray()).toEqual([2, 2]);
  expect(releaseTexture).not.toHaveBeenCalled();
  expect(releaseSource).not.toHaveBeenCalled();
  expect(releaseGeometry).not.toHaveBeenCalled();
  expect(releaseTarget).toHaveBeenCalledTimes(4);
  expect(currentTarget).toBe(previousTarget);
  expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
  expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
  expect(renderer.autoClear).toBe(false);
});

test('failed GPU guide rendering releases temporary targets and restores output configuration', async () => {
  const previous = new THREE.WebGLRenderTarget();
  let current = previous;
  const renderer = {
    getRenderTarget: () => current,
    setRenderTarget: (value: THREE.WebGLRenderTarget) => {
      current = value;
    },
    render: () => {
      throw new Error('GPU failure');
    },
    toneMapping: THREE.ACESFilmicToneMapping,
    outputColorSpace: THREE.SRGBColorSpace,
    autoClear: false,
  };
  const dispose = vi.spyOn(THREE.WebGLRenderTarget.prototype, 'dispose');
  await expect(
    denoisePhoto(
      renderer as unknown as THREE.WebGLRenderer,
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
      new THREE.Texture(),
      64,
      64,
    ),
  ).rejects.toThrow('GPU failure');
  expect(dispose).toHaveBeenCalledTimes(4);
  expect(current).toBe(previous);
  expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
  expect(renderer.autoClear).toBe(false);
});

test('fixed spatial ranks remain uniform and identical across separate captures', () => {
  const first = photoNoiseOffsets();
  const second = photoNoiseOffsets();
  expect(first).toEqual(second);
  expect(first).not.toBe(second);
  expect(new Set(first).size).toBe(4096);
  expect(Math.min(...first)).toBe(0);
  expect(Math.max(...first)).toBeLessThan(1);
  expect(first.reduce((total, v) => total + v, 0) / first.length).toBeCloseTo(
    0.5,
    3,
  );
});
