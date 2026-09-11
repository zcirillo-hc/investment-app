/**
 * TESTER cycle 3 lint plants. Never imported by the app, and `tests/` is outside both lints'
 * walk, so nothing here can fail `npm run lint:advice`. `tests/unit/tester-v3-cycle3.test.ts`
 * points `scripts/lint-advice.ts` at this one file and reads back which lines it flagged.
 *
 * Each plant sits on its own line so a flag can be attributed to exactly one of them.
 */
const formatDollars = (n: number): string => `$${n}`;

// Controls: plain literals the lint must catch, proving the harness sees this file at all.
export const PLANT_CONTROL_PHRASE = 'Honestly, you should buy NVDA today.';
export const PLANT_CONTROL_L7 = 'Why $20 a week beats $500 later';

// Holes: the same claims, written the way every string in src/content/strings.ts is written.
export const PLANT_INTERPOLATED_L7 = (a: number, b: number): string => `Why ${formatDollars(a)} a week beats ${formatDollars(b)} later`;
export const PLANT_INTERPOLATED_ADVICE = (on: boolean): string => `Tip: ${on ? 'you should buy NVDA now, it will grow' : ''}`;
