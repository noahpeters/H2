import {describe, expect, it} from 'vitest';
import {createCustomUnit} from './model';
import {editableParts} from './partEditing';
import {cabinetOpenings, partInOpening} from './openingPlacement';

describe('opening placement', () => {
  it('finds the clear opening between carcass boards', () => {
    expect(cabinetOpenings(createCustomUnit())).toEqual([
      {
        id: '0.75:0.75:47.25:35.25',
        x: 0.75,
        y: 0.75,
        width: 46.5,
        height: 34.5,
        depth: 24,
      },
    ]);
  });
  it('uses moved dividers and partial-height shelves instead of stale semantic splits', () => {
    const unit = createCustomUnit();
    unit.parts = [
      ...editableParts(unit),
      {
        id: 'v',
        kind: 'divider',
        x: 20,
        y: 0.75,
        z: 0,
        width: 0.75,
        height: 34.5,
        depth: 24,
      },
      {
        id: 'h',
        kind: 'shelf',
        x: 0.75,
        y: 10,
        z: 0.5,
        width: 19.25,
        height: 0.75,
        depth: 23,
      },
    ];
    const spaces = cabinetOpenings(unit);
    expect(spaces).toHaveLength(3);
    expect(spaces.map((s) => [s.x, s.y, s.width, s.height])).toEqual(
      expect.arrayContaining([
        [0.75, 0.75, 19.25, 9.25],
        [0.75, 10.75, 19.25, 24.5],
        [20.75, 0.75, 26.5, 34.5],
      ]),
    );
  });
  it('fits shelf span and door area to the targeted opening without committing a part', () => {
    const unit = createCustomUnit();
    const opening = cabinetOpenings(unit)[0];
    const shelf = partInOpening(unit, 'shelf', opening, 12, 17.13, 0.125);
    expect(shelf).toMatchObject({x: 0.75, width: 46.5, y: 16.75, z: 0.5});
    expect(partInOpening(unit, 'door', opening)).toMatchObject({
      x: 0.875,
      y: 0.875,
      width: 46.25,
      height: 34.25,
    });
    expect(unit.parts).toBeUndefined();
  });
  it('makes a newly placed shelf subdivide the target for the next placement', () => {
    const unit = createCustomUnit();
    const shelf = partInOpening(
      unit,
      'shelf',
      cabinetOpenings(unit)[0],
      24,
      18,
    );
    const next = {...unit, parts: [...editableParts(unit), shelf]};
    expect(cabinetOpenings(next)).toHaveLength(2);
  });
});
