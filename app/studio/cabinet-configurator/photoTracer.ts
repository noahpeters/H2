import type {WebGLPathTracer} from 'three-gpu-pathtracer';

/** Adapter for pinned 0.0.23: stableNoise alone leaves a randomized blue-noise offset.
 * PCG uses pixel coordinates and the reset sample seed, so no global random state
 * or constructor-generated noise texture contributes to the render sequence.
 */
export function deterministicPhotoTracer(tracer: WebGLPathTracer) {
  const pinned = tracer as WebGLPathTracer & {
    stableNoise: boolean;
    _pathTracer: {material: {setDefine: (name: string, value: number) => void}};
  };
  if (!pinned._pathTracer?.material?.setDefine) {
    throw new Error(
      'Photo tracer compatibility changed. Please update the photo adapter.',
    );
  }
  pinned.stableNoise = true;
  pinned._pathTracer.material.setDefine('RANDOM_TYPE', 0);
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
