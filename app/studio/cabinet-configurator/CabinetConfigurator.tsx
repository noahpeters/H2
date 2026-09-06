import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useSavedRooms} from './useSavedRooms';
import {ShareRoomForm} from './ShareRoomForm';
import {OPEN_STORAGE, createOpenStorage, type StorageKind} from './openStorage';
import {OpenStorageControls} from './OpenStorageControls';
import {placeOpening} from './openingPlacement';
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
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function migrateStudy(raw: unknown): Study {
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
function ThreeStudy({
  study,
  onSelect,
}: {
  study: Study;
  onSelect: (id: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
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
      camera.updateProjectionMatrix();
      renderer.setSize(bounds.width, bounds.height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const handlePick = (event: PointerEvent) => {
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
        selectRef.current(current.userData.id as string);
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
    <div
      className="cc-three-host"
      ref={hostRef}
      aria-label="Interactive 3D room study"
    />
  );
}

export function CabinetConfigurator({
  turnstileSiteKey = '',
}: {turnstileSiteKey?: string} = {}) {
  const [sharing, setSharing] = useState(false);
  const [pricing, setPricing] = useState(false);
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
  const drag = useRef<ActiveDrag | null>(null);
  const rooms = useSavedRooms(study, setStudy, initialStudy, migrateStudy, () =>
    setHistory([]),
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
  const addElement = (
    kind: KitchenElement['kind'],
    applianceKind?: ApplianceKind,
    configuration?: BaseConfiguration,
  ) =>
    update((d) => {
      if (kind === 'appliance' && applianceKind) {
        const item = createKitchenAppliance(applianceKind, makeId());
        d.elements.push(item);
        d.selected = item.id;
        return;
      }
      const item: KitchenElement = {
        configuration,
        id: makeId(),
        kind,
        width: configuration === 'corner' ? 36 : kind === 'appliance' ? 24 : 30,
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
      d.elements.push(item);
      d.selected = item.id;
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
      d.islands.push(island);
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
      b = ev.currentTarget.getBoundingClientRect(),
      ss = (scale * b.width) / 780;
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
                        d.openings.push({
                          id,
                          kind,
                          wall: roomSegments(d.room)[0].id,
                          offset: 12,
                          width:
                            kind === 'opening' ? 96 : kind === 'door' ? 32 : 42,
                          height: kind === 'window' ? 38 : 80,
                          sill: 42,
                        });
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
              <summary>+ Add open storage</summary>
              <div>
                {Object.entries(OPEN_STORAGE).map(([type, label]) => (
                  <button
                    key={type}
                    onClick={(event) => {
                      update((d) => {
                        const item = createOpenStorage(
                          type as StorageKind,
                          makeId(),
                        );
                        d.elements.push(item);
                        d.selected = item.id;
                      });
                      event.currentTarget
                        .closest('details')
                        ?.removeAttribute('open');
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </details>
            <details className="cc-add-menu">
              <summary>+ Add cabinet</summary>
              <div>
                <button
                  onClick={(event) => {
                    addElement('base', undefined, 'corner');
                    event.currentTarget
                      .closest('details')
                      ?.removeAttribute('open');
                  }}
                >
                  Corner base cabinet
                </button>
                {(
                  [
                    ['base', 'Base cabinet'],
                    ['wall-cabinet', 'Wall cabinet'],
                    ['tall', 'Tall cabinet'],
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    onClick={(event) => {
                      addElement(kind);
                      event.currentTarget
                        .closest('details')
                        ?.removeAttribute('open');
                    }}
                  >
                    {label}
                  </button>
                ))}
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
                {selected.kind === 'base' && (
                  <label>
                    Base configuration
                    <select
                      value={selected.configuration ?? 'single-door'}
                      onChange={(event) => {
                        const configuration = event.currentTarget
                          .value as BaseConfiguration;
                        update((d) => {
                          const item = d.elements.find(
                            (e) => e.id === selected.id,
                          );
                          if (item) item.configuration = configuration;
                        });
                      }}
                    >
                      <option value="single-door">Single door</option>
                      <option value="corner">Corner (L-shaped)</option>
                      <option value="pullout">Full-height pullout</option>
                      <option value="door-drawer">Door + upper drawer</option>
                      <option value="three-drawer">Three drawers</option>
                      <option value="microwave-drawer">Microwave drawer</option>
                      <option value="sink">Sink base</option>
                    </select>
                  </label>
                )}
                {selected.kind !== 'appliance' && (
                  <>
                    <label>
                      Material
                      <select
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
                      </select>
                    </label>
                    {selected.material === 'paint-grade' && (
                      <label>
                        Paint color
                        <select
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
                        </select>
                      </label>
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
                    <label>
                      Front style
                      <select
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
                        {selected.kind === 'wall-cabinet' && (
                          <option value="shaker-glass">Shaker + glass</option>
                        )}
                      </select>
                    </label>
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
                    <label>
                      Front style
                      <select
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
                        <option value="stainless">Stainless</option>
                        <option value="shaker">Shaker</option>
                        <option value="slab">Slab</option>
                      </select>
                    </label>
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
                {selected.kind === 'tall' && !selected.storage && (
                  <label>
                    Tall configuration
                    <select
                      value={selected.tallConfiguration ?? 'standard'}
                      onChange={(event) => {
                        const configuration = event.currentTarget
                          .value as KitchenElement['tallConfiguration'];
                        update((d) => {
                          const item = d.elements.find(
                            (e) => e.id === selected.id,
                          );
                          if (
                            item &&
                            minimumTallHeight(configuration) <= d.room.height
                          ) {
                            item.tallConfiguration = configuration;
                            item.height = Math.max(
                              item.height,
                              minimumTallHeight(configuration),
                            );
                          }
                        });
                      }}
                    >
                      <option value="standard">Standard cabinet</option>
                      <option
                        value="one-oven"
                        disabled={study.room.height < 72}
                      >
                        1 oven · drawers below
                      </option>
                      <option
                        value="two-oven"
                        disabled={study.room.height < 84}
                      >
                        2 ovens · drawers below
                      </option>
                      <option
                        value="coffee-maker"
                        disabled={study.room.height < 66}
                      >
                        Coffee maker · counter height
                      </option>
                    </select>
                  </label>
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
                <small>Drag floor-positioned elements on both axes</small>
              </div>
              <svg
                viewBox="0 0 780 560"
                aria-label="Dimensioned room plan"
                onPointerMove={moveDrag}
                onPointerUp={() => {
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
                  openingDrag.current = null;
                  roomDrag.current = null;
                  drag.current = null;
                }}
                onLostPointerCapture={() => {
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
                            const rect =
                              e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                            roomDrag.current = {
                              study: clone(study),
                              id: s.id,
                              pointer: s.horizontal ? e.clientY : e.clientX,
                              position: s.horizontal ? s.z : s.x,
                              scale: (scale * rect.width) / 780,
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
                        const rect =
                          event.currentTarget.ownerSVGElement!.getBoundingClientRect();
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
                          scale: (scale * rect.width) / 780,
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
                              e.kind !== 'appliance' && !warnings.has(e.id)
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
                              e.kind !== 'appliance' && !warnings.has(e.id)
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
              <div className="cc-panel-label">
                <span>Spatial study</span>
                <small>Plan and 3D share placement data</small>
              </div>
              <ThreeStudy
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
