/**
 * Plan v2 6.1 and risk 6.
 *
 * Nothing under `api/` or `db/` may be imported from `src/`, and nothing under `src/` may be
 * imported from `api/`. The reason is blunt: anything reachable from `src/` ends up in the
 * browser bundle, and `VAPID_PRIVATE_KEY` reaching the browser means anyone can send a
 * notification to every subscriber.
 *
 * This is one of three guards the plan keeps deliberately. The other two are Vite's `VITE_`
 * prefix rule and the post build grep of `dist/` for the literal secret values.
 *
 * `api/` and `db/` do not exist yet: they arrive with the backend pass. The test runs anyway,
 * so the boundary is asserted from the first line of server code rather than remembered later.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function filesUnder(dir: string, match: RegExp): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  const walk = (d: string): void => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (match.test(entry)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

/** `import ... from 'x'`, `import('x')` and `require('x')`, which is every way in. */
function importSpecifiers(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g)) out.push(m[1]);
  return out;
}

const ROOT = process.cwd();
const SRC = filesUnder(resolve(ROOT, 'src'), /\.(ts|tsx)$/);
const API = filesUnder(resolve(ROOT, 'api'), /\.ts$/);
const DB = filesUnder(resolve(ROOT, 'db'), /\.ts$/);

describe('6.1 the src to api boundary', () => {
  it('has src files to check', () => {
    expect(SRC.length).toBeGreaterThan(0);
  });

  it('never imports api/ or db/ from src/, so no server secret can reach the bundle', () => {
    const offenders: string[] = [];
    for (const file of SRC) {
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
        // Both a relative hop out of src and a root relative path.
        if (/(^|\/)(api|db)\//.test(spec) || /\.\.\/(api|db)\b/.test(spec)) {
          offenders.push(`${file.slice(ROOT.length + 1)} imports ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never imports src/ from api/ or db/, so the two trees share types by copying', () => {
    const offenders: string[] = [];
    for (const file of [...API, ...DB]) {
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
        if (/(^|\/)src\//.test(spec) || /\.\.\/src\b/.test(spec)) {
          offenders.push(`${file.slice(ROOT.length + 1)} imports ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('6.11 no server secret is named anywhere under src/', () => {
  it('never mentions VAPID_PRIVATE_KEY or CRON_SECRET', () => {
    // Even the NAME appearing in a bundled file would mean somebody read it from `import.meta.env`.
    const offenders: string[] = [];
    for (const file of SRC) {
      const source = readFileSync(file, 'utf8');
      for (const secret of ['VAPID_PRIVATE_KEY', 'CRON_SECRET']) {
        if (source.includes(secret)) offenders.push(`${file.slice(ROOT.length + 1)} mentions ${secret}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('reads no environment variable that is not VITE_ prefixed', () => {
    const offenders: string[] = [];
    for (const file of SRC) {
      for (const m of readFileSync(file, 'utf8').matchAll(/import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
        // Vite's own DEV, PROD, MODE, BASE_URL and SSR are build flags, not secrets.
        if (!/^(VITE_|DEV$|PROD$|MODE$|BASE_URL$|SSR$)/.test(m[1])) {
          offenders.push(`${file.slice(ROOT.length + 1)} reads import.meta.env.${m[1]}`);
        }
      }
      for (const m of readFileSync(file, 'utf8').matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
        offenders.push(`${file.slice(ROOT.length + 1)} reads process.env.${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('criterion 3 the simulated investing engine is gone from src/', () => {
  it('has no reference to Recharts, a price source, a brokerage, an allocation or a risk profile', () => {
    // Criterion 3's own grep, minus comments, which the criterion explicitly excludes.
    //
    // Two deliberate carve outs, both named rather than hidden:
    //
    //  - The prose word "brokerage" lives in shared/content/learn.json, which this does not
    //    scan. That separation is the point: content is content, and `src/` is where a
    //    surviving reference to the deleted engine would actually hide.
    //  - `/onboarding/allocation` appears once, as a route path. Criterion 2 REQUIRES that
    //    route to exist so it can redirect, and criterion 3 forbids the word outside a
    //    comment, so the two criteria disagree by one string literal. The redirect wins,
    //    because deleting it would break a criterion that tests behaviour rather than
    //    vocabulary. Flagged in the build notes for the manager.
    const ALLOWED = ["<Route path=\"/onboarding/allocation\" element={<DeletedRoute />} />"];
    const banned = /(recharts|PriceSource|Brokerage|brokerage|allocation|riskProfile)/;
    const offenders: string[] = [];
    for (const file of SRC) {
      const source = readFileSync(file, 'utf8');
      // Block comments first, then line comments, so a multi line comment cannot leak a word.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');
      code.split('\n').forEach((line, i) => {
        if (!banned.test(line)) return;
        if (ALLOWED.some((a) => line.includes(a))) return;
        offenders.push(`${file.slice(ROOT.length + 1)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('has no module left over from the deleted engine', () => {
    for (const gone of [
      'src/domain/prices.ts',
      'src/domain/brokerage.ts',
      'src/domain/fee.ts',
      'src/domain/risk.ts',
      'src/screens/RiskQuiz.tsx',
      'src/screens/AllocationBuilder.tsx',
      'src/screens/Portfolio.tsx',
      'src/components/AllocationBar.tsx',
      'src/components/ExpectedRangeChart.tsx',
      'src/components/PortfolioChart.tsx',
      'src/components/charts',
      'src/content/quiz.ts',
      'src/data/prices',
    ]) {
      expect(existsSync(resolve(ROOT, gone)), gone).toBe(false);
    }
  });

  it('has recharts out of package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.dependencies.recharts).toBeUndefined();
    expect(pkg.devDependencies.recharts).toBeUndefined();
  });

  it('has the iOS spike deleted', () => {
    expect(existsSync(resolve(ROOT, '.dev-team/ios-spike'))).toBe(false);
  });
});
