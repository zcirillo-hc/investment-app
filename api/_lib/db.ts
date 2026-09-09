/**
 * Plan v2 6.7. Lazy initialisation, no Proxy wrapper.
 *
 * `getDb()` is called INSIDE a handler, never at module scope, so importing this module
 * during a build or a type check does not require the variable to exist.
 */
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let cached: NeonQueryFunction<false, false> | null = null;

export function getDb(): NeonQueryFunction<false, false> {
  if (cached) return cached;
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  cached = neon(url);
  return cached;
}

/** Test only. The integration suite points at an isolated schema between files. */
export function resetDb(): void {
  cached = null;
}

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * Every query in `api/` names its tables through this function.
 *
 * Plan 11.3 wants the integration suite to run in a schema `test_<random>` with the
 * `search_path` pointed at it, so a stray run cannot touch a live row. The Neon HTTP driver
 * the functions use sends each query as its own request, so a `set search_path` does not
 * survive to the next call and the plan's mechanism cannot work literally. Qualifying the
 * name here is the same isolation by the only means the driver allows, and it keeps ONE copy
 * of the shipped SQL, which is what 11.3 actually cares about.
 *
 * `PUSH_DB_SCHEMA` is unset in Production, Preview and Development. It exists for the test
 * runner and is validated as an identifier before it can reach a query.
 */
export function table(name: 'push_subs' | 'schema_migrations'): string {
  const schema = process.env.PUSH_DB_SCHEMA;
  if (schema === undefined || schema === '') return name;
  if (!IDENTIFIER.test(schema)) throw new Error('PUSH_DB_SCHEMA is not a usable schema name');
  return `"${schema}".${name}`;
}
