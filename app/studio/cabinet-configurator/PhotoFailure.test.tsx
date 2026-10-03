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
vi.mock('./studyScene', () => ({
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
    expect(renderPhoto).toHaveBeenCalledTimes(2);
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
