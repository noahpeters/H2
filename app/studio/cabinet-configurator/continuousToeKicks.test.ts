import {
  configurationTemplate,
  saveConfiguration,
} from './custom-unit/designConfigurations';
import {expect, it} from 'vitest';
import * as THREE from 'three';
import {continuousToeKicks} from './continuousToeKicks';
import {cabinetGeometry, toeKickGeometry} from './roomGeometry';
import type {Room, RoomElement} from './model';
const room: Room = {
  width: 144,
  depth: 120,
  height: 96,
  floor: 'oak',
  walls: 'plaster',
};
const cabinet = (id: string, x: number): RoomElement => ({
  id,
  kind: 'base',
  width: 30,
  height: 34.5,
  depth: 24,
  face: 'shaker',
  placement: {mode: 'floor', x, z: 30, rotation: 0},
});
it('builds one seamless panel across an unordered run of standard and custom cabinets', () => {
  const a = cabinet('a', 15),
    b = cabinet('b', 45),
    c = cabinet('c', 75);
  c.customCabinet = saveConfiguration(
    [],
    c,
    configurationTemplate(c),
  ).item.customCabinet;
  b.kind = 'tall';
  b.height = 84;
  const runs = continuousToeKicks([b, c, a], room);
  expect(runs.get('b')).toEqual({width: 90, x: 0});
  expect(runs.get('a')?.hidden).toBe(true);
  expect(runs.get('c')?.hidden).toBe(true);
  const geometry = toeKickGeometry(b, room, runs.get('b')!);
  expect(geometry.children).toHaveLength(1);
  expect(
    new THREE.Box3().setFromObject(geometry).getSize(new THREE.Vector3()).x /
      0.0254,
  ).toBeCloseTo(90);
  expect(
    cabinetGeometry(a, false).getObjectByName('room-toe-kick'),
  ).toBeDefined();
});
it('preserves deliberate gaps, appliances, differing finish and elevated cabinets', () => {
  for (const b of [
    cabinet('b', 46),
    {...cabinet('b', 45), kind: 'appliance' as const},
    {...cabinet('b', 45), material: 'walnut' as const},
    {
      ...cabinet('b', 45),
      placement: {
        mode: 'floor' as const,
        x: 45,
        z: 30,
        rotation: 0,
        elevation: 3,
      },
    },
    {...cabinet('b', 45), depth: 20},
  ])
    expect(
      continuousToeKicks([cabinet('a', 15), b], room).get('a')?.width,
    ).toBe(30);
});
it.each([0, 90, 180, 270])('joins panels at %s degrees', (rotation) => {
  const angle = (rotation * Math.PI) / 180;
  const a = cabinet('a', 40),
    b = cabinet('b', 40 + 30 * Math.cos(angle));
  a.placement = {mode: 'floor', x: 40, z: 40, rotation};
  b.placement = {
    mode: 'floor',
    x: 40 + 30 * Math.cos(angle),
    z: 40 + 30 * Math.sin(angle),
    rotation,
  };
  expect(continuousToeKicks([a, b], room).get('a')?.width).toBe(60);
});
