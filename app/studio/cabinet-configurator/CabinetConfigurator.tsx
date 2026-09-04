import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {
  APPLIANCE_CATALOG,
  aisleClearance,
  bounds,
  createKitchenAppliance,
  elementCenter,
  migrateElement,
  moveIsland,
  rotatedSize,
  snapAngle,
  validateLayout,
  wallToFloor,
  type Island,
  type ApplianceKind,
  type KitchenElement,
  type PlacementMode,
  type Room,
  type Wall,
} from './model';

type View = 'plan' | 'split' | 'three';
type Opening = {
  id: string;
  kind: 'door' | 'window';
  wall: Wall;
  offset: number;
  width: number;
  height: number;
  sill?: number;
};
type Study = {
  version: 2;
  room: Room;
  openings: Opening[];
  elements: KitchenElement[];
  islands: Island[];
  selected: string | null;
  countertop: boolean;
  view: View;
};
const INCH = 0.0254;
const STORAGE_KEY = 'from-trees-cabinet-study-v1';
const makeId = () => Math.random().toString(36).slice(2, 9);

function initialStudy(): Study {
  return {
    version: 2,
    room: {width: 144, depth: 120, height: 96, floor: 'oak', walls: 'plaster'},
    openings: [
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
      mode: 'floor';
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
    };

export function createDragUpdate(
  active: ActiveDrag,
  clientX: number,
  clientY: number,
  screenScale: number,
) {
  return (current: Study): Study => {
    const next = clone(current);
    const element = next.elements.find((item) => item.id === active.id);
    if (active.mode === 'floor' && element?.placement.mode === 'floor') {
      element.placement.x =
        Math.round((active.x + (clientX - active.clientX) / screenScale) / 3) *
        3;
      element.placement.z =
        Math.round((active.z + (clientY - active.clientY) / screenScale) / 3) *
        3;
    } else if (active.mode === 'wall' && element?.placement.mode === 'wall') {
      const pointer = active.wall === 'back' ? clientX : clientY;
      const wallLength =
        active.wall === 'back' ? next.room.width : next.room.depth;
      element.placement.offset = Math.max(
        0,
        Math.min(
          wallLength - element.width,
          Math.round(
            (active.offset + (pointer - active.pointer) / screenScale) / 3,
          ) * 3,
        ),
      );
    }
    return next;
  };
}
function elementTransform(element: KitchenElement, room: Room) {
  const center = elementCenter(element, room);
  const rotation =
    element.placement.mode === 'wall'
      ? element.placement.wall === 'back'
        ? 0
        : element.placement.wall === 'left'
          ? 90
          : 270
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

    const material = (color: number, roughness = 0.8) =>
      new THREE.MeshStandardMaterial({color, roughness});
    const edgeBox = (
      width: number,
      height: number,
      depth: number,
      boxMaterial: THREE.Material,
    ) => {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        boxMaterial,
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      group.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry),
          new THREE.LineBasicMaterial({
            color: 0x252b26,
            transparent: true,
            opacity: 0.55,
          }),
        ),
      );
      return group;
    };

    const roomWidth = study.room.width * INCH;
    const roomDepth = study.room.depth * INCH;
    const roomHeight = study.room.height * INCH;
    const floorColors = {oak: 0xbca679, walnut: 0x75604c, concrete: 0xbab9b4};
    const wallColors = {plaster: 0xe9e3d7, white: 0xf5f4ef, green: 0x849184};
    const floor = edgeBox(
      roomWidth,
      0.035,
      roomDepth,
      material(floorColors[study.room.floor]),
    );
    floor.position.set(0, -0.02, 0);
    scene.add(floor);
    const wallMaterial = material(wallColors[study.room.walls]);
    const back = edgeBox(roomWidth, roomHeight, 0.035, wallMaterial);
    back.position.set(0, roomHeight / 2, -roomDepth / 2);
    scene.add(back);
    const left = edgeBox(0.035, roomHeight, roomDepth, wallMaterial);
    left.position.set(-roomWidth / 2, roomHeight / 2, 0);
    scene.add(left);

    const selectable: THREE.Object3D[] = [];
    const warningIds = validateLayout(study.elements, study.room);
    for (const island of study.islands) {
      const top = edgeBox(
        (island.width + island.overhang * 2) * INCH,
        1.5 * INCH,
        (island.depth + island.overhang * 2) * INCH,
        material(0xd8d1c4, 0.45),
      );
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
      const body = edgeBox(
        width,
        height,
        depth,
        material(warningIds.has(cabinet.id) ? 0xb36855 : 0x9d7650),
      );
      body.userData.id = cabinet.id;
      const transform = elementTransform(cabinet, study.room);
      const elevation =
        cabinet.placement.mode === 'wall'
          ? cabinet.placement.elevation
          : cabinet.placement.mode === 'hosted'
            ? cabinet.placement.elevation
            : 0;
      body.rotation.y = (-transform.rotation * Math.PI) / 180;
      body.position.set(
        -roomWidth / 2 + transform.x * INCH,
        elevation * INCH + height / 2,
        -roomDepth / 2 + transform.z * INCH,
      );
      const front = edgeBox(
        width * 0.91,
        height * 0.89,
        0.025,
        material(cabinet.face === 'slab' ? 0x76543b : 0x9d7650),
      );
      front.position.set(0, 0, depth / 2 + 0.016);
      body.add(front);
      if (cabinet.face === 'shaker') {
        const inset = edgeBox(
          width * 0.7,
          height * 0.68,
          0.012,
          material(0x8f6948),
        );
        inset.position.z = 0.025;
        front.add(inset);
      }
      if (study.countertop && cabinet.kind === 'base') {
        const top = edgeBox(
          width + 0.04,
          0.04,
          depth + 0.04,
          material(0xd8d1c4, 0.45),
        );
        top.position.y = height / 2 + 0.02;
        body.add(top);
      }
      scene.add(body);
      selectable.push(body);
      if (cabinet.id === study.selected)
        scene.add(new THREE.BoxHelper(body, 0xb57d45));
    }

    for (const opening of study.openings) {
      const width = opening.width * INCH;
      const height = opening.height * INCH;
      const y =
        (opening.kind === 'window' ? (opening.sill ?? 42) * INCH : 0) +
        height / 2;
      const object = edgeBox(
        width,
        height,
        0.055,
        material(opening.kind === 'window' ? 0xa9c5c9 : 0x55483b, 0.35),
      );
      object.userData.id = opening.id;
      if (opening.wall === 'back')
        object.position.set(
          -roomWidth / 2 + (opening.offset + opening.width / 2) * INCH,
          y,
          -roomDepth / 2 + 0.04,
        );
      else {
        object.rotation.y = Math.PI / 2;
        object.position.set(
          opening.wall === 'left'
            ? -roomWidth / 2 + 0.04
            : roomWidth / 2 - 0.04,
          y,
          -roomDepth / 2 + (opening.offset + opening.width / 2) * INCH,
        );
      }
      scene.add(object);
      selectable.push(object);
    }

    const largest = Math.max(roomWidth, roomDepth);
    controls.target.set(0, roomHeight * 0.34, 0);
    camera.position.set(largest * 0.82, roomHeight * 0.82, largest * 0.95);
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

