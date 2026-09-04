import {describe, expect, it} from 'vitest';
import {createDragUpdate} from './CabinetConfigurator';

const study = (wall: 'back' | 'left' | 'right') => ({
  room: {
    width: 144,
    depth: 120,
    height: 96,
    floor: 'oak' as const,
    walls: 'plaster' as const,
  },
  openings: [],
  cabinets: [
    {
      id: 'cabinet',
      type: 'base' as const,
      wall,
      offset: 12,
      width: 30,
      depth: 24,
      height: 34.5,
      face: 'shaker' as const,
    },
  ],
  selected: 'cabinet',
  countertop: true,
  view: 'plan' as const,
});

describe('createDragUpdate', () => {
  it.each([
    ['back', 114],
    ['left', 90],
    ['right', 90],
  ] as const)('snaps and clamps a cabinet on the %s wall', (wall, maximum) => {
    const active = {id: 'cabinet', start: 12, pointer: 20, wall};

    const snapped = createDragUpdate(active, 30, 2)(study(wall));
    const clampedHigh = createDragUpdate(active, 1000, 2)(study(wall));
    const clampedLow = createDragUpdate(active, -1000, 2)(study(wall));

    expect(snapped.cabinets[0].offset).toBe(18);
    expect(clampedHigh.cabinets[0].offset).toBe(maximum);
    expect(clampedLow.cabinets[0].offset).toBe(0);
    expect(snapped.selected).toBe('cabinet');
  });

  it('can execute after the pointer handler has released its event', () => {
    const event = {clientX: 48};
    const update = createDragUpdate(
      {id: 'cabinet', start: 12, pointer: 20, wall: 'back'},
      event.clientX,
      2,
    );

    // Model React running the updater after the synthetic event is released.
    Object.defineProperty(event, 'clientX', {
      get: () => {
        throw new Error('released event was accessed');
      },
    });

    expect(update(study('back')).cabinets[0].offset).toBe(27);
  });
});
