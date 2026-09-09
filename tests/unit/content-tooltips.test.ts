/**
 * Plan v2 9.8b and criterion 28.
 *
 * Every `[[term]]` marker appearing in `learn.json` and `lessons.json` has an entry in
 * `tooltips.json`, and every tooltip entry is referenced by at least one piece of content.
 *
 * The second half is the one that actually decays. Terms get deleted with a feature and the
 * tooltip stays behind; or a term gets renamed and the marker silently renders as plain text,
 * which looks fine and quietly breaks the rule that every financial term has a tooltip.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import learn from '../../shared/content/learn.json';
import lessons from '../../shared/content/lessons.json';
import tooltips from '../../shared/content/tooltips.json';
import { LEARN_ITEMS, LEARN_TOTAL, LEARN_TRACKS, NOT_ADVICE_LINE } from '../../src/content/learn';

const MARK = /\[\[([a-zA-Z]+)(?:\|([^\]]+))?\]\]/g;
const TOOLTIP_KEYS = Object.keys(tooltips.tooltips);

/**
 * Only the fields that are actually shown to somebody. The `note` field in each JSON file is
 * documentation for whoever opens it next, and it contains both a literal `[[key]]` example
 * and the word "locked" while explaining that nothing is locked. Scanning the raw file would
 * make both of those into failures, which would train the next person to loosen the test
 * rather than fix the content.
 */
const LEARN_TEXT = [learn.standingLine, ...learn.tracks.map((t) => `${t.title} ${t.blurb}`), ...learn.items.map((i) => `${i.title} ${i.body}`)].join('\n');
const LESSON_TEXT = lessons.lessons.map((l) => `${l.title} ${l.body} ${l.unlockHint}`).join('\n');
/**
 * Comments stripped for the same reason: the file's own header documents the marker syntax
 * with a literal `[[key]]`, which is an explanation and not a term anybody sees.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const STRINGS = withoutComments(readFileSync(resolve(process.cwd(), 'src/content/strings.ts'), 'utf8'));
const CONTENT_TEXT = [LEARN_TEXT, LESSON_TEXT, STRINGS].join('\n');

function markersIn(text: string): string[] {
  return [...text.matchAll(MARK)].map((m) => m[1]);
}

describe('every marker resolves to a tooltip', () => {
  it('in learn.json', () => {
    const unknown = [...new Set(markersIn(LEARN_TEXT))].filter((k) => !TOOLTIP_KEYS.includes(k));
    expect(unknown).toEqual([]);
  });

  it('in lessons.json', () => {
    const unknown = [...new Set(markersIn(LESSON_TEXT))].filter((k) => !TOOLTIP_KEYS.includes(k));
    expect(unknown).toEqual([]);
  });

  it('in strings.ts', () => {
    const unknown = [...new Set(markersIn(STRINGS))].filter((k) => !TOOLTIP_KEYS.includes(k));
    expect(unknown).toEqual([]);
  });
});

describe('every tooltip is used', () => {
  it('has no orphan left behind by a deleted feature', () => {
    const used = new Set(markersIn(CONTENT_TEXT));
    const orphans = TOOLTIP_KEYS.filter((k) => !used.has(k));
    expect(orphans).toEqual([]);
  });
});

describe('9.8b the restored and new terms are all present', () => {
  const restored = ['stock', 'bond', 'etf', 'indexFund'];
  const added = [
    'brokerage',
    'taxableAccount',
    'ira',
    'fourOhOneK',
    'expenseRatio',
    'dollarCostAveraging',
    'bondMarket',
    'commodity',
    'volatility',
    'feeOnly',
    'ticker',
  ];

  it('restores the four the v2 draft had deleted', () => {
    for (const k of restored) expect(TOOLTIP_KEYS, k).toContain(k);
  });

  it('adds the eleven the library needs', () => {
    for (const k of added) expect(TOOLTIP_KEYS, k).toContain(k);
  });

  it('keeps the six v1 terms the plan says survive', () => {
    for (const k of ['roundUp', 'catch', 'jar', 'dip', 'sevenPercent', 'contributions']) expect(TOOLTIP_KEYS, k).toContain(k);
  });

  it('does not bring back a term that left with the simulated portfolio', () => {
    const deleted = [
      'realEstateFund',
      'cashLike',
      'usStocks',
      'worldStocks',
      'fractionalShare',
      'closingPrice',
      'holdings',
      'growthSinceStart',
      'expectedRange',
      'badYears',
      'riskProfile',
      'diversified',
      'allocation',
      'fee',
      'threshold',
      'portfolio',
      'sweep',
    ];
    for (const k of deleted) expect(TOOLTIP_KEYS, k).not.toContain(k);
  });

  it('gives every entry a label and a one sentence definition', () => {
    for (const [key, entry] of Object.entries(tooltips.tooltips)) {
      expect(entry.label.length, key).toBeGreaterThan(0);
      expect(entry.definition.length, key).toBeGreaterThan(10);
    }
  });
});

describe('8.9 the library itself', () => {
  it('has exactly sixteen pieces across three tracks', () => {
    expect(LEARN_TOTAL).toBe(16);
    expect(LEARN_TRACKS).toHaveLength(3);
  });

  it('splits them six, six and four, as the plan says', () => {
    const count = (track: string) => LEARN_ITEMS.filter((i) => i.track === track).length;
    expect(count('getting-started')).toBe(6);
    expect(count('markets')).toBe(6);
    expect(count('staying-sane')).toBe(4);
  });

  it('gives every piece a unique id and a track that exists', () => {
    const ids = LEARN_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const tracks = new Set(LEARN_TRACKS.map((t) => t.key));
    for (const i of LEARN_ITEMS) expect(tracks.has(i.track), i.id).toBe(true);
  });

  it('R12.5: carries no unlock condition of any kind in its data', () => {
    // The fields, not the note. A piece is `{ id, track, title, body }` and there is nowhere
    // for a condition to live.
    for (const item of learn.items) {
      expect(Object.keys(item).sort(), item.id).toEqual(['body', 'id', 'title', 'track']);
    }
    const raw = JSON.stringify(learn.items).toLowerCase();
    for (const banned of ['unlock', 'locked', 'requires', 'afterday', 'minday']) {
      expect(raw, banned).not.toContain(banned);
    }
  });

  it('9.8a: the standing line is one sentence group and lives in the content, not in a screen', () => {
    expect(NOT_ADVICE_LINE).toBe(learn.standingLine);
    expect(NOT_ADVICE_LINE).toContain('education, not advice');
  });
});
