/** One cabinet frame, with shared members between neighboring front cells. */
export type FrameRect = {x: number; y: number; width: number; height: number};
export function cabinetFaceFrame(
  cells: FrameRect[],
  bounds: FrameRect,
  joined: {left?: boolean; right?: boolean} = {},
) {
  const f = Math.min(1.5, bounds.width / 6, bounds.height / 6);
  const right = bounds.x + bounds.width,
    top = bounds.y + bounds.height;
  const innerLeft = bounds.x + f * (joined.left ? 0.5 : 1);
  const innerRight = right - f * (joined.right ? 0.5 : 1);
  const horizontal: FrameRect[] = [];
  const vertical: FrameRect[] = [];
  for (let i = 0; i < cells.length; i++)
    for (let k = i + 1; k < cells.length; k++) {
      const a = cells[i],
        b = cells[k];
      const x = Math.max(a.x, b.x),
        y = Math.max(a.y, b.y);
      const w = Math.min(a.x + a.width, b.x + b.width) - x;
      const h = Math.min(a.y + a.height, b.y + b.height) - y;
      if (
        w > 0 &&
        Math.min(
          Math.abs(a.y + a.height - b.y),
          Math.abs(b.y + b.height - a.y),
        ) < 0.5
      ) {
        const lower = a.y < b.y ? a : b,
          upper = lower === a ? b : a;
        horizontal.push({
          x: Math.max(innerLeft, x - f / 2),
          y: (lower.y + lower.height + upper.y) / 2 - f / 2,
          width:
            Math.min(innerRight, x + w + f / 2) -
            Math.max(innerLeft, x - f / 2),
          height: f,
        });
      }
      if (
        h > 0 &&
        Math.min(Math.abs(a.x + a.width - b.x), Math.abs(b.x + b.width - a.x)) <
          0.5
      ) {
        const left = a.x < b.x ? a : b,
          next = left === a ? b : a;
        vertical.push({
          x: (left.x + left.width + next.x) / 2 - f / 2,
          y: Math.max(bounds.y + f, y - f / 2),
          width: f,
          height:
            Math.min(top - f, y + h + f / 2) -
            Math.max(bounds.y + f, y - f / 2),
        });
      }
    }
  // Merge collinear spans so paired doors below drawers share one full rail.
  const merge = (rects: FrameRect[], axis: 'x' | 'y') => {
    const other = axis === 'x' ? 'y' : 'x',
      size = axis === 'x' ? 'width' : 'height';
    rects.sort((a, b) => a[other] - b[other] || a[axis] - b[axis]);
    const result: FrameRect[] = [];
    for (const r of rects) {
      const last = result[result.length - 1];
      if (
        last &&
        Math.abs(last[other] - r[other]) < 0.001 &&
        r[axis] <= last[axis] + last[size] + 0.001
      )
        last[size] =
          Math.max(last[axis] + last[size], r[axis] + r[size]) - last[axis];
      else result.push({...r});
    }
    return result;
  };
  const rails = merge(
    [
      {x: innerLeft, y: bounds.y, width: innerRight - innerLeft, height: f},
      {x: innerLeft, y: top - f, width: innerRight - innerLeft, height: f},
      ...horizontal,
    ],
    'x',
  );
  const stiles = [
    {
      x: bounds.x - (joined.left ? f / 2 : 0),
      y: bounds.y,
      width: f,
      height: bounds.height,
    },
    {
      x: right - f * (joined.right ? 0.5 : 1),
      y: bounds.y,
      width: f,
      height: bounds.height,
    },
  ];
  for (const v of merge(vertical, 'y')) {
    let spans = [v];
    for (const r of rails)
      if (r.x < v.x + v.width && r.x + r.width > v.x) {
        spans = spans.flatMap((s) => {
          if (r.y >= s.y + s.height || r.y + r.height <= s.y) return [s];
          const pieces: FrameRect[] = [];
          if (r.y > s.y) pieces.push({...s, height: r.y - s.y});
          if (r.y + r.height < s.y + s.height)
            pieces.push({
              ...s,
              y: r.y + r.height,
              height: s.y + s.height - r.y - r.height,
            });
          return pieces;
        });
      }
    stiles.push(...spans);
  }
  const openings = cells.map((c) => {
    let x = innerLeft,
      y = bounds.y + f,
      end = innerRight,
      high = top - f;
    for (const s of stiles)
      if (s.y < c.y + c.height && s.y + s.height > c.y) {
        if (s.x + s.width <= c.x + c.width / 2) x = Math.max(x, s.x + s.width);
        if (s.x >= c.x + c.width / 2) end = Math.min(end, s.x);
      }
    for (const r of rails)
      if (r.x < c.x + c.width && r.x + r.width > c.x) {
        if (r.y + r.height <= c.y + c.height / 2)
          y = Math.max(y, r.y + r.height);
        if (r.y >= c.y + c.height / 2) high = Math.min(high, r.y);
      }
    // Appliance gaps retain their own opening limits.
    if (c.y > y + 0.5) y = c.y + f / 2;
    if (c.y + c.height < high - 0.5) high = c.y + c.height - f / 2;
    return {x, y, width: end - x, height: high - y};
  });
  return {stiles, rails, openings, width: f};
}
