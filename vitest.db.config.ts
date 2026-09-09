/**
 * Plan v2 11.3. The integration project: real Neon, real SQL, an isolated schema per run.
 *
 * Separate from `vitest.config.ts` on purpose. `npm test` must stay runnable with no database
 * and no network; `npm run test:db` is the suite that needs both.
 */
import { defineConfig } from 'vitest/config';
import { TEST_SCHEMA } from './tests/db/schema-name';

// Also set here so `globalSetup`, which runs in the main process, migrates into the same
// schema the workers will read.
process.env.PUSH_DB_SCHEMA = TEST_SCHEMA;

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    globalSetup: ['tests/db/global-setup.ts'],
    setupFiles: ['tests/db/setup.ts'],
    env: { PUSH_DB_SCHEMA: TEST_SCHEMA },
    // One schema, shared by every file. Two files mutating `push_subs` at once would make
    // every count assertion a race, and these cases are cheap enough not to need the
    // parallelism.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
