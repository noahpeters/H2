import {expect, test, vi} from 'vitest';
import type {WebGLPathTracer} from 'three-gpu-pathtracer';
import {deterministicPhotoTracer, disposePhotoTracer} from './photoTracer';

test('pinned adapter disables randomized offset noise and repairs upstream cleanup', () => {
  const dispose = vi.fn();
  const material = {
    setDefine: vi.fn(),
    dispose: vi.fn(),
    stratifiedOffsetTexture: {
      image: {width: 64, height: 64, data: new Float32Array(4096)},
      needsUpdate: false,
    },
  };
  const tracer = {
    stableNoise: false,
    _pathTracer: {material},
    _quad: {dispose: vi.fn(), material: {dispose: vi.fn()}},
    _renderQuad: undefined as unknown,
    _lowResPathTracer: {dispose: vi.fn(), material: {dispose: vi.fn()}},
    _generator: {geometry: {dispose: vi.fn()}},
    dispose,
  };
  deterministicPhotoTracer(tracer as unknown as WebGLPathTracer);
  expect(tracer.stableNoise).toBe(true);
  expect(material.setDefine).toHaveBeenCalledWith('RANDOM_TYPE', 2);
  disposePhotoTracer(tracer as unknown as WebGLPathTracer);
  expect(tracer._renderQuad).toBe(tracer._quad);
  expect(dispose).toHaveBeenCalledOnce();
  expect(material.dispose).toHaveBeenCalledOnce();
  expect(tracer._lowResPathTracer.dispose).toHaveBeenCalledOnce();
  expect(tracer._generator.geometry.dispose).toHaveBeenCalledOnce();
});

test('compatibility drift fails explicitly instead of silently randomizing photo pixels', () => {
  expect(() => deterministicPhotoTracer({} as WebGLPathTracer)).toThrow(
    'compatibility',
  );
});
