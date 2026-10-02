import {afterEach, expect, test, vi} from 'vitest';
import * as THREE from 'three';
import {createHash} from 'node:crypto';
import {readFileSync, existsSync} from 'node:fs';
import {ROOM_MATERIALS} from './roomMaterials';
import {
  validMaterialDefinition,
  type MaterialDefinition,
} from './materialDefinition';
import {blankStudy} from './CabinetConfigurator';
import {validStudy} from './savedRoomProtocol';
import {StudyScene, disposeStudyObject} from './studyScene';

afterEach(() => vi.restoreAllMocks());

test('room choices and legacy rooms serialize with validated PBR definitions and bundled provenance', () => {
  expect(validStudy(JSON.parse(JSON.stringify(blankStudy())))).toBe(true);
  for (const surface of Object.values(ROOM_MATERIALS)) {
    expect(Object.keys(surface)).toHaveLength(3);
    for (const definition of Object.values(surface)) {
      expect(validMaterialDefinition(definition)).toBe(true);
      for (const asset of Object.values(
        (definition as MaterialDefinition).textures ?? {},
      )) {
        expect(existsSync(`public${asset.uri}`)).toBe(true);
        const folder = `public${asset.uri.slice(0, asset.uri.lastIndexOf('/'))}`;
        const manifest = JSON.parse(
          readFileSync(`${folder}/provenance.json`, 'utf8'),
        ) as {files: Record<string, {file: string; sha256: string}>};
        const file = Object.values(manifest.files).find((file) =>
          asset.uri.endsWith(file.file),
        ) as {sha256: string};
        expect(
          createHash('sha256')
            .update(readFileSync(`public${asset.uri}`))
            .digest('hex'),
        ).toBe(file.sha256);
      }
    }
  }
  for (const countertopMaterial of Object.keys(ROOM_MATERIALS.countertop)) {
    const study = blankStudy();
    Object.assign(study.room, {countertopMaterial});
    expect(validStudy(JSON.parse(JSON.stringify(study)))).toBe(true);
  }
  const invalid = blankStudy();
  Object.assign(invalid.room, {countertopMaterial: 'unknown'});
  expect(validStudy(invalid)).toBe(false);
});

test('material changes rebuild affected surfaces and retain exact positions, openings and countertop cutouts', async () => {
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(
    (_url, onLoad) => {
      const texture = new THREE.Texture();
      queueMicrotask(() => onLoad?.(texture));
      return texture;
    },
  );
  const scene = new THREE.Scene();
  const content = new StudyScene(scene);
  const study = blankStudy();
  study.elements = [
    {
      id: 'sink',
      kind: 'base',
      width: 30,
      height: 34.5,
      depth: 24,
      face: 'shaker',
      material: 'paint-grade',
      sink: {kind: 'undermount', x: 0, width: 20, depth: 16},
      placement: {mode: 'floor', x: 30, z: 30, rotation: 90},
    },
  ] as typeof study.elements;
  try {
    await content.update(study);
    const before = content.selectable[0];
    const geometryBefore: number[][] = [];
    before.traverse((part) => {
      if (part instanceof THREE.Mesh)
        geometryBefore.push(
          Array.from(part.geometry.getAttribute('position').array),
        );
    });
    const position = before.position.clone();
    await content.update({
      ...study,
      room: {
        ...study.room,
        floor: 'concrete',
        walls: 'green',
        countertopMaterial: 'dark-granite',
      },
    });
    const after = content.selectable[0];
    expect(after).not.toBe(before);
    expect(after.position).toEqual(position);
    const geometryAfter: number[][] = [];
    after.traverse((part) => {
      if (part instanceof THREE.Mesh)
        geometryAfter.push(
          Array.from(part.geometry.getAttribute('position').array),
        );
    });
    expect(geometryAfter).toEqual(geometryBefore);
    const top = after.getObjectByName('cabinet-countertop') as THREE.Mesh;
    expect(
      (top.material as THREE.Material).userData.materialDefinition.id,
    ).toBe('dark-granite');
  } finally {
    content.dispose();
    disposeStudyObject(scene);
  }
});
