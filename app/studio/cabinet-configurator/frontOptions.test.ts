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
