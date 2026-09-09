/**
 * Test report V2-2, the third appearance of D7 (tap targets under 44 px).
 *
 * The two previous fixes were made at the call sites that happened to be failing, which is why
 * it came back: `Button`'s `sm` size stayed 36 px, and the next three screens to reach for
 * `size="sm"` inherited the defect. This file enforces the RULE instead of the three ids the
 * report named, in two layers:
 *
 *   1. every size in `Button`'s own scale is at least 44 px, so a new size cannot be added
 *      below the floor;
 *   2. no `min-h-[Npx]` anywhere under `src/` is below the floor, which covers the hand rolled
 *      controls (the tooltip anchors, the segmented theme control, the nav bar) that do not go
 *      through `Button` at all.
 *
 * The Playwright audit in `tests/e2e/tester-v2-regression.spec.ts` measures what actually
 * renders; this measures what can be written. Both are wanted: a source scan cannot see a
 * control squashed by its container, and a rendering audit only reaches the states it visits.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIN_TAP_TARGET_PX, sizes } from '../../src/components/Button';

const SRC = resolve(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('D7 / V2-2: the 44 px tap target floor is a property of the code, not of three screens', () => {
  it('every size in the Button scale is at least the floor', () => {
    for (const [name, classes] of Object.entries(sizes)) {
      const m = /min-h-\[(\d+)px\]/.exec(classes);
      expect(m, `Button size "${name}" must declare a min-h`).not.toBeNull();
      expect(Number(m![1]), `Button size "${name}" is ${m![1]}px`).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
    }
  });

  it('no min-h anywhere under src/ is below the floor', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const source = readFileSync(file, 'utf8');
      source.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/min-h-\[(\d+)px\]/g)) {
          if (Number(m[1]) < MIN_TAP_TARGET_PX) offenders.push(`${relative(process.cwd(), file)}:${i + 1}: ${m[0]}`);
        }
      });
    }
    expect(offenders, `controls declared below ${MIN_TAP_TARGET_PX} px:\n${offenders.join('\n')}`).toEqual([]);
  });
});
