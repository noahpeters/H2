import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useSavedRooms} from './useSavedRooms';
import {ChoiceImage, VisualSelect} from './VisualChoices';
import {ShareRoomForm} from './ShareRoomForm';
import {StudyInquiryDialog} from '../StudyInquiryDialog';
import {cabinetStudySummary} from '../studyInquiry';
import {OPEN_STORAGE, createOpenStorage, type StorageKind} from './openStorage';
import {OpenStorageControls} from './OpenStorageControls';
import {
  applyCreationPreferences,
  loadCreationPreferences,
  rememberCreationPreferences,
  saveCreationPreferences,
  type CreationPreferences,
} from './creationPreferences';
import {placeOpening} from './openingPlacement';
import {
  automaticallyPlaceIsland,
  automaticallyPlaceElement,
  automaticallyPlaceOpening,
} from './automaticPlacement';
import {
  roomPoints,
  roomSegments,
  roomWall,
  wallPoint,
  validOutline,
  moveRoomWall,
  addRoomRecess,
  removeRoomRecess,
  presetOutline,
  type RoomPoint,
} from './roomOutline';
import {
  CABINET_MATERIALS,
  CABINET_PAINTS,
  cabinetColor,
  hasMaterialFinish,
  type CabinetMaterial,
  type CabinetPaint,
} from './materials';
import * as THREE from 'three';
import {
  islandAt,
  positionElement,
  snapAdjacent,
  snapWall,
  snapIslandEdges,
  snapRoomCorner,
} from './placement';
import {
  cabinetGeometry,
  roomGeometry,
  roomFloorGeometry,
  openingGeometry,
  islandCountertop,
} from './kitchenGeometry';
import {applianceGeometry} from './applianceGeometry';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {
  APPLIANCE_CATALOG,
  APPLIANCE_FRONT_OPTIONS,
  minimumTallHeight,
  type BaseConfiguration,
  aisleClearance,
  bounds,
  createKitchenAppliance,
  elementCenter,
  migrateElement,
  moveIsland,
  snapAngle,
  validateLayout,
  wallToFloor,
  type Island,
  type ApplianceKind,
  type KitchenElement,
  type Room,
  type Wall,
} from './model';

type View = 'plan' | 'split' | 'three';
type Opening = {
  id: string;
  kind: 'door' | 'window' | 'opening';
  wall: Wall;
  offset: number;
  width: number;
  height: number;
  sill?: number;
};
export type Study = {
  version: 2;
  room: Room;
  openings: Opening[];
  elements: KitchenElement[];
  islands: Island[];
  selected: string | null;
  countertop: boolean;
  view: View;
};
export function reshapeStudy(study: Study, points: RoomPoint[]): Study {
  if (!validOutline(points)) return study;
  const x = Math.min(...points.map((p) => p.x)),
    z = Math.min(...points.map((p) => p.z));
  const width = Math.max(...points.map((p) => p.x)) - x,
    depth = Math.max(...points.map((p) => p.z)) - z;
  if (width < 12 || depth < 12 || width > 10000 || depth > 10000) return study;
  const next = clone(study);
  next.room = {
    ...study.room,
    width,
    depth,
    outline: points.map((p) => ({...p, x: p.x - x, z: p.z - z})),
  };
  const walls = roomSegments(next.room);
  for (const e of next.elements) {
    if (e.placement.mode === 'wall') {
      const wall = e.placement.wall;
      const s = walls.find((s) => s.id === wall);
      if (s) {
        e.placement.offset = Math.max(
          0,
          Math.min(e.placement.offset, s.length - e.width),
        );
        continue;
      }
      e.placement = {
        ...wallToFloor(e, study.room),
        elevation: e.placement.elevation,
      };
    }
    e.placement.x -= x;
    e.placement.z -= z;
  }
  next.islands.forEach((i) => {
    i.x -= x;
    i.z -= z;
  });
  next.openings.forEach((o) => {
    const existing = walls.find((s) => s.id === o.wall);
    const old = wallPoint(study.room, o.wall, o.offset + o.width / 2);
    const target = {x: old.x - x, z: old.z - z};
    const distance = (s: (typeof walls)[number]) => {
      const along = s.horizontal ? target.x - s.x : target.z - s.z;
      const across = s.horizontal ? target.z - s.z : target.x - s.x;
      return Math.hypot(across, Math.max(0, -along, along - s.length));
    };
    const s =
      existing ?? [...walls].sort((a, b) => distance(a) - distance(b))[0];
    if (!existing)
      o.offset = (s.horizontal ? target.x - s.x : target.z - s.z) - o.width / 2;
    o.wall = s.id;
    o.offset = Math.max(0, Math.min(o.offset, s.length - o.width));
  });
  return next;
}
const INCH = 0.0254;
const makeId = () => Math.random().toString(36).slice(2, 9);

export function blankStudy(): Study {
  return {
    ...initialStudy(),
    openings: [],
    elements: [],
    islands: [],
    selected: null,
  };
}

function initialStudy(): Study {
  return {
    version: 2,
    room: {width: 144, depth: 120, height: 96, floor: 'oak', walls: 'plaster'},
    openings: [
      {
        id: 'starter-front-opening',
        kind: 'opening',
        wall: 'front',
        offset: 24,
        width: 96,
        height: 80,
      },
      {
        id: 'starter-door',
        kind: 'door',
        wall: 'back',
        offset: 18,
        width: 32,
        height: 80,
      },
    ],
    elements: [
      {
        id: 'starter-base',
        kind: 'base',
        width: 30,
        depth: 24,
        height: 34.5,
        face: 'shaker',
        placement: {mode: 'wall', wall: 'back', offset: 56, elevation: 0},
      },
      {
        id: 'starter-wall',
        kind: 'wall-cabinet',
        width: 30,
        depth: 12,
        height: 30,
        face: 'shaker',
        placement: {mode: 'wall', wall: 'back', offset: 56, elevation: 54},
      },
    ],
    islands: [],
    selected: null,
    countertop: true,
    view: 'split',
  };
}

export const REFERENCE_KITCHEN_PRESET = 'warm-oak-farmhouse-kitchen';

