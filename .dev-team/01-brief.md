# 01 — Brief: Spare Change Investing App

Captured 2026-09-06. Raw brief from the user, verbatim. Architect Q&A appended below.

## 1. One-line pitch

A friendly web app that catches a slice of money the moment it arrives (round-ups on purchases plus a small cut of each paycheck), invests it in a simple portfolio, and teaches the user what is happening as it does. Simpler, cheaper, and warmer than existing round-up apps.

## 2. Who it's for

College students and recent grads, 18 to 24, who earn money in bursts (summer jobs, campus jobs, side gigs) and watch it disappear by October. They are not bad with money. They have no system and no reason to believe small amounts matter. Not for active traders.

## 3. Brand and mission

- Mission line: "Keep a little. It goes a long way."
- Core insight: the problem is not spending, it is that saving feels pointless at $20 a week. Every screen should fight that feeling with concrete future numbers.
- Emotional job: turn "I'll start when I have real money" into "I already started." The user should feel "oh, that's it?" within two minutes.
- Personality: like a friend who is a year ahead of you. Encouraging, honest, a little funny. Never preachy, no lecture energy, no hype, no promised returns. $0.37 is a win.
- Voice rules: no jargon without a tooltip, no shame language, celebrate small numbers, growth is always shown "since you started" rather than daily change.
- Positioning versus competitors:
  - Simpler: one flow, no tiers, no upsells. Explainable in two sentences.
  - Cheaper: a flat, transparent fee shown up front (placeholder $1/month), with a live "what this costs you per year" line in settings.
  - Friendlier: learning is built into every screen, not hidden in a help center.

## 4. Signature moments

1. Summer money screen (onboarding). Ask "How much did you make this summer?" and "How much is left?" Then show two curves side by side: keeping and investing 10% of every summer paycheck from age 19, versus starting at 30. Plain numbers, one visual, no math shown. This scene carries the whole mission.
2. Paycheck catch. When a deposit lands (simulated in v1), prompt once: "Keep 5% of this before it's gone?" One tap, and it sweeps into the jar alongside round-ups. Round-ups alone are too small for people who earn in bursts. This is the feature that addresses the summer-job problem.
3. The jar sweep. An animated jar fills as round-ups and catches accrue, then visibly empties into the portfolio with a satisfying animation when the threshold is hit. Confetti on the first sweep.

## 5. Core loop (v1, must-have)

- Simulated spending and income source: generate a realistic stream of transactions (coffee, groceries, subscriptions) and periodic paycheck deposits. Build it behind an interface so a real bank aggregator can be swapped in later.
- Round-up engine: each purchase rounds to the next $1, spare change accrues, sweeps at a $5 threshold (default, adjustable).
- Paycheck catch: on each simulated deposit, offer a one-tap keep of a chosen percentage (default 5%). Accepted catches go into the same jar.
- Portfolio with simulated money: 4 to 6 real ETF tickers with mocked or delayed price history, so growth looks and feels real. No real trades.
- Allocation control: a risk quiz suggests a starting mix, then the user adjusts allocations with sliders. Show a plain-English risk read as they drag ("This mix has dropped about 12% in bad years").
- Learning layer, framed as a "confidence path" with a visible progress ring. Short lessons (2 to 3 sentences plus one visual) unlock on events: first round-up, first catch, first sweep, first dip, first month. Lesson titles retire student fears, for example "Why $20 a week beats $500 later," "What happens if I need the money for rent," "Why a dip isn't a loss."
- First-run fear check: "What's the one thing that's stopped you before?" The answer picks the first lesson shown.
- Home screen: total invested, this week's round-ups and catches, portfolio growth since start, next lesson card. During summer months, headline stat becomes "kept this summer" with a "what this becomes by 30" line under it.

## 6. Nice-to-have (v2, scope out of v1)

Round-up multipliers (2x, 3x, 10x), recurring deposits, savings goals with progress bars, "found money" partner cashback, real bank linking, real brokerage execution.

## 7. UX/UI direction

- Feel: calm, bright, and playful. A jar filling up, not a stock ticker. Not finance navy.
- Palette: soft green or sky blue base with one warm accent (coral or amber). Rounded cards, generous whitespace, large friendly numbers. Dark mode from day one.
- Home: the jar plus a small tree that grows with time invested, independent of dollar amount, so tiny balances still show visible progress.
- Allocation screen: stacked horizontal bar with draggable segments, one color per asset class, and a live "expected range" chart underneath that updates as you drag.
- Motion: count-up animations on balances, jar fill and sweep animation, confetti on first sweep, gentle pulse on new lessons.
- Milestone cards: shareable image cards for first $100 kept, first summer completed, first lesson path finished. This audience spreads things by screenshot.
- Copy: plain language, tooltips on every financial term, light campus references (ramen, textbooks, spring break) without being cringey. Every screen answers "what did my spare change do today?"
- Responsive, mobile-first layout. Most sessions will be on phones.
- No em dashes anywhere in UI copy. Use commas, periods, or parentheses.

## 8. Screens for v1

1. Welcome and value prop
2. Summer money screen
3. Fear check
4. Risk quiz
5. Allocation builder
6. Home (jar, tree, stats, next lesson card)
7. Activity feed (each round-up and catch as a line item)
8. Paycheck catch prompt (modal or sheet)
9. Portfolio detail (holdings, growth chart, fee line)
10. Lessons library with progress ring
11. Settings (pause round-ups, threshold, catch percentage, fee disclosure, dark mode)

## 9. Tech constraints for the architect

- Web app, mobile-first responsive. Suggested React front end with a lightweight backend or local state for the prototype. Architect to decide and justify.
- All money is simulated. No real accounts, no real trades, no payment processing.
- Price data: seeded historical series or a free delayed API. Architect to decide.
- Auth: simple email/password or magic link is fine.
- Keep the transaction simulation layer, the pricing layer, and the brokerage layer each behind their own interface so any of them can be swapped for a real provider later.

