import {createCustomUnit} from './custom-unit/model';
import {createSink} from './sinkAttachments';
import type {Room} from './model';
import {expect, it} from 'vitest';
import {
  cabinetTypes,
  cabinetCategory,
  CABINET_CATEGORIES,
  applyCabinetType,
  selectedCabinetType,
} from './cabinetTypes';
import {
  configurationTemplate,
  saveConfiguration,
} from './custom-unit/designConfigurations';
import {sinkAttachment} from './sinkAttachments';
import {validStudy} from './savedRoomProtocol';
const room: Room = {
  width: 144,
  depth: 120,
  height: 96,
  floor: 'oak' as const,
  walls: 'white' as const,
};
it.each(CABINET_CATEGORIES)(
  'offers standard and user-created %s types for both creation and replacement',
  (category) => {
    const standard = cabinetTypes().find((c) => c.category === category)!;
    const saved = saveConfiguration(
      [],
      standard.item,
      {...configurationTemplate(standard.item, room), name: `My ${category}`},
      room,
    );
    const choices = cabinetTypes(saved.configurations, [saved.item]).filter(
      (c) => c.category === category,
    );
    expect(choices.map((c) => c.id)).toContain(standard.id);
    const custom = choices.find((c) => c.label === `My ${category}`)!;
    const added = applyCabinetType({...custom.item, id: 'added'}, custom, room);
    const replaced = applyCabinetType(
      {...standard.item, id: 'existing', width: 42},
      custom,
      room,
    );
    expect(selectedCabinetType(added)).toBe(custom.id);
    expect(selectedCabinetType(replaced)).toBe(custom.id);
    expect(replaced.width).toBe(42);
    expect(cabinetCategory(replaced)).toBe(category);
    expect(
      validStudy({
        version: 2,
        room,
        elements: [added, replaced],
        islands: [],
        openings: [],
        countertop: true,
        view: 'split',
        configurations: saved.configurations,
      }),
    ).toBe(true);
  },
);
it('organizes open storage by mounting category while preserving saved subtypes', () => {
  const standards = cabinetTypes().filter((c) => c.item.storage);
  expect(standards).toHaveLength(8);
  for (const standard of standards) {
    const saved = saveConfiguration(
      [],
      standard.item,
      configurationTemplate(standard.item, room),
      room,
    );
    const custom = cabinetTypes(saved.configurations, [saved.item]).find(
      (c) => c.configuration,
    )!;
    const switched = applyCabinetType(
      standards.find((c) => c.item.kind === custom.item.kind)!.item,
      custom,
      room,
    );
    expect(switched.storage?.type).toBe(standard.item.storage?.type);
    expect(switched.kind).toBe(standard.item.kind);
  }
});
it('standard thumbnails and replacements do not inherit the selected sink', () => {
  const choices = cabinetTypes();
  const sink = choices.find((c) => c.id === 'base:sink')!;
  const drawers = choices.find((c) => c.id === 'base:three-drawer')!;
  expect(sinkAttachment(sink.item)?.kind).toBe('undermount');
  expect(sinkAttachment(drawers.item)).toBeNull();
  expect(sinkAttachment(applyCabinetType(sink.item, drawers, room))).toBeNull();
});

it('restores all seven original base types, including both distinct sink fittings', () => {
  const base = cabinetTypes().filter((c) => c.category === 'Base');
  expect(base.map((c) => c.id)).toEqual([
    'base:single-door',
    'base:pullout',
    'base:door-drawer',
    'base:three-drawer',
    'base:microwave-drawer',
    'base:sink',
    'base:farmhouse-sink',
    'corner',
  ]);
  expect(
    sinkAttachment(base.find((c) => c.id === 'base:farmhouse-sink')!.item)
      ?.kind,
  ).toBe('farmhouse');
});

it('never offers or applies a cabinet type from another mounting category', () => {
  const choices = cabinetTypes();
  expect(CABINET_CATEGORIES).toEqual(['Base', 'Wall', 'Tall']);
  for (const choice of choices) {
    expect(choice.category).toBe(cabinetCategory(choice.item));
    const different = choices.find((c) => c.item.kind !== choice.item.kind)!;
    expect(() => applyCabinetType(choice.item, different, room)).toThrow(
      'same cabinet category',
    );
  }
});

it('keeps saved designs and their sinks available after the last instance is removed', () => {
  const standard = cabinetTypes().find((c) => c.id === 'base:single-door')!;
  const item = {...standard.item, sink: createSink('vessel')};
  const saved = saveConfiguration(
    [],
    item,
    configurationTemplate(item, room),
    room,
  );
  const choices = cabinetTypes(saved.configurations, []);
  const choice = choices.find((c) => c.configuration)!;
  expect(choice.item.sink).toEqual(item.sink);
  expect(applyCabinetType(standard.item, choice, room).sink).toEqual(item.sink);
  expect(
    validStudy({
      version: 2,
      room,
      elements: [],
      islands: [],
      openings: [],
      countertop: true,
      view: 'split',
      configurations: saved.configurations,
    }),
  ).toBe(true);
});
it.each(['base', 'wall-cabinet', 'tall'] as const)(
  'offers published %s designs in the same catalog and preserves instance dimensions',
  (kind) => {
    const library = {
      id: `custom-${kind}`,
      version: 1,
      name: `Custom ${kind}`,
      description: '',
      tags: [],
      status: 'published' as const,
      updatedAt: '',
      definition: createCustomUnit({cabinetCategory: kind, height: 30}),
    };
    const choices = cabinetTypes([], [], [library]);
    const custom = choices.find((c) => c.id === `library:${library.id}`)!;
    expect(custom.item.kind).toBe(kind);
    const standard = choices.find((c) => c.item.kind === kind)!;
    const replaced = applyCabinetType(
      {...standard.item, width: 36},
      custom,
      room,
    );
    expect(replaced.width).toBe(36);
    expect(replaced.height).toBe(standard.item.height);
    expect(replaced.customCabinet?.libraryId).toBe(library.id);
    expect(selectedCabinetType(replaced)).toBe(custom.id);
    expect(
      cabinetTypes([], [replaced], []).find((c) => c.id === custom.id),
    ).toBeDefined();
    expect(
      cabinetTypes([], [], [{...library, status: 'draft'}]).some(
        (c) => c.id === custom.id,
      ),
    ).toBe(false);
  },
);
