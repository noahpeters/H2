import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {
  CABINET_MATERIAL_DEFINITIONS,
  CABINET_MATERIALS,
  resolveCabinetMaterial,
  materialPreviewNote,
} from './materials';
import {validMaterialDefinition} from './materialDefinition';
import {
  createMaterial,
  createCabinetMaterial,
  mapMaterialPart,
  waitForMaterialTextures,
  type PartRole,
} from './materialRendering';
import {blankStudy, migrateStudy} from './CabinetConfigurator';
import {validStudy} from './savedRoomProtocol';

const materials = [
  ['walnut', 'natural-walnut-veneer'],
  ['cherry', 'cherry-veneer'],
  ['maple', 'white-maple-veneer'],
] as const;

describe.each(materials)('%s production textures', (id, folder) => {
  const definition = CABINET_MATERIAL_DEFINITIONS[id];
  it('bundles provenance-matched maps and round trips the source orientation without rewriting legacy snapshots', () => {
    const root = join(process.cwd(), 'public/studio/materials', folder);
    const manifest = JSON.parse(
      readFileSync(join(root, 'provenance.json'), 'utf8'),
    ) as {
      license: string;
      physicalSize: typeof definition.textureSize;
      sourceGrainAxis: string;
      files: {filename: string; bytes: number; sha256: string}[];
    };
    expect(manifest.license).toBe('CC0-1.0');
    expect(manifest.physicalSize).toEqual(definition.textureSize);
    expect(manifest.sourceGrainAxis).toBe(definition.textureGrainAxis);
    for (const file of manifest.files) {
      const data = readFileSync(join(root, file.filename));
      expect(data.length).toBe(file.bytes);
      expect(createHash('sha256').update(data).digest('hex')).toBe(file.sha256);
    }
    expect(
      Object.values(definition.textures!)
        .map((asset) => asset.uri.split('/').pop())
        .sort(),
    ).toEqual(manifest.files.map((file) => file.filename).sort());
    expect(validMaterialDefinition(definition)).toBe(true);
    const study = blankStudy();
    study.elements = [
      {
        id: 'wood',
        kind: 'base',
        width: 30,
        height: 34.5,
        depth: 24,
        face: 'shaker',
        material: id,
        materialDefinition: definition,
        placement: {mode: 'floor', x: 30, z: 30, rotation: 0},
      },
    ];
    const loaded = migrateStudy(JSON.parse(JSON.stringify(study)));
    expect(validStudy(loaded)).toBe(true);
    expect(resolveCabinetMaterial(loaded.elements[0])).toEqual(definition);
    const legacy = {
      ...definition,
      textures: undefined,
      textureSize: undefined,
      textureGrainAxis: undefined,
      pbr: {color: CABINET_MATERIALS[id].color},
    };
    expect(
      resolveCabinetMaterial({material: id, materialDefinition: legacy}),
    ).toEqual(legacy);
    const material = createMaterial(legacy, 0.65);
    expect(material.map).toBeNull();
    expect(material.roughness).toBe(0.65);
    expect(material.color.getHexString()).toBe(
      CABINET_MATERIALS[id].color.slice(1),
    );
    material.dispose();
  });

  it('maps horizontal source grain onto vertical doors/ends and horizontal rails/drawers at real scale', () => {
    const source = new THREE.Texture();
    const material = createMaterial(definition, 0.6, () => source);
    const parts: [
      PartRole,
      number,
      number,
      number,
      'x' | 'y' | 'z',
      'x' | 'y' | 'z',
    ][] = [
      ['door', 18, 30, 0.75, 'z', 'y'],
      ['stile', 2, 30, 0.75, 'z', 'y'],
      ['drawer', 18, 6, 0.75, 'z', 'x'],
      ['rail', 18, 2, 0.75, 'z', 'x'],
      ['shelf', 24, 0.75, 12, 'y', 'x'],
      ['end', 0.75, 30, 24, 'x', 'y'],
      ['drawer-side', 0.5, 6, 20, 'x', 'z'],
    ];
    try {
      for (const [role, width, height, depth, face, along] of parts) {
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const positions = Array.from(geometry.getAttribute('position').array);
        mapMaterialPart(geometry, material, {width, height, depth}, 'in', role);
        const p = geometry.getAttribute('position'),
          n = geometry.getAttribute('normal'),
          uv = geometry.getAttribute('uv');
        for (let i = 0; i < p.count; i++) {
          const normal =
            face === 'x' ? n.getX(i) : face === 'y' ? n.getY(i) : n.getZ(i);
          if (normal < 0.99) continue;
          const position =
            along === 'x' ? p.getX(i) : along === 'y' ? p.getY(i) : p.getZ(i);
          // Source U follows grain; the 1 m footprint means metres / 1.
          expect(uv.getX(i)).toBeCloseTo(position * 0.0254);
        }
        expect(Array.from(geometry.getAttribute('position').array)).toEqual(
          positions,
        );
        const first = Array.from(uv.array);
        mapMaterialPart(geometry, material, {width, height, depth}, 'in', role);
        expect(Array.from(geometry.getAttribute('uv').array)).toEqual(first);
        geometry.dispose();
      }
      expect(material.map!.repeat.toArray()).toEqual([1, 1]);
      expect(material.map!.rotation).toBe(0);
      expect(source.wrapS).toBe(THREE.ClampToEdgeWrapping);
      expect(material.displacementMap).toBeNull();
    } finally {
      material.dispose();
      source.dispose();
    }
  });

  it('loads all slots through the live factory and falls back to the historical color on failure', async () => {
    const failed: (() => void)[] = [];
    const loader = vi
      .spyOn(THREE.TextureLoader.prototype, 'load')
      .mockImplementation((_url, _ok, _progress, onError) => {
        failed.push(() => onError?.(new Error('test missing asset')));
        return new THREE.Texture();
      });
    const material = createCabinetMaterial({material: id}, 0.6);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    try {
      expect(failed).toHaveLength(4);
      expect(material.map!.colorSpace).toBe(THREE.SRGBColorSpace);
      for (const map of [
        material.normalMap,
        material.roughnessMap,
        material.aoMap,
      ])
        expect(map!.colorSpace).toBe(THREE.NoColorSpace);
      expect(material.color.getHexString()).toBe('ffffff');
      failed.forEach((fail) => fail());
      await waitForMaterialTextures(mesh);
      expect(material.map).toBeNull();
      expect(material.color.getHexString()).toBe(
        CABINET_MATERIALS[id].color.slice(1),
      );
      expect(material.userData.textureErrors).toHaveLength(4);
    } finally {
      material.dispose();
      mesh.geometry.dispose();
      loader.mockRestore();
    }
  });
});

