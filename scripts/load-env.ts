/**
 * Reads `.env.local` into `process.env` for scripts run outside the Vercel runtime, which is
 * `npm run db:migrate` and `npm run test:db`. Vercel Functions get their variables from the
 * platform and never call this.
 *
 * Existing values win, so `DATABASE_URL=... npm run test:db` still overrides the file.
 * Nothing here logs a value. `.env*` is gitignored and stays that way (plan 6.11).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadEnvFile(file = '.env.local'): string[] {
  const full = resolve(process.cwd(), file);
  if (!existsSync(full)) return [];
  const loaded: string[] = [];
  for (const raw of readFileSync(full, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const name = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[name] === undefined) {
      process.env[name] = value;
      loaded.push(name);
    }
  }
  return loaded;
}
