# Build Plan: Spare Change (working name)

Written 2026-09-06 by the Architect. Source: `.dev-team/01-brief.md` including the Architect Q&A. Every item in that Q&A is treated as decided. This plan is self-contained; the Coder should not need to ask the user anything.

Section numbers are stable so the Coder and Tester can reference them (for example "see 4.3 Sweep rule").

---

## 1. Context

**Primary user:** a college student or recent grad, 18 to 24, who earns in bursts (summer job, campus job, side gigs) and has no system for keeping any of it. Not an active trader. Explicitly not the user: anyone who wants to pick stocks, trade, or budget.

**Problem:** saving feels pointless at $20 a week, so they never start.

**Solution (v1):** a mobile-first React web app, entirely in the browser, that simulates a bank feed and a brokerage. It catches round-ups on simulated purchases plus a chosen percentage of each simulated paycheck into a jar, sweeps the jar into a five-ETF portfolio priced from a seeded 400-trading-day series, and teaches the user with short lessons that unlock on events. Simulated time is decoupled from the wall clock. No backend, no real money, no network calls at runtime.

Mission line: "Keep a little. It goes a long way."

---

## 2. Definition of done

Top-level goal, quoted verbatim from the brief:

> A new user can complete the summer money screen, fear check, and risk quiz, tweak their allocation with live risk feedback, watch simulated transactions generate round-ups, simulate a paycheck landing and accept a catch, see the jar fill and sweep into the portfolio, view 30 days of mocked portfolio history, and unlock at least three lessons along the way. All animations work on mobile and desktop.

Broken into acceptance criteria. Each is verifiable by running the app (dev server) or a test. "Both viewports" means a 375 x 812 mobile viewport and a 1280 x 800 desktop viewport.

1. **Fresh start.** Opening the app with empty storage shows the Welcome screen. Opening it with a completed profile in storage shows Home. Verified on both viewports.
2. **Profile.** Welcome collects a display name (required, 1 to 40 chars) and email (optional, must look like an email if present). No password field exists anywhere.
3. **Summer money screen.** Entering summer earnings of $3,000, $500 left, age 19 renders two curves. The "start now" curve ends at 65 at $98,000 to $99,000 and the "start at 30" curve at $44,000 to $45,000 (7% assumption; see 4.10). The 7% assumption is disclosed in a tooltip. Leaving earnings blank uses $3,000 and says so on screen.
4. **Fear check.** Four options are shown. Picking one and continuing results in that option's lesson (see 7.3) being the "next lesson" card on Home after onboarding.
5. **Risk quiz.** Five questions, three options each. Answering all with the first option yields Conservative; all with the last yields Growth; a mixed set that totals 9 to 12 yields Balanced (see 6.5).
6. **Allocation builder.** Shows the preset for the quiz profile as a stacked bar with five segments summing to 100%. Adjusting any segment (via drag or the +/- buttons) updates the risk read text and the expected-range chart within the same render, with the bar still summing to 100%. Moving bonds plus cash-like below the profile floor turns the risk read amber, shows the warning copy, and Save requires a second confirmation tap. A one-time inline explainer appears on first open and not on later opens.
7. **Onboarding completes to Home.** After Save, Home renders with the jar at $0.00, the tree at stage 0, and the portfolio value $0.00.
8. **Round-ups.** With `?demo=1`, tapping "Next day" adds at least one round-up line to the Activity feed and increases the jar balance. The jar visual's fill height increases.
9. **Sweep.** Within at most 12 "Next day" taps the jar reaches the $5.00 threshold, the sweep animation plays, the jar returns to $0.00 (or the remainder, see 4.3), the portfolio value becomes greater than $0.00, and confetti fires on this first sweep only.
10. **Paycheck catch.** Tapping "Land a paycheck" opens the catch prompt showing the computed dollar amount at the user's catch percentage (default 5%). Accepting adds a catch line to Activity for exactly that amount and adds it to the jar (and sweeps immediately if the jar is now at or above threshold). Declining adds nothing and closes the prompt. "Change %" changes the amount for this deposit only; the settings value is unchanged afterward.
11. **Natural paycheck.** Without using "Land a paycheck", a paycheck prompt appears after advancing to simulated day 3 and again on day 17.
12. **Portfolio history.** After the first sweep, advancing 30 or more simulated days (for example "Skip a week" five times) shows a Portfolio chart with at least 30 data points, holdings for every ticker with a nonzero weight in the user's allocation (a ticker weighted 0%, such as VTIP under the Growth preset, is never bought and is correctly excluded), a fee line, and a price-provenance label that matches the `source` field of the bundled price JSON.
13. **Fee.** On the first simulated 1st-of-month after the portfolio is funded, a $1.00 fee line appears in Activity and the portfolio value drops by $1.00 relative to what it would otherwise be (unit test) and Settings shows "$12 a year".
14. **Lessons.** In the flow above, at least three event-triggered lessons (first round-up, first catch, first sweep) unlock, each showing the "new" pulse state until opened. Opening a lesson marks it read and advances the progress ring by 1/8.
15. **Growth copy.** Every growth figure on Home and Portfolio is labeled "since you started" and shows a sign. No daily change figure exists anywhere.
16. **Persistence.** Reloading the page after the steps above shows the same jar, portfolio, day index, and lesson state. "Reset demo" in Settings returns to Welcome with empty state.
17. **Export and import.** Export produces a JSON file; importing it into a reset app restores the same state (day index, events count, holdings).
18. **Auto-advance.** With `lastOpenedRealDate` set to two days ago in storage, opening the app advances the simulation by two days (unit test with a mocked clock; e2e optional).
19. **Summer mode.** With the simulated date in June, July, or August (or demo "Force summer" on), the Home headline reads "Kept this summer" with a "what this becomes by 30" line under it. Outside summer it reads the standard headline.
20. **Copy.** `npm run lint:copy` passes on the shipped code and fails when an em dash is added to any UI string. Every term in the tooltip list (12.2) renders a tooltip where it appears.
21. **Dark mode.** Settings offers System / Light / Dark. Switching applies immediately and persists.
22. **Animations on both viewports.** Count-up on the portfolio value, jar fill, sweep animation, confetti on first sweep, and lesson pulse all render on both viewports with no console errors. With `prefers-reduced-motion: reduce`, the app still completes the same flow (animations become instant).
23. **Layout.** At 375 px wide there is no horizontal page scroll on any screen; navigation is a bottom tab bar. At 1280 px navigation is a left rail and content is capped at a readable max width.
24. **Unit tests and e2e.** `npm test` passes. `npm run e2e` runs the DoD scenario on both viewports and passes.

---

## 3. Scope

### 3.1 Must-have (v1)

- Local profile (name, email), no password.
- Onboarding: welcome, summer money, fear check, risk quiz, allocation builder with guardrails and one-time explainer.
- Deterministic transaction simulator behind `TransactionSource`.
- Round-up engine, jar, sweep at adjustable threshold ($1, $3, $5, $10 presets; default $5).
- Paycheck catch: biweekly simulated paycheck, prompt with one-tap accept, "change %" for this deposit only.
- Simulated brokerage with fractional shares behind `Brokerage`; five tickers VTI, VXUS, BND, VNQ, VTIP.
- Seeded 400-trading-day price series behind `PriceSource`, real if available, synthetic fallback, honestly labeled.
- Simulated clock with daily tick, demo controls tray, auto-advance on open.
- $1/month simulated fee, per-year line in Settings, fee line in Portfolio.
- Home: jar, tree, stats, next-lesson card, summer-mode headline.
- Activity feed, Portfolio detail with chart, Lessons library with progress ring, eight lessons, Settings.
- Milestone cards (three) rendered to PNG with a save button. Build last (step 13).
- Dark mode (system default, manual override). Responsive mobile-first layout.
- Export/import JSON, Reset demo.
- Persistence in IndexedDB on one device.
- Copy lint (no em dashes), tooltips on financial terms.
- Vitest unit tests, Playwright e2e on two viewports.

### 3.2 Nice-to-have (deferred, do not build)

Round-up multipliers, recurring deposits, savings goals, partner cashback, real bank linking, real brokerage execution, a first catch from "what's left" on the summer screen, cross-device sync, real auth.

### 3.3 Explicitly out of scope

Real money movement, payment processing, tax documents, crypto, social features or share-to-network integration, individual stock picking, premium tiers, budgeting or spend tracking, analytics, error reporting, any third-party runtime network call, backend of any kind.

---

## 4. Domain rules (precise)

All rules here are implemented as pure functions in `src/domain/` with no React or store imports, so they are unit-testable in isolation.

### 4.1 Money representation

- All ledger money is **integer cents** (`type Cents = number`, always an integer). Never store dollars as floats in state.
- Shares are stored as JavaScript doubles (`shares: number`). Portfolio value is computed as `Math.round(shares * priceCents)` per holding, then summed, so a purchase valued on the same day it was bought returns exactly the cents spent.
- Prices are stored in JSON as decimal dollars with two decimals and converted once to integer cents when loaded (`Math.round(close * 100)`).
- Projections (summer curves, expected range, "by 30") are plain floats in dollars, rounded to whole dollars for display with thousands separators.
- Rounding: `Math.round` (half away from zero on positives) everywhere cents are derived from a percentage. Percentages in state are integers 0 to 100.
- Formatting: `formatCents(cents)` renders `$1,234.56`; negatives render `-$0.37`; signed variant `formatSignedCents` renders `+$0.37` or `-$0.37`.

### 4.2 Round-up rule

- For a purchase of `amountCents`: `roundUpCents = (100 - (amountCents % 100)) % 100`.
- **Exact-dollar purchases round up to $0 and emit no round-up event.** (Decision: honest math beats a manufactured dollar. The purchase still exists in the ledger but does not appear in the Activity feed, which lists round-ups and catches only.)
- Examples: $4.35 -> $0.65; $9.99 -> $0.01; $45.00 -> $0.00 (no event).
- If `settings.roundUpsPaused` is true, purchases are generated and recorded but no round-up events are emitted and the jar does not change.
- Each round-up event references its purchase (merchant, amount) for the feed line.

### 4.3 Jar and sweep rule

- `jarCents` accumulates round-ups and accepted catches.
- Sweep check: `if (jarCents >= settings.sweepThresholdCents)` then sweep **the entire jar balance** (not just the threshold) into the portfolio. After a sweep the jar is $0.00.
- The sweep check runs (a) in the daily tick after all of that day's round-ups are applied, and (b) immediately after a catch is accepted. It does not run when the threshold is changed in Settings; a lowered threshold takes effect at the next tick.
- Sweep produces one `Sweep` event with the amount and the fills (per-ticker cents and shares).
- The first sweep ever sets `firstSweepDayIndex` and fires confetti once (`milestones.confettiShown = true`).
- Threshold presets: 100, 300, 500, 1000 cents. Default 500.

### 4.4 Paycheck and catch rule

- Paychecks are due on simulated day `d` when `d >= 3 && (d - 3) % 14 === 0` (days 3, 17, 31, ...). Day 0 never has one.
- `paycheckCents = clamp(Math.round(summerEarnedCents / 6), 5000, 500000)`. If the summer screen was left blank, `summerEarnedCents` defaults to 300000, so the default paycheck is $500.00 (300000 / 6 = 50000).
- A due paycheck is pushed onto `pendingPaychecks` (a queue, oldest first). The tick does not decide the catch; the user does. The Home screen shows the prompt for the head of the queue whenever the queue is nonempty.
- Catch amount: `catchCents = Math.round(paycheckCents * pct / 100)` where `pct` is `settings.catchPct` (integer 1 to 20, default 5) unless the user used "change %" on this prompt, in which case the per-prompt `pct` is used and `settings.catchPct` is left unchanged.
- Accept: emit `Catch` event, add to jar, run sweep check, evaluate triggers. Decline: pop the queue, emit nothing. No shame copy on decline.
- Demo "Land a paycheck" pushes a paycheck with the same amount immediately without advancing the day.
- The paycheck itself is not tracked as a balance anywhere (no budgeting). Only the catch enters the system.

### 4.5 Fee rule

- `FEE_CENTS = 100` and `FEE_LABEL = "$1/month"` live in `src/config.ts` as the single source of truth.
- On each tick where the new simulated date has day-of-month 1 and `portfolioValueCents > 0`, deduct `feeCents = min(FEE_CENTS, portfolioValueCents)` by selling proportionally (4.7). Emit a `Fee` event. Never charge on day 0. Never let any holding go negative.
- Settings shows: "Flat fee: $1/month. That is $12 a year." and "Fees so far: $X.XX" (sum of Fee events).
- Portfolio detail shows the same "Fees so far" line.

### 4.6 Fractional-share purchase at that day's close

