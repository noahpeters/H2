import {describe, expect, it} from 'vitest';
import {doorHandlePosition} from './hardwarePlacement';

describe('context-aware door hardware placement', () => {
  it.each([
    [35, 'top'],
    [35.001, 'bottom'],
  ] as const)(
    'uses the door top elevation at %s inches',
    (absoluteTop, edge) => {
      expect(
        doorHandlePosition({
          width: 18,
          height: 30,
          absoluteTop,
          faceStyle: 'slab',
          hingeSide: 'left',
        }).edge,
      ).toBe(edge);
    },
  );

  it('uses style-specific edge margins and mirrors paired doors', () => {
    const shakerLeft = doorHandlePosition({
      width: 18,
      height: 30,
      absoluteTop: 35,
      faceStyle: 'shaker',
      hingeSide: 'left',
    });
    const shakerRight = doorHandlePosition({
      width: 18,
      height: 30,
      absoluteTop: 35,
      faceStyle: 'shaker',
      hingeSide: 'right',
    });
    const slab = doorHandlePosition({
      width: 18,
      height: 30,
      absoluteTop: 35,
      faceStyle: 'slab',
      hingeSide: 'left',
    });
    expect(shakerLeft).toMatchObject({x: 8, y: 14});
    expect(shakerRight.x).toBe(-shakerLeft.x);
    expect(slab).toMatchObject({x: 5, y: 11});
  });
});
