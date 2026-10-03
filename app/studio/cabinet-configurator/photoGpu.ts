/** Bound the photo command queue without blocking the browser's main thread.
 * In particular, Safari must finish writing a target before the next photo stage
 * samples it or releases its resources. This is never used by the viewport. */
export async function waitForPhotoGpu(
  gl: WebGL2RenderingContext | WebGLRenderingContext,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (!('fenceSync' in gl))
    throw new Error('Photo rendering requires WebGL 2.');
  if (gl.isContextLost())
    throw new Error('Photo graphics context was lost. Please retry.');
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!fence)
    throw new Error('Could not synchronize photo graphics. Please retry.');
  const started = performance.now();
  try {
    gl.flush();
    while (true) {
      signal?.throwIfAborted();
      if (gl.isContextLost())
        throw new Error('Photo graphics context was lost. Please retry.');
      const status = gl.clientWaitSync(fence, 0, 0);
      if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED)
        return;
      if (status === gl.WAIT_FAILED)
        throw new Error('Photo graphics synchronization failed. Please retry.');
      if (performance.now() - started > 15000)
        throw new Error('Photo graphics stalled. Try a smaller image.');
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }
  } finally {
    gl.deleteSync(fence);
  }
}
