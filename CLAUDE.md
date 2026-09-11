# Spare Change

**Read this file first. It is the single entry point for this repo. You should not need to search the folder to get oriented.**

Last updated 2026-09-11. Keep it that way: when you change how this project works, update this file in the same commit.

---

## 1. What the app is

A web app that notices where you spend without thinking about it, nudges you once in the morning to skip that stop, and puts the money you did not spend into a jar. Skipping is the point: a day passing does not move money on its own. When you move that money somewhere real, you tell the app where it went and it keeps the record.

Mission line: **"Keep a little. It goes a long way."**

Audience: college students and recent grads, 18 to 24, who earn in bursts and have no system. Not traders.

**All spending is simulated.** No bank link, no brokerage, no payments, no real money moves. The investment ledger is a record of what the user typed, nothing more.

### What it deliberately does NOT do

This matters more than the feature list, because several of these were removed on purpose and should not come back without a decision:

- **It does not know what anything is worth.** No price feed, no simulated market, no computed growth, no charts of value. v1 had all of that and it was deleted, because inventing numbers was dishonest. The app shows what it knows: what you kept, and what you told it you invested.
- **It does not track your location in the background.** Habits come from the transaction feed. Location is When In Use only and merely labels a place. There is no geofencing.
- **It does not nag.** One nudge a day maximum. Saying no produces silence, never a comment.
- **It does not give financial advice.** See section 6.
- **It does not do round-ups.** They were removed so that skipping is the only thing that
  fills the jar. `RoundUp` still exists as a legacy event the app can read, so pre-removal
  profiles keep their history, but nothing creates one.

---

## 2. Live, deploy, and accounts

| Thing | Value |
|---|---|
| Production | **https://sparechangeinvesting.vercel.app** |
| Old URL | `spare-change-rho.vercel.app` redirects here. Do not use it. |
| GitHub | https://github.com/zcirillo-hc/investment-app (branch `main`) |
| Vercel project | `spare-change`, team `zachc`, **Hobby plan** |
| Database | Neon Postgres, provisioned via Vercel Marketplace, connected to the project |
| CLI | `export PATH="$HOME/.local/bin:$PATH"`, already authenticated |

**Deploying: push to `main`.** The repo is connected to Vercel, so a push builds and deploys. Do not run `vercel deploy` by hand.

Secrets live in Vercel env vars and `.env.local` (gitignored): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, plus the Neon `DATABASE_URL` family. **Never print or commit their values.** `npm run postbuild` greps `dist/` for the private key and the cron secret and fails the build if either leaks.

---

## 3. Commands

```
npm run dev          vite dev server, http://localhost:5173
npm test             vitest, unit  (723 committed, all passing)
npm run test:db      vitest against real Neon, isolated schema  (93 passing)
npm run e2e          playwright, 4 viewport profiles  (15 min to over an hour)
npm run typecheck    full tsc, includes tests and scripts
npm run build        tsc -p tsconfig.build.json && vite build
npm run lint:copy    no em or en dashes, banned strings
npm run lint:advice  the education-not-advice rules
npm run rules:check  every numbered rule has a fixture case
npm run db:migrate   apply db/migrations against DATABASE_URL
```

Demo URL, which is how you exercise the loop by hand:
`http://localhost:5173/?demo=1&freeze=1&start=2026-06-15&seed=42`
Long-press the logo to open the demo tray without the query param.

---

## 4. Layout

```
src/domain/     Pure TypeScript. No React, no platform imports. All money math.
                habits, nudges, estimate, places, jar, ledger, tick, simulator,
                summer, tree, triggers, money, dates, prng, selectors, types
src/state/      Zustand store, IndexedDB persistence, validate, urlParams, bootstrap
src/screens/    Welcome, SummerMoney, FearCheck, Home, Places, Invest, InvestCapture,
                Activity, Learn, LearnItem, Lessons, Lesson, Settings
src/components/ Jar, Tree, NudgeCard, NudgesCard, CatchSheet, Term, Tooltip, Button, ...
src/content/    strings.ts is the ONLY place UI copy lives. Also learn, lessons, tooltips.
shared/content/ Copy as JSON: learn, lessons, tooltips, holdingTypes, merchants
shared/fixtures/rules-v2.json, the machine-readable statement of the domain rules
api/            Vercel Functions, Node runtime. push/{subscribe,unsubscribe,schedule,
                vapid-public-key}, cron/send-nudges, health, _lib/{db,due,push,validate}
db/             migrate.ts and numbered SQL migrations. One table: push_subs
scripts/        lint-copy, lint-advice, check-rules, gen-rules-fixture,
                check-bundle-secrets, gen-icons, logo-art
public/         manifest.webmanifest, sw.js, icons/
.dev-team/      Decision history. See section 9.
```

**The domain layer is the crown jewel.** It is pure, deterministic from a seed, and unit tested in isolation. Keep React and platform concerns out of it.

---

## 5. The rules

