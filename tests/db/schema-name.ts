/**
 * Plan v2 11.3. One isolated schema per `npm run test:db` run.
 *
 * The name is computed once, in the Vitest config, which then puts it in `test.env` so every
 * worker sees the same one. Nothing in this suite ever writes to `public`, so a stray run
 * cannot touch a live row.
 */
import { randomBytes } from 'node:crypto';

export const TEST_SCHEMA: string = process.env.PUSH_DB_SCHEMA ?? `test_${randomBytes(6).toString('hex')}`;
