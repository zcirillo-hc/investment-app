# 02 Plan v2: Spare Change, the pivot

Written 2026-09-08 by the architect, after the pivot interview. This is a NEW plan.
`.dev-team/02-plan.md` stays untouched as the record of the shipped v1. Where this
document and v1's plan disagree, this one wins for all work from here on.

No em dashes or en dashes appear in this file, in any UI copy it specifies, or in any
file the coder writes. Verified with `npm run lint:copy` and a grep before handoff.

**Amended three times.** See the revision log at the bottom. The cycle 7 amendment added the
light invest capture. The cycle 7 amendment 2 (2026-09-08) removed the iOS app entirely, added a
push backend on Vercel and Neon, and expanded the educational content. The cycle 7 amendment 3
(2026-09-08) keeps that push backend on the Vercel Hobby plan with one nudge window a day rather
than moving to Pro, and adds the layout work a real iPhone needs to run the app standalone. Where
an older paragraph and a newer one disagree, the newer one wins, and the revision log says which
is which.

---

## 1. What this is and what changed from v1

v1 was a simulated investing app: it generated fake purchases, rounded them up, swept a
jar into a simulated brokerage holding five real ETF tickers priced from a committed
400 day synthetic series, charged a simulated $1 monthly fee, and showed growth since
start. v2 removes the entire simulated investing engine and replaces the thing the app
is actually for. Spare Change now helps you keep money you were about to spend: it
learns, from your own spending feed, which places you go to habitually and at what
time, nudges you once, twenty minutes before your usual time, and if you skip, the
money you would have spent goes into the jar. The jar survives as a plain kept balance
and no longer sweeps anywhere automatically. Alongside it there is a manual investment
ledger where you record what you actually invested in real life, in real dollars, on
your own: the app records the contribution and what you said you put it in, and it
never fetches, simulates, or computes a price, a value, or a return. The name, the
mission line, the jar, the tree, the summer projection, the lessons and every voice,
copy and accessibility rule carry forward. This cycle ships **web only**. There is no
native app on any platform, and the iOS work described in earlier drafts of this plan is
withdrawn. In its place the app becomes an installable progressive web app with a small push
backend, because a web page cannot wake itself twenty minutes before your usual time and the
nudge is the product (section 6.0). The educational content also grows: the eight confidence
path lessons stay exactly as they are, and a sixteen piece Learn library is added alongside
them, covering how to actually start investing and what the stock, bond and other markets
are (sections 8.9 and 9.8), under a new hard rule that the app teaches and never advises
(R15).

### 1.1 Disposition of every v1 artifact

The coder uses this as the deletion checklist. Deletions happen in build step 1, with
their tests, in the same commit, and the commit message states the exact number of test
cases removed.

#### Source, domain

| File | Disposition | Reason |
|---|---|---|
| `src/domain/prices.ts` | DELETE | The `PriceSource` implementation. No market data in v2. |
| `src/domain/brokerage.ts` | DELETE | Simulated buys, sells and portfolio value. Nothing to buy. |
| `src/domain/fee.ts` | DELETE | The fee was deducted from a simulated portfolio that no longer exists (see 1.3). |
| `src/domain/risk.ts` | DELETE | Quiz scoring, allocation floors, drawdown and expected range. No allocation in v2. |
| `src/domain/interfaces.ts` | MODIFY | Drop `PriceSource`, `Brokerage`, `Holdings`, `Allocation`, `Fill`, `TickerMeta`, `Ticker`. Add `LocationSource`, `PlaceVisit`. Keep `TransactionSource`, `Purchase`, `Paycheck`, `SimContext`, `Cents`. |
| `src/domain/types.ts` | MODIFY | New `AppState` v2 shape (section 5.2). Drop `SweepEvent`, `FeeEvent`, `HistoryPoint`, `holdings`, `history`, allocation and quiz fields. Add `SkipEvent`, `JarMoveEvent`, `JarEmptiedEvent`, `places`, `visits`, `nudges`, `ledger`. |
| `src/domain/tick.ts` | MODIFY | Remove sweep, fee and price marking from the day pipeline. Add visit recording, habit recompute and nudge scheduling. |
| `src/domain/selectors.ts` | MODIFY | Remove `portfolioValueCents`, `growthSinceStart`, `holdingRows`, `pricesFrozen`, `contributedCents` (portfolio sense). Add kept, ledger, place and nudge selectors. |
| `src/domain/triggers.ts` | MODIFY | Retrigger L3 and L4 (section 4, R12). Milestones keep `first100Kept`, `firstSummer`, `pathFinished`. |
| `src/domain/jar.ts` | MODIFY | No automatic sweep. Becomes goal progress plus the two user actions (R6). |
| `src/domain/tree.ts` | MODIFY | Stage now counts from the first kept event of any kind, not the first sweep (R8). |
| `src/domain/simulator.ts` | MODIFY | Purchases gain a minute of day so they can be visits. Paycheck schedule unchanged. |
| `src/domain/roundup.ts` | KEEP | Round-ups still fund the jar. Unchanged math. |
| `src/domain/catch.ts` | KEEP | Paycheck catch still funds the jar. Unchanged math. |
| `src/domain/summer.ts` | KEEP | Projection from the user's own answers at a stated 7% assumption. Needs no market data. |
| `src/domain/money.ts` | KEEP | Formatting and integer cent helpers. |
| `src/domain/dates.ts` | MODIFY | Add minute of day helpers (`minuteOfDayFromHM`, `formatMinuteOfDay`, `clampMinuteOfDay`). Everything else unchanged. |
| `src/domain/prng.ts` | KEEP | Unchanged. R2.0 keeps its fixture cases as a determinism guard, no longer as a cross language contract. |
| `src/domain/places.ts` | NEW | Place identity, visit recording, place deletion. |
| `src/domain/habits.ts` | NEW | Habit detection and the usual time (R3). |
| `src/domain/nudges.ts` | NEW | Nudge candidacy, timing, cap, mute, outcomes (R4). |
| `src/domain/estimate.ts` | NEW | Estimated savings for a skip (R5). |
| `src/domain/ledger.ts` | NEW | Manual investment ledger (R7). |

#### Source, state, config, data

| File | Disposition | Reason |
|---|---|---|
| `src/config.ts` | MODIFY | Delete `FEE_*`, `TICKERS`, `TICKER_META`, `PRESETS`, `FLOORS`, `REFERENCE_*`, `CORRELATION`, `EXPECTED_RANGE_*`, `TRADING_DAYS_PER_YEAR`, `PRICE_SERIES_LENGTH`, `MAX_TRADING_DAY_INDEX`, `MAX_SHARES_PER_TICKER`, `QUIZ_*`, `SWEEP_THRESHOLD_PRESETS`. Add the constants in section 4. Bump `SCHEMA_VERSION` to 2 and `STORAGE_KEY` to `spare-change-state-v2`. |
| `src/state/deps.ts` | MODIFY | Construct `transactions` and `location` only. No prices, no brokerage. |
| `src/state/store.ts` | MODIFY | New actions (section 5.3). Remove `setQuizAnswers`, `setAllocation`, `markAllocationExplainerSeen`. |
| `src/state/uiStore.ts` | MODIFY | `sweepAnimation` becomes `jarMoveAnimation`. Keep toast, confetti, milestone modal, tray. |
| `src/state/validate.ts` | MODIFY | Rewrite for the v2 shape. A v1 envelope (schemaVersion 1) is rejected with a named message, not migrated (see 1.4). |
| `src/state/persistence.ts` | KEEP | Only the storage key and schema version change, both from config. Do not touch the mirror or revision logic; it is load bearing and was hard won in cycle 4. |
| `src/state/bootstrap.ts` | KEEP | Auto advance is unchanged. |
| `src/state/urlParams.ts` | MODIFY | Add `?nudge=1` (force the next nudge due now) for demos and tests. |
| `src/data/merchants.ts` | MODIFY | Becomes a thin loader over `shared/content/merchants.json` (section 7.2). Each merchant gains `usualMinute` and `minuteSpread`. |
| `src/data/prices/VTI.json` | DELETE | Price series. |
| `src/data/prices/VXUS.json` | DELETE | Price series. |
| `src/data/prices/BND.json` | DELETE | Price series. |
| `src/data/prices/VNQ.json` | DELETE | Price series. |
| `src/data/prices/VTIP.json` | DELETE | Price series. |

#### Source, screens and components

| File | Disposition | Reason |
|---|---|---|
| `src/screens/RiskQuiz.tsx` | DELETE | Exists only to pick a simulated allocation; the light capture that replaces its narrow purpose is a fresh screen, not a rewrite of this file (see 1.2). |
| `src/screens/AllocationBuilder.tsx` | DELETE | Same. A slider UI for percentages has no home in a plan that computes no percentage against a simulated value (see 1.2). |
| `src/screens/Portfolio.tsx` | DELETE | Replaced by `Invest.tsx`, which shows contributions, not a portfolio. |
| `src/screens/Places.tsx` | NEW | The privacy and control surface (section 8.6). |
| `src/screens/Invest.tsx` | NEW | The manual investment ledger (section 8.7). |
| `src/screens/InvestCapture.tsx` | NEW | The light "what are you invested in" capture, per the user's amendment to A5 (1.2, section 8.7a). Tap common holding types, add an amount, save straight to the ledger. No risk read, no percent, no simulated value. |
| `src/screens/Home.tsx` | MODIFY | Growth line replaced (1.3), nudge card added, jar actions added. |
| `src/screens/Activity.tsx` | MODIFY | Feed kinds become RoundUp, Catch, Skip, JarMove, JarEmptied. |
| `src/screens/Settings.tsx` | MODIFY | Remove threshold presets and the fee card. Add nudges, quiet hours, mute, location, jar goal. |
| `src/screens/SummerMoney.tsx` | MODIFY | Same content, chart drawn by the new inline SVG component. |
| `src/screens/Welcome.tsx` | MODIFY | New three step explanation (section 9.1). |
| `src/screens/FearCheck.tsx` | KEEP | Four options unchanged, still picks the first lesson. |
| `src/screens/Lessons.tsx` | MODIFY | Progress ring still over the eight confidence path lessons, unchanged. Gains the standing education line (9.8a) and one link to the Learn library. |
| `src/screens/Learn.tsx` | NEW | The Learn library: three tracks, sixteen pieces, no locks, a plain read count (8.9). |
| `src/screens/LearnItem.tsx` | NEW | Reader for one Learn piece. Reuses `Lesson.tsx`'s reader body and tooltip handling rather than reimplementing it. |
| `src/screens/Lesson.tsx` | KEEP | Reader. |
| `src/components/AllocationBar.tsx` | DELETE | Only the allocation builder used it. The capture flow renders no bar and no proportion of anything (see 1.2). |
| `src/components/ExpectedRangeChart.tsx` | DELETE | Depends on the risk model. |
| `src/components/PortfolioChart.tsx` | DELETE | Depends on price history. |
| `src/components/charts/PortfolioCanvas.tsx` | DELETE | Recharts half of the above. |
| `src/components/charts/ExpectedRangeCanvas.tsx` | DELETE | Recharts half of the above. |
| `src/components/charts/SummerCurvesCanvas.tsx` | DELETE | Replaced by `SummerCurves.tsx` (inline SVG, no library). |
| `src/components/SummerCurves.tsx` | NEW | Two polylines and axis labels in inline SVG. Lets Recharts leave the project. |
| `src/components/NudgeCard.tsx` | NEW | The in app nudge (section 8.2). |
| `src/components/LedgerForm.tsx` | NEW | Add or edit a ledger entry (section 8.7). |
| `src/components/SweepAnimation.tsx` | MODIFY | Renamed `JarMoveAnimation.tsx`. Same motion, fires on a user confirmed jar move. |
| `src/components/MilestoneCard.tsx` | MODIFY | Card copy loses the eight lessons and portfolio references. PNG rendering unchanged. |
| `src/components/LessonVisual.tsx` | MODIFY | Visuals for the two rewritten lessons. |
| `src/components/NavBar.tsx` | MODIFY | Tabs become Home, Places, Invest, Lessons, Settings. Activity moves to a link from Home. Gains bottom safe area padding and confirmed 44pt tap targets (6.13). |
| `src/components/DemoTray.tsx` | MODIFY | New controls (section 5.4). Do not restructure the long press or touch handling; it is fragile and was reworked twice. Gains safe area insets as a fixed overlay (6.13). |
| `src/components/Jar.tsx` | KEEP | Fill ratio now runs against the jar goal. |
| `src/components/Tree.tsx` | KEEP | Seven stages, unchanged art. |
| `src/components/Tooltip.tsx` | KEEP | Do not touch. Two cycles of regressions live here. If a change looks necessary, escalate first. |
| `src/components/Term.tsx`, `Money.tsx`, `CountUp.tsx`, `Card.tsx`, `Button.tsx`, `Screen.tsx`, `Logo.tsx`, `Confetti.tsx`, `ProgressRing.tsx`, `ErrorBoundary.tsx` | KEEP | Unchanged. |
| `src/components/Header.tsx` | MODIFY | Gains top safe area padding and an optional back control prop, used by every screen named in 6.13. |
| `src/components/Toast.tsx`, `CatchSheet.tsx` | MODIFY | Gain safe area insets as fixed overlays (6.13); no behavior change. |
| `src/routes.tsx` | MODIFY | Onboarding is Welcome, Summer, Fear. Quiz and allocation routes are gone and redirect. |
| `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/lib/*` | KEEP | Boot, theme and hooks are unaffected. |

#### Content

| File | Disposition | Reason |
|---|---|---|
| `src/content/quiz.ts` | DELETE | No quiz. Its risk scoring questions have no bearing on a capture that only records the user's own words; not reused (see 1.2). |
| `src/content/holdingTypes.ts` | NEW | Thin loader over `shared/content/holdingTypes.json`, the six holding type labels used by `InvestCapture.tsx` and by `LedgerForm`'s own suggestion list (1.2, section 8.7a). |
| `src/content/lessons.ts` | MODIFY | Becomes a loader over `shared/content/lessons.json`. L3 and L4 rewritten (1.3), other six unchanged. |
| `src/content/learn.ts` | NEW | Loader over `shared/content/learn.json`, the sixteen Learn library pieces and their three tracks (8.9, 9.8). |
| `src/content/tooltips.ts` | MODIFY | Becomes a loader over `shared/content/tooltips.json`. **Amendment 2 reverses four of these deletions:** `stock`, `bond`, `etf` and `indexFund` come back, plus eleven new terms, because the Learn library uses them and every financial term needs a tooltip (section 9.8b). Delete `realEstateFund`, `cashLike`, `usStocks`, `worldStocks`, `fractionalShare`, `closingPrice`, `holdings`, `growthSinceStart`, `expectedRange`, `badYears`, `riskProfile`, `diversified`, `allocation`, `fee`, `threshold`, `portfolio`, `sweep`. Keep `roundUp`, `catch`, `jar`, `dip`, `sevenPercent`, `contributions`. Add `place`, `habit`, `usualTime`, `skip`, `estimate`, `quietHours`, `ledgerEntry`. |
| `src/content/strings.ts` | MODIFY | Large edit. Section 9 gives the strings that carry meaning; the coder writes the rest in the same voice. |

#### Scripts, config, tests

| File | Disposition | Reason |
|---|---|---|
| `scripts/fetch-real-prices.ts` | DELETE | No prices. |
| `scripts/gen-synthetic-prices.ts` | DELETE | No prices. |
| `scripts/lint-copy.ts` | MODIFY | Also scan `shared/**/*.json`, `api/**/*.ts`, `db/**/*.{ts,sql}` and `public/sw.js`. Add the retired privacy promise ("Everything stays on this device") to the banned strings, per risk 4. |
| `scripts/lint-advice.ts` | NEW | The R15.7 education not advice lint. Runs in `prebuild`. |
| `db/migrate.ts`, `db/migrations/0001_push_subs.sql` | NEW | The one table and its migration runner (6.7). |
| `api/**` | NEW | The push backend: four subscription routes, one cron route, `_lib` helpers (6.1). Never imported from `src/`. |
| `public/manifest.webmanifest`, `public/sw.js`, `public/icons/*` | NEW | The PWA shell (6.2, 6.3). |
| `src/lib/push.ts`, `src/lib/pendingNudge.ts` | NEW | Client push lifecycle and the one IndexedDB record the service worker reads (6.4, 6.5). |
| `vercel.json` | MODIFY | Fix the SPA rewrite so it stops matching `/api/*`, and add `functions`, `headers` and `crons` (6.6). Do this before writing any route. |
| `scripts/check-rules.ts` | NEW | Fails if a rule id in section 4 has no fixture case (section 7.4). |
| `vite.config.ts` | MODIFY | Delete the `charts` chunk rule. Keep `motion` and `react`. |
| `package.json` | MODIFY | Remove `recharts`. Add dependencies `web-push` and `@neondatabase/serverless`, dev dependency `@vercel/node`. Add scripts `rules:check`, `lint:advice`, `db:migrate`, `test:db`. No `ios:*` scripts. |
| `playwright.config.ts` | MODIFY | Keep the two viewport projects. Add an iPhone Safari device profile project for criterion 20, iPhone Pro (393x852) and Pro Max (430x932) device profiles for criteria 20a and 20b (6.13), and an `api` project with `baseURL` pointing at `vercel dev` on port 3000 (11.1). |
| `tests/unit/brokerage-fee.test.ts` (9 cases) | DELETE | Tests deleted modules. |
| `tests/unit/prices.test.ts` (6) | DELETE | Tests deleted modules. |
| `tests/unit/risk.test.ts` (12) | DELETE | Tests deleted modules. |
| `tests/unit/tree.test.ts` (1) | MODIFY | New trigger for stage 1. |
| `tests/unit/roundup-jar.test.ts` (6) | MODIFY | Round-up cases stay, sweep cases go. |
| `tests/unit/tick.test.ts` (20) | MODIFY | Sweep, fee and price marking cases go; visit, habit and nudge cases arrive. |
| `tests/unit/store.test.ts` (9), `tester-store.test.ts` (3) | MODIFY | Quiz and allocation actions go. |
| `tests/unit/validate.test.ts` (40) | MODIFY | Rewritten for the v2 shape. |
| `tests/unit/simulator.test.ts` (7) | MODIFY | Add minute of day determinism. |
| `tests/unit/copy.test.ts` (6) | MODIFY | Extend the dash scan to `shared/`, `api/`, `db/` and `public/sw.js`, add the retired privacy promise as a banned string, and add the R15.7 advice assertions over the loaded content. |
| `tests/unit/cycle2-fixes.test.ts` (7), `cycle4.test.ts` (11) | MODIFY | Keep the cases that survive; delete the rest with a count. |
| `tests/unit/tester-domain.test.ts` (46), `tester-cycle2.test.ts` (43), `tester-cycle4.test.ts` (26) | MODIFY | The tester's own files. Delete only the cases that test deleted behavior, never a case that still holds. Report the count. |
| `tests/unit/contrast.test.ts` (71) | KEEP | Palette is unchanged. Extend only for new components. |
| `tests/unit/dates.test.ts` (6), `money.test.ts` (7), `prng.test.ts` (5), `summer.test.ts` (6), `smoke.test.ts` (1) | KEEP | Unaffected. |
| `tests/unit/habits.test.ts`, `nudges.test.ts`, `estimate.test.ts`, `places.test.ts`, `ledger.test.ts`, `jar.test.ts`, `parity.test.ts`, `push-client.test.ts`, `sw-constants.test.ts`, `content-tooltips.test.ts`, `import-boundary.test.ts` | NEW | Sections 11.2 and 11.3. `parity.test.ts` keeps its name and now runs one fixture against one implementation (section 7). |
| `tests/db/*.test.ts` | NEW | The database integration project, run by `npm run test:db` against an isolated Neon schema (11.3). |
| `tests/e2e/*.spec.ts` (11 files) | MODIFY | Every spec that visits `/portfolio`, `/onboarding/quiz` or `/onboarding/allocation`, or asserts on growth, holdings, sweeps or the fee, loses those cases. Route guard cases are rewritten against the new redirects. |
| `tests/e2e/v2-loop.spec.ts` | NEW | The definition of done walk (section 11.2). |
| `tests/e2e/pwa.spec.ts`, `push.spec.ts`, `learn.spec.ts` | NEW | The install and permission states (criteria 19, 20, 24), CDP push delivery (criterion 23), and the Learn library (criterion 27). |

#### Expected test count change

Baseline verified by the architect on 2026-09-08: `npm test` is 348 of 348 passing
across 22 files. Deleting the three price, brokerage and risk files removes exactly 27
cases. The coder should expect to delete a further 45 to 80 cases across the modified
unit and e2e files, and to add roughly 90 to 140 new ones. The plan's expectation is a
final unit count between 380 and 440, with a minimum of 70 deleted cases in total. The
coder reports the exact numbers, before and after, plus the per file deletion count, in
`03-build-notes.md`. A final count near 348 with few deletions means dead tests were
left standing and is a failure of step 1.

Amendment 2 does not change those unit numbers: the iOS suite it removes was never written,
so nothing is subtracted. It adds a **separate** database integration project of 12 to 20
cases run by `npm run test:db` (11.3), and roughly 8 to 14 further Vitest cases for the push
client, the service worker constants, the content and tooltip coverage check and the
`src` to `api` import boundary. Report those separately from the unit total, because mixing a
suite that needs a live database into the headline count makes a red build ambiguous.

### 1.2 Fate of the risk quiz and the allocation builder

Both are deleted. Their only job was to produce an `Allocation` for a simulated
brokerage to buy against, and to render a risk read computed from a price series.
Neither input exists. Keeping a five question quiz that outputs a label the app never
uses again would be a screen with no job, which is exactly what the brief's "one flow,
no tiers" positioning forbids. That much is unchanged from the architect's original
plan.

At the plan approval checkpoint the user amended assumption A5: instead of replacing
the quiz and the builder with nothing, keep a light version, a short "what are you
invested in" capture that feeds the manual ledger, without the simulated risk read.
This is `InvestCapture.tsx` (section 8.7a, new): the user taps the holding types that
describe what they actually have (a broad index fund, a target date fund, individual
stocks, crypto, cash savings, or something else in free text), enters an amount for
each one they select, and saving writes one ledger entry per selected type through the
same `addLedgerEntry` action the Invest screen's own form already uses. It is a
capture, not a quiz: it asks what is true, not what the user prefers or how they feel
about risk, and it computes nothing from the answer beyond what R7 already computes
from any ledger entry.

To be exact about what this amendment does not bring back: no simulated portfolio, no
allocation percentage computed against a simulated value, no risk read, no expected
range chart, no price data, and no Recharts. Those deletions all stand exactly as
originally planned. `src/content/quiz.ts` is still deleted outright and is not reused;
the capture's six holding type labels are new, small content in
`shared/content/holdingTypes.json` (section 7.2), not a rewrite of the quiz's
questions. `AllocationBuilder.tsx` and `AllocationBar.tsx` are still deleted outright
and are not reused either; a slider over percentages and a proportional bar are the
wrong shape for a flow that only ever records a dollar amount the user typed against a
label the user chose.

The manual ledger's own form keeps its free text field with suggestions (R7.1)
independent of this capture; a user who wants to type something not on the six chip
labels can still do that directly on Invest.

What is still lost, named honestly: the brief's "live risk read as you drag" moment
goes away. It was one of the brief's signature interactions. It cannot survive without
a simulated portfolio to apply it to, and inventing a risk read for money the app does
not hold would be the exact kind of fake number this pivot exists to remove. The
capture softens the loss by giving the user a fast way to say what they hold, but it
does not restore the read.

### 1.3 Fate of the fee, the summer screen, and the lessons

**The $1 per month fee: removed from v1 behavior.** The fee was implemented as a sale
of simulated holdings on the first of each simulated month. With no holdings there is
nothing to deduct from, and the app moves no money in either direction, so charging a
simulated fee against a real user's kept balance would be a fabricated debit in a
ledger they trust. `fee.ts`, `FeeEvent`, the fee card and the fees so far line all go.
Settings keeps one honest line: "This demo does not charge you anything and does not
touch your money." The brief's "cheaper, transparent pricing" positioning is now an
open question for the user, listed in section 12, not something the architect invents.

**The summer money screen and the 7% projection: kept, unchanged.** This is the answer
to what replaces the growth line. The projection was never market data; it is a stated
assumption applied to the user's own answers, disclosed in a tooltip, and it does the
emotional job the brief cares most about, which is making a small number feel like a
large one later. Deleting it would remove the mission carrying scene while removing
nothing that was fake in a new way. Both curves keep rendering, now in inline SVG.

