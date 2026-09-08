import {act, cleanup, render} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import * as THREE from 'three';

const graphics = {
  lost: false,
  render: vi.fn(),
  encode: vi.fn().mockReturnValue('data:image/png;base64,preview'),
  canvas: undefined as HTMLCanvasElement | undefined,
};
vi.spyOn(THREE, 'WebGLRenderer').mockImplementation(
  class {
    domElement = document.createElement('canvas');
    constructor() {
      graphics.canvas = this.domElement;
      this.domElement.toDataURL = graphics.encode;
    }
    setSize = () => {};
    getContext = () => ({isContextLost: () => graphics.lost});
    render = graphics.render;
  } as unknown as typeof THREE.WebGLRenderer,
);
import {ChoiceImage} from './VisualChoices';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  graphics.lost = false;
  vi.clearAllMocks();
});

test('renders without IntersectionObserver and reuses immutable images after remount', () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  const first = render(<ChoiceImage category="front" value="shaker" />);
  expect(first.container.querySelector('img')).toHaveAttribute(
    'src',
    'data:image/png;base64,preview',
  );
  first.unmount();
  const second = render(<ChoiceImage category="front" value="shaker" />);
  expect(second.container.querySelector('img')).not.toBeNull();
  expect(graphics.render).toHaveBeenCalledTimes(1);
  expect(graphics.encode).toHaveBeenCalledTimes(1);
});

test('does not cache a lost context and retries when graphics recover', () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  graphics.lost = true;
  const result = render(<ChoiceImage category="tall" value="standard" />);
  expect(result.container.querySelector('img')).toBeNull();
  expect(graphics.encode).not.toHaveBeenCalled();
  graphics.lost = false;
  act(() => {
    graphics.canvas!.dispatchEvent(new Event('webglcontextrestored'));
  });
  expect(result.container.querySelector('img')).not.toBeNull();
  expect(graphics.render).toHaveBeenCalledTimes(1);
});

test('waits for a collapsed option to become visible and disconnects on success', () => {
  let notify: IntersectionObserverCallback;
  const disconnect = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const result = render(<ChoiceImage category="material" value="walnut" />);
  expect(graphics.render).not.toHaveBeenCalled();
  act(() => {
    notify(
      [{isIntersecting: true}] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );
  });
  expect(result.container.querySelector('img')).not.toBeNull();
  expect(disconnect).toHaveBeenCalled();
});
