/**
 * Plan v2 R15.7 and criterion 28, cycle 8 amendment.
 *
 * Two things are proved here, and the second is the one that matters.
 *
 *   1. The strengthened lint fails on the ORIGINAL, unmodified L7 text. That text passed
 *      `lint:copy` and `lint:advice` and shipped, and the tester found it by reading (V2-7).
 *      The fixture is the shipped words, byte for byte, and it is kept in `tests/fixtures/`
 *      because that is the one tree neither lint walks: a fixture, not a violation.
 *
 *   2. Relaxing R15 did not relax anything that was already being caught. The old banned
 *      phrase list, the ticker rule and the percentage rule are re-asserted alongside the new
 *      pattern, and the sentences R15's first list now ALLOWS are asserted to pass, because a
 *      lint that fails on "money invested earlier has more time to grow" would push the next
 *      author into writing something vaguer and less honest instead.
 *
 * Layer 3, the human read-through, is not this file and cannot be. `checkText` is a regex.
 * "Most people in your position end up in a broad index fund" passes every case below and is
 * a personalised recommendation.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkText } from '../../scripts/lint-advice';
import { LESSON_BY_ID } from '../../src/content/lessons';
import { NOT_ADVICE_LINE } from '../../src/content/learn';

const originalL7 = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/original-l7.json'), 'utf8')) as {
  title: string;
  body: string;
};

const problemsIn = (text: string) => checkText(text).map((p) => `${p.rule}: ${p.detail}`);

describe('R15.7: the regression fixture holding the original L7', () => {
  it('the fixture is the shipped text, not the replacement', () => {
    expect(originalL7.title).toBe('Why $20 a week beats $500 later');
    expect(originalL7.body).toContain('Twenty dollars a week is about $1,000 a year.');
  });

  it('the strengthened lint fails on the original L7 title', () => {
    const found = problemsIn(originalL7.title);
    // eslint-disable-next-line no-console
    console.log(`ORIGINAL L7 TITLE -> ${found.join(' | ')}`);
    expect(found.length, 'the original L7 title must not pass the lint').toBeGreaterThan(0);
    expect(found.some((f) => f.startsWith('R15.3/R15.5'))).toBe(true);
  });

  it('the strengthened lint fails on the original L7 title and body together', () => {
    expect(problemsIn(`${originalL7.title} ${originalL7.body}`).length).toBeGreaterThan(0);
  });

  it('the shipped L7 that replaced it passes', () => {
    const l7 = LESSON_BY_ID.L7;
    expect(l7.title).toBe('Why early money has more time to grow');
    expect(problemsIn(`${l7.title} ${l7.body}`)).toEqual([]);
  });
});

describe('R15.7: the new comparison pattern, at its edges', () => {
  const fails = [
    'Why $20 a week beats $500 later',
    '$50 a month rather than $600 at the end of the year',
    'Putting in 100 now wins over 1000 in ten years',
    'Twenty dollars a week beats five hundred later',
    'Starting with $500 is better than starting with $20',
  ];
  for (const text of fails) {
    it(`fails: ${text}`, () => {
      expect(problemsIn(text).some((f) => f.startsWith('R15.3/R15.5')), text).toBe(true);
    });
  }

  /** R15's new first list. A lint that fails on these would make the relaxation pointless. */
  const passes = [
    'Money invested earlier has more time to grow.',
    'Most brokerages have no minimum now.',
    'Opening an account usually needs your ID and a bank link.',
    'Spreading money across many companies lowers the risk that any one of them sinks you.',
    'Most people start with a broad fund rather than picking companies.',
    'Starting small and starting now is worth doing.',
  ];
  for (const text of passes) {
    it(`passes: ${text}`, () => {
      expect(problemsIn(text), text).toEqual([]);
    });
  }

  it('a number in one sentence and a comparison in the next is prose, not a recommendation', () => {
    expect(problemsIn('A fund might hold 500 companies. Some people prefer that to picking one.')).toEqual([]);
  });
});

describe('R15.7: the pre-existing rules still fire after the relaxation', () => {
  const stillFails: Array<[string, string]> = [
    ['you should open an account today', 'R15.3'],
    ['we recommend a broad fund', 'R15.3'],
    ['returns are guaranteed', 'R15.3'],
    ['this is risk free', 'R15.3'],
    ['it will grow', 'R15.3'],
    ['the best etf for beginners', 'R15.3'],
    ['NVDA is up again', 'R15.1'],
    ['returns of 12% growth a year', 'R15.2'],
  ];
  for (const [text, rule] of stillFails) {
    it(`still fails (${rule}): ${text}`, () => {
      expect(problemsIn(text).some((f) => f.startsWith(rule)), text).toBe(true);
    });
  }
});

describe('9.8a: the disclosure itself', () => {
  it('is the exact sentence the amendment specifies', () => {
    expect(NOT_ADVICE_LINE).toBe(
      'This is general information, not personal advice. We are not licensed financial advisors, and nothing here is tailored to you or your money.',
    );
  });

  it('passes its own lint', () => {
    expect(problemsIn(NOT_ADVICE_LINE)).toEqual([]);
  });
});
