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
    expect(
      screen.queryByRole('dialog', {name: 'Photo settings'}),
    ).not.toBeInTheDocument();
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
    await screen.findByRole('dialog', {name: 'Photo could not be completed'});
    fireEvent.click(screen.getByRole('button', {name: 'Close'}));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  },
);

test('completed photo replaces refinement with Option-key settings instructions', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo');
  vi.spyOn(URL, 'revokeObjectURL');
  vi.mocked(renderPhoto).mockResolvedValueOnce(
    new Blob(['photo'], {type: 'image/png'}),
  );
  render(<ThreeStudy study={blankStudy()} showControls />);
  fireEvent.click(screen.getByRole('button', {name: 'Take Photo'}));
  const dialog = await screen.findByRole('dialog', {name: 'Your room photo'});
  expect(dialog).toHaveTextContent(
    'To adjust render parameters, hold the Option key while pressing the Take Photo button.',
  );
  expect(
    screen.queryByRole('button', {name: /Render super high quality/i}),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('link', {name: 'Download PNG'})).toHaveAttribute(
    'href',
    'blob:photo',
  );
  fireEvent.click(screen.getByRole('button', {name: 'Close'}));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Take Photo'}), {
    altKey: true,
  });
  expect(
    screen.getByRole('dialog', {name: 'Photo settings'}),
  ).toBeInTheDocument();
  expect(renderPhoto).toHaveBeenCalledOnce();
});

test('photo settings appear only after Option-clicking Take Photo, cancel without rendering, and apply on confirmation', async () => {
  render(<ThreeStudy study={blankStudy()} showControls />);
  screen.getByRole('button', {name: 'Take Photo'}).focus();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('Daylight temperature (K)'),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Take Photo'}), {
    altKey: true,
  });
  const dialog = screen.getByRole('dialog', {name: 'Photo settings'});
  expect(dialog).toHaveAttribute('open');
  expect(dialog.querySelector('fieldset, legend')).toBeNull();
  expect(
    screen.queryByText(/Photos keep the current position/),
  ).not.toBeInTheDocument();
  fireEvent.pointerEnter(
    screen.getByRole('button', {name: 'About Photo Quality'}),
  );
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    'The full room stays sharp.',
  );
  fireEvent.keyDown(document, {key: 'Escape'});
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  expect(dialog).toHaveAttribute('open');
  expect(renderPhoto).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Daylight temperature (K)'), {
    target: {value: '5700'},
  });
  fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
  expect(screen.getByRole('button', {name: 'Take Photo'})).toHaveFocus();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(renderPhoto).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: 'Take Photo'}), {
    altKey: true,
  });
  expect(screen.getByLabelText('Daylight temperature (K)')).toHaveValue(5700);
  const escape = new Event('cancel', {cancelable: true});
  fireEvent(screen.getByRole('dialog', {name: 'Photo settings'}), escape);
  expect(escape.defaultPrevented).toBe(true);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(renderPhoto).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: 'Take Photo'}), {
    altKey: true,
  });
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
