import * as THREE from 'three';
import type {ApplianceKind} from './model';

/** Original, dimension-scaled appliance silhouettes; front faces local +Z. */
export function applianceGeometry(
  kind: ApplianceKind,
  w: number,
  h: number,
  d: number,
  frontStyle: 'stainless' | 'shaker' | 'slab' = 'stainless',
  rangeHood = false,
) {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({
    color: 0xb9c0c4,
    metalness: 0.65,
    roughness: 0.32,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x111b21,
    metalness: 0.22,
    roughness: 0.18,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x252a2d,
    roughness: 0.7,
  });
  const display = new THREE.MeshStandardMaterial({
    color: 0x7faeb9,
    emissive: 0x416d80,
    emissiveIntensity: 0.6,
  });
  const box = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    mat = steel,
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      mat,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const z = d / 2;
  if (kind === 'range' && rangeHood) {
    // Concept hood: underside 30 inches above the cooking surface.
    const bottom = h / 2 + 30 * 0.0254;
    const hoodDepth = Math.min(d, 22 * 0.0254);
    const hoodZ = -d / 2 + hoodDepth / 2;
    const hood = box(w, 4 * 0.0254, hoodDepth, 0, bottom + 2 * 0.0254, hoodZ);
    hood.name = 'range-hood';
    box(w * 0.8, 0.008, hoodDepth * 0.75, 0, bottom - 0.004, hoodZ, dark);
    box(
      w * 0.38,
      18 * 0.0254,
      hoodDepth * 0.42,
      0,
      bottom + 13 * 0.0254,
      -d / 2 + hoodDepth * 0.21,
    );
    for (const side of [-1, 1])
      box(
        0.045,
        0.009,
        0.045,
        side * w * 0.32,
        bottom - 0.008,
        hoodZ + hoodDepth * 0.25,
        display,
      );
  }
  if (
    frontStyle !== 'stainless' &&
    (kind === 'refrigerator' || kind === 'dishwasher')
  ) {
    const wood = new THREE.MeshStandardMaterial({
      color: 0xa68159,
      roughness: 0.6,
    });
    const panel = new THREE.MeshStandardMaterial({
      color: frontStyle === 'shaker' ? 0x99754f : 0xa68159,
      roughness: 0.65,
    });
    box(w, h, d, 0, 0, 0, wood);
    const count = kind === 'refrigerator' ? 2 : 1;
    const pw = w / count - 0.006,
      ph = h - 0.012;
    for (let i = 0; i < count; i++) {
      const x = ((i - (count - 1) / 2) * w) / count;
      box(pw, ph, 0.012, x, 0, z + 0.006, panel).name = 'appliance-panel';
      if (frontStyle === 'shaker') {
        const rail = Math.min(0.0508, pw / 5);
        for (const side of [-1, 1]) {
          box(
            rail,
            ph,
            0.019,
            x + (side * (pw - rail)) / 2,
            0,
            z + 0.014,
            wood,
          );
          box(
            pw - 2 * rail,
            rail,
            0.019,
            x,
            (side * (ph - rail)) / 2,
            z + 0.014,
            wood,
          );
        }
      }
      if (count === 2)
        box(
          0.012,
          0.25,
          0.035,
          x + (i === 0 ? 1 : -1) * pw * 0.36,
          h * 0.08,
          z + 0.04,
        );
      else box(Math.min(0.16, pw * 0.5), 0.012, 0.035, x, h * 0.38, z + 0.04);
    }
    return group;
  }
  box(w, h, d, 0, 0, 0, rubber);
  box(w * 0.99, h * 0.98, 0.012, 0, 0, z);
  const handle = (x: number, y: number, width: number, height = 0.018) => {
    box(width, height, 0.022, x, y, z + 0.045);
    for (const side of [-1, 1])
      box(0.012, height, 0.04, x + side * width * 0.43, y, z + 0.023);
  };
  const controls = () => {
    box(w * 0.91, h * 0.15, 0.018, 0, h * 0.38, z + 0.013, dark);
    box(w * 0.24, h * 0.055, 0.003, 0, h * 0.38, z + 0.024, display);
  };
  if (kind === 'refrigerator') {
    for (const side of [-1, 1]) {
      box(w * 0.485, h * 0.97, 0.026, side * w * 0.249, 0, z + 0.014);
      box(0.018, h * 0.37, 0.03, side * w * 0.058, h * 0.08, z + 0.055);
    }
    box(w * 0.012, h * 0.98, 0.006, 0, 0, z + 0.03, rubber);
  } else if (kind === 'coffee-maker') {
    controls();
    box(w * 0.88, h * 0.63, 0.018, 0, -h * 0.07, z + 0.014, dark);
    box(w * 0.46, h * 0.2, 0.045, 0, h * 0.09, z + 0.047);
    for (const side of [-1, 1])
      box(w * 0.035, h * 0.11, 0.028, side * w * 0.08, -h * 0.055, z + 0.075);
    box(w * 0.66, h * 0.035, 0.09, 0, -h * 0.32, z + 0.045);
    for (let i = -4; i <= 4; i++)
      box(
        w * 0.009,
        h * 0.004,
        0.075,
        i * w * 0.063,
        -h * 0.3,
        z + 0.045,
        rubber,
      );
  } else if (kind === 'dishwasher') {
    controls();
    handle(0, h * 0.24, w * 0.62);
    box(w * 0.9, h * 0.06, 0.015, 0, -h * 0.45, z + 0.015, rubber);
  } else {
    controls();
    const microwave = kind === 'microwave';
    box(
      w * (microwave ? 0.7 : 0.84),
      h * 0.59,
      0.02,
      microwave ? -w * 0.07 : 0,
      -h * 0.1,
      z + 0.015,
      dark,
    );
    box(
      w * (microwave ? 0.55 : 0.65),
      h * 0.36,
      0.003,
      microwave ? -w * 0.07 : 0,
      -h * 0.12,
      z + 0.027,
      rubber,
    );
    if (microwave)
      box(w * 0.03, h * 0.48, 0.035, w * 0.36, -h * 0.06, z + 0.046);
    else handle(0, h * 0.21, w * 0.75);
    if (kind === 'range') {
      box(w * 0.94, 0.015, d * 0.94, 0, h / 2 + 0.008, 0, dark);
      for (const x of [-1, 1])
        for (const rear of [-1, 1]) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(Math.min(w, d) * 0.14, 0.0025, 6, 32),
            steel,
          );
          ring.rotation.x = Math.PI / 2;
          ring.position.set(x * w * 0.23, h / 2 + 0.02, rear * d * 0.23);
          group.add(ring);
        }
    }
  }
  return group;
}
