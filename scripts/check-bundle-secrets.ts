/**
 * Plan v2 6.11, risk 6, criterion 18. The third of the three guards.
 *
 * Vite's `VITE_` prefix rule is the first, `tests/unit/import-boundary.test.ts` is the
 * second, and this is the third: after a build, grep every file in `dist/` for the LITERAL
 * VALUES of `VAPID_PRIVATE_KEY` and `CRON_SECRET`, and fail if either appears.
 *
 * `VAPID_PRIVATE_KEY` in `dist/` means anyone can send notifications to every subscriber;
 * `CRON_SECRET` means anyone can drain the send loop. Neither value is ever printed by this
 * script, including in its failure message, which names only the variable and the file.
 *
 * A value this process cannot see is reported as skipped rather than passed, because a check
 * that silently degrades to a no-op is worse than no check.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadEnvFile } from './load-env';

const SECRET_NAMES = ['VAPID_PRIVATE_KEY', 'CRON_SECRET'] as const;
const MIN_LENGTH = 8;

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
}

function main(): void {
  loadEnvFile();

  const dist = resolve(process.cwd(), 'dist');
  if (!existsSync(dist)) {
    console.error('check-bundle-secrets: dist/ does not exist. Run this after a build.');
    process.exit(1);
  }

  const known: Array<{ name: string; value: string }> = [];
  const skipped: string[] = [];
  for (const name of SECRET_NAMES) {
    const value = process.env[name];
    if (value && value.length >= MIN_LENGTH) known.push({ name, value });
    else skipped.push(name);
  }

  const files: string[] = [];
  walk(dist, files);

  let problems = 0;
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const secret of known) {
      if (text.includes(secret.value)) {
        problems += 1;
        console.error(`${file}: contains the value of ${secret.name}`);
      }
    }
  }

  if (problems > 0) {
    console.error(`check-bundle-secrets FAILED with ${problems} leak(s).`);
    process.exit(1);
  }

  const checked = known.map((s) => s.name).join(', ') || 'nothing';
  console.log(`check-bundle-secrets ok (${files.length} files in dist/, checked: ${checked}).`);
  if (skipped.length > 0) {
    console.log(`check-bundle-secrets: SKIPPED (value not in this environment): ${skipped.join(', ')}.`);
  }
}

main();
