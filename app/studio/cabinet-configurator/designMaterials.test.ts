import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {blankStudy, migrateStudy} from './CabinetConfigurator';
import {
  migrateDesignMaterials,
  syncDesignMaterials,
  removeDesignMaterial,
} from './designMaterials';
import {validStudy} from './savedRoomProtocol';
import {CABINET_MATERIAL_DEFINITIONS} from './materials';
import {
  createCabinetMaterial,
  mapMaterialPart,
  materialFromTemplate,
} from './materialRendering';
import {facePreviewGeometry} from './custom-unit/facePreview';
import {cabinetGeometry} from './roomGeometry';
import {applianceGeometry} from './applianceGeometry';
import {customUnitGeometry} from './custom-unit/geometry';
import {createCustomUnit} from './custom-unit/model';
import type {RoomElement} from './model';
const element = (
  id: string,
  material: RoomElement['material'] = 'walnut',
): RoomElement => ({
  id,
  kind: 'base',
  material,
  width: 30,
  height: 34.5,
  depth: 24,
  face: 'shaker',
  placement: {mode: 'floor', x: 30, z: 30, rotation: 0},
});
const mapping = {
  ...CABINET_MATERIAL_DEFINITIONS.walnut,
  textureSize: {width: 12, height: 48, unit: 'in' as const},
};

describe('design materials', () => {
  it('migrates equal finishes together while keeping paints and saved snapshots distinct', () => {
    const study = blankStudy();
    study.elements = [
      element('a'),
      element('b'),
      {...element('c', 'paint-grade'), paintColor: 'sage-green'},
      {...element('d', 'paint-grade'), paintColor: 'white'},
      {...element('e'), materialDefinition: mapping},
    ];
    const next = migrateStudy(JSON.parse(JSON.stringify(study)));
    expect(next.materials).toHaveLength(4);
    expect(next.elements[0].materialId).toBe(next.elements[1].materialId);
    expect(next.elements[4].materialDefinition).toEqual(mapping);
    expect(validStudy(next)).toBe(true);
  });
  it('updates all assigned objects, round trips grain, and safely reassigns removed materials', () => {
    const study = migrateDesignMaterials({
      ...blankStudy(),
      elements: [element('a'), element('b'), element('c', 'maple')],
    });
    study.materials![0].material = 'cherry';
    study.materials![0].flatGrain = 'horizontal';
    syncDesignMaterials(study);
    expect(
      study.elements.slice(0, 2).map((e) => [e.material, e.flatGrain]),
    ).toEqual([
      ['cherry', 'horizontal'],
      ['cherry', 'horizontal'],
    ]);
    const restored = migrateStudy(JSON.parse(JSON.stringify(study)));
    expect(restored.materials).toEqual(study.materials);
    removeDesignMaterial(
      restored,
      restored.materials![0].id,
      restored.materials![1].id,
    );
    expect(restored.elements.every((e) => e.material === 'maple')).toBe(true);
    expect(validStudy(restored)).toBe(true);
    removeDesignMaterial(
      restored,
      restored.materials![0].id,
      restored.materials![0].id,
    );
    expect(restored.materials).toHaveLength(1);
  });
  it('keeps new and copied objects inside the palette, including panel-ready appliances', () => {
    const study = migrateDesignMaterials({
      ...blankStudy(),
      elements: [element('a')],
    });
    study.materials![0].material = 'cherry';
    study.elements.push(
      {...element('b', 'maple'), materialId: 'another-design'},
      {
        ...element('dishwasher'),
        kind: 'appliance',
        applianceKind: 'dishwasher',
        applianceFront: 'slab',
      },
    );
    syncDesignMaterials(study, study.materials![0].id);
    expect(study.materials).toHaveLength(1);
    expect(
      study.elements.every(
        (e) =>
          e.material === 'cherry' && e.materialId === study.materials![0].id,
      ),
    ).toBe(true);
  });
  it('rejects duplicate ids, dangling assignments and malformed palette data', () => {
    const study = migrateDesignMaterials({
      ...blankStudy(),
      elements: [element('a')],
    });
    expect(validStudy(study)).toBe(true);
    expect(
      validStudy({
        ...study,
        materials: [study.materials![0], study.materials![0]],
      }),
    ).toBe(false);
    expect(
      validStudy({
        ...study,
        materials: [{...study.materials![0], flatGrain: 'diagonal'}],
      }),
    ).toBe(false);
    expect(validStudy({...study, materials: []})).toBe(false);
    expect(
      validStudy({
        ...study,
        elements: [{...study.elements[0], materialId: 'missing'}],
      }),
    ).toBe(false);
  });
});

