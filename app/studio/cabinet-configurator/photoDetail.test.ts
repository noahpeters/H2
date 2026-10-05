import {expect, test} from 'vitest';
import * as THREE from 'three';
import * as pathTracer from 'three-gpu-pathtracer';
const PhysicalPathTracingMaterial = (
  pathTracer as unknown as {
    PhysicalPathTracingMaterial: new () => THREE.ShaderMaterial;
  }
).PhysicalPathTracingMaterial;
import type {WebGLPathTracer} from 'three-gpu-pathtracer';
import {configurePhotoTransport} from './photoTransport';
import {configurePhotoContacts} from './photoContacts';
import {photoFloatBytes, photoDiagnosticZip} from './photoDiagnostics';
import {withWoodFinish} from './woodFinishes';
import {validMaterialDefinition} from './materialDefinition';
import {createMaterial, remapRoughnessPixels} from './materialRendering';
import {CABINET_MATERIAL_DEFINITIONS} from './materials';
import {detailedPhotoDefinition, photoTextureBytes} from './photoTextures';
import {
  addPhotoCeiling,
  addDirectionalDaylight,
  DEFAULT_PHOTO_DAYLIGHT,
  sunDirection,
} from './photoDaylight';
import {blankStudy} from './CabinetConfigurator';
import {unzipSync, strFromU8} from 'fflate';

