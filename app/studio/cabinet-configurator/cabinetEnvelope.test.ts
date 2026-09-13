import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {cabinetToeKick, cabinetCompositionEnvelope} from './cabinetEnvelope';
import {cabinetGeometry} from './roomGeometry';
import {
  configurationTemplate,
  saveConfiguration,
  applyConfiguration,
} from './custom-unit/designConfigurations';
import {blankStudy, migrateStudy} from './CabinetConfigurator';
import {validStudy} from './savedRoomProtocol';
import {createOpenStorage, storageLayout} from './openStorage';
import {positionElement} from './placement';
import {
  applyCreationPreferences,
  emptyCreationPreferences,
} from './creationPreferences';
import type {RoomElement} from './model';
const base: RoomElement = {
  id: 'base',
  kind: 'base',
  configuration: 'three-drawer',
  width: 36,
  height: 34.5,
  depth: 24,
  face: 'slab',
  placement: {mode: 'floor', x: 60, z: 60, rotation: 0},
};
const bounds = (object: THREE.Object3D) =>
  new THREE.Box3().setFromObject(object);
const inch = 0.0254;

describe('room-owned base toe kicks', () => {
  it('reserves support below the composition and includes it on standard and custom bases', () => {
    expect(cabinetCompositionEnvelope(base)).toEqual({
      width: 36,
      height: 30.5,
      depth: 24,
    });
    const template = configurationTemplate(base);
    expect(template.height).toBe(30.5);
    const saved = saveConfiguration([], base, template);
    const global = {
      ...base,
      customCabinet: {
        libraryId: 'global-base',
        libraryVersion: 1,
        definition: {...template, height: base.height},
      },
    };
    for (const item of [base, saved.item, global]) {
      const geometry = cabinetGeometry(item, false);
      const toe = geometry.getObjectByName('room-toe-kick')!;
      expect(toe).toBeDefined();
      expect(bounds(toe).getSize(new THREE.Vector3()).y / inch).toBeCloseTo(4);
      expect(bounds(toe).min.y / inch).toBeCloseTo(-base.height / 2);
      expect(bounds(toe).max.z / inch).toBeCloseTo(base.depth / 2 - 3);
    }
    const geometry = cabinetGeometry(saved.item, false);
    const body = bounds(geometry.getObjectByName('custom-cabinet-body')!);
    expect(body.min.y / inch).toBeCloseTo(-base.height / 2 + 4);
    expect(body.max.y / inch).toBeCloseTo(base.height / 2);
    expect(bounds(geometry).getSize(new THREE.Vector3()).y / inch).toBeCloseTo(
      base.height,
    );
  });
  it('uses current room settings without mutating saved configuration snapshots', () => {
    const saved = saveConfiguration([], base, configurationTemplate(base));
    const before = JSON.stringify(saved);
    const room = {toeKick: {height: 5, setback: 4}};
    const geometry = cabinetGeometry(saved.item, false, false, room);
    expect(
      bounds(geometry.getObjectByName('room-toe-kick')!).getSize(
        new THREE.Vector3(),
      ).y / inch,
    ).toBeCloseTo(5);
    expect(
      bounds(geometry.getObjectByName('custom-cabinet-body')!).min.y / inch,
    ).toBeCloseTo(-base.height / 2 + 5);
    expect(JSON.stringify(saved)).toBe(before);
    const reused = applyConfiguration(
      {...base, id: 'other', width: 30},
      saved.configurations[0],
      room,
    );
    expect(reused.height).toBe(34.5);
    expect(reused.customCabinet!.definition.height).toBe(29.5);
    expect(reused.customCabinet!.definition).not.toHaveProperty('toeKick');
  });
  it('keeps room settings through save/load and defaults older rooms', () => {
    const study = {
      ...blankStudy(),
      room: {...blankStudy().room, toeKick: {height: 5, setback: 4}},
      elements: [base],
    };
    expect(validStudy(study)).toBe(true);
    const loaded = migrateStudy(JSON.parse(JSON.stringify(study)));
    expect(loaded.room.toeKick).toEqual({height: 5, setback: 4});
    expect(cabinetToeKick(base, blankStudy().room)).toEqual({
      height: 4,
      setback: 3,
    });
    for (const toeKick of [
      null,
      {height: 0, setback: 3},
      {height: 4, setback: -1},
      {height: 13, setback: 3},
    ])
      expect(validStudy({...study, room: {...study.room, toeKick}})).toBe(
        false,
      );
  });
  it('does not add toe kicks to custom wall cabinets and preserves corner supports', () => {
    const wall = {...base, kind: 'wall-cabinet' as const};
    const saved = saveConfiguration([], wall, configurationTemplate(wall));
    expect(
      cabinetGeometry(saved.item, false).getObjectByName('room-toe-kick'),
    ).toBeUndefined();
    const corner = cabinetGeometry(
      {...base, configuration: 'corner'},
      false,
      false,
      {toeKick: {height: 5, setback: 4}},
    );
    const supports: THREE.Object3D[] = [];
    corner.traverse((o) => {
      if (o.name === 'room-toe-kick') supports.push(o);
    });
    expect(supports).toHaveLength(2);
    for (const toe of supports)
      expect(bounds(toe).getSize(new THREE.Vector3()).y / inch).toBeCloseTo(5);
  });
});

