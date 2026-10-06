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

test('preserves a saved room outline while exposing only wall geometry editing', () => {
  const outline = [
    {id: 'back' as const, x: 0, z: 0},
    {id: 'right' as const, x: 144, z: 0},
    {id: 'front' as const, x: 144, z: 120},
    {id: 'left' as const, x: 0, z: 120},
  ];
  state.initial!.room.outline = outline;

  render(<CabinetConfigurator />);

  expect(state.latest!.room.outline).toEqual(outline);
  expect(
    screen.queryByLabelText('Room outline preset'),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Edit room outline'));
  fireEvent.change(
    screen.getByRole('spinbutton', {name: 'Selected wall thickness'}),
    {
      target: {value: '7'},
    },
  );
  expect(state.latest!.room.outline).toEqual(outline);
  expect(state.latest!.room.wallThicknesses?.back).toBe(7);
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
  fireEvent.change(
    screen.getByRole('spinbutton', {name: 'Selected wall thickness'}),
    {
      target: {value: '8'},
    },
  );
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

test('only auto-expands the selected object section when selection changes', () => {
  state.initial!.islands = [
    {
      id: 'first-island',
      x: 48,
      z: 48,
      width: 36,
      depth: 24,
      rotation: 0,
      overhang: 0,
      seatingSide: 'none',
    },
    {
      id: 'second-island',
      x: 96,
      z: 48,
      width: 36,
      depth: 24,
      rotation: 0,
      overhang: 0,
      seatingSide: 'none',
    },
  ];
  state.initial!.selected = 'first-island';
  render(<CabinetConfigurator />);

  const materials = screen.getByText('Materials').closest('details')!;
  const room = screen.getByText('Room').closest('details')!;
  const selection = screen.getByText('Selected object').closest('details')!;
  expect(materials.open).toBe(false);
  expect(room.open).toBe(false);
  expect(selection.open).toBe(true);

  fireEvent.click(screen.getByText('Materials'));
  fireEvent.click(screen.getByText('Room'));
  expect(materials.open).toBe(true);
  expect(room.open).toBe(true);

  fireEvent.keyDown(screen.getByLabelText('Select island 2'), {key: 'Enter'});
  expect(state.latest!.selected).toBe('second-island');
  expect(materials.open).toBe(false);
  expect(room.open).toBe(false);
  expect(selection.open).toBe(true);
});

test('room precision persists and controls numeric cabinet placement on all axes', () => {
  state.initial!.room.partitions = [];
  state.initial!.elements = [
    {
      id: 'cabinet',
      kind: 'wall-cabinet',
      width: 24,
      depth: 24,
      height: 24,
      face: 'slab',
      placement: {mode: 'floor', x: 60, z: 60, rotation: 0, elevation: 54},
    },
  ];
  state.initial!.selected = 'cabinet';
  render(<CabinetConfigurator />);
  const precision = screen.getByLabelText('Positioning resolution');
  expect(precision).toHaveValue('0.125');
  for (const step of [1 / 16, 1 / 8, 1]) {
    const dimensions = {...state.latest!.elements[0]};
    fireEvent.change(precision, {target: {value: String(step)}});
    expect(state.latest!.elements[0]).toMatchObject({
      width: dimensions.width,
      depth: dimensions.depth,
      height: dimensions.height,
    });
    for (const key of ['width', 'depth', 'height'] as const) {
      const field = screen.getByRole('spinbutton', {
        name: new RegExp(`^${key}`, 'i'),
      });
      expect(field).toHaveAttribute('step', String(step));
      fireEvent.change(field, {target: {value: String(24 + step)}});
      expect(state.latest!.elements[0][key]).toBe(24 + step);
    }
    expect(state.latest!.room.positioningResolution).toBe(step);
    expect(screen.getByLabelText('X position (in)')).toHaveAttribute(
      'step',
      String(step),
    );
    expect(
      screen.getByLabelText('Bottom height above floor (in)'),
    ).toHaveAttribute('step', String(step));
    fireEvent.change(screen.getByLabelText('X position (in)'), {
      target: {value: String(60 + step * 0.6)},
    });
    fireEvent.change(screen.getByLabelText('Z position (in)'), {
      target: {value: String(60 - step * 0.6)},
    });
    fireEvent.change(screen.getByLabelText('Bottom height above floor (in)'), {
      target: {value: String(54 + step * 0.6)},
    });
    expect(state.latest!.elements[0].placement).toMatchObject({
      x: 60 + step,
      z: 60 - step,
      elevation: 54 + step,
    });
  }
});

test('numeric elevation commits a visible bottom/top guide for a vertical stack', () => {
  state.initial!.room.partitions = [];
  state.initial!.elements = [
    {
      id: 'lower',
      kind: 'wall-cabinet',
      width: 24,
      depth: 24,
      height: 20.03,
      face: 'slab',
      placement: {mode: 'wall', wall: 'back', offset: 24, elevation: 20},
    },
    {
      id: 'upper',
      kind: 'wall-cabinet',
      width: 24,
      depth: 24,
      height: 20,
      face: 'slab',
      placement: {mode: 'wall', wall: 'back', offset: 24, elevation: 42},
    },
  ];
  state.initial!.selected = 'upper';
  render(<CabinetConfigurator />);
  fireEvent.change(screen.getByLabelText('Bottom height above floor (in)'), {
    target: {value: '40'},
  });
  expect(state.latest!.elements[1].placement.elevation).toBe(40.03);
  expect(screen.getByText('bottom alignment at 40.03″')).toBeInTheDocument();
  expect(
    screen.queryByText(/Overlaps another element/),
  ).not.toBeInTheDocument();
});

test('Command temporarily disables snapping, permits Command-drag, and never snaps on release while held', () => {
  state.initial!.room.partitions = [];
  state.initial!.elements = [
    {
      id: 'active',
      kind: 'base',
      width: 24,
      depth: 24,
      height: 34.5,
      face: 'slab',
      placement: {mode: 'floor', x: 60, z: 60, rotation: 0},
    },
    {
      id: 'neighbor',
      kind: 'base',
      width: 24,
      depth: 24,
      height: 34.5,
      face: 'slab',
      placement: {mode: 'floor', x: 84, z: 60, rotation: 0},
    },
  ];
  state.initial!.selected = 'active';
  render(<CabinetConfigurator />);
  const plan = screen.getByLabelText('Dimensioned room plan');
  const active = document.querySelector('.cc-cab.selected');
  expect(active).not.toBeNull();
  const quarterInch =
    Number(active!.querySelector('rect')!.getAttribute('width')) / 24 / 4;
  fireEvent.pointerDown(active!, {
    clientX: 0,
    clientY: 0,
    button: 0,
    metaKey: true,
  });
  fireEvent.pointerMove(plan, {
    clientX: quarterInch,
    clientY: 0,
    metaKey: true,
  });
  expect(state.latest!.elements[0].placement).toMatchObject({x: 60.25});
  expect(screen.getByLabelText('Positioning aids')).toBeInTheDocument();
  fireEvent.keyUp(window, {key: 'Meta', metaKey: false});
  expect(state.latest!.elements[0].placement).toMatchObject({x: 60});
  expect(screen.getByLabelText('Positioning aids')).toBeInTheDocument();
  fireEvent.keyDown(window, {key: 'Meta', metaKey: true});
  expect(state.latest!.elements[0].placement).toMatchObject({x: 60.25});
  fireEvent.pointerUp(plan, {metaKey: true});
  expect(state.latest!.elements[0].placement).toMatchObject({x: 60.25});
  fireEvent.blur(window);
  fireEvent.pointerDown(active!, {clientX: 0, clientY: 0, button: 0});
  fireEvent.pointerMove(plan, {clientX: 0, clientY: 0});
  expect(state.latest!.elements[0].placement).toMatchObject({x: 60});
});

test('room explanations are available beside their controls without taking space in the rail', () => {
  render(<CabinetConfigurator />);
  const room = screen
    .getByText('Room', {selector: 'summary'})
    .closest('details')!;
  room.open = true;
  expect(screen.queryByText(/Snaps within twice/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Share a single frame/)).not.toBeInTheDocument();
  expect(
    screen.queryByText(/Measured beyond the cabinet/),
  ).not.toBeInTheDocument();
  const resolution = screen.getByLabelText('Positioning resolution');
  fireEvent.pointerEnter(
    screen.getByRole('button', {name: 'About Positioning resolution'}),
  );
  expect(screen.getByRole('tooltip')).toHaveTextContent('Hold ⌘ Command');
  fireEvent.change(resolution, {target: {value: '0.0625'}});
  expect(state.latest!.room.positioningResolution).toBe(1 / 16);
  fireEvent.keyDown(document.body, {key: 'Escape'});
  fireEvent.change(screen.getByLabelText('Front overlay'), {
    target: {value: 'inset'},
  });
  const frames = screen.getByLabelText('Continuous face frames');
  fireEvent.click(
    screen.getByRole('button', {name: 'About Continuous face frames'}),
  );
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    'Cabinet boundaries use one stile',
  );
  expect(frames).not.toBeChecked();
  fireEvent.keyDown(document.body, {key: 'Escape'});
  fireEvent.click(frames);
  expect(state.latest!.room.continuousFaceFrames).toBe(true);
  fireEvent.click(
    screen.getByRole('button', {
      name: 'About Island countertop edge overhang (in)',
    }),
  );
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    'Seating overhang is set per island.',
  );
});

test('room-wide maple internals toggle changes the saved design without changing the selected cabinet finish', () => {
  render(<CabinetConfigurator />);
  const room = screen
    .getByText('Room', {selector: 'summary'})
    .closest('details')!;
  room.open = true;
  const toggle = screen.getByLabelText('Use maple internals');
  expect(toggle).not.toBeChecked();
  const materials = state.latest!.elements.map((e) => e.material);
  fireEvent.click(toggle);
  expect(state.latest!.room.useMapleInternals).toBe(true);
  expect(state.latest!.elements.map((e) => e.material)).toEqual(materials);
  fireEvent.click(toggle);
  expect(state.latest!.room.useMapleInternals).toBe(false);
});

test('automatic panels are grey, selectable and fixed; the controlling cabinet can disable them', () => {
  state.initial!.room.useMapleInternals = true;
  state.initial!.room.partitions = [];
  state.initial!.elements = [
    {
      id: 'auto-owner',
      kind: 'base',
      width: 30,
      depth: 24,
      height: 34.5,
      face: 'shaker',
      placement: {mode: 'floor', x: 60, z: 60, rotation: 0},
    },
  ];
  state.initial!.selected = null;
  const {container} = render(<CabinetConfigurator />);
  const panels = Array.from(
    container.querySelectorAll('g.cc-panel rect'),
  ).filter((r) => (r as SVGElement).style.fill === '#999999');
  expect(panels).toHaveLength(3);
  const panel = panels[0].parentElement!;
  fireEvent.pointerDown(panel, {pointerId: 1, clientX: 100, clientY: 100});
  fireEvent.click(panel);
  expect(
    screen.getByText(
      'Attached to its cabinet. Size and position are not editable.',
    ),
  ).toBeVisible();
  expect(screen.queryByLabelText('Thickness')).not.toBeInTheDocument();
  expect(state.latest!.elements).toHaveLength(1);
  fireEvent.click(
    screen.getByRole('button', {name: 'Select controlling cabinet'}),
  );
  fireEvent.click(screen.getByLabelText('Disable automatic finish panels'));
  expect(state.latest!.elements[0].disableAutoPanels).toBe(true);
  expect(
    Array.from(container.querySelectorAll('g.cc-panel rect')).filter(
      (r) => (r as SVGElement).style.fill === '#999999',
    ),
  ).toHaveLength(0);
});
