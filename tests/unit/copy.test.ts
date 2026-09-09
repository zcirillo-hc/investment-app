/**
 * The voice rules, as tests (plan v2 section 8 header, R4.7, R5.4, R7.3, R15 and criteria 16
 * and 28).
 *
 * Rewritten for v2. What changed: the dash scan now covers `shared/`, `api/`, `db/` and
 * `public/sw.js` as well as the loaded content; the retired privacy promise is a banned
 * string; and R15.7 layer 2 lives here, so an advice violation fails the test suite and not
 * only the build.
 *
 * The tooltip term table is gone with the twenty seven v1 terms it named. Tooltip coverage is
 * now asserted from the content itself, in `content-tooltips.test.ts`, which cannot go stale
 * against a hand written list.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { S } from '../../src/content/strings';
import { LESSONS } from '../../src/content/lessons';
import { LEARN_ITEMS, LEARN_TRACKS, NOT_ADVICE_LINE } from '../../src/content/learn';
import { HOLDING_TYPES, LEDGER_WHAT_SUGGESTIONS } from '../../src/content/holdingTypes';
import { TOOLTIPS } from '../../src/content/tooltips';
import { ALLOWED_CAPS, BANNED_PHRASES, checkText } from '../../scripts/lint-advice';

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'function') {
    // Exercise the interpolations with sample values, so a template's fixed half is scanned.
    try {
      const fn = value as (...a: unknown[]) => unknown;
      for (const args of [[12345, 6789, 5, true], ['a place', 8], [360, 1260], ['deleted', true]]) {
        const r = fn(...args);
        if (typeof r === 'string') out.push(r);
      }
    } catch {
      /* a formatter that will not take these arguments is covered by its own screen's test */
    }
  } else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

const ALL = [
  ...collectStrings(S),
  ...LESSONS.flatMap((l) => [l.title, l.body, l.unlockHint]),
  ...LEARN_ITEMS.flatMap((i) => [i.title, i.body]),
  ...LEARN_TRACKS.flatMap((t) => [t.title, t.blurb]),
  ...HOLDING_TYPES.map((h) => h.label),
  ...LEDGER_WHAT_SUGGESTIONS,
  ...Object.values(TOOLTIPS).flatMap((t) => [t.label, t.definition]),
  NOT_ADVICE_LINE,
];

