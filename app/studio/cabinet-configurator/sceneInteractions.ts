import type * as THREE from 'three';

type Motion = {value: number; target: number};

/** Drive the same motion rigs used by the cabinet customization viewport. */
export class SceneInteractions {
  private motions = new Map<THREE.Object3D, Motion>();

  toggle(hit: THREE.Object3D) {
    let rig: THREE.Object3D | null = hit;
    while (rig && typeof rig.userData.updateOpening !== 'function')
      rig = rig.parent;
    if (!rig) return false;
    let cabinet: THREE.Object3D = rig;
    while (cabinet.parent && !cabinet.userData.id) cabinet = cabinet.parent;
    const target = this.motions.get(rig)?.target ? 0 : 1;
    cabinet.traverse((object) => {
      if (
        object === rig ||
        (rig.userData.partId &&
          object.userData.partId === rig.userData.partId &&
          typeof object.userData.updateOpening === 'function')
      ) {
        this.motions.set(object, {
          value: this.motions.get(object)?.value ?? 0,
          target,
        });
      }
    });
    return true;
  }

  update(root: THREE.Object3D, seconds: number) {
    if (!this.motions.size) return false;
    let changed = false;
    const live = new Set<THREE.Object3D>();
    root.traverse((object) => live.add(object));
    for (const [object, motion] of this.motions) {
      if (!live.has(object)) {
        this.motions.delete(object);
        continue;
      }
      if (motion.value === motion.target) continue;
      motion.value +=
        Math.sign(motion.target - motion.value) *
        Math.min(
          Math.max(0, Math.min(seconds, 0.05)) * 1.25,
          Math.abs(motion.target - motion.value),
        );
      object.userData.updateOpening(motion.value);
      changed = true;
    }
    return changed;
  }

  reset() {
    for (const object of this.motions.keys()) object.userData.updateOpening(0);
    this.motions.clear();
  }
}
