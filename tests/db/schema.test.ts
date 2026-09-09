/**
 * Plan v2 11.3 and criterion 21, the privacy half.
 *
 * The important test in this file is the column list. 6.9 promises that place names,
 * merchant names, coordinates, amounts, estimates, the jar balance, the ledger, counters,
 * lesson progress, the user's name, age, fear answer, summer figures and events NEVER leave
 * the device. The mechanism behind that promise is that there is nowhere on the server to
 * put them. Listing the columns turns that from a promise into an assertion that fails the
 * moment somebody adds a place id "just for debugging".
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from './helpers';
import { TEST_SCHEMA } from './schema-name';

/** 6.7, in order. Any addition here is a plan revision and a rewrite of 9.4, not a migration. */
const EXPECTED_COLUMNS = [
  'endpoint_hash',
  'endpoint',
  'p256dh',
  'auth',
  'tz',
  'nudge_local_date',
  'nudge_local_minute',
  'last_sent_local_date',
  'enabled',
  'fail_count',
  'created_at',
  'updated_at',
];

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

let columns: ColumnRow[] = [];

beforeAll(async () => {
  columns = (await db().query(
    `select column_name, data_type, is_nullable
       from information_schema.columns
      where table_schema = $1 and table_name = 'push_subs'
      order by ordinal_position`,
    [TEST_SCHEMA],
  )) as unknown as ColumnRow[];
});

describe('6.7 the push_subs table as migrated', () => {
  it('exists in the isolated test schema', () => {
    expect(columns.length).toBeGreaterThan(0);
  });

  it('has exactly the twelve columns the plan specifies, in order', () => {
    expect(columns.map((c) => c.column_name)).toEqual(EXPECTED_COLUMNS);
  });

  it('has no column for a place, a name, an amount, a jar figure or an IP address', () => {
    // Criterion 21, stated as the grep a reviewer would run by hand.
    const banned = /place|merchant|name|amount|cent|jar|ledger|ip|addr|lat|lon|lng|coord|geo|email|user_agent|agent/i;
    const offenders = columns
      .map((c) => c.column_name)
      // `endpoint*` is the push URL, `endpoint_hash` its sha256, and neither is a name in
      // the sense above. They are named explicitly so the regex cannot be quietly widened.
      .filter((n) => n !== 'endpoint' && n !== 'endpoint_hash')
      .filter((n) => banned.test(n));
    expect(offenders).toEqual([]);
  });

  it('keys on a 64 character endpoint hash and requires the five identity columns', () => {
    const byName = new Map(columns.map((c) => [c.column_name, c]));
    expect(byName.get('endpoint_hash')?.data_type).toBe('character');
    for (const required of ['endpoint_hash', 'endpoint', 'p256dh', 'auth', 'tz', 'enabled', 'fail_count']) {
      expect(byName.get(required)?.is_nullable, required).toBe('NO');
    }
    for (const optional of ['nudge_local_date', 'nudge_local_minute', 'last_sent_local_date']) {
      expect(byName.get(optional)?.is_nullable, optional).toBe('YES');
    }
  });

  it('enforces the 0..1439 minute range in the database, not only in the route', async () => {
    await expect(
      db().query(
        `insert into "${TEST_SCHEMA}".push_subs (endpoint_hash, endpoint, p256dh, auth, tz, nudge_local_minute)
         values ($1, 'https://example.com/x', 'p', 'a', 'UTC', 1440)`,
        ['f'.repeat(64)],
      ),
    ).rejects.toThrow();
  });

  it('records the migration id /api/health reports', async () => {
    const rows = (await db().query(`select id from "${TEST_SCHEMA}".schema_migrations order by id`)) as unknown as Array<{
      id: string;
    }>;
    expect(rows.map((r) => r.id)).toEqual(['0001']);
  });

  it('carries the due index and the stale index', async () => {
    const rows = (await db().query(`select indexname from pg_indexes where schemaname = $1 and tablename = 'push_subs'`, [
      TEST_SCHEMA,
    ])) as unknown as Array<{ indexname: string }>;
    const names = rows.map((r) => r.indexname).sort();
    expect(names).toContain('push_subs_due_idx');
    expect(names).toContain('push_subs_stale_idx');
  });
});
