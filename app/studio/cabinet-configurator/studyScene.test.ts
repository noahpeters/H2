import {expect, test, vi} from 'vitest';
import * as THREE from 'three';
import {blankStudy, type Study} from './CabinetConfigurator';
import {StudyScene} from './studyScene';
import {CABINET_MATERIAL_DEFINITIONS} from './materials';

function sample(): Study {
  return {
    ...blankStudy(),
    elements: [
      {
        id: 'oak',
        kind: 'base',
        width: 30,
        height: 34.5,
        depth: 24,
        face: 'shaker',
        material: 'plain-white-oak',
        placement: {mode: 'floor', x: 30, z: 30, rotation: 0},
      },
    ],
    selected: 'oak',
  };
}
function firstMesh(object: THREE.Object3D) {
  let found: THREE.Mesh | undefined;
  object.traverse((child) => {
    if (!found && child instanceof THREE.Mesh) found = child;
  });
  return found!;
}

test('drag and selection updates reuse loaded meshes, maps and room geometry', async () => {
  const loaded: (() => void)[] = [];
  const load = vi
    .spyOn(THREE.TextureLoader.prototype, 'load')
    .mockImplementation((url, onLoad) => {
      const texture = new THREE.Texture();
      if (url.startsWith('/textures/room/')) {
        queueMicrotask(() => onLoad?.(texture));
        return texture;
      }
      loaded.push(() => onLoad?.(texture));
      return texture;
    });
  const scene = new THREE.Scene(),
    content = new StudyScene(scene),
    study = sample();
  try {
    const pending = content.update(study);
    expect(loaded).toHaveLength(4);
    loaded.forEach((done) => done());
    await pending;
    const cabinet = content.selectable[0],
      mesh = firstMesh(cabinet);
    expect(cabinet.userData.objectLibrary).toEqual({
      libraryId: 'cabinitron-core',
      objectId: 'core:cabinet:base:single-door',
    });
    const geometry = mesh.geometry,
      material = mesh.material as THREE.MeshStandardMaterial;
    const dispose = vi.fn();
    material.map!.addEventListener('dispose', dispose);
    const room = content.root.children[0];
    const initialLoads = load.mock.calls.length;
    for (let i = 1; i <= 20; i++) {
      await content.update({
        ...study,
        selected: i % 2 ? null : 'oak',
        elements: [
          {
            ...study.elements[0],
            placement: {mode: 'floor', x: 30 + i, z: 30, rotation: i * 2},
          },
        ],
      });
      expect(content.selectable[0]).toBe(cabinet);
      expect(cabinet.userData.objectLibrary.objectId).toBe(
        'core:cabinet:base:single-door',
      );
      expect(firstMesh(cabinet).geometry).toBe(geometry);
      expect(firstMesh(cabinet).material).toBe(material);
      expect(content.root.children[0]).toBe(room);
      expect(cabinet.position.x).toBeCloseTo(
        (-study.room.width / 2 + 30 + i) * 0.0254,
      );
      expect(cabinet.rotation.y).toBeCloseTo((-i * 2 * Math.PI) / 180);
    }
    expect(
      load.mock.calls.filter(([url]) => !url.startsWith('/textures/room/')),
    ).toHaveLength(4);
    expect(load).toHaveBeenCalledTimes(initialLoads);
    expect(dispose).not.toHaveBeenCalled();
    content.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  } finally {
    content.dispose();
    load.mockRestore();
  }
});

test('keeps visible meshes until new maps settle and commits the latest drag without restarting loads', async () => {
  const loaded: (() => void)[] = [];
  const load = vi
    .spyOn(THREE.TextureLoader.prototype, 'load')
    .mockImplementation((url, onLoad) => {
      const texture = new THREE.Texture();
      if (url.startsWith('/textures/room/')) {
        queueMicrotask(() => onLoad?.(texture));
        return texture;
      }
      loaded.push(() => onLoad?.(texture));
      return texture;
    });
  const content = new StudyScene(new THREE.Scene()),
    study = sample();
  try {
    const legacy = {
      ...study,
      elements: [
        {
          ...study.elements[0],
          material: 'walnut' as const,
          materialDefinition: {
            ...CABINET_MATERIAL_DEFINITIONS.walnut,
            textures: undefined,
            textureSize: undefined,
            pbr: {color: '#72513d'},
          },
        },
      ],
    };
    await content.update(legacy);
    const visible = content.selectable[0];
    const geometryDispose = vi.spyOn(firstMesh(visible).geometry, 'dispose');
    const initial = content.update(study);
    const latest = {
      ...study,
      elements: [
        {
          ...study.elements[0],
          placement: {mode: 'floor' as const, x: 75, z: 50, rotation: 90},
        },
      ],
    };
    const dragged = content.update(latest);
    expect(content.selectable[0]).toBe(visible);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(loaded).toHaveLength(4);
    loaded.forEach((done) => done());
    await Promise.all([initial, dragged]);
    expect(content.selectable[0]).not.toBe(visible);
    expect(content.selectable[0].position.x).toBeCloseTo(
      (-study.room.width / 2 + 75) * 0.0254,
    );
    expect(content.selectable[0].rotation.y).toBeCloseTo(-Math.PI / 2);
    expect(geometryDispose).toHaveBeenCalledOnce();
  } finally {
    content.dispose();
    load.mockRestore();
  }
});

