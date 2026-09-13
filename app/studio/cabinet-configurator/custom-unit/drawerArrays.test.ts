import {describe, expect, it} from 'vitest';
import {
  createCustomUnit,
  deserializeCustomUnit,
  serializeCustomUnit,
  validateCustomUnit,
} from './model';
import {
  cabinetOpenings,
  partInOpening,
  placementOpenings,
} from './openingPlacement';
import {customUnitParts} from './geometry';
import {editableParts} from './partEditing';
import {equalDrawerHeights, setDrawerHeight} from './drawerArrays';
import {reflowDrawerArrays, withDrawerArrays} from './drawerArrayEditing';
import {fitDefinition} from './designConfigurations';

function fixture(height = 36) {
  const unit = createCustomUnit({width: 36, height, depth: 24});
  const part = {
    ...partInOpening(unit, 'drawer-array', cabinetOpenings(unit)[0]),
    id: 'array',
  };
  return {...unit, parts: [...editableParts(unit), part]};
}
function expectFitted(unit: ReturnType<typeof fixture>) {
  expect(validateCustomUnit(unit)).toEqual([]);
  const array = unit.parts.find((p) => p.drawerArray)!;
  const fronts = customUnitParts(unit).filter((p) => p.kind === 'drawer');
  expect(fronts[0].y).toBeCloseTo(array.y, 10);
  expect(fronts.at(-1)!.y + fronts.at(-1)!.height).toBeCloseTo(
    array.y + array.height,
    10,
  );
  fronts.forEach((front, i) => {
    expect(front.height).toBeGreaterThanOrEqual(2 - 1e-8);
    expect(front.width).toBe(array.width);
    if (i)
      expect(front.y - fronts[i - 1].y - fronts[i - 1].height).toBeCloseTo(
        unit.reveal,
        10,
      );
  });
}
describe('opening-owned drawer arrays', () => {
  it('defaults to the greatest count of equal fronts at least six inches high, including reveals', () => {
    for (const height of [12, 24, 30.5, 36, 80]) {
      const unit = fixture(height);
      const array = unit.parts.at(-1)!;
      const heights = array.drawerArray!.heights;
      expect(heights.every((h) => h >= 6)).toBe(true);
      expect(new Set(heights).size).toBe(1);
      expect(
        (array.height - heights.length * unit.reveal) / (heights.length + 1),
      ).toBeLessThan(6);
      expectFitted(unit);
    }
  });
  it('allows a single front in an opening shorter than six inches, but never below two', () => {
    expect(equalDrawerHeights(5.5, 0.125)).toEqual([5.5]);
    expect(() => equalDrawerHeights(1.99, 0.125)).toThrow();
    expect(equalDrawerHeights(2, 0.125)).toEqual([2]);
  });
  it('redistributes remaining fronts when one height changes and rejects impossible heights/counts', () => {
    const unit = fixture();
    const part = unit.parts.at(-1)!;
    unit.parts[unit.parts.length - 1] = setDrawerHeight(
      part,
      unit.reveal,
      0,
      2,
    );
    expect(unit.parts.at(-1)!.drawerArray!.heights[0]).toBe(2);
    expectFitted(unit);
    for (const height of [1.99, 100, NaN])
      expect(() => setDrawerHeight(part, unit.reveal, 0, height)).toThrow();
    for (const count of [0, 1.5, 100])
      expect(() =>
        equalDrawerHeights(part.height, unit.reveal, count),
      ).toThrow();
  });
  it('sizes external fronts over the carcass and internal fronts inside the opening behind doors', () => {
    const unit = createCustomUnit({width: 36});
    const opening = cabinetOpenings(unit)[0];
    const external = partInOpening(unit, 'drawer-array', opening);
    expect(external.width).toBe(35.75);
    const door = {...partInOpening(unit, 'door', opening), z: 2.5};
    unit.parts = [...editableParts(unit), door];
    const internal = partInOpening(unit, 'drawer-array', opening);
    expect(internal.width).toBe(opening.width - 2 * unit.reveal);
    expect(internal.z).toBe(3.75);
    expect(internal.drawerArray!.face).toBe('internal');
  });
  it('reserves the full opening and persists exact heights and grouping', () => {
    const unit = fixture();
    unit.parts[unit.parts.length - 1] = setDrawerHeight(
      unit.parts.at(-1)!,
      unit.reveal,
      0,
      6.125,
    );
    const restored = deserializeCustomUnit(serializeCustomUnit(unit));
    expect(restored).toEqual(unit);
    expect(placementOpenings(restored, 'drawer-array')).toHaveLength(0);
    expectFitted(restored as typeof unit);
  });
  it('rejects malformed arrays, gaps, custom widths, and undersized imported drawers', () => {
    for (const patch of [
      {width: 10},
      {drawerArray: {face: 'internal'}},
      {drawerArray: {...fixture().parts.at(-1)!.drawerArray, heights: [1, 4]}},
    ]) {
      const unit = fixture();
      Object.assign(unit.parts.at(-1)!, patch);
      expect(validateCustomUnit(unit).length).toBeGreaterThan(0);
    }
  });
  it('keeps reveals fixed when reused at a different cabinet size', () => {
    const unit = fixture();
    const fitted = fitDefinition(unit, {width: 30, height: 30.5, depth: 20});
    expectFitted(fitted as typeof unit);
    expect(fitted.parts!.at(-1)!.width).toBeCloseTo(29.75);
    expect(unit.width).toBe(36);
  });
  it('updates all gaps when the shared reveal changes', () => {
    const unit = reflowDrawerArrays({...fixture(), reveal: 0.25});
    expectFitted(unit as ReturnType<typeof fixture>);
  });
  it('upgrades a standard drawer stack to one editable array without changing the cabinet envelope', () => {
    const unit = createCustomUnit({
      root: {
        id: 'stack',
        type: 'section',
        sectionType: 'drawer-stack',
        properties: {drawerCount: 3},
      },
    });
    const upgraded = withDrawerArrays(unit);
    expect(upgraded.parts!.filter((p) => p.drawerArray)).toHaveLength(1);
    expect(upgraded.parts!.at(-1)!.drawerArray!.heights).toHaveLength(3);
    expect(upgraded).toMatchObject({
      width: unit.width,
      height: unit.height,
      depth: unit.depth,
    });
    expectFitted(upgraded as ReturnType<typeof fixture>);
  });
  it('keeps individually edited upper heights when another front changes', () => {
    const unit = fixture();
    const original = unit.parts.at(-1)!;
    const first = setDrawerHeight(original, unit.reveal, 4, 6.125);
    const second = setDrawerHeight(first, unit.reveal, 3, 6.5);
    expect(second.drawerArray!.heights[4]).toBe(6.125);
    expect(second.drawerArray!.heights[3]).toBe(6.5);
    unit.parts[unit.parts.length - 1] = second;
    expectFitted(unit);
  });
  it('preserves unequal legacy upper front heights during conversion', () => {
    const unit = fixture();
    const parts = customUnitParts(unit).map((p) => ({...p, id: p.id!}));
    const fronts = parts.filter((p) => p.kind === 'drawer');
    fronts.at(-1)!.height = 6.125;
    const converted = withDrawerArrays({...unit, parts});
    expect(converted.parts!.at(-1)!.drawerArray!.heights.at(-1)).toBe(6.125);
    expectFitted(converted as typeof unit);
  });
  it('fits separate divided openings without crossing the divider', () => {
    const unit = createCustomUnit({
      root: {
        id: 'split',
        type: 'division',
        axis: 'vertical',
        weights: [1, 1],
        children: [
          {id: 'left', type: 'section', sectionType: 'open'},
          {id: 'right', type: 'section', sectionType: 'open'},
        ],
      },
    });
    const spaces = cabinetOpenings(unit);
    const arrays = spaces.map((opening, i) => ({
      ...partInOpening(unit, 'drawer-array', opening),
      id: `array-${i}`,
    }));
    const result = reflowDrawerArrays({
      ...unit,
      parts: [...editableParts(unit), ...arrays],
    });
    expect(validateCustomUnit(result)).toEqual([]);
    const [left, right] = result
      .parts!.filter((p) => p.drawerArray)
      .sort((a, b) => a.x - b.x);
    expect(left.x + left.width).toBeLessThan(right.x);
    expect(placementOpenings(result, 'drawer-array')).toHaveLength(0);
  });
});
