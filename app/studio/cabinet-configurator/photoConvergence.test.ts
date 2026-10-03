import {expect, test} from 'vitest';
import {PhotoConvergence} from './photoConvergence';
function frame(noise = 0, localized = false) {
  const pixels = new Float32Array(64 * 64 * 4);
  for (let p = 0; p < 64 * 64; p++) {
    const value = 0.35 + (localized && p > 63 ? 0 : p % 2 ? noise : -noise);
    pixels.set([value, value, value, 1], p * 4);
  }
  return pixels;
}
test('requires complete checkpoints, minimum effort and repeated stability, not one quiet frame', () => {
  const monitor = new PhotoConvergence(16, 32, 0.015);
  expect(monitor.shouldCheck(16.111)).toBe(false);
  for (const n of [16, 32, 48])
    expect(monitor.observe(frame(), n, 64)).toBe(false);
  expect(monitor.observe(frame(), 64, 64)).toBe(true);
  expect(monitor.shouldCheck(64)).toBe(false);
});
test('keeps refining localized reflections and resets stability after a late lighting change', () => {
  const monitor = new PhotoConvergence(16, 32, 0.015);
  monitor.observe(frame(), 16, 64);
  monitor.observe(frame(), 32, 64);
  monitor.observe(frame(), 48, 64);
  expect(monitor.observe(frame(0.3, true), 64, 64)).toBe(false);
  expect(monitor.checks.at(-1)?.worstRegion).toBeGreaterThan(0.03);
  expect(monitor.observe(frame(), 80, 64)).toBe(false);
  expect(monitor.observe(frame(), 96, 64)).toBe(false);
  expect(monitor.observe(frame(), 112, 64)).toBe(false);
  expect(monitor.observe(frame(), 128, 64)).toBe(true);
});
test('corrects shrinking accumulated-image updates so high sample counts cannot fake convergence', () => {
  const monitor = new PhotoConvergence(16, 32, 0.015);
  monitor.observe(frame(), 1000, 64);
  expect(monitor.observe(frame(0.025), 1016, 64)).toBe(false);
  expect(monitor.checks.at(-1)?.rms).toBeGreaterThan(0.015);
});
test('invalid radiance never converges', () => {
  const monitor = new PhotoConvergence(16, 32, 0.015);
  for (const n of [16, 32, 48, 64, 80]) {
    const pixels = frame();
    pixels[0] = NaN;
    expect(monitor.observe(pixels, n, 64)).toBe(false);
  }
});
