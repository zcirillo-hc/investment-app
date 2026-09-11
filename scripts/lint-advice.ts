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
  'beats the market',
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

/**
 * Rule 4, added by the cycle 8 amendment (R15.7).
 *
 * The relaxation this cycle lets a general, unquantified principle through with a disclosure
 * next to it. The exact thing it must NOT let through is that principle with figures attached
 * and one side framed as winning, because that is where a general truth turns into an
 * instruction about this particular reader's money, and it is what both existing lints missed:
 * "Why $20 a week beats $500 later" contains no banned phrase, no all capitals token and no
 * percentage next to a return word, and it shipped.
 *
 * So: a specific number (a dollar amount, a bare figure, or a written out one) sharing a
 * SENTENCE with a comparison word fails. Sentence, not string, because a piece of prose may
 * legitimately mention a figure in one sentence and draw an unquantified contrast in the next.
 *
 * `COMPARISON_WORDS` is R15.7's list verbatim. `rather than` and `instead of` are on it and
 * are ordinary English, which is exactly why the rule is scoped to a sentence that also
 * carries a number: "leave rent money where you can reach it rather than behind a three day
 * transfer" is prose, and "$20 a week beats $500 later" is a recommendation.
 */
const COMPARISON_WORDS = ['beats', 'beat', 'versus', 'vs', 'instead of', 'rather than', 'better than', 'wins', 'loses to', 'next to', 'more than', 'compared with', 'compared to'];
const COMPARISON_RE = new RegExp(`\\b(?:${COMPARISON_WORDS.map((w) => w.replace(/ /g, '\\s+')).join('|')})\\b`, 'i');

/**
 * A "specific number" is a digit run (with or without a currency mark, and with or without a
 * `k`/`%` suffix) or one of the written out numbers a sentence like this actually uses. Ranks
 * ("the first one", "one of them") and the word "one" as a pronoun are excluded: they carry no
 * quantity, and including them made the rule fire on ordinary sentences during development.
 */
const WRITTEN_NUMBERS = [
  'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
  'hundred', 'thousand', 'million',
];
const NUMBER_RE = new RegExp(`\\$\\s*\\d|\\b\\d+(?:[.,]\\d+)?\\b|\\b(?:${WRITTEN_NUMBERS.join('|')})\\b`, 'i');

/*
 * V2-14. There used to be an impersonal framing allowlist here ("most people", "usually",
 * "generally") that switched the number and comparison rule off for any sentence containing one
 * of those words, so "Twenty dollars a week usually beats five hundred dollars later" passed.
 * A ranking with a number in it is banned however it is framed (R15.5), so the allowlist is
 * gone. Unquantified principles framed that way never had a number and still pass.
 */

/**
 * The one place in the app where a specific number and a comparison word legitimately share a
 * sentence: the Summer Money projection, which R15.2 names as the single forward looking
 * number in the product and which criterion 14 requires to render both curves. Comparing
 * "start now" with "start at 30" IS that screen; there is no wording of it that is not a
 * comparison, and rewording it to dodge the word `versus` would be worse than exempting it,
 * because it would leave the same claim on screen with the lint blind to it.
 *
 * Exact sentences, not a file or a prefix. A new comparison sentence added to the same block
 * fails like any other, and each entry below is a reviewed line.
 *
 * NOTE FOR THE ARCHITECT, recorded in the build notes rather than decided here: R15.5's
 * revised text bans framing "two choices, amounts or TIMINGS as one beating or winning against
 * the other", and this screen compares two timings by construction. R15.2 and criterion 14
 * require the screen. Those two readings of the plan disagree, and this allowlist takes the
 * narrower one (the screen stays, exactly as specified) rather than deleting a required
 * feature on my own authority.
 */
const COMPARISON_EXEMPT = new Set([
  // The chart title with the user's age interpolated (R10.1). Interpolations are read as "$9".
  'Keeping 10% of every summer paycheck from $9, next to waiting until 30',
  // The same title with no age, used as the SVG's accessible name.
  'Keeping 10% of every summer paycheck, next to waiting until 30',
  // The plain language headline (R10.1). `next to` and `more than` are comparison words on
  // purpose, so this line is exempted in the open rather than slipping past the lint.
  'Starting at $9 means putting in $9 more than someone who waits until 30.',
]);

