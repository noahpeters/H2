import {describe, expect, it} from 'vitest';
import {elevationSheets} from './ElevationWorksheet';
import type {Study} from './CabinetConfigurator';

const study: Study = {
  version: 2,
  room: {width: 144, depth: 120, height: 96, floor: 'oak', walls: 'white'},
  openings: [
    {
      id: 'window',
      kind: 'window',
      wall: 'back',
      offset: 72,
      width: 36,
      height: 42,
      sill: 40,
    },
  ],
  elements: [
    {
      id: 'base',
      kind: 'base',
      width: 30,
      depth: 24,
      height: 34.5,
      face: 'shaker',
      placement: {mode: 'wall', wall: 'back', offset: 12, elevation: 0},
    },
    {
      id: 'wall',
      kind: 'wall-cabinet',
      width: 30,
      depth: 12,
      height: 30,
      face: 'slab',
      placement: {mode: 'wall', wall: 'back', offset: 12, elevation: 54},
    },
    {
      id: 'island-base',
      kind: 'base',
      width: 36,
      depth: 24,
      height: 34.5,
      face: 'slab',
      islandId: 'island',
      placement: {mode: 'floor', x: 54, z: 48, rotation: 0},
    },
  ],
  islands: [
    {
      id: 'island',
      x: 72,
      z: 60,
      width: 72,
      depth: 36,
      rotation: 0,
      overhang: 0,
      seatingSide: 'none',
    },
  ],
  selected: null,
  countertop: true,
  view: 'elevation',
};

describe('elevationSheets', () => {
  it('creates cabinetry-facing wall and exposed island elevations', () => {
    const sheets = elevationSheets(study);
    expect(sheets.map(({title}) => title)).toEqual([
      'Back wall — front elevation',
      'Island — front elevation',
      'Island — back elevation',
      'Island — left elevation',
      'Island — right elevation',
    ]);
    expect(sheets[0]).toMatchObject({width: 144, height: 96, countertop: 34.5});
    expect(sheets[0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({id: 'base', x: 12, y: 0, width: 30}),
        expect.objectContaining({id: 'wall', y: 54, height: 30}),
      ]),
    );
    expect(sheets[0].openings[0]).toMatchObject({id: 'window', sill: 40});
  });

  it('omits walls without cabinetry or architectural openings', () => {
    expect(
      elevationSheets({...study, elements: [], openings: [], islands: []}),
    ).toEqual([]);
  });
});