test('superseded loads never restore removed objects, and changed dimensions rebuild exact geometry', async () => {
  const loaded: (() => void)[] = [];
  const load = vi
    .spyOn(THREE.TextureLoader.prototype, 'load')
    .mockImplementation((url, onLoad) => {
      const texture = new THREE.Texture();
      if (url.startsWith('/textures/room/')) {
        queueMicrotask(() => onLoad?.(texture));
        return texture;
      }
      loaded.push(() => onLoad?.(texture));
      return texture;
    });
  const scene = new THREE.Scene(),
    content = new StudyScene(scene),
    study = sample();
  try {
    const pending = content.update(study);
    await content.update({...study, elements: [], selected: null});
    loaded.forEach((done) => done());
    await pending;
    expect(content.selectable).toHaveLength(0);
    const walnut = {
      ...study,
      countertop: false,
      elements: [
        {
          ...study.elements[0],
          material: 'walnut' as const,
          materialDefinition: {
            ...CABINET_MATERIAL_DEFINITIONS.walnut,
            textures: undefined,
            textureSize: undefined,
            pbr: {color: '#72513d'},
          },
        },
      ],
    };
    await content.update(walnut);
    const before = content.selectable[0];
    await content.update({
      ...walnut,
      elements: [{...walnut.elements[0], width: 42}],
    });
    const after = content.selectable[0];
    expect(after).not.toBe(before);
    const size = new THREE.Box3()
      .setFromObject(after)
      .getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(42 * 0.0254);
    content.dispose();
    expect(scene.children).toHaveLength(0);
  } finally {
    content.dispose();
    load.mockRestore();
  }
});

test('hides selection in three mode and restores it in split without rebuilding cabinets', async () => {
  const load = vi
    .spyOn(THREE.TextureLoader.prototype, 'load')
    .mockImplementation((_url, onLoad) => {
      const texture = new THREE.Texture();
      queueMicrotask(() => onLoad?.(texture));
      return texture;
    });
  const content = new StudyScene(new THREE.Scene());
  const study = sample();
  try {
    await content.update({...study, view: 'split'});
    const cabinet = content.selectable[0];
    expect(
      content.root.children.some((object) => object instanceof THREE.BoxHelper),
    ).toBe(true);
    await content.update({...study, view: 'three'});
    expect(content.selectable[0]).toBe(cabinet);
    expect(
      content.root.children.some((object) => object instanceof THREE.BoxHelper),
    ).toBe(false);
    await content.update({...study, view: 'split'});
    expect(content.selectable[0]).toBe(cabinet);
    expect(
      content.root.children.some((object) => object instanceof THREE.BoxHelper),
    ).toBe(true);
  } finally {
    content.dispose();
    load.mockRestore();
  }
});

test('rebuilds the adjacent countertop when a tall cabinet moves away and back', async () => {
  const load = vi
    .spyOn(THREE.TextureLoader.prototype, 'load')
    .mockImplementation((_url, onLoad) => {
      const texture = new THREE.Texture();
      queueMicrotask(() => onLoad?.(texture));
      return texture;
    });
  const content = new StudyScene(new THREE.Scene());
  const study = sample();
  study.countertop = true;
  const neighbor = {
    ...study.elements[0],
    id: 'tall',
    kind: 'tall' as const,
    height: 84,
    placement: {mode: 'floor' as const, x: 60, z: 30, rotation: 0},
  };
  const edge = () => {
    const object = content.selectable.find(
      (item) => item.userData.id === 'oak',
    )!;
    const top = object.getObjectByName('cabinet-countertop')!;
    object.updateMatrixWorld(true);
    // Compare in world coordinates: the base center is x=30 inches.
    return (
      new THREE.Box3().setFromObject(top).max.x / 0.0254 + study.room.width / 2
    );
  };
  try {
    await content.update({...study, elements: [...study.elements, neighbor]});
    expect(edge()).toBeCloseTo(44.98);
    await content.update({
      ...study,
      elements: [
        ...study.elements,
        {...neighbor, placement: {...neighbor.placement, x: 90}},
      ],
    });
    expect(edge()).toBeCloseTo(46);
    await content.update({...study, elements: [...study.elements, neighbor]});
    expect(edge()).toBeCloseTo(44.98);
  } finally {
    content.dispose();
    load.mockRestore();
  }
});

