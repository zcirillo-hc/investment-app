/** mulberry32: small fast deterministic PRNG returning [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit hash of a string, as an unsigned integer. */
export function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Combines a seed and a day index into a per-day PRNG seed. */
export function hash(seed: number, day: number): number {
  let h = fnv1a32(`${seed >>> 0}:${day}`);
  // one extra avalanche so neighboring days differ well
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Uniform integer in [lo, hi] inclusive. */
export function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Standard normal via Box-Muller. */
export function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Plan v2 R2.4. Rounding for the visit minute, which can be negative because a gaussian can
 * be. This is NOT the money rule (R1.2): it is ties toward positive infinity, which is what
 * JavaScript's `Math.round` does. Written as `floor(x + 0.5)` so the rounding has one
 * unambiguous expression to copy rather than a language built in that ties differently.
 */
export function roundTiesUp(x: number): number {
  return Math.floor(x + 0.5);
}

/**
 * Plan v2 R2.4. A standard normal drawn from a single 32 bit hash, which is how a visit minute
 * gets a deterministic offset from its merchant's usual time. Seeding a fresh mulberry32 with
 * the hash and then taking one Box Muller draw is the whole definition.
 */
export function gaussianFrom(hashValue: number): number {
  return gaussian(mulberry32(hashValue >>> 0));
}

/**
 * Plan v2 R2.0, for the rule fixture. `mulberry32` returns a double in [0, 1) produced by
 * dividing an unsigned 32 bit value by 2^32. The fixture holds only integers, so it compares
 * that unsigned value directly and the fixture avoids a float round trip entirely.
 */
export function mulberry32Uint32(seed: number): () => number {
  const rng = mulberry32(seed);
  return () => rng() * 4294967296;
}
