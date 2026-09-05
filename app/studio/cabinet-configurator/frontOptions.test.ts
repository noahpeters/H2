import {describe, it, expect} from 'vitest';
import {cabinetGeometry} from './kitchenGeometry';
import {applianceGeometry} from './applianceGeometry';
import type {KitchenElement} from './model';
const cabinet = (width: number): KitchenElement => ({
  id: 'test',
  kind: 'base',
  width,
  height: 34.5,
  depth: 24,
  face: 'shaker',
  placement: {mode: 'wall', wall: 'back', offset: 0, elevation: 0},
});
describe('front options', () => {
  it('adds an optional hood only to freestanding ranges', () => {
    expect(
      applianceGeometry('range', 0.76, 0.91, 0.68).getObjectByName(
        'range-hood',
      ),
    ).toBeUndefined();
    const hood = applianceGeometry(
      'range',
      0.76,
      0.91,
      0.68,
      'stainless',
      true,
    ).getObjectByName('range-hood');
    expect(hood).toBeDefined();
    expect(hood!.position.y).toBeCloseTo(0.91 / 2 + 32 * 0.0254);
    expect(
      applianceGeometry(
        'dishwasher',
        0.6,
        0.87,
        0.6,
        'stainless',
        true,
      ).getObjectByName('range-hood'),
    ).toBeUndefined();
  });
  it.each(['base', 'tall', 'wall-cabinet'] as const)(
    'splits %s doors only above 30 inches',
    (kind) => {
      for (const width of [30, 31, 36]) {
        const fronts = cabinetGeometry(
          {...cabinet(width), kind},
          false,
        ).children.filter((c) => c.name === 'cabinet-front');
        expect(fronts).toHaveLength(width > 30 ? 2 : 1);
        if (width > 30)
          expect(fronts[0].position.x).toBe(-fronts[1].position.x);
      }
    },
  );
  it('keeps a pullout full width', () => {
    expect(
      cabinetGeometry(
        {...cabinet(36), configuration: 'pullout'},
        false,
      ).children.filter((c) => c.name === 'cabinet-front'),
    ).toHaveLength(1);
  });
  it.each(['refrigerator', 'dishwasher'] as const)(
    'renders %s wood panels only when requested',
    (kind) => {
      for (const style of ['stainless', 'shaker', 'slab'] as const) {
        const panels = applianceGeometry(
          kind,
          0.9,
          1.8,
          0.7,
          style,
        ).children.filter((c) => c.name === 'appliance-panel');
        expect(panels).toHaveLength(
          style === 'stainless' ? 0 : kind === 'refrigerator' ? 2 : 1,
        );
      }
    },
  );
});
