import {describe, expect, it} from 'vitest';
import {
  moveInteriorWall,
  previewInteriorWall,
  resizeInteriorWall,
} from './interiorWalls';
import {presetOutline} from './roomOutline';
import type {Room, Partition} from './model';
const room: Room = {
  width: 144,
  depth: 120,
  height: 96,
  walls: 'white',
  floor: 'oak',
};
const wall: Partition = {
  id: 'segment-test',
  x: 72,
  z: 0,
  length: 120,
  orientation: 'vertical',
};
describe('plan wall gestures', () => {
  it('spans perpendicular to the nearest wall without needing a name', () => {
    expect(previewInteriorWall(room, {x: 60, z: 10})).toMatchObject({
      x: 60,
      z: 0,
      length: 120,
      orientation: 'vertical',
    });
    expect(previewInteriorWall(room, {x: 10, z: 55})).toMatchObject({
      x: 0,
      z: 55,
      length: 144,
      orientation: 'horizontal',
    });
    expect(previewInteriorWall(room, {x: -10, z: 40})).toBeNull();
  });
  it('divides only the current compartment, stopping at an interior wall', () => {
    expect(
      previewInteriorWall({...room, partitions: [wall]}, {x: 60, z: 55}),
    ).toMatchObject({x: 0, z: 55, length: 72, orientation: 'horizontal'});
  });
  it('stops at the first boundary of a concave room', () => {
    const shaped = {...room, outline: presetOutline(room, 'l-shape')};
    expect(previewInteriorWall(shaped, {x: 120, z: 8})).toMatchObject({
      x: 120,
      z: 0,
      length: 48,
    });
  });
  it('detaches either end and snaps it back to a supporting wall', () => {
    const r = {...room, partitions: [wall]};
    const shortened = resizeInteriorWall(r, wall, 'start', {x: 72, z: 24});
    expect(shortened).toMatchObject({z: 24, length: 96});
    const free = resizeInteriorWall(r, shortened, 'end', {x: 72, z: 100});
    expect(free).toMatchObject({z: 24, length: 76});
    expect(resizeInteriorWall(r, free, 'start', {x: 72, z: 2})).toMatchObject({
      z: 0,
      length: 100,
    });
    expect(resizeInteriorWall(r, wall, 'end', {x: 72, z: -30}).length).toBe(6);
  });
  it('moves detached walls without extending them back to the boundary', () => {
    const free = {...wall, z: 24, length: 60};
    expect(
      moveInteriorWall({...room, partitions: [free]}, free, 90),
    ).toMatchObject({x: 90, z: 24, length: 60});
  });
  it('snaps an end to another interior wall', () => {
    const cross: Partition = {
      id: 'segment-cross',
      x: 0,
      z: 80,
      length: 144,
      orientation: 'horizontal',
    };
    expect(
      resizeInteriorWall({...room, partitions: [wall, cross]}, wall, 'end', {
        x: 72,
        z: 78,
      }),
    ).toMatchObject({length: 80});
  });
});