it('uses room toe kicks for standard, open and custom tall cabinets without countertops', () => {
  const tall = {
    ...base,
    kind: 'tall' as const,
    height: 84,
    configuration: undefined,
  };
  const room = {toeKick: {height: 6, setback: 5}};
  const saved = saveConfiguration(
    [],
    tall,
    configurationTemplate(tall, room),
    room,
  );
  expect(saved.item.customCabinet!.definition.height).toBe(78);
  for (const item of [tall, saved.item]) {
    const geometry = cabinetGeometry(item, true, false, room);
    const toe = bounds(geometry.getObjectByName('room-toe-kick')!);
    expect(toe.getSize(new THREE.Vector3()).y / inch).toBeCloseTo(6);
    expect(toe.max.z / inch).toBeCloseTo(tall.depth / 2 - 5);
    expect(bounds(geometry).max.y / inch).toBeCloseTo(tall.height / 2);
  }
  expect(saved.item.height).toBe(84);
});
it('grounds legacy base and tall cabinets while retaining wall stacking elevations', () => {
  for (const kind of ['base', 'tall', 'wall-cabinet'] as const) {
    const study = migrateStudy({
      ...blankStudy(),
      elements: [
        {...base, kind, placement: {...base.placement, elevation: 12}},
      ],
    });
    expect(study.elements[0].placement.elevation).toBe(
      kind === 'wall-cabinet' ? 12 : 0,
    );
    expect(study.elements[0].height).toBe(base.height);
    expect(validStudy(study)).toBe(true);
  }
});

it('keeps tall storage internals above the shared room support', () => {
  const item = createOpenStorage('shelving', 'shelves');
  const room = {toeKick: {height: 6, setback: 5}};
  expect(storageLayout(item, room).low).toBe(6.75);
  const geometry = cabinetGeometry(item, false, false, room);
  expect(
    bounds(geometry.getObjectByName('room-toe-kick')!).getSize(
      new THREE.Vector3(),
    ).y / inch,
  ).toBeCloseTo(6);
});
it('cannot resurrect floating floor cabinets through placement or remembered preferences', () => {
  const room = blankStudy().room;
  for (const kind of ['base', 'tall'] as const) {
    const item = {
      ...base,
      kind,
      placement: {
        mode: 'wall' as const,
        wall: 'back' as const,
        offset: 0,
        elevation: 20,
      },
    };
    const preferences = emptyCreationPreferences();
    preferences.scopes[`cabinet:${kind}`] = {elevation: 20};
    expect(
      applyCreationPreferences(item, preferences, room).placement.elevation,
    ).toBe(0);
    positionElement(item, 60, 60, room);
    expect(item.placement.elevation).toBe(0);
  }
});
