import {describe, expect, it} from 'vitest';
import {pointInSimpleArch, simpleArchProfile} from './simpleArch';

describe('shared simple arch', () => {
  it('uses the constrained circular radius and an authoritative outline', () => {
    expect(simpleArchProfile(36, 48).radius).toBe(18);
    expect(simpleArchProfile(36, 12).radius).toBe(12);
    expect(pointInSimpleArch(18, 48, 36, 48)).toBe(true);
    expect(pointInSimpleArch(1, 47, 36, 48)).toBe(false);
  });
});
