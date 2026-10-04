import {simpleArchProfile} from './simpleArch';
import {useMemo} from 'react';
import type {Study} from './CabinetConfigurator';
import {APPLIANCE_CATALOG, wallToFloor, type RoomElement} from './model';
import {OPEN_STORAGE} from './openStorage';
import * as THREE from 'three';
import {cabinetGeometry} from './roomGeometry';
import {applianceGeometry} from './applianceGeometry';
import {fixtureGeometry} from './fixtureGeometry';
import {disposeStudyObject} from './studyScene';
import {roomSegments, wallPoint} from './roomOutline';

type ElevationItem = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: RoomElement['kind'];
  face?: RoomElement['face'];
  lines: number[][];
};

export type ElevationSheet = {
  id: string;
  title: string;
  width: number;
  height: number;
  items: ElevationItem[];
  openings: Study['openings'];
  countertop?: number;
};

const itemLabel = (item: RoomElement) =>
  item.applianceKind
    ? APPLIANCE_CATALOG[item.applianceKind].label
    : item.fixtureKind
      ? item.fixtureKind.replaceAll('-', ' ')
      : item.storage
        ? OPEN_STORAGE[item.storage.type]
        : item.kind.replace('-', ' ');

const INCH = 0.0254;
type Plane = {x: number; z: number; ux: number; uz: number};

/** Orthographic projection of the actual scene geometry, with no perspective. */
function projectedItem(
  item: RoomElement,
  study: Study,
  plane: Plane,
): ElevationItem {
  const position = wallToFloor(item, study.room);
  const a = (position.rotation * Math.PI) / 180;
  const project = (x: number, z: number) =>
    (position.x + x * Math.cos(a) - z * Math.sin(a) - plane.x) * plane.ux +
    (position.z + x * Math.sin(a) + z * Math.cos(a) - plane.z) * plane.uz;
  const corners = [-1, 1].flatMap((x) =>
    [-1, 1].map((z) => project((x * item.width) / 2, (z * item.depth) / 2)),
  );
  const left = Math.min(...corners),
    right = Math.max(...corners);
  const bottom = item.placement.elevation ?? 0;
  const group =
    String(item.kind) === 'panel'
      ? new THREE.Mesh(
          new THREE.BoxGeometry(
            item.width * INCH,
            item.height * INCH,
            item.depth * INCH,
          ),
          new THREE.MeshBasicMaterial(),
        )
      : item.kind === 'fixture'
        ? fixtureGeometry(item, study.room)
        : item.kind === 'appliance'
          ? applianceGeometry(
              item.applianceKind ?? 'dishwasher',
              item.width * INCH,
              item.height * INCH,
              item.depth * INCH,
              item.applianceFront,
              item.rangeHood,
            )
          : cabinetGeometry(item, false, false, study.room);
  group.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  group.traverse((object) => {
    if (object instanceof THREE.Mesh && object.visible) meshes.push(object);
  });
  // Camera direction expressed in this item's local scene coordinates.
  const nx = -plane.uz,
    nz = plane.ux;
  const outward = new THREE.Vector3(
    nx * Math.cos(a) + nz * Math.sin(a),
    0,
    -nx * Math.sin(a) + nz * Math.cos(a),
  );
  const reach = Math.max(item.width, item.depth, item.height) * INCH * 3 + 1;
  const ray = new THREE.Raycaster();
  const visible = (point: THREE.Vector3) => {
    ray.set(
      point.clone().addScaledVector(outward, reach),
      outward.clone().negate(),
    );
    const hit = ray.intersectObjects(meshes, false).find((hit) => {
      const material = (hit.object as THREE.Mesh).material;
      return !(Array.isArray(material) ? material : [material]).every(
        (m) => m.transparent && m.opacity < 0.5,
      );
    });
    return !hit || hit.distance >= reach - 0.0001;
  };
  const lines: number[][] = [];
  const seen = new Set<string>();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    const edges = new THREE.EdgesGeometry(object.geometry, 25);
    const positions = edges.getAttribute('position');
    for (let i = 0; i < positions.count; i += 2) {
      const points = [i, i + 1].map((index) =>
        new THREE.Vector3()
          .fromBufferAttribute(positions, index)
          .applyMatrix4(object.matrixWorld),
      );
      if (!visible(points[0].clone().lerp(points[1], 0.5))) continue;
      const line = points.flatMap((p) => [
        project(p.x / INCH, p.z / INCH),
        bottom + item.height / 2 + p.y / INCH,
      ]);
      if (Math.hypot(line[0] - line[2], line[1] - line[3]) < 0.01) continue;
      const key = [
        line
          .slice(0, 2)
          .map((v) => v.toFixed(3))
          .join(','),
        line
          .slice(2)
          .map((v) => v.toFixed(3))
          .join(','),
      ]
        .sort()
        .join(':');
      if (!seen.has(key)) {
        seen.add(key);
        lines.push(line);
      }
    }
    edges.dispose();
  });
  disposeStudyObject(group);
  return {
    id: item.id,
    label: itemLabel(item),
    x: left,
    y: bottom,
    width: right - left,
    height: item.height,
    kind: item.kind,
    face: item.face,
    lines,
  };
}

