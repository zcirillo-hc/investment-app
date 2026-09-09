/**
 * Plan v2 11.3. Creates `test_<random>`, applies the migrations into it, and drops it again
 * in a teardown that runs on failure as well as on success.
 *
 * The migrations applied here are the same numbered SQL files that ship, applied by the same
 * `db/migrate.ts` that runs against production. A test schema built by any other means would
 * be testing a different table than the one users get.
 */
import { dropSchema, migrate } from '../../db/migrate';
import { loadEnvFile } from '../../scripts/load-env';
import { TEST_SCHEMA } from './schema-name';

export async function setup(): Promise<void> {
  loadEnvFile();
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    throw new Error('test:db needs DATABASE_URL. Run `vercel env pull` or check .env.local.');
  }
  await migrate({ schema: TEST_SCHEMA, log: () => {} });
  console.log(`test:db schema ${TEST_SCHEMA} created and migrated`);
}

export async function teardown(): Promise<void> {
  loadEnvFile();
  try {
    await dropSchema(TEST_SCHEMA);
    console.log(`test:db schema ${TEST_SCHEMA} dropped`);
  } catch (err) {
    // Loud, because a leaked schema is a real thing to go clean up by hand.
    console.error(`test:db FAILED TO DROP schema ${TEST_SCHEMA}: ${(err as Error).message}`);
    throw err;
  }
}
