import {describe, expect, it} from 'vitest';
import {createDragUpdate, type Study} from './CabinetConfigurator';
import type {KitchenElement} from './model';

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
  ] as KitchenElement[],
  islands: [],
  selected: 'island-appliance',
  countertop: true,
  view: 'plan' as const,
});

describe('createDragUpdate', () => {
  it('moves an island and only its grouped objects together', () => {
    const current: Study = study();
    current.islands = [
      {
        id: 'zone',
        x: 60,
        z: 60,
        width: 72,
        depth: 42,
        rotation: 0,
        overhang: 12,
        seatingSide: 'none',
      },
    ];
    current.elements[0].islandId = 'zone';
    current.elements.push({
      ...current.elements[0],
      id: 'ungrouped',
      islandId: undefined,
    });
    const update = createDragUpdate(
      {id: 'zone', mode: 'island', x: 60, z: 60, clientX: 10, clientY: 10},
      30,
      20,
      2,
    );
    const moved = update(current);
    expect(moved.islands[0]).toMatchObject({x: 70, z: 65});
    expect(moved.elements[0].placement).toMatchObject({x: 58, z: 47});
    expect(moved.elements[1].placement).toEqual(current.elements[1].placement);
    expect(current.islands[0].x).toBe(60);
  });
  it('moves a floor-positioned appliance on both axes with 1-inch precision', () => {
    const update = createDragUpdate(
      {
        id: 'island-appliance',
        mode: 'floor',
        x: 48,
        z: 42,
        clientX: 20,
        clientY: 30,
      },
      30,
      20,
      2,
    );
    expect(update(study()).elements[0].placement).toMatchObject({
      mode: 'floor',
      x: 53,
      z: 37,
    });
  });

  it('does not access a released pointer event from a deferred update', () => {
    const event = {clientX: 32, clientY: 18};
    const update = createDragUpdate(
      {
        id: 'island-appliance',
        mode: 'floor',
        x: 48,
        z: 42,
        clientX: 20,
        clientY: 30,
      },
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

  it('moves a newly added wall-positioned appliance like a wall cabinet', () => {
    const wallStudy = study();
    wallStudy.elements[0].placement = {
      mode: 'wall',
      wall: 'back',
      offset: 12,
      elevation: 0,
    };
    const update = createDragUpdate(
      {
        id: 'island-appliance',
        mode: 'wall',
        wall: 'back',
        offset: 12,
        pointer: 20,
      },
      32,
      18,
      2,
    );

    expect(update(wallStudy).elements[0].placement).toMatchObject({
      mode: 'wall',
      offset: 18,
    });
  });
});
