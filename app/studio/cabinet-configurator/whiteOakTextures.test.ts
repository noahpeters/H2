import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {
  CABINET_MATERIAL_DEFINITIONS,
  resolveCabinetMaterial,
} from './materials';
import {validMaterialDefinition} from './materialDefinition';
import {
  createMaterial,
  mapMaterialPart,
  waitForMaterialTextures,
} from './materialRendering';
import {blankStudy, migrateStudy} from './CabinetConfigurator';
import {validStudy} from './savedRoomProtocol';

const definition = CABINET_MATERIAL_DEFINITIONS['plain-white-oak'];
const root = join(process.cwd(), 'public/studio/materials/oak-veneer-05');

describe('explicit white oak preview', () => {
  it('bundles the provenance-matched maps and serializes the complete specification', () => {
    const manifest = JSON.parse(
      readFileSync(join(root, 'provenance.json'), 'utf8'),
    ) as {
      license: string;
      physicalSize: typeof definition.textureSize;
      sourceCut: string;
      files: {filename: string; bytes: number; sha256: string}[];
    };
    expect(manifest.license).toBe('CC0-1.0');
    expect(manifest.physicalSize).toEqual(definition.textureSize);
    expect(manifest.sourceCut).toContain('Not specified');
    for (const file of manifest.files) {
      const bytes = readFileSync(join(root, file.filename));
      expect(bytes.length).toBe(file.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        file.sha256,
      );
    }
    expect(
      Object.values(definition.textures!)
        .map((asset) => asset.uri.split('/').pop())
        .sort(),
    ).toEqual(
      manifest.files.map((file: {filename: string}) => file.filename).sort(),
    );
    expect(validMaterialDefinition(definition)).toBe(true);
    const study = blankStudy();
    study.elements = [
      {
        id: 'oak',
        kind: 'base',
        width: 30,
        height: 34.5,
        depth: 24,
        face: 'shaker',
        material: 'plain-white-oak',
        materialDefinition: definition,
        placement: {mode: 'floor', x: 30, z: 30, rotation: 0},
      },
    ];
    const loaded = migrateStudy(JSON.parse(JSON.stringify(study)));
    expect(validStudy(loaded)).toBe(true);
    expect(resolveCabinetMaterial(loaded.elements[0])).toEqual(definition);
    // An explicit old snapshot stays color-only even though the catalog is richer.
    const legacy = {
      ...definition,
      textures: undefined,
      textureSize: undefined,
      pbr: {color: '#c4aa80'},
    };
    expect(
      resolveCabinetMaterial({
        material: 'plain-white-oak',
        materialDefinition: legacy,
      }),
    ).toEqual(legacy);
    expect(createMaterial(legacy, 0.65).map).toBeNull();
    expect(createMaterial(legacy, 0.65).roughness).toBe(0.65);
  });

  it('shares default maps while preserving grain, physical scale and lifetime per part', async () => {
    const complete: (() => void)[] = [];
    const load = vi
      .spyOn(THREE.TextureLoader.prototype, 'load')
      .mockImplementation((_url, onLoad) => {
        const texture = new THREE.Texture();
        complete.push(() => onLoad?.(texture));
        return texture;
      });
    const a = createMaterial(definition, 0.6),
      b = createMaterial(definition, 0.65);
    try {
      expect(load).toHaveBeenCalledTimes(4);
      expect(a.map).toBe(b.map);
      expect(a.map!.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(a.normalMap!.colorSpace).toBe(THREE.NoColorSpace);
      expect(a.color.getHexString()).toBe('ffffff');
      expect(a.roughness).toBe(1); // Source map's neutral multiplier.
      expect(a.displacementMap).toBeNull();
      const door = new THREE.Mesh(new THREE.BoxGeometry(18, 30, 0.75), a);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(18, 2, 0.75), b);
      mapMaterialPart(
        door.geometry,
        a,
        {width: 18, height: 30, depth: 0.75},
        'in',
        'door',
      );
      mapMaterialPart(
        rail.geometry,
        b,
        {width: 18, height: 2, depth: 0.75},
        'in',
        'rail',
      );
      for (const [mesh, along] of [
        [door, 'y'],
        [rail, 'x'],
      ] as const) {
        const p = mesh.geometry.getAttribute('position'),
          n = mesh.geometry.getAttribute('normal'),
          uv = mesh.geometry.getAttribute('uv');
        for (let i = 0; i < p.count; i++) {
          if (n.getZ(i) < 0.99) continue;
          expect(uv.getX(i)).toBeCloseTo(
            (along === 'y' ? p.getY(i) : p.getX(i)) * 0.0254,
          );
        }
      }
      expect(a.map!.repeat.toArray()).toEqual([1, 1]);
      expect(a.map!.rotation).toBe(0);
      let ready = false;
      const pending = waitForMaterialTextures(door).then(() => {
        ready = true;
      });
      await Promise.resolve();
      expect(ready).toBe(false);
      complete.forEach((done) => done());
      await pending;
      const disposed = vi.fn();
      a.map!.addEventListener('dispose', disposed);
      a.dispose();
      a.dispose();
      expect(disposed).not.toHaveBeenCalled();
      b.dispose();
      expect(disposed).toHaveBeenCalledOnce();
      door.geometry.dispose();
      rail.geometry.dispose();
    } finally {
      a.dispose();
      b.dispose();
      load.mockRestore();
    }
  });

  it('resolves failed maps to the original color and settles preview readiness', async () => {
    const failures: (() => void)[] = [];
    const load = vi
      .spyOn(THREE.TextureLoader.prototype, 'load')
      .mockImplementation((_url, _ok, _progress, onError) => {
        failures.push(() => onError?.(new Error('missing texture')));
        return new THREE.Texture();
      });
    const material = createMaterial(definition, 0.6);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    try {
      failures.forEach((fail) => fail());
      await waitForMaterialTextures(mesh);
      expect(material.map).toBeNull();
      expect(material.normalMap).toBeNull();
      expect(material.roughnessMap).toBeNull();
      expect(material.aoMap).toBeNull();
      expect(material.color.getHexString()).toBe('c4aa80');
      expect(material.userData.textureErrors).toHaveLength(4);
    } finally {
      material.dispose();
      mesh.geometry.dispose();
      load.mockRestore();
    }
  });
});
