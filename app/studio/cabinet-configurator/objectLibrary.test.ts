import {describe, expect, it} from 'vitest';
import {cabinetTypes} from './cabinetTypes';
import {createAppliance, APPLIANCE_CATALOG, type Room} from './model';
import {createFixture, FIXTURE_CATALOG, type FixtureKind} from './fixtures';
import {SINK_CATALOG} from './sinkAttachments';
import {
  CABINITRON_CORE,
  CORE_OBJECTS,
  CORE_OBJECT_ASSETS,
  coreObjectById,
  coreObjectForElement,
  coreObjectForOpening,
} from './coreObjectLibrary';
import {
  objectDefinitionErrors,
  visibleLibraryObjects,
  type CanonicalObjectAsset,
  type ObjectDefinition,
  type ObjectLibrary,
} from './objectLibrary';

const room: Room = {
  width: 144,
  depth: 120,
  height: 108,
  floor: 'oak',
  walls: 'white',
};

describe('Cabinitron Core', () => {
  it('registers every existing catalog variant once with separately resolvable assets', () => {
    expect(CORE_OBJECTS).toHaveLength(47);
    expect(new Set(CORE_OBJECTS.map((object) => object.id)).size).toBe(
      CORE_OBJECTS.length,
    );
    expect(new Set(CORE_OBJECT_ASSETS.map((asset) => asset.id)).size).toBe(
      CORE_OBJECTS.length,
    );
    for (const object of CORE_OBJECTS) {
      const asset = CORE_OBJECT_ASSETS.find(
        (entry) => entry.id === object.proceduralAssetId,
      )!;
      expect(objectDefinitionErrors(object, CABINITRON_CORE, asset)).toEqual(
        [],
      );
      expect(object.canonicalAssetId).toBeNull();
      expect(Object.keys(object.dimensions).sort()).toEqual([
        'depth',
        'height',
        'width',
      ]);
    }
    expect(JSON.parse(JSON.stringify(CORE_OBJECTS))).toEqual(CORE_OBJECTS);
  });

  it('resolves standard cabinets and all open storage without changing templates or placement', () => {
    for (const {id, item} of cabinetTypes()) {
      const before = structuredClone(item);
      const object = coreObjectForElement(item)!;
      expect(object.id).toBe(`core:cabinet:${id}`);
      expect(object.dimensions).toEqual({
        width: item.width,
        depth: item.depth,
        height: item.height,
      });
      expect(item).toEqual(before);
    }
    const item = cabinetTypes()[0].item;
    expect(
      coreObjectForElement({...item, configuration: 'three-drawer'})?.id,
    ).toBe('core:cabinet:base:three-drawer');
    expect(
      coreObjectForElement({
        ...item,
        customCabinet: {
          libraryId: 'business-cabinet',
          libraryVersion: 1,
          definition: {} as never,
        },
      }),
    ).toBeUndefined();
  });

  it('keeps appliance elevations and fixture mounting behavior intact', () => {
    for (const kind of Object.keys(
      APPLIANCE_CATALOG,
    ) as (keyof typeof APPLIANCE_CATALOG)[]) {
      const item = createAppliance(kind, kind);
      expect(coreObjectForElement(item)?.dimensions).toEqual({
        width: item.width,
        depth: item.depth,
        height: item.height,
      });
      expect(item.placement).toEqual({
        mode: 'wall',
        wall: 'back',
        offset: 6,
        elevation: APPLIANCE_CATALOG[kind].elevation,
      });
    }
    for (const kind of Object.keys(FIXTURE_CATALOG) as FixtureKind[]) {
      const item = createFixture(kind, kind, room);
      const object = coreObjectForElement(item)!;
      expect(object.id).toBe(`core:fixture:${kind}`);
      expect(item.height).toBe(
        kind === 'glass-shower' ? 108 : object.dimensions.height,
      );
      expect(item.placement).toEqual(
        kind === 'mirror'
          ? {mode: 'wall', wall: 'back', offset: 0, elevation: 42}
          : {mode: 'floor', x: 72, z: 60, rotation: 0},
      );
    }
    for (const [kind, {label, ...dimensions}] of Object.entries(SINK_CATALOG)) {
      expect(coreObjectById(`core:sink:${kind}`)).toMatchObject({
        name: label,
        dimensions,
      });
    }
    expect(
      coreObjectForOpening({
        id: 'legacy-door',
        kind: 'door',
        wall: 'back',
        offset: 12,
        width: 30,
        height: 80,
      })?.id,
    ).toBe('core:opening:swing');
  });
});

describe('business-owned objects', () => {
  const library: ObjectLibrary = {
    id: 'business-a-library',
    name: 'Our collection',
    scope: 'tenant',
    tenantId: 'business-a',
    visibility: 'private',
  };
  const asset: CanonicalObjectAsset = {
    id: 'business-a-model',
    tenantId: 'business-a',
    format: 'glb',
    units: 'meters',
    url: '/private-assets/model.glb',
  };
  const object: ObjectDefinition = {
    ...CORE_OBJECTS[0],
    id: 'our-model',
    libraryId: library.id,
    tenantId: library.tenantId,
    name: 'Our model',
    source: 'Business upload',
    sourceFormat: 'step',
    canonicalAssetId: asset.id,
    proceduralAssetId: null,
    visibility: 'private',
  };

  it('allows arbitrary categories and source formats with a canonical GLB', () => {
    expect(
      objectDefinitionErrors(
        {...object, category: 'custom-lighting'},
        library,
        asset,
      ),
    ).toEqual([]);
    expect(
      objectDefinitionErrors(
        {...object, canonicalAssetId: null},
        library,
        asset,
      ),
    ).toContain('Imported objects require a canonical GLB asset.');
    expect(
      objectDefinitionErrors(
        {...object, dimensions: {...object.dimensions, width: NaN}},
        library,
        asset,
      ),
    ).toContain('Dimensions must be positive finite inches.');
    expect(
      objectDefinitionErrors(object, library, {
        ...asset,
        tenantId: 'business-b',
      }),
    ).toContain('Object, library and asset ownership must match.');
    expect(
      objectDefinitionErrors(
        {
          ...object,
          sourceFormat: 'procedural',
          canonicalAssetId: null,
          proceduralAssetId: CORE_OBJECT_ASSETS[0].id,
        },
        library,
        CORE_OBJECT_ASSETS[0],
      ),
    ).toContain('Procedural assets are reserved for Cabinitron Core.');
  });

  it('selects only enabled libraries for the current owner and rejects foreign public objects', () => {
    const libraries = [CABINITRON_CORE, library];
    const objects = [...CORE_OBJECTS, object];
    const enabled = libraries.map((entry) => entry.id);
    expect(
      visibleLibraryObjects(libraries, objects, 'business-a', enabled),
    ).toEqual(objects);
    expect(
      visibleLibraryObjects(libraries, objects, 'business-b', enabled),
    ).toEqual(CORE_OBJECTS);
    expect(
      visibleLibraryObjects(
        libraries,
        [...CORE_OBJECTS, {...object, visibility: 'public'}],
        null,
        enabled,
      ),
    ).toEqual(CORE_OBJECTS);
    expect(
      visibleLibraryObjects(
        libraries,
        [{...object, tenantId: 'business-b'}],
        'business-a',
        enabled,
      ),
    ).toEqual([]);
    expect(
      visibleLibraryObjects(libraries, objects, 'business-a', [library.id]),
    ).toEqual([object]);
    expect(visibleLibraryObjects(libraries, objects, 'business-a', [])).toEqual(
      [],
    );
  });
});
