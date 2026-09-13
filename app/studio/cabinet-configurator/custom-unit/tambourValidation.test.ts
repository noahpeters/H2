import {expect, it} from 'vitest';
import {createCustomUnit, validateCustomUnit, type CabinetPart} from './model';
const door: CabinetPart = {
  id: 'tambour',
  kind: 'door',
  x: 1,
  y: 1,
  z: -0.75,
  width: 20,
  height: 20,
  depth: 0.75,
  door: {mechanism: 'tambour', side: 'left', travel: 20, slatSize: 1},
};
it.each(['vertical', 'horizontal'] as const)(
  'allows %s tambour beside an unrelated curved cabinet end',
  (direction) => {
    const unit = createCustomUnit({
      parts: [{...door, door: {...door.door!, direction}}],
    });
    unit.profile = {left: 'square', right: 'convex', radius: 8};
    expect(validateCustomUnit(unit)).toEqual([]);
    unit.parts![0].x = 35;
    expect(
      validateCustomUnit(unit).some((error) =>
        error.includes('intersects a curved area'),
      ),
    ).toBe(true);
  },
);
it('checks legacy rounded ends and respects independent parts and square profiles', () => {
  const unit = createCustomUnit({parts: [door]});
  unit.curve = {
    scope: 'front',
    profile: 'rounded-right',
    radius: 8,
    direction: 'outward',
  };
  expect(validateCustomUnit(unit)).toEqual([]);
  unit.curve.profile = 'arc';
  unit.curve.radius = 60;
  expect(
    validateCustomUnit(unit).some((error) =>
      error.includes('intersects a curved area'),
    ),
  ).toBe(true);
  unit.parts = [{...door, profileMode: 'independent'}];
  expect(validateCustomUnit(unit)).toEqual([]);
  unit.parts = [door];
  unit.profile = {left: 'square', right: 'square', radius: 8};
  expect(validateCustomUnit(unit)).toEqual([]);
});
