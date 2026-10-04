import * as THREE from 'three';

export const BACK_PANEL_STYLES = {
  flat: 'Flat',
  'vertical-shiplap': 'Vertical shiplap',
  'vertical-plank': 'Vertical plank / slat',
} as const;
export type BackPanelStyle = keyof typeof BACK_PANEL_STYLES;

/** Decorative seams belong to the back panel; stock and shelf geometry stay unchanged. */
export function decorateBackPanel(
  panel: THREE.Mesh,
  style: BackPanelStyle = 'flat',
  width: number,
  height: number,
  depth: number,
  units = 1,
  front = 1,
) {
  if (style === 'flat') return;
  const shiplap = style === 'vertical-shiplap';
  const count = Math.max(2, Math.floor(width / (shiplap ? 5 : 2.5)));
  const material = new THREE.MeshStandardMaterial({
    color: 0x514536,
    roughness: 0.85,
  });
  for (let index = 1; index < count; index++) {
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(
        (shiplap ? 0.12 : 0.2) * units,
        Math.max(0.5, height - 0.5) * units,
        (shiplap ? 0.08 : 0.14) * units,
      ),
      material,
    );
    line.name = `back-panel-${style}-line`;
    line.position.set(
      (-width / 2 + (index * width) / count) * units,
      0,
      front * (depth / 2 + 0.04) * units,
    );
    panel.add(line);
  }
}