`.dev-team/02-plan-v2.md` **section 4** is the single definition of every domain rule, numbered R1 to R15. Implementing functions cite their rule id in a comment. `shared/fixtures/rules-v2.json` holds the cases, `npm run rules:check` fails if a rule has no case.

If you change behavior, change the rule in the plan and the fixture, not just the code.

Key ones to know:
- **R4** habit detection: a place becomes a habit at 3+ visits in 14 days at a similar time.
- **R10.1 / R10.4** the two charts on Summer Money. R10.1 is the hypothetical summer-job
  comparison and never moves. R10.4 is the grounded one: real money put in
  (`jarCents + ledgerTotal`, each dollar counted once) grown at 7% to 65. They have separate cards and
  separate scales on purpose, because real money is tens of dollars against tens of thousands
  and a shared axis flattens the real one to nothing.
- **R4.4** one nudge per day, maximum.
- **R5.5** skipping credits the jar with an estimate drawn from the user's own history at that merchant.
- **R14** nudge scheduling and delivery, including timezone and the daily cron.
- **R15** education, not advice. See section 6.
- **R17** habit metrics on Home: lifetime skips, kept by skipping, and best week. Best week is
  a maximum over history, not a current run, so a quiet stretch never lowers it. Nothing may
  render a streak, a broken run, a missed day, or a shortfall. See `.dev-team/06-theme.md`.
- **R18** the Invest page's "what these actually are" card, plus the Learn library's stock
  depth. The card is STATIC: all six holding types, same order, same words, whatever the user
  holds, because R15.4 bans educational content that varies with the ledger.
- **R16** bond and CD term and rate on a ledger entry, and what it pays held to maturity.
  Allowed where a stock projection is not, because a CD rate is a contract and this is
  arithmetic on the user's own two numbers rather than a guess about markets. Only a bonds or
  CDs row may carry them (R16.5); entries store `holdingType`, and an edit keeps any field its
  form did not show (R16.6). The type is picked from chips in the ledger form, never read from
  the free text name, and Invest shows it beside a name that differs (V2-23). Rows an earlier
  build saved under looser rules are tidied on load and on import, never refused, and the user
  is told once (R16.8, persist version 2).

Money is **integer cents** everywhere. Never floats.

---

## 6. Advice policy, R15

The app talks about investing, so this is a real constraint, not a style preference.

**Allowed, alongside the standing disclosure:**
- General principles that apply to everyone ("money invested earlier has more time to grow")
- Procedural steps ("opening an account usually needs your ID and a bank link")
- Encouragement to start, which is the point of the product

**Not allowed, disclosure or not:**
- Naming a specific security, ticker or fund as something to buy
- Telling the reader what their allocation, contribution or timeline should be
- Predicting or promising a return
- Anything that reads as tailored to the individual

Why the second list stays banned even with a disclaimer: the owner is not a registered adviser, and a disclaimer does not turn a personalized recommendation into general education.

**The standing disclosure**, rendered on Learn, every Learn item, Lessons, every lesson, Invest and Settings:

> This is general information, not personal advice. We are not licensed financial advisors, and nothing here is tailored to you or your money.

`npm run lint:advice` enforces what it can. It cannot catch everything, so **a human must read all 20 Learn pieces and 8 lessons against the list above before a content change ships.** That gate is R15.7 layer 3. The owner does that read on a private review page, "Spare Change Copy Desk", generated from `shared/content/*.json`; each mark is stored in the page's database collection `reviews` and read back with the Artifact tool's `read_db`. Ask the owner for the link, and after a content change rebuild and republish it to the same URL.

---

## 7. Copy rules

- **No em dashes or en dashes anywhere in UI copy.** Use commas, periods or parentheses. `lint:copy` fails the build.
- All UI copy in `src/content/strings.ts`. No inline strings in components.
- Banned string: "everything stays on this device". It stopped being true when push shipped, and the lint keeps it from creeping back.
- No shame language. Declining a nudge produces no comment.
- Every financial term renders through `Term` with a tooltip.
- Voice: a friend a year ahead of you. Encouraging, honest, a little funny, never preachy.

---

## 8. Gotchas that have already cost a deploy

Read these before touching the build or the API.

