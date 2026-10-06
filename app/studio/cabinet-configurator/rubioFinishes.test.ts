import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {
  RUBIO_COLORS,
  hasRubioColors,
  rubioColor,
  withRubioColor,
} from './rubioFinishes';
import {
  CABINET_MATERIAL_DEFINITIONS,
  cabinetColor,
  resolveCabinetMaterial,
} from './materials';
import {validMaterialDefinition} from './materialDefinition';
import {withWoodFinish, woodSheen} from './woodFinishes';
import {blankStudy, migrateStudy} from './CabinetConfigurator';
import {validStudy} from './savedRoomProtocol';
import {createMaterial, mapMaterialPart} from './materialRendering';
import {createPhotoSnapshot} from './photoRender';
import {resolveFabrication} from './fabrication/resolve';
import {DEFAULT_CONSTRUCTION} from './fabrication/profile';
import {detailedPhotoDefinition} from './photoTextures';

const woods = ['plain-white-oak', 'rift-white-oak', 'walnut', 'maple'] as const;
const expectedSpecies = [
  'white-oak-solid',
  'white-oak-veneer',
  'walnut',
  'hard-maple',
];
const assetRoot = join(
  process.cwd(),
  'public/studio/materials/rubio-oil-plus-2c',
);

describe('species-specific Rubio color previews', () => {
  it('bundles exactly sixteen traceable textures with the requested reference species', () => {
    const manifest = JSON.parse(
      readFileSync(join(assetRoot, 'provenance.json'), 'utf8'),
    ) as {
      entries: {
        material: string;
        finish: string;
        filename: string;
        sha256: string;
        bytes: number;
        resolution: number[];
        referenceSpecies: string;
        referenceUrl: string;
        color: string;
        detail: {filename: string; sha256: string; resolution: number[]};
      }[];
    };
    expect(Object.values(RUBIO_COLORS)).toEqual([
      'Chocolate',
      'Natural',
      'Pure',
      'White',
    ]);
    expect(manifest.entries).toHaveLength(16);
    for (const [i, wood] of woods.entries()) {
      const original = CABINET_MATERIAL_DEFINITIONS[wood];
      for (const color of Object.keys(
        RUBIO_COLORS,
      ) as (keyof typeof RUBIO_COLORS)[]) {
        const baked = withRubioColor(original, color);
        const record = manifest.entries.find(
          (e) => e.material === wood && e.finish === color,
        )!;
        const bytes = readFileSync(join(assetRoot, record.filename));
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(
          record.sha256,
        );
        expect(bytes.length).toBe(record.bytes);
        expect(record.resolution).toEqual([1024, 1024]);
        const detail = readFileSync(join(assetRoot, record.detail.filename));
        expect(createHash('sha256').update(detail).digest('hex')).toBe(
          record.detail.sha256,
        );
        expect(record.detail.resolution).toEqual([2048, 2048]);
        expect(record.referenceSpecies).toBe(expectedSpecies[i]);
        expect(record.referenceUrl).toContain(
          `_${expectedSpecies[i]}_${color}.jpg`,
        );
        expect(baked.textures!.albedo!.uri).toContain(record.filename);
        expect(validMaterialDefinition(baked)).toBe(true);
        expect(baked.id).toBe(wood);
        expect(baked.textureSize).toEqual(original.textureSize);
        expect(baked.textureGrainAxis).toBe(original.textureGrainAxis);
        for (const slot of ['normal', 'ao', 'roughness'] as const)
          expect(baked.textures![slot]).toEqual(original.textures![slot]);
        expect(baked.pbr.albedoTint).toBe('#ffffff');
        expect(cabinetColor({material: wood, materialDefinition: baked})).toBe(
          record.color,
        );
        expect(rubioColor(baked)).toBe(color);
      }
      expect(original.finish).toEqual({});
    }
    expect(hasRubioColors('cherry')).toBe(false);
    expect(hasRubioColors('paint-grade')).toBe(false);
    expect(
      withRubioColor(CABINET_MATERIAL_DEFINITIONS.cherry, 'white'),
    ).toEqual(CABINET_MATERIAL_DEFINITIONS.cherry);
  });

  it('keeps colors independent of sheen and preserves legacy definitions until explicitly changed', () => {
    const original = CABINET_MATERIAL_DEFINITIONS.walnut;
    const colored = withRubioColor(withWoodFinish(original, 'satin'), 'white');
    expect(woodSheen(colored)).toBe('satin');
    const matte = withWoodFinish(colored, 'matte');
    expect(rubioColor(matte)).toBe('white');
    expect(woodSheen(matte)).toBe('matte');
    expect(matte.textures).toEqual(colored.textures);
    const source = withWoodFinish(matte, 'source');
    expect(rubioColor(source)).toBe('white');
    expect(woodSheen(source)).toBe('source');
    const old = {
      ...original,
      finish: {},
      textures: undefined,
      textureSize: undefined,
    };
    expect(
      resolveCabinetMaterial({material: 'walnut', materialDefinition: old}),
    ).toEqual(old);
    expect(rubioColor(old)).toBe('');
    expect(validMaterialDefinition(withRubioColor(old, 'pure'))).toBe(true);
    expect(withRubioColor(old, 'pure').textureSize).toEqual(
      original.textureSize,
    );
  });

  it('retains palette finishes through save/share migration and fabrication exports', () => {
    const definition = withRubioColor(
      CABINET_MATERIAL_DEFINITIONS.walnut,
      'chocolate',
    );
    const study = blankStudy();
    study.room.useMapleInternals = true;
    study.elements = [
      {
        id: 'base',
        kind: 'base',
        material: 'walnut',
        materialDefinition: definition,
        width: 30,
        depth: 24,
        height: 34.5,
        face: 'shaker',
        placement: {mode: 'floor', x: 30, z: 30, rotation: 0},
      },
    ];
    const loaded = migrateStudy(JSON.parse(JSON.stringify(study)));
    expect(validStudy(loaded)).toBe(true);
    expect(loaded.materials![0].materialDefinition).toEqual(definition);
    expect(loaded.elements[0].materialDefinition).toEqual(definition);
    const manifest = resolveFabrication(
      loaded,
      {slug: 'a'.repeat(32), revision: 1, updatedAt: '2026-10-06T00:00:00Z'},
      DEFAULT_CONSTRUCTION,
    );
    expect(manifest.parts.some((p) => p.material === definition.label)).toBe(
      true,
    );
    expect(manifest.parts.some((p) => p.material === 'Maple plywood')).toBe(
      true,
    );
  });

  it('uses the same colored albedo and physical UV scale in immutable photo captures', () => {
    const load = vi
      .spyOn(THREE.TextureLoader.prototype, 'load')
      .mockImplementation((_url, callback) => {
        const texture = new THREE.Texture();
        callback?.(texture);
        return texture;
      });
    try {
      const definition = withRubioColor(
        CABINET_MATERIAL_DEFINITIONS['rift-white-oak'],
        'natural',
      );
      const material = createMaterial(definition, 0.7);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(30, 34.5, 0.75),
        material,
      );
      mapMaterialPart(
        mesh.geometry,
        material,
        {width: 30, height: 34.5, depth: 0.75},
        'in',
        'board',
        {grainAxis: 'y'},
      );
      const scene = new THREE.Scene();
      scene.add(mesh);
      const photo = createPhotoSnapshot(scene, new THREE.PerspectiveCamera());
      const front = photo.scene.children.find(
        (child) => child instanceof THREE.Mesh,
      ) as THREE.Mesh;
      expect(
        (front.material as THREE.Material).userData.materialDefinition,
      ).toEqual(definition);
      expect((front.material as THREE.MeshStandardMaterial).map).toBe(
        material.map,
      );
      // Capture bevels add vertices; the physical tile span must still match.
      const span = (geometry: THREE.BufferGeometry, axis: number) => {
        const uv = geometry.getAttribute('uv');
        const values = Array.from({length: uv.count}, (_, i) =>
          axis === 0 ? uv.getX(i) : uv.getY(i),
        );
        return Math.max(...values) - Math.min(...values);
      };
      for (const axis of [0, 1])
        expect(span(front.geometry, axis)).toBeCloseTo(
          span(mesh.geometry, axis),
          2,
        );
      expect(
        detailedPhotoDefinition(definition, 4096).textures!.albedo!.uri,
      ).toBe(definition.textures!.albedo!.uri.replace('.jpg', '-2k.jpg'));
      definition.finish.color = 'Changed later';
      expect(
        (front.material as THREE.Material).userData.materialDefinition.finish
          .color,
      ).toBe('Natural');
    } finally {
      load.mockRestore();
    }
  });
});
