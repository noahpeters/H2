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
  study.room.partitions = [
    {id: 'segment-divider', x: 72, z: 0, length: 120, orientation: 'vertical'},
  ];
  study.openings = [
    {
      id: 'window',
      kind: 'window',
      wall: 'back',
      offset: 12,
      width: 30,
      height: 38,
      sill: 42,
    },
    {
      id: 'door',
      kind: 'door',
      wall: 'segment-divider',
      offset: 12,
      width: 30,
      height: 80,
    },
  ];
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

test('walls and openings only select or drag during room editing, and handles disappear on exit', () => {
  render(<CabinetConfigurator />);
  const wall = screen.getByLabelText(/Edit Interior wall 1/);
  const door = screen.getByLabelText('door on segment-divider wall');
  const window = screen.getByLabelText('window on back wall');
  const original = JSON.stringify(state.latest);
  expect(screen.queryByLabelText(/Wall to edit/i)).not.toBeInTheDocument();
  for (const target of [wall, door, window]) {
    expect(target).not.toHaveAttribute('tabindex');
    expect(target).not.toHaveAttribute('role', 'button');
    fireEvent.click(target);
    fireEvent.keyDown(target, {key: 'Enter'});
    fireEvent.pointerDown(target, {button: 0, clientX: 0, clientY: 0});
    fireEvent.pointerMove(screen.getByLabelText('Dimensioned room plan'), {
      clientX: 40,
      clientY: 40,
    });
  }
  expect(JSON.stringify(state.latest)).toBe(original);
  expect(screen.queryByLabelText('Resize wall end')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Edit room outline'));
  fireEvent.keyDown(wall, {key: 'Enter'});
  expect(screen.getByLabelText(/Wall to edit/i)).toHaveValue('segment-divider');
  fireEvent.change(screen.getByLabelText(/Selected wall thickness/i), {
    target: {value: '8'},
  });
  expect(state.latest!.room.wallThicknesses?.['segment-divider']).toBe(8);
  expect(screen.getByLabelText('Resize wall end')).toBeInTheDocument();
  fireEvent.keyDown(screen.getByLabelText('Resize wall end'), {key: 'ArrowUp'});
  expect(state.latest!.room.partitions![0].length).toBe(119);
  fireEvent.keyDown(door, {key: 'Enter'});
  expect(state.latest!.selected).toBe('door');
  expect(door).toHaveAttribute('tabindex', '0');
  fireEvent.pointerDown(door, {button: 0, clientX: 0, clientY: 0});
  fireEvent.pointerMove(screen.getByLabelText('Dimensioned room plan'), {
    clientX: 0,
    clientY: 20,
  });
  expect(state.latest!.openings[1].offset).not.toBe(12);
  fireEvent.click(screen.getByText('Done editing outline'));
  expect(screen.queryByLabelText(/Wall to edit/i)).not.toBeInTheDocument();
  expect(state.latest!.selected).toBeNull();
  expect(screen.queryByLabelText('Resize wall end')).not.toBeInTheDocument();
  const stopped = JSON.stringify(state.latest);
  fireEvent.pointerMove(screen.getByLabelText('Dimensioned room plan'), {
    clientX: 100,
    clientY: 100,
  });
  fireEvent.click(door);
  expect(JSON.stringify(state.latest)).toBe(stopped);
});

test('split-view 3D opening selection obeys room edit mode', () => {
  state.initial!.view = 'split';
  const {container} = render(<CabinetConfigurator />);
  const hit = new THREE.Group();
  hit.userData.id = 'door';
  vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects').mockReturnValue([
    {object: hit, distance: 1, point: new THREE.Vector3()},
  ]);
  const canvas = container.querySelector('canvas')!;
  const pick = () => {
    fireEvent.pointerDown(canvas, {button: 0, clientX: 20, clientY: 20});
    fireEvent.pointerUp(canvas, {button: 0, clientX: 20, clientY: 20});
  };
  pick();
  expect(state.latest!.selected).toBeNull();
  fireEvent.click(screen.getByText('Edit room outline'));
  pick();
  expect(state.latest!.selected).toBe('door');
  fireEvent.click(screen.getByText('Done editing outline'));
  pick();
  expect(state.latest!.selected).toBeNull();
});
