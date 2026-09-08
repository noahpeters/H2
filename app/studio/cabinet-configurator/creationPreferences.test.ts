import {describe, expect, it} from 'vitest';
import {
  applyCreationPreferences,
  emptyCreationPreferences,
  loadCreationPreferences,
  rememberCreationPreferences,
  saveCreationPreferences,
} from './creationPreferences';
import {createKitchenAppliance, type KitchenElement, type Room} from './model';
import {createOpenStorage} from './openStorage';

const room: Room = {
  width: 144,
  depth: 120,
  height: 96,
  floor: 'oak',
  walls: 'plaster',
};
const cabinet = (kind: 'base' | 'wall-cabinet' | 'tall'): KitchenElement => ({
  id: `${kind}-1`,
  kind,
  width: 30,
  depth: kind === 'wall-cabinet' ? 12 : 24,
  height: kind === 'base' ? 34.5 : kind === 'wall-cabinet' ? 30 : 84,
  face: 'shaker',
  placement: {
    mode: 'wall',
    wall: 'back',
    offset: 42,
    elevation: kind === 'wall-cabinet' ? 54 : 0,
  },
});

describe('creation preferences', () => {
  it('carries same-family dimensions and shared cabinet finishes without placement', () => {
    const edited = {
      ...cabinet('base'),
      id: 'edited',
      width: 36,
      depth: 25,
      face: 'slab' as const,
      material: 'walnut' as const,
      paintColor: 'navy-blue' as const,
      configuration: 'three-drawer' as const,
      placement: {mode: 'floor' as const, x: 90, z: 70, rotation: 180},
      islandId: 'island-1',
    };
    const preferences = rememberCreationPreferences(
      emptyCreationPreferences(),
      edited,
    );
    const created = applyCreationPreferences(
      cabinet('base'),
      preferences,
      room,
    );

    expect(created).toMatchObject({
      id: 'base-1',
      width: 36,
      depth: 25,
      face: 'slab',
      material: 'walnut',
      configuration: 'three-drawer',
      placement: {mode: 'wall', wall: 'back', offset: 42, elevation: 0},
    });
    expect(created.islandId).toBeUndefined();
  });

  it('isolates dimensions by cabinet family and remembers wall elevation', () => {
    let preferences = rememberCreationPreferences(emptyCreationPreferences(), {
      ...cabinet('base'),
      width: 42,
    });
    preferences = rememberCreationPreferences(preferences, {
      ...cabinet('wall-cabinet'),
      width: 27,
      height: 36,
      placement: {mode: 'wall', wall: 'left', offset: 9, elevation: 48},
    });

    expect(
      applyCreationPreferences(cabinet('base'), preferences, room).width,
    ).toBe(42);
    expect(
      applyCreationPreferences(cabinet('wall-cabinet'), preferences, room),
    ).toMatchObject({
      width: 27,
      height: 36,
      placement: {wall: 'back', offset: 42, elevation: 48},
    });
    expect(
      applyCreationPreferences(cabinet('tall'), preferences, room).width,
    ).toBe(30);
  });

  it('keeps corner-base defaults separate from ordinary base cabinets', () => {
    let preferences = rememberCreationPreferences(emptyCreationPreferences(), {
      ...cabinet('base'),
      width: 27,
      depth: 25,
      configuration: 'three-drawer',
    });
    preferences = rememberCreationPreferences(preferences, {
      ...cabinet('base'),
      width: 39,
      depth: 38,
      configuration: 'corner',
    });

    expect(
      applyCreationPreferences(cabinet('base'), preferences, room),
    ).toMatchObject({
      width: 27,
      depth: 25,
      configuration: 'three-drawer',
    });
    expect(
      applyCreationPreferences(
        {...cabinet('base'), width: 36, depth: 36, configuration: 'corner'},
        preferences,
        room,
      ),
    ).toMatchObject({width: 39, depth: 38, configuration: 'corner'});
    expect(preferences.scopes).toHaveProperty('cabinet:corner-base');
  });

  it('does not turn a base cabinet into a corner from legacy preferences', () => {
    const preferences = emptyCreationPreferences();
    preferences.scopes['cabinet:base'] = {configuration: 'corner', width: 42};

    const created = applyCreationPreferences(cabinet('base'), preferences, room);
    expect(created.width).toBe(42);
    expect(created.configuration).toBeUndefined();
  });

  it('rejects invalid persisted dimensions and incompatible visual options', () => {
    const preferences = emptyCreationPreferences();
    preferences.scopes['cabinet:base'] = {width: -4, depth: 200, height: 120};
    preferences.sharedCabinet = {face: 'shaker-glass'};

    expect(
      applyCreationPreferences(cabinet('base'), preferences, room),
    ).toMatchObject({
      width: 30,
      depth: 24,
      height: 34.5,
      face: 'shaker',
    });
  });

  it('keeps the last normal tall profile after a specialty tall cabinet edit', () => {
    let preferences = rememberCreationPreferences(emptyCreationPreferences(), {
      ...cabinet('tall'),
      width: 33,
      tallConfiguration: 'standard',
    });
    preferences = rememberCreationPreferences(preferences, {
      ...cabinet('tall'),
      width: 48,
      face: 'slab',
      tallConfiguration: 'two-oven',
    });

    expect(
      applyCreationPreferences(cabinet('tall'), preferences, room),
    ).toMatchObject({
      width: 33,
      face: 'shaker',
      tallConfiguration: 'standard',
    });
  });

  it('scopes appliance and open-storage options to compatible types', () => {
    let preferences = rememberCreationPreferences(emptyCreationPreferences(), {
      ...createKitchenAppliance('dishwasher', 'dishwasher-1'),
      width: 26,
      applianceFront: 'slab',
    });
    preferences = rememberCreationPreferences(preferences, {
      ...createOpenStorage('shelving', 'shelf-1'),
      width: 44,
      storage: {...createOpenStorage('shelving', 'x').storage!, shelves: 7},
    });

    expect(
      applyCreationPreferences(
        createKitchenAppliance('dishwasher', 'new'),
        preferences,
        room,
      ),
    ).toMatchObject({width: 26, applianceFront: 'slab'});
    const refrigerator = applyCreationPreferences(
      createKitchenAppliance('refrigerator', 'new'),
      preferences,
      room,
    );
    expect(refrigerator.width).toBe(36);
    expect(refrigerator.applianceFront).toBeUndefined();
    expect(
      applyCreationPreferences(
        createOpenStorage('shelving', 'new'),
        preferences,
        room,
      ),
    ).toMatchObject({
      width: 44,
      storage: {type: 'shelving', shelves: 7},
    });
    expect(
      applyCreationPreferences(
        createOpenStorage('drawers', 'new'),
        preferences,
        room,
      ).width,
    ).toBe(30);
  });

  it('round-trips browser preferences independently of room snapshots', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const preferences = rememberCreationPreferences(
      emptyCreationPreferences(),
      {...cabinet('base'), width: 39},
    );
    saveCreationPreferences(storage, preferences);
    expect(loadCreationPreferences(storage)).toEqual(preferences);
    expect(loadCreationPreferences({getItem: () => '{broken'})).toEqual(
      emptyCreationPreferences(),
    );
  });
});
