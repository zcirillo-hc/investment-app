/**
 * Copy lint (plan v2 1.1 and criterion 16).
 *
 * Fails when any scanned file contains an em dash (U+2014) or an en dash (U+2013), or the
 * retired privacy promise.
 *
 * Scope grew with the pivot: it used to be `src/` alone, and it now also covers
 * `shared/**\/*.json` (content the app, the fixture and the lints all read),
 * `api/**\/*.ts` and `db/**\/*.{ts,sql}` (written by the backend pass; absent trees are
 * skipped, not an error) and `public/sw.js` (the service worker composes notification text,
 * so its strings are UI copy like any other).
 *
 * The banned sentence is risk 4 in the plan. "No password. Everything stays on this device."
 * was easy to keep true until nudges gained a server. A promise that is true for most people
 * is not a promise, so the old sentence is deleted from the product and banned here, because
 * no test will catch a sentence nobody thought to look for.
 *
 * Usage:
 *   tsx scripts/lint-copy.ts            scans the trees above
 *   tsx scripts/lint-copy.ts path ...   scans only the given files
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BANNED_CHARS: Array<{ char: string; name: string }> = [
  { char: '—', name: 'em dash (U+2014)' },
  { char: '–', name: 'en dash (U+2013)' },
];

/** Matched case insensitively, so a re-typed variant is caught too. */
const BANNED_STRINGS: Array<{ text: string; why: string }> = [
  {
    text: 'everything stays on this device',
    why: 'the retired privacy promise (plan 9.4, risk 4). Use the standing line in 9.4 instead.',
  },
];

interface Tree {
  dir: string;
  match: RegExp;
}

const TREES: Tree[] = [
  { dir: 'src', match: /\.(ts|tsx)$/ },
  { dir: 'shared', match: /\.json$/ },
  { dir: 'api', match: /\.ts$/ },
  { dir: 'db', match: /\.(ts|sql)$/ },
];

/** Individual files outside any tree above. */
const EXTRA_FILES = ['public/sw.js'];

function walk(dir: string, match: RegExp, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, match, out);
    else if (match.test(entry)) out.push(full);
  }
}

const args = process.argv.slice(2);
const files: string[] = [];
if (args.length > 0) {
  for (const a of args) files.push(resolve(a));
} else {
  for (const tree of TREES) {
    const dir = resolve(process.cwd(), tree.dir);
    // `api/` and `db/` arrive with the backend pass. An absent tree is not a failure.
    if (existsSync(dir)) walk(dir, tree.match, files);
  }
  for (const f of EXTRA_FILES) {
    const full = resolve(process.cwd(), f);
    if (existsSync(full)) files.push(full);
  }
}

let problems = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const b of BANNED_CHARS) {
      if (line.includes(b.char)) {
        problems += 1;
        console.error(`${file}:${i + 1}: ${b.name}: ${line.trim()}`);
      }
    }
    const lower = line.toLowerCase();
    for (const b of BANNED_STRINGS) {
      if (lower.includes(b.text)) {
        problems += 1;
        console.error(`${file}:${i + 1}: banned string "${b.text}": ${b.why}`);
      }
    }
  });
}

if (problems > 0) {
  console.error(`lint:copy failed with ${problems} problem(s).`);
  process.exit(1);
}
console.log(`lint:copy ok (${files.length} files scanned).`);

export { BANNED_CHARS, BANNED_STRINGS };
