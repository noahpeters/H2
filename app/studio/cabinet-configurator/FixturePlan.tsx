import type {RoomElement, Room} from './model';
import {showerGlassSides} from './fixtures';
/** Plan symbols share local coordinates with the 3D fixtures. */
export function FixturePlan({
  item,
  room,
  scale,
}: {
  item: RoomElement;
  room: Room;
  scale: number;
}) {
  const w = item.width * scale,
    d = item.depth * scale;
  if (item.fixtureKind === 'glass-shower') {
    const sides = showerGlassSides(item, room);
    const opening = sides.includes(item.showerOpening?.side ?? 'front')
      ? (item.showerOpening?.side ?? 'front')
      : sides[0];
    return (
      <g style={{stroke: '#65878b', strokeWidth: 2, fill: 'none'}}>
        {sides.map((side) => {
          const horizontal = side === 'front' || side === 'back',
            length = horizontal ? w : d;
          const sign = side === 'back' || side === 'left' ? -1 : 1;
          const line = (a: number, b: number, key: string) => (
            <line
              key={key}
              x1={horizontal ? a : (sign * w) / 2}
              y1={horizontal ? (sign * d) / 2 : a}
              x2={horizontal ? b : (sign * w) / 2}
              y2={horizontal ? (sign * d) / 2 : b}
            />
          );
          const gap = Math.min(28 * scale, length * 0.75);
          return (
            <g key={side}>
              {side === opening ? (
                <>
                  {line(-length / 2, -gap / 2, 'a')}
                  {line(gap / 2, length / 2, 'b')}
                  {item.showerOpening?.style !== 'open' && (
                    <path
                      strokeDasharray="3 2"
                      d={
                        horizontal
                          ? `M ${-gap / 2} ${(sign * d) / 2} h ${gap}`
                          : `M ${(sign * w) / 2} ${-gap / 2} v ${gap}`
                      }
                    />
                  )}
                </>
              ) : (
                line(-length / 2, length / 2, 'full')
              )}
            </g>
          );
        })}
      </g>
    );
  }
  return (
    <g style={{fill: '#f7f6f2', stroke: '#949c9c', strokeWidth: 1}}>
      {item.fixtureKind === 'toilet' ? (
        <>
          <rect
            style={{fill: '#f7f6f2', stroke: '#949c9c'}}
            x={-w * 0.43}
            y={-d * 0.49}
            width={w * 0.86}
            height={d * 0.25}
          />
          <ellipse cx={0} cy={d * 0.13} rx={w * 0.46} ry={d * 0.32} />
        </>
      ) : item.fixtureKind === 'freestanding-tub' ? (
        <ellipse rx={w * 0.48} ry={d * 0.47} />
      ) : (
        <rect
          style={{fill: '#f7f6f2', stroke: '#949c9c'}}
          x={-w / 2 + 2 * scale}
          y={-d / 2 + 2 * scale}
          width={w - 4 * scale}
          height={d - 4 * scale}
          rx={2 * scale}
        />
      )}
    </g>
  );
}
