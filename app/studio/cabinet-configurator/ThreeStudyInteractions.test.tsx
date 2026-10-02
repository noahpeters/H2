import {cleanup, fireEvent, render} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {ThreeStudy, blankStudy} from './CabinetConfigurator';
import {doorPreview} from './custom-unit/doorGeometry';

let scene: THREE.Scene;
vi.mock('./studyScene', async (original) => {
  const actual = await original<typeof import('./studyScene')>();
  return {
    ...actual,
    StudyScene: class {
      root = new THREE.Group();
      selectable: THREE.Object3D[];
      constructor(scene: THREE.Scene) {
        const cabinet = new THREE.Group();
        cabinet.userData.id = 'cabinet';
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(18, 30, 0.75),
          new THREE.MeshStandardMaterial(),
        );
        mesh.name = 'cabinet-front';
        const rig = doorPreview(
          mesh,
          {
            id: 'front',
            kind: 'door',
            x: 0,
            y: 0,
            z: -0.75,
            width: 18,
            height: 30,
            depth: 0.75,
          },
          0,
        );
        cabinet.add(rig);
        this.root.add(cabinet);
        scene.add(this.root);
        this.selectable = [cabinet];
      }
      async update() {}
      dispose() {}
    },
  };
});
let frame: FrameRequestCallback;
function advance() {
  for (let i = 0; i < 20; i++) frame(0);
}
function opening(hit: THREE.Object3D) {
  return hit.parent!.rotation.y;
}

vi.spyOn(THREE, 'WebGLRenderer').mockImplementation(
  class {
    domElement = document.createElement('canvas');
    shadowMap = {};
    setPixelRatio = () => {};
    setSize = () => {};
    getSize = (size: THREE.Vector2) => size.set(100, 100);
    dispose = () => {};
    render = (current: THREE.Scene) => {
      scene = current;
    };
  } as unknown as typeof THREE.WebGLRenderer,
);

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.spyOn(THREE.Clock.prototype, 'getDelta').mockReturnValue(0.05);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(THREE.Clock.prototype.getDelta).mockRestore();
});

function setup(view: 'split' | 'three') {
  const onSelect = vi.fn();
  const study = {...blankStudy(), view};
  const result = render(<ThreeStudy study={study} onSelect={onSelect} />);
  let hit: THREE.Object3D | undefined;
  scene.traverse((object) => {
    if (!hit && object.name === 'cabinet-front') hit = object;
  });
  const pick = vi
    .spyOn(THREE.Raycaster.prototype, 'intersectObjects')
    .mockReturnValue([{object: hit!}] as THREE.Intersection[]);
  const canvas = result.container.querySelector('canvas')!;
  canvas.setPointerCapture = () => {};
  canvas.releasePointerCapture = () => {};
  const pointer = (type: string, x = 20) =>
    fireEvent(
      canvas,
      Object.assign(
        new MouseEvent(type, {
          button: 0,
          clientX: x,
          clientY: 20,
          bubbles: true,
        }),
        {pointerId: 1, pointerType: 'mouse'},
      ),
    );
  return {onSelect, hit: hit!, pick, pointer};
}

it('toggles the clicked door in three mode without selecting its cabinet', () => {
  const {onSelect, hit, pick, pointer} = setup('three');

  pointer('pointerdown');
  pointer('pointerup');
  advance();
  expect(opening(hit)).toBeCloseTo(Math.PI / 2);
  expect(onSelect).not.toHaveBeenCalled();
  pointer('pointerdown');
  pointer('pointerup');
  advance();
  expect(opening(hit)).toBe(0);
  pick.mockRestore();
});
it('selects cabinets in split mode without creating animated fronts', () => {
  const {onSelect, hit, pick, pointer} = setup('split');

  pointer('pointerdown');
  pointer('pointerup');
  expect(onSelect).toHaveBeenCalledOnce();
  expect(onSelect).toHaveBeenCalledWith('cabinet');
  advance();
  expect(opening(hit)).toBe(0);
  pick.mockRestore();
});
it('does not open a door after dragging the camera', () => {
  const {onSelect, hit, pick, pointer} = setup('three');
  pointer('pointerdown');
  pointer('pointermove', 40);
  pointer('pointerup', 40);
  advance();
  expect(opening(hit)).toBe(0);
  expect(onSelect).not.toHaveBeenCalled();
  pick.mockRestore();
});
