/**
 * TESTER cycle 4 lint plants. Never imported by the app, and `tests/` is outside both lints'
 * walk, so nothing here can fail `npm run lint:advice`. `tests/unit/tester-v4-cycle4.test.ts`
 * points `scripts/lint-advice.ts` at this one file and reads back which lines it flagged.
 *
 * One plant per line so a flag can be attributed to exactly one of them. None of these shapes
 * exists in shipped copy today (strings.ts has no `+` concatenation and no brace inside an
 * interpolated literal); they measure what the V2-14 fix does and does not see.
 */

// Control: must be flagged, or the harness is not seeing this file.
export const V4_CONTROL = 'Honestly, you should buy NVDA today.';
// Rule 4 split across a concatenation. Joined it is a number plus "beats"; apart, neither half is.
export const V4_SPLIT_RULE4 = 'Putting away $20 a week ' + 'beats waiting until you earn more.';
// A banned phrase split the same way: "will " and "grow" are each harmless.
export const V4_SPLIT_PHRASE = 'A broad fund like this will ' + 'grow every single year.';
// An interpolation whose literal holds an unbalanced brace, followed by template prose.
export const V4_BRACE = (x: boolean): string => `${x ? '{' : ''} Honestly, you should buy it.`;
// Control after the brace plant: if this is not flagged, the scanner stopped reading here.
export const V4_CONTROL_AFTER = 'We recommend this fund for you.';