/** A shareable starting study modeled on the supplied warm-oak kitchen. */
export function referenceKitchenStudy(): Study {
  const face = 'vertical-slat' as const;
  const material = 'rift-white-oak' as const;
  const wallElement = (
    id: string,
    kind: KitchenElement['kind'],
    wall: Wall,
    offset: number,
    width: number,
    extras: Partial<KitchenElement> = {},
  ): KitchenElement => ({
    id,
    kind,
    width,
    depth: kind === 'wall-cabinet' ? 12 : 24,
    height: kind === 'wall-cabinet' ? 30 : kind === 'tall' ? 108 : 34.5,
    face,
    material,
    placement: {
      mode: 'wall',
      wall,
      offset,
      elevation: kind === 'wall-cabinet' ? 54 : 0,
    },
    ...extras,
  });
  const islandBase = (id: string, x: number): KitchenElement => ({
    id,
    kind: 'base',
    width: 30,
    depth: 24,
    height: 34.5,
    face,
    material,
    configuration: 'door-drawer',
    islandId: 'reference-island',
    placement: {mode: 'floor', x, z: 135, rotation: 0},
  });
  return {
    version: 2,
    room: {
      width: 300,
      depth: 240,
      height: 144,
      floor: 'concrete',
      walls: 'plaster',
    },
    openings: [
      {
        id: 'reference-entry',
        kind: 'door',
        wall: 'back',
        offset: 118,
        width: 36,
        height: 84,
      },
      {
        id: 'reference-window-one',
        kind: 'window',
        wall: 'right',
        offset: 52,
        width: 54,
        height: 52,
        sill: 42,
      },
      {
        id: 'reference-window-two',
        kind: 'window',
        wall: 'right',
        offset: 142,
        width: 42,
        height: 52,
        sill: 42,
      },
    ],
    elements: [
      wallElement('reference-pantry-a', 'tall', 'back', 24, 36),
      wallElement('reference-pantry-b', 'tall', 'back', 60, 36),
      wallElement('reference-base-a', 'base', 'right', 20, 32, {
        configuration: 'door-drawer',
      }),
      wallElement('reference-base-b', 'base', 'right', 52, 32, {
        configuration: 'three-drawer',
      }),
      wallElement('reference-farmhouse-sink', 'base', 'right', 84, 36, {
        configuration: 'farmhouse-sink',
      }),
      {
        ...createKitchenAppliance('dishwasher', 'reference-dishwasher'),
        applianceFront: 'vertical-slat',
        material,
        placement: {mode: 'wall', wall: 'right', offset: 120, elevation: 0},
      },
      wallElement('reference-base-c', 'base', 'right', 144, 36, {
        configuration: 'door-drawer',
      }),
      wallElement('reference-tall-right', 'tall', 'right', 192, 36),
      wallElement(
        'reference-floating-shelves',
        'wall-cabinet',
        'right',
        76,
        48,
        {
          depth: 11,
          height: 34,
          storage: {
            type: 'floating-shelves',
            shelves: 3,
            drawers: 0,
            rodHeight: 68,
            lowerRodHeight: 36,
            shelfSpacing: 0,
            dividerPercent: 40,
            doors: false,
            back: false,
            angled: false,
          },
          placement: {mode: 'wall', wall: 'right', offset: 68, elevation: 55},
        },
      ),
      wallElement('reference-left-base-a', 'base', 'left', 18, 30, {
        configuration: 'door-drawer',
      }),
      {
        ...createKitchenAppliance('range', 'reference-range'),
        width: 36,
        rangeHood: true,
        placement: {mode: 'wall', wall: 'left', offset: 48, elevation: 0},
      },
      wallElement('reference-left-base-b', 'base', 'left', 84, 30, {
        configuration: 'door-drawer',
      }),
      islandBase('reference-island-a', 120),
      islandBase('reference-island-b', 150),
      islandBase('reference-island-c', 180),
    ],
    islands: [
      {
        id: 'reference-island',
        x: 150,
        z: 135,
        width: 96,
        depth: 42,
        rotation: 0,
        overhang: 12,
        seatingSide: 'south',
      },
    ],
    selected: 'reference-farmhouse-sink',
    countertop: true,
    view: 'split',
  };
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
export function migrateStudy(raw: unknown): Study {
  const fallback = initialStudy();
  if (!raw || typeof raw !== 'object') return fallback;
  const value = raw as Partial<Study> & {
    cabinets?: Parameters<typeof migrateElement>[0][];
    appliances?: Array<{
      id: string;
      kind: ApplianceKind;
      wall: Wall;
      offset: number;
      width: number;
      depth: number;
      height: number;
      elevation: number;
      hostCabinetId?: string;
    }>;
  };
  const elements = (value.elements ?? value.cabinets ?? []).map(migrateElement);
  const migratedAppliances = (value.appliances ?? []).map((appliance) => ({
    id: appliance.id,
    kind: 'appliance' as const,
    applianceKind: appliance.kind,
    width: appliance.width,
    depth: appliance.depth,
    height: appliance.height,
    face: 'slab' as const,
    placement: appliance.hostCabinetId
      ? ({
          mode: 'hosted' as const,
          hostId: appliance.hostCabinetId,
          x: appliance.offset + appliance.width / 2,
          z: appliance.depth / 2,
          elevation: appliance.elevation,
          rotation: 0,
        } as const)
      : ({
          mode: 'wall' as const,
          wall: appliance.wall,
          offset: appliance.offset,
          elevation: appliance.elevation,
        } as const),
  }));
  return {
    ...fallback,
    ...value,
    version: 2,
    view: 'split',
    room: {...fallback.room, ...value.room},
    elements: [...elements, ...migratedAppliances],
    islands: value.islands ?? [],
  };
}

type ActiveDrag =
  | {
      id: string;
      mode: 'floor' | 'island';
      x: number;
      z: number;
      clientX: number;
      clientY: number;
    }
  | {
      id: string;
      mode: 'wall';
      wall: Wall;
      offset: number;
      pointer: number;
      clientX?: number;
      clientY?: number;
      x?: number;
      z?: number;
    };

export function createDragUpdate(
  active: ActiveDrag,
  clientX: number,
  clientY: number,
  screenScale: number,
) {
  return (current: Study): Study => {
    const next = clone(current);
    if (active.mode === 'island') {
      const island = next.islands.find((i) => i.id === active.id);
      if (!island) return current;
      const target = {
        x: active.x + (clientX - active.clientX) / screenScale,
        z: active.z + (clientY - active.clientY) / screenScale,
        rotation: island.rotation,
      };
      next.elements = moveIsland(island, next.elements, target);
      Object.assign(island, target);
      return next;
    }
    const element = next.elements.find((item) => item.id === active.id);
    if (
      element &&
      active.x !== undefined &&
      active.z !== undefined &&
      active.clientX !== undefined &&
      active.clientY !== undefined
    ) {
      positionElement(
        element,
        Math.round(active.x + (clientX - active.clientX) / screenScale),
        Math.round(active.z + (clientY - active.clientY) / screenScale),
        next.room,
      );
      if (snapRoomCorner(element, next.room)) return next;
      snapWall(element, next.room);
    } else if (active.mode === 'wall' && element?.placement.mode === 'wall') {
      const pointer = roomWall(next.room, active.wall).horizontal
        ? clientX
        : clientY;
      element.placement.offset = Math.max(
        0,
        Math.min(
          roomWall(next.room, active.wall).length - element.width,
          Math.round(active.offset + (pointer - active.pointer) / screenScale),
        ),
      );
    }
    if (element) {
      snapAdjacent(element, next.elements, next.room);
      snapIslandEdges(element, next.islands, next.room);
    }
    return next;
  };
}
function elementTransform(element: KitchenElement, room: Room) {
  const center = elementCenter(element, room);
  const rotation =
    element.placement.mode === 'wall'
      ? wallToFloor(element, room).rotation
      : element.placement.rotation;
  return {...center, rotation};
}
function ViewControls({
  view,
  pan,
  onPan,
  onZoom,
  onFit,
}: {
  view: string;
  pan: boolean;
  onPan: () => void;
  onZoom: (factor: number) => void;
  onFit: () => void;
}) {
  return (
    <div className="cc-plan-tools" aria-label={`${view} navigation`}>
      <button
        type="button"
        aria-label={`Zoom out ${view}`}
        onClick={() => onZoom(1 / 1.25)}
      >
        −
      </button>
      <button
        type="button"
        aria-label={`Zoom in ${view}`}
        onClick={() => onZoom(1.25)}
      >
        +
      </button>
      <button type="button" onClick={onFit} title="Fit room to view">
        Fit
      </button>
      <button
        type="button"
        aria-pressed={pan}
        onClick={onPan}
        title="Drag to pan. You can also right-drag or Shift-drag."
      >
        Pan
      </button>
    </div>
  );
}

export function ThreeStudy({
  study,
  onSelect,
  showControls = false,
}: {
  study: Study;
  showControls?: boolean;
  onSelect?: (id: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState(false);
  const panRef = useRef(pan);
  panRef.current = pan;
  const controlsRef = useRef<OrbitControls | null>(null);
  const navigation = useRef<{
    zoom: (factor: number) => void;
    fit: () => void;
  } | null>(null);
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.mouseButtons.LEFT = pan
        ? THREE.MOUSE.PAN
        : THREE.MOUSE.ROTATE;
      controlsRef.current.touches.ONE = pan
        ? THREE.TOUCH.PAN
        : THREE.TOUCH.ROTATE;
    }
  }, [pan]);
  const hasNavigated = useRef(false);
  const viewRef = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
    zoom: number;
  } | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f2ec);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
    const renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.append(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.mouseButtons.LEFT = panRef.current
      ? THREE.MOUSE.PAN
      : THREE.MOUSE.ROTATE;
    controls.touches.ONE = panRef.current
      ? THREE.TOUCH.PAN
      : THREE.TOUCH.ROTATE;
    const rememberNavigation = () => {
      hasNavigated.current = true;
    };
    controls.addEventListener('start', rememberNavigation);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.02;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5b5546, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(-3, 5, 4);
    sun.castShadow = true;
    scene.add(sun);

    const roomWidth = study.room.width * INCH;
    const roomDepth = study.room.depth * INCH;
    const roomHeight = study.room.height * INCH;
    const floorColors = {oak: 0xbca679, walnut: 0x75604c, concrete: 0xbab9b4};
    const wallColors = {plaster: 0xe9e3d7, white: 0xf5f4ef, green: 0x849184};
    const floor = roomFloorGeometry(study.room, floorColors[study.room.floor]);
    scene.add(floor);
    scene.add(
      ...roomGeometry(study.room, study.openings, wallColors[study.room.walls]),
    );

    const selectable: THREE.Object3D[] = [];
    const warningIds = validateLayout(study.elements, study.room);
    for (const island of study.islands) {
      if (!study.countertop) continue;
      const top = islandCountertop(island, study.elements);
      top.position.set(
        -roomWidth / 2 + island.x * INCH,
        36 * INCH,
        -roomDepth / 2 + island.z * INCH,
      );
      top.rotation.y = (-island.rotation * Math.PI) / 180;
      scene.add(top);
    }
    for (const cabinet of study.elements) {
      const width = cabinet.width * INCH;
      const depth = cabinet.depth * INCH;
      const height = cabinet.height * INCH;
      const isAppliance = cabinet.kind === 'appliance';
      const body = isAppliance
        ? applianceGeometry(
            cabinet.applianceKind ?? 'dishwasher',
            width,
            height,
            depth,
            cabinet.applianceFront,
            cabinet.rangeHood,
            cabinetColor(cabinet),
            study.countertop && !cabinet.islandId,
          )
        : cabinetGeometry(
            cabinet,
            study.countertop,
            study.islands.some((i) => i.id === cabinet.islandId),
          );
      body.userData.id = cabinet.id;
      const transform = elementTransform(cabinet, study.room);
      const elevation =
        cabinet.placement.mode === 'wall'
          ? cabinet.placement.elevation
          : cabinet.placement.mode === 'hosted'
            ? cabinet.placement.elevation
            : (cabinet.placement.elevation ?? 0);
      body.rotation.y = (-transform.rotation * Math.PI) / 180;
      body.position.set(
        -roomWidth / 2 + transform.x * INCH,
        elevation * INCH + height / 2,
        -roomDepth / 2 + transform.z * INCH,
      );
      scene.add(body);
      selectable.push(body);
      if (cabinet.id === study.selected)
        scene.add(new THREE.BoxHelper(body, 0xb57d45));
    }

    for (const opening of study.openings) {
      const object = openingGeometry(opening, study.room);
      scene.add(object);
      selectable.push(object);
    }

    const largest = Math.max(roomWidth, roomDepth);
    controls.target.set(0, roomHeight * 0.34, 0);
    camera.position.set(largest * 0.82, roomHeight * 0.82, largest * 0.95);
    if (viewRef.current) {
      camera.position.copy(viewRef.current.position);
      controls.target.copy(viewRef.current.target);
      camera.zoom = viewRef.current.zoom;
      camera.updateProjectionMatrix();
    }
    controls.update();

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      camera.aspect = bounds.width / bounds.height;
      if (!hasNavigated.current) {
        // Fit the loaded room until the user takes control of the camera.
        // This also handles the saved design arriving after the initial render.
        const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
        const limitingFov = Math.min(
          halfFov,
          Math.atan(Math.tan(halfFov) * camera.aspect),
        );
        const radius = Math.hypot(roomWidth, roomDepth, roomHeight) / 2;
        controls.target.set(0, roomHeight / 2, 0);
        camera.position
          .copy(controls.target)
          .add(
            new THREE.Vector3(0.82, 0.6, 0.95)
              .normalize()
              .multiplyScalar(radius / Math.sin(limitingFov)),
          );
        controls.update();
      }
      camera.updateProjectionMatrix();
      renderer.setSize(bounds.width, bounds.height, false);
    };
    navigation.current = {
      zoom: (factor) => {
        hasNavigated.current = true;
        camera.position
          .sub(controls.target)
          .multiplyScalar(1 / factor)
          .add(controls.target);
        controls.update();
      },
      fit: () => {
        hasNavigated.current = false;
        camera.zoom = 1;
        resize();
      },
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const handlePick = (event: PointerEvent) => {
      if (
        panRef.current ||
        event.button !== 0 ||
        event.shiftKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(selectable, true)[0];
      let current: THREE.Object3D | null | undefined = hit?.object;
      while (current && !current.userData.id)
        current = current.parent ?? undefined;
      if (current?.userData.id)
        selectRef.current?.(current.userData.id as string);
    };
    renderer.domElement.addEventListener('pointerdown', handlePick);

    let frame = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      viewRef.current = {
        position: camera.position.clone(),
        target: controls.target.clone(),
        zoom: camera.zoom,
      };
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePick);
      controls.removeEventListener('start', rememberNavigation);
      navigation.current = null;
      controlsRef.current = null;
      controls.dispose();
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((item) => item.dispose());
        }
      });
      host.replaceChildren();
    };
  }, [study]);

  return (
    <>
      {showControls && (
        <div className="cc-panel-label">
          <span>Spatial study</span>
          <ViewControls
            view="3D"
            pan={pan}
            onPan={() => setPan((active) => !active)}
            onZoom={(factor) => navigation.current?.zoom(factor)}
            onFit={() => navigation.current?.fit()}
          />
        </div>
      )}
      <div
        style={{cursor: pan ? 'grab' : undefined}}
        className="cc-three-host"
        ref={hostRef}
        aria-label="Interactive 3D room study"
      />
    </>
  );
}

