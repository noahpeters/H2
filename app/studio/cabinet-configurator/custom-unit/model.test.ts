import {describe, expect, it} from 'vitest';
import {CLOSET_EXAMPLE, VANITY_EXAMPLE} from './examples';
import {customUnitParts} from './geometry';
import {
  createCustomUnit,
  deserializeCustomUnit,
  layoutCustomUnit,
  resizeDivision,
  serializeCustomUnit,
  splitSection,
  validateCustomUnit,
} from './model';

describe('custom-unit model', () => {
  it('creates a versioned definition separate from placement and meshes', () => {
    const unit = createCustomUnit({id: 'blank'});
    expect(unit).toMatchObject({
      version: 1,
      width: 48,
      root: {type: 'section', sectionType: 'open'},
    });
    expect(unit).not.toHaveProperty('placement');
    expect(unit).not.toHaveProperty('geometry');
  });

  it('subdivides without overlaps and preserves total dimensions', () => {
    const blank = createCustomUnit({id: 'split', width: 60, height: 40});
    const vertical = splitSection(blank, blank.root.id, 'vertical');
    const first =
      vertical.root.type === 'division' ? vertical.root.children[0].id : '';
    const result = layoutCustomUnit(
      splitSection(vertical, first, 'horizontal'),
    );
    expect(result.errors).toEqual([]);
    expect(result.regions).toHaveLength(3);
    expect(
      result.regions.reduce(
        (area, region) => area + region.width * region.height,
        0,
      ),
    ).toBeCloseTo(2400);
  });

  it('resizes divisions predictably and rejects invalid weights', () => {
    const blank = createCustomUnit({width: 60});
    const split = splitSection(blank, blank.root.id, 'vertical');
    if (split.root.type !== 'division') throw new Error('expected division');
    const resized = resizeDivision(split, split.root.id, [1, 2]);
    expect(layoutCustomUnit(resized).regions.map(({width}) => width)).toEqual([
      20, 40,
    ]);
    expect(resizeDivision(resized, split.root.id, [0, 1])).toEqual(resized);
  });

  it('enforces overall and regional minimum dimensions and reveals', () => {
    expect(
      validateCustomUnit({...createCustomUnit(), width: 4, reveal: 2}),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('width'),
        expect.stringContaining('reveal'),
      ]),
    );
    const blank = createCustomUnit({width: 12});
    const narrow = splitSection(blank, blank.root.id, 'vertical');
    expect(
      validateCustomUnit(resizeDivision(narrow, narrow.root.id, [1, 5])).some(
        (error) => error.includes('smaller than'),
      ),
    ).toBe(true);
  });

  it.each([VANITY_EXAMPLE, CLOSET_EXAMPLE])(
    'round trips $name without losing semantics',
    (example) => {
      const restored = deserializeCustomUnit(serializeCustomUnit(example));
      expect(restored).toEqual(example);
      expect(validateCustomUnit(restored)).toEqual([]);
    },
  );

  it('generates synchronized parts for representative mixed units', () => {
    const vanity = customUnitParts(VANITY_EXAMPLE);
    expect(new Set(vanity.map(({kind}) => kind))).toEqual(
      new Set(['carcass', 'divider', 'drawer', 'door', 'shelf']),
    );
    const closet = customUnitParts(CLOSET_EXAMPLE);
    expect(closet.some(({kind}) => kind === 'rod')).toBe(true);
    expect(closet.filter(({kind}) => kind === 'shelf')).toHaveLength(11);
  });
});
