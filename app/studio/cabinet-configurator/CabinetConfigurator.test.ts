import {describe, expect, it} from 'vitest';
import {createFloorDragUpdate} from './CabinetConfigurator';

const study = () => ({
  version: 2 as const,
  room: {
    width: 144,
    depth: 120,
    height: 96,
    floor: 'oak' as const,
    walls: 'plaster' as const,
  },
  openings: [],
  elements: [
    {
      id: 'island-appliance',
      kind: 'appliance' as const,
      applianceKind: 'dishwasher' as const,
      width: 24,
      depth: 24,
      height: 34.5,
      face: 'slab' as const,
      placement: {mode: 'floor' as const, x: 48, z: 42, rotation: 0},
    },
  ],
  islands: [],
  selected: 'island-appliance',
  countertop: true,
  view: 'plan' as const,
});

describe('createFloorDragUpdate', () => {
  it('moves a floor-positioned appliance on both axes with 3-inch snapping', () => {
    const update = createFloorDragUpdate(
      {id: 'island-appliance', x: 48, z: 42, clientX: 20, clientY: 30},
      32,
      18,
      2,
    );
    expect(update(study()).elements[0].placement).toMatchObject({
      mode: 'floor',
      x: 54,
      z: 36,
    });
  });

  it('does not access a released pointer event from a deferred update', () => {
    const event = {clientX: 32, clientY: 18};
    const update = createFloorDragUpdate(
      {id: 'island-appliance', x: 48, z: 42, clientX: 20, clientY: 30},
      event.clientX,
      event.clientY,
      2,
    );
    Object.defineProperties(event, {
      clientX: {
        get: () => {
          throw new Error('released event was accessed');
        },
      },
      clientY: {
        get: () => {
          throw new Error('released event was accessed');
        },
      },
    });
    expect(update(study()).elements[0].placement).toMatchObject({x: 54, z: 36});
  });
});
