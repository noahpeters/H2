import {describe, expect, it} from 'vitest';
import {DOOR_TYPES, type Room} from './model';
import {roomSegments, wallPoint, pointInRoom} from './roomOutline';
import {openingGeometry, roomGeometry} from './roomGeometry';
import {placeOpening} from './openingPlacement';
import {validStudy} from './savedRoomProtocol';
const room: Room = {
  width: 180,
  depth: 160,
  height: 96,
  floor: 'oak',
  walls: 'white',
  partitions: [
    {
      id: 'segment-pantry',
      name: 'Pantry',
      x: 120,
      z: 0,
      length: 80,
      orientation: 'vertical',
    },
  ],
};
const opening = {
  id: 'door',
  kind: 'door' as const,
  wall: 'segment-pantry' as const,
  offset: 30,
  width: 30,
  height: 80,
};
describe('interior walls and door types', () => {
  it('adds a door-bearing wall without changing the floor outline', () => {
    expect(roomSegments(room)).toHaveLength(5);
    expect(wallPoint(room, opening.wall, 30)).toEqual({x: 120, z: 30});
    expect(pointInRoom(room, 150, 30)).toBe(true);
    expect(placeOpening(room, opening, 120, 45)).toEqual({
      wall: opening.wall,
      offset: 30,
    });
    expect(roomGeometry(room, [opening], 0xffffff)).toHaveLength(5);
  });
  it.each(DOOR_TYPES)('renders and saves %s doors', (doorType) => {
    const door = {...opening, doorType, handing: 'right'};
    expect(
      openingGeometry({...opening, doorType}, room).children.length,
    ).toBeGreaterThan(4);
    const study = {
      version: 2,
      countertop: true,
      view: 'plan',
      room,
      openings: [door],
      elements: [],
      islands: [],
    };
    expect(validStudy(JSON.parse(JSON.stringify(study)))).toBe(true);
    expect(
      validStudy({...study, openings: [{...door, doorType: 'unknown'}]}),
    ).toBe(false);
  });
  it('rejects invalid and duplicate interior wall records', () => {
    const study = {
      version: 2,
      countertop: true,
      view: 'plan',
      room,
      openings: [],
      elements: [],
      islands: [],
    };
    expect(
      validStudy({
        ...study,
        room: {...room, partitions: [{...room.partitions![0], length: 0}]},
      }),
    ).toBe(false);
    expect(
      validStudy({
        ...study,
        room: {...room, partitions: [...room.partitions!, ...room.partitions!]},
      }),
    ).toBe(false);
  });
});
