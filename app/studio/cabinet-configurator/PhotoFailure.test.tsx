import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import * as THREE from 'three';
import {blankStudy, ThreeStudy} from './CabinetConfigurator';
import {renderPhoto} from './photoRender';

vi.mock('./photoRender', async (original) => ({
  ...(await original<typeof import('./photoRender')>()),
  renderPhoto: vi.fn(),
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
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(renderPhoto).mockReset();
});

test.each([
  new Error('Photo graphics stalled for 45 seconds.'),
  new Error(''),
  undefined,
])(
  'failed capture keeps a visible error dialog and supports retry, cancellation and dismissal (%s)',
  async (failure) => {
    vi.mocked(renderPhoto).mockRejectedValueOnce(failure);
    render(<ThreeStudy study={blankStudy()} showControls />);
    fireEvent.click(screen.getByRole('button', {name: 'Take Photo'}));
    fireEvent.click(screen.getByRole('button', {name: 'Render photo'}));
    const failed = await screen.findByRole('dialog', {
      name: 'Photo could not be completed',
    });
    expect(failed).toHaveAttribute('open');
    expect(screen.getByRole('alert')).toHaveTextContent(
      failure?.message || 'Unable to take photo. Please try again.',
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    vi.mocked(renderPhoto).mockImplementationOnce(
      (_snapshot, _host, _settings, options) =>
        new Promise((_resolve, reject) => {
          options!.signal!.addEventListener(
            'abort',
            () => reject(new DOMException('Cancelled', 'AbortError')),
            {once: true},
          );
        }),
    );
    fireEvent.click(screen.getByRole('button', {name: 'Try again'}));
    expect(screen.getByRole('dialog', {name: 'Say cheese!'})).toBe(failed);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('value');
    await waitFor(() => expect(renderPhoto).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', {name: 'Cancel photo'}));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    vi.mocked(renderPhoto).mockRejectedValueOnce(
      new Error('Photo capture failed.'),
    );
    fireEvent.click(screen.getByRole('button', {name: 'Take Photo'}));
    fireEvent.click(screen.getByRole('button', {name: 'Render photo'}));
    await screen.findByRole('dialog', {name: 'Photo could not be completed'});
    fireEvent.click(screen.getByRole('button', {name: 'Close'}));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  },
);

test('super high quality rerenders the original capture and keeps the first photo after a failed or cancelled refinement', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo');
  vi.spyOn(URL, 'revokeObjectURL');
  const first = new Blob(['first'], {type: 'image/png'});
  vi.mocked(renderPhoto).mockResolvedValueOnce(first);
  const view = render(<ThreeStudy study={blankStudy()} showControls />);
  fireEvent.click(screen.getByRole('button', {name: 'Take Photo'}));
  fireEvent.click(screen.getByRole('button', {name: 'Render photo'}));
  await screen.findByRole('dialog', {name: 'Your room photo'});
  const captured = vi.mocked(renderPhoto).mock.calls[0];
  const next = {...blankStudy(), room: {...blankStudy().room, width: 300}};
  view.rerender(<ThreeStudy study={next} showControls />);
  vi.mocked(renderPhoto).mockRejectedValueOnce(
    new Error('Photo capture failed.'),
  );
  fireEvent.click(
    screen.getByRole('button', {name: 'Render super high quality'}),
  );
  await screen.findByRole('dialog', {name: 'Photo could not be completed'});
  const refined = vi.mocked(renderPhoto).mock.calls[1];
  expect(refined[0].camera.position).toEqual(captured[0].camera.position);
  expect(refined[0].camera.projectionMatrix).toEqual(
    captured[0].camera.projectionMatrix,
  );
  expect(refined[0].target).toEqual(captured[0].target);
  expect(refined[2]?.camera?.quality).toBe('ultra');
  expect({
    ...refined[2],
    camera: {...refined[2]?.camera, quality: 'standard'},
  }).toEqual(captured[2]);
  fireEvent.click(screen.getByRole('button', {name: 'Close'}));
  expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:photo');
  vi.mocked(renderPhoto).mockImplementationOnce(
    (_snapshot, _host, _settings, options) =>
      new Promise((_resolve, reject) => {
        options!.signal!.addEventListener(
          'abort',
          () => reject(new DOMException('Cancelled', 'AbortError')),
          {once: true},
        );
      }),
  );
  fireEvent.click(
    screen.getByRole('button', {name: 'Render super high quality'}),
  );
  await waitFor(() => expect(renderPhoto).toHaveBeenCalledTimes(3));
  fireEvent.click(screen.getByRole('button', {name: 'Cancel photo'}));
  await screen.findByRole('dialog', {name: 'Your room photo'});
  expect(vi.mocked(URL.createObjectURL).mock.calls.at(-1)?.[0]).toBe(first);
  const last = new Blob(['full'], {type: 'image/png'});
  vi.mocked(renderPhoto).mockResolvedValueOnce(last);
  fireEvent.click(
    screen.getByRole('button', {name: 'Render super high quality'}),
  );
  await screen.findByRole('dialog', {name: 'Your room photo'});
  expect(
    screen.queryByRole('button', {name: 'Render super high quality'}),
  ).not.toBeInTheDocument();
  expect(vi.mocked(URL.createObjectURL).mock.calls.at(-1)?.[0]).toBe(last);
});

test('photo settings appear only after Take Photo, cancel without rendering, and apply on confirmation', async () => {
  render(<ThreeStudy study={blankStudy()} showControls />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('Daylight temperature (K)'),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Take Photo'}));
  const dialog = screen.getByRole('dialog', {name: 'Photo settings'});
  expect(dialog).toHaveAttribute('open');
  expect(renderPhoto).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Daylight temperature (K)'), {
    target: {value: '5700'},
  });
  fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(renderPhoto).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: 'Take Photo'}));
  expect(screen.getByLabelText('Daylight temperature (K)')).toHaveValue(5700);
  const escape = new Event('cancel', {cancelable: true});
  fireEvent(screen.getByRole('dialog', {name: 'Photo settings'}), escape);
  expect(escape.defaultPrevented).toBe(true);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(renderPhoto).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: 'Take Photo'}));
  vi.mocked(renderPhoto).mockRejectedValueOnce(
    new Error('Test render failed.'),
  );
  fireEvent.click(screen.getByRole('button', {name: 'Render photo'}));
  await screen.findByRole('dialog', {name: 'Photo could not be completed'});
  expect(
    screen.queryByRole('dialog', {name: 'Photo settings'}),
  ).not.toBeInTheDocument();
  expect(renderPhoto).toHaveBeenCalledOnce();
  expect(vi.mocked(renderPhoto).mock.calls[0][2]?.daylight.temperature).toBe(
    5700,
  );
});