describe('copy rules', () => {
  it('has strings to check', () => {
    expect(ALL.length).toBeGreaterThan(200);
  });

  it('contains no em dash or en dash anywhere', () => {
    for (const s of ALL) {
      expect(s, s).not.toMatch(/—/);
      expect(s, s).not.toMatch(/–/);
    }
  });

  it('extends the dash scan to shared/, public/sw.js, and api/ and db/ when they exist', () => {
    // Same trees `lint:copy` walks, so a dash in a JSON content file or in the service worker
    // fails the suite and not only the build.
    const files = [
      'shared/content/learn.json',
      'shared/content/lessons.json',
      'shared/content/tooltips.json',
      'shared/content/merchants.json',
      'shared/content/holdingTypes.json',
      'public/sw.js',
    ];
    for (const f of files) {
      const text = readFileSync(resolve(process.cwd(), f), 'utf8');
      expect(text.includes('—'), `${f} has an em dash`).toBe(false);
      expect(text.includes('–'), `${f} has an en dash`).toBe(false);
    }
  });

  it('risk 4: the retired privacy promise appears nowhere', () => {
    // "Everything stays on this device" was easy to keep true until nudges gained a server.
    // A promise that is true for most people is not a promise, so the sentence is banned.
    const retired = 'everything stays on this device';
    for (const s of ALL) expect(s.toLowerCase(), s).not.toContain(retired);
    for (const f of ['shared/content/learn.json', 'shared/content/lessons.json', 'public/sw.js']) {
      expect(readFileSync(resolve(process.cwd(), f), 'utf8').toLowerCase()).not.toContain(retired);
    }
  });

  it('9.4: the standing privacy line is true in every state, and says what does leave', () => {
    expect(S.welcome.noPassword).toContain('No account, no password');
    expect(S.welcome.noPassword).toContain('stay on this device');
    // The one thing that does leave has its own panel, which names exactly three things.
    expect(S.nudges.explainerBody).toContain('three things get stored there');
    expect(S.nudges.explainerBody3).toContain('that row is deleted');
  });

  it('R4.7: no copy anywhere could read as disapproval of a non skip', () => {
    // A nudge left alone produces no copy at all, so this is looking for a string that should
    // not exist rather than checking one that does.
    const shame = [
      'you went anyway',
      'you did not skip',
      'missed',
      'you broke',
      'streak',
      'try harder',
      'should have',
      'wasted',
      'bad with money',
      'failed',
      'missed out',
      'behind.',
      'last chance',
      'don’t break',
      "don't break",
    ];
    for (const s of ALL) for (const b of shame) expect(s.toLowerCase(), `"${s}" contains "${b}"`).not.toContain(b);
  });

  it('R9.4: there is no streak, so no copy names one', () => {
    for (const s of ALL) {
      expect(s.toLowerCase(), s).not.toContain('in a row');
      expect(s.toLowerCase(), s).not.toContain('consecutive');
    }
  });

  it('R7.3 and 9.3: nothing states or implies what an investment is worth today', () => {
    for (const s of ALL) {
      const lower = s.toLowerCase();
      expect(lower, s).not.toContain('your portfolio');
      expect(lower, s).not.toContain('current value');
      expect(lower, s).not.toContain('total return');
      // "worth today" is allowed in exactly one construction: the line that says the app does
      // not know. Anything else claiming a value would be the fabricated number this pivot
      // exists to remove.
      if (lower.includes('worth today')) expect(lower, s).toContain('does not know what that is worth today');
    }
    expect(S.home.movedLine(1000)).toContain('does not know what that is worth today');
  });

  it('never phrases growth as a daily change', () => {
    for (const s of ALL) {
      expect(s.toLowerCase(), s).not.toContain('daily change');
      expect(s.toLowerCase(), s).not.toMatch(/per day/);
      expect(s.toLowerCase(), s).not.toMatch(/24[- ]hour/);
      expect(s.toLowerCase(), s).not.toMatch(/today's change/);
    }
  });

  it('lesson bodies only reference known tooltip keys', () => {
    for (const l of LESSONS) {
      for (const m of l.body.matchAll(/\[\[([a-zA-Z]+)/g)) {
        expect(TOOLTIPS[m[1] as keyof typeof TOOLTIPS], `${l.id} ${m[1]}`).toBeDefined();
      }
    }
  });
});

/**
 * R15.7 layer 2. The same assertions the lint makes, over the loaded content, so a violation
 * fails the test suite and not only the build. Layer 3 is the human review gate, and neither
 * of these two replaces it: "most people in your position end up in a broad index fund" passes
 * every automated check in this plan while being advice.
 */
describe('R15 education, not advice', () => {
  it('the lint and this suite share one banned phrase list, so they cannot drift', () => {
    expect(BANNED_PHRASES).toContain('we recommend');
    expect(BANNED_PHRASES).toContain('beat the market');
    expect(BANNED_PHRASES.length).toBeGreaterThanOrEqual(19);
  });

  it('R15.3: no copy contains a banned advice phrase', () => {
    for (const s of ALL) {
      for (const phrase of BANNED_PHRASES) expect(s.toLowerCase(), `"${s}"`).not.toContain(phrase);
    }
  });

  it('R15.1: no all capitals token outside the allowlist, which is the ticker ban', () => {
    const offenders: string[] = [];
    for (const s of ALL) {
      for (const m of s.matchAll(/\b[A-Z]{2,5}\b/g)) if (!ALLOWED_CAPS.has(m[0])) offenders.push(`${m[0]} in "${s}"`);
    }
    expect(offenders).toEqual([]);
  });

  it('R15.2: no percentage sits next to a return, gain, growth or profit claim', () => {
    const offenders: string[] = [];
    for (const s of ALL) {
      for (const p of checkText(s)) if (p.rule.startsWith('R15.2')) offenders.push(`${p.detail} in "${s}"`);
    }
    expect(offenders).toEqual([]);
  });

  it('R15.2: the only forward looking number is the summer projection, at its stated assumption', () => {
    expect(TOOLTIPS.sevenPercent.definition).toContain('assume');
    expect(S.summer.assumption.toLowerCase()).toMatch(/assum|7%/);
  });

  // Cycle 8 amendment (R15.6, 9.8a): the line is rewritten and its placement widens from
  // three surfaces to six. The two new SCREENS (a Learn item page, a lesson page) render the
  // same `S.learn.notAdvice` and `S.lessons.notAdvice` constants asserted here; that they
  // actually render them is checked statically by `lint:advice`'s placement rule and live by
  // `tests/e2e/learn.spec.ts`.
  it('R15.6: the standing statement is one sentence group, used verbatim on every surface', () => {
    expect(S.lessons.notAdvice).toBe(NOT_ADVICE_LINE);
    expect(S.learn.notAdvice).toBe(NOT_ADVICE_LINE);
    expect(S.settings.notAdvice).toBe(NOT_ADVICE_LINE);
    expect(S.invest.notAdvice).toBe(NOT_ADVICE_LINE);
    expect(NOT_ADVICE_LINE).toContain('not personal advice');
    expect(NOT_ADVICE_LINE).toContain('not licensed financial advisors');
    expect(NOT_ADVICE_LINE).toContain('nothing here is tailored to you');
  });

  it('R15.5: the ledger suggestion list is a list of words, never a shortlist to buy', () => {
    for (const w of LEDGER_WHAT_SUGGESTIONS) {
      expect(w.toLowerCase()).not.toContain('best');
      expect(w.toLowerCase()).not.toContain('recommended');
      // A category, never an instance. No brand, no fund name, and no ticker: an all capitals
      // token is only allowed if it is one of the plain English abbreviations on R15.7's list.
      for (const m of w.matchAll(/\b[A-Z]{2,5}\b/g)) expect(ALLOWED_CAPS.has(m[0]), `${m[0]} in "${w}"`).toBe(true);
    }
  });

  it('the lint is actually wired up: a deliberately offending string fails it', () => {
    // Criterion 28's proof. If this ever passes clean, the lint has been disconnected.
    expect(checkText('we recommend the total market fund').some((p) => p.rule.startsWith('R15.3'))).toBe(true);
    expect(checkText('a fund that returned 12% last year').some((p) => p.rule.startsWith('R15.2'))).toBe(true);
    expect(checkText('buy VTSAX today').some((p) => p.rule.startsWith('R15.1'))).toBe(true);
  });
});
