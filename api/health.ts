/**
 * Plan v2 6.6 and 6.7. `GET /api/health` reports the highest applied migration id, so a
 * deploy that forgot the migration is visible in one request rather than in a 500 at 07:40.
 *
 * Criterion 19 asserts this route returns HTTP 200 with `content-type: application/json`,
 * which is the proof that the SPA rewrite no longer swallows `/api`. It therefore answers
 * 200 with JSON even when the database is unreachable: a 500 here would still pass the
 * routing check, but it would tell a reader nothing about which of the two things broke.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, table } from './_lib/db.js';
import { methodOnly, sendJson } from './_lib/validate.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!methodOnly(req, res, 'GET')) return;

  let migration: string | null = null;
  let db = false;
  try {
    const sql = getDb();
    const rows = (await sql.query(`select max(id) as id from ${table('schema_migrations')}`)) as unknown as Array<{
      id: string | null;
    }>;
    db = true;
    migration = rows[0]?.id ?? null;
  } catch {
    // Deliberately not logged with its message: a connection error can carry the host and
    // the role out of the connection string (6.6).
    db = false;
  }

  sendJson(res, 200, { ok: db && migration !== null, db, migration });
}
