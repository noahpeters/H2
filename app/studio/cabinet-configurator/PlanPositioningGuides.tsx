import type {Study} from './CabinetConfigurator';
import {
  positioningGuides,
  guideDistanceLabel,
  type GuideTarget,
} from './positioningGuides';

export function PositioningGuides({
  study,
  target,
  pad,
  scale,
  screenScale,
}: {
  study: Study;
  target: GuideTarget | null;
  pad: number;
  scale: number;
  screenScale: number;
}) {
  const guides = positioningGuides(study, target);
  if (!guides.length) return null;
  const unit = 1 / screenScale;
  return (
    <g
      className="cc-positioning-guides"
      pointerEvents="none"
      aria-label="Positioning aids"
    >
      {guides.map((guide, index) => {
        const horizontal = guide.axis === 'x';
        const x1 = pad + (horizontal ? guide.from : guide.at) * scale;
        const y1 = pad + (horizontal ? guide.at : guide.from) * scale;
        const x2 = pad + (horizontal ? guide.to : guide.at) * scale;
        const y2 = pad + (horizontal ? guide.at : guide.to) * scale;
        const label =
          guide.distance === undefined
            ? ''
            : guideDistanceLabel(guide.distance);
        const width = (label.length * 7 + 12) * unit;
        const x = (x1 + x2) / 2;
        const y = (y1 + y2) / 2;
        return (
          <g key={index} className={`cc-positioning-guide-${guide.kind}`}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              vectorEffect="non-scaling-stroke"
            />
            {label && (
              <>
                {[
                  {x: x1, y: y1},
                  {x: x2, y: y2},
                ].map((p, tick) => (
                  <line
                    key={tick}
                    x1={p.x - (horizontal ? 0 : 4 * unit)}
                    x2={p.x + (horizontal ? 0 : 4 * unit)}
                    y1={p.y - (horizontal ? 4 * unit : 0)}
                    y2={p.y + (horizontal ? 4 * unit : 0)}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                <rect
                  x={x - width / 2}
                  y={y - 10 * unit}
                  width={width}
                  height={20 * unit}
                  rx={5 * unit}
                />
                <text
                  x={x}
                  y={y}
                  fontSize={11 * unit}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {label}
                </text>
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}
