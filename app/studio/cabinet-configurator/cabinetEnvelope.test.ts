import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {baseToeKick, cabinetCompositionEnvelope} from './cabinetEnvelope';
import {cabinetGeometry} from './kitchenGeometry';
import {
  configurationTemplate,
  saveConfiguration,
  applyConfiguration,
} from './custom-unit/designConfigurations';
import {blankStudy, migrateStudy} from './CabinetConfigurator';
import {validStudy} from './savedRoomProtocol';
import type {KitchenElement} from './model';
const base: KitchenElement = {
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
    expect(baseToeKick(base, blankStudy().room)).toEqual({
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
