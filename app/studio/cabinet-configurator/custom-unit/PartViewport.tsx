import {useEffect, useRef, useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {TransformControls} from 'three/examples/jsm/controls/TransformControls.js';
import {createCabinetRenderer} from '../sceneRenderer';
import {customUnitGeometry} from './geometry';
import type {CustomUnitDefinition} from './model';

type Props = {
  definition: CustomUnitDefinition;
  selectedId: string;
  view: '3d' | 'front' | 'side' | 'top';
  tool: 'orbit' | 'move';
  snap: number;
  openings: Record<string, number>;
  fitRevision: number;
  onSelect: (id: string) => void;
  onMove: (id: string, delta: {x: number; y: number; z: number}) => void;
};
export function PartViewport(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  current.current = props;
  const [error, setError] = useState('');
  const api = useRef<{refresh: () => void} | null>(null);
  useEffect(() => {
    if (!host.current) return;
    let setup: ReturnType<typeof createCabinetRenderer>;
    try {
      setup = createCabinetRenderer(host.current, 1 / 0.0254);
    } catch {
      setError(
        '3D is unavailable. Enable WebGL or use another browser. All part dimensions remain editable below.',
      );
      return;
    }
    const {renderer, scene} = setup;
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 10000);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    const transform = new TransformControls(camera, renderer.domElement);
    transform.setMode('translate');
    scene.add(transform.getHelper());
    let group = new THREE.Group();
    let previousView = '';
    let previousUnit = '';
    const disposeGroup = () =>
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
    const refresh = () => {
      const {definition, selectedId, tool, view, snap} = current.current;
      transform.detach();
      scene.remove(group);
      disposeGroup();
      group = customUnitGeometry(definition, current.current.openings);
      group.scale.z = -1;
      scene.add(group);
      group.traverse((object) => {
        if (
          object.userData.partId === selectedId &&
          object instanceof THREE.Mesh
        ) {
          (object.material as THREE.MeshStandardMaterial).color.set(0xa9bd98);
          (object.material as THREE.MeshStandardMaterial).emissive.set(
            0x254535,
          );
        }
      });
      const selectedObject = group.children.find(
        (object) => object.userData.partId === selectedId,
      );
      if (
        selectedObject &&
        tool === 'move' &&
        !current.current.openings[selectedId]
      )
        transform.attach(selectedObject);
      transform.setTranslationSnap(snap || null);
      orbit.enableRotate = view === '3d';
      const frameKey = `${definition.id}:${definition.width}:${definition.height}:${definition.depth}:${current.current.fitRevision}`;
      if (previousView !== view || previousUnit !== frameKey) {
        group.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(group);
        const sphere = bounds.getBoundingSphere(new THREE.Sphere());
        const rect = host.current!.getBoundingClientRect();
        const aspect = rect.width / Math.max(1, rect.height);
        const vertical = THREE.MathUtils.degToRad(camera.fov) / 2;
        const halfFov = Math.min(
          vertical,
          Math.atan(Math.tan(vertical) * aspect),
        );
        const distance =
          (Math.max(12, sphere.radius) / Math.sin(halfFov)) * 1.08;
        orbit.target.copy(sphere.center);
        const direction = new THREE.Vector3(
          ...((view === 'front'
            ? [0, 0, 1]
            : view === 'top'
              ? [0, 1, 0.0001]
              : view === 'side'
                ? [1, 0, 0]
                : [1.05, 0.7, 1.4]) as [number, number, number]),
        ).normalize();
        camera.position.copy(orbit.target).addScaledVector(direction, distance);
        previousView = view;
        previousUnit = frameKey;
      }
      orbit.update();
    };
    api.current = {refresh};
    refresh();
    let origin = new THREE.Vector3();
    transform.addEventListener('mouseDown', () => {
      if (transform.object) origin = transform.object.position.clone();
    });
    transform.addEventListener('dragging-changed', (event) => {
      orbit.enabled = !event.value;
    });
    transform.addEventListener('mouseUp', () => {
      if (!transform.object) return;
      const delta = transform.object.position.clone().sub(origin);
      current.current.onMove(transform.object.userData.partId as string, {
        x: delta.x,
        y: delta.y,
        z: delta.z,
      });
      refresh();
    });
    const ray = new THREE.Raycaster();
    let start = {x: 0, y: 0};
    const down = (event: PointerEvent) => {
      start = {x: event.clientX, y: event.clientY};
    };
    const select = (event: PointerEvent) => {
      if (
        transform.axis ||
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4
      )
        return;
      const rect = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          (-(event.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray.intersectObjects(group.children, true)[0];
      if (hit) current.current.onSelect(hit.object.userData.partId as string);
    };
    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointerup', select);
    const resize = new ResizeObserver(() => {
      if (!host.current) return;
      const {width, height} = host.current.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    });
    resize.observe(host.current);
    renderer.setAnimationLoop(() => {
      orbit.update();
      renderer.render(scene, camera);
    });
    return () => {
      api.current = null;
      resize.disconnect();
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener('pointerdown', down);
      renderer.domElement.removeEventListener('pointerup', select);
      transform.dispose();
      orbit.dispose();
      disposeGroup();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  useEffect(() => {
    api.current?.refresh();
  }, [
    props.definition,
    props.selectedId,
    props.view,
    props.tool,
    props.snap,
    props.openings,
    props.fitRevision,
  ]);
  return (
    <div
      className="cu-canvas"
      ref={host}
      aria-label="Interactive cabinet 3D viewport"
    >
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
