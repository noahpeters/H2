import type {WebGLPathTracer} from 'three-gpu-pathtracer';
import {photoNoiseOffsets} from './photoNoise';

/** Pinned adapter: deterministic stratification plus fixed spatial blue-noise ranks. */
export function deterministicPhotoTracer(tracer: WebGLPathTracer) {
  const pinned = tracer as WebGLPathTracer & {
    stableNoise: boolean;
    _pathTracer: {
      material: {
        setDefine: (name: string, value: number) => void;
        stratifiedOffsetTexture: {
          image: {data: Float32Array; width: number; height: number};
          needsUpdate: boolean;
        };
      };
    };
  };
  const material = pinned._pathTracer?.material;
  const offsets = material?.stratifiedOffsetTexture;
  if (
    !material?.setDefine ||
    offsets?.image.width !== 64 ||
    offsets.image.height !== 64 ||
    offsets.image.data.length !== 4096
  ) {
    throw new Error(
      'Photo tracer compatibility changed. Please update the photo adapter.',
    );
  }
  pinned.stableNoise = true;
  offsets.image.data.set(photoNoiseOffsets());
  offsets.needsUpdate = true;
  material.setDefine('RANDOM_TYPE', 2);
}

/** Prime the final sampler dimensions before reset. Upstream's lazy resize consumes
 * a shuffled sample on the first pass, while later resets start at stratum zero. */
export function preparePhotoSampler(tracer: WebGLPathTracer) {
  const material = (
    tracer as unknown as {
      _pathTracer: {
        material: {
          bounces: number;
          transmissiveBounces: number;
          stratifiedTexture: {init: (count: number, depth: number) => void};
        };
      };
    }
  )._pathTracer.material;
  if (!material.stratifiedTexture?.init)
    throw new Error('Photo sampler compatibility changed.');
  material.stratifiedTexture.init(
    20,
    material.bounces + material.transmissiveBounces + 5,
  );
}

/** 0.0.23 dispose references a renamed quad and omits its low-resolution target. */
export function disposePhotoTracer(tracer: WebGLPathTracer) {
  const pinned = tracer as WebGLPathTracer & {
    _quad?: {dispose: () => void; material: {dispose: () => void}};
    _renderQuad?: unknown;
    _lowResPathTracer?: {dispose: () => void; material: {dispose: () => void}};
    _pathTracer?: {material: {dispose: () => void}};
    _generator?: {geometry: {dispose: () => void}};
  };
  if (pinned._quad) pinned._renderQuad = pinned._quad;
  try {
    tracer.dispose();
  } finally {
    pinned._lowResPathTracer?.dispose();
    pinned._lowResPathTracer?.material.dispose();
    pinned._pathTracer?.material.dispose();
    pinned._generator?.geometry.dispose();
  }
}
