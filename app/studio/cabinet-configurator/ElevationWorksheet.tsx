import type {Study} from './CabinetConfigurator';
import {APPLIANCE_CATALOG, type RoomElement, type Wall} from './model';
import {OPEN_STORAGE} from './openStorage';
import {roomSegments} from './roomOutline';

type ElevationItem = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: RoomElement['kind'];
  face?: RoomElement['face'];
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

/** Produce only useful wall elevations plus every exposed face of cabinetry islands. */
export function elevationSheets(study: Study): ElevationSheet[] {
  const walls = roomSegments(study.room).flatMap((wall) => {
    const items = study.elements.filter(
      (item) =>
        item.placement.mode === 'wall' && item.placement.wall === wall.id,
    );
    const openings = study.openings.filter(
      (opening) => opening.wall === wall.id,
    );
    if (!items.length && !openings.length) return [];
    return [
      {
        id: wall.id,
        title: `${wall.label === wall.id ? `${wall.label[0].toUpperCase()}${wall.label.slice(1)} wall` : wall.label} — front elevation`,
        width: wall.length,
        height: study.room.height,
        items: items.map((item) => ({
          id: item.id,
          label: itemLabel(item),
          x: item.placement.mode === 'wall' ? item.placement.offset : 0,
          y: item.placement.elevation ?? 0,
          width: item.width,
          height: item.height,
          kind: item.kind,
          face: item.face,
        })),
        openings,
        countertop: study.countertop
          ? Math.max(
              0,
              ...items
                .filter((item) => item.kind === 'base')
                .map((item) => (item.placement.elevation ?? 0) + item.height),
            ) || undefined
          : undefined,
      } satisfies ElevationSheet,
    ];
  });

  const islands = study.islands.flatMap((island) => {
    const items = study.elements.filter((item) => item.islandId === island.id);
    if (!items.length) return [];
    return (['front', 'back', 'left', 'right'] as const).map((side) => {
      const horizontal = side === 'front' || side === 'back';
      const width = horizontal ? island.width : island.depth;
      return {
        id: `${island.id}-${side}`,
        title: `Island — ${side} elevation`,
        width,
        height: study.room.height,
        items: items.map((item) => ({
          id: `${item.id}-${side}`,
          label: itemLabel(item),
          x: Math.max(0, (width - item.width) / 2),
          y: item.placement.elevation ?? 0,
          width: Math.min(item.width, width),
          height: item.height,
          kind: item.kind,
          face: item.face,
        })),
        openings: [],
        countertop: study.countertop
          ? Math.max(...items.map((item) => item.height))
          : undefined,
      };
    });
  });
  return [...walls, ...islands];
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
              <rect
                x={sx(opening.offset)}
                y={sy(sill + opening.height)}
                width={opening.width * scale}
                height={opening.height * scale}
              />
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
            {item.kind !== 'fixture' && (
              <path
                d={
                  item.face === 'shaker'
                    ? `M${sx(item.x + 2)},${sy(item.y + item.height - 2)}h${Math.max(0, (item.width - 4) * scale)}v${Math.max(0, (item.height - 4) * scale)}h${Math.max(0, -(item.width - 4) * scale)}z`
                    : `M${sx(item.x + item.width / 2)},${sy(item.y)}V${sy(item.y + item.height)}`
                }
              />
            )}
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
              {item.width}″
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
  const sheets = elevationSheets(study);
  return (
    <section className="cc-elevation" aria-label="Elevation worksheet">
      <header>
        <div>
          <span>Elevation worksheet</span>
          <strong>Orthographic · not for fabrication</strong>
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