export function elevationSheets(study: Study): ElevationSheet[] {
  const counterHeight = (items: RoomElement[]) =>
    study.countertop
      ? Math.max(
          0,
          ...items
            .filter(
              (i) =>
                i.kind === 'base' ||
                (i.kind === 'appliance' && i.applianceKind === 'dishwasher'),
            )
            .map((i) => (i.placement.elevation ?? 0) + i.height),
        ) || undefined
      : undefined;
  const walls = roomSegments(study.room).flatMap((wall) => {
    const items = study.elements.filter(
      (i) => i.placement.mode === 'wall' && i.placement.wall === wall.id,
    );
    const openings = study.openings.filter((o) => o.wall === wall.id);
    if (!items.length && !openings.length) return [];
    const plane = {
      x: wall.a.x,
      z: wall.a.z,
      ux: (wall.b.x - wall.a.x) / wall.length,
      uz: (wall.b.z - wall.a.z) / wall.length,
    };
    return [
      {
        id: wall.id,
        title: `${wall.label === wall.id ? `${wall.label[0].toUpperCase()}${wall.label.slice(1)} wall` : wall.label} — front elevation`,
        width: wall.length,
        height: study.room.height,
        items: items.map((i) => projectedItem(i, study, plane)),
        openings: openings.map((o) => {
          const p = wallPoint(study.room, wall.id, o.offset);
          const x = (p.x - plane.x) * plane.ux + (p.z - plane.z) * plane.uz;
          return {
            ...o,
            offset: Math.min(
              x,
              x + o.width * (wall.horizontal ? plane.ux : plane.uz),
            ),
          };
        }),
        countertop: counterHeight(items),
      },
    ];
  });
  const groups = study.islands.map((island) => ({
    ...island,
    items: study.elements.filter((i) => i.islandId === island.id),
    label: 'Island',
  }));
  const free = study.elements.filter(
    (i) => i.placement.mode === 'floor' && !i.islandId,
  );
  if (free.length) {
    const points = free.flatMap((i) => {
      const p = wallToFloor(i, study.room),
        a = (p.rotation * Math.PI) / 180;
      return [-1, 1].flatMap((x) =>
        [-1, 1].map((z) => ({
          x:
            p.x +
            ((x * i.width) / 2) * Math.cos(a) -
            ((z * i.depth) / 2) * Math.sin(a),
          z:
            p.z +
            ((x * i.width) / 2) * Math.sin(a) +
            ((z * i.depth) / 2) * Math.cos(a),
        })),
      );
    });
    const loX = Math.min(...points.map((p) => p.x)),
      hiX = Math.max(...points.map((p) => p.x)),
      loZ = Math.min(...points.map((p) => p.z)),
      hiZ = Math.max(...points.map((p) => p.z));
    groups.push({
      id: 'freestanding',
      x: (loX + hiX) / 2,
      z: (loZ + hiZ) / 2,
      width: hiX - loX,
      depth: hiZ - loZ,
      rotation: 0,
      overhang: 0,
      seatingSide: 'none',
      items: free,
      label: 'Freestanding cabinetry',
    });
  }
  const freestanding = groups.flatMap((group) => {
    if (!group.items.length) return [];
    const angle = (group.rotation * Math.PI) / 180;
    return (['front', 'back', 'left', 'right'] as const).map((side) => {
      const horizontal = side === 'front' || side === 'back';
      const width = horizontal ? group.width : group.depth;
      const direction =
        side === 'front'
          ? [1, 0]
          : side === 'back'
            ? [-1, 0]
            : side === 'left'
              ? [0, 1]
              : [0, -1];
      const ux =
          direction[0] * Math.cos(angle) - direction[1] * Math.sin(angle),
        uz = direction[0] * Math.sin(angle) + direction[1] * Math.cos(angle);
      const plane = {
        x: group.x - (ux * width) / 2,
        z: group.z - (uz * width) / 2,
        ux,
        uz,
      };
      return {
        id: `${group.id}-${side}`,
        title: `${group.label} — ${side} elevation`,
        width,
        height: study.room.height,
        items: group.items.map((i) => projectedItem(i, study, plane)),
        openings: [],
        countertop: counterHeight(group.items),
      };
    });
  });
  return [...walls, ...freestanding];
}

const tick = (x: number, y: number, vertical = false) =>
  vertical ? `M${x - 3},${y}h6` : `M${x},${y - 3}v6`;

