import {expect, test} from 'vitest';
import * as THREE from 'three';
import {
  addPhotoLighting,
  DEFAULT_PHOTO_SETTINGS,
  temperatureColor,
  validatePhotoSettings,
  visiblePhotoScene,
} from './photoLighting';
import {blankStudy} from './CabinetConfigurator';
import {openingGeometry} from './roomGeometry';

test('opening emitters follow real apertures, face inward, use separate colors and preserve source geometry', () => {
  const room = blankStudy().room;
  const scene = new THREE.Scene();
  const window = openingGeometry(
    {
      id: 'w',
      kind: 'window',
      wall: 'back',
      offset: 12,
      width: 36,
      height: 48,
      sill: 30,
    },
    room,
  );
  const doorway = openingGeometry(
    {
      id: 'd',
      kind: 'opening',
      wall: 'right',
      offset: 24,
      width: 32,
      height: 80,
    },
    room,
  );
  scene.add(
    window,
    doorway,
    new THREE.AmbientLight(),
    new THREE.DirectionalLight(),
  );
  const geometry = (window.children[0] as THREE.Mesh).geometry;
  const before = Array.from(geometry.attributes.position.array);
  addPhotoLighting(scene, DEFAULT_PHOTO_SETTINGS);
  const lights = scene.children.filter(
    (v) => v instanceof THREE.RectAreaLight,
  ) as THREE.RectAreaLight[];
  expect(lights).toHaveLength(2);
  expect(lights[0].width).toBeCloseTo(36 * 0.0254);
  expect(lights[0].height).toBeCloseTo(48 * 0.0254);
  expect(lights[0].position.y).toBeCloseTo(54 * 0.0254);
  expect(
    new THREE.Vector3(0, 0, -1).applyQuaternion(lights[0].quaternion).z,
  ).toBeCloseTo(1);
  expect(
    new THREE.Vector3(0, 0, -1).applyQuaternion(lights[1].quaternion).x,
  ).toBeCloseTo(-1);
  expect(lights[0].intensity).toBe(100);
  expect(lights[1].intensity).toBe(12);
  expect(lights[1].color.b / lights[1].color.r).toBeLessThan(
    lights[0].color.b / lights[0].color.r,
  );
  expect(Array.from(geometry.attributes.position.array)).toEqual(before);
  expect(scene.children.some((v) => v instanceof THREE.AmbientLight)).toBe(
    false,
  );
});

test('per-opening overrides, zero intensity and partition sources are deterministic', () => {
  const room = {
    ...blankStudy().room,
    partitions: [
      {
        id: 'segment-test' as const,
        x: 48,
        z: 24,
        length: 80,
        orientation: 'horizontal' as const,
      },
    ],
  };
  const create = () => {
    const scene = new THREE.Scene();
    scene.add(
      openingGeometry(
        {
          id: 'p',
          kind: 'opening',
          wall: 'segment-test',
          offset: 12,
          width: 24,
          height: 80,
        },
        room,
      ),
    );
    addPhotoLighting(scene, {
      ...DEFAULT_PHOTO_SETTINGS,
      openings: {p: {temperature: 4000, intensity: 20}},
    });
    return scene;
  };
  expect(create().toJSON()).toMatchObject({object: {type: 'Scene'}});
  const first = create().children.filter(
    (v) => v instanceof THREE.RectAreaLight,
  ) as THREE.RectAreaLight[];
  const second = create().children.filter(
    (v) => v instanceof THREE.RectAreaLight,
  ) as THREE.RectAreaLight[];
  expect(first).toHaveLength(2);
  expect(
    first.map((v) => [
      v.position.toArray(),
      v.quaternion.toArray(),
      v.color.toArray(),
      v.intensity,
    ]),
  ).toEqual(
    second.map((v) => [
      v.position.toArray(),
      v.quaternion.toArray(),
      v.color.toArray(),
      v.intensity,
    ]),
  );
  const dark = create();
  addPhotoLighting(dark, {
    ...DEFAULT_PHOTO_SETTINGS,
    openings: {p: {intensity: 0}},
  });
  expect(dark.children.filter((v) => v instanceof THREE.Light)).toHaveLength(0);
});

test('hidden ancestors are pruned only in the tracing view', () => {
  const scene = new THREE.Scene();
  const parent = new THREE.Group();
  parent.visible = false;
  parent.add(
    new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()),
  );
  scene.add(parent);
  expect(visiblePhotoScene(scene).children).toHaveLength(0);
  expect(scene.children[0].children).toHaveLength(1);
});

test('cutaway opening lights retain overrides while other hidden ancestors remain excluded', () => {
  const scene = new THREE.Scene();
  const room = blankStudy().room;
  for (const [id, intensity] of [['lit', 27], ['off', 0]] as const) {
    const opening = openingGeometry(
      {id, kind: 'window', wall: 'front', offset: 12, width: 36, height: 48},
      room,
    );
    opening.visible = false;
    scene.add(opening);
    expect(opening.userData.cutawayRoomWall).toBe(true);
    if (intensity === 27) {
      const hiddenParent = new THREE.Group();
      hiddenParent.visible = false;
      hiddenParent.add(opening.clone());
      scene.add(hiddenParent);
    }
  }
  addPhotoLighting(scene, {
    ...DEFAULT_PHOTO_SETTINGS,
    openings: {
      lit: {intensity: 27, temperature: 4000},
      off: {intensity: 0},
    },
  });
  const lights = visiblePhotoScene(scene).children.filter(
    (o) => o instanceof THREE.RectAreaLight,
  ) as THREE.RectAreaLight[];
  expect(lights).toHaveLength(1);
  expect(lights[0].name).toBe('photo-opening:lit:1');
  expect(lights[0].intensity).toBe(27);
  expect(lights[0].color).toEqual(temperatureColor(4000));
});

test('settings reject unbounded work and invalid colors; warm colors remain finite', () => {
  expect(() =>
    validatePhotoSettings({...DEFAULT_PHOTO_SETTINGS, samples: Infinity}),
  ).toThrow();
  expect(() =>
    validatePhotoSettings({
      ...DEFAULT_PHOTO_SETTINGS,
      openings: {w: {temperature: NaN}},
    }),
  ).toThrow();
  expect(temperatureColor(3000).toArray().every(Number.isFinite)).toBe(true);
});

test('derived tracer meshes have stable BVH order without modifying snapshot identities', () => {
  const source = new THREE.Scene();
  const group = new THREE.Group();
  group.add(
    new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()),
  );
  source.add(
    group,
    new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()),
  );
  const original: string[] = [];
  source.traverse((object) => original.push(object.uuid));
  const meshes = (scene: THREE.Scene) => {
    const ids: string[] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) ids.push(object.uuid);
    });
    return ids;
  };
  expect(meshes(visiblePhotoScene(source))).toEqual(
    meshes(visiblePhotoScene(source)),
  );
  const after: string[] = [];
  source.traverse((object) => after.push(object.uuid));
  expect(after).toEqual(original);
});