- A sweep of `amountCents` with allocation weights `w_k` (integers summing to 100) buys each ticker: `allocCents_k = Math.floor(amountCents * w_k / 100)`. The leftover cents from flooring (`amountCents - sum(allocCents_k)`) are added to the ticker with the largest weight (ties: first in ticker order VTI, VXUS, BND, VNQ, VTIP). Tickers with `w_k = 0` get nothing.
- `shares_k += allocCents_k / priceCents_k(tradingDayIndex)`.
- Price used is the close of the current `tradingDayIndex`. On a simulated weekend the trading index has not advanced, so the fill uses the most recent weekday close. This is documented in a tooltip on the sweep line ("filled at the last closing price").
- No spread, no commission.

### 4.7 Fee sale (proportional)

- `value_k = Math.round(shares_k * priceCents_k)`; `total = sum(value_k)`.
- `sellCents_k = Math.round(feeCents * value_k / total)`; fix the rounding remainder on the largest holding so `sum(sellCents_k) === feeCents`.
- `shares_k -= sellCents_k / priceCents_k`, clamped at 0.

### 4.8 Portfolio value, contributions, growth since start

- `portfolioValueCents = sum_k Math.round(shares_k * priceCents_k(tradingDayIndex))`.
- `contributedCents = sum of Sweep amounts`.
- `feesPaidCents = sum of Fee amounts`.
- **Growth since start** `= portfolioValueCents - contributedCents` (fees are included in this number because it is what the user actually has). Percentage `= growth / contributedCents * 100`, shown to one decimal, only when `contributedCents > 0`. Display is always signed: "+$0.37 (1.2%) since you started". Before the first sweep, growth is exactly zero, so display "+$0.00 since you started" with no percentage, using the same signed format as every other value.
- Never show daily change anywhere.
- "Kept" figures (jar-side): `totalKeptCents = sum of RoundUp + Catch amounts` (lifetime); "this week" = same sum over events with `dayIndex > currentDayIndex - 7`.

### 4.9 "Dropped about X% in bad years"

Two inputs, the displayed number is the larger loss so the app never understates risk:

1. **Series drawdown.** Mix index `I[t] = sum_k w_k/100 * P_k[t] / P_k[0]` over the full 400-day series. For every window of 252 trading days: `r = I[s + 252] / I[s] - 1`. `seriesLoss = max(0, -min(r)) * 100`.
2. **Reference bad year** per ticker (long-run worst 12-month loss, whole percents): VTI 37, VXUS 44, BND 13, VNQ 40, VTIP 3. `referenceLoss = sum_k w_k/100 * ref_k`.

`badYearPct = Math.round(max(seriesLoss, referenceLoss))`. Copy: "This mix has dropped about {badYearPct}% in bad years." Tooltip explains both inputs in one sentence. (Deviation from the accepted assumption, flagged in 10.2: with only 400 days of history the series alone can understate risk in a calm period.)

### 4.10 Expected-range chart

- Per-ticker reference return and volatility (annual, decimal): VTI (0.07, 0.16), VXUS (0.065, 0.17), BND (0.035, 0.05), VNQ (0.06, 0.20), VTIP (0.025, 0.03).
- Correlation matrix (order VTI, VXUS, BND, VNQ, VTIP):
  - VTI: 1, 0.85, 0.10, 0.70, 0.05
  - VXUS: 0.85, 1, 0.10, 0.60, 0.05
  - BND: 0.10, 0.10, 1, 0.20, 0.60
  - VNQ: 0.70, 0.60, 0.20, 1, 0.10
  - VTIP: 0.05, 0.05, 0.60, 0.10, 1
- `mu = sum_k w_k mu_k`; `sigma = sqrt(sum_i sum_j w_i w_j sigma_i sigma_j rho_ij)` with `w` as decimals.
- Illustrative contribution `C = 100` dollars per month (constant `EXPECTED_RANGE_MONTHLY = 100`, labeled on the chart "if you kept $100 a month").
- For horizon `t` in years (1 to 10, plus t = 0 at $0): annual rates `hi = mu + sigma / sqrt(t)`, `mid = mu`, `lo = mu - sigma / sqrt(t)`. Future value of monthly contributions at annual rate `r`: `m = (1 + r)^(1/12) - 1`, `n = 12 t`, `FV = m === 0 ? C n : C ((1 + m)^n - 1) / m`.
- Chart: three lines (rough stretch, expected, good stretch) with the band between lo and hi shaded. Y axis whole dollars. Copy under it: "In 10 years, somewhere around ${lo10} to ${hi10}. Nobody knows exactly, and that is normal."

### 4.11 Summer curves (7% assumption)

- Inputs: `summerEarnedDollars` (default 3000 if blank or 0), `age` (18 to 24, default 19).
- `K = 0.10 * summerEarnedDollars` per year.
- Curve A ("start now"): `balance = 0; for age a from 19 to 64: balance = (balance + K) * 1.07`. Plot the balance at each age from 19 to 65.
- Curve B ("start at 30"): same loop from 30 to 64; flat zero before 30.
- Headline: "Starting now instead of at 30: about ${A65 - B65} more at 65, for ${11 K} more put in." Whole dollars.
- The curve always starts at age 19 regardless of the user's entered age, because it is a story about the summer-job years, not a personal projection. Tooltip on "7%": "We assume 7% a year, which is roughly the long-run average of a stock-heavy mix. Real years are all over the place."
- "How much is left?" is stored (`summerLeftCents`) and used only for copy on this screen ("Keeping 10% of what's left is ${0.1 L}. That is one textbook."). It does not move money.

### 4.12 Tree growth rule (time-based)

Tree stage depends only on simulated days since the first sweep, never on dollars:

| Stage | Name | Days since first sweep |
|---|---|---|
| 0 | seed | no sweep yet |
| 1 | sprout | 0 to 6 |
| 2 | seedling | 7 to 20 |
| 3 | sapling | 21 to 44 |
| 4 | young tree | 45 to 89 |
| 5 | tree | 90 to 179 |
| 6 | full canopy | 180+ |

Rendered as an inline SVG with one drawing per stage. Stage transitions animate (scale in) once.

### 4.13 Summer window rule

- Summer is when the simulated date's month is June, July, or August (June 1 to August 31 inclusive), evaluated on the simulated date, unless `demo.summerOverride` is `"on"` or `"off"`.
- "Kept this summer" = sum of RoundUp and Catch amounts whose simulated date falls between June 1 of the current simulated year and the current simulated date.
- "What this becomes by 30" = `keptThisSummer * 1.07 ^ max(1, 30 - age)`, whole dollars, tooltip citing the 7% assumption.
- "First summer completed" milestone: fires on the tick whose new simulated date is September 1, provided at least one RoundUp or Catch event is dated within that summer.

### 4.14 Simulated clock

- State: `startDate` (YYYY-MM-DD, set at onboarding completion to the real local date unless overridden by `?start=`), `dayIndex` (integer, 0 at start), `tradingDayIndex` (integer, 0 at start).
- Simulated date = `startDate + dayIndex` computed in UTC (`Date.UTC(y, m, d + dayIndex)`), formatted with UTC getters. Never use local-time date math for simulated dates.
- On each tick, if the new simulated date is Monday to Friday, `tradingDayIndex = min(tradingDayIndex + 1, seriesLength - 1)`. Holidays are ignored. Day 0 uses index 0 regardless of weekday.
- If `tradingDayIndex` reaches `seriesLength - 1`, prices hold flat and the demo tray shows "Price history ended, prices are frozen." Not expected in normal use (400 trading days is about 18 months).

### 4.15 Auto-advance-on-open rule

- State: `lastOpenedRealDate` (YYYY-MM-DD local).
- On app load, if onboarding is complete and `?freeze=1` is absent: `elapsed = daysBetween(lastOpenedRealDate, todayLocal)`; if `elapsed > 0`, run `min(elapsed, 30)` ticks, then set `lastOpenedRealDate = todayLocal`. If elapsed is negative (clock moved back), do nothing except update the date.
- Paychecks landed during auto-advance queue up and prompt one at a time.
- Home shows a one-line toast after auto-advance: "{n} days went by. Your jar kept working."

### 4.16 Daily tick, order of operations

`tick(state, deps): state` is a pure function in `src/domain/tick.ts`. Order, exactly:

1. Advance day: `dayIndex += 1`; recompute simulated date; advance `tradingDayIndex` if weekday (4.14).
2. Generate transactions: `deps.transactions.purchasesForDay(dayIndex, ctx)`; append `Purchase` events.
3. Apply round-ups (4.2) unless paused; append `RoundUp` events; add to jar.
4. Check sweep (4.3); if swept, append `Sweep` event, update holdings.
5. Land paycheck if due (4.4): push onto `pendingPaychecks`.
6. Apply fee if day-of-month is 1 and portfolio value > 0 (4.5).
7. Mark prices: compute `portfolioValueCents` at the current `tradingDayIndex`; append `{ dayIndex, date, valueCents, contributedCents, feesPaidCents }` to `history`.
8. Evaluate lesson unlock triggers (7.2).
9. Evaluate milestone triggers (7.4).

`tickN(state, n)` applies `tick` n times. Required property: `tickN(s, 7)` equals seven successive `tick` calls (deep equal). "Skip a week" is `tickN(state, 7)`.

Triggers (steps 8 and 9) also run after `acceptCatch`, because a catch and its sweep can happen outside the tick.

---

## 5. Architecture

### 5.1 Stack (pinned)

- Node 20+, npm.
- Vite 5.x, React 18.3.x, TypeScript 5.5+ (strict), react-router-dom 6.26+.
- Tailwind CSS 3.4.x (class-based dark mode), PostCSS, autoprefixer. No component library.
- Zustand 4.5.x with `persist` middleware and a custom IndexedDB storage using idb-keyval 6.2.x.
- Framer Motion 11.x for animations; canvas-confetti 1.9.x for confetti.
- Recharts 2.12.x for the expected-range and portfolio charts.
- Vitest 2.x with jsdom and fake-indexeddb 6.x for store tests. Playwright 1.47+ for e2e.
- No date library. No runtime network calls. No analytics.

Rationale: no backend keeps v1 honest (all money is simulated anyway), IndexedDB survives refresh and browser close, and the three interfaces let a backend slot in later.

### 5.2 Directory layout

```
/
  package.json, vite.config.ts, tsconfig.json, tailwind.config.ts, postcss.config.js
  playwright.config.ts, vitest.config.ts
  index.html
  README.md                      (run, test, refresh prices, demo params)
  scripts/
    gen-synthetic-prices.ts      (writes src/data/prices/*.json, source "synthetic")
    fetch-real-prices.ts         (writes same files from Stooq CSV, source "real"; needs network)
    lint-copy.ts                 (fails on em/en dash in src/content and src/**/*.tsx string literals)
  src/
    main.tsx, App.tsx, routes.tsx, index.css
    config.ts                    (FEE_CENTS, thresholds, defaults, tickers, reference tables)
    content/
      strings.ts                 (every UI string, keyed)
      lessons.ts                 (eight lessons, typed)
      quiz.ts                    (five questions, scoring)
      tooltips.ts                (term -> definition)
    data/
      prices/VTI.json ... VTIP.json
      merchants.ts               (simulator merchant table)
    domain/                      (pure TS, no React, no store)
      money.ts, dates.ts, prng.ts
      types.ts                   (Cents, Ticker, LedgerEvent, Holdings, AppState ...)
      interfaces.ts              (TransactionSource, PriceSource, Brokerage)
      simulator.ts               (SimulatedTransactionSource)
      prices.ts                  (SeededPriceSource)
      brokerage.ts               (SimulatedBrokerage)
      roundup.ts, jar.ts, catch.ts, fee.ts
      risk.ts                    (badYearPct, expectedRange, quiz scoring, presets, guardrails, allocation math)
      summer.ts                  (summer curves, summer window, by-30)
      tree.ts
      triggers.ts                (lesson and milestone triggers)
      tick.ts                    (tick, tickN, acceptCatch, declineCatch)
      selectors.ts               (portfolio value, growth, this-week kept, etc.)
    state/
      store.ts                   (Zustand store, actions)
      persistence.ts             (idb storage adapter, export/import/reset, schemaVersion)
      urlParams.ts               (?demo, ?freeze, ?start, ?seed)
      bootstrap.ts               (auto-advance on open)
    components/
      Tooltip.tsx, Term.tsx, Money.tsx, CountUp.tsx, Card.tsx, Button.tsx
      Jar.tsx, Tree.tsx, ProgressRing.tsx, AllocationBar.tsx, ExpectedRangeChart.tsx
      PortfolioChart.tsx, CatchSheet.tsx, DemoTray.tsx, NavBar.tsx, Confetti.tsx
      MilestoneCard.tsx, LessonVisual.tsx
    screens/
      Welcome.tsx, SummerMoney.tsx, FearCheck.tsx, RiskQuiz.tsx, AllocationBuilder.tsx
      Home.tsx, Activity.tsx, Portfolio.tsx, Lessons.tsx, Lesson.tsx, Settings.tsx
  tests/
    unit/*.test.ts               (mirrors src/domain and src/state)
    e2e/dod.spec.ts, e2e/fixtures.ts
```