function Sheet({sheet}: {sheet: ElevationSheet}) {
  const pad = 44;
  const scale = Math.min(620 / sheet.width, 260 / sheet.height);
  const width = sheet.width * scale;
  const height = sheet.height * scale;
  const sx = (value: number) => pad + value * scale;
  const sy = (value: number) => pad + height - value * scale;
  return (
    <figure className="cc-elevation-sheet">
      <figcaption>{sheet.title}</figcaption>
      <svg
        viewBox={`0 0 ${width + pad * 2} ${height + pad * 2}`}
        role="img"
        aria-label={`${sheet.title}, orthographic worksheet`}
      >
        <rect
          className="cc-elevation-wall"
          x={pad}
          y={pad}
          width={width}
          height={height}
        />
        {sheet.openings.map((opening) => {
          const sill = opening.sill ?? 0;
          return (
            <g className="cc-elevation-opening" key={opening.id}>
              {(opening as typeof opening & {arch?: 'simple'}).arch ===
              'simple' ? (
                <path
                  d={
                    simpleArchProfile(opening.width, opening.height)
                      .points.map(
                        (p, i) =>
                          `${i ? 'L' : 'M'}${sx(opening.offset + p.x)},${sy(sill + p.y)}`,
                      )
                      .join(' ') + 'Z'
                  }
                />
              ) : (
                <rect
                  x={sx(opening.offset)}
                  y={sy(sill + opening.height)}
                  width={opening.width * scale}
                  height={opening.height * scale}
                />
              )}
              <text
                x={sx(opening.offset + opening.width / 2)}
                y={sy(sill + opening.height / 2)}
              >
                {opening.kind}
              </text>
            </g>
          );
        })}
        {sheet.items.map((item) => (
          <g
            className={`cc-elevation-item cc-elevation-${item.kind}`}
            key={item.id}
          >
            <rect
              x={sx(item.x)}
              y={sy(item.y + item.height)}
              width={item.width * scale}
              height={item.height * scale}
            />
            <path
              d={item.lines
                .map(
                  ([x1, y1, x2, y2]) =>
                    `M${sx(x1)},${sy(y1)}L${sx(x2)},${sy(y2)}`,
                )
                .join(' ')}
            />
            <text
              x={sx(item.x + item.width / 2)}
              y={sy(item.y + item.height / 2)}
            >
              {item.label}
            </text>
            <path
              className="cc-elevation-dimension"
              d={`M${sx(item.x)},${pad - 13}H${sx(item.x + item.width)} ${tick(sx(item.x), pad - 13)} ${tick(sx(item.x + item.width), pad - 13)}`}
            />
            <text
              className="cc-dimension-text"
              x={sx(item.x + item.width / 2)}
              y={pad - 18}
            >
              {Number(item.width.toFixed(3))}″
            </text>
            <text
              className="cc-dimension-text"
              x={sx(item.x + item.width / 2)}
              y={sy(item.y) - 5}
            >
              {item.height}″ high{item.y ? ` · bottom ${item.y}″` : ''}
            </text>
          </g>
        ))}
        {sheet.countertop && (
          <path
            className="cc-elevation-counter"
            d={`M${pad - 3},${sy(sheet.countertop)}H${pad + width + 3}`}
          />
        )}
        <path
          className="cc-elevation-dimension"
          d={`M${pad},${pad + height + 17}H${pad + width} ${tick(pad, pad + height + 17)} ${tick(pad + width, pad + height + 17)} M${pad + width + 17},${pad}V${pad + height} ${tick(pad + width + 17, pad, true)} ${tick(pad + width + 17, pad + height, true)}`}
        />
        <text
          className="cc-dimension-text"
          x={pad + width / 2}
          y={pad + height + 32}
        >
          {sheet.width}″ overall
        </text>
        <text
          className="cc-dimension-text"
          transform={`translate(${pad + width + 33} ${pad + height / 2}) rotate(-90)`}
        >
          {sheet.height}″ ceiling
        </text>
        {sheet.countertop && (
          <text
            className="cc-dimension-text"
            x={pad + 5}
            y={sy(sheet.countertop) - 5}
          >
            counter {sheet.countertop}″
          </text>
        )}
      </svg>
    </figure>
  );
}

export function ElevationWorksheet({study}: {study: Study}) {
  const sheets = useMemo(() => elevationSheets(study), [study]);
  return (
    <section className="cc-elevation" aria-label="Elevation worksheet">
      <header>
        <div>
          <span>Elevation worksheet</span>
          <strong>Orthographic elevations</strong>
        </div>
        <p>Cabinetry-facing views · dimensions require field verification</p>
      </header>
      {sheets.length ? (
        <div className="cc-elevation-pages">
          {sheets.map((sheet) => (
            <Sheet sheet={sheet} key={sheet.id} />
          ))}
        </div>
      ) : (
        <p className="cc-elevation-empty">
          Add wall cabinetry, an opening, or an island to generate an elevation.
        </p>
      )}
    </section>
  );
}