it('keeps non-square physical dimensions correct when source grain is U and defaults older definitions to V', () => {
  const base = CABINET_MATERIAL_DEFINITIONS.maple;
  const definition = {
    ...base,
    textureSize: {width: 250, height: 1000, unit: 'mm' as const},
  };
  const material = createMaterial(definition, 0.6, () => new THREE.Texture());
  const geometry = new THREE.BoxGeometry(18, 30, 0.75);
  try {
    mapMaterialPart(
      geometry,
      material,
      {width: 18, height: 30, depth: 0.75},
      'in',
      'door',
    );
    const p = geometry.getAttribute('position'),
      n = geometry.getAttribute('normal'),
      uv = geometry.getAttribute('uv');
    for (let i = 0; i < p.count; i++)
      if (n.getZ(i) > 0.99) {
        expect(uv.getX(i)).toBeCloseTo((p.getY(i) * 0.0254) / 1);
        expect(uv.getY(i)).toBeCloseTo((p.getX(i) * 0.0254) / 0.25);
      }
    const old = createMaterial(
      {...definition, textureGrainAxis: undefined},
      0.6,
      () => new THREE.Texture(),
    );
    mapMaterialPart(
      geometry,
      old,
      {width: 18, height: 30, depth: 0.75},
      'in',
      'door',
    );
    const oldUV = geometry.getAttribute('uv');
    for (let i = 0; i < p.count; i++)
      if (n.getZ(i) > 0.99) {
        expect(oldUV.getX(i)).toBeCloseTo((p.getX(i) * 0.0254) / 0.25);
        expect(oldUV.getY(i)).toBeCloseTo((p.getY(i) * 0.0254) / 1);
      }
    old.dispose();
    expect(
      validMaterialDefinition({...definition, textureGrainAxis: 'x'}),
    ).toBe(false);
  } finally {
    geometry.dispose();
    material.dispose();
  }
});

it('reports the rift-sawn asset gap without substituting an unspecified cut or inventing a finish', () => {
  expect(
    CABINET_MATERIAL_DEFINITIONS['rift-white-oak'].textures,
  ).toBeUndefined();
  expect(materialPreviewNote({material: 'rift-white-oak'})).toContain(
    'Color-only',
  );
  for (const [id] of materials)
    expect(CABINET_MATERIAL_DEFINITIONS[id].finish).toEqual({});
  const explicit = {
    ...CABINET_MATERIAL_DEFINITIONS['plain-white-oak'],
    id: 'rift-white-oak',
  };
  expect(
    materialPreviewNote({
      material: 'rift-white-oak',
      materialDefinition: explicit,
    }),
  ).toBe(explicit.textures!.albedo!.provenance.notes);
});