function grainRange(
  geometry: THREE.BufferGeometry,
  fixed: boolean,
  axis: number,
) {
  const normal = geometry.getAttribute('normal'),
    grain = geometry.getAttribute('materialGrainAxis'),
    locked = geometry.getAttribute('materialFixedGrain'),
    uv = geometry.getAttribute('uv');
  const vertices = Array.from({length: uv.count}, (_, i) => i).filter(
    (i) =>
      normal.getZ(i) > 0.99 &&
      Boolean(locked.getX(i)) === fixed &&
      grain.getX(i) === axis,
  );
  return ['u', 'v'].map((_, channel) => {
    const values = vertices.map((i) => (channel ? uv.getY(i) : uv.getX(i)));
    return Math.max(...values) - Math.min(...values);
  });
}
describe('design grain intent', () => {
  it.each(['horizontal', 'vertical'] as const)(
    'changes flat %s panels while keeping shaker frames lengthwise',
    (flatGrain) => {
      const material = createCabinetMaterial(
        {material: 'walnut', materialDefinition: mapping, flatGrain},
        0.6,
      );
      const geometry = facePreviewGeometry(30, 40, 0.75, 'shaker', false);
      mapMaterialPart(
        geometry,
        material,
        {width: 30, height: 40, depth: 0.75},
        'in',
        'door',
        {grainAxis: 'z', rotation: 90},
      );
      const panel = grainRange(geometry, false, 1);
      expect(panel[0]).toBeCloseTo(
        flatGrain === 'horizontal' ? 36 / 12 : 26 / 12,
      );
      expect(panel[1]).toBeCloseTo(
        flatGrain === 'horizontal' ? 26 / 48 : 36 / 48,
      );
      expect(grainRange(geometry, true, 1)).toEqual(
        expect.arrayContaining([
          expect.closeTo(30 / 12),
          expect.closeTo(40 / 48),
        ]),
      );
      // The pair of rails spans the panel height, with V running along X.
      expect(grainRange(geometry, true, 0)[1]).toBeCloseTo(26 / 48);
      expect(materialFromTemplate(material).userData.flatGrain).toBe(flatGrain);
    },
  );
  it('keeps separate rails and stiles lengthwise even with a conflicting part override', () => {
    const material = createCabinetMaterial(
      {material: 'walnut', materialDefinition: mapping, flatGrain: 'vertical'},
      0.6,
    );
    for (const [role, axis] of [
      ['rail', 'x'],
      ['stile', 'y'],
    ] as const) {
      const geometry = new THREE.BoxGeometry(20, 2, 0.75);
      mapMaterialPart(
        geometry,
        material,
        {width: 20, height: 2, depth: 0.75},
        'in',
        role,
        {grainAxis: 'z', rotation: 90},
      );
      expect(geometry.userData.materialApplication).toMatchObject({
        grainAxis: axis,
        rotation: 0,
      });
    }
  });
  it('uses the intent in standard cabinets, custom cabinets, shelves and appliance panels', () => {
    const item = {
      ...element('a'),
      materialDefinition: mapping,
      flatGrain: 'horizontal' as const,
    };
    const cabinet = cabinetGeometry(item, false);
    const front = cabinet.getObjectByName('cabinet-front') as THREE.Mesh;
    expect(front.geometry.userData.materialApplication.grainAxis).toBe('x');
    const appliance = applianceGeometry(
      'dishwasher',
      0.76,
      0.87,
      0.6,
      'shaker',
      false,
      undefined,
      false,
      item,
    );
    const panel = appliance.getObjectByName('appliance-panel') as THREE.Mesh;
    expect(panel.geometry.userData.materialApplication.grainAxis).toBe('x');
    const custom = customUnitGeometry(
      createCustomUnit({
        root: {id: 'door', type: 'section', sectionType: 'doors'},
      }),
      {},
      {...item, material: 'walnut'},
    );
    const applications: string[] = [];
    custom.traverse((part) => {
      if (
        part instanceof THREE.Mesh &&
        part.geometry.userData.materialApplication?.role === 'door'
      )
        applications.push(part.geometry.userData.materialApplication.grainAxis);
    });
    expect(applications.length).toBeGreaterThan(0);
    expect(applications.every((a) => a === 'x')).toBe(true);
    const shelf = new THREE.BoxGeometry(30, 0.75, 24);
    mapMaterialPart(
      shelf,
      createCabinetMaterial({...item, flatGrain: 'vertical'}, 0.6),
      {width: 30, height: 0.75, depth: 24},
      'in',
      'shelf',
    );
    expect(shelf.userData.materialApplication.grainAxis).toBe('z');
  });
});