**The eight lessons: kept, three rewritten.** Five survive verbatim. `L3 Your jar just
became shares` is rewritten as `L3 The coffee you didn't buy` and retriggered on the
first skip, because the jar no longer becomes shares. `L4 Why a dip isn't a loss` keeps
its title and most of its body, gains two sentences saying that this app deliberately
never shows you a number going down because it does not watch prices at all, and is
retriggered on the first ledger entry, which is the moment the fear becomes real. `L7 Why
$20 a week beats $500 later` is rewritten as `L7 Why early money has more time to grow`
per the advice policy revision in section 4 (R15) and section 9.6a, because its original
title and body read as a tailored comparison rather than a general principle. L1, L2, L5,
L6 and L8 are unchanged, so the fear check mapping (rent to L6, pointless to L7, confused
to L8, losing to L4) still holds.

### 1.4 What replaces "growth is always shown since you started"

The brief's voice rule said growth is always shown since you started rather than as a
daily change. In v2 there is no valuation to grow, so the rule has nothing to compute.
The replacement, in the brief's voice, is two numbers the app actually knows plus one
projection it labels as an assumption:

1. **Kept since you started**, the sum of every round-up, catch and skip. This is a
   fact the app owns end to end.
2. **Moved into investments**, the sum of the ledger's contributions. This is a fact
   the user typed and the app repeats back.
3. The existing **by 30** projection on the summer headline, at a disclosed 7%, applied
   to what was kept.

Home says, in plain words, that the app does not know what those investments are worth
today, and that this is on purpose. No percent, no arrow, no color coded delta, no
chart of a value the app cannot see.

**Recommendation on the optional self reported current value: do not build it in v1.**
It is listed as deferred in section 3. A user typed "what it's worth today" would let
the app show a difference, but that difference is only as good as the day the user last
opened their brokerage app, it decays silently, and it reintroduces exactly the
"looks and feels real" pressure that produced v1's synthetic price series. If the user
wants it later, the ledger schema in R7.1 already has room for a dated
`selfReportedValueCents` field, and adding it is a small change.

### 1.5 Fate of the iOS work, and of the no backend decision

**`.dev-team/ios-spike/` is now dead exploratory work. Delete it, in build step 1.** It holds
a hand written `project.pbxproj`, a `Package.swift` and a README of verified commands, all
produced to prove an Xcode project could be built without the IDE. That proof was real and it
is now irrelevant, because there is no iOS target in this plan and there will not be one
without a new interview. Recommendation, stated plainly because the alternative is tempting:
**delete it rather than leaving it in place "in case".** A half built Xcode project sitting in
a web only repository is actively misleading. The next person to open this repo will spend
time working out whether iOS is in progress, blocked, or abandoned, and the answer is
abandoned. The three files are small, they are reproducible in an afternoon by anyone who
repeats the same verification, and the revision log below records that they existed and what
they proved. Nothing else in the repository references them.

No other iOS artifact exists: no `ios/` directory was created, no Swift was written, and no
Xcode scheme was checked in, so the deletion is those three files and the plan text that
described them.

**The no backend decision is reversed, and that is a bigger change than it looks.** Section 3
of the approved plan put "a backend, an account system, a password, or any network request at
runtime" out of scope, and the architect argued for that in the interview. It was right about
accounts and passwords, and wrong about the network, for one reason: the nudge. Section 6.0
sets out why a web app cannot fire a notification at 07:40 without a server. What survives of
the original position is most of it: no account, no password, no sign in, no app state on the
server, no analytics, no third party runtime service, and no network call that any other
feature depends on (R14.11, section 6.12). What changes is that a browser which has opted
into nudges now has one row on a server, and the Welcome screen can no longer say everything
stays on this device (section 9.4).

---

## 2. Definition of done

Twenty eight numbered criteria, all web, plus 20a and 20b added by the cycle 7 amendment 3 for
the iPhone standalone layout (6.13). Each is verified by running something. Browser criteria are
verified at 375x812 (mobile) and 1280x900 (desktop) unless stated; criteria 20a and 20b
additionally run at 393x852 and 430x932 (current iPhone Pro and Pro Max sizes, 6.13), and
375x812 stays the smallest supported size across all of them. The canonical demo URL is
`http://localhost:5173/?demo=1&freeze=1&start=2026-06-15&seed=42`. Criteria that touch an
API route are verified against `npx vercel dev` on `http://localhost:3000`, because the Vite
dev server does not serve `api/`. Criteria that touch the database are verified by
`npm run test:db` against the provisioned Neon instance, in an isolated schema.

**The loop**

1. From a cleared browser profile, the canonical URL completes onboarding (name, summer
   money, fear check) and lands on Home, at both viewports, with no console error.
2. `/portfolio`, `/onboarding/quiz` and `/onboarding/allocation` each redirect (to Home or
   the resume path) with query parameters preserved. No screen in the app links to them.
3. `grep -rn "recharts\|PriceSource\|Brokerage\|brokerage\|allocation\|riskProfile" src/`
   returns nothing outside a comment, `npm run build` emits no `charts` chunk, and
   `recharts` is absent from `package.json` and `package-lock.json`.
4. Pressing "Next day" in the demo tray fourteen times from the canonical URL produces at
   least one place with habit status true, and the Places screen names it.
5. The Places screen lists every inferred place with its visit count in the last 14 days, its
   usual time, and whether it is a habit. A habit place also shows the estimated amount,
   labeled an estimate.
6. When a nudge is due, Home shows the nudge card. Tapping "I'm skipping today" adds exactly
   the displayed estimate, to the cent, to the jar, and writes exactly one Skip line to
   Activity.
7. Leaving a nudge alone until the next simulated day produces no event, no toast, no change
   to any counter, and no copy anywhere referring to the missed nudge.
8. Muting a place suppresses its nudges while other places still nudge. Turning nudges off
   globally suppresses all of them. Both survive a reload.
9. At most one nudge exists per simulated day, verified by advancing thirty days with at
   least two habit places present and counting nudge events.
10. The jar's "I moved this into an investment" action opens the ledger form pre-filled with
    the jar amount. Saving creates one ledger entry, sets the jar to zero, and plays the jar
    move animation. "I spent it" sets the jar to zero, creates no ledger entry, and shows no
    disapproving copy.
11. The Invest screen shows the total contributed, the entry count, and every entry with its
    date, amount and what it went into. It shows no current value, no growth, no percentage
    return and no chart. A full text scan of the rendered page finds no "%" adjacent to any
    ledger figure.
11a. From the Invest screen, opening "What are you invested in", selecting index fund,
    individual stocks and crypto, entering an amount for each, and saving creates exactly
    three ledger entries, one per selected type, each dated today. No screen involved in this
    flow, including the moment of saving, shows a percent, a computed value, a risk label or
    a chart. Choosing "Something else" requires a free text label before it can be saved, and
    a blank or 61 character label is rejected.
12. Deleting a place from the Places screen removes it and its visits from the screen and
    from a fresh export, while its past Skip lines remain in Activity with their amounts
    intact.
13. An exported JSON file contains no key matching `/lat|lon|lng|coord|geo/i` and no floating
    point number outside the summer projection inputs.
14. The summer money screen renders both curves and the 7% assumption tooltip, with no network
    request and no chart library in the bundle.
15. Over a thirty day demo run, at least three confidence path lessons unlock. L3 unlocks on
    the first skip and not before. L4 unlocks on the first ledger entry and not before.
16. `npm run lint:copy` reports 0 problems across `src/`, `shared/`, `api/`, `db/` and
    `public/sw.js`, and `npm run lint:advice` reports 0 across `src/` and `shared/`.
17. Axe reports 0 serious and 0 critical violations on Home, Places, Invest, Activity,
    Settings, Welcome, Summer, Learn, a Learn reader page, the nudge card, and each of the
    Nudges card panels (off, install required, denied, on), in both themes, at both viewports.
18. `npm test` is green, `npm run test:db` is green, `npm run typecheck` is clean, and
    `npm run build` succeeds. A grep of `dist/` for the literal values of
    `VAPID_PRIVATE_KEY` and `CRON_SECRET` finds nothing.

**The PWA and the push backend**

19. `npm run build` produces `dist/manifest.webmanifest` and `dist/sw.js`. Under
    `npx vercel dev`: `GET /api/health` returns HTTP 200 with `content-type: application/json`
    and the applied migration id, proving the SPA rewrite no longer swallows `/api`;
    `GET /sw.js` returns JavaScript with `Cache-Control: must-revalidate`; every app route
    still returns the HTML shell. In desktop Chrome, the service worker reaches
    `activated` and the app is reported installable.
20. In Playwright with an iPhone Safari device profile, the Nudges card shows the install
    panel with its three Share sheet steps, `Notification.requestPermission` is never called
    (asserted by a page level spy installed before navigation), and every other screen in the
    app is fully usable. On a desktop Chrome profile the same card shows the toggle and the
    9.4a panel instead.
20a. With `(display-mode: standalone)` emulated and `viewport-fit=cover` honored, at 393x852
    and at 430x932, the computed top padding of the sticky header and the computed bottom
    padding of the bottom tab bar are each at least the emulated `env(safe-area-inset-top)` or
    `env(safe-area-inset-bottom)` value, no interactive element is obscured or unreachable by a
    scroll, and there is no horizontal scroll on the page body (6.13).
20b. Every screen a user can only reach by drilling in from a tab, Activity, Learn, a Learn
    reader page, a Lesson reader page, the invest capture screen, and Summer Money when
    revisited after onboarding, exposes a visible back or close control, and each of the three
    Nudges install and denied panels (9.4b, 9.4c) exposes a visible dismissal, all found and
    used by a Playwright test with the browser's own back and forward disabled, at 375x812,
    393x852 and 430x932 (6.13).
21. With notifications granted in Chromium, turning nudges on creates exactly one row in
    `push_subs`, keyed by the sha256 of the endpoint, carrying an IANA time zone. Querying
    the table's columns proves there is no column for a place, a name, an amount, a jar
    figure or an IP address. Subscribing twice from the same browser still yields one row.
22. `npm run test:db` proves the once a day scheduler: a row whose local nudge minute is
    still in the future relative to the run is selected, sent ahead of schedule (R14.4); the
    same row forty five minutes after its local nudge minute is selected; the same row sixty
    five minutes after its local nudge minute is not selected; a row already sent today is not
    selected even when the cron route is called a second time that day, with a valid bearer,
    proving the daily lock rather than the cron cadence is what prevents a duplicate send; the
    stale sweep clears an unsent minute once its local date is no longer today; and two rows in
    `Pacific/Kiritimati` and `Pacific/Niue` are each evaluated correctly against their own time
    zone in the same run. The cron route returns 401 without the bearer and 200 with it, and,
    because a real Vercel Cron on Hobby fires once a day at a time the tester cannot control,
    every one of these cases is also reachable by calling the deployed route directly with the
    bearer secret (6.8, 11.4), which is how the tester verifies the whole flow on demand rather
    than waiting for the daily trigger.
23. In Chromium, delivering `{"v":2,"t":"nudge","d":"<today>"}` to the registered service
    worker over CDP results in exactly one notification, whose title and body were composed
    on the device from the IndexedDB pending nudge record and contain the place display name
    and the estimate, and no coordinate, no address, no jar balance and no shame language.
    Clicking it opens the app on the nudge card, and taking the skip there credits the jar
    once. Delivering a payload with a mismatched date, and delivering an unparseable payload,
    each still result in exactly one notification, showing the 9.2a fallback with nothing
    personal in it. **Additionally verified by hand, and required to close the cycle:** one
    screenshot of a real notification arriving on a real iPhone with the app added to the
    Home Screen (11.4).
24. With the notification permission denied, the Nudges card shows the 9.4c panel, no row is
    created in `push_subs`, `Notification.requestPermission` is not called again on any
    subsequent render or reload, and the entire loop still works: habits form, the in app
    nudge card appears on Home, and a skip credits the jar.
25. Turning nudges off deletes the server row (zero rows for that endpoint hash, asserted by
    querying the database) and unsubscribes the browser's `PushSubscription`. "Delete
    everything" in Settings does the same and then clears IndexedDB and local storage, and
    reports which parts succeeded. With the API unreachable, turning nudges off still turns
    them off locally and says honestly that the row could not be deleted yet.
26. In `npm run test:db`, a sender injected to return HTTP 410 for one endpoint deletes that
    row; a 404 deletes it; a 429 leaves it untouched with its `fail_count` unchanged; and
    five consecutive generic failures delete it.

**The lessons**

27. The confidence path still has exactly eight lessons and its progress ring still reads out
    of 8. The Learn library lists sixteen pieces across three tracks, every one of them opens
    with no unlock condition of any kind from a freshly cleared profile on day 0, its header
    reads "N of 16 read", that count survives a reload, and the three surfacing moments (first
    Invest visit, first ledger entry, day 30) each show a highlight card that can be dismissed
    and never gates anything.
