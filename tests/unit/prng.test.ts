import { describe, expect, it } from 'vitest';
import { fnv1a32, gaussian, hash, mulberry32, randInt } from '../../src/domain/prng';

describe('prng', () => {
  it('same seed gives the same sequence', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });
  it('different days hash differently', () => {
    const seen = new Set<number>();
    for (let d = 0; d < 200; d++) seen.add(hash(42, d));
    expect(seen.size).toBe(200);
    expect(hash(42, 3)).not.toBe(hash(7, 3));
  });
  it('fnv1a32 is stable', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('Sam||2026')).toBe(fnv1a32('Sam||2026'));
  });
  it('randInt stays inclusive within bounds', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const n = randInt(rng, 2, 4);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(4);
    }
  });
  it('gaussian has mean near 0 and sd near 1', () => {
    const rng = mulberry32(9);
    let sum = 0;
    let sq = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const z = gaussian(rng);
      sum += z;
      sq += z * z;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.03);
    expect(Math.abs(sq / n - 1)).toBeLessThan(0.05);
  });
});