1. **`tsconfig.json` includes `tests/`, but `.vercelignore` strips it.** The build must use `tsconfig.build.json`, which covers only `src`, `api` and `db`. Using the full config breaks the deploy while passing locally.
2. **`"type": "module"` means every relative import under `api/` needs an explicit `.js` extension.** `vercel dev` tolerates extensionless imports; the deployed runtime returns `ERR_MODULE_NOT_FOUND` and every route 500s.
3. **Hobby cron runs once a day and only within the hour of its slot.** `0 10 * * *`. Per-user local nudge times cannot be honored precisely. The schema keeps the timezone and nudge minute so moving to Pro or QStash is a one-line change.
4. **`Tooltip.tsx` and the color tokens are this codebase's fragile spots.** Two separate fixes to them caused their own regressions. Any change to either needs the full tap sweep in `tests/e2e/tooltip.spec.ts` and the axe run in both themes.
5. **iOS needs `viewport-fit=cover`** or every `env(safe-area-inset-*)` resolves to zero and the standalone layout silently breaks.
6. **`apple-touch-icon` must have no alpha channel.** iOS composites transparency onto black.
7. **Never kill port 5173 while `npm run e2e` is running.** That is the suite's own dev server. Ad-hoc Playwright specs started alongside it fight for the port and killing it corrupts the run. Wait for the suite, or check against the live site.
8. **After onboarding, an invest-capture prompt overlays Home and swallows clicks, and nudges are off by default.** Use `dismissCapturePrompt` and `clickClear` from `tests/e2e/fixtures.ts`, and run demo `make-habit` before `force-nudge`, or a skip click silently does nothing.
9. **Read Playwright's `N failed` and `N flaky` lines, not the last lines of the log.** With the list reporter the tail is the last test to finish, and a run can end on a pass while tests failed earlier. That is how three pushes in September went out reported as "0 failed" while four committed specs had been failing since `0ab8031`. Grep the log for `^\s+[0-9]+ (passed|failed|flaky)` before calling a run green.
10. **Never center a framer-motion element with a Tailwind `translate` class.** Animating `x`, `y` or `scale` makes framer-motion write an inline `transform`, which silently replaces `-translate-x-1/2` and friends. The toast shipped half off every phone screen for two days that way. Center with `inset-x-*` plus `mx-auto`, or animate `x: '-50%'` yourself. The horizontal scroll check does not catch it, because a fixed element off-screen does not scroll the page.

---

## 9. Process and history

This project runs through a four-agent pipeline (Architect, Coder, Tester, Manager) with a human checkpoint at each handoff. Artifacts in `.dev-team/`:

| File | What it is |
|---|---|
| `01-brief.md` | Original product brief and the accepted architect Q&A |
| `02-plan.md` | **v1 plan. Historical.** The round-up investing product, now deleted. |
| `02-plan-v2.md` | **Current plan and the authority on rules.** ~2600 lines, several amendments. |
| `03-build-notes.md` | Every build pass: deviations, assumptions, self-declared weak points |
| `04-test-report.md` | v1 tester report, defects D1 to D12 |
| `04-test-report-v2.md` | v2 tester report, defects V2-1 to V2-19 across three cycles |
| `05-status.md` | v1 manager status |
| `06-theme.md` | **The theme.** Who this is for, the three blockers it removes, what success means, the voice, and what it forbids. Read before adding a feature or writing copy. |

v1 shipped as a round-up investing prototype and was pivoted in v2 to spend-habit nudges. The pivot deleted the entire simulated market.

---

## 10. Current state

Green as of 2026-09-11, after the cycle 5 fixes: 723 unit, typecheck, both lints, rules:check (30 arithmetic rules, 111 cases), build, axe clean in both themes at four viewports. End-to-end on the 11 committed specs: 368 passed, 28 skipped, 0 failed, 0 flaky across mobile, desktop, iPhone Pro and Pro Max. The db suite (93 committed) was last run by the tester on 2026-09-11; cycles 3 and 4 did not touch `api/` or `db/`.

The e2e figures reported for `0ab8031`, `352d618` and `01a134b` ("0 failed") were wrong: four committed specs were failing and the reports were read from the end of the log. See gotcha 9. The four specs were fixed in `563fbb1`.

**Known open items:**
- The tester's cycle 5 pass (2026-09-11) confirmed V2-20 to V2-25 and the toast fixed, and filed V2-26 (Major: the jar move form showed the type chips, a length and a rate, then saved none of them) and V2-27 to V2-29 (Minor). All four were fixed the same day and need a tester re-verification pass. The tester reconciled its v3 and v4 cases to the owner's decisions, and every tester case (v3, v4, v5) now passes. The tester files are still uncommitted: whether to commit them, as was done with `tester-v2-*`, is the owner's call and has not been made.
- Four tests in `tests/unit/tester-v2-import-impact.test.ts` were inverted on 2026-09-09: they originally asserted the import validator wrongly ACCEPTED four bad shapes, in order to demonstrate the damage. The validator now rejects all four, so they assert rejection instead. Coverage preserved, intent unchanged.
- Never tested: a real iPhone, real Safari, WebKit, Firefox, screen readers, and an actual push notification arriving on a physical phone.
- The cron has never been observed firing on its real daily schedule in production.
- Home still shows "skips this week" and "days in" directly above the R17 habit card. Days in measures time passing rather than a choice, and the row duplicates the card. Flagged, not yet cleaned up.

---

## 11. Updating this file

When you change how the project works, update the section here that covers it, in the same commit. Specifically: a new gotcha that cost you time goes in section 8, a rule change goes in section 5 or 6, a new command goes in section 3, and anything that changes what the app is or refuses to do goes in section 1.

The point of this file is that the next agent reads one thing and is oriented. If it drifts out of date it is worse than nothing.
