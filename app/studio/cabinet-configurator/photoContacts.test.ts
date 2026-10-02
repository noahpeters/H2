import {expect, test} from 'vitest';
import * as pathTracer from 'three-gpu-pathtracer';
import type {ShaderMaterial} from 'three';
const {PhysicalPathTracingMaterial} = pathTracer as unknown as {
  PhysicalPathTracingMaterial: new () => ShaderMaterial;
};
import type {WebGLPathTracer} from 'three-gpu-pathtracer';
import {configurePhotoContacts, DEFAULT_PHOTO_CONTACTS} from './photoContacts';
import {DEFAULT_PHOTO_SETTINGS, validatePhotoSettings} from './photoLighting';

// Exercise the real pinned shader instead of copying the adapter's markers into a mock.
function configured(quality = DEFAULT_PHOTO_CONTACTS.quality, intensity = 1) {
  const material = new PhysicalPathTracingMaterial();
  const original = material.fragmentShader;
  configurePhotoContacts(
    {_pathTracer: {material}} as unknown as WebGLPathTracer,
    {...DEFAULT_PHOTO_CONTACTS, quality, intensity},
  );
  return {material, original};
}

test('real pinned shader refines complete transport with no AO color multiplier', () => {
  const {material, original} = configured();
  expect(material.uniforms.photoContactPaths.value).toBe(2);
  expect(material.uniforms.photoContactRadius.value).toBe(0.05);
  expect(material.fragmentShader).toContain('Ray ray = cameraRay;');
  expect(material.fragmentShader).toContain(
    'gl_FragColor = photoContactSum / float( contactPaths );',
  );
  // Existing direct visibility, GI throughput and MIS stay authoritative.
  for (const expression of [
    'directLightContribution( - ray.direction, surf, state, hitPoint )',
    'state.throughputColor *= scatterRec.color / scatterRec.pdf;',
    'misHeuristic( scatterRec.pdf, lightRec.pdf / lightsDenom )',
  ]) {
    expect(original).toContain(expression);
    expect(material.fragmentShader).toContain(expression);
  }
  expect(material.fragmentShader).toContain('#define RAY_OFFSET 1e-5');
  material.dispose();
});

test.each([
  ['off', 1, 1],
  ['standard', 0, 1],
  ['standard', 1, 2],
  ['fine', 1, 4],
  ['fine', 0.5, 3],
] as const)(
  '%s at strength %s uses %s complete paths',
  (quality, intensity, count) => {
    const {material} = configured(quality, intensity);
    expect(material.uniforms.photoContactPaths.value).toBe(count);
    material.dispose();
  },
);

test('unsupported shader versions fail visibly rather than silently dropping contact detail', () => {
  expect(() =>
    configurePhotoContacts({} as WebGLPathTracer, DEFAULT_PHOTO_CONTACTS),
  ).toThrow('compatibility');
});

test.each([
  {radius: NaN},
  {radius: 0},
  {radius: 0.21},
  {intensity: Infinity},
  {intensity: -1},
  {intensity: 1.01},
  {quality: 'extreme'},
])('invalid contact options rejected: %j', (override) => {
  expect(() =>
    validatePhotoSettings({
      ...DEFAULT_PHOTO_SETTINGS,
      contacts: {
        ...DEFAULT_PHOTO_CONTACTS,
        ...override,
      } as typeof DEFAULT_PHOTO_CONTACTS,
    }),
  ).toThrow('Invalid photo');
});

test('legacy API options without contact settings remain valid', () => {
  expect(() =>
    validatePhotoSettings({...DEFAULT_PHOTO_SETTINGS, contacts: undefined}),
  ).not.toThrow();
});