### 5.3 The three swappable interfaces

All in `src/domain/interfaces.ts`. They are plain objects of pure functions, not classes, so tests can pass fakes.

```ts
export type Ticker = 'VTI' | 'VXUS' | 'BND' | 'VNQ' | 'VTIP';
export type Cents = number; // integer

export interface Purchase {
  id: string;            // `${dayIndex}-${n}`
  dayIndex: number;
  merchant: string;
  category: 'coffee' | 'food' | 'groceries' | 'subscription' | 'transport' | 'campus' | 'fun';
  amountCents: Cents;
}

export interface Paycheck { id: string; dayIndex: number; amountCents: Cents; source: 'schedule' | 'demo'; }

export interface SimContext { seed: number; paycheckCents: Cents; }

export interface TransactionSource {
  purchasesForDay(dayIndex: number, ctx: SimContext): Purchase[];
  paycheckForDay(dayIndex: number, ctx: SimContext): Paycheck | null;
}

export interface TickerMeta { ticker: Ticker; label: string; assetClass: string; color: string; }

export interface PriceSource {
  tickers(): TickerMeta[];
  seriesLength(): number;                                  // 400
  closeCents(ticker: Ticker, tradingDayIndex: number): Cents;
  dateFor(tradingDayIndex: number): string;                // YYYY-MM-DD, metadata only
  provenance(): { source: 'real' | 'synthetic'; asOf: string; note: string };
}

export type Holdings = Record<Ticker, number>;             // shares as doubles
export type Allocation = Record<Ticker, number>;           // integer percents summing to 100

export interface Fill { ticker: Ticker; cents: Cents; shares: number; priceCents: Cents; }

export interface Brokerage {
  buy(amountCents: Cents, allocation: Allocation, holdings: Holdings, prices: PriceSource, tradingDayIndex: number): { holdings: Holdings; fills: Fill[] };
  sellForCash(cents: Cents, holdings: Holdings, prices: PriceSource, tradingDayIndex: number): { holdings: Holdings; fills: Fill[] };
  value(holdings: Holdings, prices: PriceSource, tradingDayIndex: number): Cents;
}
```

v1 implementations: `SimulatedTransactionSource` (5.6), `SeededPriceSource` (section 5, price data in section 5.7), `SimulatedBrokerage` (4.6, 4.7). A future backend replaces any one of them without touching `tick.ts`.

### 5.4 State model

Persisted `AppState` (Zustand store, one persisted slice, `schemaVersion: 1`):

```ts
interface AppState {
  schemaVersion: 1;
  profile: {
    name: string; email: string; seed: number; createdAt: string;
    onboardingComplete: boolean;
    summerEarnedCents: Cents | null; summerLeftCents: Cents | null; age: number;
    fear: FearOption | null;
    quizAnswers: number[];            // five values 1..3
    riskProfile: 'conservative' | 'balanced' | 'growth' | null;
    allocation: Allocation;
  };
  settings: {
    sweepThresholdCents: Cents;       // default 500
    catchPct: number;                 // default 5
    roundUpsPaused: boolean;
    theme: 'system' | 'light' | 'dark';
  };
  clock: {
    startDate: string; dayIndex: number; tradingDayIndex: number; lastOpenedRealDate: string;
  };
  jarCents: Cents;
  holdings: Holdings;
  events: LedgerEvent[];              // Purchase | RoundUp | Catch | Sweep | Fee | Paycheck, in order
  history: HistoryPoint[];            // one per tick after first sweep (and one at the sweep)
  pendingPaychecks: Paycheck[];
  lessons: Record<LessonId, { unlockedDay: number | null; readAt: string | null }>;
  milestones: {
    firstSweepDayIndex: number | null; confettiShown: boolean;
    first100Kept: number | null; firstSummer: number | null; pathFinished: number | null; // dayIndex when reached
  };
  flags: { allocationExplainerSeen: boolean; };
  demo: { summerOverride: 'on' | 'off' | null; };
}
```

`LedgerEvent` is a discriminated union on `kind` with `id`, `dayIndex`, `date`, and kind-specific fields (`RoundUp` carries `purchaseId`, `merchant`, `purchaseCents`, `cents`; `Catch` carries `paycheckCents`, `pct`, `cents`; `Sweep` carries `cents`, `fills`; `Fee` carries `cents`).

Non-persisted UI state (separate store or React state): demo tray open, active modal, toast, animation flags (for example `sweepAnimating`).

Persistence: `persist` middleware with a storage adapter over idb-keyval (`get/set/del` on key `spare-change-state`). `partialize` excludes UI state. `version: 1` with a `migrate` stub. Export writes the persisted object as JSON; import runs the full validator described below, then, only on success, replaces state and reloads. Reset clears the key and navigates to `/welcome`.

**Import validation (full shape and range check, not just key presence).** `schemaVersion` and top-level key presence are necessary but not sufficient: section 11 requires that a malformed file produce a clear error with state left untouched, so the validator must reject anything that would otherwise let bad data reach the store or the UI. Implement it as a pure function, `validateImportedState(input: unknown): { ok: true; state: AppState } | { ok: false; problems: string[] }`, in `src/state/persistence.ts` (or a new `src/state/validate.ts`). It must check, at minimum:

