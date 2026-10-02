import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {
  CABINET_MATERIAL_DEFINITIONS,
  resolveCabinetMaterial,
} from './materials';
import {
  validMaterialDefinition,
  type MaterialDefinition,
} from './materialDefinition';
import {
  createMaterial,
  createCabinetMaterial,
  mapMaterialPart,
  resolvePartApplication,
} from './materialRendering';
import {cabinetGeometry} from './roomGeometry';
import {applianceGeometry} from './applianceGeometry';
import {blankStudy, migrateStudy} from './CabinetConfigurator';
import {validStudy} from './savedRoomProtocol';
import type {RoomElement} from './model';
import {
  createCustomUnit,
  deserializeCustomUnit,
  serializeCustomUnit,
  validateCustomUnit,
} from './custom-unit/model';
import {customUnitGeometry} from './custom-unit/geometry';
import {facePreviewGeometry} from './custom-unit/facePreview';

const walnut = CABINET_MATERIAL_DEFINITIONS.walnut;
// A synthetic mapping fixture, not a claim about real walnut grain or finishes.
const mapping: MaterialDefinition = {
  ...walnut,
  textureSize: {width: 12, height: 48, unit: 'in'},
};
const item: RoomElement = {
  id: 'cabinet',
  kind: 'base',
  width: 30,
  height: 34.5,
  depth: 24,
  material: 'walnut',
  face: 'shaker',
  placement: {mode: 'floor', x: 30, z: 30, rotation: 0},
};

function faceRange(
  geometry: THREE.BufferGeometry,
  normalAxis: 'x' | 'y' | 'z',
  grainAxis?: number,
) {
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const grain = geometry.getAttribute('materialGrainAxis');
  const us: number[] = [],
    vs: number[] = [];
  for (let i = 0; i < uv.count; i++) {
    const n =
      normalAxis === 'x'
        ? normal.getX(i)
        : normalAxis === 'y'
          ? normal.getY(i)
          : normal.getZ(i);
    if (n > 0.99 && (grainAxis === undefined || grain.getX(i) === grainAxis)) {
      us.push(uv.getX(i));
      vs.push(uv.getY(i));
    }
  }
  return {
    u: Math.max(...us) - Math.min(...us),
    v: Math.max(...vs) - Math.min(...vs),
  };
}

describe('serializable material foundation', () => {
  it('round trips versioned specifications and per-part application through saved designs', () => {
    const definition: MaterialDefinition = {
      ...mapping,
      textures: {
        albedo: {
          uri: '/test-fixtures/not-a-production-texture.png',
          provenance: {
            source: 'Synthetic test fixture only',
            license: 'Test-only',
          },
        },
      },
      finish: {system: 'Explicit test system', color: 'Explicit test color'},
      pbr: {
        ...mapping.pbr,
        roughness: 0.4,
        metalness: 0,
        ior: 1.4,
        specularIntensity: 0.5,
      },
    };
    const unit = createCustomUnit({
      parts: [
        {
          id: 'end',
          kind: 'panel',
          x: 0,
          y: 0,
          z: 0,
          width: 0.75,
          height: 30,
          depth: 24,
          materialApplication: {
            grainAxis: 'z',
            rotation: 180,
            offset: {u: 25, v: 50, unit: 'mm'},
          },
        },
      ],
    });
    const study = {
      ...blankStudy(),
      elements: [
        {
          ...item,
          materialDefinition: definition,
          customCabinet: {
            libraryId: 'test-unit',
            libraryVersion: 1,
            definition: unit,
          },
        },
      ],
    };
    expect(validMaterialDefinition(definition)).toBe(true);
    expect(validStudy(study)).toBe(true);
    const loaded = migrateStudy(JSON.parse(JSON.stringify(study)));
    expect(loaded.elements[0].materialDefinition).toEqual(definition);
    expect(loaded.elements[0].customCabinet?.definition.parts).toEqual(
      unit.parts,
    );
    expect(deserializeCustomUnit(serializeCustomUnit(unit))).toEqual(unit);
  });

  it('defaults legacy designs without rewriting their geometry or material selections', () => {
    const saved = {...blankStudy(), elements: [item]};
    const before = JSON.stringify(saved);
    const loaded = migrateStudy(JSON.parse(before));
    expect(validStudy(loaded)).toBe(true);
    expect(loaded.elements[0].material).toBe('walnut');
    expect(loaded.elements[0].materialDefinition).toBeUndefined();
    expect(resolveCabinetMaterial(loaded.elements[0])).toEqual(walnut);
    expect(JSON.stringify(saved)).toBe(before);
    const mat = createCabinetMaterial(loaded.elements[0], 0.6);
    expect(mat.color.getHexString()).toBe('72513d');
    expect(mat.roughness).toBe(0.6);
    expect(mat.metalness).toBe(0);
    expect(mat.map).toBeNull();
    const panel = createCabinetMaterial({}, 0.65);
    expect(panel.roughness).toBe(0.65);
    expect(panel.color.getHexString()).toBe('c4aa80');
  });

  it('rejects unknown versions, unsafe/missing texture definitions and invalid numeric values', () => {
    for (const invalid of [
      {...mapping, version: 2},
      {...mapping, textureSize: {...mapping.textureSize, width: 0}},
      {...mapping, textureSize: {...mapping.textureSize, unit: 'feet'}},
      {...mapping, pbr: {...mapping.pbr, roughness: NaN}},
      {...mapping, pbr: {...mapping.pbr, ior: 5}},
      {...mapping, textures: {albedo: {uri: 'javascript:alert(1)'}}},
      {
        ...mapping,
        textureSize: undefined,
        textures: {
          albedo: {
            uri: '/wood.png',
            provenance: {source: 'Fixture', license: 'Test-only'},
          },
        },
      },
    ])
      expect(validMaterialDefinition(invalid)).toBe(false);
    expect(
      validStudy({
        ...blankStudy(),
        elements: [{...item, materialDefinition: {...walnut, version: 2}}],
      }),
    ).toBe(false);
    const unit = createCustomUnit({
      parts: [
        {
          id: 'end',
          kind: 'panel',
          x: 0,
          y: 0,
          z: 0,
          width: 0.75,
          height: 30,
          depth: 24,
          materialApplication: {rotation: 45 as 90},
        },
      ],
    });
    expect(validateCustomUnit(unit)).toContain(
      'Invalid part material application',
    );
  });
});

