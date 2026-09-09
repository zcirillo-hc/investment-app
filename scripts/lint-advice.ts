/**
 * The education not advice lint (plan v2 R15.7 layer 1, criteria 16 and 28).
 *
 * Scans `src/content/**`, `shared/content/**` and string literals under `src/**`, and fails on:
 *
 *   1. a banned advice phrase (R15.3, R15.2, R15.5);
 *   2. any all capitals token of 2 to 5 letters that is not in the allowlist below (R15.1, the
 *      ticker ban);
 *   3. any percentage adjacent to the words return, gain, growth or profit (R15.2).
 *
 * **This lint is necessary and not sufficient, and the plan says so.** It is a regex. "Most
 * people in your position end up in a broad index fund" contains no banned phrase and is
 * advice. R15.7 therefore names two more layers: the same assertions in
 * `tests/unit/copy.test.ts`, and a human review gate where the manager reads all sixteen Learn
 * pieces, all eight lessons and every tooltip against R15 before the cycle closes. Treat a
 * pass here as carelessness ruled out, not intent.
 *
 * Every addition to ALLOWED_CAPS is a reviewed change (R15.7).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** R15.7's list, verbatim. */
export const BANNED_PHRASES = [
  'you should',
  'we recommend',
  'recommended for you',
  'best fund',
  'best stock',
  'best etf',
  'best investment',
  'guaranteed',
  'risk free',
  "can't lose",
  'beat the market',
  'outperform',
  'our pick',
  'top pick',
  'will grow',
  'will return',
  'will make you',
  'buy now',
  'you need to buy',
];

/**
 * R15.7's small explicit allowlist, plus the tokens a TypeScript source file legitimately
 * contains that are not prose at all. The first group is the plan's; the second is code
 * vocabulary that appears inside string literals (identifiers, HTTP and date formats) and
 * names no security. Each addition below the plan's line is a reviewed change.
 */
export const ALLOWED_CAPS = new Set([
  // Plan R15.7, verbatim.
  'ETF',
  'IRA',
  'USD',
  'FDIC',
  'SIPC',
  'UK',
  'US',
  'PWA',
  // Code vocabulary, not prose. None of these names a security.
  'JSON',
  'HTML',
  'CSS',
  'URL',
  'URI',
  'API',
  'HTTP',
  'GET',
  'POST',
  'UTC',
  'IANA',
  'DB',
  'ID',
  'IDB',
  'UI',
  'SVG',
  'PNG',
  'OK',
  'AM',
  'PM',
  'SHA',
  'CDP',
  'VAPID',
  'YYYY',
  'MM',
  'DD',
]);

// `returned` and `gained` are the forms a claim actually gets written in, so the alternation
// covers the past tense as well as the noun.
const RETURN_WORD = '(?:returns?|returned|gains?|gained|growth|grew|profits?|profited)';
const PERCENT_RE = '(?:\\d+(?:\\.\\d+)?\\s*(?:%|percent))';
const PERCENT_NEAR = new RegExp(`${PERCENT_RE}[^.]{0,40}\\b${RETURN_WORD}\\b|\\b${RETURN_WORD}\\b[^.]{0,40}${PERCENT_RE}`, 'i');
const CAPS_TOKEN = /\b[A-Z]{2,5}\b/g;

interface Problem {
  file: string;
  line: number;
  rule: string;
  detail: string;
}

const problems: Problem[] = [];

function walk(dir: string, match: RegExp, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, match, out);
    else if (match.test(entry)) out.push(full);
  }
}

/**
 * Only string literals are prose. Scanning whole TypeScript files would flag every identifier,
 * which would make the caps rule unusable and train people to ignore it.
 *
 * Two things are skipped for the same reason, and both were real false positives on the first
 * run: comments (a plan quotation in a comment is documentation, not UI copy, and a comment
 * containing a backtick would otherwise be read as a template literal) and `${...}`
 * interpolations inside a template literal (`${SIDE * 2}` is an expression, not a sentence).
 *
 * A small hand written scanner rather than a regex, because a regex cannot tell a quote
 * inside a comment from a quote that opens a string.
 */
function stringLiteralsOf(source: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  let i = 0;
  let line = 1;
  const n = source.length;
  const push = (text: string, at: number): void => {
    if (text.trim().length > 0) out.push({ text, line: at });
  };
  while (i < n) {
    const c = source[i];
    if (c === '\n') {
      line += 1;
      i += 1;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') line += 1;
        i += 1;
      }
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      const startLine = line;
      let text = '';
      let depth = 0;
      i += 1;
      while (i < n) {
        const d = source[i];
        if (d === '\\') {
          text += source[i + 1] ?? '';
          i += 2;
          continue;
        }
        if (d === '\n') {
          line += 1;
          if (quote !== '`') break; // an unterminated quote: give up on this literal
        }
        if (quote === '`' && d === '$' && source[i + 1] === '{') {
          // Skip the interpolated expression, tracking nesting so a nested object literal
          // does not close it early.
          depth = 1;
          i += 2;
          while (i < n && depth > 0) {
            if (source[i] === '{') depth += 1;
            else if (source[i] === '}') depth -= 1;
            else if (source[i] === '\n') line += 1;
            i += 1;
          }
          continue;
        }
        if (d === quote) {
          i += 1;
          break;
        }
        text += d;
        i += 1;
      }
      push(text, startLine);
      continue;
    }
    i += 1;
  }
  return out;
}

/** JSON content is prose end to end, so every string value in it is checked. */
function jsonStringsOf(source: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  for (const m of source.matchAll(re)) {
    if (m[1].length === 0) continue;
    out.push({ text: m[1], line: source.slice(0, m.index ?? 0).split('\n').length });
  }
  return out;
}

export function checkText(text: string): { rule: string; detail: string }[] {
  const found: { rule: string; detail: string }[] = [];
  const lower = text.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) found.push({ rule: 'R15.3 banned phrase', detail: phrase });
  }
  for (const m of text.matchAll(CAPS_TOKEN)) {
    if (!ALLOWED_CAPS.has(m[0])) found.push({ rule: 'R15.1 all capitals token', detail: m[0] });
  }
  const pct = PERCENT_NEAR.exec(text);
  if (pct) found.push({ rule: 'R15.2 percentage next to a return claim', detail: pct[0].trim() });
  return found;
}

function scan(file: string): void {
  const source = readFileSync(file, 'utf8');
  const strings = file.endsWith('.json') ? jsonStringsOf(source) : stringLiteralsOf(source);
  for (const s of strings) {
    for (const p of checkText(s.text)) problems.push({ file, line: s.line, rule: p.rule, detail: p.detail });
  }
}

const args = process.argv.slice(2);
const files: string[] = [];
if (args.length > 0) {
  for (const a of args) files.push(resolve(a));
} else {
  walk(resolve(process.cwd(), 'src'), /\.(ts|tsx)$/, files);
  walk(resolve(process.cwd(), 'shared/content'), /\.json$/, files);
}

for (const f of files) scan(f);

if (problems.length > 0) {
  for (const p of problems) console.error(`${p.file}:${p.line}: ${p.rule}: ${p.detail}`);
  console.error(`lint:advice failed with ${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`lint:advice ok (${files.length} files scanned).`);