## 10. Definition of done

A new user can complete the summer money screen, fear check, and risk quiz, tweak their allocation with live risk feedback, watch simulated transactions generate round-ups, simulate a paycheck landing and accept a catch, see the jar fill and sweep into the portfolio, view 30 days of mocked portfolio history, and unlock at least three lessons along the way. All animations work on mobile and desktop.

## 11. Non-goals

Real money movement, tax documents, crypto, social features, individual stock picking, premium tiers, budgeting or spend tracking. This app catches money. It does not nag about spending.

## 12. Open questions for the architect to ask me

- How much allocation freedom is safe for a beginner? Should there be guardrails (for example a minimum bond percentage on the "Conservative" profile)?
- Should lessons be skippable, or gently required before certain actions like changing allocations?
- What is the right default sweep threshold given simulated spending volume, $5 or lower?
- Should the paycheck catch percentage be fixed at onboarding or asked each time a deposit lands?
- Is the $1/month fee a real v1 number or a placeholder?

## Process instructions from the user

Run the dev team. Architect first, then stop for approval at each handoff.

---

## Architect Q&A

Interview held 2026-09-06. The architect asked ten questions and listed its assumptions. The user's answer to all of them: **"go with your recommendations."** The accepted recommendations are recorded here so downstream agents have them without re-reading the chat.

1. **Allocation guardrails:** Soft guardrails. Bond ETF floors per profile (Conservative 40% / Balanced 20% / Growth 10%). Dragging below the floor is allowed but turns the risk read amber, shows "this is riskier than the mix you picked in the quiz, are you sure?", and requires one extra confirmation tap.
2. **Lessons:** Always skippable, never gating. One-time inline explainer (not a full lesson) on first open of the allocation builder.
3. **Sweep threshold:** $5 default. Simulator tuned so a typical user hits it every 8 to 12 simulated transactions (roughly 3 to 5 simulated days). Presets in settings: $1, $3, $5, $10.
4. **Catch percentage:** Set once at onboarding (default 5%). Each paycheck prompt shows the computed dollar amount with one-tap Yes plus a "change %" link that adjusts this deposit only.
5. **Fee:** $1/month is a placeholder wired through a single config constant. UI shows "$1/month". The fee is simulated: deducted from the simulated portfolio on the 1st of each simulated month so the "per year" line and the portfolio fee line are real numbers.
6. **Backend:** None in v1. Single React app, all state in the browser (IndexedDB). Export/import JSON in settings. "Auth" is a local profile screen (name and email, no password). Brokerage, pricing, and transaction layers behind interfaces so a backend can slot in later.
7. **Persistence:** Survives refresh and browser close on the same device. No cross-device sync. Settings has "Reset demo".
8. **Simulated time:** Decoupled from wall clock. Demo controls tray (long-press on logo or `?demo=1`) with "Next day", "Skip a week", "Land a paycheck". On app open, auto-advance one simulated day per real day elapsed.
9. **Portfolio history:** Portfolio starts empty at simulated day 0; chart shows history since first sweep. ETF price history is a pre-seeded 400-trading-day series of real closing prices committed as JSON, with a documented refresh tool.
10. **Summer / deploy / tests:** Summer is June 1 to August 31 by simulated date; demo controls can force summer on. Static build deployable to Vercel or any static host; definition of done verified on the local dev server. Unit tests (Vitest) on round-up engine, sweep logic, catch math, allocation risk read, simulator determinism. Playwright end-to-end covering the definition of done on one mobile and one desktop viewport.

Accepted assumptions:
- Stack: React 18 + TypeScript, Vite, Tailwind CSS, Zustand, Framer Motion, Recharts, Vitest, Playwright. No component library.
- Tickers: VTI, VXUS, BND, VNQ, VTIP, labeled "US stocks," "World stocks," "Bonds," "Real estate," "Cash-like."
- Risk quiz: five questions mapped to Conservative / Balanced / Growth. Expected-range chart and "dropped about X% in bad years" computed from seeded price history (worst rolling 12-month drawdown of the weighted mix).
- Fractional shares in the simulated brokerage. No spread, no trading fees.
- Transaction simulator deterministic from a per-profile seed.
- Paychecks every 14 simulated days, amount derived from summer money screen answers.
- Summer curves: fixed 7% nominal annual return, disclosed in a tooltip as an assumption, comparing contributions age 19 to 30 vs. starting at 30, both projected to 65.
- Eight lessons in v1 (five event-triggered plus three fear-check), stored as content JSON.
- Milestone cards rendered to PNG via canvas. No social integration.
- Dark mode follows system by default with manual override.
- Palette: soft green base with coral accent (sky blue / amber fallback).
- All UI copy in one strings file with a lint rule that fails the build on any em dash.
- No analytics, no error reporting, no third-party runtime network calls.

---

## Cycle 1 close-out decisions (2026-09-06)

After the manager's status report (05-status.md), the user decided:

1. **Run one short cycle 4** targeting the manager's top remaining risks (persistence write race, touch and real-device oriented checks for the allocation bar and long-press, screen-reader behavior of tooltips, milestone PNG save in a real browser). Not a general re-audit.
2. **Deploy a static preview** for user testing (plan 10: static build to Vercel or any static host).
3. **Ship on synthetic, labeled price data.** Do not retry the real price fetch this cycle.
4. **Ratify all twelve architect assumptions in plan 10.2** as accepted, including: bad-years figure is the larger of seeded-history drawdown and the reference table; growth since start includes fees; exact-dollar purchases round to $0 with no feed line; age field on the summer screen; "how much is left" is copy-only.
