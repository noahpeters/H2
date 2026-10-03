import {continuousToeKicks} from './continuousToeKicks';
import {roomSegments} from './roomOutline';
import {ROOM_MATERIALS, applyRoomSurface} from './roomMaterials';
import {continuousFrameNeighbors} from './continuousFaceFrames';
import * as THREE from 'three';
import type {Study} from './CabinetConfigurator';
import {elementCenter, wallToFloor, type RoomElement, type Room} from './model';
import {cabinetColor} from './materials';
import {waitForMaterialTextures} from './materialRendering';
import {fixtureGeometry} from './fixtureGeometry';
import {applianceGeometry} from './applianceGeometry';
import {countertopEdges, DEFAULT_COUNTERTOP_EDGES} from './countertopEdges';
import {
  cabinetGeometry,
  toeKickGeometry,
  roomGeometry,
  roomFloorGeometry,
  openingGeometry,
  islandCountertop,
} from './roomGeometry';

const INCH = 0.0254;
type Entry = {signature: string; object: THREE.Object3D};
type Desired = {
  key: string;
  signature: string;
  build: () => THREE.Object3D;
  place?: (object: THREE.Object3D) => void;
  selectable?: boolean;
};

export function elementTransform(element: RoomElement, room: Room) {
  const center = elementCenter(element, room);
  const rotation =
    element.placement.mode === 'wall'
      ? wallToFloor(element, room).rotation
      : element.placement.rotation;
  return {...center, rotation};
}

