// CODER suite, cycle 5 (plan 13.2 C4-8). The dark palette's guarantee must not depend on
// what an axe walk happens to render: this reads the real tokens out of `src/index.css` and
// computes the WCAG 2.x ratio for every documented text-on-surface pair, in BOTH themes.
// 4.5:1 for body text, 3:1 for large text (>= 18.66 px bold or 24 px) and UI components.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Rgb = [number, number, number];

/** Reads `--c-*: r g b;` declarations out of one CSS block. */
function tokens(css: string, selector: string): Record<string, Rgb> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`no ${selector} block in index.css`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const body = css.slice(open + 1, close);
  const out: Record<string, Rgb> = {};
  for (const m of body.matchAll(/--c-([a-z-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
    out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return out;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
export function contrast(a: Rgb, b: Rgb): number {
  const [l1, l2] = [luminance(a), luminance(b)];
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}


const css = readFileSync('src/index.css', 'utf8');
const light = tokens(css, ':root');
// `.dark` overrides `:root`; anything it does not restate is inherited, exactly as the
// cascade resolves it in the browser (`--c-on-fill` is deliberately only declared once).
const dark = { ...light, ...tokens(css, '.dark') };

/** [text token, surface token, minimum ratio, where it is used]. */
const PAIRS: [string, string, number, string][] = [
  // Body text on every surface a screen can put it on.
  ['ink', 'ground', 4.5, 'body text on the page ground'],
  ['ink', 'card', 4.5, 'body text on a card'],
  ['ink', 'leaf-soft', 4.5, 'body text on the tinted summer and lesson cards'],
  ['ink', 'coral-soft', 4.5, 'body text on the catch sheet tint'],
  ['ink', 'amber-soft', 4.5, 'body text on the amber risk-read warning card'],
  ['ink', 'line', 4.5, 'text on the locked-lesson pill'],
  ['muted', 'ground', 4.5, 'muted text on the page ground'],
  ['muted', 'card', 4.5, 'muted text on a card'],
  ['muted', 'leaf-soft', 4.5, 'muted text on the tinted cards'],
  ['muted', 'coral-soft', 4.5, 'muted text on the catch sheet tint'],
  ['muted', 'amber-soft', 4.5, 'muted text on the amber warning card'],
  ['muted', 'line', 4.5, 'the locked-lesson pill label'],
  // Accent text.
  ['leaf', 'ground', 4.5, 'links and growth figures on the ground'],
  ['leaf', 'card', 4.5, 'links and growth figures on a card'],
  ['leaf', 'leaf-soft', 4.5, 'the "read" lesson badge and the summer growth line'],
  ['coral-ink', 'ground', 4.5, 'form error copy and a negative growth figure on the ground'],
  ['coral-ink', 'card', 4.5, 'form error copy on a card'],
  ['coral-ink', 'coral-soft', 4.5, 'coral text on its own tint'],
  ['amber-ink', 'ground', 4.5, 'amber text on the ground'],
  ['amber-ink', 'card', 4.5, 'amber text on a card'],
  ['amber-ink', 'amber-soft', 4.5, 'the amber risk-read copy on its warning card'],
  // Labels on a filled brand colour (C4-8's on-* tokens).
  ['on-leaf', 'leaf', 4.5, 'every primary button, the settings theme segments, milestone save, the sweep banner, the error boundary button'],
  ['on-coral', 'coral', 4.5, 'the danger button (Reset demo) and the "New" lesson badge'],
  ['on-amber', 'amber', 4.5, 'the amber button (Land a paycheck)'],
  // Surfaces the tooltip, toast and demo tray invert onto.
  ['ground', 'ink', 4.5, 'the light-theme tooltip, toast and demo tray text'],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('C4-8: %s palette meets WCAG AA', (theme, palette) => {
  it.each(PAIRS)('%s on %s is at least %s:1 (%s)', (text, surface, min) => {
    const a = palette[text];
    const b = palette[surface];
    expect(a, `--c-${text} is missing from the ${theme} palette`).toBeTruthy();
    expect(b, `--c-${surface} is missing from the ${theme} palette`).toBeTruthy();
    const ratio = contrast(a, b);
    expect(ratio, `--c-${text} on --c-${surface} in ${theme} is ${ratio}:1, needs ${min}:1`).toBeGreaterThanOrEqual(min);
  });

  /**
   * The five allocation segment colours left with the simulated portfolio, so the two cases
   * that measured `--c-on-fill` against them are deleted with it. The token survives, because
   * `LessonVisual.tsx` still draws the 65 cent coin label on the amber fill, so that is the
   * pair it is measured against now.
   */
  it('the coin label in the L1 illustration reads on its amber fill', () => {
    const ratio = contrast(palette['on-fill'], palette.amber);
    expect(ratio, `--c-on-fill on --c-amber in ${theme} is ${ratio}:1`).toBeGreaterThanOrEqual(4.5);
  });
});

describe('C4-8: the pairs the cycle 4 label swap made worse (D15) are all repaired', () => {
  // `--c-coral` and `--c-sky` are deliberately absent as text pairs: coral is a fill and an
// illustration accent (its text sibling is `--c-coral-ink`), and sky appears only inside one
// lesson SVG. A grep test below keeps that split honest.
// The tester's measured "after" numbers, which this must beat in dark mode.
  // The two `on-fill` rows measured against the deleted allocation segment colours are gone
  // with them. The two that survive are the ones on tokens the app still paints.
  const REGRESSED: [string, string, number][] = [
    ['on-coral', 'coral', 2.06],
    ['on-amber', 'amber', 1.66],
  ];

  it.each(REGRESSED)('%s on %s beats its D15 value of %s:1', (text, surface, before) => {
    const ratio = contrast(dark[text], dark[surface]);
    expect(ratio).toBeGreaterThan(before);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('white on the dark leaf, the worst pair in D14, is no longer used anywhere', () => {
    // 2.08:1 by the tester's measurement. Kept as a documented fact: the token that replaced
    // it has to be far clear of it, and nothing may reintroduce `text-white` on `bg-leaf`.
    expect(contrast([255, 255, 255], dark.leaf)).toBeLessThan(3);
    expect(contrast(dark['on-leaf'], dark.leaf)).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * D21. The first version of this guard only matched JSX `className=` attributes, so it never
 * read `Button.tsx` - which writes its classes in a plain object literal, and which is exactly
 * where D14's worst pair (white on leaf, 2.08:1, every primary button in the app) lived. The
 * tester reintroduced D14 verbatim and this file still reported all-passing.
 *
 * `classRuns` now takes every string a class list can be written as, wherever it is written:
 * single- and double-quoted literals (object literals, variables, helper returns, ternary
 * branches) and each static run of a template literal, split at its `${...}` boundaries so one
 * run never fuses two mutually exclusive branches into a false positive. The two tests below
 * it prove the extraction has teeth: one asserts the detector fires on a synthetic
 * reproduction of D14 in Button's own object-literal shape, the other asserts the real
 * `Button.tsx` primary variant is among the runs actually collected.
 */
function classRuns(source: string): string[] {
  const runs: string[] = [];
  for (const m of source.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)) runs.push(m[1] ?? m[2] ?? '');
  // A template literal's own static text, minus the interpolations. The expressions inside
  // `${...}` are themselves quoted literals and are collected by the pass above.
  for (const m of source.matchAll(/`([^`]*)`/g)) runs.push(...m[1].split(/\$\{[^{}]*\}/));
  return runs;
}

/** True when one class list paints a raw `text-white` / `text-ink` label onto a brand fill. */
function rawLabelOnFill(cls: string): boolean {
  // `bg-leaf-soft` and friends are tinted SURFACES, not fills: `text-ink` is correct on them.
  // `\b` matches after a variant colon too, so `dark:checked:bg-leaf` is covered.
  const fill = /\bbg-(?:leaf|coral|amber)(?![\w-])/.test(cls);
  const label = /\btext-(?:white|ink)(?![\w-])/.test(cls);
  return fill && label;
}

describe('C4-8: no component reintroduces a raw label on a brand fill', () => {
  const SRC = readdirSync('src', { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
    .map((f) => [f, readFileSync(`src/${f}`, 'utf8')] as const);

  it('no class string anywhere in src puts text-white or text-ink on a bg-leaf, bg-coral or bg-amber fill', () => {
    const offenders: string[] = [];
    for (const [file, body] of SRC) {
      for (const cls of classRuns(body)) if (rawLabelOnFill(cls)) offenders.push(`${file}: ${cls}`);
    }
    expect(offenders, `use text-on-leaf / text-on-coral / text-on-amber instead:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('D21: the guard fires on D14 reintroduced in an object literal, not just in a className attribute', () => {
    // Verbatim from the tester's D21 repro, which the attribute-only regex scored as passing.
    const injected = `const variants = {\n  primary: 'bg-leaf text-white hover:brightness-110 shadow-sm',\n};`;
    expect(classRuns(injected).some(rawLabelOnFill), 'white-on-leaf in an object literal must be caught').toBe(true);
    // ... and the same defect written the three other ways a class list gets built.
    expect(classRuns(`className="rounded-full bg-coral text-ink"`).some(rawLabelOnFill)).toBe(true);
    expect(classRuns('const c = `p-2 bg-amber text-white`;').some(rawLabelOnFill)).toBe(true);
    expect(classRuns(`const c = cx(active ? 'bg-leaf text-white' : 'bg-card');`).some(rawLabelOnFill)).toBe(true);
    // The tinted surfaces and the correct `on-*` tokens must stay clean, or the guard is noise.
    expect(classRuns(`primary: 'bg-leaf text-on-leaf'`).some(rawLabelOnFill)).toBe(false);
    expect(classRuns(`'bg-leaf-soft text-ink'`).some(rawLabelOnFill)).toBe(false);
    expect(classRuns('`rounded ${a ? \'bg-leaf text-on-leaf\' : \'bg-card text-ink\'}`').some(rawLabelOnFill)).toBe(false);
  });

  it("D21: Button.tsx's variant map is among the class strings the guard actually reads", () => {
    // The coverage assertion. If the extraction ever stops seeing the file D14 lived in, this
    // fails loudly rather than the suite quietly going green on a blind spot.
    const runs = classRuns(readFileSync('src/components/Button.tsx', 'utf8'));
    expect(runs.some((c) => /\bbg-leaf(?![\w-])/.test(c) && /\btext-on-leaf\b/.test(c))).toBe(true);
    expect(runs.some((c) => /\bbg-coral(?![\w-])/.test(c) && /\btext-on-coral\b/.test(c))).toBe(true);
    expect(runs.some((c) => /\bbg-amber(?![\w-])/.test(c) && /\btext-on-amber\b/.test(c))).toBe(true);
  });

  it('D20: the pause switch takes its state colours from CSS, not from stacked Tailwind variants', () => {
    const settings = readFileSync('src/screens/Settings.tsx', 'utf8');
    const after = settings.split('data-testid="settings-pause-roundups"')[1]?.split('/>')[0] ?? '';
    // The class list only, not the comment above it, which names the dead utilities on purpose.
    const sw = /className="([^"]*)"/.exec(after)?.[1] ?? '';
    expect(sw, 'the switch must render with a className').not.toBe('');
    expect(sw, 'the state colours belong to .switch-track').toContain('switch-track');
    // The bug was `dark:bg-muted` outranking `checked:bg-leaf` on emission order alone. No
    // colour utility may go back on this element, in any variant.
    for (const dead of ['checked:bg-', 'dark:bg-', 'before:bg-', 'dark:before:bg-', 'bg-line', 'bg-leaf']) {
      expect(sw, `${dead} on the switch reopens the D20 ordering hole`).not.toContain(dead);
    }
    // `:checked` outranks the base rule, so these can never be reordered into a no-op.
    expect(css).toMatch(/\.switch-track:checked\s*\{[^}]*--c-leaf/);
    expect(css).toMatch(/\.switch-track:checked::before\s*\{[^}]*--c-switch-knob-on/);
  });

  it('D20: the switch conveys its state by colour in both themes, and the knob reads on both tracks', () => {
    for (const [name, t] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      const off = t['switch-off'];
      const on = t.leaf;
      expect(off, `${name} needs a --c-switch-off token`).toBeDefined();
      // D20's actual failure: state must be carried by colour, not only by the knob's position.
      // Light shipped at 4.56:1 and dark was at 1.00:1; dark now matches light at 4.82:1.
      expect(contrast(on, off), `${name}: the on and off tracks must differ, not just the knob`).toBeGreaterThanOrEqual(4.5);
    }
    // Dark's knob flips with the state, because no single colour clears 3:1 against both ends
    // of a 4.8:1 track range. Off knob 8.99:1 on the dark track, on knob 8.04:1 on the green.
    expect(contrast(dark['switch-knob-off'], dark['switch-off'])).toBeGreaterThanOrEqual(3);
    expect(contrast(dark['switch-knob-on'], dark.leaf)).toBeGreaterThanOrEqual(3);
    // Light is byte-identical to what shipped before D20, down to the tester's rendered values.
    // Its off knob is white on a pale track (1.35:1) and its on knob is white on the dark green
    // (5.51:1). That asymmetry pre-dates this cycle and four clean light-mode axe scans; D20 is
    // a dark-mode regression and this fix deliberately does not touch light's appearance.
    expect(light['switch-off']).toEqual([210, 226, 216]);
    expect(light.leaf).toEqual([22, 112, 63]);
    expect(light['switch-knob-off']).toEqual([255, 255, 255]);
    expect(light['switch-knob-on']).toEqual([255, 255, 255]);
  });

  /**
   * This used to read `AllocationBar.tsx`, which is deleted with the simulated portfolio. The
   * property it protected is still worth keeping: the one surviving place that draws a label
   * on a brand fill uses the theme independent token rather than a hard coded colour.
   */
  it('the coin label in the L1 illustration uses the theme independent on-fill token', () => {
    const visual = readFileSync('src/components/LessonVisual.tsx', 'utf8');
    expect(visual).toContain('fill-on-fill');
    expect(visual).not.toContain('fill-white');
  });
});