28. `npm run lint:advice` reports 0. A full text scan of every string in `shared/content/`
    and `src/content/` finds no ticker symbol outside the allowlist, no numeric return claim,
    no phrase from the banned advice list, no tailored allocation, contribution amount or
    timeline, and no dollar amount or other specific number sharing a sentence with a
    comparison word (`beats`, `beat`, `versus`, `vs`, `instead of`, `rather than`, `better
    than`, `wins`, `loses to`) per the revised R15.7. A general, unquantified principle
    ("money invested earlier has more time to grow") and a procedural first step ("most
    brokerages have no minimum now") both pass. A fixture holding the original, unmodified
    `lessons.json` L7 text ("Why $20 a week beats $500 later" and its body) fails the lint,
    proving the new pattern would have caught the shipped defect the tester found (V2-7).
    Every `[[term]]` marker in `learn.json` and `lessons.json` resolves to a tooltip entry,
    and every tooltip entry is used. The disclosure from 9.8a appears, verbatim and without
    any tap or expand, on the Learn library index, on every one of the sixteen individual
    Learn item pages, on every one of the eight individual lesson pages, on the Invest
    screen, and in Settings. A deliberately offending fixture string fails the lint, proving
    it is wired up, and the human review gate required by R15.7 layer 3 has been run at
    least once and is recorded as done in the status report before this criterion is
    considered met.

---

## 3. Scope

### Must have this cycle

- Deletion of the entire simulated investing engine, with its tests, per 1.1, and deletion of
  `.dev-team/ios-spike/` per 1.5.
- Place inference, habit detection and the usual time, from the merchant feed (R2, R3).
- Nudge scheduling with quiet hours, the daily cap, per place mute and global mute (R4).
- The skip, its estimate, and the jar credit (R5).
- The jar as a kept balance with a goal and two user actions (R6).
- The manual investment ledger (R7).
- The light "what are you invested in" capture feeding the manual ledger (1.2, section 8.7a).
- The Places screen, including per place delete (R11).
- Modified Home, Activity, Settings, Welcome, Summer, plus new Places and Invest.
- **The PWA shell**: manifest, icons, service worker, registration, and the three platform
  states of the install and permission flow, including the iPhone Safari add to Home Screen
  path (section 6.2).
- **The push backend**: Vercel Functions on Node.js, the four subscription routes, the cron
  send route, Web Push with VAPID through the `web-push` library, and the subscription
  lifecycle including expiry and rotation (R14, section 6).
- **The Neon Postgres schema and its migration**, one table, per 6.7.
- **On device notification composition** in the service worker, so no place name or amount
  reaches the server (6.9).
- **The rewritten privacy story** (9.4), replacing "everything stays on this device" wherever
  it appears.
- **The Learn library**: sixteen pieces across three tracks, ungated, with its own read count,
  the restored and new tooltips, and the three surfacing moments (8.9, 9.8).
- **The education not advice rule and its lint** (R15, `scripts/lint-advice.ts`).
- The rule fixture and its single Vitest runner (section 7).
- Export and import, unchanged in shape.

### Nice to have, deferred

- Self reported current value on a ledger entry (1.4).
- User editable quiet hours, including a window that crosses midnight (A10).
- Offline support: a precaching service worker with a versioning and eviction story.
- A second nudge per day, or per place daily caps.
- Cross device coordination of the daily cap, which would need an identity this cycle
  deliberately does not create (6.10).
- Cross device sync of app data, or importing a phone export by QR.
- Widening habit detection beyond a single merchant name.
- Milestone card variants for skip counts.
- Native apps, on any platform.

### Explicitly out of scope

- Any market data, price, quote, valuation, return, or projection based on a real holding.
- Any real money movement, brokerage connection, bank connection or payment.
- **Personalized investment advice of any kind, now a normative rule (R15).** The app records
  what the user says they did and explains how things work. It never recommends a security,
  predicts a return, tells the user what to buy, or implies a personalized recommendation.
- **Accounts, passwords, email addresses, sign in, or any identity beyond a push endpoint**
  (6.10). The reversal in this amendment is about a server, not about accounts.
- **Storing any app state on the server.** The database holds a push endpoint, a time zone,
  and a date and minute. Nothing else, ever, without a plan revision.
- Analytics, crash reporting, or any third party runtime service. The browser's own push
  service is the only external party, and it is reached by the server, not the page.
- iOS, Android, or any native binary.
- Migrating v1 saved state. A v1 envelope is detected and refused with a clear message
  offering Reset.

---

## 4. Domain rules

Normative. The code cites these ids in comments, for example
`// Plan v2 R4.4`. Every rule with arithmetic has at least one case in
`shared/fixtures/rules-v2.json`. All money is integer cents and all arithmetic is on
non negative integers unless stated.

### R1 Arithmetic and determinism

- **R1.1** Every monetary value in state, in events, in the ledger and in exports is an
  integer number of cents. No floats anywhere in the money path.
- **R1.2** Rounding is half away from zero on non negative inputs, using `Math.round`. A
  negative input in the money path is rejected rather than rounded.
- **R1.3** Integer division for averages rounds per R1.2 after the division, never
  before.
- **R1.4** Ordering is total and explicit everywhere a list is displayed or summed, so a
  refactor cannot change a result by changing iteration order. Where a tie is possible the
  rule names the tie break.

### R2 The feed, places and visits

- **R2.0 PRNG.** `mulberry32`, `fnv1a32`, `hash`, `randInt` and `pick` are exactly as in
  `src/domain/prng.ts` today, unchanged. With the iOS app withdrawn there is no second
  implementation and no port, so the cross language notes that used to live here are gone.
  What stays is the requirement that `rules-v2.json` carries at least eight PRNG cases,
  covering the first eight outputs for seeds 42 and 0. That is now a determinism guard rather
  than a contract: the seed determines every place, minute, estimate and nudge in the
  product, so a change here would move every number downstream with nothing else failing.
- **R2.1 Round-up.** `roundUpCents(amount) = (100 - (amount mod 100)) mod 100`. An exact
  dollar purchase yields 0 and produces no event. Unchanged from v1.
- **R2.2 Place identity.** A place id is the merchant name normalized: trim, collapse
  internal whitespace runs to a single space, then `toLowerCase()`. Merchant names are ASCII
  by construction, so there is no locale sensitive casing to worry about. The display name is
  the first spelling seen.
- **R2.3 Visits.** Every simulated purchase produces exactly one visit at that place,
  carrying `dayIndex`, `date`, `minuteOfDay` and `amountCents`. Subscriptions
  (Spotify, Streaming, Phone plan) produce a purchase and a round-up but **no visit**,
  because a recurring charge is not somewhere you went. This is the mechanism by which
  habit detection works with or without location.
- **R2.4 Minute of day.** For a visit at merchant `m` on day `d` with seed `s`, the
  minute is `clamp(round(gaussianFrom(hash(s, d * 1000 + merchantIndex)) *
  m.minuteSpread) + m.usualMinute, 0, 1439)`, where `gaussianFrom` is the existing
  Box Muller helper seeded by that hash and `merchantIndex` is the merchant's index in
  `shared/content/merchants.json`. Both implementations read that file, so the index is
  shared.
- **R2.5** Visits are retained for 90 simulated days. Older visits are pruned on tick.
  Pruning never removes a Skip event or a ledger entry.

### R3 Habit detection

- **R3.1 Window.** The window is the 14 simulated days ending on the current day,
  inclusive, that is `dayIndex - 13 <= visit.dayIndex <= dayIndex`.
- **R3.2 Count threshold.** A place needs at least 3 visits in the window.
- **R3.3 Usual time.** Sort the window's visit minutes ascending. The usual minute is
  the element at index `floor((n - 1) / 2)`. This lower median is used rather than an
  averaged median so that both languages produce the same integer with no float.
- **R3.4 Cluster threshold.** Compute the absolute deviation of each visit minute from
  the usual minute, sort those ascending, and take the element at index
  `floor((n - 1) / 2)`. This spread must be at most 45 minutes. A place that satisfies
  R3.2 but not this is not a habit, and the Places screen says so in words ("you go
  here, but not at a regular time").
- **R3.5 Habit status** is recomputed from scratch every tick from the window. There is
  no stored streak and no hysteresis. A place stops being a habit the day its window
  falls below R3.2 or above R3.4. This is the decay rule, and it is explainable in one
  sentence on screen.
- **R3.6 Priced visits.** A habit is nudge eligible only if at least one visit in the
  last 60 days has a known `amountCents` (R5.2).
- **R3.7** Habit detection never uses coordinates. A coordinate, where one exists, is
  display only and is used to label a place, never to decide anything.

### R4 Nudges

- **R4.1 Candidacy.** On each tick, a place is a nudge candidate if it is a habit
  (R3.5), is nudge eligible (R3.6), is not muted, global nudges are on, and it has not
  already been nudged on this `dayIndex`.
- **R4.2 Nudge time.** `nudgeMinute = usualMinute - 20`. If `nudgeMinute < 0` the place
  is not nudged that day.
- **R4.3 Quiet hours.** The nudge fires only if `360 <= nudgeMinute <= 1260`, that is
  06:00 to 21:00 inclusive. Outside that range, no nudge, silently.
- **R4.4 Daily cap.** At most one nudge exists per `dayIndex` across all places. When
  several candidates qualify, choose the smallest `nudgeMinute`; if two tie, choose the
  smaller place id by ordinal (byte wise) string comparison.
- **R4.5 Opt in.** Nudges are off until the user turns them on. Until then, no nudge is
  created, but habits are still detected and shown on the Places screen.
- **R4.6 Outcomes.** A nudge is `pending`, `skipped` or `expired`. The user taking the
  skip action sets it to `skipped` and applies R5. A nudge that is still `pending` when
  the day advances becomes `expired`, silently: no event is written, no counter moves,
  no copy anywhere refers to it, and the next day proceeds normally.
- **R4.7 Non skip is silent.** There is no "you went anyway" detection, no follow up
  notification, no negative copy, and no reduction of any figure. This is a voice rule
  with a code consequence: the tester should grep the strings file for any copy that
  could read as disapproval of a non skip.
- **R4.8 Mute.** Per place mute and global mute are independent. Muting a place is
  reversible, does not delete the place, and does not stop the place from appearing on
  the Places screen with its habit status.
- **R4.9 Notification content** is the same one sentence as the in app card, and carries the
  place display name and the estimate. It never carries a coordinate, an address, a merchant
  category, or the jar balance. It is composed on the device by the service worker, not on
  the server, and the push that triggers it carries none of it (R14.6, R14.7).

### R5 The kept money math

- **R5.1 Estimate.** For place `p` on day `d`, take the visits at `p` with a known
  `amountCents` and `d - 60 <= visit.dayIndex <= d`, sorted by `dayIndex` descending
  then by visit id descending, take the first 5, and compute
  `estimateCents = round(sum / count)` per R1.2 and R1.3.
- **R5.2** If that set is empty there is no estimate and no nudge (R3.6).
- **R5.3 Frozen at the moment of the skip.** The Skip event stores the estimate that was
  shown. Later visits never restate a past skip, and no screen recomputes a historical
  skip's amount.
- **R5.4 Labeling.** Everywhere the estimate appears it is labeled an estimate and the
  label says where it came from: what you usually spend here. Never presented as a fact
  about today.
- **R5.5 Credit.** A skip adds exactly `estimateCents` to the jar and writes one Skip
  event carrying the place id, the place display name, the estimate and the day.

### R6 The jar

- **R6.1 Sources.** The jar accumulates paycheck catches (`round(paycheck * pct / 100)`,
  pct clamped 1 to 20, default 5) and skips (R5.5). Nothing else adds to it.
  - **Round-ups are removed.** R2.1 is retired and nothing creates a `RoundUp` event. A day
    passing no longer moves money at all: the only things that fill the jar are the two the
    user chooses. Purchases are still generated, because habits are read off them, they just
    no longer round up.
  - The `RoundUp` event shape and its read paths stay for profiles saved before the removal,
    so old history still renders and old totals still count. Nothing writes one.
- **R6.2 No automatic sweep.** There is no threshold that moves money by itself. The
  sweep target from v1 is gone and is not replaced by another automatic destination.
- **R6.3 The jar goal.** A display only target, default $25, presets $10, $25, $50,
  $100, changed in Settings. The jar art fills against it. Reaching or passing the goal
  fires the celebration once per goal crossing and never forces an action. Passing it
  again after the jar is emptied fires again.
- **R6.4 "I moved this into an investment".** Opens the ledger form pre-filled with the
  whole jar amount and today's simulated date. On save: one ledger entry with
  `source: "jar"`, one JarMove event for the full jar amount, and `jarCents = 0`.
  Cancelling changes nothing.
- **R6.5 "I spent it".** Sets `jarCents = 0` and writes one JarEmptied event. No ledger
  entry. The confirmation copy is neutral and the Activity line is neutral.
- **R6.6** The jar is never negative and only ever changes by the operations above.

### R7 The manual investment ledger

- **R7.1 Entry shape.** `{ id, date (YYYY-MM-DD), amountCents (integer, > 0, <=
  100000000), what (1 to 60 characters after trim), note (0 to 200 characters),
  source ("jar" | "manual"), createdAt (ISO string) }`. `what` is free text with a
  suggestion list; the app never validates it against a security, a ticker or anything
  else. `date` may not be later than the current simulated date.
- **R7.2 Computed.** Total contributed (sum of `amountCents`), entry count, first entry
  date, and totals grouped by the exact trimmed `what` string, compared case
  insensitively for grouping and displayed in the first spelling seen.
- **R7.3 Never computed.** Current value, market value, gain, loss, return, percentage,
  share count, price, cost basis, projection from a ledger entry, or any comparison of
  one entry to another. The app makes no statement about what a ledger entry is worth
  today. This rule is enforced by acceptance criterion 11 and by a unit test asserting
  the ledger module exports no such function.
- **R7.4 Edit and delete.** Entries are editable and deletable. Deleting an entry with
  `source: "jar"` does not restore the jar; the copy says so before confirming.
- **R7.5 Ordering.** By `date` descending, then by `createdAt` descending, then by `id`
  descending.

### R8 The tree

- **R8.1** Stage is a function of simulated days since the first kept event of any kind
  (RoundUp, Catch or Skip), using the v1 table `[0, 0, 7, 21, 45, 90, 180]` where the
  index is the stage. Before the first kept event the stage is 0, a seed.
- **R8.2** Stage never depends on any amount, so a small jar still visibly grows.

### R9 Counters, and no streaks

- **R9.1** `keptThisWeekCents` is the sum of RoundUp, Catch and Skip amounts with
  `dayIndex > currentDay - 7`.
- **R9.2** `skipsThisWeek` is the count of Skip events in the same window.
- **R9.3** `keptSinceStartCents` is the sum of all RoundUp, Catch and Skip amounts.
- **R9.4 No streaks, ever.** There is no consecutive day counter, no "don't break the
  chain", no badge that a missed day removes. A missed nudge changes no number the user
  can see. This follows directly from the no shame voice rule and it is a hard
  constraint, not a preference.

### R10 Summer

- **R10.1** Curves per v1 plan 4.11: keep 10% of the stated summer earnings each year
  from 19 to 65 at 7% nominal, against the same contributions starting at 30.
- **R10.2** By 30 headline: `round(keptDollars * 1.07 ^ max(1, 30 - age))`.
- **R10.3** The 7% is disclosed in a tooltip as an assumption on every screen it
  affects.
- **R10.4** Your money curve. R10.1 is a story about a hypothetical summer job and never
  moves once onboarding is done. R10.4 is its grounded companion: take the money the user
  really has set aside, `jarCents + ledgerTotal` (`putAsideCents`), and grow it from
  `clampAge(profile.age)` to `CURVE_END_AGE` at `ASSUMED_ANNUAL_RETURN`, one step per year,
  `v = v * (1 + rate)`. It is a lump sum growing, NOT an assumed future contribution rate,
  because the app does not know whether the user will keep going and inventing a rate would
  be the same dishonesty that got the price series deleted in v2.
  - Rendered in its own card on the Summer Money screen, below the R10.1 chart, on its own
    axis. The two cannot share a scale: real kept money is tens of dollars against tens of
    thousands, so a third polyline on the R10.1 axes sits flat on zero and reads as nothing.
  - With nothing put in yet the card shows a warm empty line and no chart, never a flat zero.
  - Carries the R10.3 disclosure, plus a line stating the app does not know what the user's
    investments are actually worth, so the number is never mistaken for a valuation.
  - **Revised 2026-09-10 (V2-9).** The formula was `keptSinceStartCents + ledgerTotal`. That
    counted a jar move twice (a $4.35 skip moved into an investment read $8.70) and kept
    growing money the user had said they spent. Each dollar now counts once: still in the jar,
    or recorded as invested.

### R18 What these are, on Invest

- **R18.1** Each holding type carries a neutral `what` line and a `learnId`, both in
  `shared/content/holdingTypes.json`. The line says what the thing IS and never whether it is
  a good idea, which is the R15 line.
- **R18.2 Static, for everyone.** The Invest reference card renders all six types, in the same
  order, with the same text, regardless of what the user's ledger holds. R15.4 forbids
  educational content that varies with the ledger, so nothing here may be filtered, reordered,
  highlighted or hidden based on what somebody owns.
- **R18.3** The Learn library covers stocks in depth across E07, E08, E11, E17, E18 and E19,
  and the practical side in E01 to E06 and E20. Adding a piece means updating the counts in
  `content-tooltips.test.ts`, `validate.test.ts` and `learn.spec.ts`; the Learn subtitle takes
  the total rather than naming it, because it said "Sixteen" while the library held twenty.

### R17 Habit metrics

The theme (`.dev-team/06-theme.md`) defines success as "I have a habit and I saved $X" and
forbids anything that can display a miss. These exist to make the repeated choice visible
without ever showing a gap.

- **R17.1 Skip count.** Lifetime count of `Skip` events. Monotonic: it can only rise.
- **R17.2 Kept by skipping.** Sum of `Skip` amounts only, so it answers "what did skipping
  get me" separately from a paycheck catch.
- **R17.3 Best week.** The most skips inside any 7 day window over the whole history, computed
  as a maximum rather than a current run. `days[hi] - days[lo] < 7` is the window, so day 1 and
  day 7 count together and day 1 and day 8 do not. It is a record: a quiet month afterwards
  leaves it exactly where it was.
- **R17.4 No streaks.** Nothing may render a consecutive day count, a broken run, a missed day,
  a target the user is short of, or a comparison to anyone else. Theme section 5.

### R16 Bond and CD terms

- **R16.1** A ledger entry may carry an optional `termMonths` and `yieldBps`, and only the
  bonds or CDs holding type offers them. Value at maturity is
  `round(principal * (1 + yieldBps / 10000) ^ (termMonths / 12))`. An APY already accounts
  for the bank's compounding, so raising it to the term in years is the whole calculation.
- **R16.2** Both are optional, but a value that is present and out of range is rejected rather
  than dropped when it is typed, in the ledger form and in the capture. A value an earlier build
  already stored is tidied instead (R16.8). Ceilings: 2500 basis points and 600 months (the rate ceiling was 5000 until V2-18, where 50% for 50 years on a $1,000,000 entry matured past 2^53 cents, the point where cents stop being exact), which are
  sanity bounds against a typo, not opinions about what a good rate is.
- **R16.3** This is allowed where a stock projection is not, and the distinction is the point.
  A stock number is a guess about markets. A CD's rate is a contract, and this is arithmetic
  on two numbers the user typed off their own statement. The copy beside it says so, and states
  the two things it does not model: selling before the end, and an issuer that does not pay.
- **R16.4** Nothing here ranks, recommends, or compares products. It reports what the user's
  own stated rate pays, and nothing else. R15's second list still applies in full.
- **R16.5** Only a bonds or CDs row may carry a term and a rate. Entries store `holdingType`
  (the capture's key) from 2026-09-10; an entry without one counts as a bond row only when its
  `what` is the Bonds or CDs label. Enforced in `validateDraft` (`notBond`), on an edit against
  the row as it will be stored (`editKeepsBondRule`, V2-25), by R16.8 on load and import, and on
  Invest before a maturity line renders. (V2-12) The type is picked from the six types in the
  ledger form, never read from the free text name, and picking any type but Bonds or CDs clears
  the term and rate. Invest shows the type beside the name whenever the two differ (except
  Something else, whose name is always typed), so a CD named "Individual stock" still reads as
  a CD. (V2-23, owner decision 2026-09-11)
- **R16.6** An edit keeps what its form did not show. In a draft, `undefined` keeps the stored
  term or rate and `null` clears it. The edit form shows both fields on a bond row. (V2-10)
- **R16.7** The capture reads "4.5", "4.5%" and "4,5" alike, rounds to a whole basis point half
  away from zero from the exact decimal string, and refuses rather than drops a value it cannot
  use, fractional months included. A term with no rate is saved on its own. (V2-11)
- **R16.8** Data an earlier build saved under looser rules is tidied, never refused. On load
  (persist version 2) and on import, a term or rate that is out of range, or that sits on a row
  that is not a bond or a CD, is removed from that row; its amount, name and date are kept. The
  user is told once how many rows changed. A term or rate that is not a number at all is a
  damaged file and is still refused, and an import that fails any check says what failed
  rather than claiming the file is not an export. (V2-21, owner decision 2026-09-11)

### R11 Privacy and deletion

- **R11.1** A coordinate, if one exists, is stored only on the place record, never on a
  visit, a Skip event, a ledger entry, a milestone image, a notification, or an export.
- **R11.2** Exports contain places by display name, visit counts and day indexes only.
- **R11.3 Deleting a place** removes the place record, its coordinate and all of its
  visits, and cancels a pending nudge for it. Past Skip events keep their stored place
  display name and amount, because they are the user's record of money they kept. The
  confirmation copy states exactly this before deleting.
- **R11.4** There is a "delete every place and visit" action in Settings that performs
  R11.3 for all places at once.
- **R11.5** No screen, log, export or notification ever contains a street address.
- **R11.6 What may leave the device.** Exactly three values, and only while nudges are on:
  the push endpoint the browser generated with its two subscription keys, the IANA time zone,
  and one date with one integer minute (R14.2). Nothing else, in any form, for any reason,
  without a plan revision and a rewrite of section 9.4. A place name, a merchant name, an
  amount, an estimate, a jar or ledger figure, a counter, a lesson state, the user's name,
  age, fear answer or summer figures must never appear in a request body, a query string, a
  log line or a push payload.
- **R11.7 Server side deletion is complete.** Turning nudges off deletes the row. There is no
  archive, no backup, no analytics copy and no second table, so there is nothing left to
  delete afterwards, and the copy in 9.5 is allowed to say so because it is true (R14.9).

### R12 Lesson triggers

- **R12.1** L1 on the first habit spotted (changed 2026-09-10, V2-16: round-ups are gone, and
  L1 is now its own lesson about how a usual stop is spotted). L2 on the first Catch. **L3 on
  the first Skip.**
  **L4 on the first ledger entry.** L5 on day 30.
- **R12.2** The fear check unlocks its mapped lesson (rent to L6, pointless to L7,
  confused to L8, losing to L4) at day 0, unchanged.
- **R12.3** The remaining unlocked fear pool lessons unlock on day 10 and day 20 as in
  v1.
- **R12.4** Each lesson unlocks once and is never relocked.
- **R12.5 The Learn library has no triggers at all.** All sixteen pieces (8.9, 9.8) are
  readable from day 0 on a freshly cleared profile. Nothing in the library is gated on a
  skip, a ledger entry, a day count, a lesson, or anything else. Three moments **surface** a
  piece, which means showing a dismissible card on Home that links to something already
  readable: the first visit to Invest surfaces E01, the first ledger entry surfaces E04, and
  day 30 surfaces E13. Surfacing never unlocks, never relocks, and never changes what is
  reachable. This is also the clean replacement for the v1 triggers that referenced sweeps
  and dips: those belonged to the confidence path, which R12.1 has already retriggered onto
  the first skip and the first ledger entry, and the library simply has none.

### R13 Order of operations on a tick

Exactly this order:

1. Advance `dayIndex` and recompute `date`.
2. Expire any pending nudge from the previous day (R4.6), silently.
3. Generate the day's purchases (R2.4 gives each a minute of day).
4. Record visits for non subscription purchases (R2.3).
5. Apply round-ups to the jar (R2.1), unless paused.
6. Queue a paycheck if one is due.
7. Prune visits older than 90 days (R2.5).
8. Recompute habit status for every place (R3).
9. Select and create at most one nudge (R4).
10. Evaluate lesson triggers (R12).
11. Evaluate milestones.

Accepting a catch or taking a skip happens outside the tick, applies its jar credit,
then runs steps 10 and 11 only.
### R14 Nudge delivery and scheduling

New this amendment. R4 decides whether a nudge exists; R14 decides how it reaches a browser
that is not open. Every rule here is implemented once in `src/lib/push.ts` and once in
`api/_lib/due.ts`, and the boundary between them is the point of the whole design. As of the
cycle 7 amendment 3, the schedule the client publishes (R14.2) and the schema that stores it
(6.7) are unchanged by which cron plan is underneath; only R14.4 and R14.5 below flex to fit a
scheduler that runs once a day (6.8) instead of every few minutes, and moving to a more
frequent trigger later (6.8a) is a constant change in those two rules, not a rewrite of R14.

- **R14.1 The device decides, the server only wakes it.** All nudge selection, candidacy,
  quiet hours and the daily cap (R4) happen on the device, from the device's own data. The
  server never evaluates whether a nudge is warranted, never sees a place, and never composes
  a sentence. It has one job: deliver a content free wake signal to one browser at one
  minute.
- **R14.2 Schedule publication.** Whenever a tick creates, clears or resolves a pending nudge,
  and nudges are on and a subscription exists, the client posts
  `{ endpoint, auth, tz, nudgeLocalDate, nudgeLocalMinute }` to `/api/push/schedule`. A null
  `nudgeLocalMinute` clears the schedule. The body carries no place id, no display name, no
  amount, no jar figure, no counter and no event. Calls are skipped when nothing changed and
  debounced to at most one every ten seconds.
- **R14.3 Time zone, not offset.** `tz` is the IANA name from
  `Intl.DateTimeFormat().resolvedOptions().timeZone`. The server validates it by constructing
  an `Intl.DateTimeFormat` with it inside a try and catch and rejects anything that throws
  with a 400, storing nothing. A client that cannot resolve a zone sends `UTC` and the Nudges
  card says plainly that nudges may arrive at the wrong time. An offset is never stored,
  because an offset is wrong twice a year.
- **R14.4 Due selection, once a day.** The scheduler runs once daily (6.8), so due selection
  can no longer wait for a later pass to catch a row whose target is still ahead of it. A row
  is due when, evaluated in its own `tz` at the instant the single daily run fires:
  `nudge_local_date` equals the local date, `nudge_local_minute` is not null,
  `last_sent_local_date` is not the local date, and `nudge_local_minute` is greater than the
  current local minute of day minus 60. There is no upper bound: a row whose target minute is
  still hours ahead is sent now, ahead of schedule, because there is no later run today to
  catch it instead. On a successful send, `last_sent_local_date` is set to that local date and
  `nudge_local_minute` is cleared, exactly as before; this now also guards against a duplicate
  send if the route is called more than once in a day, which happens routinely when a tester
  triggers it by hand (11.4) instead of waiting for the daily cron.
- **R14.5 Late is worse than never, and the threshold widens to match the platform.** A nudge
  more than 60 minutes past its minute is never sent; it is dropped silently, for that day
  only, and its minute is cleared by the stale sweep. Sixty minutes, not ten, because the
  single daily run's own trigger time can land anywhere inside its scheduled UTC hour (6.8),
  and a tighter threshold would drop rows for no reason other than the platform's own
  imprecision. This still follows from R4.7: a nudge that arrives long after you already went
  is a notification about a failure, and this app does not send those. A row sent ahead of
  schedule under R14.4 is not "late" in this sense at all; lateness only ever applies to a
  target minute already in the past.
- **R14.6 Payload.** The push payload is exactly `{"v":2,"t":"nudge","d":"YYYY-MM-DD"}` and
  carries nothing else. `d` is the local date the device asked for, and the service worker
  refuses a payload whose date does not match its pending record, which is what stops a
  delayed or replayed push from describing yesterday.
- **R14.7 Composition on the device, and always exactly one notification.** The service worker
  reads the pending nudge record from IndexedDB and composes the title and body per section
  9.2. If it cannot read one, or the date does not match, or the payload will not parse, it
  shows the fallback in 9.2a and nothing personal. **Every push event results in exactly one
  `showNotification` call, in every branch, including every error branch.** A browser that
  receives a push and sees no notification may show its own generic message and may
  eventually revoke the permission, so a silent path here is not a quiet failure, it is a
  slow way to lose the feature.
- **R14.8 Failure handling.** HTTP 404 or 410 from the push service deletes the row
  immediately, because both mean the subscription is gone. 429 leaves the row untouched and
  does not increment anything. Any other failure increments `fail_count`; at 5 the row is
  deleted. A success resets `fail_count` to 0.
- **R14.9 Retention.** A row exists only while nudges are on. Turning nudges off, deleting
  everything, an unsubscribe, or a 404 or 410 all delete it. The scheduler deletes any row
  untouched for 90 days. There is no archive, no backup and no second table, so deleting the
  row is a complete deletion.
- **R14.10 The cap is per subscription, per local day.** There is no cross device
  coordination, because there is no identity that spans devices (6.10). A person with the app
  on two browsers can receive two nudges on the same day. Accepted this cycle, and named in
  assumption A8.
- **R14.11 The backend is never load bearing for anything else.** With the API unreachable
  the whole product still works (6.12). No screen blocks on a network call, no fetch runs
  without a five second timeout, and nothing claims a nudge was scheduled when the call
  failed.

### R15 Education, not advice, with one deliberate carve out

Revised this cycle at the user's direction, and still a hard constraint rather than a
preference. Their words: general information can carry a visible disclosure instead of being
banned outright, but nothing that reads as a personal recommendation ever gets cured by a
disclosure, because the user is not a registered investment adviser and a disclaimer does not
turn a personalized recommendation into general education. That is a factual limit, not a
style choice, and it is why the line below has two lists rather than one. It matters more now
than in v1 because the app carries a real ledger the user types real amounts into, and because
the Learn library talks about markets. Every rule here applies to lesson bodies, Learn pieces,
tooltips, screen copy, empty states, toasts, notification text and error messages alike.

**Allowed, and only ever with the disclosure from R15.6 visible on the same screen:**

- **General principles and rules of thumb that apply to everyone**, stated impersonally, with
  no reference to this user's own numbers: "money invested earlier has more time to grow",
  "spreading money across many companies lowers the risk that any one of them sinks you",
  "most people start with a broad fund rather than picking companies". A principle stays
  general as long as it is true of any reader and does not resolve to a specific number, date
  or amount this reader should act on.
- **Practical first steps that are procedural rather than a recommendation**: "opening an
  account usually needs your ID and a bank link", "most brokerages have no minimum now". These
  describe how a process works, not which choice within it to make.
- **Encouragement to start**, unqualified, because it is the entire point of the product:
  telling someone that starting small and starting now is worth doing does not choose an
  account, a fund or an amount for them.

**Still not allowed, disclosure or not, because a disclosure cannot cure these:**

- **R15.1 No named security, ever.** No ticker symbol, fund name, company name, brokerage
  name, product name or brand appears anywhere in the app's copy. Categories are allowed ("a
  broad index fund"); instances are not. The five real ETF tickers from v1 left with the
  price series and do not come back in prose.
- **R15.2 No predicted, promised or guaranteed return.** The only forward looking number in
  the entire app is the summer projection, at its disclosed 7% assumption, applied to the
  user's own answer, labeled an assumption every time it appears (R10.3). No lesson, tooltip
  or string states a historical or expected return figure, a growth rate, or a comparison of
  what one thing returned against another. A general, unquantified principle ("earlier money
  has more time to grow") is allowed under R15's new first list; a number, a rate or a
  promise attached to it is not.
- **R15.3 No tailored allocation, contribution amount or timeline.** Copy never tells this
  reader what to put where, how much to put in, or when, in a way that reads as sized to
  their own situation: no "you should", "we recommend", "put your money in", "the best X is",
  "start with $X", "invest $X a week", or any construction, numeric or not, that resolves to
  an instruction about this reader's funds. A general rule of thumb stated for everyone is
  R15's new first list; the moment a specific amount, date or split is attached to what
  "you" should do, it is this rule, and it stays banned regardless of a disclosure sitting
  next to it.
- **R15.4 No personalization of educational content.** No lesson or Learn piece varies its
  text based on the user's ledger, amounts, age, fear answer or place data. The fear check
  chooses which confidence path lesson unlocks first, and that is the only permitted
  personalization anywhere: it selects, it never rewrites. Nothing in the app ever says
  "based on what you have invested".
- **R15.5 No ranking of options, and no comparison that implies an outcome.** The app does
  not say one account type, fund shape, market or approach is better, safer, smarter or more
  suitable than another, and it does not frame two choices, amounts or timings as one
  "beating" or "winning against" the other. It says what each one is, and, where R15's first
  list allows it, what people in general tend to do. The ledger's suggestion list is a list
  of words a user might type, ordered arbitrarily and fixed, never a shortlist of things to
  buy.
- **Anything that reads as a personalized recommendation, full stop.** If a reasonable person
  would come away thinking the app just told them what to do with their own money, it is
  banned, whatever list of allowed phrasing it borrows from and whatever disclosure sits next
  to it. A disclosure discloses; it does not launder a recommendation into education.
- **R15.6 The disclosure, and where it must be visible.** Exact copy and full placement list
  live in section 9.8a. In short: it now appears on the Learn library index, on every one of
  the sixteen individual Learn item pages, on every one of the eight lesson pages, on the
  Invest screen, and in Settings, because the app now carries general principles that need a
  disclosure next to them wherever they can be read, not only at the top of a list a reader
  may never scroll back to. It is one short line repeated verbatim everywhere it appears, not
  a paragraph, so that reading it once tells you what it will say every other time.
- **R15.7 Enforcement, in three layers, and all three are required.**
  1. `scripts/lint-advice.ts`, run in `prebuild` and in CI, scanning `src/content/**`,
     `shared/content/**` and string literals under `src/**`. It must still fail on the
     original banned phrase list (`you should`, `we recommend`, `recommended for you`, `best
     fund`, `best stock`, `best etf`, `best investment`, `guaranteed`, `risk free`, `can't
     lose`, `beat the market`, `outperform`, `our pick`, `top pick`, `will grow`, `will
     return`, `will make you`, `buy now`, `you need to buy`), on any all capitals token of 2
     to 5 letters not in the small explicit allowlist (`ETF`, `IRA`, `USD`, `FDIC`, `SIPC`,
     `UK`, `US`, `PWA`), and on any percentage adjacent to the words return, gain, growth or
     profit. It gains a new pattern this amendment: a dollar amount or other specific number
     appearing within the same sentence as a comparison word (`beats`, `beat`, `versus`,
     `vs`, `instead of`, `rather than`, `better than`, `wins`, `loses to`) fails, because that
     shape is exactly how R15.3 and R15.5 get violated without tripping the old phrase list,
     and it is exactly the shape the shipped `lessons.json` L7 title used. The lint must not
     fail on a general principle stated with no attached number ("money invested earlier has
     more time to grow" passes) or on a procedural first step ("most brokerages have no
     minimum now" passes), so the allowlist of impersonal framing words (`most people`,
     `generally`, `usually`, `in general`, `on average`, when not adjacent to a percentage)
     stays explicitly exempted from the imperative check. Before this amendment ships, add a
     regression fixture containing the original, unmodified L7 text ("Why $20 a week beats
     $500 later" plus its body) and assert the lint still fails on it under the new rules;
     this is the proof that relaxing R15 did not accidentally relax the one case it was
     already failing to catch.
  2. `tests/unit/copy.test.ts` gains the same assertions over the loaded content, so a
     violation fails the test suite and not only the build.
  3. **A human review gate, restated against the new line, and it has never run.** The
     manager reads all sixteen Learn pieces, all eight lessons and every new tooltip against
     this revised R15 before the cycle closes, checking specifically for the shape a lint
     cannot see: a general sounding sentence that a reasonable reader would still take as
     being told what to do. "Most people in your position end up in a broad index fund" is
     the standing example, and it would pass every automated check in this plan while being
     a personalized recommendation dressed as an observation. **This gate has not been run
     even once across v1 or v2, per the test report's V2-7 finding, and it must run before
     the next deploy, not as a nice to have but as the condition the plan treats R15 as met
     at all.** A lint pass is necessary and not sufficient; only this reading closes R15.

---

## 5. Architecture, web

Stack is unchanged except that Recharts leaves: React 18.3 with TypeScript, Vite 5,
Tailwind 3.4, Zustand 4.5, Framer Motion 11, idb-keyval 6, React Router 6, Vitest 2,
Playwright 1.47. No new runtime dependency is added.

### 5.1 The LocationSource interface

Add to `src/domain/interfaces.ts`, verbatim:

```ts
export type Cents = number; // integer

export interface PlaceVisit {
  id: string;            // `${dayIndex}-${seq}`
  placeId: string;       // R2.2 normalized merchant name
  displayName: string;   // first spelling seen
  dayIndex: number;
  date: string;          // YYYY-MM-DD
  minuteOfDay: number;   // 0..1439, R2.4
  amountCents: Cents | null;
}

export type LocationSourceKind = 'simulated' | 'device' | 'unavailable';

export interface LocationSource {
  kind(): LocationSourceKind;
  /** True when the source can add a coordinate to a place. Never gates habit detection. */
  isAvailable(): boolean;
  /**
   * Visits for a simulated day. The simulated implementation derives them from the
   * same purchase feed the transaction source produces, so the loop works identically
   * with no location permission at all (R2.3).
   */
  visitsForDay(dayIndex: number, ctx: SimContext, purchases: Purchase[]): PlaceVisit[];
  /** Display only coarse label, or null. Never used in any rule (R3.7). */
  coarseLabelFor(placeId: string): string | null;
}
```

`src/state/deps.ts` constructs `{ transactions, location }`. The app ships
`createSimulatedLocationSource()` only. With iOS withdrawn there is no device location source
in this cycle and no permission prompt of any kind for location; the interface stays because
habit detection is defined against it (R2.3, R3.7) and because a future browser geolocation
source would be a second conformer rather than a rewrite. Everything the product does works
with `kind()` returning `'simulated'` forever.

### 5.2 State shape, v2

`SCHEMA_VERSION = 2`, `STORAGE_KEY = 'spare-change-state-v2'`.

```ts
interface AppState {
  schemaVersion: 2;
  profile: { name; email; seed; createdAt; onboardingComplete;
             summerEarnedCents; summerLeftCents; age; fear };
  settings: { roundUpsPaused; catchPct; jarGoalCents; theme;
              nudgesEnabled; quietStartMinute; quietEndMinute; mutedPlaceIds: string[] };
  clock: { startDate; dayIndex; lastOpenedRealDate };
  jarCents: Cents;
  places: Place[];          // { id, displayName, firstSeenDay, lastSeenDay, coarseLabel|null }
  visits: PlaceVisit[];     // pruned at 90 days (R2.5)
  habits: Habit[];          // { placeId, isHabit, visitCount, usualMinute, spreadMinutes, estimateCents|null }
  nudges: Nudge[];          // { id, placeId, dayIndex, nudgeMinute, estimateCents, status }
  ledger: LedgerEntry[];    // R7.1
  events: LedgerEvent[];    // Purchase | RoundUp | Catch | Skip | JarMove | JarEmptied | Paycheck
  pendingPaychecks: Paycheck[];
  lessons: Record<LessonId, LessonState>;
  milestones: { first100Kept; firstSummer; pathFinished; firstSkipDayIndex; confettiShown };
  flags: { nudgeExplainerSeen: boolean; privacyExplainerSeen: boolean };
  demo: { summerOverride: 'on' | 'off' | null };
}
```

`habits` is derived, not authoritative: it is recomputed every tick from `visits`
(R3.5) and is stored only so the UI does not recompute on every render. The import
validator therefore recomputes it and ignores whatever the file claimed, which removes
a whole class of forged state.

`clock.tradingDayIndex`, `holdings`, `history`, `profile.allocation`,
`profile.quizAnswers` and `profile.riskProfile` are gone. `settings.sweepThresholdCents`
is replaced by `settings.jarGoalCents`.

### 5.3 Store actions

Removed: `setQuizAnswers`, `setAllocation`, `markAllocationExplainerSeen`.
Kept and unchanged: `setProfile`, `setSummer`, `setFear`, `completeOnboarding`,
`nextDay`, `skipWeek`, `landPaycheck`, `acceptCatch`, `declineCatch`, `markLessonRead`,
`updateSettings`, `setTheme`, `setSummerOverride`, `autoAdvance`, `resetDemo`,
`replaceState`.
New: `takeSkip(nudgeId)`, `dismissNudge(nudgeId)`, `mutePlace(placeId, muted)`,
`deletePlace(placeId)`, `deleteAllPlaces()`, `addLedgerEntry(draft)`,
`updateLedgerEntry(id, draft)`, `deleteLedgerEntry(id)`, `moveJarToLedger(draft)`,
`emptyJar()`, `setNudgesEnabled(on)`.

`src/state/persistence.ts` is not restructured. Only the key and version change, and
both come from config. The revision stamped mirror, the pagehide and visibilitychange
flushes and the freeze on import all stay exactly as they are.

### 5.4 The demo tray gains

The tray keeps Next day, Skip a week, Land a paycheck, Summer override and Reset, and
gains: **Force a nudge now** (creates a nudge for the highest ranked candidate on the
current day, ignoring R4.2 and R4.3 but not R4.1), **Make a habit** (injects three
visits at the same minute at a named place so a habit can be demonstrated without
fourteen taps), and a readout of place count, habit count and today's nudge status.
Do not restructure the tray's long press or `touch-action` handling.

`?nudge=1` performs "Force a nudge now" once at boot, so a Playwright spec can reach a
nudge in one navigation.

### 5.5 What the state shape gains for push

Added to `AppState` (5.2), all of it local and none of it ever exported to the server:

```ts
settings: {
  // ...unchanged fields...
  nudgesEnabled: boolean;      // R4.5, unchanged meaning
};
push: {
  supportState: 'ready' | 'needs-ios-install' | 'denied' | 'unsupported' | 'unknown';
  subscribed: boolean;
  endpointHash: string | null;   // for display and for the delete flow only
  tz: string | null;             // IANA, R14.3
  lastScheduleSent: { date: string; minute: number | null } | null;  // R14.2 dedupe
  lastError: 'network' | 'server' | 'permission' | null;
};
flags: {
  nudgeExplainerSeen: boolean;
  privacyExplainerSeen: boolean;
  serverPrivacySeen: boolean;    // the 9.4a panel, required before any permission prompt
  installExplainerSeen: boolean;
  investCapturePromptSeen: boolean;
};
```

`push` is device state, not user data: an import never restores it, and the validator drops
whatever an imported file claims for it and recomputes `supportState` from the browser. A
forged `push` block otherwise lets an import point a browser at someone else's endpoint hash
in the UI.

`settings.nudgesEnabled` remains the single source of truth for whether nudges are on. Being
subscribed with `nudgesEnabled: false` is a valid transient state during teardown, and the UI
reads `nudgesEnabled`, never `subscribed`.

### 5.6 What the store gains

New actions: `setPushSupport(state)`, `setPushSubscribed(hash, tz)`, `clearPush()`,
`setPushError(kind | null)`, `markServerPrivacySeen()`, `markInstallExplainerSeen()`.

`nextDay`, `takeSkip`, `dismissNudge`, `mutePlace`, `deletePlace`, `deleteAllPlaces` and
`setNudgesEnabled` all end by writing the pending nudge record (6.4) and calling
`syncSchedule()` (R14.2). That call is fire and forget: it is never awaited inside a reducer,
it cannot fail the action, and a rejection only sets `push.lastError`.

`src/state/persistence.ts` is still not restructured. Only the storage key, the schema
version and the additional pending nudge record write change.

### 5.7 The demo tray gains

On top of Force a nudge now, Make a habit and the existing controls: **Push state** (a
readout of `supportState`, `subscribed`, the last schedule sent, and the last error),
**Send a test push** (calls the schedule route with a minute one minute from now, so the
whole chain can be exercised without waiting for a habit), and **Show the fallback
notification** (posts an unparseable payload to the worker, which is the only convenient way
to see the 9.2a path). Do not restructure the tray's long press or `touch-action` handling.

---

## 6. Architecture, the PWA shell and the push backend

**This section used to be the iOS architecture. It is repurposed, not renumbered.** Every
section number in this document keeps the meaning it had, except this one, which now
describes the second surface the product actually ships on: an installable web app with
a small server behind it. Nothing else moves. Section 7 keeps its number and shrinks
(one fixture, one runner). If you are reading a cross reference to "section 6" written
before 2026-09-08, it meant iOS and it is now stale.

### 6.0 Why there is now a server, stated plainly

The v2 plan said no backend and no network request at runtime. That was correct for
everything except one feature, and the feature happens to be the product: a nudge
twenty minutes before your usual time. A web page cannot wake itself at 07:40. It has no
process when the tab is closed, and a service worker is only alive when the browser
decides to run it, which is when a push arrives, not when a clock ticks. There is no
background timer API in any browser that survives the tab closing. The alternatives were
honest and both bad: drop the nudge to an in app card that only appears when you happen
to open the app, which removes the reason the app exists, or ship a native app, which
the user has now ruled out. So a server sends the push. That reverses the "no backend"
line in section 3 and the "everything stays on this device" promise on Welcome, and both
are rewritten rather than quietly softened (6.8 and section 9.4).

What the server is not: it is not a sync service, not an account system, not a copy of
the app's data. It stores one row per browser that has nudges turned on, containing no
place, no amount, no name and no money figure. It is a doorbell with a clock.

### 6.1 Repository layout added this cycle

```
api/                                  Vercel Functions, Node.js runtime
  health.ts                           GET, returns { ok: true, migration: "0001" }
  push/
    vapid-public-key.ts               GET, returns the VAPID public key
    subscribe.ts                      POST, upsert a subscription
    schedule.ts                       POST, set or clear the next nudge minute
    unsubscribe.ts                    POST, delete the row
  cron/
    send-nudges.ts                    GET, bearer authenticated, the scheduler
  _lib/                               not routed (a leading underscore is not a route)
    db.ts                             getDb(), lazy, no Proxy
    push.ts                           web-push wiring, sendOne(), WebPushError mapping
    due.ts                            the due query and the stale sweep, injectable sender
    validate.ts                       body shape checks, IANA tz check, endpoint hash
db/
  migrations/0001_push_subs.sql
  migrate.ts                          npm run db:migrate
public/
  manifest.webmanifest
  sw.js                               hand written, plain JS, no bundler
  icons/icon-192.png icon-512.png icon-maskable-512.png apple-touch-icon-180.png
src/lib/push.ts                       client side support detection and lifecycle
src/lib/pendingNudge.ts               the one IndexedDB record the service worker reads
```

Nothing under `api/` or `db/` may be imported from `src/`, and nothing under `src/` may
be imported from `api/`. The two trees share types by copying a small interface file, not
by importing across the boundary. Reason: anything reachable from `src/` ends up in the
browser bundle, and the VAPID private key must never be reachable from there. A unit test
asserts the boundary by grepping for cross tree imports.

### 6.2 The PWA shell

**Manifest**, `public/manifest.webmanifest`, linked from `index.html`:

```json
{
  "name": "Spare Change",
  "short_name": "Spare Change",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#2f6b4f",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png",
      "purpose": "maskable" }
  ]
}
```

`index.html` also carries `<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">`
and `<meta name="apple-mobile-web-app-capable" content="yes">`, because iOS reads those
and not the manifest for the Home Screen icon. The viewport meta, the
`apple-mobile-web-app-status-bar-style` meta, and the safe area and back control layout work
a standalone launch needs on a real iPhone are specified in full in section 6.13, added by
this amendment; they belong here structurally but are kept together in one place rather than
split across two sections. `theme_color` must equal the existing
light theme header colour from the palette, not a new colour, so the contrast tests still
hold.

**Registration.** `src/main.tsx` registers `/sw.js` with scope `/` after the first paint,
inside a try and catch. A failed registration is logged once and changes nothing else:
the app must boot and run identically with no service worker at all.

**Three platform states, exactly what the user sees.** This is a requirement, not a
description. Detection lives in `src/lib/push.ts` and returns one of three values.

1. **iPhone or iPad, Safari, not installed.** Detected by a touch capable Apple user
   agent with `window.matchMedia('(display-mode: standalone)').matches === false` and
   `navigator.standalone !== true`. On iOS, Web Push exists from iOS 16.4 and only for a
   site added to the Home Screen; in a plain Safari tab `PushManager` is either absent or
   subscribing throws. The Nudges control on Settings is **visible and enabled**, and
   tapping it opens the install panel from section 9.4b: the three Share sheet steps, in
   words, with the note that nothing is installed from an app store, and the line that
   everything else in the app works the same either way. **No permission prompt is
   attempted in this state**, because Safari in a tab will either refuse or, worse,
   consume the user's one willing tap on a prompt that cannot lead anywhere. There is no
   silent failure and no disabled toggle with no explanation.
2. **iPhone or iPad, opened from the Home Screen (standalone).** The toggle triggers
   `Notification.requestPermission()` from the tap itself, which iOS requires, then
   subscribes. If iOS is older than 16.4, `PushManager` is missing and the app says so in
   one sentence and offers nothing further.
3. **Desktop Chrome, Edge, Firefox, Android Chrome, and desktop Safari on macOS 13 and
   later.** Push works in an ordinary tab with no install. The toggle prompts and
   subscribes directly. Where `beforeinstallprompt` fires (Chromium), the app captures the
   event and offers an optional "Install Spare Change" button whose copy says plainly that
   nudges work either way, so nobody installs under the impression that they must.

A fourth state exists and is handled: **permission already denied**. The app never calls
`requestPermission()` again, shows the section 9.4c panel explaining that only the user
can change it in their own browser settings, and states that a due nudge is still waiting
on Home when they open the app. No repeated prompting, on any render.

### 6.3 The service worker

`public/sw.js` is hand written plain JavaScript with no imports and no build step. It
handles exactly four events.

- `install`: `self.skipWaiting()`. No precaching this cycle. The app is not offline
  capable and does not claim to be; adding a cache without an eviction and versioning
  story is how a stale bundle gets pinned to a user's phone forever.
- `activate`: `self.clients.claim()`.
- `push`: **always calls `showNotification` exactly once.** It parses the payload
  (R14.6), and if the payload version or date does not match, or the payload is
  unreadable, it still shows the fallback notification from section 9.2a. This is not
  politeness: a browser that delivers a push and sees no notification may show its own
  generic "this site was updated in the background" message and, after repeat offences,
  revoke the permission. Composition itself reads the pending nudge record (6.4) from
  IndexedDB and builds the title and body per section 9.2, on the device.
- `notificationclick`: closes the notification and focuses an existing client at the app
  origin, or opens `/?from=nudge`. The action buttons are "I'm skipping today" and
  "Not today". "Not today" resolves the notification and does nothing else, writing no
  event and posting no message, per R4.7. "I'm skipping today" opens the app focused on
  the nudge card; the skip itself is applied by the app, on device, through the existing
  `takeSkip` action, because the service worker has no access to the store and must never
  become a second place where money math happens.

The service worker reads IndexedDB with about twenty five lines of raw `indexedDB` code
against the same database and store that `idb-keyval` uses in the app: database
`keyval-store`, object store `keyval`, key `spare-change-pending-nudge`. Those three
strings are declared once in `src/lib/pendingNudge.ts` and copied into `sw.js` with a
comment naming the source, and a unit test asserts the copies match, because a silent
divergence here produces a fallback notification forever with no error anywhere.

`vercel.json` sets `Cache-Control: public, max-age=0, must-revalidate` on `/sw.js`, so a
new worker is picked up on the next visit rather than living in the HTTP cache.

### 6.4 The pending nudge record

The only thing the service worker reads. Written by the store whenever the tick creates,
clears or resolves a nudge:

```ts
export const PENDING_NUDGE_DB = 'keyval-store';
export const PENDING_NUDGE_STORE = 'keyval';
export const PENDING_NUDGE_KEY = 'spare-change-pending-nudge';

export interface PendingNudgeRecord {
  v: 2;
  date: string;          // YYYY-MM-DD, the local date the nudge is for
  minute: number;        // 0..1439, the nudge minute (R4.2)
  placeName: string;     // display name, for the notification text
  estimateCents: number; // R5.1
}
```

It is never sent anywhere. It exists so the notification text can be written on the
device rather than on the server, which is the whole point of the design in 6.8.

### 6.5 Web Push on the client

`src/lib/push.ts`, using no library. The browser's own `PushManager` is the API and
there is no third party push provider: Web Push is a browser standard and the messaging
category in the marketplace only offers email, which is a different product for a
different job.

Lifecycle, in order:

1. `supportState()` returns `'ready' | 'needs-ios-install' | 'denied' | 'unsupported'`
   from the checks in 6.2. Called on every render of the Nudges card; it is pure and
   cheap.
2. `subscribe()`: fetch `GET /api/push/vapid-public-key`, convert the base64url key to a
   `Uint8Array`, call `registration.pushManager.subscribe({ userVisibleOnly: true,
   applicationServerKey })`, then `POST /api/push/subscribe` with the subscription JSON
   and the IANA time zone. `userVisibleOnly: true` is mandatory in Chromium and matches
   what the worker actually does (6.3).
3. `syncSchedule()`: called after every tick, and on app focus. Sends the next nudge date
   and minute, or a null minute to clear, per R14.2. Debounced to at most one call every
   ten seconds, and skipped entirely if the values are unchanged since the last successful
   call, which the store tracks in `push.lastScheduleSent`.
4. `unsubscribeEverywhere()`: `POST /api/push/unsubscribe`, then
   `subscription.unsubscribe()` locally, in that order, so a network failure leaves the
   server row to be cleaned up by its own 404 or 410 handling rather than orphaning it.
5. `pushsubscriptionchange` in the worker: the worker cannot reach the app's code, so it
   re-subscribes with the same `applicationServerKey` (cached in IndexedDB at subscribe
   time) and posts the new subscription to `/api/push/subscribe`, then posts the old
   endpoint to `/api/push/unsubscribe`. Browsers rotate endpoints; a design that ignores
   this event stops delivering after a few weeks with no error the user can see.

Every one of these calls is wrapped so that a failure is logged, surfaced once in the
Nudges card as "we could not reach the nudge service, everything else still works", and
never blocks, retries in a loop, or throws into React.

### 6.6 The backend, routes and runtime

**Vercel Functions on the Node.js runtime, not the edge runtime.** `web-push` needs
Node's crypto and will not run on the edge. Do not add
`export const config = { runtime: 'edge' }` to any file under `api/`; the default for
`api/*.ts` in a Vite project is already Node.js, and `vercel.json` pins only
`maxDuration`.

`vercel.json` becomes:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "functions": { "api/**/*.ts": { "maxDuration": 60 } },
  "crons": [{ "path": "/api/cron/send-nudges", "schedule": "0 10 * * *" }],
  "headers": [
    { "source": "/sw.js",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] }
  ],
  "rewrites": [{ "source": "/((?!api/|assets/).*)", "destination": "/index.html" }]
}
```

**The rewrite change is load bearing and is the single easiest thing to get wrong in this
cycle.** The existing SPA rewrite is `/((?!assets/).*)`, which matches `/api/push/subscribe`
and would hand it the HTML shell with a 200 status. The client would then fail on
`response.json()` with a parse error that looks nothing like a routing problem. Acceptance
criterion 19 exists to catch exactly this, by asserting `GET /api/health` returns
`content-type: application/json`.

Routes, all JSON in and JSON out, all rejecting any method other than the one named:

| Route | Method | Body | Returns |
|---|---|---|---|
| `/api/health` | GET | none | `{ ok, migration }`, 200 |
| `/api/push/vapid-public-key` | GET | none | `{ key }`, 200, cacheable for an hour |
| `/api/push/subscribe` | POST | `{ subscription: { endpoint, keys: { p256dh, auth } }, tz }` | `{ ok: true }`, 200 |
| `/api/push/schedule` | POST | `{ endpoint, auth, tz, nudgeLocalDate, nudgeLocalMinute }` | `{ ok: true }`, 200 |
| `/api/push/unsubscribe` | POST | `{ endpoint, auth }` | `{ ok: true, deleted: 0 or 1 }`, 200 |
| `/api/cron/send-nudges` | GET | none, `Authorization: Bearer CRON_SECRET` | `{ due, sent, deleted, failed }`, 200 |

Rules that apply to all of them:

- Nothing personal is ever placed in a URL or a query string. The push endpoint is a
  secret URL and travels in the request body only.
- `subscribe` upserts on the endpoint hash, so a repeat subscribe is idempotent and never
  creates a second row for the same browser.
- `schedule` and `unsubscribe` require the caller to present both the endpoint and the
  subscription's `auth` secret, compared against the stored value with a constant time
  comparison. There is no session and no token; the caller proves it is the subscriber by
  holding the same secret the push service already requires to send it anything. A
  mismatch returns 403 and changes nothing.
- Unknown or malformed bodies return 400 with a fixed message and are not logged with
  their contents.
- No route logs an endpoint, an auth secret or a time zone. Request IPs are visible to
  Vercel's own platform logging, which this project does not control and does not add to;
  the app itself stores none.

### 6.7 The database: Neon Postgres

Already provisioned through the Vercel Marketplace, attached to the `spare-change`
project, with `.env.local` populated. The coder does not provision anything and does not
run `vercel integration add`. Use `DATABASE_URL` (pooled) for the functions and
`DATABASE_URL_UNPOOLED` for migrations, which run DDL and want a direct connection.

**Lazy initialisation, no Proxy wrapper**, in `api/_lib/db.ts`:

```ts
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let cached: NeonQueryFunction<false, false> | null = null;

export function getDb(): NeonQueryFunction<false, false> {
  if (cached) return cached;
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  cached = neon(url);
  return cached;
}
```

Call `getDb()` inside the handler, never at module scope, so importing the module during
a build or a type check does not require the variable to exist.

**Schema. One table, and that is the whole server side data model.**

`db/migrations/0001_push_subs.sql`:

```sql
create table if not exists schema_migrations (
  id          text primary key,
  applied_at  timestamptz not null default now()
);

create table if not exists push_subs (
  endpoint_hash        char(64)    primary key,
  endpoint             text        not null,
  p256dh               text        not null,
  auth                 text        not null,
  tz                   text        not null,
  nudge_local_date     date,
  nudge_local_minute   smallint,
  last_sent_local_date date,
  enabled              boolean     not null default true,
  fail_count           smallint    not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint push_subs_minute_range
    check (nudge_local_minute is null or (nudge_local_minute >= 0 and nudge_local_minute <= 1439)),
  constraint push_subs_tz_nonempty check (length(tz) between 1 and 64)
);

create index if not exists push_subs_due_idx
  on push_subs (nudge_local_date)
  where enabled and nudge_local_minute is not null;

create index if not exists push_subs_stale_idx on push_subs (updated_at);
```

`endpoint_hash` is `sha256(endpoint)` in lowercase hex, computed server side. Columns
that deliberately do not exist: any user id, any name, any email, any place, any merchant,
any amount, any jar or ledger figure, any event, any IP address, any user agent. If a
future change wants one of those, it is a plan revision and a rewrite of section 9.4,
not a migration.

**Migration approach.** Numbered plain SQL files applied in filename order by
`db/migrate.ts`, run with `tsx`, connecting on `DATABASE_URL_UNPOOLED`, wrapping each file
in a transaction and recording its id in `schema_migrations`. No ORM, no migration
framework, no generated client. `npm run db:migrate` is idempotent and safe to run against
production. `/api/health` reports the highest applied migration id so a deploy that
forgot the migration is visible in one request rather than in a 500 at 07:40.

### 6.8 The scheduler, and the timezone crux

This is the heart of the design and it deserves being spelled out: **the user's nudge
minute is local, and the cron is not.** Vercel Cron fires on a fixed schedule in UTC. A
user in Lisbon and a user in Denver both want 07:40, and those are different instants, and
the difference is not even constant across the year.

**This amendment settles a question the previous version of this section had left open.**
The design wanted a cron every five minutes, said plainly that Vercel's Hobby plan does not
allow that, and left the choice of paying for Pro or living with a less accurate free
scheduler to the user. The user chose to stay on Hobby, with one nudge window a day. Two
Hobby facts drive everything below, and neither is a guess: cron jobs on Hobby run at most
once a day, and the actual trigger time can land anywhere within the hour of the scheduled
time, not at the scheduled minute itself. The cron expression is evaluated in UTC regardless
of plan.

The solve, in three parts:

1. **Store the time zone, not an offset.** An offset goes stale twice a year and gets
   daylight saving wrong for everyone. The client sends the IANA name from
   `Intl.DateTimeFormat().resolvedOptions().timeZone`, for example `America/Denver`. The
   server validates it by constructing `new Intl.DateTimeFormat('en-US', { timeZone: tz })`
   inside a try and catch and rejecting anything that throws, which also bounds the column
   to real names rather than arbitrary text.
2. **Run the cron once a day, at a UTC hour chosen against the user's own likely time
   zone, and let the database decide who is due.** The cron expression is `0 10 * * *`,
   10:00 UTC, once daily. Against `America/New_York`, the time zone the user is most likely
   in, that is a nominal 06:00 Eastern Daylight Time or 05:00 Eastern Standard Time, and,
   because Hobby's actual trigger can slip up to 59 minutes into that scheduled hour, a
   worst case actual fire of 06:59 EDT or 05:59 EST. Both are comfortably ahead of a typical
   morning coffee run, which is the point: the hour of slop is spent early, so it eats into
   the margin before a typical run rather than into the run itself. Postgres does the
   timezone arithmetic per row, correctly, including daylight saving, with
   `now() at time zone tz` where `tz` is the row's own column, exactly as before; only the
   trigger frequency changed.
3. **A wide grace window plus a per local day lock**, so one run a day cannot double send
   and cannot silently drop every row whose target time it cannot hit exactly.

**Which rows this single daily run actually sends to, stated plainly.** It is no longer
possible to wait twenty minutes before each person's own usual time; there is one shot a
day. A row whose target minute is still ahead of the run gets its nudge now, ahead of
schedule, rather than closer to the moment, because there will be no second run today to
catch it later. A row whose target minute has already passed by the time the run fires gets
sent if that is within the grace window below, and is otherwise skipped for that day: not
sent late, and not held to send tomorrow, for reasons stated after the query. The practical
effect for the user this plan is built around, someone on Eastern time with an ordinary
morning habit, is that most nudges arrive earlier in the morning than the ideal twenty
minutes before, sometimes by an hour or more; the practical effect for a habit later in the
day, or a subscriber in a very different time zone, is that the daily run may already have
happened, local time, before their target minute arrives, in which case they get no push
that day at all, though the in app nudge card still works the moment they open the app
(6.12). Section 9's copy is written to stop promising a precise arrival time because of
this (9.1, 9.4a).

The selection, in `api/_lib/due.ts`:

```sql
select endpoint_hash, endpoint, p256dh, auth,
       (now() at time zone tz)::date as local_date
from push_subs
where enabled
  and nudge_local_minute is not null
  and nudge_local_date = (now() at time zone tz)::date
  and last_sent_local_date is distinct from (now() at time zone tz)::date
  and nudge_local_minute >  (extract(hour   from (now() at time zone tz)) * 60
                           + extract(minute from (now() at time zone tz))) - 60
order by endpoint_hash
limit 500;
```

There is deliberately no upper bound on `nudge_local_minute` here. The old five minute
design needed one, because a later run would always come along to catch a row that was not
due yet. Under one run a day, dropping a row just because its target time has not arrived
yet would mean it never gets sent at all, which is worse than sending it early.

After a successful send, in the same run:

```sql
update push_subs
   set last_sent_local_date = $2, nudge_local_minute = null, fail_count = 0, updated_at = now()
 where endpoint_hash = $1;
```

And a stale sweep on every run, which is what makes a dropped nudge stay dropped rather
than firing tomorrow morning at the wrong moment:

```sql
update push_subs set nudge_local_minute = null, updated_at = now()
 where nudge_local_minute is not null
   and nudge_local_date < (now() at time zone tz)::date;

delete from push_subs where updated_at < now() - interval '90 days';
```

Consequences worth stating, because they are the interesting cases:

- **Delivery timing relative to each person's target minute now varies far more than
  before.** Because there is one run a day, and Hobby's own trigger time can land anywhere
  inside its scheduled UTC hour, most subscribers receive their push some amount of time
  before their computed nudge minute rather than the intended twenty minutes before it:
  typically under an hour for an Eastern time morning habit, and, for a habit later in the
  day, potentially several hours. This is a real change in what the notification means, not
  a rounding error, and section 9's copy says so rather than implying precision it cannot
  deliver.
- **A row whose target minute already passed when the run fires is sent if that is within
  the 60 minute grace window (R14.5), and skipped, silently, for that day only, otherwise.**
  Sending it anyway past that window was rejected: a nudge that shows up long after the
  coffee is already bought is a notification about a failure, and this app does not send
  those (R4.7, R14.5). Holding it to send the next day was also rejected, and not only on
  voice grounds: the service worker refuses a push whose date does not match its pending
  record (R14.6), which exists specifically to stop a delayed or replayed push from
  describing the wrong day, so a held send would just surface the anonymous fallback
  notification (9.2a) a full day later, which is worse than not sending anything.
- **This mainly costs subscribers far from North American time zones.** The 10:00 UTC
  anchor is chosen against `America/New_York`; for a subscriber whose local morning has
  already become afternoon or evening by 10:00 UTC, the run may fire well after their target
  minute has passed, and they are the ones who fall outside the 60 minute grace and get no
  push that day. This is an accepted, named degradation of the feature for that population
  while the app stays on Hobby, not a bug to chase, and it resolves itself the moment the
  cadence increases (6.8a).
- **Spring forward.** Unaffected in practice: a valid nudge minute is always between 06:00
  and 21:00 local (R4.3), and the United States spring forward transition happens around
  02:00, a local time no nudge minute can ever occupy.
- **Fall back.** The repeated local hour occurs twice in real time, but the single daily run
  only evaluates the row once, whenever it fires. `last_sent_local_date` still guards
  against a second send if the route happens to be called again that day, which is expected
  during manual verification (11.4) rather than an edge case to fear.
- **A traveller.** Unchanged: the client re-sends `tz` on every schedule sync, so landing in
  another country updates the row on the next app open. Between landing and opening the app,
  the nudge fires on the old zone. This is a known and accepted gap, not a bug to chase.

**Authentication and triggering.** The route requires `Authorization: Bearer $CRON_SECRET`
and returns 401 otherwise. Vercel Cron sends that header automatically when `CRON_SECRET`
is set on the project. Cron jobs only run on production deployments, so a preview deploy
never sends anything, which is the behaviour we want. Because the route is a plain
authenticated GET that is idempotent and holds no state between calls, it is also the
manually triggerable send endpoint the testing plan needs (11.4, 22): the same
`Authorization: Bearer` call the tester makes by hand, whether against `vercel dev` locally
or the deployed route, is indistinguishable from the one Vercel Cron makes once a day, which
is exactly what makes the flow verifiable on demand instead of only once every 24 hours.

**The decision, made.** The previous version of this section left the cron frequency as an
open question for the user, with the honest options named as paying for Pro, adding a free
external scheduler, or staying on Hobby with reduced accuracy. The user chose to stay on
Hobby, with one nudge window a day, described above. Nothing about the endpoint's shape
changed to make that possible; only the trigger frequency and the two constants in R14.4 and
R14.5 did, which is also why the upgrade path below is small.

### 6.8a Upgrade path off Hobby

Both the `push_subs.tz` and `push_subs.nudge_local_minute` columns, and the per minute
schedule the client already publishes on every tick (R14.2), stay in the schema exactly as a
more frequent design would need them, even though today's single daily run cannot make full
use of them. That is deliberate, and it is the entire reason the two columns are not
simplified away just because Hobby only checks them once a day: neither path below touches
the schema, the client, `api/_lib/due.ts`'s query shape, or any route.

- **Upgrading to Vercel Pro.** Change `vercel.json`'s `crons[0].schedule` from
  `"0 10 * * *"` to `"*/5 * * * *"` (or another interval Pro allows), and, in the same
  change, tighten the `60` minute constant in R14.4 and R14.5 back down, toward the original
  `10`, because a frequent trigger no longer needs a wide grace window to compensate for
  firing only once a day. Nothing else changes.
- **Adding Upstash QStash while staying on Hobby.** Point a QStash schedule at the same
  `/api/cron/send-nudges` URL with the same `Authorization: Bearer $CRON_SECRET` header, at
  whatever interval its free tier allows. Vercel's own `crons` entry can stay as a once a
  day backstop or be removed. The route was built to be trigger agnostic for exactly this
  reason: it does not know or care who called it, only that the bearer is correct.
- Either path is a configuration change plus the two grace constants, not a rewrite of this
  section. Revisit the copy in 9.1 and 9.4a at the same time, since it is written for
  today's imprecision and can say something tighter once delivery is.

### 6.9 What leaves the device, what never does

The decision the user asked for, made deliberately.

**Nudge text is composed on the device. The server sends a wake signal with no content.**

The push payload is exactly `{"v":2,"t":"nudge","d":"2026-06-29"}` (R14.6). The service
worker wakes, reads the pending nudge record from IndexedDB (6.4), and writes the
sentence from section 9.2 itself. The server never learns the place name, the amount, the
jar balance, or anything the user typed.

The rejected alternative was server side composition, which is simpler: the client would
POST the place display name and the estimate along with the minute, and the cron would
send a ready made title and body. That is fewer moving parts, it works even when
IndexedDB has been evicted, and it is what most push products do. It was rejected because
it would mean a table on someone else's infrastructure containing "corner espresso,
$4.41, every weekday at 07:40" for every user who turns nudges on. That is a materially
more sensitive dataset than the one this design ships, it is exactly the data the whole
product posture is built around not collecting, and the cost of avoiding it is one
IndexedDB read and a fallback string.

**The tradeoff, named honestly.** On device composition can fail. If the browser has
evicted IndexedDB, if the user cleared site data, or if the record is for a different
date, the worker cannot write the real sentence and shows the fallback from section 9.2a
("There is something waiting for you. Open the app to see it."), which is a worse
notification. Server composition would never have that failure. We are trading a small
amount of notification quality, in a rare case, for not holding people's spending habits
on a server. That is the right trade for this product, and the fallback is designed so the
bad case is vague rather than broken.

**Leaves the device** (only when nudges are on, only after the panel in 9.4a is shown and
accepted):
- The push endpoint URL and its two subscription keys, which the browser generates and
  which are meaningless to anything but the push service.
- The IANA time zone name.
- One date and one integer minute, being when to wake this browser next.

**Never leaves the device**, in any state: place names, merchant names, coordinates or
coarse labels, amounts, estimates, the jar balance, the ledger and everything in it,
counters, lesson progress, the user's name, age, fear answer, summer figures, events, and
the notification text itself.

**Retention and deletion.**
- The row exists only while nudges are on. Turning nudges off deletes it, in the same tap,
  and the Settings copy says so.
- A push service replying 404 or 410 deletes the row immediately (R14.8).
- Five consecutive send failures of any other kind delete the row.
- The cron deletes any row untouched for 90 days, which covers a browser that vanished
  without unsubscribing.
- Settings has one "Delete everything" action that unsubscribes, deletes the server row,
  waits for the confirmation, then clears IndexedDB and local storage, and says which of
  those succeeded. It is the only action in the app that can fail halfway, so it reports
  what it did rather than claiming success.
- There is no backup, no archive, no analytics copy and no second table. The row is the
  entire server side record of a person, and deleting it is complete.

### 6.10 Identity: the least identifying thing that works

**Recommendation: no identity at all beyond the push endpoint itself.**

There is no install id, no anonymous user id, no cookie, no local storage token, no
device fingerprint and no account. The primary key is `sha256(endpoint)`, derived from a
value the browser's own push service generated. A browser identifies itself to the API by
presenting its endpoint plus the subscription's `auth` secret, both of which it already
holds and neither of which the app invented.

Why this rather than a generated per install UUID: a UUID is a new identifier the app
creates and then has to explain, it survives after the subscription is gone, and it would
let rows be correlated across a resubscribe. Keying on the endpoint means the identifier
dies exactly when the subscription dies, and the app has created no identifier of its own
at any point.

What this costs, stated: the same person on a phone and a laptop is two unrelated rows and
the app cannot tell, so the once per day nudge cap (R4.4) is enforced per browser and a
two device user could receive two nudges on the same day. That is accepted this cycle
(R14.10). Fixing it would require exactly the cross device identity this design exists to
avoid.

### 6.11 Environment variables and secrets

| Name | Where | Notes |
|---|---|---|
| `DATABASE_URL` | server only | already set by the Neon integration |
| `DATABASE_URL_UNPOOLED` | server only, migrations | already set |
| `VAPID_PUBLIC_KEY` | server only, served through the API | generate with `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | server only | never in the bundle, never committed, never logged |
| `VAPID_SUBJECT` | server only | a `mailto:` seen by the push service; use a dedicated address, not the user's personal email |
| `CRON_SECRET` | server only | bearer for the send endpoint |

Vite only exposes variables prefixed `VITE_` to the browser, and none of the above carry
that prefix, which is the mechanical guarantee. The build step additionally greps `dist/`
for the literal values of `VAPID_PRIVATE_KEY` and `CRON_SECRET` and fails if either
appears. Set them with `vercel env add` for Production, Preview and Development. Do not
commit `.env.local`; `.gitignore` already excludes `.env*`.

### 6.12 Failure posture: the app with the backend down

Non negotiable, and the tester should try to violate it. With the database unreachable,
the API returning 500, the cron never running, the service worker unregistered, the user
offline, or notification permission denied:

- The app boots, completes onboarding, runs the whole daily loop, detects habits, shows
  the in app nudge card on Home, credits skips, moves the jar, records ledger entries,
  and opens every lesson.
- No screen blocks on a network call. No spinner waits on the API. Every fetch has a five
  second timeout and a caught rejection.
- The Nudges card shows one honest line about the nudge service being unreachable and
  offers a retry. It does not retry on a timer and it does not toast repeatedly.
- Nothing anywhere claims a nudge was scheduled when the schedule call failed.

### 6.13 iPhone standalone layout

New this amendment, from the user's own requirement: "build the app so its able to be put
and used on iphone as a web app." Section 6.2 already covers the manifest and the three
install and permission states; this section covers the layout work a modern iPhone needs on
top of that, because a Home Screen web app draws edge to edge with no Safari chrome, and
every pixel of that edge is now the coder's responsibility rather than the browser's.

**Viewport and safe areas.** `index.html`'s viewport meta gains `viewport-fit=cover`:
`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
Without it, every `env(safe-area-inset-*)` value resolves to zero on an iPhone and nothing
below does anything. `env(safe-area-inset-top)`, `env(safe-area-inset-right)`,
`env(safe-area-inset-bottom)` and `env(safe-area-inset-left)` are then applied, as padding
rather than margin so the safe content area keeps its own background, wherever content
would otherwise sit under the Dynamic Island or the home indicator:

- **The sticky header** (`Header.tsx`) gets `padding-top: max(<its existing padding>,
  env(safe-area-inset-top))`, so its title and, per below, its back control clear the
  Dynamic Island.
- **The bottom tab bar** (`NavBar.tsx`) gets the same treatment on `padding-bottom`, so its
  five tabs, Home, Places, Invest, Lessons, Settings, clear the home indicator rather than
  sitting under it or being intercepted by the system swipe gesture there.
- **The catch sheet** (`CatchSheet.tsx`), an actual bottom sheet, needs `padding-bottom` for
  the same reason. **The nudge card** (`NudgeCard.tsx`, 8.2) is not a fixed sheet, it renders
  inline on Home, so it inherits the page's own safe area padding and needs no treatment of
  its own; it is named here only to rule it out explicitly.
- **Any fixed overlay**: the toast (`Toast.tsx`), the confetti and milestone modal
  (`MilestoneCard.tsx`), and each of the three Nudges install and denied panels (9.4a to
  9.4d) wherever it renders as a full screen sheet rather than inline in Settings.
- **The demo tray** (`DemoTray.tsx`) is itself a fixed, draggable overlay and needs bottom
  and side insets so its handle is never pinned under the home indicator.
- **Modals**: the `LedgerForm` sheet on Invest and the invest capture screen
  (`InvestCapture.tsx`) wherever either renders as a full screen sheet rather than a page.

Section 1.1's disposition table listed `Header.tsx`, `Toast.tsx` and `CatchSheet.tsx` among
components kept unchanged; this amendment moves those three to MODIFY, for exactly the safe
area work above. `NavBar.tsx` and `DemoTray.tsx` were already MODIFY for other reasons and
gain this as an additional requirement on the same files.

**No browser chrome, and what that removes.** A standalone launch has no address bar, no
Safari toolbar, and, critically, **no browser back button**. Every screen a user can only
reach by drilling in from one of the five tab screens must supply its own way back, because
on a real device there is no other way back. Checked against every screen in section 8:

- **Needs a back control added:** Activity (8.3, reached by a link from Home), Learn and its
  reader (8.9, reached from Lessons), a Lesson reader (8.8, reached from the Lessons ring),
  the invest capture screen (8.7a, reached from Invest or a Home prompt), and Summer Money
  when revisited after onboarding (8.5, no longer reachable by pressing back once onboarding
  is behind the user). Each of the three Nudges panels (9.4a to 9.4d) already carries an
  explicit "Not now" or equivalent dismissal in its copy; confirm each one also keeps that
  control visible without scrolling, since a copy requirement is not the same as a layout
  guarantee.
- **Does not need one:** the five `NavBar.tsx` tabs, because switching tabs is itself the way
  back, and any sheet or card dismissed by its own explicit action, the nudge card,
  `CatchSheet.tsx`, `LedgerForm`, the milestone modal, because R6.4, R6.5 and 8.2 already
  require an explicit cancel or dismiss on each of those.
- Onboarding (Welcome, Fear check, Summer) stays forward only, as it is today. This
  amendment does not add a way to revisit a previous onboarding step; nothing in section 4
  or 8 currently requires one, and inventing one is out of scope for a layout fix.
- `Header.tsx` gains an optional back control prop, rendered to the left of the title, with
  a minimum 44 by 44 point tap target, Apple's own minimum, and used by every screen named
  above.

**Status bar style.** `index.html` sets
`<meta name="apple-mobile-web-app-status-bar-style" content="default">` for the light theme,
which draws dark status bar text and icons over the app's own light background, and switches
to `content="black-translucent"` when the app is running in dark mode, which draws light
text and lets the app's own dark background show through underneath it. This toggles the
same way `theme_color` already tracks the palette (6.2). `black-translucent` only reads
correctly once the safe area padding above is in place, so the two ship in the same build
step.

**Test viewports.** `playwright.config.ts` gains device profiles for iPhone 15, 16 and 17
Pro (393 by 852) and Pro Max (430 by 932) alongside the existing 375 by 812 profile
(iPhone X era), which stays as the smallest supported size and is not dropped. The mobile
checks, no horizontal scroll, 44 point tap targets, and safe area padding present, run at
all three sizes, not only at 375 by 812 (criteria 17, 20a, 20b; 11.2).

---

## 7. The rule fixture

**Reduced this cycle.** This section used to specify parity between two languages, because
the money and habit rules existed twice, in TypeScript and in Swift. With the iOS app gone
they exist once, so the parity machinery is gone with it: no Swift dispatcher, no XCTest
suite, no cross language case count comparison, no acceptance criterion pairing two
printed lines.

**The fixture itself survives, and should.** `shared/fixtures/rules-v2.json` is the single
machine readable statement of the section 4 arithmetic, executed by one Vitest suite. It
earns its place for three reasons that have nothing to do with iOS: it is a regression
guard on a feed whose seed determines every downstream number, it makes a rule change
visible as a data diff rather than buried in a refactor, and it keeps the door open if a
second runtime ever appears. It is now a fixture, not a contract between platforms, and
the plan should not pretend otherwise.

### 7.1 One normative specification

Section 4 is the only place a rule is defined. Every function that implements one carries
a comment naming its rule id, for example
`// Plan v2 R4.4: one nudge per day, earliest first, ties by place id.` A rule change is a
plan edit first, then a code edit, then a fixture case, in that order, and the revision log
at the bottom of this file records it. `scripts/check-rules.ts` fails the build if a rule
id that appears in section 4 with arithmetic has no fixture case.

### 7.2 Shared data

Content that the app, the fixture and the copy lint must all agree on lives once, in
`shared/`, and is imported directly by Vite:

```
shared/
  content/merchants.json      // name, category, minCents, maxCents, usualMinute, minuteSpread
  content/lessons.json        // the eight confidence path lessons
  content/learn.json          // NEW: the sixteen Learn library pieces, section 9.8
  content/tooltips.json       // the surviving terms plus the fourteen restored for Learn
  content/holdingTypes.json   // the six invest capture labels (1.2, section 8.7a)
  fixtures/rules-v2.json      // section 7.3
```

`shared/` stays a separate tree rather than folding into `src/content/` because
`scripts/lint-copy.ts`, `scripts/lint-advice.ts` and `scripts/check-rules.ts` all scan it
as data, and because content that is reviewed as prose should not be mixed with code that
is reviewed as code.

### 7.3 The fixture file

`shared/fixtures/rules-v2.json`:

```json
{
  "version": 2,
  "caseCount": 102,
  "cases": [
    { "id": "R2.1-a", "rule": "R2.1", "fn": "roundUpCents",
      "in": { "amountCents": 435 }, "out": { "cents": 65 } },
    { "id": "R2.1-b", "rule": "R2.1", "fn": "roundUpCents",
      "in": { "amountCents": 400 }, "out": { "cents": 0 } },
    { "id": "R3.3-a", "rule": "R3.3", "fn": "usualMinute",
      "in": { "minutes": [480, 495, 510, 505] }, "out": { "minute": 495 } },
    { "id": "R5.1-a", "rule": "R5.1", "fn": "estimateCents",
      "in": { "amounts": [435, 500, 389] }, "out": { "cents": 441 } },
    { "id": "R4.4-a", "rule": "R4.4", "fn": "selectNudge",
      "in": { "candidates": [ { "placeId": "corner espresso", "usualMinute": 500 },
                              { "placeId": "campus coffee", "usualMinute": 500 } ] },
      "out": { "placeId": "campus coffee", "nudgeMinute": 480 } },
    { "id": "R14.2-a", "rule": "R14.2", "fn": "nudgeSchedulePayload",
      "in": { "nudge": { "dayIndex": 14, "nudgeMinute": 460 }, "date": "2026-06-29" },
      "out": { "nudgeLocalDate": "2026-06-29", "nudgeLocalMinute": 460 } }
  ]
}
```

Rules for the file:

- `fn` names map to implementations through one dispatcher in `tests/unit/ruleFns.ts`. A
  `fn` present in the file with no dispatcher entry is a test failure, not a skip.
- The suite asserts `cases.length === caseCount`, so a truncated or partially merged file
  fails loudly instead of silently testing less.
- The suite asserts that the set of distinct `rule` values covers every arithmetic rule id
  in section 4, computed from a constant list checked in beside the fixture.
- Every number in the file is an integer, so JSON parsing cannot introduce a representation
  difference.
- Coverage floor, unchanged from the original 96 plus 6 for R14: at least 8 PRNG cases
  (R2.0), 6 round-up, 8 minute of day, 12 habit (R3.2 through R3.5, including the exact
  threshold boundaries 2 and 3 visits, and spread 45 and 46), 12 nudge (R4.2 to R4.4
  including the 359, 360, 1260 and 1261 minute boundaries and the tie break), 10 estimate
  (R5.1 including the fifth and sixth visit boundary and a rounding half case), 6 jar, 8
  ledger ordering and validation, 6 tree, 6 summer, 8 tick ordering, and 6 schedule payload
  cases (R14.2, including a null minute and a nudge that R4.2 or R4.3 suppressed). That is
  102. Grow it, never shrink it.
- The eight PRNG cases stay even though there is no longer a second language to compare
  against. The feed's seed determines every place, minute, estimate and nudge in the
  product; a silent change to `mulberry32` would change all of them with no test failing
  anywhere else.
- The server side due selection (6.8) is **not** in this fixture. It is SQL, it depends on
  Postgres timezone data, and re-implementing it in TypeScript to test it would create the
  exact second implementation this section just deleted. It is covered by the database
  integration tests in 11.3.

### 7.4 The runner

- `tests/unit/parity.test.ts` (name kept, since the coder's existing `ruleFns.ts` already
  points at it) loads the fixture and runs every case, printing on success a single line
  `rules: N cases, M rules`.
- `scripts/check-rules.ts` greps this plan for rule ids and fails if one with arithmetic
  has no case. It runs in `prebuild` alongside `lint:copy` and `lint:advice`.

---

## 8. Screens

Web only. Copy constraints that apply to every screen: no em dash or en dash; no jargon
without a tooltip; no shame language, especially around a non skip (R4.7); celebrate small
numbers; every estimate labeled as an estimate; nothing that states or implies what an
investment is worth today (R7.3); and nothing that recommends, predicts, names a security
or addresses the user's own money as advice (R15).

### 8.1 Home (modified)

Components: summer headline card or kept headline card, nudge card (when one is pending),
jar card with the two actions, tree card, a three stat row, next lesson card, a link to
Activity, a link to milestones.
Reads: `keptSinceStartCents`, `keptThisWeekCents`, `skipsThisWeek`, `jarCents`,
`jarGoalCents`, `todayStats`, `treeStage`, `pendingNudge`, `nextLessonId`,
`ledgerTotalCents`, summer selectors.
Actions: take skip, dismiss nudge, move jar to ledger, empty jar, accept or decline a
paycheck catch, open a lesson.
Copy: the headline is "Kept since you started" outside summer and "Kept this summer"
inside it, with the by 30 line under it (R10.2). Under the ledger total sits the honest
line from section 9.3. No growth figure, no percent, no arrow.

### 8.2 The nudge card and the notification

One card, one sentence, two buttons: "I'm skipping today" and "Not today". The estimate is
shown with its label. Dismissing with "Not today" expires the nudge with no consequence and
no follow up. The card never appears twice in a day (R4.4).

The push notification is the same one sentence, composed by the service worker on the
device (6.9) with the same two actions. Arriving at the notification and arriving at the
card must lead to the identical state: one skip, one credit, one Activity line, never two.
The store's `takeSkip` is idempotent on a nudge id, which is what makes that true when the
user taps both.

### 8.3 Activity (modified)

Kinds shown: RoundUp, Catch, Skip, JarMove, JarEmptied. Grouped by date, newest first, same
layout as v1. Skip lines say what was skipped and what it was worth, labeled an estimate.
JarEmptied lines are neutral. Purchase and Paycheck events stay out of the feed, as in v1.

### 8.4 Settings (modified)

Cards: Profile (unchanged), Pause round-ups (unchanged), **Jar goal** (replaces sweep
threshold; presets from R6.3), Paycheck catch percent (unchanged), **Nudges** (8.9),
**Your data** (export, import, delete every place and visit, **Delete everything**
including the server row per 6.9, reset demo), Appearance (unchanged), one line stating the
demo charges nothing, and one line stating that the app is education and not advice (R15.6,
copy in 9.8a). The fee card, the threshold card and the v2 draft's Location card are gone;
location was an iOS affordance and there is no device location source on the web this
cycle.

### 8.5 Welcome, Summer, Fear check (modified, kept, kept)

Welcome's three step explanation is rewritten to the new promise (section 9.1), and its
privacy line is replaced per 9.4. Summer is unchanged except that its chart is the new
inline SVG. Fear check is untouched. Onboarding is three steps, and `resumePath` is: no
name goes to `/welcome`, a name with no fear goes to `/onboarding/summer`, otherwise
`/onboarding/fear`. Nothing about push, install or notifications appears anywhere in
onboarding; the first mention of any of it is the Nudges card in Settings, or the nudge
explainer the first time a habit is found.

### 8.6 Places (new)

The privacy and control surface, and the screen that makes the inference explainable.
Per place row: display name, visits in the last 14 days, usual time, habit status in words,
the estimate if it has one, a mute toggle and a delete button. A place that is visited often
but at irregular times says so, using the words from R3.4, so the user can see why it is not
nudging them.
Header states, in one sentence each: what the app inferred, that it came from the spending
feed on this device, and that no place name or amount is ever sent anywhere, including in a
nudge (9.4).
Actions: mute or unmute, delete one place, delete every place. Deleting shows the R11.3
consequence before confirming.

### 8.7 Invest (new)

The manual investment ledger. Header: total contributed, entry count, first entry date, the
honest line from section 9.3, and the disclosure from 9.8a, visible with no tap or expand
required, because this is the screen where the ledger lives and where a reader is most likely
to be thinking about their own money while reading the app's general copy. Then a list per
R7.5, then an "Add what you invested" button.
`LedgerForm` fields: amount, date, what it went into (free text with a suggestion list:
index fund, ETF, retirement account, savings account, individual stock, crypto, something
else), and an optional note. The form states that the app does not check this against
anything and does not track a price. Editing and deleting are available on each row, with
the R7.4 warning on a jar sourced entry.
This screen shows no chart, no percentage, and no valuation. The suggestion list is a list
of categories the user might type, never a list of things to buy (R15.5).

### 8.7a Invest capture (new)

Unchanged from the cycle 7 amendment except that it is web only. The light "what are you
invested in" capture that replaces the deleted risk quiz and allocation builder, per the
user's amendment to assumption A5 (1.2). It is a capture, not a quiz: it records what the
user says is true about their own holdings, computes nothing from it, and feeds the same
manual ledger as the Invest screen's own form.

Reached from: a persistent "What are you invested in" entry point on the Invest screen,
which is the primary action shown when the ledger is empty and a secondary link once it has
entries. It is also offered once, as a single optional and skippable prompt, the first time
Home renders after onboarding completes. That prompt never blocks or extends the three step
onboarding covered by acceptance criterion 1; skipping it dismisses it permanently, and the
same screen stays reachable from Invest at any time afterward.

Components: six tappable holding type chips read from `shared/content/holdingTypes.json`
(broad index fund, bonds or CDs, individual stocks, crypto, cash savings, something else).
Tapping a chip adds a row to a working list on screen. Each row has an amount field, the
something else row also has a required free text label (1 to 60 characters, the same bound
as R7.1's `what`), and the bonds or CDs row has an optional length and rate (R16.7). Rows can
be removed before saving. A "Save" button is disabled until every row has a positive amount
no larger than the R7.1 cap, a usable length and rate if either was typed, and, for a
something else row, a non empty label. An amount over the cap says so on its row.

Data: on save, every row is validated first, and only if all pass is there one call to the
existing `addLedgerEntry` action per row, each with `date` set to the current simulated date,
`source: "manual"`, `what` set to the chip's canonical label (or the typed label for
something else), `note` empty, and `holdingType` set to the chip's key (R16.5). A refused
save writes nothing, so a retry cannot duplicate a row (V2-20, 2026-09-11). No new store
action. The ledger fields this screen can set beyond R7.1's are `holdingType`, `termMonths`
and `yieldBps` (R16).

Copy constraints: everything in the header of section 8, plus, specifically for this screen,
no percent, no computed value, no risk label, no color coded read, and no chart anywhere on
it, including the moment of saving.

Test ids: `invest-capture-chip-{key}`, `invest-capture-row-{key}`,
`invest-capture-amount-{key}`, `invest-capture-save`, `invest-capture-skip`.

### 8.8 Lessons and Lesson (the confidence path, kept)

Unchanged. Eight lessons over `shared/content/lessons.json`, the L3 and L4 rewrites, the
R12.1 to R12.4 triggers, and the progress ring counting **read lessons out of eight**. The
ring keeps counting only the path, because the path is the thing you earn by using the app,
and putting sixteen ungated articles into the same ring would turn a small satisfying circle
into a homework tracker.

Below the ring, one line links to the Learn library: "There is more, whenever you want it."

### 8.9 Learn (new): the library

A second, flatter surface, reached from Lessons and from the nav. Sixteen pieces
(section 9.8), grouped into three tracks:

- **Getting started**, six pieces, on opening an account and what to actually do first.
- **What the markets are**, six pieces, on stocks, the stock market, bonds, the bond
  market, funds, and everything else.
- **Staying sane**, four pieces, on news, uncertainty, risk in plain words, and when to ask
  a real person.

Design decisions, made explicitly:

- **Nothing in the library is locked.** Not one piece. A person who wants to know how a
  brokerage account works on day one should be able to read it on day one, and gating
  education behind having skipped a coffee would be the app deciding what someone is ready
  to know. This is also the clean answer to the retired unlock triggers: the library has
  none.
- **Its progress is a plain count, not a ring.** The header reads "6 of 16 read", stored
  per piece in the same `lessons` map shape, keyed separately. No ring, no percentage
  complete, no badge for finishing, because finishing is not the point.
- **Three surfacing moments, which highlight and never unlock.** Opening Invest for the
  first time surfaces "What a brokerage actually is". The first ledger entry surfaces "Your
  first hundred dollars". Day 30 surfaces "Why the news is not a signal". Surfacing means a
  card appears on Home with a one line reason and a dismiss; the piece was already readable
  before and stays readable after (R12.5).
- Track pages are `/learn` (the three tracks with their pieces listed) and
  `/learn/:id` (the reader, reusing the existing `Lesson.tsx` reader component and its
  tooltip handling verbatim).
- Every piece opens with, and the library header repeats, the standing line from 9.8a. It
  is one sentence and it appears once per screen, not once per paragraph.

Test ids: `learn-track-{key}`, `learn-item-{id}`, `learn-progress`, `learn-not-advice`.

### 8.10 Nudges and install (new, on Settings)

One card, and the only place in the app where the server is visible.

States, matching 6.2:

- **Off, supported.** A toggle, one line of what a nudge is, and a "What this changes"
  link opening the panel in 9.4a. Turning it on shows that panel first, with an explicit
  continue, and only then requests permission. The operating system prompt is never the
  first thing the user sees.
- **Off, iPhone Safari not installed.** The toggle opens the install panel (9.4b) with the
  three Share sheet steps. No permission request is attempted.
- **Off, permission denied.** The denied panel (9.4c). No permission request is attempted,
  ever again.
- **On.** The state line ("Nudges are on for this browser"), the mute list per place, the
  quiet hours display (06:00 to 21:00, not editable this cycle, and the UI must not appear
  to offer editing), a "Turn nudges off" action which deletes the server row and says so,
  and one line naming exactly the three things stored on the server, linking to the fuller
  panel.
- **On, but the last schedule sync failed.** One honest line and a retry.
- **Unsupported browser.** One sentence, no toggle, and the note that the in app nudge card
  still works.

Optional install affordance on Chromium desktop and Android, from a captured
`beforeinstallprompt`, worded so that nobody thinks installing is required (9.4d).

Test ids: `nudges-toggle`, `nudges-state`, `nudges-explainer`, `install-panel`,
`install-steps`, `denied-panel`, `nudges-turn-off`, `delete-everything`.

---

## 9. Copy

Exact strings where the wording carries a decision. Everything else the coder writes in the
same voice, into `src/content/strings.ts`. No dashes of either kind anywhere. Section 9.8 is
content, and it lives in `shared/content/learn.json` rather than in strings.

### 9.1 Welcome, the three steps

- Headline stays: "Keep a little. It goes a long way."
- Explanation: "Spare Change notices where you spend without thinking about it. Right before
  you usually go, it asks if you want to skip today. If you do, the money you were about to
  spend goes in your jar instead."
- Step 1, "Notice": "You go to the same coffee place three mornings a week. The app works
  that out on its own."
- Step 2, "Ask once": "Before your usual time, one question. Skip today? Say no and nothing
  happens." The old wording named a specific number of minutes; it is dropped here because a
  push notification can no longer promise one (6.8, 9.4a), and the app should not claim more
  precision than it delivers.
- Step 3, "Keep it": "Skipping puts what you usually spend there into your jar. When you are
  ready, you move it somewhere real and tell the app where it went."
- The privacy line under the steps is replaced per 9.4. The old line, "No password.
  Everything stays on this device.", is deleted from the codebase and must not survive
  anywhere, including in a test fixture or a comment.

### 9.2 The nudge

- In app card and notification title: "Skip [[place]] today?"
- Body: "You usually spend about {estimate} here around {time}. Skip today and it goes in
  your jar."
- Primary button and notification action: "I'm skipping today"
- Secondary button and notification action: "Not today"
- After a skip, one toast: "{estimate} in the jar. That is money you already had."
- After a non skip: nothing. No toast, no card, no line in Activity, no counter change, no
  second notification. This is a requirement, not an omission.

### 9.2a The notification fallback

Used only when the service worker wakes and cannot read a matching pending nudge record
(6.9). It must contain nothing personal, because the reason it is being shown is that the
device could not tell the worker anything.

- Title: "Spare Change"
- Body: "There is something waiting for you. Open the app to see it."
- No actions, no place, no amount, no figure of any kind.

### 9.3 What replaces the growth line

On Home, under the ledger total, and at the top of Invest:

- "You have moved {total} into investments. This app does not know what that is worth today,
  and it never will. It is not connected to your money."
- On Home, the kept headline: "Kept since you started" over the amount, with, in summer, "By
  30 that is about {dollars}" and the existing 7% tooltip under it.
- Nowhere: a percent next to a ledger figure, an up or down arrow, a green or red delta, or
  the phrase "your portfolio".

### 9.4 Privacy, rewritten because it is no longer true as written

The v1 and v2 draft promise was "No password. Everything stays on this device." With a push
backend that is false for anyone who turns nudges on, and a promise that is true for most
people is not a promise. The replacement is split into a standing line that is always true
and a specific panel shown before anything leaves the device.

**Standing line, on Welcome and on Places:**

"No account, no password. Your spending, your places, your jar and everything you type stay
on this device."

That sentence stays true in every state of the app, including with nudges on, because none
of those things ever leave. The one thing that does leave has its own panel and its own
consent.

### 9.4a Before turning nudges on

Shown in full, with a continue button, before any permission prompt.

- Title: "What turning nudges on changes"
- Body: "A web app cannot wake itself up on its own, so a nudge has to come from a server. If
  you turn nudges on, three things get stored there: an address your browser hands out so a
  notification can reach it, your time zone, and the minute to wake you. That is the whole
  row." The old wording said "at twenty to eight" as if that were this app's own delivery
  time; it is dropped for the same reason as 9.1's step 2, and the sentence now explains why
  a server exists at all rather than implying anything about when it fires.
- Second paragraph: "The place, the amount, your jar and everything you have typed stay here.
  The words in the notification are written on this device, after it wakes up, which is why
  the server never needs to know where you go."
- Third paragraph: "Turn nudges off and that row is deleted. There is no second row anywhere,
  no backup, and no account it is attached to."
- **Fourth paragraph, new this amendment**: "One more honest thing: right now this arrives
  once a day, in an early morning window, rather than at the exact minute before you usually
  go. Some mornings it will show up earlier than that. It will not show up after your usual
  time has already passed." This paragraph exists because the app now runs its scheduler once
  a day rather than every few minutes (6.8), and it is deleted or rewritten the day that
  changes (6.8a), which is why it is called out as its own paragraph instead of folded into
  the first.
- Buttons: "Turn nudges on" and "Not now"

### 9.4b Add to Home Screen, iPhone and iPad Safari

- Title: "Add Spare Change to your Home Screen first"
- Body: "iPhone only lets a website send notifications once you have added it to your Home
  Screen. It takes three taps and it does not install anything from an app store."
- Step 1: "Tap the Share button at the bottom of Safari."
- Step 2: "Scroll down the list and tap Add to Home Screen."
- Step 3: "Open Spare Change from your Home Screen, then come back to this screen."
- Footer: "Everything else in the app works exactly the same either way. Nudges are the only
  part that needs this."

### 9.4c Notifications are blocked

- Title: "Notifications are blocked for this site"
- Body: "Your browser is turned down for Spare Change, and only you can change that, in your
  browser's settings for this page. We are not going to keep asking."
- Second line: "Nothing is broken. When a nudge is due it is still waiting for you on Home
  the next time you open the app."

### 9.4d The optional install button

- Button: "Install Spare Change"
- Line under it: "Puts it in its own window. Nudges work either way on this browser, so this
  is only if you want it."

### 9.5 Turning nudges off, and deleting everything

- Turn off button: "Turn nudges off"
- Confirmation line: "This deletes the row on the server, right now. Your places, your jar
  and everything you have kept stay exactly where they are."
- After success: "Nudges are off and the server row is gone."
- If the server could not be reached: "Nudges are off on this device. We could not reach the
  server to delete the row, so it will be deleted the next time it fails to reach you, and
  in any case within ninety days. You can try again."
- Delete everything button: "Delete everything"
- Its confirmation: "This deletes the server row if you have one, then everything Spare
  Change has stored in this browser: your places, your jar, your ledger, your lessons. It
  cannot be undone and there is no copy anywhere else."

### 9.6 The three rewritten confidence path lessons

- **L3, "The coffee you didn't buy".** "You skipped one stop, and the money you were about
  to spend is sitting in your jar instead. Nothing was taken out of your account, because it
  never left it. That is the whole idea: the cheapest money to keep is the money you have not
  spent yet."
- **L4, "Why a dip isn't a loss".** Keep the v1 body, then add: "You will notice this app
  never shows you a number going down. That is on purpose. It does not watch prices at all,
  so it cannot panic you with one bad week, and it cannot pretend to know what your money is
  doing today."
- **L7, rewritten this amendment, disposition below.** Its title and body change; see
  section 9.6a for why and for the replacement text.

### 9.6a L7's disposition under the revised R15

The test report's V2-7 flagged the shipped `lessons.json` L7, "Why $20 a week beats $500
later", for ranking one approach over another and reading as a directional growth claim, and
found that it passed both automated lints. Under the revised R15 the question is no longer
whether it is banned outright, it is whether it lands in the first list (general principle,
allowed with the disclosure) or the second (tailored amount framed as a comparison, still
banned regardless of disclosure). It lands in the second, and it needs a rewrite, not a
disclosure. The reasoning: R15's first list allows an unquantified principle like "money
invested earlier has more time to grow"; the title "$20 a week beats $500 later" attaches two
specific dollar figures to that principle and frames one as beating the other, which is
exactly the "beats/versus/instead of plus a number" shape the revised R15.7 lint pattern now
targets, and exactly the shape R15.3 and R15.5 name as still banned even with a disclosure
next to it. A reasonable reader takes "$20 a week beats $500 later" as being told what to
contribute and when; that is a personalized recommendation dressed as an observation, and a
disclosure does not cure it.

The fix keeps the underlying principle, which is sound, honest and exactly what R15's first
list is for, and drops the specific figures and the "beats" framing that turned it into a
comparison:

- **New title: "Why early money has more time to grow".**
- **New body:** "Money invested now has decades to do its work before you are likely to need
  it. Money invested later, even if it is more of it, has less time to do the same job. That
  is not a reason to wait until you have more to put in, it is the reason not to."

This keeps L7's spot in the fear check mapping (pointless to L7, unchanged) and its place as
the sixth of eight lessons; only its title and body change, and the `learn.json` L7 fixture
used by the lint's regression test in R15.7 must be the original, unmodified text, not this
replacement, so the test continues proving the lint would have caught the shipped version.

### 9.7 Neutral copy for the jar actions

- "I moved this into an investment" and "I spent it".
- After "I spent it": "Jar emptied. It was your money." Nothing else.
- Deleting a place: "This removes {place} and everything we worked out about it. The money
  you already kept stays in your activity."

### 9.7a The invest capture

- Screen title: "What are you invested in?"
- Subhead: "Tell us what you already put money into, in your own words. We only ever record
  what you type. We do not check it against anything, and we never work out what it is worth."
- Chip labels: "Broad index fund", "Bonds or CDs", "Individual stocks", "Crypto", "Cash
  savings", "Something else".
- Something else label field placeholder: "Say what it is."
- Amount field label: "How much."
- Save button: "Add to my ledger."
- Invest screen empty state entry point. Title: "What are you invested in?" Body: "Add what
  you already have, in your own words. It takes a minute."
- Onboarding prompt, shown once, optional. Title: "One more thing, if you want." Body: "Tell
  us what you are already invested in. This is optional, and you can do it any time from
  Invest." Buttons: "Add it now" and "Skip for now."

### 9.8 The Learn library, sixteen pieces

Content for `shared/content/learn.json`. Each piece has `id`, `track`, `title`, `body`, and
the `[[term]]` tooltip markers the existing reader already understands. The voice is the
brief's: a friend a year ahead of you, encouraging, honest, a little funny, never preachy,
and never telling you what to do with your money.

**Track: Getting started** (`getting-started`)

- **E01, "What a brokerage actually is".** "A [[brokerage]] is a shop that holds investments
  for you, the way a bank holds cash. You open an account, move money in, and buy something
  with it. That is genuinely the whole job. The apps with the nicest logos and the banks with
  the marble floors are doing the same thing."
- **E02, "Opening an account, start to finish".** "It takes about fifteen minutes and it is
  mostly typing. They ask for your legal name, address, date of birth and a tax number,
  because the law says they have to know who you are, then you link a bank account. Nothing
  gets invested until you say so, so opening one and sitting on it for a month is a
  completely normal thing to do."
- **E03, "The account types, in one page".** "A [[taxableAccount|taxable brokerage account]]
  is the plain one: money in, money out, whenever you like. A retirement account like an
  [[ira|IRA]] or a [[fourOhOneK|401(k)]] gets special tax treatment in exchange for rules
  about taking money out early. Here is the part nobody says out loud: the account is not the
  investment. It is the container, and what goes in it is a separate question."
- **E04, "Your first hundred dollars".** "Most people's first move is small and boring on
  purpose. They move a little across, look at the screen, find where the buttons are, and let
  it sit while they get used to the idea. Nothing about the first hundred is supposed to be
  exciting. It is a rehearsal."
- **E05, "What the fees look like".** "Buying and selling shares at most big brokerages costs
  nothing now, which used to cost real money and then quietly stopped. Funds charge an
  [[expenseRatio|expense ratio]] instead, a small yearly percentage taken out of the fund
  itself, so you never get a bill for it. Advisors charge on top of that. The numbers are
  always written down somewhere, and knowing where to look is most of the skill."
- **E06, "Why people set it and forget it".** "A lot of people turn on a small automatic
  transfer and then stop thinking about it. Not because it is clever, but because deciding
  every single month is exhausting, and a decision you make once is one you cannot talk
  yourself out of at eleven at night. Putting in a fixed amount on a schedule has a name,
  [[dollarCostAveraging|dollar cost averaging]], which makes it sound far more impressive
  than it is."

**Track: What the markets are** (`markets`)

- **E07, "What a stock actually is".** "A [[stock]] is a slice of ownership of a company. Own
  one and you own a genuinely tiny piece of the buildings, the brand, the contracts and
  whatever is left over after the bills are paid. That is it. It is not a bet on a
  [[ticker]], even though every screen ever built makes it look like one."
- **E08, "What the stock market is".** "The stock market is just the place those slices change
  hands. A price is not handed down by anyone official, it is what the last two people agreed
  on about thirty seconds ago. So when the news says the market lost two percent today, it
  means people were willing to pay two percent less than yesterday. That is a mood, and moods
  move."
- **E09, "What a bond is".** "A [[bond]] is a loan you made. You hand over money, you get
  interest along the way, and at the end you get the loan back. Governments and big companies
  borrow like this because it is cheaper than asking a bank. The entire appeal is that it is
  dull, which is genuinely the point of it."
- **E10, "The bond market, bigger than you think".** "The [[bondMarket|bond market]] is larger
  than the stock market and gets almost none of the attention. It is also the thing quietly
  setting what a mortgage costs, what a car loan costs, and what your government pays to
  borrow. Any time you wonder why rates moved, this is the room where it happened."
- **E11, "Index funds and ETFs".** "An [[indexFund|index fund]] buys everything on a list, in
  the proportions the list says, and does not try to be clever about it. An [[etf|ETF]] is a
  fund you can buy and sell during the trading day like a share, and a lot of the popular ones
  are index funds in that wrapper. One purchase, hundreds of companies, nobody picking."
- **E12, "The other markets".** "Past shares and bonds there are [[commodity|commodities]] like
  oil and wheat, there are currencies, there is property, and there is crypto. They are real
  markets and they mostly move for reasons that have nothing to do with each other. Plenty of
  people invest for forty years and never touch any of them, which is worth knowing before you
  feel like you are missing something."

**Track: Staying sane** (`staying-sane`)

- **E13, "Why the news is not a signal".** "Market news comes out every day because it is a
  daily publication, not because something meaningful happened every day. A headline needs a
  reason for today's number, so one gets found by lunchtime. Reading it is fine. Acting on it
  is a completely different sport."
- **E14, "Nobody knows what happens next".** "People who do this professionally, full time,
  with teams and expensive screens, disagree with each other constantly and are wrong in
  public all the time. That is not a scandal, it is what forecasting a thing made of other
  people's moods looks like. Anyone who sounds certain about next year is selling something."
- **E15, "Risk, in plain words".** "[[volatility|Risk]] here mostly means how much the number
  jumps around, not the odds of everything vanishing. A pile of money that swings twenty
  percent either way is unnerving if you need it in March and much less interesting if you do
  not need it until you are fifty. So the honest question is usually not how risky something
  is, it is when you need the money."
- **E16, "When to ask a real person".** "There is a point where this stops being reading and
  starts being your actual life: an inheritance, a house, a tax situation, a business, a
  divorce. That is when a [[feeOnly|fee only]] advisor earns their money, because they are
  paid by you rather than by whatever they sell you. This app is not that, and it is never
  going to pretend to be."

### 9.8a The disclosure

Rewritten this amendment because R15 now allows general principles and procedural first
steps to appear with a visible disclosure instead of being banned outright (section 4). The
line has to earn its keep in two ways at once: it has to be true (the user is not a licensed
adviser, so this really is general information and not advice tailored to anyone), and it has
to read like the rest of the app, a friend a year ahead of you, not a lawyer. One line, no
dashes, used verbatim everywhere it appears so a reader who has seen it once knows exactly
what it says every other time:

"This is general information, not personal advice. We are not licensed financial advisors,
and nothing here is tailored to you or your money."

**Placement, expanded from the previous cycle.** The old rule showed a longer version once at
the top of Lessons, once at the top of Learn and once in Settings, on the reasoning that a
disclaimer on every paragraph reads as nervousness rather than honesty. That reasoning still
holds against repeating a paragraph, but it no longer holds against repeating one short line,
because the library can now say things like "most people start with a broad fund rather than
picking companies", and a reader who opens a single Learn piece or lesson from a deep link,
without ever seeing the library index, should not be the one person who never sees the
disclosure that makes that sentence education instead of advice. The line therefore appears,
at minimum, in all of these places, visible on the screen with no tap or expand required:

- Once at the top of the Learn library index (unchanged from the previous cycle).
- Once at the top of Lessons (unchanged from the previous cycle).
- On every one of the sixteen individual Learn item pages (new).
- On every one of the eight individual lesson pages (new).
- On the Invest screen, near the ledger total from section 8.7, since that is where the
  ledger and the "what are you invested in" capture live and where a reader is most likely to
  be thinking about their own money while reading general copy (new).
- In Settings (unchanged from the previous cycle).

It stays one line in all six places, not the longer three sentence version this replaces, so
that a reader sees the same short, calm statement everywhere rather than a heavier notice in
some places and a lighter one in others. `npm run lint:advice` checks for its exact presence
on each of these screens (section 2, criterion 28).

### 9.8b New tooltips required by the Learn library

`shared/content/tooltips.json` regains terms the v2 draft deleted, plus new ones. This is a
deliberate reversal of a deletion in 1.1: those terms were deleted because no surviving
screen used them, and the Learn library uses them again. The voice rule is that every
financial term gets a tooltip, so the library cannot ship without these.

Restored: `stock`, `bond`, `etf`, `indexFund`.
New: `brokerage`, `taxableAccount`, `ira`, `fourOhOneK`, `expenseRatio`,
`dollarCostAveraging`, `bondMarket`, `commodity`, `volatility`, `feeOnly`, `ticker`.

Each definition is one sentence, in the same voice, and must itself satisfy R15: it says
what a thing is, never whether it is good. A unit test asserts that every `[[term]]` marker
appearing in `learn.json` and `lessons.json` has an entry in `tooltips.json`, and that every
entry is referenced by at least one piece of content.

---

## 10. Build order

Each step is completable and verifiable on its own. Do not start a step before the previous
one is green. Steps 1 to 8 are unchanged in substance from the approved plan; steps 9 to 15
replace the six iOS steps.

1. **Delete.** Remove every DELETE row in 1.1, with its tests, in one commit. Update
   `package.json` (drop recharts), `vite.config.ts` (drop the charts chunk), and routes so
   the app still compiles with placeholder screens where Places and Invest will go. **Also
   delete `.dev-team/ios-spike/` in this commit** (1.5). Verify: `npm run typecheck` clean,
   `npm test` green on the reduced suite, `npm run build` succeeds with no charts chunk, and
   the commit message states the exact number of deleted test cases per file.
2. **Shared content.** Create `shared/content/*.json` from the existing merchant, lesson and
   tooltip data, with the new merchant time fields and the two rewritten lessons, plus
   `holdingTypes.json`. Point `src/data/merchants.ts`, `src/content/lessons.ts`,
   `src/content/tooltips.ts` and `src/content/holdingTypes.ts` at them. Verify: existing
   tests still pass, `lint:copy` extended to `shared/` is 0.
3. **Domain, no UI.** Write `places.ts`, `habits.ts`, `nudges.ts`, `estimate.ts`,
   `ledger.ts`, rewrite `jar.ts`, `tree.ts`, `tick.ts`, `triggers.ts`, `types.ts`,
   `interfaces.ts`, `simulator.ts`. Verify: new unit tests for R2 through R12 pass, and
   `tick.test.ts` proves the R13 order.
4. **Fixture.** Write `shared/fixtures/rules-v2.json` to the coverage floor in 7.3,
   `tests/unit/parity.test.ts` and `scripts/check-rules.ts`. Verify: the suite is green,
   `rules:check` is green, the `caseCount` assertion holds.
5. **State.** New store actions, new validator, schema and key bump, v1 refusal message,
   and `src/lib/pendingNudge.ts` with the record written on every tick. Verify:
   `validate.test.ts` rewritten and green, `store.test.ts` green, a v1 export file is
   refused with the named message, and the pending nudge record round trips through
   IndexedDB in a jsdom test.
6. **Web UI, part one.** Home, the nudge card, the jar actions, Activity. Verify: the loop is
   walkable from the canonical URL, criteria 4, 6, 7, 10.
7. **Web UI, part two.** Places, Invest, the ledger form, the invest capture screen and its
   entry points, Settings, Welcome, the inline SVG summer curves, nav changes, route
   redirects. Verify: criteria 1, 2, 5, 8, 9, 11, 11a, 12, 13, 14, 15.
8. **Web tests.** Update every e2e spec per 1.1, write `v2-loop.spec.ts`, rerun axe on both
   themes and both viewports. Verify: criteria 17 and 18 for the screens that exist so far.
9. **PWA shell.** `manifest.webmanifest`, the four icons, `public/sw.js` with the install,
   activate and a placeholder push handler that shows only the 9.2a fallback, registration in
   `main.tsx`, `src/lib/push.ts` support detection, and the three platform panels in Settings
   (9.4a to 9.4d) with no subscription yet. Verify: criterion 19 and 20, and that removing
   the service worker entirely changes nothing else about the app (6.12).
10. **Backend skeleton.** Fix the `vercel.json` rewrite to exclude `api/` **before writing any
    route**, add the `functions`, `headers` and `crons` blocks, write `api/health.ts`,
    `api/_lib/db.ts` with `getDb()`, `db/migrations/0001_push_subs.sql` and `db/migrate.ts`.
    Run `npm run db:migrate` against Neon. Verify: `npx vercel dev` serves
    `GET /api/health` as JSON with the migration id, the table exists in Neon, and the SPA
    rewrite still serves every app route.
11. **Subscription lifecycle.** `vapid-public-key`, `subscribe`, `schedule`, `unsubscribe`,
    the endpoint hash and constant time auth check in `api/_lib/validate.ts`, the client half
    in `src/lib/push.ts`, and the Nudges card wired to all of it including the failure line.
    Verify: criteria 21, 24, 25.
12. **The scheduler.** `api/_lib/due.ts` with the due query, the stale sweep and an
    **injectable sender**, `api/_lib/push.ts` wiring `web-push` and mapping `WebPushError`,
    `api/cron/send-nudges.ts` with the bearer check. Write the database integration suite
    (11.3) including the daylight saving cases and the 410 deletion. Verify: criteria 22 and
    26.
13. **Notification composition.** The real push handler in `sw.js`: the IndexedDB read, the
    section 9.2 composition, the 9.2a fallback, the two actions, and `notificationclick`.
    Also `pushsubscriptionchange`. Verify: criterion 23, and that a push with an unreadable
    payload still shows exactly one notification.
14. **The Learn library and the advice lint.** `shared/content/learn.json` with the sixteen
    pieces from 9.8, the restored and new tooltips from 9.8b, `Learn.tsx` and the reader
    route, the plain read count, the three surfacing moments, the standing line, and
    `scripts/lint-advice.ts` wired into `prebuild`. Verify: criteria 27 and 28.
15. **Close.** Full unit, integration and e2e runs, `lint:copy` and `lint:advice` across
    `src/`, `shared/`, `api/` and `public/`, the `dist/` secret grep, a production deploy,
    confirmation that the cron actually fired in the Vercel logs, the manual device pass from
    11.4, and the count report in `03-build-notes.md`.

---

## 11. Testing plan

### 11.1 What the tester runs

```
npm install
npm run typecheck
npm run lint:copy
npm run lint:advice
npm run rules:check
npm test                          # Vitest, expect 380 to 440 unit cases
npm run db:migrate                # against Neon, idempotent
npm run test:db                   # Vitest integration project, real Postgres, 12 to 20 cases
npx playwright install chromium   # once
npm run dev                       # http://localhost:5173/?demo=1&freeze=1&start=2026-06-15&seed=42
npm run e2e                       # viewport projects, including the two new iPhone sizes (6.13)
npx vercel dev                    # http://localhost:3000, the only way to exercise api/ locally
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/send-nudges
```

`vite dev` does not serve `api/`. Any spec that touches an API route runs against
`vercel dev` on port 3000, and `playwright.config.ts` gains a third project for those with
its own `baseURL`. Do not try to proxy the functions into the Vite dev server; the runtime
differences are exactly where the bugs will be. The last line above is the manual trigger for
the scheduler (6.8): because a real Vercel Cron on Hobby fires once a day at a time the
tester does not control, this same authenticated call, made locally against `vercel dev` or
against the deployed route, is how the tester exercises the daily send on demand rather than
waiting for it.

### 11.2 Web, unit and browser

- **Vitest** on: PRNG determinism, round-up, minute of day determinism, place
  normalization, habit thresholds at their exact boundaries, nudge selection and the daily
  cap, quiet hour boundaries, estimate averaging and its rounding, jar operations, ledger
  validation and ordering, tree staging, summer math, tick order (R13), the import validator
  including a rejected v1 file, the rule fixture, the pending nudge record round trip, the
  `sw.js` constant copies matching `pendingNudge.ts`, the tooltip coverage check over
  `learn.json` and `lessons.json`, and the cross tree import boundary grep (6.1).
- **Playwright** `v2-loop.spec.ts` at both viewports: onboarding, fourteen days to a habit,
  `?nudge=1` to a nudge, skip, jar credit, jar move to ledger, Invest assertions, the invest
  capture flow, place delete, export scan for coordinates, the redirect checks, the Learn
  library, and a full text scan for "%" adjacent to any ledger figure.
- **Axe** on Home, Places, Invest, Activity, Settings, Welcome, Summer, Learn, a Learn
  reader page, the nudge card, and each of the three Nudges card panels, in both themes, at
  both viewports.
- **Standalone and safe area** (6.13), new this amendment. Playwright emulates the iPhone
  15/16/17 Pro (393x852) and Pro Max (430x932) device profiles, plus 375x812, and overrides
  `display-mode: standalone` (either by stubbing `window.matchMedia` before navigation or
  through a CSS media feature override, whichever the coder's Playwright version supports
  cleanly). The spec then reads `getComputedStyle` on the sticky header, the bottom tab bar,
  and any open sheet, and asserts each carries at least the emulated
  `env(safe-area-inset-*)` value as padding, asserts there is no horizontal scroll on the
  page body, and walks the back control audit list from 6.13, Activity, Learn, a Learn
  reader page, a Lesson reader page, the invest capture screen, and Summer Money revisited,
  clicking each screen's back control back to a tab with the browser's own back and forward
  disabled. What Playwright cannot do is emulate a real Dynamic Island or home indicator
  geometry; it can only assert that the CSS reads and applies a non zero `env()` value. The
  real geometry is confirmed by hand, per 11.4.

### 11.3 The backend and the database

Integration tests run against the real Neon database, in an isolated schema, so the SQL that
ships is the SQL that was tested. Re-implementing the due query in TypeScript to test it
would recreate the second implementation section 7 just deleted.

- Each run creates a schema `test_<random>`, applies the migrations into it, sets
  `search_path`, runs its cases, and drops the schema in an `afterAll` that also runs on
  failure. It never writes to the default schema, so a stray run cannot touch a live row.
- Cases: subscribe is idempotent for the same endpoint; subscribe stores no place, amount or
  name (asserted by listing the table's columns, so adding a column later fails the test
  until the plan is revised); schedule requires a matching `auth` and returns 403 otherwise;
  unsubscribe deletes exactly one row; the due query selects a row whose target minute is
  still ahead of the run (sent ahead of schedule, R14.4), selects the same row forty five
  minutes after its target minute, and does not select it sixty five minutes after; the due
  query does not select a row already sent today, even when the route is called a second
  time in the same run; **daylight saving, both directions**, using `America/New_York`
  across the March and November transitions, asserting `last_sent_local_date` still prevents
  a double send if the route is invoked twice inside the repeated fall back hour, and that a
  target minute is never affected by the spring forward skipped hour because no valid target
  minute (06:00 to 21:00, R4.3) ever falls inside it; the stale sweep clears yesterday's
  minute; the 90 day delete; and a 410 from the injected sender deleting the row while a 429
  leaves it.
- The cron route is tested with a fake sender injected through `api/_lib/due.ts`, so no real
  push is generated and the 404, 410, 429 and generic failure branches are all reachable.
  The bearer check is tested for a missing, wrong and correct secret.

### 11.4 Push delivery, and the honest line between automated and manual

**What is automated.** In Chromium, Playwright grants the notification permission with
`context.grantPermissions(['notifications'])`, and a push is delivered to the registered
service worker through the Chrome DevTools Protocol:

```ts
const client = await context.newCDPSession(page);
await client.send('ServiceWorker.enable');
// registrationId comes from the ServiceWorker.workerRegistrationUpdated event
await client.send('ServiceWorker.deliverPushMessage', {
  origin, registrationId, data: JSON.stringify({ v: 2, t: 'nudge', d: '2026-06-29' }),
});
```

The spec then reads `registration.getNotifications()` from the page and asserts the title
and body were composed from IndexedDB, that they contain the place name and the estimate,
and that they contain no coordinate and no shame language. A second spec seeds a mismatched
date and asserts the 9.2a fallback appeared, with exactly one notification either way. This
covers the whole client half of delivery: the payload, the worker, the IndexedDB read, the
composition and the click path.

**What cannot be automated here, and must be verified by hand before the cycle closes.** The
tester writes each of these up with a screenshot or a plain statement of what happened:

1. A real notification arriving on a real iPhone, with the app added to the Home Screen,
   with the phone locked, at a real scheduled minute. This is the only proof that the whole
   chain works, and nothing in CI substitutes for it.
2. The iPhone Safari pre install state on a real device: the panel appears, no permission
   prompt is triggered, and the rest of the app is fully usable.
3. Desktop Chrome with the tab closed and the browser still running.
4. Vercel Cron actually firing in production, read from the Vercel function logs, once in
   the scheduled UTC hour (6.8), with a non zero `due` count on a morning a nudge was
   scheduled. Because that is only once a day, the tester also confirms the same route can be
   called by hand with the bearer secret, against the deployed URL, and produces the same
   result, which is what makes the rest of criterion 22 checkable without waiting.
5. Permission revoked in browser settings after subscribing: the app notices, does not
   re-prompt, and the row is eventually removed by the 404 or 410 path.
6. Removing the app from the iPhone Home Screen and confirming the app does not claim
   nudges are still on the next time it is opened in Safari.
7. The real Dynamic Island and home indicator on a real iPhone with the app opened from the
   Home Screen (6.13): no header content sits under the Dynamic Island, no tab bar item sits
   under or is intercepted by the home indicator's swipe gesture, and the same holds with the
   phone rotated and rotated back. This can be captured with the same screenshot already
   required for item 1.

### 11.5 Edge cases the tester should start from, and not stop at

- A place with exactly 2 and exactly 3 visits in the window. Spread of exactly 45 and 46.
- A usual minute of 19 (nudge time negative, R4.2) and of 379 and 380 (quiet hour edge).
- Two habit places whose nudge minutes tie, to prove the R4.4 tie break, and that only one
  nudge exists.
- A skip taken on the last minute before the day advances, and a skip taken on a nudge that
  has already expired (must be a no op, not a double credit).
- **A skip taken from the notification and then again from the in app card**, and the
  reverse order. Exactly one credit, one Activity line, one lesson trigger.
- A place deleted while it has a pending nudge, and the schedule call that must follow it.
- A place deleted after it funded skips: the Skip lines and their amounts must survive.
- Estimate with 1, 5 and 6 priced visits, and an average that lands on a half cent.
- A ledger entry of $0, of a future date, of 61 characters in `what`, and with emoji.
- The invest capture with every chip selected and every amount blank, a something else row
  with an empty and with a 61 character label, a chip tapped twice, and saving then
  reopening.
- Deleting a jar sourced ledger entry, then checking the jar did not come back.
- Import of: a v1 export, a v2 export with a forged `habits` array, a file with a coordinate
  on a visit, and a 200k event array.
- Nudges enabled, then disabled mid day with a nudge pending, and the server row after it.
- Nudges enabled with the API returning 500 on `subscribe`: the toggle must not end up in a
  state that claims nudges are on.
- Nudges enabled, then site data cleared, then a `pushsubscriptionchange`: one row, not two.
- The app with `api/` entirely unreachable, per 6.12, all the way through the loop.
- A user in `Pacific/Kiritimati` (UTC+14) and one in `Pacific/Niue` (UTC-11) on the same
  cron run, to prove the due query is not quietly assuming a small offset.
- An invalid or spoofed `tz` value posted directly to `/api/push/schedule`, which must be
  rejected rather than stored and later crashing the cron for every user in the batch. This
  one is important: a bad row in a shared query can take out the whole run.
- A `schedule` call presenting a valid endpoint with the wrong `auth`.
- Learn: every one of the sixteen pieces opens, every `[[term]]` resolves to a tooltip, the
  read count survives a reload, no piece is gated, and the confidence ring still says
  "of 8".
- The advice lint: add a deliberately offending string ("we recommend the total market
  fund") in a fixture file and confirm `lint:advice` fails on it.

---

## 12. Risks and open items

**Retired this cycle**, and named so nobody re-inherits them: the rules no longer exist
twice, so the drift risk is gone; there is no Swift PRNG port, so the parity bug that was
risk 2 cannot happen; the iOS simulator tooling that could not see a booted device no
longer matters; and real device testing is no longer blocking, because there is no native
binary. Real device testing has not disappeared, though, it has changed shape: see risk 3.

1. **The scheduler stays on Vercel Hobby, at one run a day, and that is now a made decision
   with a real cost rather than an open question.** Offered a choice of paying for Vercel
   Pro, adding a free external scheduler such as Upstash QStash, or staying on Hobby with one
   nudge window a day, the user chose the third. The consequence, stated plainly: a single
   daily cron run, itself only accurate to within the hour it is scheduled in (a Hobby
   platform limit, not a bug in this design), cannot honor any individual subscriber's exact
   nudge minute. Most subscribers on Eastern time receive their push earlier in the morning
   than the intended twenty minutes before their usual time, sometimes by an hour or more for
   a habit later in the day; a subscriber whose target minute has already passed by more than
   60 minutes when the run fires gets no push at all that day, which in practice falls
   hardest on subscribers far from North American time zones (6.8). None of this touches the
   in app nudge card, which still works the moment the app is open, with or without a push.
   **Mitigated by design, not by hoping the platform improves:** the endpoint, the schema and
   the client are all unchanged from a per minute design (6.8a), so moving to Pro or adding an
   external scheduler later is a cron expression and two constants, not a rewrite; and
   section 9's copy (9.1, 9.4a) was rewritten in the same amendment to stop promising a
   precision the current schedule cannot deliver.
2. **Delivery is best effort, and the app will get blamed for the browser's behaviour.** A
   push arrives only if the device is on and connected, if the browser has not evicted the
   registration, and, on iPhone, if the app is still on the Home Screen. iOS is the harshest:
   removing the icon silently kills push, Safari can drop a subscription without telling
   anyone, and there is no delivery receipt at any layer. A user who misses a nudge will
   conclude the app is broken, and from where they sit they are not wrong. The mitigations
   are the in app card, which always works, and honest copy, and neither of them makes the
   notification arrive.
3. **Real device verification is now the only proof the feature works.** Nothing in CI can
   demonstrate an actual push travelling from Vercel through Apple's or Google's push service
   to a real phone in its scheduled morning window. Section 11.4 lists seven manual checks,
   and item 1 there is not optional. A cycle that closes without a screenshot of a real
   notification on a real phone has not shipped this feature, it has shipped code that should
   produce it.
4. **The privacy promise is now conditional, which is much easier to get wrong in copy than
   an absolute one.** "Everything stays on this device" was easy to keep true. "Everything
   except three fields, and only if you turn nudges on" needs every screen, tooltip, export
   note and lesson to stay consistent with it forever. One careless string re-asserting the
   old promise makes the app dishonest, and no test will catch a sentence nobody thought to
   look for. Mitigations: the old sentence is deleted outright and `lint:copy` gains it as a
   banned phrase, section 9.4 is the single source, and the manager reviews privacy copy as a
   named gate before the cycle closes.
5. **The server row is small, but it is not nothing, and the plan should not oversell it.**
   A push endpoint identifies one browser durably. A nudge minute is a behavioural signal:
   it says roughly when this person leaves the house. Together with a time zone that is a
   real, if thin, profile, and it is more than this app used to hold about anyone. It is the
   minimum that makes the feature work, which is a different claim from anonymous, and the
   copy in 9.4a says three things are stored rather than implying none are.
6. **Secrets leaking into the browser bundle would be the worst outcome available here.**
   `VAPID_PRIVATE_KEY` in `dist/` means anyone can send notifications to every subscriber,
   and `CRON_SECRET` means anyone can drain the send loop. Vite's `VITE_` prefix rule is the
   mechanical guard, the `src/` to `api/` import boundary test is the second, and the
   post build grep of `dist/` for the literal secret values is the third. Keep all three.
7. **The advice lint is a regex and a well written recommendation will walk straight past
   it, and this cycle proved it.** "Most people in your position end up in a broad index
   fund" contains no banned phrase and is advice; the shipped `lessons.json` L7, "Why $20 a
   week beats $500 later", is the real instance, and it passed both `lint:advice` and the
   copy test (test report V2-7). The revised R15.7 lint pattern (a number sharing a sentence
   with a comparison word) catches that specific shape, and now that R15 also allows general
   principles with a disclosure, the surface area for a lint miss is larger, not smaller: a
   sentence can be phrased impersonally enough to read as R15's allowed first list while
   still landing a tailored recommendation. R15 therefore names a human review gate, and it
   is not a formality: **the manager reads every Learn piece, every lesson and every new
   string against the revised R15 before the cycle closes, and states in the status report
   that it was done, and this gate has not run once across either cycle to date.** It must
   run before the next deploy. Treat a lint pass as necessary and never sufficient.
8. **Sixteen new pieces of copy in one voice is where voice drift happens.** The eight
   confidence path lessons were written together and hang together. The library is twice
   that, written in one pass, and the ones near the end will not sound like the ones near
   the start unless someone reads all sixteen in a row on purpose. That reading is part of
   step 14, not an optional polish.
9. **A formerly offline app now has a network failure mode on its most emotional surface.**
   Every previous cycle could assume every call succeeds because there were no calls.
   Section 6.12 states the required posture and the tester is asked to violate it, but the
   realistic failure is subtler than an outage: a `schedule` call that silently fails leaves
   the UI saying nudges are on while the server has yesterday's minute, and nothing anywhere
   looks wrong until the notification does not come.
10. **Habit detection on a simulated feed will look better than it will on real spending.**
    Unchanged from the approved plan. The simulator draws visit times from a narrow gaussian
    around a merchant default, so places cluster cleanly. Real spending is messier, and the
    3 visits in 14 days with a 45 minute spread thresholds are a first guess. They are
    constants in config for exactly that reason.
11. **The estimate can be wrong in a way that feels dishonest.** Unchanged. An average of the
    last five visits says nothing about what today would have cost. R5.4 labels it every time
    it appears, but a user who skips a $2 coffee and sees $4.41 credited has been told a
    number that did not happen. If this bothers the user, the fix is a range rather than a
    point, and that is a plan revision.
12. **The jar is a promise, not an account.** Unchanged. No money moves. A user can keep a
    $200 jar while spending the same $200 on something else, and the app cannot tell. R6.5
    exists so they can say so, but nothing enforces it.

### Assumptions made on the user's behalf, flagged for review

- **A1.** Round-ups and the paycheck catch survive as jar sources alongside skips. Unchanged.
- **A2.** The fee is removed entirely rather than repositioned (1.3). What this product
  should cost is still open, and now it has an actual running cost attached to it (risk 1).
- **A3.** The self reported current value on a ledger entry is deferred, not built (1.4).
- **A4.** **Rewritten.** The old A4 was about iOS location authorization and is void. The new
  A4 is the nudge composition decision (6.9): **the push carries no content and the service
  worker writes the notification text on the device from IndexedDB.** The alternative,
  composing on the server, is simpler and more reliable, and would put place names and
  amounts in the database. This is the assumption most worth the user's attention, because it
  trades a small amount of notification reliability for keeping spending habits off the
  server, and reasonable people would choose the other way.
- **A5.** Unchanged from the cycle 7 amendment. The risk quiz and the allocation builder stay
  deleted; the light "what are you invested in" capture stands.
- **A6.** No streaks, ever (R9.4). Unchanged, and it now also applies to notifications: a
  missed push is as silent as a missed card.
- **A7.** v1 saved state and v1 exports are refused rather than migrated.
- **A8.** **Replaced.** The old A8 was the iOS deployment target and is void. The new A8:
  **identity is the push endpoint and nothing else** (6.10). No install id, no cookie, no
  account. The cost is that the same person on two browsers is two rows and can get two
  nudges in a day (R14.10).
- **A9.** **New. The Learn library is completely ungated**, sixteen pieces readable from day
  one, with a plain read count rather than a ring (8.9). The confidence path keeps its eight
  lessons, its triggers and its ring. The alternative, unlocking library pieces on progress,
  would gate education behind behaviour, which this product has no business doing.
- **A10.** **New. Quiet hours stay fixed at 06:00 to 21:00 and are not user editable this
  cycle** (R4.3), and the UI must not appear to offer editing. A user editable window
  crossing midnight changes the due query and the R4.3 comparison, and that is a rule change
  rather than a settings control.
- **A11.** **Superseded by the cycle 7 amendment 3, and no longer an assumption.** The
  original A11 assumed a five minute cron cadence with a ten minute late drop window. The
  user has since made an explicit choice, stay on Vercel Hobby with one nudge window a day,
  so the cadence (`0 10 * * *`, once daily) and the drop window (60 minutes, R14.4, R14.5)
  are a stated decision with its own risk entry (risk 1, section 12) rather than an assumption
  flagged for review. Both remain constants in one file, and the upgrade path in 6.8a is the
  one line change if that decision changes.

---

## Revision log

- **v2.0, 2026-09-08.** First version of the pivot plan. Supersedes `02-plan.md` for all
  work from this point. Written after the pivot interview; the user chose removal option
  3 plus a manual investment ledger, and native Swift and SwiftUI over Expo. The
  architect verified before writing that a hand written Xcode project builds and
  launches on this machine and that a SwiftPM test target over the same sources runs
  XCTest, and that this session's simulator MCP tools could not see a booted device.

### Cycle 7 amendment, 2026-09-08: light "what are you invested in" capture

- Changed: section 1.1's disposition table (new rows for `InvestCapture.tsx` and
  `holdingTypes.ts`, updated reasons for the four files that stay deleted); section 1.2
  (rewritten to describe the capture rather than "nothing replaces them"); section 2
  (new criteria 11a and 24a); section 3 scope (new must have bullet); section 7.2
  (added `shared/content/holdingTypes.json`); section 8 (new section 8.7a); section 9
  (new section 9.7a with the capture's copy); section 10 (steps 2, 7 and 11 updated);
  section 11 (11.2, 11.3 and 11.4 extended); assumption A5 (rewritten).
- Because: the user approved this plan with one amendment at the plan approval
  checkpoint. Assumption A4 (When In Use location, time scheduled nudges) stood as
  written. Assumption A5, which had deleted the risk quiz and the allocation builder
  with nothing replacing them, was amended by the user to keep a light version: a
  short capture of what the user is actually invested in, feeding the manual ledger,
  without the simulated risk read.
- Impact on downstream: the coder builds one new screen, `InvestCapture.tsx` on web
  and `InvestCaptureView.swift` on iOS, both thin front ends onto the existing
  `addLedgerEntry` action and R7, with no new domain module and no new fixture cases.
  `RiskQuiz.tsx`, `AllocationBuilder.tsx`, `AllocationBar.tsx` and `src/content/quiz.ts`
  remain deleted outright, per the original plan, and are not rewritten into the new
  screen. The tester verifies, on both platforms, that the capture creates exactly one
  ledger entry per selected holding type, that a something else row requires and
  bounds its free text label, and that no percent, computed value, risk label or chart
  appears anywhere on the screen or at the moment of saving (criteria 11a and 24a).

### Cycle 7 amendment 2, 2026-09-08: web only, push backend, expanded lessons

- **Changed.** Three user decisions, applied across the whole document.
  1. *No iOS app. Web only.* Section 6 is repurposed from the iOS architecture to the PWA
     shell and the push backend, and says so at the top rather than being renumbered.
     Section 7 drops the two language parity machinery and keeps the fixture in reduced form
     as a single Vitest suite. Acceptance criteria 19 to 24 and 24a (iOS) are deleted; the
     numbers are reused for the PWA and push criteria. Every "(web and iOS)" heading in
     section 8 is now web only. Build order steps 9 to 13 (iOS skeleton, domain, UI,
     notifications, close) are replaced by steps 9 to 15. Testing section 11.3 (XCTest and
     the simulator) is replaced by database integration testing. `.dev-team/ios-spike/` is
     retired: **delete it in build step 1** (1.5). Risks 1 to 4 of the old section 12 (rule
     drift across languages, the Swift PRNG port, the simulator MCP tooling, and unverified
     real device behaviour) are retired, and assumptions A4 and A8 are void and replaced.
  2. *A push backend, reversing the "no backend" decision.* New section 6 in full: the PWA
     manifest and service worker; the three platform states of the install and permission
     flow, including that iOS Safari requires Add to Home Screen before Web Push exists at
     all; Web Push with VAPID through `web-push` and no third party provider; Vercel
     Functions on the Node.js runtime with four subscription routes and one cron route; the
     already provisioned Neon Postgres with a lazy `getDb()` and a single `push_subs` table
     with numbered SQL migrations; and Vercel Cron at `*/5 * * * *` with the timezone
     solved by storing an IANA name and letting Postgres evaluate `now() at time zone tz`
     per row. New rule block R14 (eleven rules) covers delivery, scheduling, the ten minute
     late drop, payload shape, failure handling and retention. Section 3 removes "a backend"
     and "any network request at runtime" from out of scope and replaces them with the much
     narrower bans that still hold. Section 9.4 is rewritten: the promise "No password.
     Everything stays on this device." is deleted from the product and from the codebase,
     replaced by a standing line that is true in every state plus a specific consent panel
     naming the three fields that leave. **The composition decision: the push carries no
     content, and the service worker writes the notification text on the device from
     IndexedDB.** Server side composition was rejected because it would put place names and
     amounts in the database; the cost is a vaguer fallback notification when IndexedDB
     cannot be read, and that trade is stated in 6.9 and flagged as assumption A4. Identity
     is the push endpoint hash and nothing else: no install id, no cookie, no account (6.10,
     assumption A8).
  3. *Keep and expand the lessons.* The eight confidence path lessons and their ring are
     untouched. A new ungated Learn library of sixteen pieces across three tracks (Getting
     started, What the markets are, Staying sane) is specified in full in section 9.8, with
     fourteen restored and new tooltips in 9.8b, its own plain read count rather than a ring,
     and three surfacing moments that highlight without unlocking (8.9, R12.5). New rule
     block R15 makes "education, not advice" normative in seven rules, enforced by a new
     `scripts/lint-advice.ts`, by assertions in `copy.test.ts`, and by a named human review
     gate, because a regex cannot catch a well written recommendation.
- **Because.** The user made three decisions after the plan was approved and amended once.
  On iOS: "actually can you keep it a web app and not make it an ios app." On the backend:
  told plainly that a web app cannot wake itself at 07:40 to fire a notification and that
  this needs a server, they chose "Add a small push backend." On the lessons: "keep the
  lessons and add other tips on how to start investing and how to get interested in the
  stock, bond and other markets and inform." The backend decision is a genuine reversal of
  the architect's own section 8 interview answer and of the everything stays on device
  posture, so it is documented as a reversal rather than folded in quietly.
- **Impact on downstream.** The coder loses six iOS build steps and gains seven web ones,
  and the shape of the work changes: about a third of this cycle is now server side code in
  a tree (`api/`, `db/`) that did not exist, against a database that is already provisioned
  and must not be re-provisioned. Three things in that work are easy to get wrong and are
  called out in place: the existing `vercel.json` SPA rewrite currently swallows `/api/*`
  and must be fixed before the first route is written (6.6, criterion 19); nothing under
  `api/` may be imported from `src/` or the VAPID private key reaches the browser bundle
  (6.1, 6.11); and every push branch must end in exactly one `showNotification` or the
  browser will eventually take the permission away (R14.7). The tester gains a database
  integration project (`npm run test:db`) running against an isolated Neon schema, a CDP
  based push delivery spec, and six manual checks that no CI can replace, of which a real
  notification on a real iPhone is required to close the cycle (11.4). The manager gains two
  named review gates: the privacy copy against section 9.4, and all Learn and lesson copy
  against R15. And the user has one decision to make before build step 12: Vercel Cron at
  five minute cadence needs a Pro plan, and the free alternatives may be too imprecise for a
  ten minute drop window (risk 1).

### Cycle 7 amendment 3, 2026-09-08: Hobby daily cron, iPhone standalone layout

- **Changed.**
  1. *The scheduler moves from an assumed five minute cron to a designed once a day cron on
     Vercel Hobby.* R14.4 and R14.5 (section 4) are rewritten: due selection now has no upper
     bound, so a row whose target minute is still ahead is sent early rather than waiting for
     a later run that will not come, and the late drop window widens from 10 to 60 minutes to
     match Hobby's own within the hour trigger imprecision. Section 6.8 is rewritten in full:
     the cron expression changes to `0 10 * * *` (10:00 UTC, once daily) in `vercel.json` and
     in the prose, the due query in `api/_lib/due.ts` drops its upper bound, the "consequences
     worth stating" bullets are replaced with an honest account of what a single daily,
     hour imprecise run does to delivery timing, and the closing paragraph states the decision
     as made rather than open. A new section 6.8a documents the upgrade path to Pro or to
     Upstash QStash as a cron expression and two constants, nothing else. Section 2's
     criterion 22 is rewritten to test the once a day due query, including the manual trigger
     endpoint, instead of a five minute cadence. Section 11.1 gains a `curl` example for
     triggering the scheduler by hand; 11.3's database case list and 11.4's manual checklist
     are updated to match. Section 12's risk 1 is rewritten from "this needs Pro or an
     imprecise free alternative" to an honest account of what staying on Hobby costs, and its
     cross reference from the old risk 4 mislabel is fixed in the same pass. Assumption A11 is
     marked superseded, since the cadence is now a stated decision with its own risk entry
     rather than an assumption to flag. Copy in 9.1 (step 2) and 9.4a is rewritten to stop
     promising a specific number of minutes or a specific clock time, since a once a day
     server run cannot deliver that.
  2. *The iPhone standalone layout is specified for the first time.* New section 6.13 covers
     `viewport-fit=cover`, `env(safe-area-inset-*)` applied to the sticky header, the bottom
     tab bar, the catch sheet, fixed overlays, the demo tray and modals; an audit of which
     screens need an in app back control now that standalone mode has no browser chrome
     (Activity, Learn and its reader, a Lesson reader, the invest capture screen, and Summer
     Money when revisited); `apple-mobile-web-app-status-bar-style` for light and dark; and
     the new test viewports (393x852, 430x932) alongside the existing 375x812, which stays
     the smallest supported size. Section 1.1's disposition table is corrected to match:
     `Header.tsx`, `Toast.tsx` and `CatchSheet.tsx` move from KEEP to MODIFY, and `NavBar.tsx`
     and `DemoTray.tsx` gain a stated reason for the safe area work they now also need.
     Section 2 gains criteria 20a and 20b for standalone safe area rendering and for back
     control reachability. Section 11.2 gains a standalone and safe area testing paragraph,
     and 11.4 gains a seventh manual check for real Dynamic Island and home indicator
     geometry, which Playwright cannot emulate.
- **Because.** Two decisions from the user, given after the plan was amended twice already.
  On the cron: told plainly that the five minute schedule the design wanted needs a paid
  plan, and offered Upstash QStash, upgrading to Pro, or staying on Hobby with one daily
  window as the three honest options, the user chose to stay on Hobby with one nudge window
  a day. On the phone: "build the app so its able to be put and used on iphone as a web app
  so make the screen compatible on mobile devices." The PWA install flow and manifest already
  existed; what was missing was the layout work that makes an installed PWA correct on a
  real iPhone rather than merely installable on one.
- **Impact on downstream.** The coder implements the widened, no upper bound due query and
  the two new constants in the same file the five minute version would have used, so this is
  a substitution, not new surface area, in `api/_lib/due.ts`. The cron entry in `vercel.json`
  is a one line change. The layout work touches every screen and several shared components
  (`Header.tsx` most of all, which gains the back control prop every audited screen now
  needs) rather than one subsystem, so the coder should expect it to be the more time
  consuming of the two changes despite being conceptually simpler. The tester gains: a
  rewritten set of database cases for the once a day due query (11.3); a manual trigger step
  before every push related manual check, since the real cron cannot be made to fire on
  demand (11.4); and a new standalone and safe area Playwright suite plus a seventh manual
  device check for real notch and home indicator geometry (6.13, 11.2, 11.4). The manager's
  existing privacy copy review gate (9.4) now also covers the reworded 9.1 and 9.4a strings,
  since a timing claim that overstates precision is its own kind of dishonesty even though it
  is not a privacy claim.

### Cycle 8, 2026-09-09: advice policy relaxed with disclosure

- **Changed.** R15 (section 4) is no longer an absolute explain never advise rule. It now
  splits in two: general principles stated for everyone, procedural first steps, and plain
  encouragement to start are allowed, but only with a visible disclosure on the same screen;
  named securities, tailored allocations, contribution amounts or timelines, predicted or
  guaranteed returns, ranked or "beats" style comparisons, and anything a reasonable reader
  would take as a personal recommendation stay banned outright, disclosure or not. The
  disclosure itself is rewritten (9.8a) to "This is general information, not personal advice.
  We are not licensed financial advisors, and nothing here is tailored to you or your money."
  and its placement widens from three list level spots to six: the Learn library index, every
  one of the sixteen Learn item pages, every one of the eight lesson pages, the Invest screen,
  Settings, and the top of Lessons. `scripts/lint-advice.ts` gains a pattern that fails on a
  specific number sharing a sentence with a comparison word, with a regression fixture proving
  it now catches the original, unmodified L7 text that the test report's V2-7 finding showed
  slipping past both existing lints. L7 itself is rewritten (9.6, 9.6a) from "Why $20 a week
  beats $500 later" to "Why early money has more time to grow", keeping its place in the fear
  check mapping and dropping the specific figures and the "beats" framing that made it a
  tailored comparison rather than a general principle. R15.7 layer 3, the human review gate,
  is restated against the new line and flagged, factually and without alarm, as never having
  run across either cycle; it must run before the next deploy. Section 2's criterion 28 and
  section 12's risk 7 are updated to match.
- **Because.** The user's own words: "some simple advice can be good, but not specific
  financial advice or you can give it but just incude a disclosure about how its not
  technically financial advice bc i cant give that." That is a factual limit as much as a
  preference, since the user is not a registered investment adviser, and a disclosure does
  not convert a personalized recommendation into general education no matter how it is
  worded. The revision draws the line where the user drew it: general and procedural content
  gets a disclosure, personalized recommendations stay banned regardless of one.
- **Impact on downstream.** The coder implements the new disclosure string in
  `shared/content/strings.ts` or `learn.json` (whichever already holds 9.8a's line), renders
  it on the three new surfaces (every Learn item page, every lesson page, Invest) in addition
  to the three existing ones, rewrites L7 in `shared/content/lessons.json` to the 9.6a text,
  and adds the comparison word plus number pattern to `scripts/lint-advice.ts` along with the
  original L7 regression fixture and the impersonal framing allowlist so genuinely general
  sentences keep passing. The tester should re-run the eight planted violations from V2-7 plus
  the new L7 fixture, confirm the disclosure renders unexpanded on all six surfaces, and adversarially
  probe the new "allowed" list for sentences that sound general but read as tailored, since
  that boundary is exactly where the human review gate exists to catch what the lint cannot.
  The manager's status report must state plainly whether the R15.7 layer 3 read-through has
  now actually happened, since the plan no longer treats R15 as satisfied without it.

### Cycle 3 fixes, 2026-09-10: V2-9 to V2-19

- Changed: R10.4 counts `jarCents + ledgerTotal`. R16.2's rate ceiling drops to 2500 bps.
  New R16.5 (bond-only rates, `holdingType` stored), R16.6 (edits keep unshown fields), R16.7
  (capture parsing). L1 now unlocks on the first habit spotted and is its own lesson ("How it
  spotted your usual stop"). L4 and the `dip` tooltip no longer say a dip is only a loss if you
  sell. L5, the `jar` tooltip and the auto-advance toast no longer say the jar works by itself.
  5.4's import validator now rebuilds every section from its known fields and drops any other
  key. `lint-advice` normalises hyphens and curly apostrophes, adds "beats the market", no
  longer lets "usually" or "most people" switch off the number and comparison rule, and reads
  every template interpolation as a number. The R18 "Read more" links are 44 px tall.
- Because: tester cycle 3, V2-9 to V2-19, and the owner's four decisions on 2026-09-10 (R10.4
  formula, store the entry type, rewrite L4, owner does the R15.7 layer 3 read).
- Impact on downstream: the tester re-runs cycle 3. Four of its tests encode assumptions the
  fixes change on purpose, and are the tester's to reconcile:
  1. `tests/unit/tester-v3-cycle3.test.ts`, the two R10.4 DEFECT cases, compute the old
     formula inline rather than calling the selector.
  2. `tests/e2e/tester-v3-cycle3.spec.ts` capture case `term 600, rate 50` expects 5000 bps
     stored; 50% is now over the 2500 bps ceiling, so the capture refuses it.
  3. The same spec's 320 px test captures a bond at 50%, so its save stays disabled and the
     test times out before it checks any layout.
  4. The same spec's import case puts a term and rate on an Individual stocks row. The import
     validator now rejects that file outright (R16.5), so the flow waits for a screen that
     never comes. The defect is fixed; the test needs to assert the rejection instead.
- Also on 2026-09-11: four committed e2e specs had gone stale in earlier commits and were
  fixed. `learn.spec.ts` hardcoded a library of 16 (it is 20, now read from `learn.json`);
  `v2-loop.spec.ts` criterion 10 funded the jar by letting days pass, which stopped working
  when round-ups went; `pwa.spec.ts` 8.10 and criterion 25 still expected the "three things
  stored" card and the server-row message when no row exists, which V2-1 made honest. Earlier
  reports of "0 failed" for `0ab8031`, `352d618` and `01a134b` were wrong: they were read
  from the log's last lines, not its failure count.

### Cycle 4 fixes, 2026-09-11: V2-20 to V2-25, and the toast

- Changed: the capture checks every row before writing any, and names an amount over the cap
  on its row (V2-20). New R16.8: rows an earlier build saved are tidied on load and on import,
  and the user is told; a failed import says what failed (V2-21). Your money says "set aside",
  not "kept", and its empty state and note describe what it counts (V2-22). The ledger form
  picks the type from six chips, and Invest shows the type beside a name that differs (V2-23,
  R16.5). The empty jar no longer mentions round-ups (V2-24). An edit is judged on the row as
  it will be stored (V2-25). Found in passing on production: every toast sat half off a phone
  screen from 76c4737, because framer-motion's inline transform replaced the class that
  centered it; it is now centered with insets, and a v2-loop e2e case holds it there.
- Because: tester cycle 4, and the owner's two decisions on 2026-09-11 (tidy on load and say
  so; the type is a choice in the form).
- Impact on downstream: the tester's cycle 4 DEFECT cases assert the fixed behavior, so they
  should now pass. Three of its cases encode behavior
  the owner changed: the cycle 3 import case asserts the refusal of a stock row carrying a
  rate, which now imports with the rate removed and a notice; the V2-23 case expects a renamed
  bond row to lose its line, which by decision keeps it and shows its type; and the cycle 3
  control case pins the old "You have kept" copy. b143bdf's code now has committed unit
  coverage in `tests/unit/cycle3-fixes.test.ts`.

### Cycle 5 fixes, 2026-09-11: V2-26 to V2-29

- Changed: the jar move form on Home saves the type, length and rate it shows (V2-26, Major:
  its save passed only the date, name and note, although the cycle 4 notes said the chips
  worked in all three forms). The load-time migrate is now `migratePersisted` in
  `src/state/persistence.ts`, and hands back the stored state unchanged if anything in it
  cannot be read, because a throw there makes zustand boot on the initial state and its next
  write erases the user's data (V2-27). A Something else label over the limit says so on its
  row (V2-28). A refused import names the failing part from a fixed list in `strings.ts` and
  never shows validator text or anything read from the file; the generic refusal now says "not
  a complete Spare Change export", which is also true of a truncated one (V2-29).
- Because: tester cycle 5.
- Impact on downstream: the tester's cycle 5 DEFECT cases for V2-26 to V2-28 assert the fixed
  behavior, so they should now pass. R16.8's load path and the chips outside the edit
  form now have committed tests (`cycle3-fixes.test.ts`, `v2-loop.spec.ts`).

### Cycle 6 fix, 2026-09-11: V2-30

- Changed: `migratePersisted` tidies one row at a time, so a row it cannot read is kept exactly
  as stored and no longer stops every other row from being tidied (V2-30, Minor: the cycle 5
  try/catch wrapped the whole ledger, so one unreadable row cancelled the tidy for all of them).
- Because: tester cycle 6, which otherwise found V2-26 to V2-29 fixed and called the build SHIP.
- Impact on downstream: a committed unit case in `cycle3-fixes.test.ts`; nothing else changes.

### Owner decision, 2026-09-11: the weekly row on Home is removed

- Changed: Home no longer shows the row of three tiles above the R17 habit card (kept this
  week, skips this week, days in, test ids `stat-week-kept`, `stat-skips-week`,
  `stat-days-in`). The habit card is the only place Home counts skips.
- Because: the row repeated the card; "days in" counted time passing rather than a choice,
  which theme section 2 says is not the measure; and "0 skips this week" in a quiet week read
  as the kind of shortfall R17.4 forbids.
- Impact on downstream: `v2-loop.spec.ts` criterion 7 checks the lifetime skip count instead;
  the tester's legacy round-up case in `tester-v3-cycle3.spec.ts` cross-checked the weekly
  figure and is the tester's to update. The domain selectors `keptThisWeekCents` and
  `skipsThisWeek` stay; nothing on screen uses them now.
