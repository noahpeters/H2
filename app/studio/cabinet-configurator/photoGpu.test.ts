import {afterEach, expect, test, vi} from 'vitest';
import {waitForPhotoGpu} from './photoGpu';

afterEach(() => vi.unstubAllGlobals());

function gpu(statuses: number[]) {
  const fence = {};
  return {
    SYNC_GPU_COMMANDS_COMPLETE: 1,
    ALREADY_SIGNALED: 2,
    CONDITION_SATISFIED: 3,
    TIMEOUT_EXPIRED: 4,
    WAIT_FAILED: 5,
    isContextLost: vi.fn(() => false),
    fenceSync: vi.fn(() => fence),
    flush: vi.fn(),
    clientWaitSync: vi.fn(() => statuses.shift() ?? 3),
    deleteSync: vi.fn(),
  };
}

test('waits for GPU completion without blocking and releases its fence', async () => {
  const gl = gpu([4, 4, 3]);
  const frame = vi.fn((callback: FrameRequestCallback) => callback(0));
  vi.stubGlobal('requestAnimationFrame', frame);
  await waitForPhotoGpu(gl as unknown as WebGL2RenderingContext);
  expect(gl.flush).toHaveBeenCalledOnce();
  expect(frame).toHaveBeenCalledTimes(2);
  expect(gl.clientWaitSync).toHaveBeenCalledTimes(3);
  expect(gl.deleteSync).toHaveBeenCalledWith(
    gl.fenceSync.mock.results[0].value,
  );
});

test('cancellation while waiting releases the fence and stops polling', async () => {
  const gl = gpu([4]);
  const controller = new AbortController();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    controller.abort();
    callback(0);
  });
  await expect(
    waitForPhotoGpu(gl as unknown as WebGL2RenderingContext, controller.signal),
  ).rejects.toThrow();
  expect(gl.clientWaitSync).toHaveBeenCalledOnce();
  expect(gl.deleteSync).toHaveBeenCalledOnce();
});

test('reports a failed GPU wait instead of exporting an incomplete image', async () => {
  const gl = gpu([5]);
  await expect(
    waitForPhotoGpu(gl as unknown as WebGL2RenderingContext),
  ).rejects.toThrow('synchronization failed');
  expect(gl.deleteSync).toHaveBeenCalledOnce();
});
