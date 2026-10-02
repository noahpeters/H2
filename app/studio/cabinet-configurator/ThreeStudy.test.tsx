import {act, cleanup, render} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import * as THREE from 'three';
import {blankStudy, ThreeStudy} from './CabinetConfigurator';

const graphics = vi.hoisted(() => ({
  create: vi.fn(),
  dispose: vi.fn(),
  frames: vi.fn(),
  canvas: undefined as HTMLCanvasElement | undefined,
  cameras: [] as unknown[],
  render: vi.fn(),
}));
vi.mock('./sceneRenderer', () => ({
  createCabinetRenderer(host: HTMLElement) {
    graphics.create();
    const scene = new THREE.Scene();
    const canvas = document.createElement('canvas');
    host.append(canvas);
    graphics.canvas = canvas;
    let width = 0,
      height = 0;
    return {
      scene,
      renderer: {
        domElement: canvas,
        render: (_scene: THREE.Scene, camera: THREE.PerspectiveCamera) => {
          graphics.cameras.push(camera);
          graphics.render();
        },
        dispose: graphics.dispose,
        getSize: (size: THREE.Vector2) => size.set(width, height),
        setSize: (w: number, h: number) => {
          width = w;
          height = h;
        },
      },
    };
  },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  graphics.cameras = [];
});

test('retains one renderer, canvas, camera and animation loop across study edits', async () => {
  vi.stubGlobal('requestAnimationFrame', graphics.frames.mockReturnValue(1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 800,
    height: 500,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 800,
    bottom: 500,
    toJSON() {},
  });
  const study = blankStudy();
  const view = render(<ThreeStudy study={study} />);
  const canvas = graphics.canvas;
  const camera = graphics.cameras[0] as THREE.PerspectiveCamera;
  camera.position.set(2, 3, 4);
  camera.fov = 47;
  camera.zoom = 1.4;
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      view.rerender(
        <ThreeStudy study={{...study, selected: `selection-${i}`}} />,
      );
    });
    expect(view.container.querySelector('canvas')).toBe(canvas);
    expect(camera.position.toArray()).toEqual([2, 3, 4]);
    expect(camera.fov).toBe(47);
    expect(camera.zoom).toBe(1.4);
  }
  expect(graphics.create).toHaveBeenCalledOnce();
  expect(graphics.frames).toHaveBeenCalledOnce();
  expect(graphics.dispose).not.toHaveBeenCalled();
  view.unmount();
  expect(graphics.dispose).toHaveBeenCalledOnce();
});

test('does not redraw an idle view after scene updates settle', async () => {
  let frame!: FrameRequestCallback;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  render(<ThreeStudy study={blankStudy()} />);
  await act(async () => {});
  act(() => frame(1));
  const renders = graphics.render.mock.calls.length;
  act(() => frame(2));
  act(() => frame(3));
  expect(graphics.render).toHaveBeenCalledTimes(renders);
});
