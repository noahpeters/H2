import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {
  createCustomUnit,
  deserializeCustomUnit,
  serializeCustomUnit,
  validateCustomUnit,
} from './model';
import {
  addEndShelf,
  addPart,
  changePart,
  editableParts,
  setPartSetback,
} from './partEditing';
import {customUnitGeometry, customUnitBounds} from './geometry';
import {curvePoint, edgeSetback} from './curves';
import {VANITY_EXAMPLE} from './examples';

describe('physical cabinet authoring', () => {
  it('converts legacy designs without moving or losing parts and round trips precise edits', () => {
    const before = editableParts(VANITY_EXAMPLE);
    const shelf = before.find((part) => part.kind === 'shelf')!;
    const next = changePart(VANITY_EXAMPLE, shelf.id, {y: 8.3125});
    expect(next.parts!.filter((part) => part.id !== shelf.id)).toEqual(
      before.filter((part) => part.id !== shelf.id),
    );
    expect(deserializeCustomUnit(serializeCustomUnit(next))).toEqual(next);
    expect(next.parts!.find((part) => part.id === shelf.id)!.y).toBe(8.3125);
  });
  it('recesses a shelf half an inch while holding the back edge', () => {
    const unit = addPart(createCustomUnit(), 'shelf');
    const shelf = unit.parts!.at(-1)!;
    const next = setPartSetback(unit, shelf.id, 1);
    const moved = next.parts!.at(-1)!;
    expect(moved.z - shelf.z).toBe(0.5);
    expect(moved.z + moved.depth).toBe(shelf.z + shelf.depth);
  });
  it('keeps independent front depths and rejects corrupt part data', () => {
    const unit = addPart(addPart(createCustomUnit(), 'door'), 'door');
    const next = setPartSetback(unit, unit.parts!.at(-1)!.id, 2.125);
    expect(next.parts!.slice(-2).map((part) => part.z)).toEqual([-0.75, 2.125]);
    expect(
      validateCustomUnit({...next, parts: [{...next.parts![0], width: NaN}]}),
    ).not.toEqual([]);
    expect(
      validateCustomUnit({...next, parts: [next.parts![0], next.parts![0]]}),
    ).not.toEqual([]);
  });
  it('preserves a straight rear edge for front curves and bends the rear of entire cabinets', () => {
    const unit = createCustomUnit({
      curve: {scope: 'front', profile: 'arc', radius: 60, direction: 'outward'},
    });
    expect(curvePoint(unit, 24, 0)[1]).toBeLessThan(0);
    expect(curvePoint(unit, 24, 24)).toEqual([24, 24]);
    expect(
      curvePoint(
        {...unit, curve: {...unit.curve!, scope: 'cabinet'}},
        24,
        24,
      )[1],
    ).toBeLessThan(24);
    expect(
      validateCustomUnit({...unit, curve: {...unit.curve!, radius: 12}}),
    ).not.toEqual([]);
  });
  it('supports distinct concave and convex quarter-circle edges', () => {
    const convex = edgeSetback(1, 24, {
      left: 'convex',
      right: 'square',
      radius: 2,
    });
    const concave = edgeSetback(1, 24, {
      left: 'concave',
      right: 'square',
      radius: 2,
    });
    expect(convex).toBeCloseTo(2 - Math.sqrt(3));
    expect(concave).toBeCloseTo(Math.sqrt(3));
  });
  it('adds a semicircular end shelf without reshaping the straight cabinet', () => {
    const unit = addEndShelf(createCustomUnit(), 'right');
    const shelf = unit.parts!.at(-1)!;
    expect(shelf).toMatchObject({
      x: 48,
      width: 12,
      depth: 24,
      shape: 'round-right',
    });
    const geometry = customUnitGeometry(unit);
    const mesh = geometry.children.at(-1) as THREE.Mesh;
    mesh.geometry.computeBoundingBox();
    expect(mesh.geometry.boundingBox!.max.x).toBeCloseTo(6);
    expect(validateCustomUnit(unit)).toEqual([]);
    expect(customUnitBounds(unit).width).toBeCloseTo(60);
  });
  it.each(['pocket', 'tambour', 'lift-up', 'pull-down'] as const)(
    'stores %s doors and generates an opening preview',
    (mechanism) => {
      const unit = addPart(createCustomUnit(), 'door');
      const door = unit.parts!.at(-1)!;
      const next = changePart(unit, door.id, {
        door: {mechanism, side: 'left', travel: 20, slatSize: 1},
      });
      expect(deserializeCustomUnit(serializeCustomUnit(next))).toEqual(next);
      const closed = new THREE.Box3().setFromObject(customUnitGeometry(next));
      const open = new THREE.Box3().setFromObject(
        customUnitGeometry(next, {[door.id]: 1}),
      );
      expect(open.equals(closed)).toBe(false);
      expect(next.parts!.at(-1)!.z).toBe(-0.75);
    },
  );
});
