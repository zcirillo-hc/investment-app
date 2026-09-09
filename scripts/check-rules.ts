/**
 * Plan v2 section 7.4. Fails the build if a rule id in section 4 with arithmetic has no case
 * in `shared/fixtures/rules-v2.json`.
 *
 * It works from three inputs, and each one catches a different way this can rot:
 *
 *  1. **The plan itself**, grepped for rule ids. A rule that exists in the plan and in neither
 *     list of `rule-index.json` fails, so a new rule cannot arrive without somebody deciding
 *     whether it needs a case. That is the failure this check is really for.
 *  2. **`rule-index.json`**, the checked in classification. An id listed there that no longer
 *     appears in the plan fails too, so the list cannot quietly go stale.
 *  3. **The fixture**, for the coverage assertion itself.
 *
 * Runs in `prebuild` alongside `lint:copy` and `lint:advice`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PLAN = resolve(process.cwd(), '.dev-team/02-plan-v2.md');
const INDEX = resolve(process.cwd(), 'shared/fixtures/rule-index.json');
const FIXTURE = resolve(process.cwd(), 'shared/fixtures/rules-v2.json');

interface RuleIndex {
  arithmetic: string[];
  narrative: Record<string, string>;
}

interface Fixture {
  caseCount: number;
  cases: { id: string; rule: string; fn: string }[];
}

const problems: string[] = [];

if (!existsSync(INDEX)) {
  console.error(`rules:check failed: ${INDEX} is missing.`);
  process.exit(1);
}
if (!existsSync(FIXTURE)) {
  console.error(`rules:check failed: ${FIXTURE} is missing. Run npx tsx scripts/gen-rules-fixture.ts.`);
  process.exit(1);
}

const index = JSON.parse(readFileSync(INDEX, 'utf8')) as RuleIndex;
const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture;

const classified = new Set<string>([...index.arithmetic, ...Object.keys(index.narrative)]);
const covered = new Set(fixture.cases.map((c) => c.rule));

// 1. Every arithmetic rule has at least one case.
for (const id of index.arithmetic) {
  if (!covered.has(id)) problems.push(`${id} is classified as arithmetic and has no fixture case.`);
}

// 2. Every rule a case claims to cover is a rule somebody classified.
for (const rule of covered) {
  if (!classified.has(rule)) problems.push(`the fixture has cases for ${rule}, which is in neither list of rule-index.json.`);
}

// 3. The fixture's own self check, so a truncated or partially merged file fails loudly.
if (fixture.cases.length !== fixture.caseCount) {
  problems.push(`caseCount says ${fixture.caseCount} and there are ${fixture.cases.length} cases.`);
}

// 4. The plan, if it is present. It is the source of the rule ids, and it is not shipped, so
//    a missing plan is a warning rather than a failure: `npm run build` must still work from
//    a checkout that has only the app.
if (existsSync(PLAN)) {
  const plan = readFileSync(PLAN, 'utf8');
  const inPlan = new Set<string>();
  // Bold rule ids ("**R4.4**") are the normative statements. The bare section headings
  // ("### R13 Order of operations") carry the id for a rule written as prose.
  for (const m of plan.matchAll(/\*\*(R\d+(?:\.\d+)?)\b/g)) inPlan.add(m[1]);
  for (const m of plan.matchAll(/^### (R\d+) /gm)) inPlan.add(m[1]);
  // A parent id whose children are all listed is covered by them, not separately.
  const parents = new Set([...inPlan].filter((id) => id.includes('.')).map((id) => id.split('.')[0]));

  for (const id of inPlan) {
    if (parents.has(id) && !id.includes('.')) continue;
    if (!classified.has(id)) problems.push(`${id} appears in the plan and is in neither list of rule-index.json.`);
  }
  for (const id of classified) {
    if (!inPlan.has(id)) problems.push(`${id} is classified in rule-index.json but no longer appears in the plan.`);
  }
} else {
  console.warn(`rules:check: ${PLAN} not found, skipping the plan cross check.`);
}

if (problems.length > 0) {
  for (const p of problems) console.error(`rules:check: ${p}`);
  console.error(`rules:check failed with ${problems.length} problem(s).`);
  process.exit(1);
}

console.log(`rules:check ok (${index.arithmetic.length} arithmetic rules, ${fixture.cases.length} cases, ${covered.size} rules covered).`);
