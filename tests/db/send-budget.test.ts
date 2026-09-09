/**
 * Test report V2-4. The batch ceiling and the duration ceiling have to stay consistent with
 * each other, and nothing enforced that: `limit 500` lived in `due.ts`, `maxDuration: 60`
 * lived in `vercel.json`, and the only thing connecting them was a sentence in the plan.
 *
 * This file is that connection, made mechanical. It fails if any of the four numbers moves
 * without the others moving with it, and it fails if `vercel.json` and the constant that
 * documents it drift apart. It is a pure arithmetic and configuration check, so it needs no
 * database, but it lives with the other backend tests because that is where the constants do.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ASSUMED_MS_PER_ROW,
  DUE_LIMIT,
  MAX_DURATION_SECONDS,
  SEND_BUDGET_MS,
  SEND_CONCURRENCY,
  runSend,
  type Db,
} from '../../api/_lib/due';

/** The margin the plan's number is stated against. Below this, the two ceilings disagree. */
const REQUIRED_MARGIN = 2;

describe('6.8 / 6.6: the batch ceiling and the function duration ceiling stay consistent', () => {
  it('a full DUE_LIMIT batch at the pessimistic per row cost fits inside the send budget', () => {
    const projectedMs = (DUE_LIMIT / SEND_CONCURRENCY) * ASSUMED_MS_PER_ROW;
    const margin = SEND_BUDGET_MS / projectedMs;
    // eslint-disable-next-line no-console
    console.log(
      `BUDGET: ${DUE_LIMIT} rows / ${SEND_CONCURRENCY} concurrent x ${ASSUMED_MS_PER_ROW} ms = ` +
        `${(projectedMs / 1000).toFixed(1)} s against a ${SEND_BUDGET_MS / 1000} s send budget ` +
        `(margin ${margin.toFixed(1)}x) inside maxDuration ${MAX_DURATION_SECONDS} s`,
    );
    expect(
      margin,
      `a full batch projects to ${(projectedMs / 1000).toFixed(1)} s against a ${SEND_BUDGET_MS / 1000} s budget. ` +
        `Raise SEND_CONCURRENCY, lower DUE_LIMIT, or restate the margin.`,
    ).toBeGreaterThanOrEqual(REQUIRED_MARGIN);
  });

  it('the send budget leaves room inside maxDuration for the housekeeping and a cold start', () => {
    expect(SEND_BUDGET_MS).toBeLessThan(MAX_DURATION_SECONDS * 1000);
    // At least a quarter of the function's life is not the send loop.
    expect(MAX_DURATION_SECONDS * 1000 - SEND_BUDGET_MS).toBeGreaterThanOrEqual(MAX_DURATION_SECONDS * 1000 * 0.25);
  });

  it('MAX_DURATION_SECONDS matches the maxDuration vercel.json actually deploys', () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
      functions?: Record<string, { maxDuration?: number }>;
    };
    // The glob that covers the cron function, whatever shape it is written in today
    // (`api/**/*.ts` right now, a named path if it is ever split out).
    const CRON_FILE = 'api/cron/send-nudges.ts';
    const matches = (glob: string): boolean => {
      const re = new RegExp(
        `^${glob
          .split('**')
          .map((part) => part.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*'))
          .join('.*')}$`,
      );
      return re.test(CRON_FILE);
    };
    const declared = Object.entries(config.functions ?? {}).filter(([key]) => matches(key));
    expect(declared.length, `vercel.json must declare a maxDuration covering ${CRON_FILE}`).toBeGreaterThan(0);
    for (const [key, value] of declared) {
      expect(value.maxDuration, `${key} in vercel.json`).toBe(MAX_DURATION_SECONDS);
    }
  });

  it('the send loop stops starting rows once the budget is spent, and says how many it left', async () => {
    // No database: `selectDue` is the only statement reached before the budget check, so a
    // stub that answers it is enough to prove the loop's own behaviour.
    const rows = Array.from({ length: 20 }, (_, i) => ({
      endpoint_hash: `h${i}`,
      endpoint: `https://example.test/${i}`,
      p256dh: 'p',
      auth: 'a',
      local_date: '2026-09-09',
    }));
    let statements = 0;
    const sql = {
      query: async (text: string) => {
        statements += 1;
        if (text.includes('select endpoint_hash')) return rows;
        return [];
      },
    } as unknown as Db;

    let clock = 0;
    const report = await runSend({
      sql,
      // Every send costs 10 ms of the fake clock, so the 50 ms budget is spent after five.
      sender: async () => {
        clock += 10;
        return { kind: 'ok' };
      },
      budgetMs: 50,
      concurrency: 1,
      now: () => clock,
    });

    // eslint-disable-next-line no-console
    console.log(`BUDGET STOP: due=${report.due} sent=${report.sent} unstarted=${report.unstarted} statements=${statements}`);
    expect(report.due).toBe(20);
    expect(report.unstarted, 'the rows the budget ran out before reaching are reported').toBeGreaterThan(0);
    expect(report.sent + report.unstarted).toBe(20);
  });
});