describe('physical mapping', () => {
  it.each([
    ['door', 18, 30, 0.75, 'z', 1.5, 30 / 48, 'y'],
    ['drawer', 18, 6, 0.75, 'z', 6 / 12, 18 / 48, 'x'],
    ['stile', 2, 30, 0.75, 'z', 2 / 12, 30 / 48, 'y'],
    ['rail', 18, 2, 0.75, 'z', 2 / 12, 18 / 48, 'x'],
    ['shelf', 24, 0.75, 12, 'y', 1, 24 / 48, 'x'],
    ['end', 0.75, 30, 24, 'x', 2, 30 / 48, 'y'],
    ['drawer-side', 0.5, 6, 20, 'x', 6 / 12, 20 / 48, 'z'],
  ] as const)(
    'maps %s in physical units without changing positions',
    (role, width, height, depth, face, u, v, grainAxis) => {
      const geometry = new THREE.BoxGeometry(width, height, depth);
      const positions = Array.from(geometry.getAttribute('position').array);
      const material = createMaterial(mapping, 0.6);
      const dimensions = {width, height, depth};
      mapMaterialPart(geometry, material, dimensions, 'in', role);
      const first = Array.from(geometry.getAttribute('uv').array);
      expect(faceRange(geometry, face).u).toBeCloseTo(u);
      expect(faceRange(geometry, face).v).toBeCloseTo(v);
      expect(geometry.userData.materialApplication.grainAxis).toBe(grainAxis);
      mapMaterialPart(geometry, material, dimensions, 'in', role);
      expect(Array.from(geometry.getAttribute('uv').array)).toEqual(first);
      expect(Array.from(geometry.getAttribute('position').array)).toEqual(
        positions,
      );
      const metric = new THREE.BoxGeometry(
        width * 0.0254,
        height * 0.0254,
        depth * 0.0254,
      );
      mapMaterialPart(metric, material, dimensions, 'm', role);
      Array.from(metric.getAttribute('uv').array).forEach((value, i) =>
        expect(value).toBeCloseTo(first[i]),
      );
    },
  );

  it('maps merged shaker rails horizontally and stiles vertically', () => {
    const geometry = facePreviewGeometry(18, 30, 0.75, 'shaker', false);
    mapMaterialPart(
      geometry,
      createMaterial(mapping, 1),
      {width: 18, height: 30, depth: 0.75},
      'in',
      'door',
    );
    const normal = geometry.getAttribute('normal'),
      uv = geometry.getAttribute('uv'),
      grain = geometry.getAttribute('materialGrainAxis'),
      p = geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      if (normal.getZ(i) < 0.99) continue;
      if (grain.getX(i) === 0) {
        expect(uv.getX(i)).toBeCloseTo(p.getY(i) / 12);
        expect(uv.getY(i)).toBeCloseTo(p.getX(i) / 48);
      } else {
        expect(uv.getX(i)).toBeCloseTo(p.getX(i) / 12);
        expect(uv.getY(i)).toBeCloseTo(p.getY(i) / 48);
      }
    }
  });

  it('uses serialized grain, rotation and physical offset overrides', () => {
    const geometry = new THREE.BoxGeometry(18, 30, 0.75);
    mapMaterialPart(
      geometry,
      createMaterial(mapping, 1),
      {width: 18, height: 30, depth: 0.75},
      'in',
      'door',
      {grainAxis: 'x', rotation: 90, offset: {u: 12, v: 48, unit: 'in'}},
    );
    const range = faceRange(geometry, 'z');
    expect(range.u).toBeCloseTo(18 / 12);
    expect(range.v).toBeCloseTo(30 / 48);
    expect(
      resolvePartApplication('shelf', {width: 24, height: 0.75, depth: 12})
        .grainAxis,
    ).toBe('x');
  });

  it('wires selected wood through standard, custom, and appliance parts without changing geometry', () => {
    const original = cabinetGeometry(item, false);
    const rich = cabinetGeometry({...item, materialDefinition: mapping}, false);
    const before: THREE.Mesh[] = [],
      after: THREE.Mesh[] = [];
    original.traverse((o) => {
      if (o instanceof THREE.Mesh) before.push(o);
    });
    rich.traverse((o) => {
      if (o instanceof THREE.Mesh) after.push(o);
    });
    expect(after).toHaveLength(before.length);
    after.forEach((mesh, i) => {
      expect(Array.from(mesh.geometry.getAttribute('position').array)).toEqual(
        Array.from(before[i].geometry.getAttribute('position').array),
      );
      expect(mesh.position.toArray()).toEqual(before[i].position.toArray());
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (material.userData.materialDefinition)
        expect(material.userData.materialDefinition.id).toBe('walnut');
    });
    const unit = createCustomUnit({
      root: {id: 'door', type: 'section', sectionType: 'doors'},
    });
    const body = customUnitGeometry(
      unit,
      {},
      {...item, material: 'walnut', materialDefinition: mapping},
    );
    const front = body.getObjectByName('custom-unit-door') as THREE.Mesh;
    expect(
      (front.material as THREE.Material).userData.materialDefinition,
    ).toEqual(mapping);
    expect(front.geometry.userData.materialApplication.role).toBe('door');
    const appliance = applianceGeometry(
      'dishwasher',
      0.6,
      0.9,
      0.6,
      'shaker',
      false,
      undefined,
      false,
      {...item, materialDefinition: mapping},
    );
    const panel = appliance.getObjectByName('appliance-panel') as THREE.Mesh;
    expect(
      (panel.material as THREE.Material).userData.materialDefinition,
    ).toEqual(mapping);
    expect(panel.geometry.userData.materialApplication.grainAxis).toBe('y');
  });
});