- `schemaVersion` is exactly `1`.
- Every field is present and of the correct type (no missing keys, no extra-permissive `typeof x === 'object'` checks that let `null` through where an object is expected).
- All money fields (`jarCents`, every `*Cents` field, every ledger event's `cents` and related amount fields) are non-negative integers, finite, and at most 1e13 cents.
- `dayIndex` and `tradingDayIndex` are non-negative integers. `tradingDayIndex` is at most the price series length minus 1 (399) and at most `clock.dayIndex`.
- Every number anywhere in the imported state, including inside `holdings`, is finite (reject `Infinity`, `-Infinity`, and `NaN`), so a structurally valid but unbounded value cannot reach a selector or a render.
- Every date string (`createdAt`, `lastOpenedRealDate`, `clock.startDate`, event `date` fields) matches `YYYY-MM-DD` and parses to a real calendar date.
- Enum fields are checked by membership in their known value set: `settings.theme` (`system`/`light`/`dark`), `profile.riskProfile` (`conservative`/`balanced`/`growth`/`null`), `profile.fear`, every event's `kind`, and every ticker symbol appearing in `holdings` or in event fills.
- `settings.catchPct` is an integer 1 to 20.
- `settings.sweepThresholdCents` is one of the values in the defined preset set.
- `profile.age` is an integer 18 to 24.
- `profile.name` is a string 1 to 40 characters.
- `profile.allocation` values are integers that sum to 100.
- `holdings` values are non-negative finite numbers, at most 1e9 shares per ticker (a value below that bound but still large enough to make portfolio value infinite or unreasonable is exactly the case this bound exists to catch).
- Every element of `events`, `pendingPaychecks`, and `history` is shape-checked field by field (not just "is an array").
- `events` and `history` are each in non-decreasing `dayIndex` order, and no element's `dayIndex` exceeds `clock.dayIndex` (this is what stops a reversed array from drawing the Portfolio chart backwards).
- Every `pendingPaychecks` element's `dayIndex` is at most `clock.dayIndex`.
- `milestones.firstSweepDayIndex`, if not null, matches the `dayIndex` of some `Sweep` event in `events`.
- `lessons` has exactly the eight known lesson ids as keys, each with the correct `{ unlockedDay, readAt }` shape.

On any failure, the import shows the existing import-error copy and leaves the current state completely untouched (no partial write). This validator must be unit-tested against at least the 13 malformed-file shapes listed in the tester's D1 finding (`tests/unit/tester-domain.test.ts` > "plan 5.4 / 11: import validation"), plus the garbage-`lastOpenedRealDate` case, before it is considered done.

Seed: `profile.seed = fnv1a32(`${name}|${email}|${createdAt}`)`, overridden by `?seed=<int>`.

### 5.5 Data flow

UI -> store action -> domain function (pure) -> new state -> persist. Example: DemoTray "Next day" -> `store.nextDay()` -> `tick(state, deps)` -> set state -> persist. Selectors in `domain/selectors.ts` derive display values (portfolio value, growth, this-week kept, kept-this-summer, tree stage, summer flag). `deps` (the three interface implementations) are constructed once in `state/deps.ts`.

### 5.6 Transaction simulator (SimulatedTransactionSource)

- PRNG: mulberry32 seeded per day with `hash(seed, dayIndex)` so any day is reproducible independently and batching does not change results.
- Purchases per day: weekday 2 to 4, weekend 1 to 3 (uniform integer). Plus fixed subscriptions by day-of-month: Spotify $11.99 on the 5th, streaming $15.49 on the 12th, phone plan $45.00 on the 20th (exact dollar on purpose, exercises 4.2).
- Merchant table (`src/data/merchants.ts`) with category and cent ranges (uniform): coffee 325 to 685, food 850 to 1620, groceries 1800 to 6400 (at most twice a week), transport 700 to 2400, campus 250 to 1200 (laundry, printing), fun 500 to 2200. Merchant names get light campus flavor ("Campus Coffee", "Late Night Ramen", "Textbook Exchange"). Amounts are never forced to be round.
- Tuning target: expected round-up per purchase about $0.50, so the $5 threshold is hit every 8 to 12 purchases (about 3 to 5 days). Unit test: over 60 simulated days from seed 42 with round-ups only, the sweep count is between 10 and 20.
- `paycheckForDay` returns a paycheck on due days (4.4) with `ctx.paycheckCents`.

### 5.7 Price data plan

**Preferred:** real closing prices, 400 most recent trading days, committed as JSON. **Fallback (used if the Coder has no network):** deterministic synthetic series. Both use the same file shape and the app never needs to know which it got beyond the `source` label.

File shape, one per ticker at `src/data/prices/{TICKER}.json`:

```json
{
  "ticker": "VTI", "label": "US stocks", "source": "synthetic",
  "generatedAt": "2026-09-06", "asOf": "2026-09-04",
  "note": "SYNTHETIC demo series. Not real market data. Regenerate with npm run prices:synthetic or replace with npm run prices:real.",
  "closes": [{ "d": "2025-02-03", "c": 290.00 }, ...]
}
```

- Exactly 400 entries per ticker, all tickers share the same date list (weekdays only, holidays ignored, starting 2025-02-03 for synthetic).
- `SeededPriceSource` loads all five, asserts equal lengths and identical dates, converts to cents, exposes `provenance()` from the first file. A mismatch throws at startup with a clear message.

**Synthetic generator** (`scripts/gen-synthetic-prices.ts`, run via `npm run prices:synthetic`), fully deterministic (mulberry32 + Box-Muller, fixed seed 20260906):

- Daily log return for ticker k on day t: `(mu_k - sigma_k^2 / 2) / 252 + sigma_k / sqrt(252) * z_k[t] + shock_k[t]`.
- `z_k = rho_k * zMarket + sqrt(1 - rho_k^2) * zOwn` with `rho`: VTI 0.95, VXUS 0.85, VNQ 0.70, BND 0.15, VTIP 0.10.
- `mu, sigma`: VTI (0.08, 0.15), VXUS (0.07, 0.16), BND (0.035, 0.05), VNQ (0.06, 0.19), VTIP (0.03, 0.03).
- Scripted correction so "first dip" and drawdown numbers are realistic: for days 150 to 185, `shock` of -0.0045/day for VTI, VXUS, VNQ, -0.0008 for BND, 0 for VTIP; for days 186 to 240, +0.0025/day for the three equities (recovery). Everywhere else `shock = 0`.
- Start prices: VTI 290.00, VXUS 68.00, BND 74.00, VNQ 92.00, VTIP 49.00. Round each close to 2 decimals; enforce a floor of 1.00.
- `source: "synthetic"`, and the note text above.

**Real-data refresh** (`scripts/fetch-real-prices.ts`, `npm run prices:real`): fetch `https://stooq.com/q/d/l/?s={ticker}.us&i=d` (CSV, no key), take the last 400 rows, intersect dates across tickers, write the same shape with `source: "real"`, `asOf` = last date, note "Real daily closes from Stooq, delayed, for demo only." Document in README. The Coder writes the script but only runs it if network is available; if the run fails, keep synthetic.

**UI label:** Portfolio detail footer and Settings fee section render `provenance()`: synthetic -> "Prices: synthetic demo data (not real market prices)"; real -> "Prices: real closing prices through {asOf}, delayed". The Tester must verify the label matches the JSON `source` field and that the note is honest.

---

## 6. Screens

Routes: `/welcome`, `/onboarding/summer`, `/onboarding/fear`, `/onboarding/quiz`, `/onboarding/allocation`, `/` (Home), `/activity`, `/portfolio`, `/lessons`, `/lessons/:id`, `/settings`. Any app route redirects to `/welcome` until `profile.onboardingComplete`; `/welcome` redirects to `/` once complete. Onboarding progress is persisted so a refresh mid-onboarding resumes at the same step.

Navigation: bottom tab bar (Home, Activity, Portfolio, Lessons, Settings) under 1024 px; left rail at 1024 px and above; content max width 720 px on desktop. Logo in the header; long-press (600 ms) opens the demo tray.

Global components: `Term` (wraps a financial term with a `Tooltip`, `aria-describedby`). `Tooltip` behavior, precisely: it opens on hover, focus, or tap, and a tap pins it open; it closes on Escape, a pointerdown outside both the bubble and its anchor, blur of the anchor, or a route change; on scroll it repositions to keep following the anchor and does not close, so a scroll event alone (including a scroll-anchoring reflow that changes no visible offset) is never a valid close trigger; it flips to render above the anchor when there is not enough room below, and clamps horizontally so it never overflows the viewport; only one tooltip is open at a time, and opening a new one closes any other that is open; the interaction that opens a tooltip must never be the same interaction that closes it (a synthetic or bubbling follow-on event from the opening tap, such as a click or scroll firing immediately after the pointerdown or focus that opened it, must not reach the close logic). `Money` (formats cents, optional `CountUp`), `Card`, `Button`. Every screen has a `data-testid` on its root (`screen-home` etc.) and the ids listed below.

### 6.1 Welcome and value prop

- Components: hero copy, three-line "how it works" (Round-ups, Catches, Grows), name and email inputs, Continue.
- Reads: nothing. Actions: `setProfile(name, email)`, navigate to summer.
- Copy: mission line as the headline. Two-sentence explanation: "Every purchase rounds up to the next dollar and the spare change goes in a jar. When a paycheck lands, keep a small slice before it disappears." Line under inputs: "No password. Everything stays on this device." Test ids: `welcome-name`, `welcome-email`, `welcome-continue`.

### 6.2 Summer money screen

- Components: two currency inputs ("How much did you make this summer?", "How much is left?"), age select (18 to 24, default 19), `SummerCurves` (Recharts line chart, two lines, x = age 19 to 65), headline difference, Continue.
- Reads: nothing. Actions: `setSummer(earnedCents | null, leftCents | null, age)`.
- Copy: no formulas shown. The "7%" tooltip (4.11). If earnings blank: "We will use $3,000 as an example." Left-over line from 4.11. Test ids: `summer-earned`, `summer-left`, `summer-age`, `summer-chart`, `summer-diff`, `summer-continue`.

### 6.3 Fear check

- Components: question "What's the one thing that's stopped you before?", four large option cards, Continue.
- Options and mapping (see 7.3): `rent` -> L6, `pointless` -> L7, `confused` -> L8, `losing` -> L4.
- Actions: `setFear(option)`. Copy: options in the user's voice, for example "I might need it for rent." No judgment copy. Test ids: `fear-option-{key}`, `fear-continue`.

### 6.4 Risk quiz

- Components: five questions one at a time with three option buttons, progress dots, Back.
- Actions: `setQuizAnswers(number[])`, compute profile (6.5), navigate to allocation.
- Copy: questions in 6.5. Result screen line: "You lean {Conservative | Balanced | Growth}. Here is a starting mix. You can change it." Test ids: `quiz-q{n}-opt{k}`, `quiz-result`.

### 6.5 Quiz content, scoring, profiles, presets

Each answer scores 1, 2, or 3 (first option 1, last option 3). Total 5 to 15. Conservative 5 to 8, Balanced 9 to 12, Growth 13 to 15.

1. "If your $50 became $40 for a few months, you would..." (1) "Want it back in cash right away" (2) "Feel it, but leave it" (3) "Not really look"
2. "When might you need this money?" (1) "Within a year" (2) "In a few years" (3) "Not for a long time"
3. "Which sounds better?" (1) "Slow and steady, fewer surprises" (2) "A mix" (3) "Bigger swings for bigger growth"
4. "How do you feel about the stock market?" (1) "Nervous" (2) "Curious" (3) "Comfortable"
5. "Your money right now is mostly..." (1) "Spent by the end of the month" (2) "Some saved, some spent" (3) "Sitting around, not doing anything"

Presets (percent, order VTI / VXUS / BND / VNQ / VTIP), bond-plus-cash-like floor in brackets:

- Conservative: 30 / 10 / 40 / 5 / 15 [floor 40]
- Balanced: 45 / 20 / 20 / 10 / 5 [floor 20]
- Growth: 55 / 25 / 10 / 10 / 0 [floor 10]

Guardrail check: `BND + VTIP < floor(profile)` triggers amber.

Note: the Growth preset's 0% VTIP is intentional (a cash-like slice is not required at the growth end of the risk spectrum). A Growth-profile user therefore never buys VTIP and correctly holds 0 VTIP shares; see criterion 12, which only requires holdings for tickers with nonzero weight.

### 6.6 Allocation builder

- Components: `AllocationBar` (stacked horizontal bar, five segments, one color each, draggable boundaries; each segment also has a row with label, `Term` tooltip, percent readout, and +/- buttons stepping 1%, holding accelerates), risk read (`risk-read`), `ExpectedRangeChart` (4.10), preset reset link ("Back to the {profile} mix"), Save. One-time inline explainer card on first open (dismiss sets `flags.allocationExplainerSeen`).
- Drag semantics: dragging the boundary between segments i and i+1 moves whole percent points between those two only; total stays 100; neither goes below 0. +/- on segment i takes from or gives to the next nonzero segment to the right (wrapping to the first if at the end) so the sum stays 100.
- Reads: `profile.riskProfile`, `profile.allocation`, price series (for 4.9). Actions: `setAllocation(alloc)`, confirm-below-floor flow, `markAllocationExplainerSeen`.
- Copy: risk read normal: "This mix has dropped about {X}% in bad years." Amber: same line plus "This is riskier than the mix you picked in the quiz. Are you sure?" and Save label becomes "Yes, use this mix" on the second tap. Explainer: "Drag the bar to change how your money is split. Stocks grow more and swing more. Bonds and cash-like are the steady part. You can change this any time." Labels: "US stocks", "World stocks", "Bonds", "Real estate", "Cash-like". Test ids: `allocation-bar`, `alloc-{ticker}-plus`, `alloc-{ticker}-minus`, `alloc-{ticker}-pct`, `risk-read`, `risk-read-amber`, `expected-range-chart`, `allocation-explainer`, `allocation-save`, `allocation-confirm`.
- Save on first completion sets `onboardingComplete = true`, `clock.startDate`, `lastOpenedRealDate`, and navigates to Home. Later opens (from Settings or Portfolio) just save.

### 6.7 Home

- Components: header with logo (long-press for demo tray), headline stat block, `Jar` (SVG, liquid height = `min(1, jarCents / threshold)`, label "$X.XX of $5.00"), `Tree` (4.12), stats row, `NextLessonCard`, `CatchSheet` when `pendingPaychecks` nonempty, toast area, `Confetti` on first sweep.
- Headline outside summer: "Invested" with `Money` count-up of portfolio value, sub-line "you've put in $A". Growth line: "+$0.37 (1.2%) since you started". In summer (4.13): "Kept this summer" with the summer total and under it "By 30 that is about ${byThirty}" plus the 7% tooltip.
- Stats row: "This week: $X kept" (round-ups plus catches, 4.8), "Jar: $X.XX", "Days in: {dayIndex}".
- Next lesson card: the fear-check lesson until read, then the oldest unlocked unread lesson; pulses when unread; taps to `/lessons/:id`. If none: "Nothing new yet. Keep going."
- Actions: open lesson, respond to catch, demo tray actions.
- Copy: every screen answers "what did my spare change do today?": a one-line "Today" strip under the jar, for example "Today: 3 round-ups, $1.35 kept" or "Today: nothing yet." Test ids: `stat-invested`, `stat-growth`, `stat-summer-kept`, `stat-by-thirty`, `stat-week-kept`, `jar`, `jar-fill` (element whose height attribute changes), `jar-amount`, `tree`, `tree-stage-{n}`, `today-strip`, `next-lesson-card`, `sweep-animation`, `confetti`, `auto-advance-toast`.

### 6.8 Activity feed

- Components: list grouped by simulated date (newest first), each RoundUp, Catch, Sweep, Fee as a line item. Purchases without a round-up do not appear.
- Line copy: round-up "Campus Coffee, $4.35. Kept $0.65." Catch "Paycheck landed, $500.00. Kept $25.00." Sweep "Jar swept $5.20 into your portfolio." with tooltip on "swept". Fee "Monthly fee, $1.00." Empty state: "Nothing yet. Tap Next day in the demo tray, or come back tomorrow."
- Reads: `events`. Actions: none. Test ids: `activity-item`, `activity-item-{kind}`.

### 6.9 Paycheck catch prompt (sheet)

- Components: bottom sheet on mobile, centered modal on desktop. Shows "A paycheck landed: $500.00", "Keep 5% of this before it's gone? That is $25.00.", primary "Yes, keep $25.00", secondary "Not this time", link "Change %" revealing a stepper 1 to 20 that updates the amount for this deposit only.
- Reads: head of `pendingPaychecks`, `settings.catchPct`. Actions: `acceptCatch(pct)`, `declineCatch()`.
- Copy: no guilt on decline; the sheet just closes. Test ids: `catch-sheet`, `catch-amount`, `catch-accept`, `catch-decline`, `catch-change-pct`, `catch-pct-stepper`.

### 6.10 Portfolio detail

- Components: value with count-up, growth line, `PortfolioChart` (Recharts area, x = simulated date, y = value, with a second faint line for contributions; starts at first sweep), holdings table (label, ticker, shares to 4 decimals, value, percent of portfolio), "Fees so far" line, "Edit mix" link to the allocation builder, provenance footer (5.7).
- Empty state before first sweep: "Your first sweep will start the chart. The jar is at $X.XX of $5.00."
- Reads: holdings, history, events, provenance. Test ids: `portfolio-value`, `portfolio-growth`, `portfolio-chart`, `holding-{ticker}`, `fees-so-far`, `price-provenance`.

### 6.11 Lessons library

- Components: `ProgressRing` (read count / 8, label "3 of 8"), list of eight lesson cards in the order of 7.1, each with state: locked (muted, shows the unlock hint), unlocked unread (pulse, "New"), read (check). Lesson page: title, two-to-three-sentence body, one `LessonVisual`, "Got it" marks read and returns.
- Reads: `lessons`. Actions: `markLessonRead(id)`. Locked lessons are viewable? No: locked lessons show only their title and unlock hint; they are skippable once unlocked but never gate anything. Test ids: `progress-ring`, `lesson-card-{id}`, `lesson-state-{locked|new|read}`, `lesson-got-it`.

### 6.12 Settings

- Components: profile (name, email, editable), round-ups toggle ("Pause round-ups"), threshold segmented control ($1, $3, $5, $10), catch percentage stepper (1 to 20), fee disclosure block ("Flat fee: $1/month. That is $12 a year. Fees so far: $X.XX."), theme control (System / Light / Dark), provenance line, Export JSON, Import JSON (file input), Reset demo (two-step confirm), app version.
- Actions: `updateSettings`, `exportState`, `importState(file)`, `resetDemo`, `setTheme`.
- Copy: every setting has one plain sentence under it. Test ids: `settings-pause-roundups`, `settings-threshold-{100|300|500|1000}`, `settings-catch-pct`, `settings-fee-year`, `settings-fees-so-far`, `settings-theme-{system|light|dark}`, `settings-export`, `settings-import`, `settings-reset`, `settings-reset-confirm`.

### 6.13 Demo controls tray

- Opened by long-press on the logo or when `?demo=1` is in the URL (then it is visible by default and can be collapsed). Renders as a small bottom drawer above the tab bar.
- Shows: simulated date, day index, trading day index, seed, price provenance.
- Buttons: "Next day" (`tick`), "Skip a week" (`tickN 7`), "Land a paycheck" (4.4), "Force summer" three-state (auto / on / off), "Reset demo".
- URL params (`state/urlParams.ts`): `demo=1`, `freeze=1` (no auto-advance), `start=YYYY-MM-DD` (simulated start date when onboarding completes), `seed=<int>`. Params are read once at boot and stored in memory; `start` and `seed` are applied at onboarding completion.
- Test ids: `demo-tray`, `demo-next-day`, `demo-skip-week`, `demo-land-paycheck`, `demo-force-summer`, `demo-reset`, `demo-date`, `demo-day-index`.

### 6.14 Milestone cards

- Three cards: "First $100 kept", "First summer done", "Confidence path complete". Each is a 1080 x 1080 canvas render (brand colors, big number, mission line, date), shown in a modal when the milestone fires and again from Lessons (path) or Home (others) via a "Your milestones" link. "Save image" downloads a PNG via an anchor with `download`. No share integration.
- Test ids: `milestone-modal`, `milestone-{key}`, `milestone-save`.

---

## 7. Lessons content

All lesson text lives in `src/content/lessons.ts`. Voice: friend a year ahead, encouraging, honest, a little funny. No em dashes, no jargon without a `Term`.

### 7.1 The eight lessons

| Id | Title | Unlock trigger | Visual |
|---|---|---|---|
| L1 | Where the 65 cents went | first RoundUp event | a coin splitting off a receipt into the jar |
| L2 | Keeping 5% before it's gone | first accepted Catch | a paycheck bar with a small slice highlighted |
| L3 | Your jar just became shares | first Sweep | jar tipping into five colored blocks sized by allocation |
| L4 | Why a dip isn't a loss | first dip (7.2) or fear "losing" | a wavy line with "you're here" below a peak and a higher line later |
| L5 | One month in | dayIndex >= 30 | a 30-day strip of small jar icons |
| L6 | What happens if I need the money for rent | fear "rent" | a jar with an open lid and a hand |
| L7 | Why $20 a week beats $500 later | fear "pointless" | two bars: $20 a week for 5 years vs $500 once |
| L8 | You can't really mess this up | fear "confused" | five labeled blocks and one arrow |

Bodies:

- **L1.** Your coffee was $4.35, so 65 cents went into the jar. That is not a rounding error, it is the whole trick. Little amounts you never notice add up to money you definitely will.
- **L2.** Money that lands in your account tends to leave by Friday. Taking a small slice the moment it arrives means you never feel it go. Five percent of a summer paycheck is a couple of nights out, and it is now yours for years.
- **L3.** Your jar hit the line, so it emptied into your portfolio and bought tiny pieces of five funds. Each fund holds hundreds or thousands of companies or bonds, so your $5 is spread wider than you think. You now own a sliver of the whole economy.
- **L4.** Prices go up and down every single day, and today they went down. A dip only becomes a loss if you sell during it. If you keep adding while things are cheaper, you end up buying more for the same money.
- **L5.** Thirty days in. You did not have to remember anything, and the jar kept working anyway. Look at the total kept, then imagine it running through every semester and every summer job.
- **L6.** This is your money and you can take it out. Selling takes a few days to turn into cash, so keep a little in checking for rent and let this grow behind it. Nothing here is locked, it is just out of sight.
- **L7.** Twenty dollars a week is about $1,000 a year. Started now and left alone, the early money has decades to grow, and time is the part you cannot buy later. Waiting for a big amount usually means waiting forever.
- **L8.** You picked a mix of five funds, and that is the entire strategy. There is no timing, no picking winners, and no move you have to make. The main way people lose here is by stopping.

Trigger semantics: `lessons[id].unlockedDay` is set to the current `dayIndex` the first time its trigger holds; never reset. Unread unlocked lessons pulse.

### 7.2 Trigger definitions

- first RoundUp: `events.some(e => e.kind === 'RoundUp')`.
- first Catch: `events.some(e => e.kind === 'Catch')`.
- first Sweep: `milestones.firstSweepDayIndex !== null`.
- first dip: at tick step 8, `firstSweepDayIndex !== null` and `(portfolioValueCents + feesPaidCents) < contributedCents` (fees excluded so a fee alone is not a "dip").
- first month: `dayIndex >= 30`.
- fear lessons: the chosen option's lesson unlocks at onboarding completion (`unlockedDay = 0`). The other fear lessons (of L6, L7, L8) unlock on day 10 and day 20 in id order for any still locked, so every user eventually sees all eight.

### 7.3 Fear check options and mapping

| Key | Option copy | Lesson |
|---|---|---|
| rent | "I might need it for rent." | L6 |
| pointless | "Twenty bucks a week feels pointless." | L7 |
| confused | "I don't really get how investing works." | L8 |
| losing | "I'm scared of losing it." | L4 (unlocks immediately, not waiting for a dip) |

### 7.4 Milestone triggers

- `first100Kept`: `totalKeptCents >= 10000` (lifetime round-ups plus catches).
- `firstSummer`: per 4.13.
- `pathFinished`: all eight lessons have `readAt`.

Each fires once, stores the `dayIndex`, and opens the milestone modal.

---

## 8. Build order

Each step ends with a verification the Coder runs before moving on. Domain logic and unit tests come before any UI.

1. **Scaffold.** Vite React TS app, Tailwind 3.4 with `darkMode: 'class'`, dependencies from 5.1, folder layout from 5.2, empty `strings.ts`, `config.ts` with constants, `scripts/lint-copy.ts` wired as `npm run lint:copy` and as `prebuild`, Vitest and Playwright configs, README skeleton. Verify: `npm run dev` serves a placeholder; `npm test` runs one trivial test; `lint:copy` exits nonzero on a fixture file containing an em dash and zero otherwise.
2. **Primitives.** `domain/money.ts` (formatters, clamp), `domain/dates.ts` (UTC sim-date math, weekday, day-of-month, local today, daysBetween), `domain/prng.ts` (mulberry32, fnv1a32, hash(seed, day), Box-Muller). Tests: formatting incl. negatives, date math across DST and month ends, PRNG determinism.
3. **Price data.** `scripts/gen-synthetic-prices.ts`, run it to produce five JSON files, `domain/prices.ts` (`SeededPriceSource`). Write `scripts/fetch-real-prices.ts`; attempt `npm run prices:real` once, keep synthetic if it fails. Tests: 400 entries each, shared dates, all closes > 0, generator is deterministic (two runs produce identical output), equities have a peak-to-trough drop of at least 10% between days 140 and 200, `provenance().source` matches the file.
4. **Transaction simulator.** `domain/simulator.ts`, `data/merchants.ts`. Tests: determinism, per-day independence (day 9 output identical whether or not days 0 to 8 were generated), subscriptions on fixed days, paycheck due days (3, 17, 31; not 0, 16), 60-day sweep count between 10 and 20 at seed 42 and at seed 7.
5. **Round-up, jar, brokerage, fee.** `roundup.ts`, `jar.ts`, `catch.ts`, `brokerage.ts`, `fee.ts`. Tests: 4.2 examples incl. exact dollar; sweep whole balance; catch rounding; buy allocates exact cents with remainder to largest weight; value on purchase day equals cents spent; fee sells exactly 100 cents proportionally and never below zero; fee capped at portfolio value.
6. **Risk, summer, tree.** `risk.ts` (quiz scoring, presets, floors, allocation adjust math, badYearPct, expectedRange), `summer.ts`, `tree.ts`. Tests: scoring boundaries (8 vs 9, 12 vs 13); presets sum to 100 and meet floors; drag and +/- math keeps sum 100; badYearPct is the max of both inputs and at least the reference for a 100% VTI mix (37); expected range monotone in t and lo <= mid <= hi; summer curve values from criterion 3; tree stages at boundary days.
7. **Tick and triggers.** `tick.ts`, `triggers.ts`, `selectors.ts`. Tests: order of operations (fee applied before the history point; sweep happens before the paycheck lands); `tickN(7)` equals seven ticks; weekend does not advance trading index; fee only on day-of-month 1 with holdings; first dip excludes fees; lessons unlock once; `acceptCatch` sweeps when threshold reached; day-10 and day-20 fear lessons.
8. **Store and persistence.** `state/store.ts`, `persistence.ts`, `urlParams.ts`, `bootstrap.ts`. Tests with fake-indexeddb: round-trip persist and rehydrate; export then import yields equal state; reset clears; auto-advance with mocked today (2 days -> 2 ticks; 45 days -> 30 ticks; freeze param -> 0).
9. **App shell.** Router, guards, `NavBar` (tabs under 1024 px, rail above), theme handling (`system` listens to `prefers-color-scheme`), `Tooltip`/`Term`, `Money`, `CountUp`, `Card`, `Button`, `DemoTray` (wired to store). Verify manually at 375 and 1280: navigation works, tray opens via `?demo=1` and long-press, "Next day" changes the day readout.
10. **Onboarding screens.** Welcome, SummerMoney with curves, FearCheck, RiskQuiz, AllocationBuilder with bar, risk read, expected-range chart, guardrail, explainer. Verify: criteria 1 to 7 by hand on both viewports.
11. **Home and catch.** Home stats, Jar, Tree, today strip, next-lesson card, CatchSheet, summer headline, auto-advance toast. Verify: criteria 8 to 11, 19.
12. **Remaining screens.** Activity, Portfolio (chart, holdings, fees, provenance), Lessons and Lesson page with visuals, Settings (all controls, export/import/reset). Verify: criteria 12 to 17, 20, 21.
13. **Motion and milestones.** Jar fill tween, sweep animation, confetti (first sweep only), count-ups, lesson pulse, tree stage transition, reduced-motion handling, milestone cards with PNG save. Verify: criterion 22 by hand on both viewports.
14. **E2E and polish.** `tests/e2e/dod.spec.ts` for both viewports (section 9.2), fix anything it finds, finish README (run, test, demo params, price refresh, honest note about synthetic prices). Verify: criterion 24 and the whole list.

---

## 9. Testing plan

### 9.1 Unit tests (Vitest)

Files under `tests/unit/`, one per domain module plus `copy.test.ts` and `store.test.ts`. Required targets (the Tester should add more):

- money: formatting, signed formatting, clamp, percent-of-cents rounding.
- dates: UTC sim dates over month ends and Feb 29, weekday detection, day-of-month 1 detection, `daysBetween` with local dates across a DST change.
- prng: same seed same sequence; different days differ.
- prices: shape checks from step 3; provenance honesty (the `note` mentions "SYNTHETIC" when source is synthetic).
- simulator: determinism, per-day independence, volume tuning, paycheck schedule, exact-dollar subscription present.
- roundup and jar: 4.2 examples, paused round-ups, whole-jar sweep, threshold presets.
- brokerage and fee: exact cents allocation, remainder placement, same-day value equality, fee proportionality, cap, no negatives.
- risk: scoring boundaries, presets, floors, adjust math, badYearPct max rule, expected range shape.
- summer: curve totals for $3,000 (criterion 3), blank defaults, by-30 math, summer window with override.
- tree: stage boundaries.
- tick: order of operations, batching equivalence, weekend trading index, fee timing, dip definition, triggers fire once, catch acceptance path, queue behavior with two pending paychecks.
- store: persistence round-trip, export/import, reset, auto-advance rules, URL params.
- copy: every string in `strings.ts`, `lessons.ts`, `quiz.ts`, `tooltips.ts` contains neither U+2014 nor U+2013; every term in 12.2 has a tooltip definition; no string contains "daily change" or "per day" growth phrasing.

### 9.2 Playwright e2e

`playwright.config.ts` with two projects: `mobile` (viewport 375 x 812, `isMobile: true`, `hasTouch: true`) and `desktop` (viewport 1280 x 800). Base URL is the Vite dev server (`webServer` config). Each test starts at `/?demo=1&freeze=1&start=2026-06-15&seed=42` with cleared storage.

`dod.spec.ts` scenario, in order (both projects):

1. Welcome: fill name "Sam", continue. Assert summer screen.
2. Summer: enter 3000, 500, age 19. Assert `summer-diff` text contains a dollar figure between $50,000 and $60,000. Continue.
3. Fear: pick `pointless`. Continue.
4. Quiz: pick the middle option five times. Assert `quiz-result` contains "Balanced".
5. Allocation: assert `risk-read` text matches /dropped about \d+% in bad years/. Click `alloc-BND-minus` 15 times (BND 20 -> 5, VTIP 5, total 10 < floor 20). Assert `risk-read-amber` visible. Click `alloc-BND-plus` 15 times, assert amber gone. Assert `allocation-explainer` visible, dismiss it. Save.
6. Home: assert `jar-amount` is "$0.00", `tree-stage-0` visible, `next-lesson-card` contains "Why $20 a week beats $500 later".
7. Click `demo-next-day` until `jar-amount` changes (max 3 clicks). Record `jar-fill` height; assert it grew. Assert Activity has at least one `activity-item-RoundUp`.
8. Click `demo-next-day` until a `sweep-animation` appears (max 12 clicks). Assert `confetti` appeared, `jar-amount` "$0.00" afterward, `stat-invested` not "$0.00". Open Lessons, assert L1 and L3 are in `new` state and L7 is `new`.
9. Click `demo-land-paycheck`. Assert `catch-sheet` visible and `catch-amount` "$25.00" (paycheck $500 at 5%). Click `catch-change-pct`, step to 10, assert "$50.00". Click `catch-accept`. Assert an `activity-item-Catch` with $50.00 and Settings still shows catch 5%. Assert L2 is `new`.
10. Click `demo-skip-week` five times. Assert at least one `catch-sheet` appeared during this (day 17 or 31); decline it. Open Portfolio: assert `portfolio-chart` renders 30 or more points (count `.recharts-dot` or read a `data-points` attribute the chart sets), five `holding-*` rows, `fees-so-far` visible, `price-provenance` text matches the JSON `source` (test reads `src/data/prices/VTI.json`).
11. Assert `stat-growth` text contains "since you started" and starts with "+" or "-".
12. Summer: assert `stat-summer-kept` visible (start date June 15 plus about 38 days is still July). Toggle `demo-force-summer` to off, assert `stat-invested` visible instead.
13. Settings: switch theme to Dark, assert `html` has class `dark`. Reload, assert still dark and `demo-day-index` unchanged.
14. Export: capture the download, assert JSON with `schemaVersion: 1`. Reset demo, assert Welcome. Import the file, assert Home with the same `demo-day-index`.
15. Assert no `console.error` was logged during the run and `document.documentElement.scrollWidth <= viewport width` on every screen visited (mobile project).

Reduced-motion variant: a second, shorter spec with `reducedMotion: 'reduce'` runs steps 7 to 9 and asserts the same end states.

---

## 10. Risks and open items

### 10.1 Fragile areas

- **Drag on touch devices.** Draggable segment boundaries are the hardest UI piece. The +/- buttons are the guaranteed path; drag is progressive enhancement. The e2e uses buttons only.
- **Simulator tuning.** If average round-ups drift, sweep cadence and criterion 9 (max 12 taps) break. The 60-day sweep-count test guards this.
- **Confetti and canvas in headless browsers.** canvas-confetti renders on a canvas; the e2e asserts the `confetti` wrapper element, not pixels.
- **Recharts responsiveness.** `ResponsiveContainer` needs a sized parent; give chart wrappers an explicit height.
- **IndexedDB in private browsing.** Wrap storage in try/catch; fall back to in-memory with a one-line notice in Settings.
- **Synthetic prices looking "too clean."** The scripted correction and daily noise mitigate this; the label keeps it honest.
- **Auto-advance surprises.** A user returning after 40 real days gets 30 ticks and possibly 2 to 3 queued paychecks. Capped and explained by the toast.

### 10.2 Assumptions made on the user's behalf (flag for the MANAGER)

1. **Exact-dollar purchases round up to $0** and produce no feed line (4.2).
2. **Sweep moves the whole jar**, not just the threshold amount (4.3).
3. **Bad-years figure is the larger of the series drawdown and a long-run reference table** (4.9). This deviates slightly from "computed from seeded price history" alone, because 400 days can understate risk.
4. **Age field added** to the summer screen (18 to 24, default 19) so "by 30" is correct (4.11, 4.13). The summer comparison curve itself always starts at 19.
5. **"How much is left?" is copy-only** in v1 and does not create a first catch (4.11). A "keep 5% of what's left now" first catch is listed as a nice-to-have.
6. **Paychecks start on day 3** (then every 14 days) so a new user meets the catch prompt quickly (4.4). Default paycheck $500 when the summer screen is blank.
7. **Fear-check lessons all unlock eventually** (chosen one immediately, the others on days 10 and 20) so the path can be completed (7.2).
8. **Growth since start includes fees** (4.8); fees are also broken out separately.
9. **Weekend sweeps fill at the last close** (4.6).
10. **Tailwind 3.4, not 4**, to keep configuration conventional.
11. **Both em and en dashes are banned** by the copy lint, for simplicity (12.1).
12. **Bond floor counts BND plus VTIP** ("the steady part") rather than BND alone (6.5).

### 10.3 Questions for the user

None that block the build. Item 3 and item 5 in 10.2 are the ones most worth a glance.

---

## 11. Test guidance for the TESTER

Beyond section 9, the failure modes that matter most:

- Money drift: after 200 ticks with random catches, `sum(fills cents) === sum(Sweep cents)` and no holding is negative; portfolio value on any sweep day is within 1 cent of the previous value plus the sweep.
- Determinism: same seed, same start date, same actions produce exported state that is byte-identical on two fresh runs after masking the two wall-clock fields, `profile.createdAt` and `clock.lastOpenedRealDate` (both capture real time at the moment of the run, not simulated time, so they legitimately differ between runs). Every other field must match exactly.
- Batching: 30 x "Next day" versus 4 x "Skip a week" plus 2 x "Next day" gives identical state.
- Two paychecks queued (skip two weeks without answering): both prompts appear in order; declining the first does not drop the second.
- Threshold change to $1 while the jar holds $3: no sweep until the next tick, then it sweeps $3 plus that day's round-ups.
- Pause round-ups, advance a week: purchases exist but jar unchanged, no RoundUp events.
- Fee when portfolio is worth less than $1: value goes to $0, never negative, holdings all 0, no crash on the next tick.
- Dip lesson does not fire from a fee alone.
- Import of a malformed file: clear error, state untouched.
- Reduced-motion: every flow completes with no visual dead ends (no element waiting on an animation callback).
- Copy sweep: grep the built bundle for U+2014; check that "daily" never appears next to a growth number; check no shame words ("should have", "wasted", "failed", "bad with money").
- Mobile: no horizontal scroll; tap targets at least 44 px on every user-facing interactive control, including but not limited to links such as "Your milestones" and "Edit mix", the catch sheet's "Change %" control, the Settings name and email inputs, and the pause switch. Two exemptions: inline `Term` spans inside running text (they should still get at least a 24 px tall hit area via padding where feasible, but this is not a pass or fail criterion), and the demo controls tray (6.13), which is a developer tool and is exempt from the 44 px rule entirely. Sheet does not hide the accept button behind the tab bar; tooltips open on tap and close on outside tap.
- Desktop: onboarding is completable by keyboard alone (this is not a claim about the number of tab stops; Welcome's `Term`-wrapped copy, per 12.1 rule 8, adds tab stops before the name input and that is expected, not a defect); tooltips open on focus.

---

## 12. Copy rules (enforced)

### 12.1 Hard rules

1. **No em dashes (U+2014) or en dashes (U+2013) in any UI string.** `npm run lint:copy` scans `src/content/**` and all string literals and JSX text in `src/**/*.tsx`, and runs as `prebuild`. Use commas, periods, or parentheses.
2. **All UI strings live in `src/content/strings.ts`** (keyed, typed). Screens import keys; no inline copy in components except `data-testid` values and aria labels that mirror a string key.
3. **Growth is always "since you started."** No daily, today, or 24-hour change figure anywhere, in any screen or tooltip. Growth is signed.
4. **No promised returns.** Projections say "about", "around", or "somewhere between", and every 7% figure has the assumption tooltip. Never "will be worth" or "guaranteed."
5. **No shame language.** Never "should have", "wasted", "bad with money", "failed", "missed out", "behind." Declining a catch produces no comment.
6. **Celebrate small numbers.** Cents are shown as wins ("Kept $0.65"), never minimized ("only", "just").
7. **Campus references stay light** (ramen, textbooks, laundry, spring break) and never mock the user.
8. **Every financial term renders through `Term`** with a tooltip on every appearance, including inside lesson bodies and the Welcome screen's pre-onboarding copy ("round-up," "jar," and the paycheck "slice" in `welcome.explanation` and the three how-it-works cards are not exempt). This holds even though `Term` spans are focusable (`tabIndex=0`) and sit before the name input: the extra tab stops that adds are acceptable and do not conflict with section 11's keyboard requirement, which asks only that onboarding be completable by keyboard alone, not that it have a fixed tab count.

### 12.2 Tooltip terms (each needs an entry in `tooltips.ts`)

round-up, catch, jar, sweep (swept), threshold, portfolio, allocation (mix), ETF (fund), index fund, stocks, bonds, real estate fund, cash-like, US stocks, World stocks, fractional share (sliver), closing price (last close), holdings, growth since you started, expected range, bad years, dip, fee, 7% assumption, risk profile (Conservative, Balanced, Growth), diversified, contributions (what you put in).

Definitions are one to two plain sentences, no em dashes, no jargon inside a definition.

---

## 13. Cycle 4 scope (risk closure)

### 13.1 Goals

Cycle 1 through 3 closed all 24 acceptance criteria. The user has decided v1 is functionally done and wants one short cycle targeting the manager's ranked remaining risks (05-status.md section 4), not a general re-audit and not new features. The goal of this cycle is narrow: close whichever of the ranked risks can actually be closed inside this environment (headless Chromium via Playwright, including its CDP touch and mobile emulation; no real iOS or Android device; no network access), and leave everything else honestly flagged as still open.

Out of scope for this cycle, explicitly:

- Real price data. The brief's cycle 1 close-out decision was to ship on synthetic, labeled prices and not retry `npm run prices:real` this cycle. Risk 1 in 05-status.md stays open.
- Real device testing. iOS Safari's callout menu, real touch drag momentum, and real-device Safari or Firefox tooltip behavior cannot be produced by headless Chromium. Anywhere this plan says "closable," it means closable in emulation, not on a physical phone. Risk 2 and the WebKit and Firefox half of risk 4 stay open after this cycle; they are not being claimed as fixed.
- Deployment. Plan section 10 (static build to Vercel or any static host) is a separate, already-decided item and is not part of this cycle's work.
- Any new screen, new domain rule, or nice-to-have feature (savings goals, multipliers, recurring deposits, partner cashback, real bank linking, real brokerage execution). None of that is a risk-closure item.
- Private browsing in a real browser, the 400-trading-day series exhaustion, and dark mode visual re-audit. These are the lower-priority items 05-status.md lists after the ranked five; they are cheap to note but not cheap to verify without a real browser profile or 18 simulated months of runtime, so they are left open rather than half-verified.

### 13.2 Work items

**C4-1. Persistence write race.** Every store change currently writes to IndexedDB asynchronously (03-build-notes.md section 4); only the theme has a synchronous mirror, so a reload within a few milliseconds of an action can silently lose that action (05-status.md risk 3). Add a synchronous mirror of the full persisted slice (schemaVersion, profile, settings, clock, jarCents, holdings, events, history, pendingPaychecks, lessons, milestones, demo, per plan 5.4) to `localStorage` under its own key, written on every store change in the same tick as the change, in addition to the existing async idb-keyval write. Add a `pagehide` listener and a `visibilitychange` listener (fired when `document.visibilityState === 'hidden'`) that re-run the synchronous mirror write as a guard against any change that landed after the last mirror write but before an in-flight IndexedDB write settled. On boot, if the localStorage mirror's revision (a monotonically increasing counter, one persisted field) is newer than the value read back from IndexedDB, hydrate from the mirror and re-persist it to IndexedDB before rendering.
- Acceptance: unit test asserts the flush function is invoked when `pagehide` and `visibilitychange` (hidden) fire, and that it is not invoked on `visibilitychange` (visible). e2e test performs one state-changing action (for example one `demo-next-day` click that changes `jar-amount`), reloads with zero added delay, and asserts the state survived, repeated ten times in a loop with zero failures.

**C4-2. Allocation bar touch robustness.** 03-build-notes.md flags touch drag on the allocation boundary handles as "the least verified interaction in the app," tested only via +/- clicks (plan 9.2 step 5), never via a real drag. Add `setPointerCapture` on `pointerdown` for each boundary handle so the drag continues to track the pointer even if it leaves the bar's bounds, ending the drag cleanly (no dangling listeners, no partial state) on `pointerup` or `pointercancel` alike. Each handle gets a hit area of at least 44 x 44 px (padding or an invisible extended hitbox around the visible boundary line, per the plan 11 tap-target rule already stated for other controls). Extend keyboard support already present on the +/- buttons (1% step) to the boundary handles themselves when focused: arrow keys step 1 point between the two adjacent segments, shift-arrow steps 5 points, floor and 100-point-total rules from plan 6.6 unchanged.
- Acceptance: a Playwright test using CDP touch (`page.touchscreen` or an emulated touch pointer) drags a boundary handle in both directions and asserts the two adjacent segment percentages change correctly and still sum to 100; a second test starts a drag, moves the pointer outside the bar's bounding box, and fires `pointercancel`, asserting the drag ends without an exception, without a partial or invalid allocation, and without a dangling pointer-move listener (a subsequent unrelated pointer move must not affect the allocation).

**C4-3. Long-press robustness (demo tray).** The demo tray opens on long-press of the logo (plan 6.13); 03-build-notes.md notes long-press is unverified against iOS Safari's callout menu, which can hijack the gesture. Add `touch-action: manipulation` and `-webkit-touch-callout: none` to the logo element, keep `contextmenu` prevented (already implemented), and ensure `pointercancel` ends the long-press timer immediately, the same class of bug called out for `useHoldRepeat` in 04-test-report.md's unverified concerns (a press that ends via cancel rather than a clean release must not leave a stuck "pressed" flag that swallows the next tap).
- Acceptance: an e2e test on the `mobile` Playwright project (`hasTouch: true`) performs a long touch-and-hold on the logo, asserts `demo-tray` opens, releases, and asserts a normal short tap on the logo immediately after does not also open or re-toggle the tray; a second test starts the long-press and fires a touch-cancel partway through, asserting the tray does not open and a subsequent full long-press still works correctly.

**C4-4. Tooltip accessibility.** 04-test-report.md notes `aria-describedby` on `Term` "only appears while open," which is not how screen readers typically discover a description, and flags screen-reader behavior as entirely unaudited. Make `Term` a `<button>` (or a non-button element with `role="button"` and `tabIndex={0}`) as it already is per plan 6 Global components; set `aria-describedby` to point at the bubble's id whenever the tooltip is open (as now), and additionally give the bubble `role="tooltip"` at all times it is rendered. Escape closes the open tooltip and returns focus to its anchor `Term` (matching the existing close-on-Escape behavior in plan 6 Global components, which does not currently specify focus return).
- Acceptance (amended cycle 5): an automated accessibility scan (`@axe-core/playwright` is acceptable) run against every screen listed in plan 9.2's `dod.spec.ts` walk, at both the `mobile` and `desktop` viewports, in both themes (light and dark), with at least one tooltip open per screen where a term is present, reports zero serious or critical violations. A separate assertion confirms focus lands back on the anchor `Term` after Escape closes its tooltip, including when the tooltip was opened by hover (not only by click or Enter).

**C4-8. Dark palette contrast (new, cycle 5).** The cycle 4 axe scan was light-mode only; the tester's cycle 4 dark-mode scan (04-test-report.md D14) found serious `color-contrast` violations on 16 of 17 screen states, worst 1.65:1, including white text on the primary call-to-action button at 2.08:1. This is a pre-existing dark-palette defect, not solely a cycle 4 regression, but C4-4's own acceptance criterion ("zero serious or critical violations on every screen at both viewports") did not name a theme, and dark mode is a stated v1 requirement (01-brief.md section 7, "Dark mode from day one"; plan criterion 21). Re-derive the dark palette's text-on-surface token pairs (not a spot-fix of the labels D15 flagged) so every surface meets WCAG AA: 4.5:1 for body text, 3:1 for large text and UI components (buttons, badges, allocation segment labels). This subsumes D15 (the four dark-mode pairs the cycle 4 `Button.tsx` white-to-`text-ink` swap measurably lowered): fixing C4-8 correctly must not reintroduce or worsen those four pairs.
- Acceptance: the amended C4-4 axe scan (light and dark, both viewports) reports zero serious or critical violations. In addition, a unit or script-based check computes WCAG 2.x contrast ratios for every documented text-on-surface token pair in the dark theme (button labels including `danger` and `amber` variants, allocation segment labels on every ticker's fill color, the "New" badge, and body text on every card and screen background) and asserts each meets its 4.5:1 or 3:1 bar, so the guarantee is not scan-coverage-dependent.

**C4-9. Tooltip Escape-then-refocus regression (new, cycle 5), fixes D13.** `Tooltip.tsx:134` calls `anchor.current?.focus()` after `close()`, which fires the anchor's `onFocus` handler and reopens the tooltip when it was opened by hover (or anything that left focus elsewhere), because `pinned.current` is already false by then. Escape must close the tooltip and keep it closed regardless of how it was opened.
- Acceptance: an e2e test opens a tooltip by hover (with focus parked elsewhere first), presses Escape, and asserts zero open tooltip bubbles remain, in addition to the existing click-opened and Enter-opened cases in `axe.spec.ts:175`.

**C4-10. Demo tray obscures milestone Save control at 375 px (new, cycle 5), fixes D16.** With `?demo=1` open (tray visible by default per plan 6.13), the tray or `demo-skip-week` sits on top of `milestone-save` on all three milestone cards at 375 px width, per the tester's `elementFromPoint` check. This is the third instance of this class of overlap (cycle 3 had terms behind the tray). Plan 11's tap-target exemption for the demo tray does not license the tray to cover user-facing controls.
- Acceptance: an e2e test opens the milestone modal at 375 px with the demo tray open (not `demo-collapse`d) for all three planted cards, and asserts `milestone-save` is the top element at its center point and is clickable, without the test dropping `?demo=1` or collapsing the tray to work around it.

**C4-11. Stale lazy-load comment and dragAllocation NaN guard (new, cycle 5), fixes D17 and D18.** `vite.config.ts` lines 4-11 describe a route-level `React.lazy` mechanism that was withdrawn during cycle 4 (see the ruling in 13.3 below); update the comment to describe what actually ships (component-level splitting and/or `manualChunks`, per whichever C4-7 landed). Separately, `src/domain/risk.ts:102`'s `dragAllocation` produces `NaN`-poisoned output on a `NaN` input (`dragAllocation(a, 0, NaN)` and `dragAllocation(a, NaN, 10)`), currently filed as `it.fails` in `tests/unit/tester-cycle4.test.ts` and not reachable from the UI today (D18). Add a `Number.isFinite` guard on `dragAllocation`'s numeric arguments so it is defensive against any future caller, not just today's two (pointer move and arrow key), which are the only reason this is Minor rather than Major.
- Acceptance: `vite.config.ts`'s comment accurately describes the shipped splitting mechanism (`grep` for "React.lazy" in the comment finds nothing unless it is actually shipped). The two `it.fails` cases in `tests/unit/tester-cycle4.test.ts` are un-marked and pass under the new guard, and a matching case for any other non-finite input (`Infinity`, string-typed args reaching the function) also passes.

**C4-5. Milestone PNG save.** 04-test-report.md lists the "Save image" download as untested beyond inspecting the anchor and data URL; plan 6.14 specifies a 1080 x 1080 canvas render. Verify the actual download in a real headed Chromium (Playwright's `browserType.launch({ headless: false })` for this one spec, or Playwright's download event, which works headless too, whichever the coder finds reliable in this environment) rather than only inspecting the anchor's `href`.
- Acceptance: an e2e test triggers `milestone-save` for each of the three milestone cards, captures the resulting Playwright `download` event, saves it to a temp path, decodes the PNG, and asserts its pixel dimensions are exactly 1080 x 1080 for all three.

**C4-6. Error boundary.** 03-build-notes.md cycle 3 notes the coder "never got the boundary to trigger after the guards, so its UI is only manually reasoned about, not observed." `src/components/ErrorBoundary.tsx` and its reset control (`app-error-reset` per the D10 fix) exist but have no test forcing an actual render error.
- Acceptance: add a unit or e2e test that deliberately forces a child component to throw during render (for example a demo-only, test-gated component that throws when a specific prop or query param is set, or a component-level test harness that mounts a throwing child under `ErrorBoundary`), and assert the boundary's fallback UI renders with a visible reset control, and that clicking it recovers the app to a working state (matching the existing "Reset demo" behavior already used elsewhere).

**C4-7. Bundle size.** 04-test-report.md's final cycle 3 numbers show 879.69 kB minified JS with "the pre-existing chunk-size warning" still present; 03-build-notes.md section 4 calls this "fine for a demo, not tuned." Add route-level code splitting (`React.lazy` plus `Suspense` on the router's screen components, per plan 5.2's directory layout) and/or Vite `build.rollupOptions.output.manualChunks` to separate the heaviest dependencies named in plan 5.1 (Recharts, Framer Motion, canvas-confetti) from the initial chunk.
- Acceptance: `npm run build` output shows no chunk-size warning and the initial JS chunk (the one loaded before any route-level lazy chunk) is under 500 kB minified; the full `dod.spec.ts` suite (plan 9.2) still passes on both projects after the change, since code splitting is exactly the kind of change that can silently break a route transition.

No further items from 05-status.md section 4 are added: risk 1 (real prices) and the device half of risks 2 and 4 are explicitly out of scope per 13.1; the lower-priority list (private browsing, 400-day exhaustion, dark mode re-audit) is left open as noted above because none of it is cheap to close without a real browser profile or a long simulated run.

### 13.3 Constraints

- No changes to the domain rules in plan section 4 (money math, round-up, jar and sweep, catch, fee, growth, bad-years, expected range, summer, tree growth, clock, daily tick).
- No new screens and no new routes.
- No copy changes beyond aria labels and attributes needed for C4-4; `src/content/strings.ts` user-visible strings are unchanged, and `npm run lint:copy` must still report zero problems.
- Every existing test must stay green: `npm test` (Vitest, 239 tests per the cycle 3 numbers in 04-test-report.md) and `npm run e2e` (both `mobile` and `desktop` projects, 112 tests) must both pass with 0 failures before and after this cycle's changes, aside from the new tests this cycle adds.
- `tests/e2e/tooltip.spec.ts`, the full-sweep test that checks every term on every screen at four scroll offsets on both viewports (116 taps per viewport per 03-build-notes.md cycle 3), must pass unchanged in its assertions after any change to `Tooltip.tsx` made for C4-4. If C4-4 requires a change to the bubble's `role` or the anchor's attributes, re-run this spec first and treat any new failure as a defect in the change, not in the spec.
- **Ruling on route-level `React.lazy` (cycle 5).** The tester withdrew route-level `React.lazy` during cycle 4 because two pre-existing tests (`tester-cycle2.spec.ts:178`, `tester-attacks.spec.ts:680`) relied on synchronous rendering immediately after navigation, and this constraint (every existing test stays green) forbade editing them. The architect agrees the withdrawal was correct and agrees with the tester's own follow-up finding: it buys nothing measurable, since a cold production load already excludes the charts chunk (verified against a real `vite preview` build, D-section "Ruling on the coder's route-level React.lazy call" in 04-test-report.md's cycle 4 section) and component-level splitting plus `manualChunks` already hits the C4-7 bundle-size target. Route-level lazy should not be revisited in a later cycle; the two-line test change the tester offered to make it possible is not worth spending on a change with no measurable benefit.

### 13.4 Testing

The TESTER should run, in this order:

1. The full existing suite unchanged: `npm test` and `npm run e2e` (both projects). Any red test here is a regression from this cycle's changes, not a pre-existing issue, since cycle 3 closed at 239/239 unit and 112/112 e2e (04-test-report.md).
2. `tests/e2e/tooltip.spec.ts` specifically, before and after C4-4, since it is the most likely casualty of an accessibility-motivated change to `Tooltip.tsx`.
3. The new tests each work item's acceptance criterion requires (C4-1 through C4-7 above), written into new files (for example `tests/e2e/tester-cycle4.spec.ts`, `tests/unit/tester-cycle4.test.ts`) rather than edited into the coder's or the tester's existing cycle 1 to 3 files.
4. Per-item neighborhoods to re-check:
   - C4-1: the export and reset flows (plan 5.4) still work after adding the localStorage mirror; a corrupted or absent mirror on boot must not crash the app (feed into the same `ErrorBoundary` path as C4-6, not a new failure mode).
   - C4-2: the existing +/- button flow (plan 9.2 step 5, the amber risk-read and confirm-Save path) is unaffected; keyboard-only allocation editing (plan section 11) still works after adding arrow-key support to the handles.
   - C4-3: a normal single tap and a normal `?demo=1` boot (tray visible by default, per plan 6.13) are unaffected by the new CSS and pointercancel handling.
   - C4-4: `dod.spec.ts` step 5's `allocation-explainer` dismissal and step 9's `catch-sheet` tooltip usage, if any terms appear there, still pass; keyboard-only onboarding (plan section 11, Welcome's wrapped terms) is unaffected by the added `role="tooltip"` and focus-return behavior.
   - C4-5: the export/download testing pattern already used for the JSON export in `dod.spec.ts` step 14, to confirm the same download-capture technique behaves consistently for both file types.
   - C4-6: confirm the forced-error harness is test-only and gated (a query param, a demo-only code path, or similar) so it cannot be triggered by a normal user action or appear in production copy.
   - C4-7: every screen in the `dod.spec.ts` walk (Home, Activity, Portfolio, Lessons, lesson page, locked lesson, allocation edit, milestone modal, catch sheet, Settings, Welcome) loads with zero console or page errors after splitting, matching the zero-error bar 04-test-report.md already verified for cycle 3.

---

## Revision log

- 2026-09-06 v1: initial plan from the brief and accepted Q&A.

### Cycle 2, 2026-09-06: tester plan-level items P1 to P5

- Changed: Criterion 12 (section 2) reworded from "holdings for each of the five tickers with nonzero shares" to "holdings for every ticker with a nonzero weight in the user's allocation," with an explicit call-out that a 0%-weighted ticker (VTIP under Growth) is correctly excluded. Section 6.5 got a new note stating the Growth preset's 0% VTIP is an intentional design choice, not a bug, and cross-referencing criterion 12. Section 11's determinism bullet reworded from "byte-identical exported state on two fresh runs" to "byte-identical after masking `profile.createdAt` and `clock.lastOpenedRealDate`," naming both fields as wall-clock values that legitimately differ between runs. Section 5.4 replaced the one-line "validates schemaVersion and required keys" import rule with a full shape-and-range validation spec (types, non-negative integer cents, non-negative integer day indices, date format and parseability, enum membership for theme/riskProfile/fear/event kind/ticker, catchPct 1-20, sweepThresholdCents in the preset set, age 18-24, name 1-40 chars, allocation integers summing to 100, non-negative finite holdings, full shape checks on events/pendingPaychecks/history elements, and an exact eight-id check on lessons), specifying it as a pure function `validateImportedState` in `src/state/persistence.ts` or a new `src/state/validate.ts`, returning validated state or a problem list, leaving state untouched on any failure, and requiring unit tests against the tester's 13 malformed shapes plus the garbage-date case. Section 11's tap-target bullet amended to exempt inline `Term` spans (24 px hit-area goal, not a pass/fail criterion) and the demo tray (fully exempt as a developer tool), while explicitly naming the user-facing controls ("Your milestones," "Edit mix," "Change %," Settings inputs, pause switch) that must still meet 44 px. Section 4.8 resolved the "always signed" versus "$0.00 with no sign" contradiction in favor of always-signed, so the pre-first-sweep state reads "+$0.00 since you started."
- Because: tester report `.dev-team/04-test-report.md`, "Plan itself is wrong or contradictory (for the ARCHITECT)," items P1 (criterion 12 vs. 6.5 Growth preset), P2 (impossible byte-identical export claim), P3 (5.4 import rule too weak for section 11's malformed-file guarantee, root cause of Critical defect D1), P4 (44 px tap targets vs. inline Term text and the demo tray, see D7), and P5 (4.8's contradictory signed/unsigned display, which the coder resolved unilaterally toward signed).
- Impact on downstream: the CODER must build the `validateImportedState` full validator (P3) and wire it into the import path so a failed validation leaves state untouched and shows the existing import-error copy; the CODER should also confirm the 44 px exemptions (P4) require no further changes beyond documentation, since D7's findings are all on already-in-scope user-facing controls. No code change is needed for P1, P2, or P5, since the coder's existing behavior (signed zero display, Growth's 0% VTIP, non-byte-identical timestamps) already matches the corrected plan text. The TESTER must re-verify: criterion 12 against the reworded text (expect PASS on both Balanced and Growth); criterion 20 and section 11's tooltip/tap-target items are unaffected by this revision and should be re-checked only after D3 and D7 fixes ship; the determinism guidance in section 11 (re-run with masking applied, expect PASS); and, once the CODER's P3 validator lands, the full D1 regression suite in `tests/unit/tester-domain.test.ts` and `tests/e2e/tester-attacks.spec.ts` ("hostile import files").

### Cycle 3, 2026-09-06: tester items P6, P7 and tooltip spec

- Changed: Section 5.4's validator list gained ordering and cross-field rules on top of the cycle 2 shape-and-range spec: every number in the imported state must be finite (no `Infinity`, `-Infinity`, `NaN`, including inside `holdings`); money fields are bounded at 1e13 cents and `holdings` at 1e9 shares per ticker; `tradingDayIndex` is at most the price series length minus 1 (399) and at most `clock.dayIndex`; `events` and `history` must each be in non-decreasing `dayIndex` order with no element's `dayIndex` exceeding `clock.dayIndex`; every `pendingPaychecks` element's `dayIndex` is at most `clock.dayIndex`; and `milestones.firstSweepDayIndex`, if set, must match the `dayIndex` of some `Sweep` event. Section 12.1 rule 8 now states explicitly that Welcome's pre-onboarding copy is not exempt from `Term` wrapping, and that the extra tab stops this creates are acceptable. Section 11's keyboard bullet reworded from "keyboard-only completion of onboarding" to "onboarding is completable by keyboard alone," with a note that this is not a claim about tab-stop count. Section 6 "Global components" replaced the one-line Tooltip description with a precise behavior spec: opens on hover, focus, or tap; a tap pins it; closes on Escape, outside pointerdown, anchor blur, or route change; on scroll it repositions to track the anchor and never closes on scroll alone; it flips above the anchor when there is no room below and clamps horizontally; only one tooltip is open at a time; and the interaction that opens a tooltip must never be the one that closes it.
- Because: tester report `.dev-team/04-test-report.md`, cycle 2 plan-level items P6 (5.4's validator accepts a reversed `history` array, drawing the Portfolio chart backwards, and accepts `holdings.VTI = 1e308`, a finite value that makes portfolio value `Infinity`, because 5.4 had no ordering or cross-field consistency rule) and P7 (the coder reverted `Term` wrapping on Welcome's copy citing section 11's keyboard rule against the tester's single-Tab test assumption, not against plan 11 itself, which only requires keyboard-only completion; the tester asked the architect to rule since 12.1 rule 8 says every appearance and the tester had already loosened the test). Also addressed, unprompted: D11, a Major regression where the D6 tooltip fix's blanket "close on any scroll event" listener closes the bubble on the same scroll-anchoring reflow that its own open interaction triggers, affecting 11 of 29 terms on mobile and 7 of 29 on desktop; the root cause is that the plan's tooltip spec was a one-line parenthetical with no behavior detail for the coder to build against.
- Impact on downstream: the CODER must extend `validateImportedState` with the new finiteness, bound, ordering, and cross-field checks (P6) and add unit tests for reversed `history`/`events`, an out-of-range `dayIndex` or `tradingDayIndex`, an oversized `holdings` value, an unmatched `firstSweepDayIndex`, and a `pendingPaychecks` entry past `clock.dayIndex`; must restore `Term` wrapping on `welcome.explanation` and the three how-it-works cards (P7) now that the tester has loosened the single-Tab assumption in its test; and must rebuild `Tooltip`'s scroll handling to reposition-on-scroll rather than close-on-scroll, add the above/below flip and horizontal clamp, and single-open-at-a-time enforcement, per the new Global components spec, replacing the current `window.addEventListener('scroll', close, true)` approach that caused D11. The TESTER must re-run `tests/unit/tester-cycle2.test.ts` AUDIT cases against the extended validator (expect all newly listed cases rejected), re-run `tests/e2e/tester-cycle2.spec.ts` "D11" and "D11 breadth" on both viewports (expect all terms to hold a readable bubble regardless of on-screen position), and re-check criterion 20 end to end once both land, including the Welcome screen's now-wrapped terms.

### Cycle 4, 2026-09-06: scope for risk closure

- Changed: added section 13, "Cycle 4 scope (risk closure)," a scoped list of seven work items (C4-1 through C4-7) targeting the ranked risks in 05-status.md section 4 that are closable inside this environment: a synchronous localStorage mirror plus `pagehide` and `visibilitychange` flush guards for the persistence write race (risk 3); pointer capture, a 44 x 44 px hit area, and keyboard step support on the allocation bar's boundary handles, verified by a CDP touch drag and a pointercancel test (part of risk 2); `touch-action: manipulation`, `-webkit-touch-callout: none`, and pointercancel handling on the demo tray's long-press trigger (the other part of risk 2); `role="tooltip"` and Escape-returns-focus on the tooltip, verified by an axe-core scan on every screen at both viewports (risk 5); a real download-and-decode check that the milestone PNG is 1080 x 1080 (a lower-priority item promoted because it is cheap and headless-friendly); a forced-render-error test for the previously never-triggered `ErrorBoundary`; and route-level code splitting to bring the initial JS chunk under 500 kB. The section states explicitly, per the user's cycle 1 close-out decision, that real price fetching, real iOS device testing, deployment, and any new feature or screen are out of scope, and that WebKit and Firefox engine testing (the rest of risk 4) and real-browser private browsing stay open because this environment cannot produce them.
- Because: user decision recorded in `.dev-team/01-brief.md`, "Cycle 1 close-out decisions," item 1 ("run one short cycle 4 targeting the manager's top remaining risks... not a general re-audit"), naming the persistence write race, touch and real-device checks for the allocation bar and long-press, screen-reader behavior of tooltips, and the milestone PNG save as the targets, cross-referenced against the manager's ranked risk list and "cheapest way to close" suggestions in `.dev-team/05-status.md` section 4, the tester's "What I could not test" and "Unverified concerns" lists in `.dev-team/04-test-report.md`, and the coder's "Self-declared weak points" in `.dev-team/03-build-notes.md` section 4.
- Impact on downstream: the CODER implements C4-1 through C4-7 against the acceptance criteria in section 13.2, touching `src/state/persistence.ts` (or wherever the persist middleware's storage adapter lives per plan 5.4), the `AllocationBar` component (plan 6.6), the logo's long-press handler (plan 6.13), `Tooltip.tsx` and `Term` (plan 6 Global components), the milestone save flow (plan 6.14), `src/components/ErrorBoundary.tsx`, and the Vite build config and router's lazy-loading boundaries (plan 5.1, 5.2), without touching plan section 4's domain rules, adding any screen, or changing user-visible copy. The TESTER runs the full existing suite first to confirm no regression, then `tests/e2e/tooltip.spec.ts` specifically around C4-4, then the new C4-1 through C4-7 tests in new files per section 13.4, and reports back against the acceptance criteria stated for each item, not against a general re-audit of the app.

### Cycle 5, 2026-09-07: dark mode accessibility and cycle 4 fallout

- Changed: C4-4's acceptance criterion (13.2) amended to require the axe scan pass in both themes, light and dark, not light only, and to require the Escape-refocus assertion cover a hover-opened tooltip, not only click- or Enter-opened ones. Added C4-8 (13.2), a new work item requiring the dark palette's text-on-surface token pairs to be re-derived to meet WCAG AA (4.5:1 body text, 3:1 large text and UI components), which subsumes D15 (the four dark-mode pairs cycle 4's label swap measurably lowered). Added C4-9 (13.2), fixing D13, the Escape-then-refocus tooltip reopen bug, with an acceptance criterion covering the hover-opened case specifically. Added C4-10 (13.2), fixing D16, the demo tray covering the milestone Save control at 375 px, with an acceptance criterion that forbids working around it by dropping `?demo=1` or collapsing the tray in the test. Added C4-11 (13.2), fixing D17 (the stale `vite.config.ts` comment describing a withdrawn mechanism) and D18 (the two `dragAllocation` NaN paths, currently `it.fails`). Added a ruling to 13.3 affirming the tester's withdrawal of route-level `React.lazy` was correct and stating it should not be revisited, since a cold production load already excludes the charts chunk and component-level splitting already meets C4-7.
- Because: tester report `.dev-team/04-test-report.md`, cycle 4 verification section, defects D13 through D18 and the explicit request for "an architect or manager ruling on which plan text governs" for D14, since C4-4's acceptance text was unqualified by theme while 13.1 separately lists "dark mode visual re-audit" as deliberately left open this cycle. The architect rules dark mode is in scope for C4-4 specifically (not a general re-audit) because dark mode is a stated v1 requirement (01-brief.md section 7, "Dark mode from day one") and criterion 21 (section 2) requires Settings' Dark option to work, and because the user has already shown a revealed preference for real contrast compliance over palette nostalgia in an earlier cycle's color decision. 13.1's "dark mode visual re-audit" stays out of scope as a separate, broader item; C4-8 is narrowly the contrast fix C4-4's own unqualified criterion already implied.
- Impact on downstream: the CODER implements C4-8 through C4-11 in addition to any C4-4 rework needed to pass the amended acceptance criterion, most likely touching the dark theme's CSS custom properties (wherever `--c-ink`, `--c-leaf`, and the button/badge/segment color tokens are defined), `Button.tsx`, the allocation bar's segment label styling, `Tooltip.tsx:134`'s Escape handler, the milestone modal or demo tray z-index/layout (plan 6.13, 6.14), `vite.config.ts`'s comment, and `src/domain/risk.ts:102`. None of this touches plan section 4's domain rules, adds a screen, or changes user-visible copy beyond what C4-4 already permitted. The TESTER re-runs the amended C4-4 dark-mode and light-mode axe scans on both viewports, the hover-then-Escape tooltip case, the 375 px milestone Save reachability case with the tray open, the `vite.config.ts` comment grep, and the two previously-`it.fails` `dragAllocation` cases, and confirms D15 is closed as a byproduct of C4-8 rather than needing a separate fix.
