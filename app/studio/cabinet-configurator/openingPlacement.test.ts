import {describe, expect, it} from 'vitest';
import {placeOpening} from './openingPlacement';
import {presetOutline, roomSegments, wallPoint} from './roomOutline';
import type {Room, Wall} from './model';
const room: Room = {
  width: 144,
  depth: 120,
  height: 96,
  floor: 'oak',
  walls: 'plaster',
};
describe('room opening placement', () => {
  it('snaps to every rectangular wall at one-inch precision', () => {
    for (const wall of ['back', 'right', 'front', 'left'] as Wall[]) {
      const center = wallPoint(room, wall, 34.6);
      expect(
        placeOpening(room, {wall, offset: 10, width: 32}, center.x, center.z),
      ).toEqual({wall, offset: 19});
    }
  });
  it('transfers between walls and clamps the entire opening inside endpoints', () => {
    const opening = {wall: 'back' as const, offset: 18, width: 32};
    expect(placeOpening(room, opening, 144, 65)).toEqual({
      wall: 'right',
      offset: 49,
    });
    expect(placeOpening(room, opening, -100, 0)).toEqual({
      wall: 'left',
      offset: 0,
    });
    expect(placeOpening(room, opening, 300, 0)).toEqual({
      wall: 'right',
      offset: 0,
    });
    expect(placeOpening(room, opening, 72, 120)).toEqual({
      wall: 'front',
      offset: 56,
    });
  });
  it('supports recess walls and skips walls too short for the opening', () => {
    const irregular = {...room, outline: presetOutline(room, 'alcove')};
    for (const segment of roomSegments(irregular)) {
      const center = wallPoint(irregular, segment.id, segment.length / 2);
      const result = placeOpening(
        irregular,
        {wall: segment.id, offset: 0, width: 12},
        center.x,
        center.z,
      );
      expect(result.wall).toBe(segment.id);
      expect(result.offset).toBeGreaterThanOrEqual(0);
      expect(result.offset + 12).toBeLessThanOrEqual(segment.length);
    }
    const wide = placeOpening(
      irregular,
      {wall: 'back', offset: 0, width: 96},
      144,
      60,
    );
    expect(
      roomSegments(irregular).find((s) => s.id === wide.wall)!.length,
    ).toBeGreaterThanOrEqual(96);
    const tooWide = {wall: 'back' as const, offset: 0, width: 1000};
    expect(placeOpening(room, tooWide, 144, 60)).toEqual({
      wall: 'back',
      offset: 0,
    });
  });
});
