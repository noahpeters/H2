import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import {cabinetGeometry} from './kitchenGeometry';
import {applianceGeometry} from './applianceGeometry';
import {
  createKitchenAppliance,
  type ApplianceKind,
  type KitchenElement,
} from './model';
import {createOpenStorage, type StorageKind} from './openStorage';
import {
  cabinetColor,
  type CabinetMaterial,
  type CabinetPaint,
} from './materials';

export type VisualCategory =
  | 'cabinet'
  | 'base'
  | 'tall'
  | 'front'
  | 'appliance-front'
  | 'material'
  | 'paint'
  | 'appliance'
  | 'storage';

export function previewElement(
  category: VisualCategory,
  value: string,
): KitchenElement {
  const item: KitchenElement = {
    id: 'preview',
    kind: 'base',
    width: 30,
    height: 34.5,
    depth: 24,
    face: 'shaker',
    placement: {mode: 'wall', wall: 'back', offset: 0, elevation: 0},
  };
  if (category === 'storage')
    return createOpenStorage(value as StorageKind, 'preview');
  if (category === 'appliance')
    return createKitchenAppliance(value as ApplianceKind, 'preview');
  if (category === 'cabinet') {
    if (value === 'corner') {
      item.configuration = 'corner';
      item.width = 36;
      item.depth = 36;
    } else {
      item.kind = value as KitchenElement['kind'];
      item.height =
        value === 'tall' ? 84 : value === 'wall-cabinet' ? 30 : 34.5;
      item.depth = value === 'wall-cabinet' ? 12 : 24;
    }
  }
  if (category === 'base') {
    item.configuration = value as KitchenElement['configuration'];
    if (value === 'farmhouse-sink' || value === 'corner') item.width = 36;
    if (value === 'corner') item.depth = 36;
  }
  if (category === 'tall') {
    item.kind = 'tall';
    item.height = 90;
    item.tallConfiguration = value as KitchenElement['tallConfiguration'];
  }
  if (category === 'front') {
    item.face = value as KitchenElement['face'];
    if (value === 'shaker-glass') item.kind = 'wall-cabinet';
  }
  if (category === 'appliance-front') {
    return {
      ...createKitchenAppliance('dishwasher', 'preview'),
      applianceFront: value as KitchenElement['applianceFront'],
    };
  }
  if (category === 'material') item.material = value as CabinetMaterial;
  if (category === 'paint') {
    item.material = 'paint-grade';
    item.paintColor = value as CabinetPaint;
  }
  return item;
}

// One renderer, reused for static images: no animation loops or WebGL context per tile.
let renderer: THREE.WebGLRenderer | undefined;
const images = new Map<string, string>();
function thumbnail(category: VisualCategory, value: string) {
  const key = `${category}:${value}`;
  const cached = images.get(key);
  if (cached) return cached;
  renderer ??= new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(240, 180);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f4f2ec');
  const item = previewElement(category, value);
  const body =
    item.kind === 'appliance'
      ? applianceGeometry(
          item.applianceKind!,
          item.width * 0.0254,
          item.height * 0.0254,
          item.depth * 0.0254,
          item.applianceFront,
          false,
          cabinetColor(item),
          item.applianceKind === 'dishwasher',
        )
      : cabinetGeometry(item, true, false);
  scene.add(body, new THREE.HemisphereLight(0xffffff, 0x5b5546, 2.2));
  // Light construction lines keep shallow frame details readable at tile size.
  const meshes: THREE.Mesh[] = [];
  body.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  for (const mesh of meshes) {
    mesh.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({
          color: 0x4c493f,
          transparent: true,
          opacity: 0.25,
        }),
      ),
    );
  }
  const light = new THREE.DirectionalLight(0xffffff, 2.5);
  light.position.set(-3, 5, 4);
  scene.add(light);
  const box = new THREE.Box3().setFromObject(body);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(35, 4 / 3, 0.01, 100);
  camera.position
    .copy(center)
    .add(
      new THREE.Vector3(0.6, 0.35, 1)
        .normalize()
        .multiplyScalar(
          (size.length() / 2 / Math.sin(THREE.MathUtils.degToRad(17.5))) * 1.08,
        ),
    );
  camera.lookAt(center);
  try {
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    images.set(key, url);
    return url;
  } finally {
    body.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.LineSegments
      ) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }
}

export function ChoiceImage({
  category,
  value,
}: {
  category: VisualCategory;
  value: string;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    setSrc(undefined);
    const target = host.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      try {
        setSrc(thumbnail(category, value));
      } catch {
        /* Text labels remain usable without WebGL. */
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [category, value]);
  return (
    <span ref={host} className="cc-choice-image" aria-hidden="true">
      {src ? (
        <img src={src} alt="" width={240} height={180} />
      ) : (
        <span className="cc-choice-placeholder">◇</span>
      )}
    </span>
  );
}

export function VisualSelect({
  category,
  value,
  onChange,
  children,
}: {
  category: VisualCategory;
  value: string;
  onChange: (event: {currentTarget: {value: string}}) => void;
  children: ReactNode;
}) {
  return (
    <div className="cc-choice-grid">
      {Children.toArray(children)
        .filter(isValidElement)
        .map((child) => {
          const option = child.props as {
            value: string;
            children: ReactNode;
            disabled?: boolean;
          };
          return (
            <button
              type="button"
              key={option.value}
              className="cc-choice"
              aria-pressed={value === option.value}
              disabled={option.disabled}
              onClick={() => onChange({currentTarget: {value: option.value}})}
            >
              <ChoiceImage category={category} value={option.value} />
              <span>{option.children}</span>
            </button>
          );
        })}
    </div>
  );
}