export function CabinetConfigurator() {
  const [study, setStudy] = useState<Study>(initialStudy);
  const [history, setHistory] = useState<Study[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const drag = useRef<ActiveDrag | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setStudy(migrateStudy(JSON.parse(saved)));
    } catch {
      // Keep the fresh study when browser storage is unavailable or invalid.
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(study));
  }, [hydrated, study]);
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
  const warnings = useMemo(
    () => validateLayout(study.elements, study.room),
    [study],
  );
  const pad = 62,
    scale = Math.min(
      (780 - pad * 2) / study.room.width,
      (560 - pad * 2) / study.room.depth,
    );
  const addElement = (
    kind: KitchenElement['kind'],
    applianceKind?: ApplianceKind,
  ) =>
    update((d) => {
      if (kind === 'appliance' && applianceKind) {
        const item = createKitchenAppliance(applianceKind, makeId());
        d.elements.push(item);
        d.selected = item.id;
        return;
      }
      const item: KitchenElement = {
        id: makeId(),
        kind,
        width: kind === 'appliance' ? 24 : 30,
        depth: kind === 'wall-cabinet' ? 12 : 24,
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
  const changePlacement = (mode: PlacementMode) =>
    update((d) => {
      const e = d.elements.find((i) => i.id === d.selected);
      if (!e) return;
      if (mode === 'floor') e.placement = wallToFloor(e, d.room);
      else if (mode === 'wall')
        e.placement = {
          mode: 'wall',
          wall: 'back',
          offset: Math.max(0, elementCenter(e, d.room).x - e.width / 2),
          elevation: e.kind === 'wall-cabinet' ? 54 : 0,
        };
      else {
        const host = d.elements.find((i) => i.id !== e.id);
        if (host)
          e.placement = {
            mode: 'hosted',
            hostId: host.id,
            x: elementCenter(e, d.room).x,
            z: elementCenter(e, d.room).z,
            elevation: host.height,
            rotation: 0,
          };
      }
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
            pointer: e.placement.wall === 'back' ? ev.clientX : ev.clientY,
          };
    setStudy((c) => ({...c, selected: e.id}));
  };
  const moveDrag = (ev: React.PointerEvent<SVGSVGElement>) => {
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
            disabled={!history.length}
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
            onClick={() => update((d) => Object.assign(d, initialStudy()))}
          >
            Reset room
          </button>
          <span>Saved locally</span>
        </div>
      </header>
      <main className="cc-main">
        <aside className="cc-tools" aria-label="Design controls">
          <section>
            <p className="cc-eyebrow">01 / Room</p>
            <div className="cc-fields">
              {(['width', 'depth', 'height'] as const).map((k) => (
                <label key={k}>
                  Room {k}
                  <span>
                    <input
                      type="number"
                      value={study.room[k]}
                      onChange={(e) =>
                        update((d) => {
                          d.room[k] = Number(e.target.value);
                        })
                      }
                    />{' '}
                    in
                  </span>
                </label>
              ))}
            </div>
          </section>
          <section>
            <p className="cc-eyebrow">02 / Add elements</p>
            <div className="cc-button-grid cc-three-buttons">
              <button onClick={() => addElement('base')}>+ Base</button>
              <button onClick={() => addElement('wall-cabinet')}>+ Wall</button>
              <button onClick={() => addElement('tall')}>+ Tall</button>
              {(Object.keys(APPLIANCE_CATALOG) as ApplianceKind[]).map(
                (kind) => (
                  <button
                    key={kind}
                    onClick={() => addElement('appliance', kind)}
                  >
                    + {APPLIANCE_CATALOG[kind].label}
                  </button>
                ),
              )}
            </div>
          </section>
          <section>
            <p className="cc-eyebrow">03 / Island study</p>
            <button onClick={addIsland}>+ Island zone</button>
            {study.islands.map((i) => (
              <div className="cc-island-fields" key={i.id}>
                <button
                  className="cc-island-select"
                  onClick={() => setStudy((c) => ({...c, selected: i.id}))}
                >
                  Island {i.width} × {i.depth}
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
                        {['none', 'north', 'south', 'east', 'west'].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </div>
            ))}
          </section>
          <section className="cc-selection">
            <p className="cc-eyebrow">Selected element</p>
            {selected ? (
              <div className="cc-fields">
                <div className="cc-selected-heading">
                  <strong>
                    {selected.applianceKind
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
                <label>
                  Placement
                  <select
                    value={selected.placement.mode}
                    onChange={(e) =>
                      changePlacement(e.target.value as PlacementMode)
                    }
                  >
                    <option value="wall">Wall-mounted</option>
                    <option value="floor">Floor-positioned</option>
                    <option value="hosted">Hosted</option>
                  </select>
                </label>
                {selected.placement.mode === 'floor' && (
                  <>
                    <label>
                      Room X
                      <span>
                        <input
                          type="number"
                          value={selected.placement.x}
                          onChange={(e) =>
                            update((d) => {
                              const x = d.elements.find(
                                (x) => x.id === selected.id,
                              );
                              if (x?.placement.mode === 'floor')
                                x.placement.x = Number(e.target.value);
                            })
                          }
                        />{' '}
                        in
                      </span>
                    </label>
                    <label>
                      Room Z
                      <span>
                        <input
                          type="number"
                          value={selected.placement.z}
                          onChange={(e) =>
                            update((d) => {
                              const x = d.elements.find(
                                (x) => x.id === selected.id,
                              );
                              if (x?.placement.mode === 'floor')
                                x.placement.z = Number(e.target.value);
                            })
                          }
                        />{' '}
                        in
                      </span>
                    </label>
                    <label>
                      Rotation
                      <select
                        value={snapAngle(selected.placement.rotation)}
                        onChange={(e) =>
                          update((d) => {
                            const x = d.elements.find(
                              (x) => x.id === selected.id,
                            );
                            if (x?.placement.mode === 'floor')
                              x.placement.rotation = snapAngle(
                                Number(e.target.value),
                              );
                          })
                        }
                      >
                        {[0, 90, 180, 270].map((a) => (
                          <option key={a}>{a}°</option>
                        ))}
                      </select>
                    </label>
                    <label className="cc-check">
                      <input
                        type="checkbox"
                        checked={!!selected.islandId}
                        onChange={(e) =>
                          update((d) => {
                            const x = d.elements.find(
                              (x) => x.id === selected.id,
                            );
                            if (x)
                              x.islandId = e.target.checked
                                ? d.islands[0]?.id
                                : undefined;
                          })
                        }
                      />{' '}
                      Group with island
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
                          if (x) x.width = Number(e.target.value);
                        })
                      }
                    />{' '}
                    in
                  </span>
                </label>
                {warnings.get(selected.id)?.map((w) => (
                  <p className="cc-inline-warning" key={w}>
                    {w}
                  </p>
                ))}
              </div>
            ) : (
              <p className="cc-muted">Select an element in plan or 3D.</p>
            )}
          </section>
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
                onPointerUp={() => (drag.current = null)}
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
                <rect
                  className="cc-paper"
                  x={pad}
                  y={pad}
                  width={study.room.width * scale}
                  height={study.room.depth * scale}
                />
                <path
                  className="cc-room-line"
                  d={`M${pad} ${pad + study.room.depth * scale}V${pad}H${pad + study.room.width * scale}V${pad + study.room.depth * scale}`}
                />
                {study.islands.map((i) => {
                  const c = aisleClearance(i, study.room);
                  return (
                    <g
                      className="cc-island"
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
                {study.elements.map((e) => {
                  const b = plan(e);
                  return (
                    <g
                      key={e.id}
                      className={`cc-cab cc-${e.kind} ${study.selected === e.id ? 'selected' : ''} ${warnings.has(e.id) ? 'problem' : ''}`}
                      transform={`translate(${b.x} ${b.y}) rotate(${b.r})`}
                      onPointerDown={(ev) => startDrag(ev, e)}
                      onClick={() => setStudy((c) => ({...c, selected: e.id}))}
                    >
                      <rect
                        x={-b.w / 2}
                        y={-b.h / 2}
                        width={b.w}
                        height={b.h}
                      />
                      <line
                        x1={-b.w / 2}
                        y1={-b.h / 2}
                        x2={b.w / 2}
                        y2={b.h / 2}
                      />
                      <text y="4">
                        {e.applianceKind
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