describe('Three.js texture and PBR ownership', () => {
  it('uses explicit IOR/specular only when supplied and leaves displacement disabled', () => {
    const material = createMaterial(
      {...walnut, pbr: {...walnut.pbr, ior: 1.4, specularIntensity: 0.5}},
      0.6,
    ) as THREE.MeshPhysicalMaterial;
    expect(material.ior).toBe(1.4);
    expect(material.specularIntensity).toBe(0.5);
    expect(material.displacementMap).toBeNull();
    expect(createMaterial(walnut, 0.6)).not.toBeInstanceOf(
      THREE.MeshPhysicalMaterial,
    );
  });

  it('keeps slot color spaces, repeat state and disposal isolated from shared texture sources', () => {
    const source = new THREE.DataTexture(
      new Uint8Array([128, 128, 255, 255]),
      1,
      1,
    );
    source.repeat.set(2, 3);
    source.offset.set(0.25, 0.5);
    const asset = {
      uri: '/synthetic-fixture.png',
      provenance: {source: 'Synthetic test fixture only', license: 'Test-only'},
    };
    const definition: MaterialDefinition = {
      ...mapping,
      textures: {albedo: asset, normal: asset, roughness: asset, ao: asset},
    };
    const a = createMaterial(definition, 0.6, () => source),
      b = createMaterial(definition, 0.65, () => source);
    expect(a.map).not.toBe(b.map);
    expect(a.map).not.toBe(source);
    expect(a.map?.colorSpace).toBe(THREE.SRGBColorSpace);
    for (const map of [a.normalMap, a.roughnessMap, a.aoMap]) {
      expect(map?.colorSpace).toBe(THREE.NoColorSpace);
      expect(map?.channel).toBe(0);
    }
    expect(source.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(source.colorSpace).toBe(THREE.NoColorSpace);
    expect(source.repeat.toArray()).toEqual([2, 3]);
    expect(source.offset.toArray()).toEqual([0.25, 0.5]);
    expect(a.map?.offset.toArray()).toEqual([0, 0]);
    const disposeA = vi.fn(),
      disposeB = vi.fn(),
      disposeSource = vi.fn();
    a.map!.addEventListener('dispose', disposeA);
    b.map!.addEventListener('dispose', disposeB);
    source.addEventListener('dispose', disposeSource);
    mapMaterialPart(
      new THREE.BoxGeometry(18, 30, 0.75),
      a,
      {width: 18, height: 30, depth: 0.75},
      'in',
      'door',
    );
    mapMaterialPart(
      new THREE.BoxGeometry(24, 0.75, 12),
      b,
      {width: 24, height: 0.75, depth: 12},
      'in',
      'shelf',
    );
    expect(a.map?.repeat.toArray()).toEqual([1, 1]);
    expect(b.map?.repeat.toArray()).toEqual([1, 1]);
    a.dispose();
    expect(disposeA).toHaveBeenCalledOnce();
    expect(disposeB).not.toHaveBeenCalled();
    expect(disposeSource).not.toHaveBeenCalled();
    b.dispose();
    expect(disposeB).toHaveBeenCalledOnce();
  });
});
