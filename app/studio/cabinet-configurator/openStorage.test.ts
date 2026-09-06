import {describe, it, expect} from 'vitest';
import {
  OPEN_STORAGE,
  createOpenStorage,
  storageLayout,
  validStorage,
  type StorageKind,
} from './openStorage';
import {cabinetGeometry} from './kitchenGeometry';
import {validStudy} from './savedRoomProtocol';
import type {Study} from './CabinetConfigurator';
describe('open storage', () => {
  it('supports all seven types in saved rooms and produces matching interior geometry', () => {
    for (const type of Object.keys(OPEN_STORAGE) as StorageKind[]) {
      const item = createOpenStorage(type, type);
      expect(validStorage(item.storage)).toBe(true);
      const room: Study = {
        version: 2,
        room: {
          width: 144,
          depth: 120,
          height: 96,
          floor: 'oak',
          walls: 'plaster',
        },
        elements: [item],
        openings: [],
        islands: [],
        selected: null,
        countertop: true,
        view: 'split',
      };
      expect(validStudy(JSON.parse(JSON.stringify(room)))).toBe(true);
      const layout = storageLayout(item),
        group = cabinetGeometry(item, true);
      const count = (name: string) =>
        group.children.filter((c) => c.name === name).length;
      expect(count('storage-shelf')).toBe(layout.shelfYs.length);
      expect(count('storage-hanging-rod')).toBe(layout.rods.length);
      expect(count('storage-drawer-box')).toBe(layout.drawers);
      expect(count('cabinet-top')).toBe(1);
      expect(count('cabinet-front')).toBe(layout.drawers);
      expect(count('storage-divider')).toBe(type === 'combination' ? 1 : 0);
      group.traverse((child) => {
        if ('geometry' in child)
          (child.geometry as {dispose: () => void}).dispose();
      });
    }
  });
  it('renders optional doors, finished backs and shoe retaining lips', () => {
    const item = createOpenStorage('shoes', 's');
    item.width = 36;
    const open = cabinetGeometry(item, false);
    expect(
      open.children.filter((c) => c.name === 'shoe-retaining-lip'),
    ).toHaveLength(storageLayout(item).shelfYs.length);
    item.storage!.doors = true;
    const closed = cabinetGeometry(item, false);
    expect(
      closed.children.filter((c) => c.name === 'cabinet-front'),
    ).toHaveLength(2);
    item.storage!.back = false;
    expect(cabinetGeometry(item, false).children.length).toBe(
      closed.children.length - 1,
    );
  });
  it('bounds counts and keeps fitted shelves inside short and shallow units', () => {
    const item = createOpenStorage('shoes', 's');
    item.height = 12;
    item.depth = 36;
    item.storage!.shelves = 20;
    const layout = storageLayout(item);
    expect(layout.shelfYs.every((y) => y > layout.low && y < layout.high)).toBe(
      true,
    );
    expect(validStorage({...item.storage, shelves: 100000})).toBe(false);
    expect(validStorage({...item.storage, type: 'unknown'})).toBe(false);
    expect(validStorage({...item.storage, doors: 'yes'})).toBe(false);
  });
});
