import {describe, expect, it} from 'vitest';
import {
  applyConfiguration,
  configurationTemplate,
  saveConfiguration,
} from './designConfigurations';
import {validStudy} from '../savedRoomProtocol';
import {blankStudy, migrateStudy} from '../CabinetConfigurator';
import {createOpenStorage} from '../openStorage';
import type {KitchenElement} from '../model';
const cabinet: KitchenElement = {
  id: 'cabinet',
  kind: 'base',
  width: 36,
  height: 34.5,
  depth: 24,
  face: 'slab',
  configuration: 'three-drawer',
  placement: {mode: 'floor', x: 48, z: 48, rotation: 0},
};
describe('design-local configurations', () => {
  it('starts from standard drawers, names, and preserves the envelope and category', () => {
    const template = configurationTemplate(cabinet);
    expect(template.root).toMatchObject({
      sectionType: 'drawer-stack',
      properties: {drawerCount: 3},
    });
    expect(template.name).toBe('Custom three drawer');
    const saved = saveConfiguration([], cabinet, {
      ...template,
      name: ' Coffee station ',
      width: 80,
    });
    expect(saved.configurations[0].name).toBe('Coffee station');
    expect(saved.item).toMatchObject({
      kind: 'base',
      width: 36,
      height: 34.5,
      depth: 24,
    });
    expect(saved.item.customCabinet?.definition.width).toBe(36);
    expect(() =>
      saveConfiguration([], cabinet, {...template, name: ' '}),
    ).toThrow();
  });
  it('reuses snapshots at another width and does not live-update earlier instances', () => {
    const first = saveConfiguration(
      [],
      cabinet,
      configurationTemplate(cabinet),
    );
    const other = applyConfiguration(
      {...cabinet, id: 'other', width: 30},
      first.configurations[0],
    );
    expect(other.customCabinet?.definition.width).toBe(30);
    const revised = saveConfiguration(first.configurations, first.item, {
      ...first.item.customCabinet!.definition,
      name: 'Revised',
    });
    expect(revised.configurations).toHaveLength(1);
    expect(revised.configurations[0].version).toBe(2);
    expect(other.customCabinet?.libraryVersion).toBe(1);
    expect(other.customCabinet?.definition.name).toBe('Custom three drawer');
  });
  it('round-trips definitions, references and historical snapshots while loading old designs', () => {
    const first = saveConfiguration(
      [],
      cabinet,
      configurationTemplate(cabinet),
    );
    const revised = saveConfiguration(first.configurations, first.item, {
      ...first.item.customCabinet!.definition,
      name: 'Updated',
    });
    const study = {
      ...blankStudy(),
      configurations: revised.configurations,
      elements: [first.item],
    };
    expect(validStudy(study)).toBe(true);
    const loaded = migrateStudy(JSON.parse(JSON.stringify(study)));
    expect(loaded.configurations).toEqual(study.configurations);
    expect(loaded.elements[0].customCabinet).toEqual(first.item.customCabinet);
    expect(validStudy(blankStudy())).toBe(true);
    expect(validStudy({...study, configurations: []})).toBe(false);
    expect(validStudy({...study, configurations: [null]})).toBe(false);
    expect(
      validStudy({...study, elements: [{...first.item, customCabinet: null}]}),
    ).toBe(false);
  });
  it('rejects incompatible categories and seeds wall, tall and shelving cabinets', () => {
    const saved = saveConfiguration(
      [],
      cabinet,
      configurationTemplate(cabinet),
    );
    for (const kind of ['wall-cabinet', 'tall', 'appliance'] as const)
      expect(() =>
        applyConfiguration({...cabinet, kind}, saved.configurations[0]),
      ).toThrow();
    expect(() =>
      applyConfiguration(
        {...cabinet, configuration: 'corner'},
        saved.configurations[0],
      ),
    ).toThrow();
    expect(
      configurationTemplate({
        ...cabinet,
        kind: 'wall-cabinet',
        configuration: undefined,
      }).root,
    ).toMatchObject({sectionType: 'doors'});
    expect(
      configurationTemplate({
        ...cabinet,
        kind: 'tall',
        configuration: undefined,
      }).root,
    ).toMatchObject({sectionType: 'doors'});
    const shelves = createOpenStorage('shelving', 'shelves');
    expect(configurationTemplate(shelves).root).toMatchObject({
      sectionType: 'shelves',
      properties: {shelfCount: 5},
    });
    expect(() =>
      applyConfiguration(shelves, saved.configurations[0]),
    ).toThrow();
  });
});
