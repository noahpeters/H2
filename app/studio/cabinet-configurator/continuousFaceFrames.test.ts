import {validStudy} from './savedRoomProtocol';
import {blankStudy, migrateStudy} from './CabinetConfigurator';
import {describe, it, expect} from 'vitest';
import {continuousFrameNeighbors} from './continuousFaceFrames';
import {cabinetGeometry} from './roomGeometry';
import type {Room, RoomElement} from './model';
import * as THREE from 'three';
const room: Room = {
  width: 144,
  depth: 120,
  height: 96,
  floor: 'oak',
  walls: 'white',
  overlay: 'inset',
  continuousFaceFrames: true,
};
const cabinet = (id: string, x: number): RoomElement => ({
  id,
  kind: 'base',
  width: 30,
  height: 34.5,
  depth: 24,
  face: 'slab',
  placement: {mode: 'floor', x, z: 30, rotation: 0},
});
describe('continuous cabinet face frames', () => {
  it('connects a run independently of element order and leaves its ends full width', () => {
    const [a, b, c] = [cabinet('a', 15), cabinet('b', 45), cabinet('c', 75)];
    const runs = continuousFrameNeighbors([c, a, b], room);
    expect(runs.get('a')).toEqual({right: 'b'});
    expect(runs.get('b')).toEqual({left: 'a', right: 'c'});
    expect(runs.get('c')).toEqual({left: 'b'});
  });
  it('defaults to independent frames and ignores full-overlay rooms', () => {
    const elements = [cabinet('a', 15), cabinet('b', 45)];
    expect(
      continuousFrameNeighbors(elements, {
        ...room,
        continuousFaceFrames: undefined,
      }).size,
    ).toBe(0);
    expect(
      continuousFrameNeighbors(elements, {...room, overlay: 'full-overlay'})
        .size,
    ).toBe(0);
  });
  it('breaks at gaps, different elevations/heights/depths, finishes, appliances and corners', () => {
    const a = cabinet('a', 15),
      b = cabinet('b', 45);
    for (const changed of [
      {...b, placement: {...b.placement, x: 45.1}},
      {...b, placement: {...b.placement, elevation: 1}},
      {...b, placement: {...b.placement, rotation: 90}},
      {...b, height: 36},
      {...b, depth: 25},
      {...b, material: 'walnut' as const},
      {...b, kind: 'appliance' as const},
      {...b, configuration: 'corner' as const},
    ])
      expect(continuousFrameNeighbors([a, changed], room).size).toBe(0);
  });
  it.each([0, 90, 180, 270])(
    'supports floor runs rotated %s degrees',
    (rotation) => {
      const angle = (rotation * Math.PI) / 180,
        a = cabinet('a', 40),
        b = cabinet('b', 40 + 30 * Math.cos(angle));
      a.placement = {mode: 'floor', x: 40, z: 40, rotation};
      b.placement = {
        mode: 'floor',
        x: 40 + 30 * Math.cos(angle),
        z: 40 + 30 * Math.sin(angle),
        rotation,
      };
      expect(continuousFrameNeighbors([a, b], room).get('a')).toEqual({
        right: 'b',
      });
    },
  );
  it('renders one boundary stile and widens both inset fronts by half a stile', () => {
    const elements = [cabinet('a', 15), cabinet('b', 45)],
      runs = continuousFrameNeighbors(elements, room);
    const groups = elements.map((e) =>
      cabinetGeometry(e, false, false, room, undefined, runs.get(e.id)),
    );
    const frames = groups.flatMap((g) =>
      g.children.filter((c) => c.name === 'cabinet-face-frame'),
    );
    expect(frames).toHaveLength(7);
    for (const group of groups) {
      const front = group.children.find(
        (c) => c.name === 'cabinet-front',
      ) as THREE.Mesh<THREE.BoxGeometry>;
      expect(front.geometry.parameters.width / 0.0254).toBeCloseTo(27.5);
    }
  });
});

it('retains the room option through save/load and validates its type', () => {
  const study = {
    ...blankStudy(),
    room: {...blankStudy().room, continuousFaceFrames: true},
  };
  expect(validStudy(study)).toBe(true);
  expect(
    migrateStudy(JSON.parse(JSON.stringify(study))).room.continuousFaceFrames,
  ).toBe(true);
  expect(
    validStudy({...study, room: {...study.room, continuousFaceFrames: 'true'}}),
  ).toBe(false);
});
