import {expect, test, vi} from 'vitest';
import * as THREE from 'three';
import {finishPhoto, canMeterDiffuseWhiteBalance} from './photoFinish';
import {DEFAULT_PHOTO_CAMERA} from './photoCamera';
vi.mock('./photoGpu', () => ({waitForPhotoGpu: vi.fn()}));

test('WB illuminant candidates exclude metallic, glossy, transparent and emissive materials', () => {
  expect(
    canMeterDiffuseWhiteBalance(new THREE.MeshStandardMaterial({roughness: 1})),
  ).toBe(true);
  for (const material of [
    new THREE.MeshBasicMaterial(),
    new THREE.MeshStandardMaterial({metalness: 1}),
    new THREE.MeshStandardMaterial({metalnessMap: new THREE.Texture()}),
    new THREE.MeshStandardMaterial({roughness: 0.1}),
    new THREE.MeshStandardMaterial({emissive: 'white'}),
    new THREE.MeshStandardMaterial({emissiveMap: new THREE.Texture()}),
    new THREE.MeshStandardMaterial({transparent: true}),
    new THREE.MeshStandardMaterial({opacity: 0.5}),
    new THREE.MeshPhysicalMaterial({transmission: 1}),
    new THREE.MeshPhysicalMaterial({clearcoat: 1}),
  ])
    expect(canMeterDiffuseWhiteBalance(material)).toBe(false);
});

test('finishing meters in linear HDR, applies AgX once, and releases only temporary resources', async () => {
  const scene = new THREE.Scene();
  const original = new THREE.MeshStandardMaterial({color: 0xffffff});
  const geometry = new THREE.BoxGeometry();
  scene.add(new THREE.Mesh(geometry, original));
  const texture = new THREE.Texture();
  let target: THREE.WebGLRenderTarget | null = null;
  const configurations: unknown[] = [];
  let clearAlpha = 0.7;
  const renderer = {
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 2,
    outputColorSpace: THREE.SRGBColorSpace,
    autoClear: false,
    getClearAlpha: () => clearAlpha,
    setClearAlpha: (value: number) => {
      clearAlpha = value;
    },
    getRenderTarget: () => target,
    setRenderTarget: (value: typeof target) => {
      target = value;
    },
    getContext: vi.fn(),
    setSize: vi.fn(),
    readRenderTargetPixels: (
      _t: unknown,
      _x: number,
      _y: number,
      _w: number,
      _h: number,
      data: Float32Array,
    ) => {
      data.fill(0.5);
    },
    render: (rendered: THREE.Scene) => {
      if (rendered instanceof THREE.Scene) {
        expect(rendered.background).toBeNull();
        expect(clearAlpha).toBe(0);
      }
      configurations.push([
        renderer.toneMapping,
        renderer.outputColorSpace,
        target,
      ]);
    },
  };
  const sourceDispose = vi.spyOn(original, 'dispose');
  const textureDispose = vi.spyOn(texture, 'dispose');
  const temporaryDispose = vi.spyOn(
    THREE.WebGLRenderTarget.prototype,
    'dispose',
  );
  try {
    await finishPhoto(
      renderer as unknown as THREE.WebGLRenderer,
      scene,
      new THREE.PerspectiveCamera(),
      texture,
      100,
      64,
      DEFAULT_PHOTO_CAMERA,
      1,
    );
    expect(configurations).toHaveLength(4);
    expect(configurations[0]).toEqual([
      THREE.NoToneMapping,
      THREE.LinearSRGBColorSpace,
      expect.any(THREE.WebGLRenderTarget),
    ]);
    expect(configurations[3]).toEqual([
      THREE.ACESFilmicToneMapping,
      THREE.SRGBColorSpace,
      null,
    ]);
    expect(temporaryDispose).toHaveBeenCalledOnce();
    expect(sourceDispose).not.toHaveBeenCalled();
    expect(textureDispose).not.toHaveBeenCalled();
    expect((scene.children[0] as THREE.Mesh).material).toBe(original);
    expect(renderer.toneMappingExposure).toBe(2);
    expect(renderer.autoClear).toBe(false);
    expect(clearAlpha).toBe(0.7);
  } finally {
    vi.restoreAllMocks();
  }
});
