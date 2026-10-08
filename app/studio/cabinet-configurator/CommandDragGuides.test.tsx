import {useEffect} from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import * as THREE from 'three';
import {
  blankStudy,
  CabinetConfigurator,
  type Study,
} from './CabinetConfigurator';

const state = vi.hoisted(() => ({
  initial: null as Study | null,
  latest: null as Study | null,
}));
vi.mock('./useSavedRooms', () => ({
  useSavedRooms(study: Study, setStudy: (study: Study) => void) {
    state.latest = study;
    useEffect(() => {
      setStudy(state.initial!);
    }, [setStudy]);
    return {
      recent: [],
      status: 'Saved',
      busy: false,
      error: false,
      ready: true,
    };
  },
}));
vi.mock('./studyScene', async (original) => ({
  ...(await original<typeof import('./studyScene')>()),
  StudyScene: class {
    assetErrors: string[] = [];
    root = new THREE.Group();
    ready = true;
    selectable = [];
    async update() {}
    dispose() {}
  },
}));
vi.mock('./sceneRenderer', () => ({
  createCabinetRenderer(host: HTMLElement) {
    const canvas = document.createElement('canvas');
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();
    host.append(canvas);
    return {
      scene: new THREE.Scene(),
      renderer: {
        domElement: canvas,
        render() {},
        dispose() {},
        setSize() {},
        getSize: (size: THREE.Vector2) => size.set(800, 500),
      },
    };
  },
}));

beforeEach(() => {
  const study = {...blankStudy(), view: 'plan' as const};
  study.elements = [
    {
      id: 'dragged',
      kind: 'base',
      width: 24,
      depth: 24,
      height: 34.5,
      face: 'slab',
      placement: {mode: 'floor', x: 48, z: 48, rotation: 0},
    },
    {
      id: 'neighbor',
      kind: 'base',
      width: 24,
      depth: 24,
      height: 34.5,
      face: 'slab',
      placement: {mode: 'floor', x: 72.875, z: 48, rotation: 0},
    },
  ];
  study.selected = 'dragged';
  state.initial = study;
  localStorage.clear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  Object.defineProperty(SVGElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(SVGElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(SVGElement.prototype, 'getScreenCTM', {
    configurable: true,
    value: () => ({a: 1}),
  });
  vi.stubGlobal('PointerEvent', MouseEvent);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('Command changes drag snapping while keeping live positioning guides visible', () => {
  render(<CabinetConfigurator />);
  const plan = screen.getByLabelText('Dimensioned room plan');
  const item = plan.querySelector('.cc-cab.selected')!;
  fireEvent.pointerDown(item, {
    button: 0,
    clientX: 100,
    clientY: 100,
    metaKey: true,
  });
  expect(screen.getByLabelText('Positioning aids')).toBeInTheDocument();
  fireEvent.pointerMove(plan, {clientX: 102, clientY: 100, metaKey: true});
  expect(screen.getByLabelText('Positioning aids')).toBeInTheDocument();
  const freeX = (state.latest!.elements[0].placement as {x: number}).x;
  fireEvent.keyUp(window, {key: 'Meta', metaKey: false});
  expect(screen.getByLabelText('Positioning aids')).toBeInTheDocument();
  const snappedX = (state.latest!.elements[0].placement as {x: number}).x;
  expect(freeX).not.toBe(snappedX);
  fireEvent.keyDown(window, {key: 'Meta', metaKey: true});
  expect(screen.getByLabelText('Positioning aids')).toBeInTheDocument();
  expect((state.latest!.elements[0].placement as {x: number}).x).toBe(freeX);
  fireEvent.pointerUp(plan, {metaKey: true});
  expect(screen.queryByLabelText('Positioning aids')).not.toBeInTheDocument();
});

test('Command keeps the elevation alignment hint visible without committing its snap', () => {
  const study = {...blankStudy(), view: 'plan' as const};
  study.elements = [
    {
      id: 'upper',
      kind: 'wall-cabinet',
      width: 24,
      depth: 12,
      height: 30,
      face: 'slab',
      placement: {mode: 'wall', wall: 'back', offset: 20, elevation: 54},
    },
    {
      id: 'neighbor-upper',
      kind: 'wall-cabinet',
      width: 24,
      depth: 12,
      height: 30,
      face: 'slab',
      placement: {mode: 'wall', wall: 'back', offset: 20, elevation: 54.25},
    },
  ];
  study.selected = 'upper';
  state.initial = study;
  render(<CabinetConfigurator />);
  const hint = () =>
    screen
      .getAllByRole('status')
      .find((e) => e.textContent?.includes('alignment at'));
  expect(hint()).toBeDefined();
  fireEvent.keyDown(window, {key: 'Meta', metaKey: true});
  expect(hint()).toBeDefined();
  fireEvent.change(screen.getByLabelText('Bottom height above floor (in)'), {
    target: {value: '54.125'},
  });
  expect(state.latest!.elements[0].placement.elevation).toBe(54.125);
  expect(hint()).toBeDefined();
  fireEvent.keyUp(window, {key: 'Meta', metaKey: false});
  expect(hint()).toBeDefined();
});

test.each(['wall', 'floor'] as const)(
  'raised %s panels keep their floor height and stay below the ceiling when resized',
  (mode) => {
    const study = {...blankStudy(), view: 'plan' as const};
    study.room.height = 96;
    study.elements = [
      {
        id: 'panel',
        kind: 'panel',
        width: 0.75,
        depth: 24,
        height: 30,
        face: 'slab',
        placement:
          mode === 'wall'
            ? {mode: 'wall', wall: 'back', offset: 20, elevation: 0}
            : {mode: 'floor', x: 48, z: 48, rotation: 0, elevation: 0},
      },
    ];
    study.selected = 'panel';
    state.initial = study;
    render(<CabinetConfigurator />);
    const bottom = screen.getByLabelText('Bottom height above floor (in)');
    const height = screen.getByLabelText('Height (in)');
    fireEvent.change(bottom, {target: {value: '20'}});
    expect(state.latest!.elements[0].placement.elevation).toBe(20);
    expect(height).toHaveAttribute('max', '76');
    fireEvent.change(bottom, {target: {value: '-1'}});
    fireEvent.change(bottom, {target: {value: '67'}});
    expect(state.latest!.elements[0].placement.elevation).toBe(20);
    fireEvent.change(height, {target: {value: '77'}});
    expect(state.latest!.elements[0].height).toBe(30);
    fireEvent.change(height, {target: {value: '76'}});
    expect(state.latest!.elements[0].height).toBe(76);
    expect(state.latest!.elements[0].placement.elevation).toBe(20);
    expect(bottom).toHaveAttribute('max', '20');
  },
);