/** Sentence splitting good enough for prose: a terminator followed by a space or the end. */
function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?;:])\s+|\n+/).filter((s) => s.trim().length > 0);
}

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
          // does not close it early. V2-14: it is read as "$9", a number, not as nothing, so
          // "Why ${a} a week beats ${b} later" is caught the way the literal sentence would be.
          text += '$9';
          depth = 1;
          i += 2;
          const exprStart = i;
          const exprLine = line;
          while (i < n && depth > 0) {
            if (source[i] === '{') depth += 1;
            else if (source[i] === '}') depth -= 1;
            else if (source[i] === '\n') line += 1;
            i += 1;
          }
          // V2-14: a literal written inside the interpolation, as in
          // `Tip: ${on ? 'you should buy NVDA now' : ''}`, is prose too and used to go unread.
          // Scan the expression's own literals, on the lines they sit on.
          for (const inner of stringLiteralsOf(source.slice(exprStart, i - 1))) push(inner.text, exprLine + inner.line - 1);
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
  // V2-14: "risk-free" and a typographic apostrophe in "can’t lose" used to slip past the list.
  const lower = text.toLowerCase().replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[-\u2010\u2011]/g, ' ');
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) found.push({ rule: 'R15.3 banned phrase', detail: phrase });
  }
  for (const m of text.matchAll(CAPS_TOKEN)) {
    if (!ALLOWED_CAPS.has(m[0])) found.push({ rule: 'R15.1 all capitals token', detail: m[0] });
  }
  const pct = PERCENT_NEAR.exec(text);
  if (pct) found.push({ rule: 'R15.2 percentage next to a return claim', detail: pct[0].trim() });
  for (const sentence of sentencesOf(text)) {
    const trimmed = sentence.trim().replace(/\s+/g, ' ');
    if (COMPARISON_EXEMPT.has(trimmed)) continue;
    const cmp = COMPARISON_RE.exec(sentence);
    if (!cmp) continue;
    const num = NUMBER_RE.exec(sentence);
    if (!num) continue;
    found.push({
      rule: 'R15.3/R15.5 a specific number in the same sentence as a comparison',
      detail: `"${num[0].trim()}" with "${cmp[0].trim()}" in "${sentence.trim().slice(0, 90)}"`,
    });
  }
  return found;
}

function scan(file: string): void {
  const source = readFileSync(file, 'utf8');
  const strings = file.endsWith('.json') ? jsonStringsOf(source) : stringLiteralsOf(source);
  for (const s of strings) {
    for (const p of checkText(s.text)) problems.push({ file, line: s.line, rule: p.rule, detail: p.detail });
  }
}

/**
 * Criterion 28 and 9.8a: the six surfaces the disclosure has to be visible on, with no tap and
 * no expand. Each maps to the screen file that renders it and to the `data-testid` the e2e
 * suite finds it by.
 *
 * A static check, and it is honest about being one: it proves the screen renders the shared
 * constant, not that the sentence is on screen at the moment a user looks. The Playwright case
 * in `tests/e2e/learn.spec.ts` proves the second thing on all six. This one is here because it
 * runs in `prebuild`, which means the disclosure cannot be deleted from a screen and shipped
 * while the e2e suite is red or unrun.
 */
export const DISCLOSURE_SURFACES: Array<{ file: string; testId: string; what: string }> = [
  { file: 'src/screens/Learn.tsx', testId: 'learn-not-advice', what: 'the Learn library index' },
  { file: 'src/screens/LearnItem.tsx', testId: 'learn-item-not-advice', what: 'every Learn item page' },
  { file: 'src/screens/Lessons.tsx', testId: 'lessons-not-advice', what: 'the top of Lessons' },
  { file: 'src/screens/Lesson.tsx', testId: 'lesson-not-advice', what: 'every lesson page' },
  { file: 'src/screens/Invest.tsx', testId: 'invest-not-advice', what: 'the Invest screen' },
  { file: 'src/screens/Settings.tsx', testId: 'settings-not-advice', what: 'Settings' },
];

function checkDisclosurePlacement(): void {
  for (const surface of DISCLOSURE_SURFACES) {
    const full = resolve(process.cwd(), surface.file);
    if (!existsSync(full)) {
      problems.push({ file: surface.file, line: 0, rule: 'R15.6 disclosure placement', detail: `${surface.what}: file is missing` });
      continue;
    }
    const source = readFileSync(full, 'utf8');
    // The rendered node, found by its test id, and the shared constant reached through `S`.
    // Requiring both means neither a stray test id nor a hand retyped sentence passes.
    const hasNode = source.includes(`data-testid="${surface.testId}"`);
    const hasLine = /\bS\.(?:learn|lessons|settings|invest)\.notAdvice\b/.test(source);
    if (!hasNode || !hasLine) {
      problems.push({
        file: surface.file,
        line: 0,
        rule: 'R15.6 disclosure placement',
        detail: `${surface.what} must render the 9.8a line: ${!hasNode ? `no data-testid="${surface.testId}"` : 'no *.notAdvice reference'}`,
      });
    }
  }
}

const args = process.argv.slice(2);
const files: string[] = [];
if (args.length > 0) {
  for (const a of args) files.push(resolve(a));
} else {
  walk(resolve(process.cwd(), 'src'), /\.(ts|tsx)$/, files);
  walk(resolve(process.cwd(), 'shared/content'), /\.json$/, files);
  // Only on a whole tree run: pointing the lint at one file is a fixture check, and the
  // placement rule has nothing to say about a single file.
  checkDisclosurePlacement();
}

for (const f of files) scan(f);

if (problems.length > 0) {
  for (const p of problems) console.error(`${p.file}:${p.line}: ${p.rule}: ${p.detail}`);
  console.error(`lint:advice failed with ${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`lint:advice ok (${files.length} files scanned).`);
