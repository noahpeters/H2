/** Small, self-contained GLB with translated, colored triangle geometry in meters. */
export function glbFixture(
  overrides: Record<string, unknown> = {},
): ArrayBuffer {
  const positions = new Float32Array([0, 0, 0, 0.254, 0, 0, 0, 0.508, 0.762]);
  const json = new TextEncoder().encode(
    JSON.stringify({
      asset: {version: '2.0'},
      scene: 0,
      scenes: [{nodes: [0]}],
      nodes: [{mesh: 0, translation: [2, 4, 6]}],
      meshes: [{primitives: [{attributes: {POSITION: 0}, material: 0}]}],
      materials: [
        {
          pbrMetallicRoughness: {
            baseColorFactor: [0.2, 0.4, 0.6, 1],
            metallicFactor: 0.1,
            roughnessFactor: 0.8,
          },
        },
      ],
      buffers: [{byteLength: positions.byteLength}],
      bufferViews: [
        {buffer: 0, byteOffset: 0, byteLength: positions.byteLength},
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: 'VEC3',
          min: [0, 0, 0],
          max: [0.254, 0.508, 0.762],
        },
      ],
      ...overrides,
    }),
  );
  const padded = Math.ceil(json.length / 4) * 4;
  const bytes = new ArrayBuffer(28 + padded + positions.byteLength);
  const header = new DataView(bytes);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, bytes.byteLength, true);
  header.setUint32(12, padded, true);
  header.setUint32(16, 0x4e4f534a, true);
  const jsonChunk = new Uint8Array(bytes, 20, padded);
  jsonChunk.fill(32);
  jsonChunk.set(json);
  header.setUint32(20 + padded, positions.byteLength, true);
  header.setUint32(24 + padded, 0x004e4942, true);
  new Uint8Array(bytes, 28 + padded).set(new Uint8Array(positions.buffer));
  return bytes;
}
