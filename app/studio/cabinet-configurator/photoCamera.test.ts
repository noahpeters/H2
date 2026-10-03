import {expect, test} from 'vitest';
import * as THREE from 'three';
import {
  architecturalPhotoCamera,
  DEFAULT_PHOTO_CAMERA,
  meterPhoto,
  validatePhotoCamera,
} from './photoCamera';

const pixels = (rgb: number[], count = 64) =>
  new Float32Array(Array.from({length: count}, () => [...rgb, 1]).flat());

test('level off-axis camera preserves capture position and target image height; vertical lines remain parallel', () => {
  const source = new THREE.PerspectiveCamera(38, 1.6, 0.01, 100);
  source.position.set(4, 3, 6);
  const target = new THREE.Vector3(0, 1, 0);
  source.lookAt(target);
  source.updateMatrixWorld(true);
  const before = source.toJSON();
  const camera = architecturalPhotoCamera(source, DEFAULT_PHOTO_CAMERA, target);
  expect(camera.position).toEqual(source.position);
  expect(camera.zoom).toBe(source.zoom);
  expect(camera.getFocalLength()).toBeCloseTo(28);
  expect(camera.getWorldDirection(new THREE.Vector3()).y).toBeCloseTo(0);
  expect(target.clone().project(camera).y).toBeCloseTo(
    target.clone().project(source).y,
  );
  for (const point of [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(1, 0, 1),
  ]) {
    expect(point.clone().project(camera).x).toBeCloseTo(
      point
        .clone()
        .add(new THREE.Vector3(0, 2, 0))
        .project(camera).x,
    );
  }
  expect(source.toJSON()).toEqual(before);
  const shifted = architecturalPhotoCamera(
    source,
    {...DEFAULT_PHOTO_CAMERA, verticalShift: 0.2},
    target,
  );
  expect(target.clone().project(shifted).y).toBeCloseTo(
    target.clone().project(camera).y - 0.4,
  );
  expect(
    architecturalPhotoCamera(source, {
      ...DEFAULT_PHOTO_CAMERA,
      architectural: false,
    }).projectionMatrix,
  ).toEqual(source.projectionMatrix);
  const identity = camera.projectionMatrix
    .clone()
    .multiply(camera.projectionMatrixInverse).elements;
  identity.forEach((value, i) =>
    expect(value).toBeCloseTo(i % 5 === 0 ? 1 : 0),
  );
});

test('portrait and landscape lenses use a 36mm sensor width', () => {
  for (const aspect of [0.7, 1, 1.7]) {
    const camera = architecturalPhotoCamera(
      new THREE.PerspectiveCamera(38, aspect),
      DEFAULT_PHOTO_CAMERA,
    );
    expect(camera.getFilmWidth()).toBeCloseTo(36);
    expect(camera.getFocalLength()).toBeCloseTo(28);
  }
});

test('median exposure, highlight guard and compensation operate in linear HDR', () => {
  const base = pixels([0.5, 0.5, 0.5]);
  expect(
    meterPhoto(pixels([0.1, 0.1, 0.1]), base, DEFAULT_PHOTO_CAMERA, 1).exposure,
  ).toBeCloseTo(3.5);
  const image = pixels([0.1, 0.1, 0.1]);
  for (let i = 0; i < 12; i += 4) image.set([10, 10, 10, 1], i);
  expect(meterPhoto(image, base, DEFAULT_PHOTO_CAMERA, 1).exposure).toBeCloseTo(
    0.8,
  );
  expect(
    meterPhoto(
      image,
      base,
      {...DEFAULT_PHOTO_CAMERA, autoExposure: false, exposureCompensation: 1},
      2,
    ).exposure,
  ).toBe(4);
  expect(
    Number.isFinite(
      meterPhoto(pixels([NaN, 0, 0]), base, DEFAULT_PHOTO_CAMERA, 1).exposure,
    ),
  ).toBe(true);
});

test('neutral-albedo WB cannot neutralize colored cabinetry; global correction is bounded', () => {
  const warm = pixels([0.7, 0.4, 0.2]);
  const measured = meterPhoto(
    warm,
    pixels([0.5, 0.5, 0.5]),
    DEFAULT_PHOTO_CAMERA,
    1,
  );
  expect(measured.gains[0]).toBeLessThan(1);
  expect(measured.gains[2]).toBeGreaterThan(1);
  expect(Math.min(...measured.gains)).toBeGreaterThanOrEqual(0.8);
  expect(Math.max(...measured.gains)).toBeLessThanOrEqual(1.25);
  expect(
    meterPhoto(warm, pixels([0.6, 0.3, 0.1]), DEFAULT_PHOTO_CAMERA, 1).gains,
  ).toEqual([1, 1, 1]);
  expect(
    meterPhoto(
      warm,
      pixels([0.5, 0.5, 0.5]),
      {...DEFAULT_PHOTO_CAMERA, autoWhiteBalance: false},
      1,
    ).gains,
  ).toEqual([1, 1, 1]);
});

test('settings serialize and invalid camera inputs are rejected', () => {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_PHOTO_CAMERA),
  ) as typeof DEFAULT_PHOTO_CAMERA;
  expect(() => validatePhotoCamera(settings)).not.toThrow();
  for (const patch of [
    {lensMm: NaN},
    {temperature: 1000},
    {verticalShift: 2},
    {quality: 'unknown'},
    {autoExposure: 1},
  ])
    expect(() =>
      validatePhotoCamera({
        ...settings,
        ...patch,
      } as typeof DEFAULT_PHOTO_CAMERA),
    ).toThrow();
});
