import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {countertopEdges, DEFAULT_COUNTERTOP_EDGES} from './countertopEdges';
import {cabinetGeometry} from './roomGeometry';
import {applianceGeometry} from './applianceGeometry';
import {wallToFloor, type RoomElement, type Room} from './model';

const room: Room = {
  width: 144,
  depth: 120,
  height: 96,
  floor: 'oak',
  walls: 'plaster',
};
const base: RoomElement = {
  id: 'base',
  kind: 'base',
  width: 30,
  depth: 24,
  height: 34.5,
  face: 'slab',
  placement: {mode: 'floor', x: 60, z: 60, rotation: 0},
};
const tall: RoomElement = {
  ...base,
  id: 'tall',
  kind: 'tall',
  height: 84,
  placement: {mode: 'floor', x: 30, z: 60, rotation: 0},
};
const range: RoomElement = {
  ...base,
  id: 'range',
  kind: 'appliance',
  applianceKind: 'range',
  height: 36,
  depth: 27,
  placement: {mode: 'floor', x: 90, z: 60, rotation: 0},
};
const inch = 0.0254;
function stoneBounds(item: RoomElement, elements: RoomElement[]) {
  const group = cabinetGeometry(
    item,
    true,
    false,
    room,
    countertopEdges(item, elements, room),
  );
  const stone = group.children.filter(
    (child) =>
      child instanceof THREE.Mesh &&
      (child.material as THREE.MeshStandardMaterial).color.getHex() ===
        0xe0d9cc,
  );
  const bounds = new THREE.Box3();
  for (const mesh of stone) bounds.union(new THREE.Box3().setFromObject(mesh));
  return bounds;
}
describe('countertop clearance', () => {
  it('stops the countertop short of a tall cabinet and a range on opposite sides', () => {
    const elements = [base, tall, range];
    const edges = countertopEdges(base, elements, room);
    expect(edges.left).toBeCloseTo(-0.02);
    expect(edges.right).toBeCloseTo(-0.02);
    expect(edges.front).toBe(1);
    const bounds = stoneBounds(base, elements);
    expect(bounds.min.x / inch).toBeCloseTo(-14.98);
    expect(bounds.max.x / inch).toBeCloseTo(14.98);
  });
  it.each(['sink', 'farmhouse-sink', 'corner'] as const)(
    'trims %s countertops without closing the sink opening',
    (configuration) => {
      const item = {...base, configuration};
      const bounds = stoneBounds(item, [item, tall, range]);
      expect(bounds.min.x / inch).toBeCloseTo(-14.98);
      expect(bounds.max.x / inch).toBeCloseTo(14.98);
      if (configuration !== 'corner') {
        const ray = new THREE.Raycaster(
          new THREE.Vector3(0, 2, 0),
          new THREE.Vector3(0, -1, 0),
        );
        const group = cabinetGeometry(
          item,
          true,
          false,
          room,
          countertopEdges(item, [tall, range], room),
        );
        group.updateMatrixWorld(true);
        const stone = group.children.filter(
          (child) =>
            child instanceof THREE.Mesh &&
            (child.material as THREE.MeshStandardMaterial).color.getHex() ===
              0xe0d9cc,
        );
        expect(ray.intersectObjects(stone)).toHaveLength(0);
      }
    },
  );
  it.each(['back', 'front', 'left', 'right'] as const)(
    'resolves neighbors on the %s wall',
    (wall) => {
      const item = {
        ...base,
        placement: {mode: 'wall' as const, wall, offset: 30, elevation: 0},
      };
      const neighbor = {
        ...tall,
        placement: {mode: 'wall' as const, wall, offset: 0, elevation: 0},
      };
      const edges = countertopEdges(item, [item, neighbor], room);
      expect(Math.min(edges.left, edges.right)).toBeCloseTo(-0.02);
    },
  );
  it('handles a rotated floor layout', () => {
    const rotation = 37,
      angle = (rotation * Math.PI) / 180;
    const item = {...base, placement: {...wallToFloor(base, room), rotation}};
    const neighbor = {
      ...tall,
      placement: {
        mode: 'floor' as const,
        x: 60 - 30 * Math.cos(angle),
        z: 60 - 30 * Math.sin(angle),
        rotation,
      },
    };
    expect(countertopEdges(item, [neighbor], room).left).toBeCloseTo(-0.02);
  });
  it('clears a fixture behind the cabinet', () => {
    const fixture: RoomElement = {
      ...tall,
      kind: 'fixture',
      fixtureKind: 'glass-shower',
      placement: {mode: 'floor', x: 60, z: 36, rotation: 0},
    };
    expect(countertopEdges(base, [fixture], room).back).toBeCloseTo(-0.02);
    expect(countertopEdges(base, [fixture], room).front).toBe(1);
  });
  it('retains overhang at exposed edges, beside countertop units, and below elevated fixtures', () => {
    for (const neighbor of [
      {...tall, placement: {...tall.placement, x: 25}},
      {...tall, kind: 'base' as const},
      {
        ...tall,
        kind: 'appliance' as const,
        applianceKind: 'dishwasher' as const,
      },
      {...tall, placement: {...tall.placement, elevation: 54}},
      {...tall, height: 20},
    ])
      expect(countertopEdges(base, [neighbor], room)).toEqual(
        DEFAULT_COUNTERTOP_EDGES,
      );
  });
  it('respects a small gap and trims dishwasher countertops too', () => {
    const neighbor = {
      ...range,
      placement: {mode: 'floor' as const, x: 90.5, z: 60, rotation: 0},
    };
    const edges = countertopEdges(base, [neighbor], room);
    expect(edges.right).toBeCloseTo(0.48);
    const group = applianceGeometry(
      'dishwasher',
      30 * inch,
      34.5 * inch,
      24 * inch,
      'stainless',
      false,
      undefined,
      true,
      undefined,
      edges,
    );
    const bounds = new THREE.Box3().setFromObject(
      group.getObjectByName('dishwasher-countertop')!,
    );
    expect(bounds.max.x / inch).toBeCloseTo(15.48);
    expect(bounds.min.x / inch).toBeCloseTo(-16);
  });
});