/** Release owned geometry/materials once, including selection lines. */
export function disposeStudyObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  object.traverse((part) => {
    if (!(part instanceof THREE.Mesh || part instanceof THREE.LineSegments))
      return;
    geometries.add(part.geometry);
    for (const material of Array.isArray(part.material)
      ? part.material
      : [part.material])
      materials.add(material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function applyCountertops(object: THREE.Object3D, room: Room) {
  const replaced = new Set<THREE.Material>();
  object.traverse((part) => {
    if (part instanceof THREE.Mesh && part.name.endsWith('-countertop'))
      applyRoomSurface(
        part,
        ROOM_MATERIALS.countertop[room.countertopMaterial ?? 'white-quartz'],
        'countertop',
      ).forEach((m) => replaced.add(m));
  });
  replaced.forEach((m) => m.dispose());
}

function desiredObjects(study: Study): Desired[] {
  const {room} = study;
  const desired: Desired[] = [
    {
      key: 'room',
      signature: JSON.stringify([room, study.openings]),
      build: () => {
        const floor = roomFloorGeometry(room, 0xffffff);
        const walls = roomGeometry(room, study.openings, 0xffffff);
        walls.forEach((wall, index) => {
          wall.userData.photoWall = {
            segment: roomSegments(room)[index],
            room,
            openings: study.openings,
          };
        });
        const replaced = new Set<THREE.Material>();
        applyRoomSurface(
          floor,
          ROOM_MATERIALS.floor[room.floor],
          'floor',
        ).forEach((m) => replaced.add(m));
        for (const wall of walls)
          wall.traverse((part) => {
            if (part instanceof THREE.Mesh)
              applyRoomSurface(
                part,
                ROOM_MATERIALS.walls[room.walls],
                'wall',
              ).forEach((m) => replaced.add(m));
          });
        replaced.forEach((m) => m.dispose());
        return new THREE.Group().add(floor, ...walls);
      },
    },
  ];
  for (const island of study.islands) {
    if (!study.countertop) continue;
    desired.push({
      key: `island:${island.id}`,
      // Member movement updates sink cutouts; it never expands the top's outline.
      signature: JSON.stringify([
        island,
        room.countertopMaterial,
        room.overlay,
        room.islandCountertopOverhang,
        study.elements.filter((item) => item.islandId === island.id),
      ]),
      build: () => {
        const top = islandCountertop(island, study.elements, room);
        applyCountertops(top, room);
        return top;
      },
      place: (object) => {
        object.position.set(
          (-room.width / 2 + island.x) * INCH,
          36 * INCH,
          (-room.depth / 2 + island.z) * INCH,
        );
        object.rotation.y = (-island.rotation * Math.PI) / 180;
      },
    });
  }
  const frameRuns = continuousFrameNeighbors(study.elements, room);
  const toeRuns = continuousToeKicks(study.elements, room);
  for (const item of study.elements) {
    const shared = study.islands.some((island) => island.id === item.islandId);
    const edges =
      !shared &&
      (item.kind === 'base' ||
        (item.kind === 'appliance' &&
          (item.applianceKind ?? 'dishwasher') === 'dishwasher'))
        ? countertopEdges(item, study.elements, room)
        : DEFAULT_COUNTERTOP_EDGES;
    const toeRun = toeRuns.get(item.id);
    if (toeRun && !toeRun.hidden)
      desired.push({
        key: `toe:${item.id}`,
        signature: JSON.stringify([item, room.toeKick, toeRun]),
        build: () => toeKickGeometry(item, room, toeRun),
        place: (object) => {
          const transform = elementTransform(item, room);
          object.rotation.y = (-transform.rotation * Math.PI) / 180;
          object.position.set(
            (-room.width / 2 + transform.x) * INCH,
            ((item.placement.elevation ?? 0) + item.height / 2) * INCH,
            (-room.depth / 2 + transform.z) * INCH,
          );
        },
      });
    desired.push({
      key: `element:${item.id}`,
      selectable: true,
      // Position/rotation/selection are updates to an existing mesh. Elevation
      // stays in the key because tall-cabinet hardware uses it in local geometry.
      signature: JSON.stringify([
        {...item, placement: {elevation: item.placement.elevation}},
        study.countertop,
        room.countertopMaterial,
        shared,
        edges,
        room.toeKick,
        room.overlay,
        frameRuns.get(item.id),
        toeRuns.get(item.id),
        room.height,
      ]),
      build: () => {
        const body =
          item.kind === 'fixture'
            ? fixtureGeometry(item, room)
            : item.kind === 'appliance'
              ? applianceGeometry(
                  item.applianceKind ?? 'dishwasher',
                  item.width * INCH,
                  item.height * INCH,
                  item.depth * INCH,
                  item.applianceFront,
                  item.rangeHood,
                  cabinetColor(item),
                  study.countertop && !item.islandId,
                  item,
                  edges,
                )
              : cabinetGeometry(
                  item,
                  study.countertop,
                  shared,
                  room,
                  edges,
                  frameRuns.get(item.id),
                  toeRun ? {...toeRun, hidden: true} : undefined,
                );
        applyCountertops(body, room);
        body.userData.id = item.id;
        return body;
      },
      place: (object) => {
        const transform = elementTransform(item, room);
        const elevation = item.placement.elevation ?? 0;
        object.rotation.y = (-transform.rotation * Math.PI) / 180;
        object.position.set(
          (-room.width / 2 + transform.x) * INCH,
          (elevation + item.height / 2) * INCH,
          (-room.depth / 2 + transform.z) * INCH,
        );
      },
    });
  }
  for (const opening of study.openings)
    desired.push({
      key: `opening:${opening.id}`,
      signature: JSON.stringify([opening, room]),
      selectable: true,
      build: () => openingGeometry(opening, room),
    });
  return desired;
}

/** A persistent scene; replacements become visible together after maps settle.
 * In-flight replacements survive drag updates. Superseded assets are released.
 */
export class StudyScene {
  readonly root = new THREE.Group();
  selectable: THREE.Object3D[] = [];
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Entry>();
  private revision = 0;
  private disposed = false;
  private selection?: THREE.BoxHelper;
  private selected: THREE.Object3D | undefined;

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
  }

  get ready() {
    return !this.disposed && this.pending.size === 0 && this.entries.size > 0;
  }

  async update(study: Study) {
    if (this.disposed) return;
    const revision = ++this.revision;
    const desired = desiredObjects(study);
    const next = new Map<string, Entry>();
    for (const descriptor of desired) {
      const current = this.entries.get(descriptor.key);
      const pending = this.pending.get(descriptor.key);
      const entry = [current, pending].find(
        (candidate) => candidate?.signature === descriptor.signature,
      ) ?? {signature: descriptor.signature, object: descriptor.build()};
      next.set(descriptor.key, entry);
    }
    for (const [key, entry] of this.pending) {
      if (next.get(key) !== entry) disposeStudyObject(entry.object);
    }
    this.pending = new Map(
      [...next].filter(([key, entry]) => this.entries.get(key) !== entry),
    );
    await Promise.all(
      [...this.pending.values()].map((entry) =>
        waitForMaterialTextures(entry.object),
      ),
    );
    if (this.disposed || revision !== this.revision) return;

    // Retain old meshes and their textures until replacements are ready. Reused
    // objects stay attached, so a drag never clears the canvas or reloads maps.
    for (const [key, entry] of this.entries) {
      if (next.get(key) === entry) continue;
      this.root.remove(entry.object);
      disposeStudyObject(entry.object);
    }
    this.selectable = [];
    for (const descriptor of desired) {
      const object = next.get(descriptor.key)!.object;
      descriptor.place?.(object);
      if (object.parent !== this.root) this.root.add(object);
      if (descriptor.selectable) this.selectable.push(object);
    }
    this.entries = next;
    this.pending.clear();
    const selected =
      study.view === 'three'
        ? undefined
        : this.selectable.find(
            (object) => object.userData.id === study.selected,
          );
    if (selected !== this.selected) {
      if (this.selection) {
        this.root.remove(this.selection);
        disposeStudyObject(this.selection);
      }
      this.selection = selected
        ? new THREE.BoxHelper(selected, 0xb57d45)
        : undefined;
      this.selected = selected;
      if (this.selection) this.root.add(this.selection);
    }
    this.selection?.update();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.revision++;
    for (const entry of [...this.entries.values(), ...this.pending.values()])
      disposeStudyObject(entry.object);
    if (this.selection) disposeStudyObject(this.selection);
    this.root.removeFromParent();
    this.entries.clear();
    this.pending.clear();
    this.selectable = [];
  }
}
