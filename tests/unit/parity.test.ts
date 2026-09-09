/**
 * Plan v2 section 7.4. The rule fixture runner.
 *
 * The name is kept from v1, when this compared two language implementations. There is one
 * implementation now, so this is a fixture rather than a contract between platforms, and the
 * plan is explicit that it should not pretend otherwise. It still earns its place: it is a
 * regression guard on a feed whose seed determines every downstream number, and it makes a
 * rule change visible as a data diff rather than buried in a refactor.
 */
import { describe, expect, it } from 'vitest';
import fixture from '../../shared/fixtures/rules-v2.json';
import ruleIndex from '../../shared/fixtures/rule-index.json';
import { RULE_FNS } from './ruleFns';

interface Case {
  id: string;
  rule: string;
  fn: string;
  in: Record<string, unknown>;
  out: Record<string, unknown>;
  captured?: boolean;
}

const cases = fixture.cases as unknown as Case[];

describe('rule fixture', () => {
  it('has as many cases as it claims', () => {
    // A truncated or partially merged file must fail loudly instead of silently testing less.
    expect(cases.length).toBe(fixture.caseCount);
  });

  it('meets the section 7.3 coverage floor, per category', () => {
    const n = (...rules: string[]) => cases.filter((c) => rules.includes(c.rule)).length;
    expect(n('R2.0')).toBeGreaterThanOrEqual(8);
    expect(n('R2.1')).toBeGreaterThanOrEqual(6);
    expect(n('R2.4')).toBeGreaterThanOrEqual(8);
    expect(n('R3.2', 'R3.3', 'R3.4', 'R3.5')).toBeGreaterThanOrEqual(12);
    expect(n('R4.2', 'R4.3', 'R4.4')).toBeGreaterThanOrEqual(12);
    expect(n('R5.1', 'R5.2')).toBeGreaterThanOrEqual(10);
    expect(n('R6.3', 'R6.5', 'R6.6')).toBeGreaterThanOrEqual(6);
    expect(n('R7.1', 'R7.2', 'R7.5')).toBeGreaterThanOrEqual(8);
    expect(n('R8.1', 'R8.2')).toBeGreaterThanOrEqual(6);
    expect(n('R10.1', 'R10.2')).toBeGreaterThanOrEqual(6);
    expect(n('R13')).toBeGreaterThanOrEqual(8);
    expect(n('R14.2')).toBeGreaterThanOrEqual(6);
    // "Grow it, never shrink it."
    expect(cases.length).toBeGreaterThanOrEqual(102);
  });

  it('covers every arithmetic rule id in section 4', () => {
    const covered = new Set(cases.map((c) => c.rule));
    const missing = ruleIndex.arithmetic.filter((r) => !covered.has(r));
    expect(missing).toEqual([]);
  });

  it('has a dispatcher entry for every fn it names', () => {
    // A `fn` present in the file with no dispatcher entry is a failure, not a skip.
    const missing = [...new Set(cases.map((c) => c.fn))].filter((fn) => typeof RULE_FNS[fn] !== 'function');
    expect(missing).toEqual([]);
  });

  it('contains only integers, so JSON parsing cannot introduce a representation difference', () => {
    const walk = (v: unknown, path: string): void => {
      if (typeof v === 'number') expect(Number.isInteger(v), `${path} = ${v} is not an integer`).toBe(true);
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    for (const c of cases) {
      // The one exception, and it is the rule's own subject: R1.2 defines how a fractional
      // value is rounded, so its INPUT cannot be an integer without testing nothing. The
      // values used (440.5, 440.4) are the half case and its neighbour. Every output stays
      // integer, which is the constraint R1.1 actually cares about: money in state, in
      // events, in the ledger and in exports.
      if (c.rule !== 'R1.2') walk(c.in, `${c.id}.in`);
      walk(c.out, `${c.id}.out`);
    }
  });

  it('has unique case ids', () => {
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const c of cases) {
    it(`${c.id} (${c.rule}, ${c.fn})`, () => {
      expect(RULE_FNS[c.fn](c.in)).toEqual(c.out);
    });
  }

  it('prints its own summary', () => {
    const rules = new Set(cases.map((c) => c.rule));
    const captured = cases.filter((c) => c.captured).length;
    console.log(`rules: ${cases.length} cases, ${rules.size} rules (${cases.length - captured} specified, ${captured} captured)`);
    expect(rules.size).toBeGreaterThan(0);
  });
});
