export type SimpleArch = 'simple';

/** Authoritative simple circular arch shared by cabinets, doors, and walls. */
export function simpleArchProfile(width: number, height: number, steps = 24) {
  const radius = Math.min(width / 2, height);
  const spring = height - radius;
  const left = width / 2 - radius;
  const points: Array<{x: number; y: number}> = [
    {x: 0, y: 0},
    {x: width, y: 0},
    {x: width, y: spring},
  ];
  if (left + 2 * radius < width) points.push({x: left + 2 * radius, y: spring});
  for (let i = 0; i <= steps; i++) {
    const angle = (i * Math.PI) / steps;
    points.push({
      x: width / 2 + radius * Math.cos(angle),
      y: spring + radius * Math.sin(angle),
    });
  }
  if (left > 0) points.push({x: 0, y: spring});
  return {radius, spring, points};
}

export function pointInSimpleArch(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (x < 0 || x > width || y < 0) return false;
  const {radius, spring} = simpleArchProfile(width, height, 1);
  if (y <= spring) return true;
  const dx = x - width / 2;
  return Math.abs(dx) <= radius && dx * dx + (y - spring) ** 2 <= radius ** 2;
}
