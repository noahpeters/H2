import * as THREE from 'three';

export type PhotoCameraSettings = {
  autoExposure: boolean;
  exposureCompensation: number;
  autoWhiteBalance: boolean;
  temperature: number;
  lensMm: number;
  verticalShift: number;
  architectural: boolean;
  quality: 'quick' | 'standard' | 'fine';
};
export const DEFAULT_PHOTO_CAMERA: PhotoCameraSettings = {
  autoExposure: true,
  exposureCompensation: 0,
  autoWhiteBalance: true,
  temperature: 6500,
  lensMm: 28,
  verticalShift: 0,
  architectural: true,
  quality: 'standard',
};
export const PHOTO_QUALITY = {
  quick: {scale: 1, samples: 64},
  standard: {scale: 1.5, samples: 256},
  fine: {scale: 2, samples: 512},
} as const;

export function validatePhotoCamera(value: PhotoCameraSettings) {
  const bounded = (v: number, low: number, high: number) =>
    Number.isFinite(v) && v >= low && v <= high;
  if (
    typeof value.autoExposure !== 'boolean' ||
    typeof value.autoWhiteBalance !== 'boolean' ||
    typeof value.architectural !== 'boolean' ||
    !bounded(value.exposureCompensation, -4, 4) ||
    !bounded(value.temperature, 2000, 10000) ||
    !bounded(value.lensMm, 18, 85) ||
    !bounded(value.verticalShift, -0.5, 0.5) ||
    !Object.hasOwn(PHOTO_QUALITY, value.quality)
  )
    throw new Error('Invalid photo camera settings.');
}

/** Level the captured camera, retaining its position, heading, zoom and aim-point
 * image height. Shift changes only the off-axis frustum, never model geometry. */
export function architecturalPhotoCamera(
  source: THREE.PerspectiveCamera,
  settings: PhotoCameraSettings,
  target?: THREE.Vector3,
) {
  const camera = source.clone();
  if (!settings.architectural) return camera;
  source.updateMatrixWorld(true);
  const direction = source.getWorldDirection(new THREE.Vector3());
  const horizontal = new THREE.Vector3(direction.x, 0, direction.z);
  if (horizontal.lengthSq() < 1e-8)
    throw new Error(
      'Choose a room-level view before taking an architectural photo.',
    );
  const aim =
    target?.clone() ?? source.position.clone().addScaledVector(direction, 10);
  const originalHeight = aim.clone().project(source).y;
  camera.up.set(0, 1, 0);
  camera.lookAt(camera.position.clone().add(horizontal.normalize()));
  // A 36mm wide full-frame sensor, with crop height following the captured aspect.
  camera.filmGauge = 36 / Math.min(camera.aspect, 1);
  camera.setFocalLength(settings.lensMm);
  camera.updateMatrixWorld(true);
  const correctedHeight = aim.clone().project(camera).y;
  // In Three's perspective matrix, element 9 translates projected vertical NDC.
  camera.projectionMatrix.elements[9] +=
    correctedHeight - originalHeight + 2 * settings.verticalShift;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  return camera;
}

/** Uniform global adaptation preserves the relative warmth/coolness of sources.
 * Only near-neutral albedo pixels inform WB, so oak/paint cannot define white. */
export function meterPhoto(
  radiance: ArrayLike<number>,
  albedo: ArrayLike<number>,
  settings: PhotoCameraSettings,
  manualExposure: number,
) {
  const luminances: number[] = [];
  const neutral = [0, 0, 0];
  let count = 0;
  for (let i = 0; i < radiance.length; i += 4) {
    const rgb = [radiance[i], radiance[i + 1], radiance[i + 2]];
    if (rgb.some((v) => !Number.isFinite(v) || v < 0)) continue;
    const l = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    if (l < 1e-5) continue;
    luminances.push(l);
    const base = [albedo[i], albedo[i + 1], albedo[i + 2]];
    const max = Math.max(...base),
      min = Math.min(...base);
    if (max < 0.2 || max - min > max * 0.08 || l > 4 || radiance[i + 3] < 0.5)
      continue;
    rgb.forEach((v, channel) => {
      neutral[channel] += v / l;
    });
    count++;
  }
  luminances.sort((a, b) => a - b);
  const percentile = (p: number) =>
    luminances[Math.floor((luminances.length - 1) * p)] ?? 0.18;
  // Median balances the occupied room; p98 constrains windows without letting a
  // tiny sun/specular outlier push all cabinetry into darkness. Bounded ±4EV.
  const auto = Math.max(
    1 / 16,
    Math.min(16, 0.35 / percentile(0.5), 8 / percentile(0.98)),
  );
  const exposure =
    (settings.autoExposure ? auto : manualExposure) *
    2 ** settings.exposureCompensation;
  let gains = [1, 1, 1];
  if (settings.autoWhiteBalance && count >= 8) {
    const mean = neutral.map((v) => v / count);
    const gray = mean[0] * 0.2126 + mean[1] * 0.7152 + mean[2] * 0.0722;
    gains = mean.map((v) =>
      Math.max(0.8, Math.min(1.25, gray / Math.max(v, 0.001))),
    );
  }
  return {exposure, gains, neutralCount: count};
}