// Tests validate saved-material compatibility, bounds and isolation, not photometric calibration.
test('finish snapshots preserve identity, assets and tile scale; invalid finish data is rejected', () => {
  const source = structuredClone(
    CABINET_MATERIAL_DEFINITIONS['rift-white-oak'],
  );
  const before = JSON.stringify(source);
  const satin = withWoodFinish(source, 'satin');
  expect(validMaterialDefinition(satin)).toBe(true);
  expect(satin.id).toBe(source.id);
  expect(satin.textures).toEqual(source.textures);
  expect(satin.textureSize).toEqual(source.textureSize);
  const material = createMaterial({...satin, textures: undefined}, 0.8);
  expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
  expect((material as THREE.MeshPhysicalMaterial).clearcoat).toBe(0.35);
  expect(material.normalScale.toArray()).toEqual([0.35, 0.35]);
  material.dispose();
  for (const patch of [
    {normalStrength: NaN},
    {roughnessMapRange: [0.4, 0.2]},
    {roughnessMapRange: [0, 1, 2]},
    {clearcoat: 2},
    {clearcoatRoughness: -1},
  ])
    expect(
      validMaterialDefinition({...satin, pbr: {...satin.pbr, ...patch}}),
    ).toBe(false);
  expect(JSON.stringify(source)).toBe(before);
  const pixels = new Uint8ClampedArray([
    0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255,
  ]);
  expect(Array.from(remapRoughnessPixels(pixels, [0.2, 0.4]))).toEqual([
    51, 51, 51, 255, 77, 77, 77, 255, 102, 102, 102, 255,
  ]);
  expect(pixels[0]).toBe(0);
});
test('photo texture upgrades are allowlisted, leave saved sources unchanged and bound unique GPU layers', () => {
  const definition = CABINET_MATERIAL_DEFINITIONS.walnut;
  const detailed = detailedPhotoDefinition(definition, 2048);
  expect(detailed.textures!.albedo!.uri).toContain('_2k.jpg');
  expect(definition.textures!.albedo!.uri).toContain('_1k.jpg');
  expect(detailed.textureSize).toEqual(definition.textureSize);
  expect(
    detailedPhotoDefinition(
      {
        ...definition,
        textures: {
          albedo: {...definition.textures!.albedo!, uri: '/custom/wood_1k.jpg'},
        },
      },
      4096,
    ).textures!.albedo!.uri,
  ).toBe('/custom/wood_1k.jpg');
  const texture = new THREE.Texture();
  const scene = new THREE.Scene();
  scene.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({map: texture, normalMap: texture}),
    ),
  );
  expect(photoTextureBytes(scene, 2048)).toBe(2048 * 2048 * 4);
});
test('directional daylight and concave ceilings use explicit settings and exact room boundaries', () => {
  const room = blankStudy().room;
  room.outline = [
    {id: 'back', x: 0, z: 0},
    {id: 'right', x: room.width, z: 0},
    {id: 'front', x: room.width, z: room.depth / 2},
    {id: 'segment-notch', x: room.width / 2, z: room.depth / 2},
    {id: 'segment-side', x: room.width / 2, z: room.depth},
    {id: 'left', x: 0, z: room.depth},
  ];
  const scene = new THREE.Scene();
  const ceiling = addPhotoCeiling(scene, room);
  expect(ceiling.position.y).toBeCloseTo(room.height * 0.0254);
  // Concave outline area excludes the notch, rather than a rectangular bounding ceiling.
  const position = ceiling.geometry.getAttribute('position'),
    index = ceiling.geometry.index!;
  let area = 0;
  for (let i = 0; i < index.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(position, index.getX(i)),
      b = new THREE.Vector3().fromBufferAttribute(position, index.getX(i + 1)),
      c = new THREE.Vector3().fromBufferAttribute(position, index.getX(i + 2));
    area += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  expect(area).toBeCloseTo(room.width * room.depth * 0.75 * 0.0254 ** 2);
  const daylight = {...DEFAULT_PHOTO_DAYLIGHT, enabled: true, azimuth: 180};
  expect(sunDirection(daylight).z).toBeLessThan(0);
  const sky = addDirectionalDaylight(scene, daylight, 6500);
  expect((sky.image.data as Float32Array)[0]).toBe(0); // southern rows are below the horizon
  expect((sky.image.data as Float32Array).at(-4)).toBeGreaterThan(0);
  expect(scene.getObjectByName('photo-sun')).toBeInstanceOf(
    THREE.RectAreaLight,
  );
  sky.dispose();
  ceiling.geometry.dispose();
  (ceiling.material as THREE.Material).dispose();
});
test('transport adapters retain per-contact initialization and reject incompatible pinned shaders', () => {
  const material = new PhysicalPathTracingMaterial();
  const tracer = {_pathTracer: {material}} as unknown as WebGLPathTracer;
  const select = configurePhotoTransport(tracer);
  configurePhotoContacts(tracer, {quality: 'fine', intensity: 1, radius: 0.05});
  const shader = material.fragmentShader;
  expect(shader.indexOf('photoDD=photoDS=')).toBeGreaterThan(
    shader.indexOf('for ( int contactPath'),
  );
  select('direct-specular');
  expect(material.uniforms.photoPass.value).toBe(5);
  material.dispose();
  expect(() =>
    configurePhotoTransport({
      _pathTracer: {
        material: {fragmentShader: 'invalid', uniforms: {}, needsUpdate: false},
      },
    } as unknown as WebGLPathTracer),
  ).toThrow('compatibility');
});
test('diagnostic archive is lossless and records its byte layout', async () => {
  const pixels = new Float32Array([0.125, 16, 0, 1]);
  const bytes = photoFloatBytes(pixels);
  expect(new DataView(bytes.buffer).getFloat32(4, true)).toBe(16);
  const png = {
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  } as Blob;
  const zip = await photoDiagnosticZip({'beauty-linear.f32': bytes}, png, {
    format: 'float32 little endian',
  });
  // jsdom Blob has no arrayBuffer; use FileReader to inspect the actual archive bytes.
  const read = new FileReader();
  const loaded = new Promise<ArrayBuffer>((resolve, reject) => {
    read.onload = () => resolve(read.result as ArrayBuffer);
    read.onerror = () => reject(read.error);
  });
  read.readAsArrayBuffer(zip);
  const files = unzipSync(new Uint8Array(await loaded));
  expect(files['beauty-linear.f32']).toEqual(bytes);
  expect(
    (JSON.parse(strFromU8(files['capture.json'])) as {format: string}).format,
  ).toContain('little endian');
});
