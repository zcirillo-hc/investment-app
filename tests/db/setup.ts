/**
 * Runs inside every worker. `test.env` carries `PUSH_DB_SCHEMA` across; the connection
 * string comes from `.env.local`, which is gitignored and never printed.
 */
import { loadEnvFile } from '../../scripts/load-env';

loadEnvFile();

if (!process.env.PUSH_DB_SCHEMA) {
  throw new Error('PUSH_DB_SCHEMA is not set. Run this suite through `npm run test:db`.');
}
