import {expect, it} from 'vitest';
import {cabinetFaceFrame} from './faceFrame';

it('shares a center stile and leaves a normal 1.5 inch divider between paired openings', () => {
  const frame = cabinetFaceFrame(
    [
      {x: 0.125, y: 0.125, width: 17.8125, height: 29.25},
      {x: 18.0625, y: 0.125, width: 17.8125, height: 29.25},
    ],
    {x: 0, y: 0, width: 36, height: 29.5},
  );
  expect(frame.stiles).toHaveLength(3);
  expect(frame.rails).toHaveLength(2);
  const [left, right] = frame.openings;
  expect(right.x - left.x - left.width).toBeCloseTo(1.5);
  expect(left.width).toBeCloseTo(right.width);
});

it('keeps one continuous rail at a T intersection under a full width drawer', () => {
  const frame = cabinetFaceFrame(
    [
      {x: 0.125, y: 0.125, width: 17.8125, height: 23.625},
      {x: 18.0625, y: 0.125, width: 17.8125, height: 23.625},
      {x: 0.125, y: 23.875, width: 35.75, height: 5.5},
    ],
    {x: 0, y: 0, width: 36, height: 29.5},
  );
  expect(frame.stiles).toHaveLength(3);
  expect(frame.rails).toHaveLength(3);
  const [left, right, drawer] = frame.openings;
  expect(right.x - left.x - left.width).toBeCloseTo(1.5);
  expect(drawer.y - left.y - left.height).toBeCloseTo(1.5);
  expect(drawer.width).toBe(33);
});
