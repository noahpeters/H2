import {GLB_BYTE_LIMIT} from './glbObject';
/** Require a self-contained GLB 2 container before the loader can request resources. */
export function validateGlbBytes(bytes: ArrayBuffer) {
  if (bytes.byteLength < 20 || bytes.byteLength > GLB_BYTE_LIMIT)
    throw new Error('GLB must be between 20 bytes and 20 MB.');
  const view = new DataView(bytes);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a
  )
    throw new Error('This file is not a valid GLB 2 model.');
  const length = view.getUint32(12, true);
  if (length % 4 || length + 20 > bytes.byteLength)
    throw new Error('Invalid GLB JSON chunk.');
  const parsed = JSON.parse(
    new TextDecoder().decode(new Uint8Array(bytes, 20, length)),
  );
  const record = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
  if (
    !record(parsed) ||
    !record(parsed.asset) ||
    parsed.asset.version !== '2.0'
  )
    throw new Error('Only GLB 2 models are supported.');
  for (const key of ['buffers', 'images']) {
    const entries = parsed[key];
    if (
      entries !== undefined &&
      (!Array.isArray(entries) ||
        entries.some((entry) => !record(entry) || entry.uri !== undefined))
    )
      throw new Error(
        'Use a self-contained GLB with embedded textures and buffers.',
      );
  }
  for (const key of ['extensionsRequired', 'extensionsUsed']) {
    const extensions = parsed[key];
    if (
      extensions !== undefined &&
      (!Array.isArray(extensions) ||
        extensions.some((entry) => typeof entry !== 'string'))
    )
      throw new Error('Invalid GLB extensions.');
    if (
      Array.isArray(extensions) &&
      extensions.some(
        (extension) =>
          typeof extension === 'string' &&
          [
            'KHR_draco_mesh_compression',
            'EXT_meshopt_compression',
            'KHR_texture_basisu',
          ].includes(extension),
      )
    )
      throw new Error(
        'Export this GLB without Draco, Meshopt or KTX2 compression.',
      );
  }
}