test('rebuilds continuous frames when neighbors move or the room option changes', async () => {
  const load = vi
    .spyOn(THREE.TextureLoader.prototype, 'load')
    .mockImplementation((_url, onLoad) => {
      const texture = new THREE.Texture();
      queueMicrotask(() => onLoad?.(texture));
      return texture;
    });
  const content = new StudyScene(new THREE.Scene()),
    study = sample();
  study.room = {...study.room, overlay: 'inset', continuousFaceFrames: true};
  const neighbor = {
    ...study.elements[0],
    id: 'next',
    placement: {mode: 'floor' as const, x: 60, z: 30, rotation: 0},
  };
  const count = () =>
    content.selectable.reduce(
      (n, o) =>
        n + o.children.filter((c) => c.name === 'cabinet-face-frame').length,
      0,
    );
  try {
    await content.update({...study, elements: [...study.elements, neighbor]});
    expect(count()).toBe(7);
    await content.update({
      ...study,
      elements: [
        ...study.elements,
        {...neighbor, placement: {...neighbor.placement, x: 65}},
      ],
    });
    expect(count()).toBe(8);
    await content.update({...study, elements: [...study.elements, neighbor]});
    expect(count()).toBe(7);
    await content.update({
      ...study,
      room: {...study.room, continuousFaceFrames: false},
      elements: [...study.elements, neighbor],
    });
    expect(count()).toBe(8);
  } finally {
    content.dispose();
    load.mockRestore();
  }
});

test('island tops update frame and edge allowances without growing when members move', async () => {
  const load = vi
    .spyOn(THREE.TextureLoader.prototype, 'load')
    .mockImplementation((_url, onLoad) => {
      const texture = new THREE.Texture();
      queueMicrotask(() => onLoad?.(texture));
      return texture;
    });
  const content = new StudyScene(new THREE.Scene());
  const study = sample();
  study.countertop = true;
  study.islands = [
    {
      id: 'island',
      x: 30,
      z: 30,
      width: 30,
      depth: 24,
      rotation: 0,
      seatingSide: 'none',
      overhang: 0,
    },
  ];
  study.elements[0].islandId = 'island';
  const top = () => content.root.getObjectByName('island-countertop')!;
  const front = () => new THREE.Box3().setFromObject(top()).max.z / 0.0254;
  try {
    await content.update(study);
    const first = top();
    const initialFront = front();
    study.room.overlay = 'inset';
    await content.update(study);
    expect(top()).not.toBe(first);
    expect(front() - initialFront).toBeCloseTo(0.75);
    const framed = top();
    study.room.islandCountertopOverhang = 0.25;
    await content.update(study);
    expect(top()).not.toBe(framed);
    expect(front() - initialFront).toBeCloseTo(0.875);
    const adjusted = top();
    study.elements[0].placement = {mode: 'floor', x: 30, z: 31, rotation: 0};
    await content.update(study);
    expect(top()).not.toBe(adjusted);
    expect(front() - initialFront).toBeCloseTo(0.875);
  } finally {
    content.dispose();
    load.mockRestore();
  }
});

test('toggling maple internals rebuilds the live cabinet and restores its original finish when disabled', async () => {
  const load = vi
    .spyOn(THREE.TextureLoader.prototype, 'load')
    .mockImplementation((_url, onLoad) => {
      const texture = new THREE.Texture();
      queueMicrotask(() => onLoad?.(texture));
      return texture;
    });
  const content = new StudyScene(new THREE.Scene());
  const study = sample();
  study.elements[0].material = 'walnut';
  study.elements[0].configuration = 'three-drawer';
  try {
    await content.update(study);
    const original = content.selectable[0];
    const back = (object: THREE.Object3D) =>
      object.getObjectByName('cabinet-back-panel') as THREE.Mesh;
    expect(back(original).material).toHaveProperty(
      'userData.materialDefinition.id',
      'walnut',
    );
    await content.update({
      ...study,
      room: {...study.room, useMapleInternals: true},
    });
    const maple = content.selectable[0];
    expect(maple).not.toBe(original);
    expect(back(maple).material).toHaveProperty(
      'userData.materialDefinition.id',
      'maple',
    );
    expect(
      (maple.getObjectByName('cabinet-front') as THREE.Mesh).material,
    ).toHaveProperty('userData.materialDefinition.id', 'walnut');
    await content.update({
      ...study,
      room: {...study.room, useMapleInternals: false},
    });
    expect(back(content.selectable[0]).material).toHaveProperty(
      'userData.materialDefinition.id',
      'walnut',
    );
  } finally {
    content.dispose();
    load.mockRestore();
  }
});