export function CabinetConfigurator({
  turnstileSiteKey = '',
}: {turnstileSiteKey?: string} = {}) {
  const planSvg = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({x: 0, y: 0, zoom: 1});
  const [panMode, setPanMode] = useState(false);
  const panDrag = useRef<{
    id: number;
    x: number;
    y: number;
    scale: number;
  } | null>(null);
  const zoomPlan = useCallback((factor: number, point = {x: 390, y: 280}) => {
    setViewport((current) => {
      const zoom = Math.min(8, Math.max(0.5, current.zoom * factor));
      return {
        zoom,
        x: current.x + point.x / current.zoom - point.x / zoom,
        y: current.y + point.y / current.zoom - point.y / zoom,
      };
    });
  }, []);
  useEffect(() => {
    const svg = planSvg.current;
    if (!svg) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (
        panDrag.current ||
        drag.current ||
        roomDrag.current ||
        openingDrag.current
      )
        return;
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
        matrix.inverse(),
      );
      const box = svg.viewBox.baseVal;
      zoomPlan(
        Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.04 : 0.002)),
        {
          x: ((point.x - box.x) * 780) / box.width,
          y: ((point.y - box.y) * 560) / box.height,
        },
      );
    };
    svg.addEventListener('wheel', wheel, {passive: false});
    return () => svg.removeEventListener('wheel', wheel);
  }, [zoomPlan]);
  const [sharing, setSharing] = useState(false);
  const [pricing, setPricing] = useState(false);
  const [inquiring, setInquiring] = useState(false);
  const [editingRoom, setEditingRoom] = useState(false);
  const [selectedWall, setSelectedWall] = useState<Wall>('back');
  const [outlineError, setOutlineError] = useState('');
  const roomControls = useRef<HTMLDetailsElement>(null);
  const openingDrag = useRef<{
    id: string;
    x: number;
    z: number;
    clientX: number;
    clientY: number;
    scale: number;
    pointerId: number;
  } | null>(null);
  const roomDrag = useRef<{
    study: Study;
    id: Wall;
    pointer: number;
    position: number;
    scale: number;
    horizontal: boolean;
  } | null>(null);
  const [study, setStudy] = useState<Study>(initialStudy);
  const [history, setHistory] = useState<Study[]>([]);
  const placementHints = useRef<{floor?: string; wall?: string}>({});
  const creationPreferences = useRef<CreationPreferences | null>(null);
  if (!creationPreferences.current)
    creationPreferences.current = loadCreationPreferences(
      typeof window === 'undefined' ? undefined : window.localStorage,
    );
  const drag = useRef<ActiveDrag | null>(null);
  const rooms = useSavedRooms(
    study,
    setStudy,
    (preset) =>
      preset === REFERENCE_KITCHEN_PRESET
        ? referenceKitchenStudy()
        : preset === 'blank'
          ? blankStudy()
          : initialStudy(),
    migrateStudy,
    () => {
      setHistory([]);
      placementHints.current = {};
      setSelectedWall('back');
    },
  );
  const update = useCallback(
    (change: (draft: Study) => void) =>
      setStudy((current) => {
        setHistory((items) => [...items.slice(-29), clone(current)]);
        const next = clone(current);
        change(next);
        return next;
      }),
    [],
  );
  const selected = study.elements.find((item) => item.id === study.selected);
  useEffect(() => {
    if (selected)
      placementHints.current[
        selected.kind === 'wall-cabinet' ? 'wall' : 'floor'
      ] = selected.id;
    if (!selected || !creationPreferences.current) return;
    creationPreferences.current = rememberCreationPreferences(
      creationPreferences.current,
      selected,
    );
    saveCreationPreferences(
      typeof window === 'undefined' ? undefined : window.localStorage,
      creationPreferences.current,
    );
  }, [selected]);
  const warnings = useMemo(() => {
    const result = validateLayout(study.elements, study.room);
    for (const o of study.openings)
      if (
        o.offset < 0 ||
        o.offset + o.width > roomWall(study.room, o.wall).length ||
        (o.sill && o.kind === 'window' ? o.sill : 0) + o.height >
          study.room.height
      )
        result.set(o.id, [
          'Opening exceeds its wall. Resize or reposition it.',
        ]);
    return result;
  }, [study]);
  const pad = 62,
    scale = Math.min(
      (780 - pad * 2) / study.room.width,
      (560 - pad * 2) / study.room.depth,
    );
  const placementContext = (item: KitchenElement, draft: Study) => ({
    elementId:
      draft.selected &&
      (draft.islands.some((i) => i.id === draft.selected) ||
        draft.elements.some(
          (e) =>
            e.id === draft.selected &&
            (e.kind === 'wall-cabinet') === (item.kind === 'wall-cabinet'),
        ))
        ? draft.selected
        : placementHints.current[
            item.kind === 'wall-cabinet' ? 'wall' : 'floor'
          ],
    wall: selectedWall,
  });
  const addElement = (
    kind: KitchenElement['kind'],
    applianceKind?: ApplianceKind,
    configuration?: BaseConfiguration,
    tallConfiguration?: KitchenElement['tallConfiguration'],
  ) =>
    update((d) => {
      if (kind === 'appliance' && applianceKind) {
        const item = applyCreationPreferences(
          createKitchenAppliance(applianceKind, makeId()),
          creationPreferences.current!,
          d.room,
        );
        d.elements.push(
          automaticallyPlaceElement(item, d, placementContext(item, d)),
        );
        d.selected = item.id;
        return;
      }
      const item: KitchenElement = {
        configuration,
        tallConfiguration,
        id: makeId(),
        kind,
        width:
          configuration === 'corner' || configuration === 'farmhouse-sink'
            ? 36
            : kind === 'appliance'
              ? 24
              : 30,
        depth:
          configuration === 'corner' ? 36 : kind === 'wall-cabinet' ? 12 : 24,
        height:
          kind === 'wall-cabinet'
            ? 30
            : kind === 'tall'
              ? 84
              : kind === 'appliance'
                ? 36
                : 34.5,
        face: 'shaker',
        placement: {
          mode: 'wall',
          wall: 'back',
          offset: 42,
          elevation: kind === 'wall-cabinet' ? 54 : 0,
        },
      };
      const remembered = applyCreationPreferences(
        item,
        creationPreferences.current!,
        d.room,
      );
      // An explicit catalog choice wins over remembered defaults. Corner-base
      // dimensions come from its own preference scope after its first use.
      if (configuration === 'corner') {
        remembered.configuration = 'corner';
      } else if (configuration === 'farmhouse-sink') {
        remembered.configuration = configuration;
        remembered.width = 36;
      } else if (kind === 'base' && configuration) {
        remembered.configuration = configuration;
      }
      if (kind === 'tall' && tallConfiguration) {
        remembered.tallConfiguration = tallConfiguration;
        remembered.height = Math.max(
          remembered.height,
          minimumTallHeight(tallConfiguration),
        );
      }
      d.elements.push(
        automaticallyPlaceElement(
          remembered,
          d,
          placementContext(remembered, d),
        ),
      );
      d.selected = remembered.id;
    });
  const addIsland = () =>
    update((d) => {
      const island: Island = {
        id: makeId(),
        x: d.room.width / 2,
        z: d.room.depth / 2,
        width: 72,
        depth: 42,
        rotation: 0,
        overhang: 12,
        seatingSide: 'south',
      };
      d.islands.push(automaticallyPlaceIsland(island, d));
      d.selected = island.id;
    });
  const changeIsland = (
    island: Island,
    key: keyof Island,
    value: string | number,
  ) =>
    update((d) => {
      const target = d.islands.find((i) => i.id === island.id)!;
      if (key === 'x' || key === 'z' || key === 'rotation') {
        const next = {
          x: target.x,
          z: target.z,
          rotation: target.rotation,
          [key]: Number(value),
        };
        d.elements = moveIsland(target, d.elements, next);
        Object.assign(target, next);
      } else Object.assign(target, {[key]: value});
    });
  const plan = (e: KitchenElement) => {
    const t = elementTransform(e, study.room);
    return {
      x: pad + t.x * scale,
      y: pad + t.z * scale,
      w: e.width * scale,
      h: e.depth * scale,
      r: t.rotation,
    };
  };
  const startDrag = (
    ev: React.PointerEvent<SVGGElement>,
    e: KitchenElement,
  ) => {
    if (e.placement.mode === 'hosted') return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    setHistory((h) => [...h.slice(-29), clone(study)]);
    drag.current =
      e.placement.mode === 'floor'
        ? {
            id: e.id,
            mode: 'floor',
            x: e.placement.x,
            z: e.placement.z,
            clientX: ev.clientX,
            clientY: ev.clientY,
          }
        : {
            id: e.id,
            mode: 'wall',
            wall: e.placement.wall,
            offset: e.placement.offset,
            clientX: ev.clientX,
            clientY: ev.clientY,
            x: elementCenter(e, study.room).x,
            z: elementCenter(e, study.room).z,
            pointer: roomWall(study.room, e.placement.wall).horizontal
              ? ev.clientX
              : ev.clientY,
          };
    setStudy((c) => ({...c, selected: e.id}));
  };
  const moveDrag = (ev: React.PointerEvent<SVGSVGElement>) => {
    if (openingDrag.current) {
      const a = openingDrag.current;
      if (ev.pointerId !== a.pointerId) return;
      const x = a.x + (ev.clientX - a.clientX) / a.scale;
      const z = a.z + (ev.clientY - a.clientY) / a.scale;
      setStudy((current) => {
        const next = clone(current);
        const opening = next.openings.find((o) => o.id === a.id);
        if (opening)
          Object.assign(opening, placeOpening(next.room, opening, x, z));
        return next;
      });
      return;
    }
    if (roomDrag.current) {
      const a = roomDrag.current;
      const position =
        a.position +
        ((a.horizontal ? ev.clientY : ev.clientX) - a.pointer) / a.scale;
      const points = moveRoomWall(a.study.room, a.id, position);
      if (points) {
        setStudy(reshapeStudy(a.study, points));
        setOutlineError('');
      } else
        setOutlineError(
          'Walls cannot cross, overlap, or be shorter than 6 inches.',
        );
      return;
    }
    if (!drag.current) return;
    const a = drag.current,
      ss = scale * (ev.currentTarget.getScreenCTM()?.a ?? 1);
    const {clientX, clientY} = ev;
    setStudy(createDragUpdate(a, clientX, clientY, ss));
  };
  const selectedIsland = study.islands.find((i) => i.id === study.selected);
  return (
    <div className="cabinet-app">
      <header className="cc-topbar">
        <a className="cc-brand" href="/">
          <span>from trees</span>
          <small>cabinet study / prototype</small>
        </a>
        <div className="cc-top-actions">
          <button
            disabled={!history.length || rooms.busy || !rooms.ready}
            onClick={() =>
              setHistory((h) => {
                const p = h.at(-1);
                if (p) setStudy(p);
                return h.slice(0, -1);
              })
            }
          >
            Undo
          </button>
          <button
            disabled={rooms.busy}
            onClick={() => {
              void rooms.switchRoom('new');
            }}
          >
            New room
          </button>
          <button
            disabled={rooms.busy}
            onClick={() => {
              void rooms.switchRoom('copy');
            }}
          >
            Copy to new
          </button>
          <button
            disabled={rooms.busy || !rooms.ready}
            onClick={() => {
              setSharing(true);
            }}
          >
            Share
          </button>
          <button
            disabled={rooms.busy || !rooms.ready}
            onClick={() => setPricing(true)}
          >
            Get price range
          </button>
          <button
            disabled={rooms.busy || !rooms.ready}
            onClick={() => setInquiring(true)}
          >
            Send this study
          </button>
          {pricing && (
            <ShareRoomForm
              purpose="price"
              siteKey={turnstileSiteKey}
              send={rooms.getPrice}
              close={() => setPricing(false)}
            />
          )}
          {sharing && (
            <ShareRoomForm
              siteKey={turnstileSiteKey}
              send={rooms.share}
              close={() => setSharing(false)}
            />
          )}
          <details>
            <summary>History</summary>
            <div className="cc-room-history-menu">
              {rooms.recent.length === 0 && <p>No saved rooms yet.</p>}
              {rooms.recent.map((room) => (
                <button
                  key={room.slug}
                  disabled={rooms.busy}
                  onClick={(event) => {
                    event.currentTarget
                      .closest('details')
                      ?.removeAttribute('open');
                    void rooms.switchRoom(room);
                  }}
                >
                  Room · {new Date(room.updatedAt).toLocaleString()}
                  {room.draft ? ' · unsaved draft' : ''}
                </button>
              ))}
            </div>
          </details>
          <span role="status">{rooms.status}</span>
          {rooms.error && (
            <button onClick={rooms.retry} disabled={rooms.busy}>
              Retry
            </button>
          )}
        </div>
      </header>
      {inquiring && (
        <StudyInquiryDialog
          source="cabinet"
          summary={cabinetStudySummary(study)}
          turnstileSiteKey={turnstileSiteKey}
          onClose={() => setInquiring(false)}
        />
      )}
      <main
        className="cc-main"
        ref={(node) => {
          if (node) node.toggleAttribute('inert', rooms.busy || !rooms.ready);
        }}
      >
        <aside className="cc-tools" aria-label="Design controls">
          <details className="cc-accordion" ref={roomControls}>
            <summary>Room</summary>
            <div className="cc-fields">
              <label>
                Room outline
                <select
                  aria-label="Room outline preset"
                  value=""
                  onChange={(e) => {
                    const points = presetOutline(
                      study.room,
                      e.currentTarget.value as
                        | 'rectangle'
                        | 'l-shape'
                        | 'alcove',
                    );
                    update((d) => Object.assign(d, reshapeStudy(d, points)));
                    setSelectedWall('back');
                    setEditingRoom(true);
                    setOutlineError('');
                  }}
                >
                  <option value="" disabled>
                    Choose a shape…
                  </option>
                  <option value="rectangle">Rectangle</option>
                  <option value="l-shape">L-shape</option>
                  <option value="alcove">Alcove</option>
                </select>
              </label>
              <button
                aria-pressed={editingRoom}
                onClick={() => {
                  setEditingRoom((v) => !v);
                  if (!editingRoom && study.view === 'three')
                    setStudy((c) => ({...c, view: 'split'}));
                }}
              >
                {editingRoom ? 'Done editing outline' : 'Edit room outline'}
              </button>
              {editingRoom && (
                <>
                  <p className="cc-muted">
                    Drag islands freely; their grouped objects move with them.
                    Drag doors, windows and openings along walls or onto another
                    wall. Select a wall and drag it perpendicular to itself.
                    Right angles and one-inch steps are preserved. Layout
                    changes may leave existing objects outside the room; review
                    warnings or Undo.
                  </p>
                  <label>
                    Wall
                    <select
                      value={roomWall(study.room, selectedWall).id}
                      onChange={(e) =>
                        setSelectedWall(e.currentTarget.value as Wall)
                      }
                    >
                      {roomSegments(study.room).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label} · {Math.round(s.length)}″
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Wall position
                    <span>
                      <input
                        aria-label="Wall position"
                        type="number"
                        step="1"
                        value={
                          roomWall(study.room, selectedWall).horizontal
                            ? roomWall(study.room, selectedWall).z
                            : roomWall(study.room, selectedWall).x
                        }
                        onChange={(e) => {
                          const points = moveRoomWall(
                            study.room,
                            selectedWall,
                            Number(e.currentTarget.value),
                          );
                          if (points) {
                            update((d) =>
                              Object.assign(d, reshapeStudy(d, points)),
                            );
                            setOutlineError('');
                          } else
                            setOutlineError(
                              'That position would cross or collapse walls.',
                            );
                        }}
                      />{' '}
                      in
                    </span>
                  </label>
                  <div className="cc-button-grid">
                    {[false, true].map((outward) => (
                      <button
                        key={String(outward)}
                        onClick={() => {
                          const points = addRoomRecess(
                            study.room,
                            selectedWall,
                            makeId(),
                            outward,
                          );
                          if (points) {
                            update((d) =>
                              Object.assign(d, reshapeStudy(d, points)),
                            );
                            setOutlineError('');
                          } else
                            setOutlineError(
                              'There is not enough space here for a recess. Choose a longer wall.',
                            );
                        }}
                      >
                        {outward ? 'Add alcove' : 'Add inward recess'}
                      </button>
                    ))}
                  </div>
                  <button
                    disabled={!removeRoomRecess(study.room, selectedWall)}
                    onClick={() => {
                      const points = removeRoomRecess(study.room, selectedWall);
                      if (!points) return;
                      update((d) => Object.assign(d, reshapeStudy(d, points)));
                      setSelectedWall(points[0].id);
                      setOutlineError('');
                    }}
                  >
                    Remove recess / alcove
                  </button>
                  <p className="cc-muted">
                    Select the middle wall or either return of a recess or
                    alcove to straighten it. Cabinets on removed walls stay in
                    place; openings move to the nearest remaining wall. Review
                    the layout afterward, or Undo.
                  </p>
                  {outlineError && (
                    <p role="alert" className="cc-inline-warning">
                      {outlineError}
                    </p>
                  )}
                </>
              )}
              {(['width', 'depth', 'height'] as const).map((k) => (
                <label key={k}>
                  Room {k}
                  <span>
                    <input
                      type="number"
                      min="12"
                      value={study.room[k]}
                      onChange={(e) =>
                        update((d) => {
                          const value = Number(e.target.value);
                          if (
                            !Number.isFinite(value) ||
                            value < 12 ||
                            value > 10000
                          )
                            return;
                          if (k === 'height') d.room.height = value;
                          else {
                            const axis = k === 'width' ? 'x' : 'z',
                              factor = value / d.room[k];
                            Object.assign(
                              d,
                              reshapeStudy(
                                d,
                                roomPoints(d.room).map((p) => ({
                                  ...p,
                                  [axis]: p[axis] * factor,
                                })),
                              ),
                            );
                          }
                        })
                      }
                    />{' '}
                    in
                  </span>
                </label>
              ))}
            </div>
            <details className="cc-add-menu">
              <summary>+ Add opening</summary>
              <div>
                {(['door', 'window', 'opening'] as const).map((kind) => (
                  <button
                    key={kind}
                    onClick={(event) => {
                      update((d) => {
                        const id = makeId();
                        d.openings.push(
                          automaticallyPlaceOpening(
                            {
                              id,
                              kind,
                              wall: roomSegments(d.room)[0].id,
                              offset: 12,
                              width:
                                kind === 'opening'
                                  ? 96
                                  : kind === 'door'
                                    ? 32
                                    : 42,
                              height: kind === 'window' ? 38 : 80,
                              sill: 42,
                            },
                            d,
                            {elementId: d.selected, wall: selectedWall},
                          ),
                        );
                        d.selected = id;
                      });
                      event.currentTarget
                        .closest('details')
                        ?.removeAttribute('open');
                    }}
                  >
                    {kind === 'opening'
                      ? 'Doorless opening'
                      : kind === 'door'
                        ? 'Door'
                        : 'Window'}
                  </button>
                ))}
              </div>
            </details>
            <details
              className="cc-accordion"
              key={
                study.openings.some((o) => o.id === study.selected)
                  ? study.selected
                  : 'openings'
              }
              open={study.openings.some((o) => o.id === study.selected)}
            >
              <summary>
                Openings <span>{study.openings.length}</span>
              </summary>
              {study.openings.map((opening) => (
                <div key={opening.id} className="cc-fields">
                  <button
                    onClick={() =>
                      setStudy((c) => ({...c, selected: opening.id}))
                    }
                  >
                    {opening.kind} · {roomWall(study.room, opening.wall).label}{' '}
                    wall
                  </button>
                  {study.selected === opening.id && (
                    <>
                      {warnings.get(opening.id)?.map((w) => (
                        <p className="cc-inline-warning" key={w}>
                          {w}
                        </p>
                      ))}
                      <label>
                        Wall
                        <select
                          value={opening.wall}
                          onChange={(event) => {
                            const wall = event.currentTarget.value as Wall;
                            update((d) => {
                              const o = d.openings.find(
                                (o) => o.id === opening.id,
                              )!;
                              o.wall = wall;
                              o.offset = Math.max(
                                0,
                                Math.min(
                                  o.offset,
                                  roomWall(d.room, wall).length - o.width,
                                ),
                              );
                            });
                          }}
                        >
                          {roomSegments(study.room).map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {(
                        [
                          'offset',
                          'width',
                          'height',
                          ...(opening.kind === 'window' ? ['sill'] : []),
                        ] as Array<'offset' | 'width' | 'height' | 'sill'>
                      ).map((key) => (
                        <label key={key}>
                          {key}
                          <input
                            type="number"
                            min={key === 'offset' || key === 'sill' ? 0 : 1}
                            value={opening[key] ?? 0}
                            onChange={(event) => {
                              const value = Number(event.currentTarget.value);
                              if (
                                !Number.isFinite(value) ||
                                value <
                                  (key === 'offset' || key === 'sill' ? 0 : 1)
                              )
                                return;
                              update((d) => {
                                d.openings.find((o) => o.id === opening.id)![
                                  key
                                ] = value;
                              });
                            }}
                          />
                        </label>
                      ))}
                      <button
                        onClick={() =>
                          update((d) => {
                            d.openings = d.openings.filter(
                              (o) => o.id !== opening.id,
                            );
                            d.selected = null;
                          })
                        }
                      >
                        Remove {opening.kind}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </details>
            <details
              className="cc-accordion"
              key={selectedIsland?.id ?? 'islands'}
              open={!!selectedIsland}
            >
              <summary>
                Islands <span>{study.islands.length}</span>
              </summary>
              <button onClick={addIsland}>+ Island zone</button>
              {study.islands.map((i) => (
                <div className="cc-island-fields" key={i.id}>
                  <button
                    className="cc-island-select"
                    onClick={() => setStudy((c) => ({...c, selected: i.id}))}
                  >
                    Island{' '}
                    {study.islands.findIndex((entry) => entry.id === i.id) + 1}{' '}
                    · {i.width} × {i.depth}
                  </button>
                  {selectedIsland?.id === i.id && (
                    <div className="cc-fields">
                      {(['x', 'z', 'width', 'depth', 'overhang'] as const).map(
                        (k) => (
                          <label key={k}>
                            {k}
                            <span>
                              <input
                                type="number"
                                value={i[k]}
                                onChange={(e) =>
                                  changeIsland(i, k, Number(e.target.value))
                                }
                              />{' '}
                              in
                            </span>
                          </label>
                        ),
                      )}
                      <label>
                        Rotation
                        <select
                          value={i.rotation}
                          onChange={(e) =>
                            changeIsland(i, 'rotation', Number(e.target.value))
                          }
                        >
                          {[0, 90, 180, 270].map((a) => (
                            <option key={a}>{a}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Seating side
                        <select
                          value={i.seatingSide}
                          onChange={(e) =>
                            changeIsland(i, 'seatingSide', e.target.value)
                          }
                        >
                          {['none', 'north', 'south', 'east', 'west'].map(
                            (x) => (
                              <option key={x}>{x}</option>
                            ),
                          )}
                        </select>
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </details>
          </details>
          <details className="cc-accordion" open>
            <summary>Add to room</summary>
            <details className="cc-add-menu">
              <summary>+ Add cabinet</summary>
              <div className="cc-add-categories">
                <details className="cc-add-category">
                  <summary>Base</summary>
                  <div>
                    {(
                      [
                        ['single-door', 'Single door'],
                        ['pullout', 'Full-height pullout'],
                        ['door-drawer', 'Door + upper drawer'],
                        ['three-drawer', 'Three drawers'],
                        ['microwave-drawer', 'Microwave drawer'],
                        ['sink', 'Sink base'],
                        ['farmhouse-sink', 'Farmhouse / apron-front sink base'],
                      ] as const
                    ).map(([configuration, label]) => (
                      <button
                        key={configuration}
                        onClick={() =>
                          addElement('base', undefined, configuration)
                        }
                      >
                        <ChoiceImage category="base" value={configuration} />
                        {label}
                      </button>
                    ))}
                  </div>
                </details>
                <details className="cc-add-category">
                  <summary>Wall</summary>
                  <div>
                    <button onClick={() => addElement('wall-cabinet')}>
                      <ChoiceImage category="cabinet" value="wall-cabinet" />
                      Standard wall cabinet
                    </button>
                  </div>
                </details>
                <details className="cc-add-category">
                  <summary>Tall</summary>
                  <div>
                    {(
                      [
                        ['standard', 'Standard cabinet'],
                        ['one-oven', '1 oven · drawers below'],
                        ['two-oven', '2 ovens · drawers below'],
                        ['coffee-maker', 'Coffee maker · counter height'],
                      ] as const
                    ).map(([configuration, label]) => (
                      <button
                        key={configuration}
                        disabled={
                          minimumTallHeight(configuration) > study.room.height
                        }
                        onClick={() =>
                          addElement(
                            'tall',
                            undefined,
                            undefined,
                            configuration,
                          )
                        }
                      >
                        <ChoiceImage category="tall" value={configuration} />
                        {label}
                      </button>
                    ))}
                  </div>
                </details>
                <details className="cc-add-category">
                  <summary>Corner</summary>
                  <div>
                    <button
                      onClick={() => addElement('base', undefined, 'corner')}
                    >
                      <ChoiceImage category="cabinet" value="corner" />
                      L-shaped corner base
                    </button>
                  </div>
                </details>
                <details className="cc-add-category">
                  <summary>Open</summary>
                  <div>
                    {Object.entries(OPEN_STORAGE).map(([type, label]) => (
                      <button
                        key={type}
                        onClick={() => {
                          update((d) => {
                            const item = applyCreationPreferences(
                              createOpenStorage(type as StorageKind, makeId()),
                              creationPreferences.current!,
                              d.room,
                            );
                            d.elements.push(
                              automaticallyPlaceElement(
                                item,
                                d,
                                placementContext(item, d),
                              ),
                            );
                            d.selected = item.id;
                          });
                        }}
                      >
                        <ChoiceImage category="storage" value={type} />
                        {label}
                      </button>
                    ))}
                  </div>
                </details>
              </div>
            </details>
            <details className="cc-add-menu">
              <summary>+ Add appliance</summary>
              <div>
                {(Object.keys(APPLIANCE_CATALOG) as ApplianceKind[])
                  .filter(
                    (kind) => !['wall-oven', 'coffee-maker'].includes(kind),
                  )
                  .map((kind) => (
                    <button
                      key={kind}
                      onClick={(event) => {
                        addElement('appliance', kind);
                        event.currentTarget
                          .closest('details')
                          ?.removeAttribute('open');
                      }}
                    >
                      <ChoiceImage category="appliance" value={kind} />
                      {APPLIANCE_CATALOG[kind].label}
                    </button>
                  ))}
              </div>
            </details>
          </details>
          <details
            className="cc-accordion cc-selection"
            key={selected?.id ?? 'selection'}
            open={!!selected}
          >
            <summary>Selected object</summary>
            {selected ? (
              <div className="cc-fields">
                <div className="cc-selected-heading">
                  <strong>
                    {selected.storage
                      ? OPEN_STORAGE[selected.storage.type]
                      : selected.applianceKind
                        ? APPLIANCE_CATALOG[selected.applianceKind].label
                        : selected.kind}
                  </strong>
                  <button
                    onClick={() =>
                      update((d) => {
                        d.elements = d.elements.filter(
                          (x) => x.id !== selected.id,
                        );
                        d.selected = null;
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
                {selected.applianceKind === 'range' && (
                  <label>
                    Range hood
                    <input
                      type="checkbox"
                      checked={selected.rangeHood ?? false}
                      onChange={(event) => {
                        const enabled = event.currentTarget.checked;
                        update((d) => {
                          const item = d.elements.find(
                            (e) => e.id === selected.id,
                          );
                          if (item) item.rangeHood = enabled;
                        });
                      }}
                    />
                  </label>
                )}
                {selected.kind === 'appliance' &&
                  selected.placement.mode !== 'floor' && (
                    <label>
                      Rotation
                      <select
                        value={snapAngle(
                          elementTransform(selected, study.room).rotation,
                        )}
                        onChange={(event) => {
                          const angle = Number(event.currentTarget.value);
                          update((d) => {
                            const item = d.elements.find(
                              (e) => e.id === selected.id,
                            );
                            if (item)
                              item.placement.rotation = snapAngle(angle);
                          });
                        }}
                      >
                        {[0, 90, 180, 270].map((angle) => (
                          <option key={angle} value={angle}>
                            {angle}°
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                {hasMaterialFinish(selected) && (
                  <>
                    <div
                      className="cc-visual-field"
                      role="group"
                      aria-label="Material"
                    >
                      Material
                      <VisualSelect
                        category="material"
                        value={selected.material ?? 'rift-white-oak'}
                        onChange={(event) => {
                          const material = event.currentTarget
                            .value as CabinetMaterial;
                          update((d) => {
                            const item = d.elements.find(
                              (e) => e.id === selected.id,
                            );
                            if (item) item.material = material;
                          });
                        }}
                      >
                        {Object.entries(CABINET_MATERIALS).map(
                          ([key, value]) => (
                            <option key={key} value={key}>
                              {value.label}
                            </option>
                          ),
                        )}
                      </VisualSelect>
                    </div>
                    {selected.material === 'paint-grade' && (
                      <div
                        className="cc-visual-field"
                        role="group"
                        aria-label="Paint color"
                      >
                        Paint color
                        <VisualSelect
                          category="paint"
                          value={selected.paintColor ?? 'white'}
                          onChange={(event) => {
                            const paintColor = event.currentTarget
                              .value as CabinetPaint;
                            update((d) => {
                              const item = d.elements.find(
                                (e) => e.id === selected.id,
                              );
                              if (item) item.paintColor = paintColor;
                            });
                          }}
                        >
                          {Object.entries(CABINET_PAINTS).map(
                            ([key, value]) => (
                              <option key={key} value={key}>
                                {value.label}
                              </option>
                            ),
                          )}
                        </VisualSelect>
                      </div>
                    )}
                    <small>
                      Screen colors are approximate; approve a physical finish
                      sample.
                    </small>
                  </>
                )}
                {selected.kind !== 'appliance' &&
                  (!selected.storage ||
                    selected.storage.doors ||
                    selected.storage.type === 'drawers') && (
                    <div
                      className="cc-visual-field"
                      role="group"
                      aria-label="Front style"
                    >
                      Front style
                      <VisualSelect
                        category="front"
                        value={selected.face}
                        onChange={(event) => {
                          const face = event.currentTarget
                            .value as KitchenElement['face'];
                          update((d) => {
                            const item = d.elements.find(
                              (e) => e.id === selected.id,
                            );
                            if (item) item.face = face;
                          });
                        }}
                      >
                        <option value="shaker">Shaker</option>
                        <option value="inset-shaker">
                          Inset shaker with face frame
                        </option>
                        <option value="slab">Slab</option>
                        <option value="vertical-slat">
                          Vertical slat panel
                        </option>
                        {selected.kind === 'wall-cabinet' && (
                          <option value="shaker-glass">Shaker + glass</option>
                        )}
                      </VisualSelect>
                    </div>
                  )}
                {selected.kind !== 'appliance' &&
                  (!selected.storage || selected.storage.doors) &&
                  selected.width <= 30 &&
                  !(
                    selected.kind === 'base' &&
                    ['pullout', 'three-drawer', 'microwave-drawer'].includes(
                      selected.configuration ?? '',
                    )
                  ) && (
                    <label>
                      Hinge side
                      <select
                        value={selected.hinge ?? 'left'}
                        onChange={(event) => {
                          const hinge = event.currentTarget.value as
                            | 'left'
                            | 'right';
                          update((d) => {
                            const item = d.elements.find(
                              (e) => e.id === selected.id,
                            );
                            if (item) item.hinge = hinge;
                          });
                        }}
                      >
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                      </select>
                    </label>
                  )}
                {selected.kind === 'appliance' &&
                  ['refrigerator', 'dishwasher'].includes(
                    selected.applianceKind ?? '',
                  ) && (
                    <div
                      className="cc-visual-field"
                      role="group"
                      aria-label="Front style"
                    >
                      Front style
                      <VisualSelect
                        category="appliance-front"
                        value={selected.applianceFront ?? 'stainless'}
                        onChange={(event) => {
                          const front = event.currentTarget
                            .value as KitchenElement['applianceFront'];
                          update((d) => {
                            const item = d.elements.find(
                              (e) => e.id === selected.id,
                            );
                            if (item) item.applianceFront = front;
                          });
                        }}
                      >
                        {APPLIANCE_FRONT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </VisualSelect>
                    </div>
                  )}
                {selected.storage && (
                  <OpenStorageControls
                    item={selected}
                    change={(patch) =>
                      update((d) => {
                        const item = d.elements.find(
                          (e) => e.id === selected.id,
                        );
                        if (item) Object.assign(item, patch);
                      })
                    }
                  />
                )}
                {!selected.storage &&
                  (selected.kind === 'tall' ||
                    selected.kind === 'wall-cabinet') && (
                    <label>
                      Height (in)
                      <input
                        type="number"
                        min={
                          selected.kind === 'tall'
                            ? minimumTallHeight(selected.tallConfiguration)
                            : 12
                        }
                        max={study.room.height}
                        step="1"
                        value={selected.height}
                        onChange={(event) => {
                          const height = Number(event.currentTarget.value);
                          if (
                            !Number.isFinite(height) ||
                            height <
                              (selected.kind === 'tall'
                                ? minimumTallHeight(selected.tallConfiguration)
                                : 12) ||
                            height > study.room.height
                          )
                            return;
                          update((d) => {
                            const item = d.elements.find(
                              (e) => e.id === selected.id,
                            );
                            if (item) item.height = height;
                          });
                        }}
                      />
                    </label>
                  )}
                {selected.kind === 'wall-cabinet' && (
                  <label>
                    Bottom height above floor (in)
                    <input
                      type="number"
                      min="0"
                      max={study.room.height - selected.height}
                      step="1"
                      value={selected.placement.elevation ?? 0}
                      onChange={(event) => {
                        const elevation = Number(event.currentTarget.value);
                        if (
                          !Number.isFinite(elevation) ||
                          elevation < 0 ||
                          elevation + selected.height > study.room.height
                        )
                          return;
                        update((d) => {
                          const item = d.elements.find(
                            (e) => e.id === selected.id,
                          );
                          if (item) item.placement.elevation = elevation;
                        });
                      }}
                    />
                  </label>
                )}
                {selected.placement.mode !== 'hosted' && (
                  <div className="cc-fields">
                    <label>
                      Island
                      <select
                        value={selected.islandId ?? ''}
                        onChange={(event) => {
                          const id = event.currentTarget.value;
                          update((d) => {
                            const item = d.elements.find(
                              (e) => e.id === selected.id,
                            )!;
                            const center = elementCenter(item, d.room);
                            positionElement(item, center.x, center.z, d.room);
                            item.islandId = id || undefined;
                          });
                        }}
                      >
                        <option value="">No island</option>
                        {study.islands.map((i, index) => (
                          <option key={i.id} value={i.id}>
                            Island {index + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                {selected.placement.mode === 'floor' && (
                  <>
                    <label>
                      Rotation
                      <select
                        value={snapAngle(selected.placement.rotation)}
                        onChange={(e) => {
                          const angle = Number(e.currentTarget.value);
                          update((d) => {
                            const x = d.elements.find(
                              (x) => x.id === selected.id,
                            );
                            if (x?.placement.mode === 'floor')
                              x.placement.rotation = snapAngle(angle);
                          });
                        }}
                      >
                        {[0, 90, 180, 270].map((a) => (
                          <option key={a} value={a}>
                            {a}°
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <label>
                  Width
                  <span>
                    <input
                      type="number"
                      value={selected.width}
                      onChange={(e) =>
                        update((d) => {
                          const x = d.elements.find(
                            (x) => x.id === selected.id,
                          );
                          const value = Number(e.target.value);
                          if (
                            x &&
                            Number.isFinite(value) &&
                            (!x.storage || (value >= 12 && value <= 96))
                          )
                            x.width = value;
                        })
                      }
                    />{' '}
                    in
                  </span>
                </label>
                {!selected.storage &&
                  (selected.kind === 'base' ||
                    selected.kind === 'wall-cabinet' ||
                    selected.applianceKind === 'refrigerator') && (
                    <label>
                      Depth
                      <span>
                        <input
                          type="number"
                          min="4"
                          max="60"
                          value={selected.depth}
                          onChange={(event) => {
                            const depth = Number(event.currentTarget.value);
                            if (
                              !Number.isFinite(depth) ||
                              depth < 4 ||
                              depth > 60
                            )
                              return;
                            update((d) => {
                              const item = d.elements.find(
                                (e) => e.id === selected.id,
                              );
                              if (item) item.depth = depth;
                            });
                          }}
                        />{' '}
                        in
                      </span>
                    </label>
                  )}
                {warnings.get(selected.id)?.map((w) => (
                  <p className="cc-inline-warning" key={w}>
                    {w}
                  </p>
                ))}
              </div>
            ) : (
              <p className="cc-muted">Select an element in plan or 3D.</p>
            )}
          </details>
        </aside>
        <section className="cc-workspace">
          <div className="cc-tabs">
            {(['plan', 'split', 'three'] as View[]).map((v) => (
              <button
                className={study.view === v ? 'active' : ''}
                onClick={() => setStudy((c) => ({...c, view: v}))}
                key={v}
              >
                {v}
              </button>
            ))}
          </div>
          <div className={`cc-canvas-grid cc-${study.view}`}>
            <div className="cc-panel cc-plan-panel">
              <div className="cc-panel-label">
                <span>Dimensioned plan</span>
                <ViewControls
                  view="plan"
                  pan={panMode}
                  onPan={() => setPanMode((active) => !active)}
                  onZoom={zoomPlan}
                  onFit={() => setViewport({x: 0, y: 0, zoom: 1})}
                />
              </div>
              <svg
                ref={planSvg}
                viewBox={`${viewport.x} ${viewport.y} ${780 / viewport.zoom} ${560 / viewport.zoom}`}
                style={{cursor: panMode ? 'grab' : undefined}}
                onContextMenu={(event) => event.preventDefault()}
                onClickCapture={(event) => {
                  if (panMode) event.stopPropagation();
                }}
                onPointerDownCapture={(event) => {
                  if (
                    !panMode &&
                    event.button !== 2 &&
                    !event.shiftKey &&
                    !event.ctrlKey &&
                    !event.metaKey
                  )
                    return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  panDrag.current = {
                    id: event.pointerId,
                    x: event.clientX,
                    y: event.clientY,
                    scale: event.currentTarget.getScreenCTM()?.a ?? 1,
                  };
                }}
                aria-label="Dimensioned room plan"
                onPointerMove={(event) => {
                  const pan = panDrag.current;
                  if (!pan) return moveDrag(event);
                  if (pan.id !== event.pointerId) return;
                  const dx = (event.clientX - pan.x) / pan.scale;
                  const dy = (event.clientY - pan.y) / pan.scale;
                  pan.x = event.clientX;
                  pan.y = event.clientY;
                  setViewport((current) => ({
                    ...current,
                    x: current.x - dx,
                    y: current.y - dy,
                  }));
                }}
                onPointerUp={() => {
                  panDrag.current = null;
                  openingDrag.current = null;
                  roomDrag.current = null;
                  const active = drag.current;
                  drag.current = null;
                  if (!active || active.mode === 'island') return;
                  setStudy((current) => {
                    const next = clone(current);
                    const item = next.elements.find((e) => e.id === active.id);
                    if (item?.placement.mode === 'floor')
                      item.islandId = islandAt(item, next.islands, next.room);
                    return next;
                  });
                }}
                onPointerCancel={() => {
                  panDrag.current = null;
                  openingDrag.current = null;
                  roomDrag.current = null;
                  drag.current = null;
                }}
                onLostPointerCapture={() => {
                  panDrag.current = null;
                  openingDrag.current = null;
                  roomDrag.current = null;
                  drag.current = null;
                }}
              >
                <defs>
                  <pattern
                    id="cc-paper"
                    width="8"
                    height="8"
                    patternUnits="userSpaceOnUse"
                  >
                    <path d="M0 8L8 0" stroke="#d8d4ca" strokeWidth=".35" />
                  </pattern>
                </defs>
                <path
                  className="cc-paper"
                  d={
                    roomPoints(study.room)
                      .map(
                        (p, i) =>
                          `${i ? 'L' : 'M'}${pad + p.x * scale} ${pad + p.z * scale}`,
                      )
                      .join(' ') + 'Z'
                  }
                />
                {roomSegments(study.room).map((s) => (
                  <g key={s.id}>
                    <line
                      className="cc-room-line"
                      x1={pad + s.a.x * scale}
                      y1={pad + s.a.z * scale}
                      x2={pad + s.b.x * scale}
                      y2={pad + s.b.z * scale}
                    />
                    {editingRoom && (
                      <>
                        <line
                          role="button"
                          tabIndex={0}
                          aria-label={`Edit ${s.label}, ${Math.round(s.length)} inches`}
                          x1={pad + s.a.x * scale}
                          y1={pad + s.a.z * scale}
                          x2={pad + s.b.x * scale}
                          y2={pad + s.b.z * scale}
                          stroke={
                            selectedWall === s.id ? '#b57d45' : 'transparent'
                          }
                          strokeWidth="14"
                          strokeOpacity="0.5"
                          style={{
                            cursor: s.horizontal ? 'ns-resize' : 'ew-resize',
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') setSelectedWall(s.id);
                          }}
                          onPointerDown={(e) => {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            setSelectedWall(s.id);
                            setHistory((h) => [...h.slice(-29), clone(study)]);
                            const screenScale =
                              e.currentTarget.ownerSVGElement!.getScreenCTM()
                                ?.a ?? 1;
                            roomDrag.current = {
                              study: clone(study),
                              id: s.id,
                              pointer: s.horizontal ? e.clientY : e.clientX,
                              position: s.horizontal ? s.z : s.x,
                              scale: scale * screenScale,
                              horizontal: s.horizontal,
                            };
                          }}
                        />
                        <text
                          pointerEvents="none"
                          x={pad + ((s.a.x + s.b.x) / 2) * scale + s.nx * 14}
                          y={pad + ((s.a.z + s.b.z) / 2) * scale + s.nz * 14}
                          fontSize="10"
                          textAnchor="middle"
                        >
                          {Math.round(s.length)}″
                        </text>
                      </>
                    )}
                  </g>
                ))}
                {study.openings.map((o) => {
                  const segment = roomWall(study.room, o.wall),
                    horizontal = segment.horizontal;
                  const p = wallPoint(study.room, o.wall, o.offset);
                  const x = pad + p.x * scale,
                    y = pad + p.z * scale;
                  return (
                    <g
                      key={o.id}
                      role="button"
                      tabIndex={0}
                      aria-label={o.kind + ' on ' + o.wall + ' wall'}
                      style={{
                        cursor: editingRoom ? 'grab' : 'pointer',
                        touchAction: 'none',
                      }}
                      onClick={() => {
                        setStudy((c) => ({...c, selected: o.id}));
                        if (roomControls.current)
                          roomControls.current.open = true;
                      }}
                      onPointerDown={(event) => {
                        if (
                          !editingRoom ||
                          event.button !== 0 ||
                          openingDrag.current
                        )
                          return;
                        event.stopPropagation();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        const screenScale =
                          event.currentTarget.ownerSVGElement!.getScreenCTM()
                            ?.a ?? 1;
                        const center = wallPoint(
                          study.room,
                          o.wall,
                          o.offset + o.width / 2,
                        );
                        openingDrag.current = {
                          id: o.id,
                          ...center,
                          clientX: event.clientX,
                          clientY: event.clientY,
                          scale: scale * screenScale,
                          pointerId: event.pointerId,
                        };
                        setHistory((h) => [...h.slice(-29), clone(study)]);
                        setStudy((c) => ({...c, selected: o.id}));
                        if (roomControls.current)
                          roomControls.current.open = true;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setStudy((c) => ({...c, selected: o.id}));
                          if (roomControls.current)
                            roomControls.current.open = true;
                        }
                      }}
                      transform={`translate(${x} ${y}) rotate(${horizontal ? 0 : 90}) scale(1 ${horizontal ? segment.nz : -segment.nx})`}
                    >
                      {editingRoom && (
                        <rect
                          x="0"
                          y="-10"
                          width={o.width * scale}
                          height="20"
                          fill="transparent"
                        />
                      )}
                      <rect
                        x="0"
                        y="-4"
                        width={o.width * scale}
                        height="8"
                        fill={o.kind === 'window' ? '#a9c5d3' : '#f4f2ec'}
                        stroke={
                          warnings.has(o.id)
                            ? '#a84030'
                            : study.selected === o.id
                              ? '#b57d45'
                              : '#55483b'
                        }
                        strokeWidth="2"
                      />
                      {o.kind === 'door' ? (
                        <path
                          d={`M0 0V${o.width * scale}M0 ${o.width * scale}A${o.width * scale} ${o.width * scale} 0 0 0 ${o.width * scale} 0`}
                          fill="none"
                          stroke="#55483b"
                        />
                      ) : (
                        <line
                          x1="0"
                          x2={o.width * scale}
                          y1="0"
                          y2="0"
                          stroke="#fff"
                        />
                      )}
                    </g>
                  );
                })}
                {study.islands.map((i) => {
                  const c = aisleClearance(i, study.room);
                  return (
                    <g
                      className="cc-island"
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        if (roomControls.current)
                          roomControls.current.open = true;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        setHistory((h) => [...h.slice(-29), clone(study)]);
                        drag.current = {
                          id: i.id,
                          mode: 'island',
                          x: i.x,
                          z: i.z,
                          clientX: event.clientX,
                          clientY: event.clientY,
                        };
                        setStudy((c) => ({...c, selected: i.id}));
                      }}
                      key={i.id}
                      transform={`translate(${pad + i.x * scale} ${pad + i.z * scale}) rotate(${i.rotation})`}
                      onClick={() => setStudy((x) => ({...x, selected: i.id}))}
                    >
                      <rect
                        x={-(i.width / 2 + i.overhang) * scale}
                        y={-(i.depth / 2 + i.overhang) * scale}
                        width={(i.width + i.overhang * 2) * scale}
                        height={(i.depth + i.overhang * 2) * scale}
                      />
                      <text y="4">
                        ISLAND · aisles{' '}
                        {Math.round(Math.min(...Object.values(c)))}″
                      </text>
                      {i.seatingSide !== 'none' && (
                        <rect
                          className="cc-seating"
                          x={(-i.width / 2) * scale}
                          y={(i.depth / 2) * scale}
                          width={i.width * scale}
                          height={18 * scale}
                        />
                      )}
                    </g>
                  );
                })}
                {[...study.elements]
                  .sort(
                    (a, b) =>
                      Number(a.kind === 'wall-cabinet') -
                      Number(b.kind === 'wall-cabinet'),
                  )
                  .map((e) => {
                    const b = plan(e);
                    return (
                      <g
                        key={e.id}
                        pointerEvents={editingRoom ? 'none' : undefined}
                        className={`cc-cab cc-${e.kind} ${study.selected === e.id ? 'selected' : ''} ${warnings.has(e.id) ? 'problem' : ''}`}
                        transform={`translate(${b.x} ${b.y}) rotate(${b.r})`}
                        onPointerDown={(ev) => startDrag(ev, e)}
                        onClick={() =>
                          setStudy((c) => ({...c, selected: e.id}))
                        }
                      >
                        {e.configuration === 'corner' ? (
                          <path
                            style={
                              hasMaterialFinish(e) && !warnings.has(e.id)
                                ? {fill: cabinetColor(e)}
                                : undefined
                            }
                            d={(() => {
                              const a =
                                Math.min(
                                  24,
                                  (e.width * 2) / 3,
                                  (e.depth * 2) / 3,
                                ) * scale;
                              return `M ${-b.w / 2} ${-b.h / 2} H ${b.w / 2} V ${-b.h / 2 + a} H ${-b.w / 2 + a} V ${b.h / 2} H ${-b.w / 2} Z`;
                            })()}
                          />
                        ) : (
                          <rect
                            style={
                              hasMaterialFinish(e) && !warnings.has(e.id)
                                ? {fill: cabinetColor(e)}
                                : undefined
                            }
                            x={-b.w / 2}
                            y={-b.h / 2}
                            width={b.w}
                            height={b.h}
                          />
                        )}
                        <line
                          x1={-b.w / 2}
                          y1={-b.h / 2}
                          x2={b.w / 2}
                          y2={b.h / 2}
                        />
                        <text y="4">
                          {e.storage
                            ? `${OPEN_STORAGE[e.storage.type]} · ${e.width}″`
                            : e.applianceKind
                              ? APPLIANCE_CATALOG[e.applianceKind].label
                              : `${e.width}″`}
                        </text>
                      </g>
                    );
                  })}
              </svg>
            </div>
            <div className="cc-panel cc-three-panel">
              <ThreeStudy
                showControls
                study={study}
                onSelect={(id) => setStudy((c) => ({...c, selected: id}))}
              />
            </div>
          </div>
          <footer className="cc-status">
            <span className={warnings.size ? 'warning' : ''}>
              {warnings.size
                ? `${warnings.size} elements need attention`
                : `${study.elements.length} elements · clear fit`}
            </span>
            <span>Concept only · dimensions require field verification</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
