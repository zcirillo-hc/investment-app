/**
 * Plan v2 6.7, migration approach. Numbered plain SQL files applied in filename order, each
 * wrapped in a transaction, each recorded in `schema_migrations`. No ORM, no migration
 * framework, no generated client. Idempotent and safe to run against production.
 *
 *   npm run db:migrate                    apply to the default schema
 *   npm run db:migrate -- --schema=test_x apply into an isolated schema (11.3)
 *   npm run db:migrate -- --list          print applied and pending ids, change nothing
 *
 * Connects on `DATABASE_URL_UNPOOLED` because this runs DDL and wants a direct connection.
 * It uses the WebSocket `Client` rather than the HTTP `neon()` the functions use, for one
 * concrete reason: the HTTP driver sends each statement as its own prepared statement, so it
 * can neither run a multi statement file nor hold a `search_path` across calls. Both are
 * requirements here.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from '@neondatabase/serverless';
import { loadEnvFile } from '../scripts/load-env';

export interface MigrationFile {
  id: string;
  file: string;
  sql: string;
}

const MIGRATIONS_DIR = resolve(process.cwd(), 'db/migrations');

/** `0001_push_subs.sql` has id `0001`, which is what `/api/health` reports (6.7). */
export function migrationId(file: string): string {
  const m = /^(\d+)_/.exec(file);
  if (!m) throw new Error(`migration filename must start with digits and an underscore: ${file}`);
  return m[1];
}

export function readMigrations(dir = MIGRATIONS_DIR): MigrationFile[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const seen = new Set<string>();
  return files.map((file) => {
    const id = migrationId(file);
    if (seen.has(id)) throw new Error(`two migrations share the id ${id}`);
    seen.add(id);
    return { id, file, sql: readFileSync(resolve(dir, file), 'utf8') };
  });
}

/** Only ever a name this repository generates or a tester passes on the command line. */
const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

export function assertIdentifier(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`not a usable schema name: ${name}`);
  return name;
}

export interface MigrateOptions {
  url?: string;
  schema?: string;
  listOnly?: boolean;
  log?: (line: string) => void;
}

export interface MigrateResult {
  applied: string[];
  alreadyApplied: string[];
  schema: string;
}

export async function migrate(options: MigrateOptions = {}): Promise<MigrateResult> {
  const log = options.log ?? ((line: string) => console.log(line));
  const url =
    options.url ??
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_UNPOOLED is not set (nor POSTGRES_URL_NON_POOLING, nor DATABASE_URL)');

  const schema = options.schema ? assertIdentifier(options.schema) : 'public';
  const migrations = readMigrations();
  const client = new Client(url);
  await client.connect();
  const applied: string[] = [];
  const alreadyApplied: string[] = [];
  try {
    if (schema !== 'public') await client.query(`create schema if not exists "${schema}"`);
    // Every statement below, and every statement inside every migration file, resolves
    // against this one schema. Nothing in this script writes an unqualified name anywhere
    // else, so a run with --schema cannot touch a live row.
    await client.query(`set search_path to "${schema}"`);

    const done = new Set<string>();
    const exists = await client.query<{ present: boolean }>(
      "select to_regclass(current_schema() || '.schema_migrations') is not null as present",
    );
    if (exists.rows[0]?.present) {
      const rows = await client.query<{ id: string }>('select id from schema_migrations');
      for (const r of rows.rows) done.add(r.id);
    }

    for (const m of migrations) {
      if (done.has(m.id)) {
        alreadyApplied.push(m.id);
        continue;
      }
      if (options.listOnly) continue;
      await client.query('begin');
      try {
        await client.query(m.sql);
        await client.query('insert into schema_migrations (id) values ($1)', [m.id]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw new Error(`migration ${m.file} failed: ${(err as Error).message}`);
      }
      applied.push(m.id);
      log(`applied ${m.file}`);
    }
  } finally {
    await client.end();
  }

  if (options.listOnly) {
    log(`schema ${schema}: applied [${alreadyApplied.join(', ')}], pending [${migrations.filter((m) => !alreadyApplied.includes(m.id)).map((m) => m.id).join(', ')}]`);
  } else if (applied.length === 0) {
    log(`schema ${schema}: nothing to do, ${alreadyApplied.length} migration(s) already applied`);
  } else {
    log(`schema ${schema}: applied ${applied.length} migration(s)`);
  }
  return { applied, alreadyApplied, schema };
}

/** Drops an isolated test schema. Refuses anything that is not obviously a test schema. */
export async function dropSchema(schema: string, url?: string): Promise<void> {
  assertIdentifier(schema);
  if (!schema.startsWith('test_')) throw new Error(`refusing to drop a schema not named test_*: ${schema}`);
  const target =
    url ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL;
  if (!target) throw new Error('DATABASE_URL_UNPOOLED is not set');
  const client = new Client(target);
  await client.connect();
  try {
    await client.query(`drop schema if exists "${schema}" cascade`);
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const args = process.argv.slice(2);
  const schemaArg = args.find((a) => a.startsWith('--schema='));
  await migrate({
    schema: schemaArg ? schemaArg.slice('--schema='.length) : undefined,
    listOnly: args.includes('--list'),
  });
}

// `tests/db/*` imports the functions above; only a direct run migrates anything.
if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  main().catch((err: Error) => {
    console.error(err.message);
    process.exit(1);
  });
}
