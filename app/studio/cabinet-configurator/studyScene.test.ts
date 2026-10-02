import {expect, test, vi} from 'vitest';
import * as THREE from 'three';
import {blankStudy, type Study} from './CabinetConfigurator';
import {StudyScene} from './studyScene';

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
    .mockImplementation((_url, onLoad) => {
      const texture = new THREE.Texture();
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
    const geometry = mesh.geometry,
      material = mesh.material as THREE.MeshStandardMaterial;
    const dispose = vi.fn();
    material.map!.addEventListener('dispose', dispose);
    const room = content.root.children[0];
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
      expect(firstMesh(cabinet).geometry).toBe(geometry);
      expect(firstMesh(cabinet).material).toBe(material);
      expect(content.root.children[0]).toBe(room);
      expect(cabinet.position.x).toBeCloseTo(
        (-study.room.width / 2 + 30 + i) * 0.0254,
      );
      expect(cabinet.rotation.y).toBeCloseTo((-i * 2 * Math.PI) / 180);
    }
    expect(load).toHaveBeenCalledTimes(4);
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
    .mockImplementation((_url, onLoad) => {
      const texture = new THREE.Texture();
      loaded.push(() => onLoad?.(texture));
      return texture;
    });
  const content = new StudyScene(new THREE.Scene()),
    study = sample();
  try {
    const legacy = {
      ...study,
      elements: [{...study.elements[0], material: 'walnut' as const}],
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
    .mockImplementation((_url, onLoad) => {
      const texture = new THREE.Texture();
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
      elements: [{...study.elements[0], material: 'walnut' as const}],
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
  const content = new StudyScene(new THREE.Scene());
  const study = sample();
  study.elements[0].material = 'walnut';
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
  }
});
