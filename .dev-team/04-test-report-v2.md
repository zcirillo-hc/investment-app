# 04 Test Report, v2 (the spend-habit nudge pivot)

Tester pass, 2026-09-09. Machine: darwin 25.6, Node 24.17, Playwright Chromium, Vite dev on
`http://localhost:5173`, Neon via the isolated-schema harness, and the live deployment at
`https://sparechangeinvesting.vercel.app`. Everything below was **run**, not read. Where I
could only reason, I say so.

The v1 report (`04-test-report.md`) is left intact. This file is new.

---

## Verdict

**SHIP WITH RISK.** The v2 core loop, the money math, the determinism, the privacy
architecture and eleven of the twelve v1 defects all hold up under attack — but the Nudges
card tells a user on the ordinary iPhone Safari path that three things are stored on a server
and offers to delete a server row, when nothing was ever sent and no row exists, and three
primary controls including both jar actions are 36 px tall against the plan's 44 point
minimum.

**Defects by severity: 2 Major, 6 Minor, 0 Critical.**

---

## Confirmed defects

### V2-1. Major. The Nudges card claims server-side storage in the three states where nothing is ever sent to the server

- **Violates:** criterion 24 ("With the notification permission denied ... **no row is created
  in `push_subs`**"), R14.11 ("nothing claims a nudge was scheduled when the call failed"),
  and plan 9.4/9.5, whose whole point is that the server story is stated honestly.
- **What breaks:** `src/components/NudgesCard.tsx:179` gates the "What is on the server while
  nudges are on" block and the "Turn nudges off — This deletes the row on the server, right
  now" copy on `settings.nudgesEnabled` alone, not on a subscription existing. The coder's own
  deviation 5 turns `nudgesEnabled` on immediately in `denied`, `needs-ios-install` and
  `unsupported` **without subscribing** (correctly, so criterion 24's in-app loop keeps
  working). The result is a card that describes a server row that does not exist. The
  `nudges-endpoint` line at line 184 *is* correctly gated on `push.endpointHash`, so the
  distinction was known; the block around it just does not use it.
- **Repro:**
  ```
  npx playwright test tests/e2e/tester-v2-nudges-honesty.spec.ts
  ```
  By hand: onboard at `http://localhost:5173/?demo=1&freeze=1&start=2026-06-15&seed=42`, then
  open `/settings?demo=1&freeze=1&start=2026-06-15&seed=42&push=needs-ios-install` (or
  `&push=denied`) and click the Nudges switch.
- **Observed**, identically on `mobile` (375x812), `iphone-pro` (393x852), `iphone-pro-max`
  (430x932) and `desktop` (1280x800):
  ```
  PUSH-STATE denied:            nudgesEnabled=true nudges-stored=1 endpoint-line=0 apiCalls=[]
  PUSH-STATE needs-ios-install: nudgesEnabled=true nudges-stored=1 endpoint-line=0 apiCalls=[]
  ```
  On screen, simultaneously:
  > Nudges are on for this browser.
  > **What is on the server while nudges are on** — Three things: an address your browser hands
  > out so a notification can reach it, your time zone, and the minute to wake you.
  > **Turn nudges off** — This deletes the row on the server, right now.
  > **Notifications are blocked for this site** …

  `apiCalls=[]` is the proof: zero requests to `/api/**` were made, so nothing was subscribed
  and `push_subs` is untouched.
- **Expected:** in these states the card says nudges work in the app only, and the server
  block and the "deletes the row on the server" line are not rendered at all.
- **Why this matters more than it looks:** `needs-ios-install` is what every iPhone Safari
  user sees before Add to Home Screen — the single most common path for this product. The one
  thing plan 9.4 exists to get right is exactly what this state gets wrong, in the opposite
  direction from a privacy leak: it over-claims. A user who reads it and then clears the app
  believes they left a row behind that never existed.
- **Fix shape:** gate the `nudges-stored` block and `S.nudges.turnOffConfirm` on
  `state.push.subscribed` (or `endpointHash !== null`), not on `on`.

### V2-2. Major. Three user-facing controls are 36 px tall, at every phone viewport (D7 regression)

- **Violates:** plan 6.13 / 11.2, "The mobile checks, no horizontal scroll, **44 point tap
  targets**, and safe area padding present, run at all three sizes"; and the v1 section 11 rule
  the D7 fix was written against. Two of the three are named in criterion 10.
- **What breaks:** `Button size="sm"` is `min-h-[36px]` (`src/components/Button.tsx:19`) and is
  used for the two jar actions and the Places nudges opt-in.
- **Repro:**
  ```
  npx playwright test tests/e2e/tester-v2-regression.spec.ts -g "44 px tap targets"
  ```
- **Observed** (identical set on all three phone profiles; widths grow with the viewport,
  heights do not):
  ```
  375x812   /: jar-move "I moved this into an inv" 311x36
            /: jar-spent "I spent it"              311x36
            /places: places-enable-nudges "Turn nudges on" 133x36
  393x852   329x36, 329x36, 133x36
  430x932   366x36, 366x36, 133x36
  ```
  Source: `src/screens/Home.tsx:277`, `Home.tsx:280`, `src/screens/Places.tsx:62`.
- **Expected:** at least 44 px tall. Every other control on Welcome, Home, Places, Invest,
  Activity, Settings, Lessons, Learn and Summer passes.
- **Not counted here, but the same `size="sm"`:** `place-delete-yes`, `place-delete-cancel`,
  `place-mute-*`, `nudges-turn-off`, `nudges-retry`, `settings-unmute-*`, the two
  `learn-surface-*` buttons and `invest-capture-remove-*`. My audit only reaches controls
  rendered in the default state of each screen; these live behind a confirm or a condition. If
  the fix is to `Button`'s `sm` size rather than to three call sites, they are covered too.

### V2-3. Minor. Two overlapping runs of the send route each deliver a notification for the same subscriber on the same local day

- **Violates:** R14.4's daily lock ("this now also guards against a duplicate send if the route
  is called more than once in a day, **which happens routinely when a tester triggers it by
  hand**") and R4.4's one-nudge-per-day, for a single browser.
- **What breaks:** `runSend` reads `selectDue` and only takes the lock in `markSent`, *after*
  the push has been sent. Two invocations that overlap both select the row before either marks
  it. There is no `select … for update`, no advisory lock and no conditional update.
- **Repro:**
  ```
  npx vitest run --config vitest.db.config.ts tests/db/tester-backend.test.ts \
    -t "two overlapping runs"
  ```
  The case inserts one due row and runs `Promise.all([runSend(...), runSend(...)])` with a
  sender that takes 300 ms.
- **Observed:** `AUDIT-RESULT concurrent-sends=2`. **Expected:** 1.
  The *sequential* case in the same file (`a sequential second run does not resend`) passes, so
  the guarantee criterion 22 actually asserts is intact; it is only the concurrent one that is
  not.
- **Exposure, stated plainly:** Vercel Cron on Hobby fires once a day, so this needs either two
  hand triggers close together (which 11.4 instructs the tester to do) or a platform retry
  overlapping the original. Minor for that reason, not because the outcome is harmless.

### V2-4. Minor. The send loop cannot finish its own documented batch inside its own function limit

- **Violates:** the two numbers in 6.8 (`limit 500`) and 6.6 (`maxDuration: 60`) are not
  self-consistent. The coder flagged this as weak point 1 and asked for a decision; this is the
  measurement.
- **Repro:**
  ```
  npx vitest run --config vitest.db.config.ts tests/db/tester-backend.test.ts \
    -t "exceeds the function maxDuration"
  ```
- **Observed**, real Neon, 20 real rows, two runs of the same batch:
  ```
  db-only:     20 rows in 1163 ms (58 ms/row of pure Neon round trips)
               -> 500 rows projects to 29 s BEFORE any push latency at all
  serial-send: 20 rows in 3058 ms (153 ms/row, sender sleeping a conservative 100 ms)
               -> 500 rows projects to 76 s against maxDuration 60
  ```
- **Observed vs expected:** a full 500-row batch is projected at 76 s against a 60 s ceiling.
  The failure is not corrupting (rows already marked sent stay sent; the rest are missed for
  that day and swept), but roughly the last fifth of a full batch silently gets no nudge.
- **Why Minor:** at today's subscriber count the batch is one or two rows. It becomes Major
  somewhere around 200 subscribers. **This is an architect decision, not a coder bug:** bounded
  concurrency, a lower `limit`, or an accepted ceiling stated in the plan.

### V2-5. Minor. `POST /api/push/unsubscribe` is a subscription oracle

- **Violates:** the reasoning the coder wrote into `api/push/schedule.ts` and applied there —
  "A 404 would tell an unauthenticated caller whether a given endpoint is subscribed" — which
  `unsubscribe` does not follow.
- **Repro:**
  ```
  npx vitest run --config vitest.db.config.ts tests/db/tester-backend.test.ts -t "oracle"
  ```
- **Observed:** with a wrong `auth`, a subscribed endpoint returns **403** and an unsubscribed
  one returns **200 `{deleted: 0}`**. **Expected:** the same status for both.
- **Exposure:** you must already hold the full push endpoint URL, which is high-entropy and is
  itself the secret. Real but small, and it is the kind of inconsistency that gets copied.

### V2-6. Minor. Six import shapes the plan's rules forbid are accepted, one of which loses data

- **Violates:** R7.1 (`date` may not be later than the current simulated date), R4.4 (one nudge
  per `dayIndex`), and plan 11's "import of a malformed file: clear error, state untouched".
- **Repro:** `npx vitest run tests/unit/tester-v2-import.test.ts tests/unit/tester-v2-import-impact.test.ts`
- **Accepted, and what each does once in state** (all measured):
  | shape | consequence |
  |---|---|
  | **two ledger entries sharing one `id`** | **data loss:** 2 entries totalling `14900c`; deleting one leaves `0 entries totalling 0c` (`removeEntry` filters by id) |
  | ledger `date` in 2099 | sorts to the top of Invest forever (R7.1 says it may not exist) |
  | a visit whose `placeId` names no place | survives into state and into a later export, carrying its `displayName`; invisible on Places, so it cannot be deleted through the UI |
  | two places sharing one `id` | two rows, two `Habit` records for one place |
  | `lessons.L1.unlockedDay = 999999` | cosmetic |
  | two nudges on one `dayIndex` | only the first pending one is reachable; R4.4 is violated in stored state |
- **Why Minor and not a repeat of v1's Critical D1:** every one of the 41 shapes that made D1
  Critical is still rejected (see the regression table). Nothing the app itself writes can
  produce any of these; each needs a hand-edited or corrupted file; and none bricks the boot or
  writes `NaN`. The duplicate-ledger-id case is genuine data loss and I would fix that one
  first. If the architect wants strict parity with the D1 ruling, re-rate that row Critical —
  I am not going to inflate the other five to get there.

### V2-7. Minor. Lesson L7 ranks one approach over another and asserts growth, and passes both lints

- **Violates:** R15.5 ("The app does not say one account type, fund shape, market or approach
  is better, safer, smarter or more suitable than another") and, weakly, R15.2 (no growth
  rate — there is no figure, but the claim is directional).
- **Shipped copy** (`shared/content/lessons.json`, L7):
  > **Why $20 a week beats $500 later** — "Twenty dollars a week is about $1,000 a year.
  > Started now and left alone, the early money has decades to grow, and time is the part you
  > cannot buy later. Waiting for a big amount usually means waiting forever."
- **Evidence that the automated layers cannot see it:** I planted seven violations
  (`you should`, `we recommend`, `guaranteed` + `risk free`, `returns of 12% growth`, `NVDA`
  and `AAPL`, `best etf`, `will grow`) into `src/content/` and one into
  `shared/content/learn.json`; **`lint:advice` caught all eight**, exit 1 each time, and
  `lint:copy` caught a planted `everything stays on this device`. So R15.7 layer 1 is genuinely
  wired up — and L7 still passes it. This is precisely the case R15.7 layer 3 exists for, and
  the coder records that the manager's read-through **has not happened**.
- **Second, weaker instance:** Learn E16, "a fee only advisor earns their money, because they
  are paid by you rather than by whatever they sell you" — a preference between advisor types.
  E08's "the market lost two percent today" and E15's "swings twenty percent either way" are
  hypothetical illustrations, not return claims; I read them and let them stand.
- **Reviewed and clean:** the other 15 Learn pieces and 7 lessons. No ticker, no fund name, no
  company name, no brokerage name, no numeric return claim, no second-person imperative about
  the user's money, no personalization. The `sevenPercent` tooltip's "roughly the long-run
  average" is R15.2's own named exception.

### V2-8. Minor. Settings carries two interactive controls with the same accessible name, one of them 1x1

- **Violates:** the shape the D12 fix removed from Welcome, not carried across.
  `src/screens/Settings.tsx:190` renders `<input type="file" class="sr-only"
  aria-label="Import JSON">` — focusable, in the tab order, 1x1 — directly after a visible
  `<Button>` reading "Import JSON". Welcome's equivalent (`src/screens/Welcome.tsx:157`) has
  `tabIndex={-1}` and `aria-hidden="true"` and is correct.
- **Observed:** `settings-import "" 1x1` in the tap-target audit before I excluded sr-only
  elements. A keyboard or screen-reader user meets "Import JSON" twice.

---

## Plan-vs-build gaps

- **Criterion 23's second half is unverified by anyone.** The CDP push-delivery spec exists
  (`tests/e2e/push-delivery.spec.ts`) but the criterion also says "**Additionally verified by
  hand, and required to close the cycle:** one screenshot of a real notification arriving on a
  real iPhone with the app added to the Home Screen." That has not happened and I cannot do it.
- **R15.7 layer 3 has not happened.** The plan makes the manager's read-through of all sixteen
  Learn pieces, all eight lessons and every tooltip a *required* gate before the cycle closes.
  The coder says so; V2-7 is what a lint-plus-tester pass finds without it.
- **Built beyond the plan, and fine:** `?push=<state>` (client deviation 8), the `/summer`
  route (deviation 7), `asOf` in `due.ts` (backend deviation 2), `PUSH_DB_SCHEMA` (backend
  deviation 1). I attacked all four. `?push=` cannot affect a real subscription. `asOf` is not
  reachable from a request. `PUSH_DB_SCHEMA` is covered below.
- **The app makes zero `/api` calls in the default flow.** Measured: onboarding, a forced
  nudge, a skip, and visits to Places, Invest, Settings and Learn with `**/api/**` routed to
  `abort('failed')` produced `OFFLINE-API: 0 blocked calls`. R14.11 and 6.12 hold trivially in
  the nudges-off path, which is the only path a Chromium test can reach. It also means the
  coder's weak point 3 — nothing observes `publishNudgeSchedule` end to end — is still open,
  and I could not close it (see "What I could not test").

---

## Unverified concerns

Unconfirmed. I could not reproduce these; do not treat them as defects.

1. **`pruneVisits` early-returns on unsorted input.** `src/domain/places.ts:81` returns the
   array unchanged when `visits[0].dayIndex > cutoff`, which assumes ascending order. I proved
   the behaviour in isolation (`tests/unit/tester-v2-loop.test.ts`, "LATENT") but **found no
   way to reach it**: every writer keeps `visits` sorted and the import validator enforces
   non-decreasing `dayIndex`. Latent, documented, not filed as a defect.
2. **`roundCents(Infinity)` returns `Infinity` rather than throwing** (the guard is
   `!(value >= 0)`). I could not find an input path that reaches it; the validator rejects
   every non-integer.
3. **`enabled` is written but never set false** (coder weak point 6). Dead state, no observed
   consequence.
4. **`.stagger` still animates a transform** (visual-polish weak point 1). Nothing fixed lives
   inside a staggered row today, so I could not reproduce the containing-block bug the coder
   describes; the hazard is real if that changes.

---

## D1 to D12 regression table

Every `tester-*` file from v1 was deleted in the pivot and nobody re-verified these. Here is
the re-verification, from tests I wrote this pass.

| v1 defect | status | evidence |
|---|---|---|
| **D1** Critical, import accepts malformed files | **STILL FIXED** | 41 hostile shapes, including every one from the original repro (`lastOpenedRealDate: "yesterday"`, `pendingPaychecks: [{}]`, `lessons.L1 = null`, string/NaN/Infinity/negative/fractional money, negative `dayIndex`, `catchPct: 999`, `theme: "purple"`, `age: 900`, a 5,000-char name) all rejected. `push` is dropped, `habits` recomputed, coordinates stripped off place records. See V2-6 for six *new* gaps. |
| **D2** seed re-derived on a profile edit | **STILL FIXED** | Seed reads `42` before and after editing the name to "Samantha" in Settings; `store.ts:203` short-circuits once `onboardingComplete`. |
| **D3** missing tooltip terms | **STILL FIXED** for the v2 term set | Every `[[term]]` marker in `learn.json` and `lessons.json` resolves to a `tooltips.json` entry (the one "unresolved" hit, `[[key]]`, is inside a `note` field describing the syntax). 28 tooltip entries, 28 distinct live `term-*` anchors tapped across six screens. |
| **D4** onboarding forward-jump | **STILL FIXED** | Home is unreachable before onboarding completes (`home=0 summer=1 fear=0`); a step with nothing behind it redirects to Welcome. Reaching `/onboarding/fear` with only a name is *deliberate* (`routes.tsx stepAllowed`: the summer inputs are optional) — I withdraw that as a finding. |
| **D5** scroll carries across routes | **STILL FIXED** | All five tab changes from a fully scrolled page land at `scrollY` 0. |
| **D6** tooltip pin outlives focus / does not follow scroll | **STILL FIXED** | Bubble repositions on scroll, flips above a low anchor (`data-placement="above"`), stays inside the viewport, one at a time, closes on Escape/outside/blur. |
| **D7** tap targets under 44 px | **RETURNED** | **V2-2**, three controls at 36 px on all three phone profiles. |
| **D8** form validation stale/silent | **STILL FIXED** | Welcome shows and clears its own over-long-name message; a Settings name edit persists across a reload. |
| **D9** full-liquidation fee leaves dust shares | **MOOT** | The fee, the holdings and the whole simulated portfolio were deleted in the pivot (plan 1.1). There is no `sellForCash` and no share to leave behind. |
| **D10** boot throws on a corrupt `clock.startDate` | **STILL FIXED** | Hand-wrote `startDate: "someday"` into the IndexedDB envelope and reloaded: `screen=screen-home bodyLen=925 errors=0`. |
| **D11** tooltip tapped low in the viewport closes itself | **STILL FIXED** | 28 taps per project across Home, Places, Invest, Activity, Settings and Learn at four scroll offsets each, on `mobile` and `desktop`: **0 self-closures**. Every tap is preceded by an `elementFromPoint` check so an overlaid term cannot be miscounted as a pass. |
| **D12** Welcome import control 168x20 | **STILL FIXED** on Welcome | The visible button is 44 px and the file input is `tabIndex={-1} aria-hidden`. The *same shape* survives on Settings — **V2-8**. |

**One returned: D7.**

---

## Section 2 acceptance criteria

PASS means I ran something this pass that proves it. NOT VERIFIABLE means I could not reach
it here and say why. I did not re-run the suites the brief said were green; those rows say so.

| # | Criterion | Result | How |
|---|---|---|---|
| 1 | Cleared profile completes onboarding, lands on Home, no console error | **PASS** | Both viewports, every spec in this pass starts this way; `collectErrors` empty. |
| 2 | `/portfolio`, `/onboarding/quiz`, `/onboarding/allocation` redirect | NOT VERIFIED | Covered by the green `v2-loop.spec.ts`; not re-run. |
| 3 | No recharts / allocation / brokerage in `src/`, no `charts` chunk | NOT VERIFIED | Build-time; brief says green. |
| 4 | 14 "Next day"s produce a habit place | **PASS** | `tester-v2-loop.test.ts`: at seed 42, 14 ticks yield ≥1 habit place. |
| 5 | Places lists visit count, usual time, habit status; habit shows a labelled estimate | **PASS** | Observed live: "3 visits in the last 14 days / Usual time about 8:30 am / A habit. We can ask about this one. / About $4.35 a visit — an estimate of what you usually spend here". |
| 6 | Skip adds exactly the displayed estimate, one Skip line | **PASS** | `SKIP: estimate=435 jar 0 -> 435 (delta 435)`, mobile and desktop. |
| 7 | Nudge left alone: no event, no counter move, no copy about it | **PASS** | `nudge:0` -> `expired`, `nudge:1` created for the new day, `skips` unchanged at 0, no shame words on Activity. |
| 8 | Mute one place, others still nudge; global mute; both survive reload | **PARTIAL PASS** | Domain level proven (`mutePlace` leaves the other place nudging). Reload persistence not re-run. |
| 9 | At most one nudge per simulated day over 30 days, two habit places | **PASS** | 30 ticks with two habit places kept alive: zero days with more than one nudge. |
| 10 | Jar move pre-fills, one entry, jar zero, animation; "I spent it" neutral | **PARTIAL PASS** | Domain level proven exactly (one entry, one JarMove, `jarCents = 0`; JarEmptied writes no entry). The animation itself not re-verified. |
| 11 | Invest shows no value/growth/percent | **PASS** | Full text scan of Invest before and after a capture: no `%`, no gain/loss/current value/market value. The 9.3 honest line is the only "worth today". |
| 11a | Capture flow: three types, three entries, no percent, "Something else" needs a label | NOT VERIFIED | Covered by green `v2-loop.spec.ts`; I only exercised the single-type path. |
| 12 | Delete a place: gone from screen and export, Skip lines keep their amounts | **PASS** | `DELETE: removed demo coffee, kept 1 Skip event(s)`; place and its visits absent from persisted state, Skip's `cents` intact. |
| 13 | Export has no `/lat\|lon\|lng\|coord\|geo/i` key and no float | **PASS** | Walked the persisted export by key and by value type: 0 coordinate-shaped keys, 0 non-integers, `push` absent. |
| 14 | Summer renders both curves and the 7% tooltip, no network, no chart library | **PASS** | Two polylines, 47 points each; `startNow=$98,467 startAt30=$44,374 diff=$54,093` matching an independent recomputation to the dollar; `term-sevenPercent` opens a bubble containing "7%"; renders at 320, 375, 393, 430, 768 and 1280 px with no horizontal scroll; doubling the input doubles the projection; $0 falls back to the disclosed $3,000 example. |
| 15 | ≥3 confidence lessons in 30 days; L3 on first skip, L4 on first ledger entry | NOT VERIFIED | Covered by green specs; not re-run. |
| 16 | `lint:copy` and `lint:advice` report 0 | **PASS** | Re-run: `lint:copy ok (103 files)`, `lint:advice ok (88 files)`. |
| 17 | Axe 0 serious / 0 critical | NOT VERIFIED | Brief says green; not re-run. |
| 18 | `npm test`, `test:db`, typecheck, build green; no secrets in `dist/` | **PASS (regression check)** | Existing 26 unit files, **537 passed**, unchanged with my files added. |
| 19 | `dist/manifest.webmanifest` + `dist/sw.js`; `/api/health` 200 JSON with a migration id; `/sw.js` JS with `must-revalidate`; app routes return HTML; SW activates; installable | **PASS on the live deployment** | `GET /api/health` -> `200 application/json {"ok":true,"db":true,"migration":"0001"}`; `/sw.js` -> `200 application/javascript, cache-control: public, max-age=0, must-revalidate`; `/places` -> `200 text/html`; manifest, all five icons and `logo.svg` all 200 with correct content types. I used the live site rather than `vercel dev`. |
| 20 | iPhone Safari profile shows the install panel, never calls `requestPermission`; desktop shows the toggle | NOT VERIFIED | Covered by the green `pwa.spec.ts`. I exercised `?push=needs-ios-install` and found **V2-1** there. |
| 20a | Safe-area padding at 393x852 and 430x932, nothing obscured, no horizontal scroll | **PARTIAL PASS** | No horizontal scroll on all eight screens at 375, 393 and 430. The `env()` padding assertions live in the green `standalone.spec.ts` and were not re-run. |
| 20b | Every drill-in screen and each install/denied panel exposes a visible back or dismiss | NOT VERIFIED | Covered by the green `standalone.spec.ts`. |
| 21 | One row keyed by sha256(endpoint), an IANA tz, no place/name/amount/jar/IP column; subscribing twice yields one row | **PASS** | Queried `information_schema.columns` against the real table: no column matching place/merchant/amount/cents/jar/name/ip/addr/lat/lon/coord/geo/user/email/age. Double subscribe -> 1 row, and the pending minute survives it. Extra keys (`placeName`, `estimateCents`, `jarCents`) posted to `/schedule` are ignored and absent from the stored row. |
| 22 | The once-a-day scheduler: future minute sent early, 45 min late selected, 65 min late not, daily lock on a second call, stale sweep, two extreme zones | **PASS, with V2-3** | Boundaries measured exactly: 59 min late **due**, 60 min late **not due**, 61 min late **not due**; a target hours ahead **is** sent; a disabled row is never selected; a sequential second run does not resend; `Pacific/Kiritimati` due and `Pacific/Niue` not, in the same run, on different local dates; the DST spring-forward gap minute is not sent and *is* cleared by the stale sweep the next day; the fall-back repeated hour produces **one** send. Cron gate: 401 for eleven malformed authorization headers, 500 when `CRON_SECRET` is unset, 405 for POST, and no secret echoed. Verified against the live deployment too: `/api/cron/send-nudges` returns 401 with no bearer and with a wrong bearer. **Concurrent calls are the exception — V2-3.** |
| 23 | CDP push delivery: exactly one notification, composed on device, no coordinate/jar/shame; mismatched and unparseable payloads fall back; **plus a real iPhone screenshot** | NOT VERIFIED HERE | The composition path is correct by inspection of `public/sw.js` (single `showNotification` exit, IndexedDB read, date guard, fallback with no personal content). The CDP spec is green per the brief. The **real-iPhone screenshot the criterion requires is still outstanding.** |
| 24 | Permission denied: 9.4c panel, no row, no repeat prompt, loop still works | **FAIL** | The panel shows and no row is created (`apiCalls=[]`), but the card simultaneously claims a server row — **V2-1**. |
| 25 | Turning nudges off deletes the server row and unsubscribes; delete-everything the same; honest when the API is unreachable | **PARTIAL PASS** | Server side proven: `unsubscribe` with the right auth returns `{ok:true, deleted:1}` and leaves 0 rows. The client half needs a real subscription — see below. |
| 26 | 410 deletes, 404 deletes, 429 leaves `fail_count` alone, five generic failures delete | **PASS** | Each asserted at the exact count: 410 -> row gone; 429 -> `fail_count` still 2, minute intact, `failed: 0`; fourth generic failure -> row alive at `fail_count: 4`; fifth -> row gone. A sender that *throws* is a generic failure and does not abort the batch (the next row still sends). |
| 27 | 8 lessons, ring out of 8; 16 Learn pieces, all open from day 0, "N of 16 read", survives a reload; three surfacing moments | **PASS** | Fresh profile, day 0: 16 links, **0 lock markers**, all 16 opened, header `0 of 16` -> `16 of 16` and `16 of 16` after a reload; Lessons ring reads "of 8"; no `%` on Learn. |
| 28 | `lint:advice` 0; no ticker/return claim/banned phrase/imperative; every `[[term]]` resolves and every tooltip is used; the standing line appears once each on Lessons, Learn and Settings; a planted violation fails the lint | **PASS on the automated layers, FAIL on the human one** | Nine planted violations across `src/content/` and `shared/content/learn.json` all caught (exit 1). Every marker resolves. The standing line renders on Settings. But R15.7 layer 3 has not run, and **V2-7** is what it would have caught. |

---

## What I tried that held up

Brief, to bound my confidence rather than to reassure.

- **The v1 D1 attack set, translated to v2.** 41 hostile files. All rejected. `push` dropped,
  `habits` recomputed from visits rather than trusted, extra keys (including planted `lat` and
  `lon`) stripped off place records field by field.
- **The R-rules at their boundaries, against what section 4 says rather than against the
  existing tests.** R3.2 (2 vs 3 visits), R3.3/R3.4 lower medians, spread of exactly 45 vs 46,
  the R3.1 14-day window edge, R5.1's fifth-vs-sixth visit and its `d-60` edge and its id
  tie-break, R4.2's `usualMinute = 19` -> no nudge, R4.3's inclusive 360/1260 with 359 and 1261
  outside, R4.4's smallest-minute-then-byte-wise-id tie-break, R2.5's retention edge, R6.3's
  re-crossing after emptying, R7.1's 60-vs-61 characters and its 0/negative/fractional/ceiling
  amounts, R9's window, R13's step-4-before-step-8 ordering. All correct.
- **Money.** No float, no NaN, no negative, no drift anywhere: a full walk of `jarCents`,
  `events`, `visits`, `nudges`, `ledger` and `habits` after 30 ticks found zero non-integers.
  `roundCents` and `addToJar` throw on a negative rather than rounding it. `averageCents`
  divides before rounding. A double-tapped skip credits once. A later, more expensive visit
  never restates a past skip (R5.3).
- **Determinism.** Seed 42 twice for 30 days is byte-identical; seed 7 differs.
- **SQL injection through `table()`.** Thirteen hostile `PUSH_DB_SCHEMA` values — embedded
  quotes, a stacked `delete`, uppercase, a leading digit, a hyphen, a space, a newline, 64
  characters, a bare `"public"` — **every one throws before a query is built**. I initially
  filed this as a hole; that was a NUL byte in my own test file, and Node's env store truncates
  at it. **Conceded: `table()` is sound.** A SQL payload inside an endpoint URL is stored as
  data and the table survives.
- **Route hardening.** A `tz` of `'; drop table push_subs; --` -> 400, nothing stored. A 4096-char
  endpoint, an empty tz, `http:`, a bare `+05:30` offset, `keys: null`, a null body, a raw
  string and an array -> 400 each, 0 rows. No response body echoes a secret or an endpoint.
- **Privacy, in the shipped code and in what the API accepts.** `src/lib/pushApi.ts` is the only
  file in `src/` that knows a route exists; its four bodies carry exactly the fields 6.6 lists.
  `nudgeSchedulePayload` is built in the pure domain and its object has exactly two keys. The
  server ignores extra keys. `public/sw.js` reads the pending record from IndexedDB and composes
  the sentence locally, with a single `showNotification` exit and a date guard. The banned string
  "everything stays on this device" is **gone from every file** and `lint:copy` fails on it when
  planted. The Places privacy copy is honest and qualified. **The privacy promise is true in the
  shipped code.** V2-1 is the opposite failure: over-claiming.
- **The live deployment.** All five icons, `logo.svg`, the manifest, `sw.js`, `/api/health` and
  `/api/push/vapid-public-key` resolve with correct content types; the SPA rewrite no longer
  swallows `/api`; `og:image` resolves and is a real 1200x630 PNG rendering the wordmark.
  `apple-touch-icon-180.png` is 180x180 **RGB with no alpha channel and no `tRNS`** — correct.
  The maskable 512 is a full-bleed RGB image whose jar sits well inside the 80% safe circle.
- **The tooltip, hard.** 28 taps per project, six screens, four scroll offsets, with an
  `elementFromPoint` guard so an obscured term cannot pass by accident. Zero self-closures,
  flip-above works, the bubble never leaves the viewport.
- **Two lint layers, proven wired.** Nine planted violations, nine failures.

---

## What I could not test, and why

Do not read any of this as a pass.

1. **A real push, end to end, to a real browser.** I have no real `PushSubscription`: headless
   Chromium here reports `Notification.permission === 'denied'` however the permission is
   granted (which is exactly what the coder measured). Everything downstream of a real
   subscription is therefore unverified by me: `subscribe()` actually creating a row from the
   client, `publishNudgeSchedule` firing after a tick or a skip (**the coder's own weak point
   3, still open**), the client half of criterion 25, and `pushsubscriptionchange`.
2. **The real iPhone.** Criterion 23 requires a screenshot of a notification arriving on a
   physical iPhone with the app on the Home Screen. Criterion 20's real `supportState()` on
   iOS Safari, the real Dynamic Island geometry (11.4 item 7) and the real Add to Home Screen
   flow are all the same gap. I used `?push=` overrides and Chromium touch emulation.
3. **`npx vercel dev`.** Criterion 19 says to verify against it; I verified against the live
   deployment instead, which exercises the same `vercel.json` routing.
4. **The cron route on the live deployment with the real bearer.** Calling it is not read-only:
   it sends real notifications and mutates rows. I probed only the 401 path.
5. **Scale.** V2-4's 500-row figure is extrapolated from 20 measured rows. I did not insert 500.
6. **Concurrency beyond two.** V2-3 was measured with exactly two overlapping runs.
7. **A real offline install.** With the network down, a cold load fails outright
   (`response=null`) because the service worker deliberately precaches nothing (6.3). Section 3
   defers offline support, so this is recorded, not filed — but the app should never be
   described as working offline.
8. **Axe, the DST fixture suite, `pwa.spec.ts`, `standalone.spec.ts`, `learn.spec.ts`,
   `v2-loop.spec.ts` and `push-delivery.spec.ts`.** The brief said they are green and told me
   not to re-confirm them. I took that at face value; if any of them is quietly asserting the
   wrong thing, I did not look.

---

## Tests I added

All prefixed `tester-`. I modified nothing under `src/`, `api/`, `db/` or any test I did not
write. `git status` shows only these files. The two lint plants and the `learn.json` plant were
created and removed inside a single command each; the tree is byte-identical afterwards.

| file | cases | what it covers |
|---|---|---|
| `tests/unit/tester-v2-import.test.ts` | 54 | D1 regression: the v1 attack set against the v2 validator, plus the six gaps in V2-6. |
| `tests/unit/tester-v2-loop.test.ts` | 47 | R1 to R13 at the boundaries, money integrity over 30 ticks, determinism, the ledger. |
| `tests/unit/tester-v2-import-impact.test.ts` | 4 | What the accepted-but-wrong import shapes actually do once in state. |
| `tests/db/tester-backend.test.ts` | 32 | `table()` injection, hostile route bodies, the CRON_SECRET gate, due-selection boundaries, the daily lock sequential and concurrent, the batch-vs-maxDuration measurement, the auth model, failure handling at exact counts, DST. |
| `tests/e2e/tester-v2-regression.spec.ts` | 9 | D2, D4, D5, D7, D8, D10, D11, D12 and horizontal scroll. |
| `tests/e2e/tester-v2-product.spec.ts` | 11 | The summer chart, export privacy, the loop to the cent, the API-down path. |
| `tests/e2e/tester-v2-nudges-honesty.spec.ts` | 4 | V2-1, in all three non-`ready` push states. |

How to run:

```bash
npm test                                    # 537 existing + 105 mine (7 fail = V2-6)
npx vitest run tests/unit/tester-v2-*.test.ts
npx vitest run --config vitest.db.config.ts tests/db/tester-backend.test.ts   # 3 fail = V2-3, V2-4, V2-5
npx playwright test tests/e2e/tester-v2-*.spec.ts --project=mobile --project=desktop
npx playwright test tests/e2e/tester-v2-regression.spec.ts tests/e2e/tester-v2-nudges-honesty.spec.ts \
  --project=mobile --project=iphone-pro --project=iphone-pro-max --project=desktop
```

Every one of the 10 failing cases is a defect above, named in its own assertion message. When
V2-1 to V2-6 are fixed, all 10 should go green with no edit to the tests.

---

## For the architect

Three things need a decision rather than a fix:

1. **`limit 500` against `maxDuration 60` (V2-4).** Measured at 76 s projected. Pick: bounded
   concurrency, a lower limit, or a stated subscriber ceiling in the plan.
2. **Whether the send route needs a lock (V2-3).** 11.4 tells the tester to trigger it by hand;
   two overlapping triggers duplicate a notification. A conditional `update … where
   last_sent_local_date is distinct from …` before sending would close it.
3. **Whether the duplicate-ledger-id import gap (V2-6) is Critical.** It is data loss with the
   same bounded exposure v1's D1 had, and I rated it Minor because it neither bricks the app
   nor writes bad money. That is a judgement call and I would rather you make it than have me
   quietly re-rate my own prior ruling.

And one that is not a decision: **R15.7 layer 3 is a required gate and has not run.** V2-7 is
one lesson title. Nobody has read the other 23 pieces against R15 with intent in mind.

---

## Cycle 3, 2026-09-10: re-verification and new work

Machine: darwin 25.6, Node 24, 8 GB under heavy memory pressure (load average 8, a few
thousand free pages; one e2e test died on a cold `page.goto` and was re-run), Playwright
Chromium on `mobile` (375x812) and `desktop` (1280x800), Neon via the isolated-schema harness,
and read-only requests to the live site. Scope: everything in `580b222..HEAD`. Everything
below was run unless it says otherwise. **Production is serving HEAD** (the live bundle
contains "What these actually are", "How long is it for", "You have kept" and "Your jar kept
working"), so every defect below is live.

### Verdict

**DO NOT SHIP** the next deploy as is. The new "Your money" card overstates what the user has
put in: after a jar move it shows twice the real figure. And editing a bond row on Invest
silently deletes the rate and term the user typed. Separately, R15.7 layer 3, which the plan
makes a precondition of the next deploy, has still not been run by its owner.

**New defects: 2 Critical, 1 Major, 8 Minor (V2-9 to V2-19).** All eight V2 defects verified
fixed; D7 has returned for a fourth time on a new control.

### V2-1 to V2-8, re-verified

| id | ruling | evidence, this pass |
|---|---|---|
| V2-1 | **VERIFIED FIXED** (non-`ready` states) | `tester-v2-nudges-honesty.spec.ts` green on mobile and desktop: `PUSH-STATE denied: nudges-stored=0 endpoint-line=0 apiCalls=[]`, same for `needs-ios-install`. The `ready` path (a real subscription) is still unreachable in headless Chromium, so the `hasServerRow` ordering fix is unverified by me. |
| V2-2 | **VERIFIED FIXED** for every control it named | Measured `jar-move 311x44`, `jar-spent 311x44`; `places-enable-nudges` passes the full rendered audit on mobile and desktop; ledger row actions, capture remove and delete-confirm buttons all 44 tall. **The D7 class has returned on a new control, filed as V2-13.** |
| V2-3 | **VERIFIED FIXED** | Two overlapping runs send once. New cases, `tests/db/tester-v3-backend.test.ts`: **five** overlapping runs send once; a sender that throws after the claim leaves `fail_count 1, last_sent null, minute kept` and the next run sends; a 429 inside a concurrent pair leaves the row untouched with one call. |
| V2-4 | **VERIFIED FIXED** | `serial-send: 20 rows in 559 ms`, projecting 14 s for 500 against 60; `send-budget.test.ts` 4/4. Not tested: 8 concurrent sends provoking a real push service's 429. |
| V2-5 | **VERIFIED FIXED** | The oracle case passes: wrong auth gets the same answer for a subscribed and an unknown endpoint. |
| V2-6 | **VERIFIED FIXED** | All 54 cases in `tester-v2-import.test.ts` and the 4 inverted impact cases pass; each rejection is for the right reason (below). |
| V2-7 | **VERIFIED FIXED** | L7 now reads "Why early money has more time to grow", no figures; the original text in `tests/fixtures/original-l7.json` still fails the lint. The lint can be walked around with one word or one interpolation (V2-14). |
| V2-8 | **VERIFIED FIXED** | Settings file input `{"tabindex":"-1","hidden":"true","label":null}`; exactly one button named Import. |
| D7 | **RETURNED (fourth time)** | V2-13. |
| D11 | **STILL FIXED** | 18 taps (mobile) and 20 (desktop) across six screens at four offsets, zero self-closures; the new Your money card's 7% term tapped at y=702 of 812 holds its bubble. |
| D12 | **STILL FIXED** | Green in the regression spec. |

### Rulings on the tests someone else edited

- **`tests/unit/tester-v2-import-impact.test.ts`, four cases inverted: SOUND, and I accept it.**
  I re-ran all four and proved the reason, not just the rejection. The orphan-visit file fails
  with exactly one problem, `visits[14].placeId: expected to name a place in this file`. The
  two-nudge file fails with exactly one, `nudges[1].dayIndex: expected at most one nudge per
  day`. The unmodified base file is accepted, and the same two nudges on two different days are
  accepted. So neither case passes on an unrelated shape error. What the inversion lost is the
  measurement of the damage (the $149 to $0 delete), which is moot once the shape is refused.
  The one weakness, that two cases did not pin their reason, is covered by
  `tester-v3-cycle3.test.ts`. The protocol point stands: this was my file to invert.
- **`tests/e2e/tester-v2-product.spec.ts`, unused `openTray` import removed: ACCEPTED, partly
  unverifiable.** My cycle 2 files were uncommitted at `580b222` and first entered git in
  `f9e5db8` already edited, so git holds no pre-edit copy to diff against. The current file is
  what I wrote, `npm run typecheck` is clean, and the spec passes 11/11.
- **`tick.test.ts` `withSkippedJar`: NOT WEAKENED.** The R13 case now asserts the stronger
  inverse, no RoundUp and `jarCents === 0` after a tick. The R6 and R12.4 cases earn their jar
  through a real skip.
- **`store.test.ts` `fundJar`: NOT WEAKENED.** The goal-crossing case still asserts exactly one
  crossing. The ledger date moved to `currentDate` because a future date is now correctly refused.
- **`simulator.test.ts` 60-day case: WEAKENED, but tolerably.** `60 < purchases < 600` over 60
  days allows 1 to 10 a day and never asserts that a habit can form, which is what its comment
  says it protects. Criterion 4 (a habit within 14 days at seed 42) is still proven in
  `tester-v2-loop.test.ts`, which passes.
- **`contrast.test.ts` D20 repointed to `nudges-toggle`: SOUND.** Same switch, same guard.
- **`parity.test.ts` R2.1 floor removed: SOUND** for a retired rule. The legacy RoundUp read
  paths now have no fixture coverage at all, apart from my legacy cases below.
- **`validate.test.ts` `roundUpsPaused` case removed: consistent, but the validator now has no
  opinion on any unknown key.** The stray key passes through import into state and into every
  later export, and so does anything else (V2-17).
- All seven edited non-tester unit files pass: 289/289.

### New defects

#### V2-9. Critical. "Your money" double counts a jar move and grows money the user spent

- **Violates:** R10.4's own definition ("the money the user really has set aside"), theme
  3.3 (an honest rehearsal), CLAUDE.md section 1 ("shows what it knows"). **The coder built
  exactly the formula R10.4 prescribes, `keptSinceStartCents + ledgerTotal`. The plan is wrong,
  not only the code.**
- **Repro:** `npx playwright test tests/e2e/tester-v3-cycle3.spec.ts --project=mobile -g "doubles"`
  and `npx vitest run tests/unit/tester-v3-cycle3.test.ts -t "R10.4"`. By hand: onboard, demo
  make-habit, force-nudge, Skip ($4.35), open Summer Money, then Home > "I moved this into an
  investment" > Save, then Summer Money again.
- **Observed:** before the move "You have kept $4.35 so far."; after it, Home reads kept $4.35,
  moved $4.35, jar $0.00, and Summer reads **"You have kept $8.70 so far."**, grown to $196 at
  65. After "I spent it" instead, Summer still says "You have kept $4.35 so far." with jar $0
  and nothing moved.
- **Expected:** $4.35 after the move and $0.00 after spending it. `jarCents + ledgerTotal`
  gives both, and is still exactly "money set aside".
- **Why Critical:** a money figure on screen is silently wrong and contradicts two figures on
  Home computed from the same state. It gets worse with every jar move, which is the product's
  core action.

#### V2-10. Critical. Editing a bond or CD row erases its term and rate

- **Violates:** R16.1 and R16.2 ("rejected rather than dropped"); the ledger's own comment,
  "silently discarding what someone typed is how a ledger stops matching what they believe is
  in it". Data loss.
- **Cause:** `LedgerForm.submit` builds `{ date, amountCents, what, note, source }` with no term
  or rate, and 90bd963 changed `replaceEntry` to write `termMonths: draft.termMonths,
  yieldBps: draft.yieldBps` over the stored values. That commit's "fix" is what turned a
  harmless omission into a delete.
- **Repro:** `-g "note edit"` in the e2e file above, or `-t "note edit"` in the unit file. By
  hand: Invest > capture > Bonds or CDs, $1,000, 12 months, 4.5 > Save; the row shows "pays
  $45.00, so you would have $1,045.00". Tap Edit, change only the note, Save.
- **Observed:** `edit form fields=ledger-edit-amount,ledger-edit-date,ledger-edit-what,ledger-edit-note;
  before term=12 rate=450; after a note-only edit term=undefined rate=undefined ... maturity lines=0`.
  The edit form has no field to put them back; the only recovery is delete and re-capture.
- **Expected:** a note edit leaves term and rate untouched. The edit form offers both fields
  for a bond row, so an edit can change or clear them deliberately.

#### V2-11. Major. The capture silently drops or alters a term or rate it cannot use

- **Violates:** R16.2 ("a value that is present and out of range is rejected rather than
  dropped, on save"), R1.2 (rounding).
- **Repro:** `-g "R16.2"` in the e2e file.
- **Observed** (every row: Save enabled, saved, **no error shown**):
  ```
  term="12"   rate="4.5%"  -> stored termMonths=undefined yieldBps=undefined
  term="12"   rate="4,5"   -> stored undefined / undefined
  term="12"   rate="60"    -> stored undefined / undefined   (6000 bps, over the ceiling)
  term="700"  rate="4.5"   -> stored undefined / undefined   (over 600 months)
  term="12"   rate=""      -> stored undefined / undefined   (a valid term, thrown away)
  term="12.5" rate="4.5"   -> stored 13 / 450                (silently rounded; import refuses 12.5)
  term="12"   rate="1.005" -> stored 12 / 100, shown "1.00%" (1.005*100 = 100.49999999999999; R1.2 gives 101)
  term="600"  rate="50"    -> stored 600 / 5000              (correct)
  ```
  `rowMaturity` returns null for anything it cannot parse and `save` then spreads nothing, so
  the row saves as a bare amount. "4.5%" is how people type a rate.
- **Expected:** an unusable value blocks Save with `errTerm`/`errYield` (the strings exist), or
  is parsed ("4.5%" as 450). A valid term alone is kept, and the conversion to bps rounds per
  R1.2.

#### V2-12. Minor. An import puts a 30 year projection on an Individual stocks row

- **Violates:** R16.1 (only bonds or CDs carry a term and rate), R16.3 and R15.2 (a stock
  projection is exactly what R16 says it is not). Minor only because it needs a hand-edited file.
- **Repro:** `-g "Individual stocks"` in the e2e file (it imports through Settings).
- **Observed:** the Invest row "Individual stocks" reads "At 10.00% for 30 years, holding it to
  the end pays $16,449.40, so you would have $17,449.40." `Invest.tsx` renders the line for any
  entry carrying both keys, and the validator accepts both on any row. A ledger entry has no
  type field, so neither side can tell.

#### V2-13. Minor. The six R18 "Read more" links are 74x20 px (D7, fourth occurrence)

- **Violates:** plan 6.13 / 11.2, 44 point tap targets.
- **Repro:** `npx playwright test tests/e2e/tester-v2-regression.spec.ts -g "44 px"` (fails on
  mobile and desktop) or `-g "44 px tap targets"` in the v3 file.
- **Observed:** `/invest: invest-type-link-{indexFund,bondsCds,stocks,crypto,cash,other} "Read
  more" 74x20`, and nothing else on any screen fails.
- **Why it keeps coming back:** `tests/unit/tap-targets.test.ts` passes, because it scans for
  `min-h-[Npx]` classes and Button sizes, and an inline link has neither. Only a rendered audit
  catches this class, and none runs in the default suite.

#### V2-14. Minor. `lint:advice` layer 1 can be walked around, four ways

- **Violates:** R15.7 layer 1 ("must still fail on the original banned phrase list"; a number
  plus a comparison word "fails"). Minor because the probe below finds no shipped copy that
  exploits any of these today.
- **Repro:** `npx vitest run tests/unit/tester-v3-cycle3.test.ts -t "R15.7 layer 1"`
  (plants in `tests/fixtures/tester-v3-lint-plants.ts`, plus inline strings).
- **Observed, all pass the lint:**
  1. **Interpolations are invisible.** `stringLiteralsOf` skips `${...}` and everything inside
     it, so `` `Why ${formatDollars(a)} a week beats ${formatDollars(b)} later` `` (the
     original L7, written the way `strings.ts` writes every figure) and
     `` `Tip: ${on ? 'you should buy NVDA now, it will grow' : ''}` `` both pass. The controls
     on adjacent lines of the same file fail, so the harness is seeing the file.
  2. **The impersonal framing list switches rule 4 off for the whole sentence**, not only the
     imperative check the plan names: "Twenty dollars a week usually beats five hundred dollars
     later.", "Generally $20 a week beats $500 later." and "Most people your age put $50 a month
     into an index fund rather than a savings account." all pass.
  3. **Spelling variants of banned phrases:** "risk-free", "can’t lose" with a typographic
     apostrophe, "beats the market".
  4. Recorded, not filed, because the plan leaves them to layer 3: brand names ("Robinhood",
     "Apple") and a return written in words ("about seven percent a year") pass.
- **Held:** with every interpolation in `strings.ts` replaced by a number, no template other
  than the two exempted Summer lines trips rule 4. `COMPARISON_EXEMPT` is exact-sentence, so
  it fails loud, not open. Side note, errs safe: the bare token "CD" trips the ticker rule, so
  copy for the new Bonds or CDs type cannot say "a CD".

#### V2-15. Minor. Copy still says round-ups exist and that the jar fills by itself

- **Violates:** R6.1 ("A day passing no longer moves money at all"), R2.1 retired.
- **Repro:** `-t "round-up removal"` in the unit file.
- **Observed:** the auto-advance toast reads "3 days went by. Your jar kept working."; L5
  opens "You did not have to remember anything, and the jar kept working anyway."; the `jar`
  tooltip says "Where your round-ups, catches and skips collect."; L1's unlock hint reads
  "Unlocks with your first round-up." For a new user that last one names a trigger that can
  never happen, while L1 actually unlocks on the first skip.

#### V2-16. Minor. L1 and L3 are the same lesson, and the first skip unlocks both

- **Violates:** the confidence path's eight distinct lessons (8.8), R12.1 as retriggered.
- **Observed:** L1 "The coffee you did not buy" and L3 "The coffee you didn't buy", 72% body
  word overlap, both `unlockedDay=0` from one skip. The Lessons ring counts eight, and two of
  them are one lesson.

#### V2-17. Minor. An import carries coordinates and an address straight into the next export

- **Violates:** criterion 13 (no `/lat|lon|lng|coord|geo/` key in an export), R11.1, R11.5.
  Minor because it needs a hand-edited file.
- **Repro:** `-t "coordinate and an address"` in the unit file.
- **Observed:** `keys carried into the export: homeAddress,coords,lat,lng,lat,lon`. Only places
  and visits are rebuilt field by field; `profile`, `settings`, `clock`, events, ledger entries,
  nudges, `milestones` and `demo` are passed through whole. The stray `roundUpsPaused` survives
  by the same route (harmless on its own).

#### V2-18. Minor. The R16 ceilings allow a figure past 2^53, where cents stop being exact

- **Violates:** R1.1. **Repro:** `-t "2^53"` in the unit file, and the 320 px e2e case.
- **Observed:** $1,000,000 at 50.00% for 50 years is 63762150021404960 cents, which renders as
  "$637,621,500,214,049.60". The cents are float noise. Every input is inside the app's own
  ceilings. Negligible exposure; it is a statement about the ceilings, not the arithmetic.

#### V2-19. Minor (R15.7 layer 3 ruling). L4 and the `dip` tooltip promise that holding cannot lose

- **Violates:** R15.2 in spirit (a guarantee attached to a principle), and it contradicts E19's
  "including the day its warehouse burns down".
- **Text:** L4 "A dip only becomes a loss if you sell during it", repeated in the `dip` tooltip.
- **Why now, when I passed it in cycle 2:** this cycle added an "Individual stocks" holding type
  and three stock-depth pieces (E07, E17, E18). For a reader who holds one company, the sentence
  is false: a price that never comes back is a loss whether or not you sell. I am revising my
  own earlier ruling, and this is a human judgement for the layer 3 gate to confirm.

### Plan-vs-build gaps

**Deviated and documented** (in commit messages or code comments; none of the six commits
after `f9e5db8` added a section to `03-build-notes.md`, so no assumptions or weak points were
recorded for R10.4, R16, R17, R18 or the round-up removal):
- R10.1 now starts at the user's age (1b88ec0, `summer.ts`). The plan text still says "from 19".
- L1 retriggered from the first RoundUp to the first Skip (0ab8031). The plan's R12.1 still says RoundUp.
- The impersonal framing list exempts rule 4 rather than "the imperative check", and gained
  two phrases (build notes, f9e5db8). V2-14 is what that costs.
- The Summer Money comparison exemption: still flagged to the architect and still undecided.

**Deviated silently** (the plan says one thing, the build another, and nothing records it):
- R16.1 "only the bonds or CDs holding type offers them": after saving, nothing offers them at
  all, including to bonds (V2-10).
- R2.1's own text is not marked retired in place; R2.3 still says subscriptions "produce a
  purchase and a round-up"; R13 step 5 still applies round-ups.
- R12.5, R15.6, R15.7, 8.9, 9.8 and 11.5 still say sixteen Learn pieces; there are twenty.
- `rule-index.json` says R18.2 is "enforced by the absence of any state read". Nothing tested
  it until `tester-v3-cycle3.spec.ts` (it holds).
- CLAUDE.md calls habit detection "R4"; it is R3.2.

**The plan itself is wrong:**
- **R10.4's formula** double counts every jar-sourced ledger entry and counts money the user
  spent (V2-9). `jarCents + ledgerTotal` matches its own stated intent.
- **R16.2's ceilings** admit a result past exact integer range (V2-18).
- **R15.5 against the Summer screen:** still unresolved from cycle 2.
- **The theme says 18 to 25; `MAX_AGE` is 24**, so a 25 year old cannot give their age.

### R15.7 layer 3: my content verdict

I read all 20 Learn pieces, all 8 lessons, all 6 holding-type explainers and all 29 tooltips
against R15's two lists. **This is a tester read, not the gate.** The gate belongs to the
manager and has still not run.

- **No named security, brand, fund or brokerage; no return figure** other than `sevenPercent`,
  R15.2's own exception; **no second-person instruction** about the reader's money; no copy
  varies with the ledger. The Invest types card is byte-identical for an empty and a
  six-type ledger.
- **Filed:** V2-19 (L4 and `dip`); V2-15 and V2-16 (stale and duplicate lessons).
- **Passed, closest to the line, for the gate to look at first:** E06 ("set it and forget it",
  an endorsement framed as observation); E12 ("Plenty of people invest for forty years and
  never touch any of them", which gently steers away from crypto and commodities); the `cash`
  explainer ("where most people keep what they need soon").
- **Voice, not R15:** L8 ends "The main way people lose here is by stopping." That is a failure
  frame in a lesson meant to remove fear; theme 3.2 and section 5 lean against it.

### What held up

- **R10.1 at every age 18 to 24**, in the domain and on screen. The title reads "from N", both
  polylines have 65-N+1 points, and the headline reads "Starting at N means putting in $(30-N)x300
  more". Endpoints match an independent recomputation. Tampered ages (NaN, ±Infinity, -5, 17.4,
  25, 99, 1e9) clamp to 18 to 24 with no NaN. $1e13 inputs stay finite. The R10.4 empty state
  shows, with no chart, at zero.
- **Legacy round-up profiles.** A file built exactly as R2.1 used to write it imports; 12 old
  Activity lines render ("Pizza by the Slice, $9.66. Kept $0.34."); Home, the week figure, the
  habit card, the jar and Summer agree to the cent (910/910/435/910); every "kept" selector
  equals the KEPT_KINDS sum over its window; a legacy profile keeps ticking and creates no new
  round-up. **The author's "totals stay stable" claim is true.**
- **R17.** Best week equals a brute-force maximum over 500 random histories with duplicates, and
  never falls over 2,000 days of growth. The 1-and-7 / 1-and-8 edge holds. 10,000 skips take 0.4 ms.
  On screen, a quiet fortnight leaves "3 / 3 / $13.05" untouched. No shipped string and no
  rendered screen (Home, Activity, Places, Invest, Settings, Lessons, Learn, Summer) contains a
  streak, a miss, a shortfall, urgency, or "only $".
- **R18.** The card is identical for an empty and a full ledger, the six types render in fixed
  order, and all six links resolve to /learn/E11, E09, E07, E12, E15 and E01 with matching titles.
- **R15.6.** The disclosure is visible, unexpanded, on 32 of 32 surfaces: Learn, E01 to E20,
  Lessons, L1 to L8 (locked and unlocked), Invest and Settings.
- **R16 arithmetic and the import validator.** $1,000 at 4.50% for 12 months is exactly
  $1,045.00; the ceilings are inclusive; the validator rejects 601, 0, -12, 12.5, "12", null,
  5001, 4.5 and "450" by name. An export after a wipe has no null or undefined keys and still
  round-trips.
- No overflow at 320 px on Home with the habit card, Invest with the largest maturity line, the
  capture with a bond row, Summer with money, or E17 to E20.
- Typecheck is clean, both lints pass, and `rules:check` passes (30 rules, 111 cases).

### What I could not test

- **A real push subscription.** The V2-1 `ready` path, `hasServerRow` across a reload, and
  "turning off deletes the row" from the client.
- **iphone-pro and iphone-pro-max this cycle.** The machine could not carry four projects; I
  ran mobile and desktop only.
- **The full suites.** Not re-run: `npm test` (I ran 12 files), `npm run test:db` (3 files),
  the full e2e suite, `tooltip.spec.ts`'s 116-tap sweep, and axe in both themes. Gotcha 4 says
  any Tooltip or colour change needs those. None happened this cycle, but I did not confirm it.
- **Tampered persisted storage.** Rehydrate does not validate, so a hand-edited `profile.age:
  99` would reach the Summer select (reading 18 while the chart clamps to 24) and Home's "by 30"
  (raw age). That is from reading the code, not from a run. Unverified.
- A real iPhone, Safari, WebKit, Firefox, screen readers, the live cron firing, and eight
  concurrent sends against a real push service.

### Tester files added this cycle (uncommitted)

| file | cases | covers |
|---|---|---|
| `tests/unit/tester-v3-cycle3.test.ts` | 42 | Impact-file rulings, R16, R10.4, R10.1 all ages, R17, legacy round-ups, stale copy, the lint plants. **14 fail on purpose** (V2-9, V2-10, V2-12, V2-14 to V2-18). |
| `tests/fixtures/tester-v3-lint-plants.ts` | n/a | Plants the lint CLI is pointed at. Outside both lints' walk. |
| `tests/e2e/tester-v3-cycle3.spec.ts` | 13 | The same attacks through the UI. **5 fail on purpose** on mobile (V2-9, V2-10, V2-11, V2-12, V2-13). |
| `tests/db/tester-v3-backend.test.ts` | 3 | Five-way concurrency, throw after claim, 429 in a concurrent pair. All pass. |

```bash
npx vitest run tests/unit/tester-v3-cycle3.test.ts                          # 14 fail = defects above
npx vitest run --config vitest.db.config.ts tests/db/tester-v3-backend.test.ts
npx playwright test tests/e2e/tester-v3-cycle3.spec.ts --project=mobile     # 5 fail = defects above
npx playwright test tests/e2e/tester-v2-regression.spec.ts -g "44 px" --project=mobile --project=desktop  # fails = V2-13
```

Every intended failure names its finding in its assertion message and prints `AUDIT-RESULT` or
a labelled log line. When a defect is fixed its case goes green with no edit to the test.

### For the architect and the owner

1. **R10.4's formula (V2-9).** Decide what "put in" means, then fix the plan before the code.
   I recommend `jarCents + ledgerTotal`.
2. **Should a ledger entry carry a type?** Without one, no layer can keep a CD rate off a stock
   row (V2-12), and the edit form cannot know to offer term and rate (V2-10).
3. **R15.5 against the Summer screen**, open since cycle 2.
4. **R15.7 layer 3 still has not run.** The plan makes it a condition of the next deploy, and
   the site is already serving this content.

## Cycle 4, 2026-09-11: re-verification of V2-9 to V2-19 (b143bdf, 563fbb1)

Machine: darwin 25.6, Node 24, Playwright Chromium, much quieter than cycle 3 (load average
about 2.7; vite built in 1.1 s). Scope: `01a134b..563fbb1`, i.e. everything b143bdf and
563fbb1 changed, re-run against the code and the running app rather than the commit message.
**Production serves this code.** `npm run build` on HEAD emits `assets/index-C7if6nyQ.js`, the
exact bundle `sparechangeinvesting.vercel.app` serves (fetched read only), and that bundle
contains both the fixes and the defects below.

### Verdict

**SHIP WITH RISK.** All eleven cycle 3 defects are fixed in the code and on screen, and I found
nothing Critical or Major. The fixes introduced or exposed six Minor defects (V2-20 to V2-25),
three of them in what the fixes touched. The one I would fix before anything else is V2-20: a
capture batch with one over-cap row saves the other rows, then saves them again on every retry,
silently inflating Invest's total and Your money. The second risk is process, not code:
**none of the new code has a committed test.** The committed unit count is 700 before and after
b143bdf, and `rule-index.json` names my uncommitted files as the coverage for R16.5, R16.6 and
R16.7.

**New defects: 0 Critical, 0 Major, 6 Minor.**

### V2-9 to V2-19, re-verified

| id | ruling | evidence, this pass |
|---|---|---|
| V2-9 | **FIXED, regressed its copy (V2-22)** | Unit: `putAsideCents` is 435 after a $4.35 skip, still 435 after moving it, 0 after "I spent it". E2e mobile: after the move Home reads kept $4.35, moved $4.35, jar $0.00 and Summer "You have kept $4.35 so far." The words around the figure were not updated (V2-22). |
| V2-10 | **FIXED, opened V2-23** | E2e: the edit form now has `ledger-edit-term` and `ledger-edit-rate`, prefilled "12" and "4.50". A note-only edit keeps 12/450 and the $1,045.00 line. "about 4" is refused with a message and nothing changes. Emptying both removes both keys (no `null` in storage), and 24 months at 5 re-prices to $1,102.50. Unit: `undefined` keeps, a number sets, `null` removes; a pre-R16.5 bond row is stamped `bondsCds` on its first edit and keeps its rate. The same form now lets a bond row be relabelled a stock (V2-23). |
| V2-11 | **FIXED** | E2e, all ten cases: "4.5%" and "4,5" store 450; "12" with no rate stores the term alone; "1.005" stores 101; 25 stores 2500. "60", "700", "12.5", "50" and "25.01" disable Save and show the row error. Unit: 37 rate cases, including the float traps 2.675 → 268, 1.0049999 → 100 and 1.9951 → 200, plus 25.005 refused. Every whole percent from 1 to 25, and every 7th basis point up to 2500, parses exactly. |
| V2-12 | **FIXED on import and on Invest; symptom reachable again through the edit form (V2-23)** | E2e: the stock-row file is refused and the ledger is unchanged. The same row labelled Bonds or CDs with `holdingType` imports and renders $17,449.40, so the refusal is caused by the label alone. The refusal message is false (V2-21). |
| V2-13 | **FIXED** | Rendered at 375 px: all six `invest-type-link-*` are 74x44, and every other control this cycle added is at least 44 tall. |
| V2-14 | **FIXED for every walk-around I filed** | The interpolated L7, the interpolated advice, the three "usually / generally / most people" sentences, "risk-free", "can’t lose" and "beats the market" are all flagged now. An AST cross-check of `src/` (TypeScript's parser against the lint's own scanner) finds **0 of 2,825** prose-like literals unseen. No false positives on shipped copy: `lint:advice ok (89 files)`. New holes are recorded below, not filed, because none has exposure today. |
| V2-15 | **FIXED as filed; a fifth stale line remains (V2-24)** | The toast, L5, the jar tooltip and L1's hint are clean. Home's empty-jar line still names round-ups. My cycle 3 test missed it too. |
| V2-16 | **FIXED** | Unit, through the real tick: L1 "How it spotted your usual stop" unlocks on the day the first habit forms, L3 stays locked with 0 skips, and a later skip does not move L1. E2e: `L1 unlockedDay=1, L3=null, skips=0`. Recorded: the demo make-habit and an import leave L1 locked until the next state change (one tick). The plan text was not updated (gaps below). |
| V2-17 | **FIXED, and `pick()` drops nothing the app needs** | The coordinate and address keys no longer reach an export. A rich real profile survives export, import and export again **with zero differences**, habits included: every event kind the app writes, a jar move, "I spent it", a bond row, a term-only bond row, other and crypto rows, read lessons, read Learn, dark theme, muted places, age, summer override, all five flags. The same profile plus 120 legacy RoundUp events keeps every RoundUp field; the only key dropped is `settings.roundUpsPaused`. |
| V2-18 | **FIXED, opened V2-21** | $1,000,000 at 25% for 50 years is 7,006,492,321,624 cents, a safe integer, rendered "$70,064,923,216.24" with no overflow at 320 px. Rows saved at 25% to 50% under the old ceiling are now refused on the way back in (V2-21). |
| V2-19 | **FIXED** | L4: "A single company is different: it can fall and never recover". `dip`: "Some come back and some do not". Layer 3 is the owner's read, not mine. |

### The four disagreements, resolved

1. **`tester-v3-cycle3.test.ts`, the two R10.4 cases: I concede, the test was wrong.** They
   recomputed the screen's formula inline instead of calling what the screen calls, so they kept
   testing a retired formula after the owner changed it. They now call `putAsideCents`. A new
   control pins that `SummerMoney.tsx` computes `putInCents = putAsideCents(state)` and never
   calls `keptSinceStartCents`, so the test and the screen cannot drift apart again. Both cases
   are now green regression tests, retitled "V2-9 regression".
2. **E2e capture case "600 at 50%": I concede.** The 2500 bps ceiling was my own V2-18
   recommendation. The case now asserts 50% is refused. I added 25% stored as exactly 2500 and
   25.01 refused. I also tightened every refusal in the table to require a visible error
   (`saved || !error` is a violation). The old `saved && !error` would have passed a Save that
   was silently disabled with no reason given. The error is detected under both `invest-capture-error`
   and b143bdf's new `invest-capture-cd-error`. Green.
3. **E2e 320 px case: I concede.** It captures at 25%, the largest rate allowed, and checks the
   largest possible line. Green, no overflow.
4. **E2e stock-row import: I agree that the refusal is the fix, and I am filing the message.** The
   test now asserts that the file is refused, the ledger is unchanged, and no maturity line
   exists. A control half imports the same row as a bond and sees it render, which proves why the
   file was refused. Green. But the user is told "That file is not a Spare Change export.
   Nothing changed." `Settings.tsx` maps every refusal except a v1 file to `importBad`, so the
   same sentence greets the app's own backup when the app refuses it (V2-21).

### New defects

#### V2-20. Minor. A capture batch with one row over the $1,000,000 cap saves the other rows, then saves them again on every retry

- **What breaks:** the capture writes rows one at a time and stops at the first failure, so the
  rows before it are already in the ledger. The error sends the user back to Save, which writes
  them again.
- **Repro:** `npx playwright test tests/e2e/tester-v4-cycle4.spec.ts --project=mobile -g "over the"`.
  By hand: Invest > capture, tap Broad index fund and enter 10, tap Bonds or CDs and enter
  2000000, then Save. Save is enabled.
- **Observed:** error "Enter an amount over zero." for a $2,000,000 row. The ledger size after
  each of three taps is `1,2,3`, i.e. `["Broad index fund 1000" x3]`. No toast; the user is not
  told anything was saved.
- **Expected:** Save refuses up front (`rowReady` checks `LEDGER_MAX_AMOUNT_CENTS`), or every row
  is validated before any is written. A failed save writes nothing, and the message is
  `errAmountTooLarge`.
- **Violates:** the screen's own contract ("nothing is written that the user did not fill in"),
  plan 8.7a (Save disabled until every row is valid), and R7.2's total. The duplicate rows now
  also inflate R10.4 Your money, because it adds `ledgerTotal`.
- **Cause:** `InvestCapture.save` calls `addLedgerEntry` per row (plan 8.7a prescribes that) and
  returns on the first `!ok`. `rowReady` never checks the cap, and the error branch maps every
  failure other than a long label to `errAmount`. The loop dates from 76c4737; b143bdf edited it.
- **Why Minor:** it needs one row over $1,000,000. The realistic path is one extra zero, seeing
  the error, correcting it, and saving, which leaves exactly one silent duplicate.

#### V2-21. Minor. Rows the previous build saved legally make the app refuse its own backup, and tell the user it is not an export

- **What breaks:** R16.2 and R16.5 tightened validation with no migration. `store.ts` rehydrates
  with `migrate: (persisted) => persisted`, so old rows load, but anything that round-trips
  through validation now fails.
- **Repro:** unit `npx vitest run tests/unit/tester-v4-cycle4.test.ts -t "previous build saved"`;
  e2e `-g "30% under the old ceiling"`. The e2e plants a row exactly as 90bd963's capture wrote
  it (Bonds or CDs, $1,000, 12 months, `yieldBps: 3000`, no `holdingType`) into IndexedDB.
- **Observed** (mobile): the row's maturity line is gone, with no message (`maturityOf` now
  returns null above 2500). Editing only its note is refused with "Give the rate as a number, up
  to 25%." for a field the user never touched, and the note is not saved. Settings > Export
  downloads a file containing the row; importing that file gives **"That file is not a Spare
  Change export. Nothing changed."** Unit: the same holds for a stock row carrying a term, which
  the previous validator accepted (V2-12) — the app's own export is refused with
  `ledger[0].termMonths: only a bonds or CDs row may carry a term or a rate`.
- **Expected:** a file the app wrote imports back; or, if the architect decides these rows must
  go, they are migrated on load with the user told what changed. Either way, the refusal of a
  file that is an export must not say it is not one.
- **Why Minor:** exposure is small. It needs a 25% to 50% rate entered on production between
  90bd963 (2026-09-09) and b143bdf, or a hand-edited import in that window. For anyone it hits,
  the backup is unrestorable without hand-editing the file.

#### V2-22. Minor. After V2-9, the Your money card's words describe the old figure: "Your first skip starts this line" to someone who has skipped, and "You have kept" for money Home does not call kept

- **Repro:** unit `-t "the words around it"`; e2e `-g "first skip starts"` and `-g "504.35"`.
- **Observed:** one $4.35 skip, then "I spent it": Home reads kept $4.35, habit skips 1, jar $0.00,
  while Summer reads "Nothing in here yet. **Your first skip starts this line**, and it really does
  not have to be much." One skip plus a manual $500 "Retirement account": Home reads "Kept this
  summer" $4.35, while Summer reads "**You have kept $504.35 so far.**" The note underneath says
  "This only counts what you kept and what you told us you moved", but after "I spent it" what
  you kept is exactly what it does not count.
- **Violates:** R10.4 ("the money the user really has set aside"; the copy calls it kept),
  CLAUDE.md section 1 ("shows what it knows"), theme 3.3. Two screens now use "kept" for two
  different figures computed from the same state.
- **Fix is copy, not the formula:** `yourMoneyPutIn`, `yourMoneyEmpty` and `yourMoneyNote` were
  written for `keptSinceStart + ledger` and not revisited when the owner changed the figure.
- **Why Minor:** the numbers are right and the words are wrong. It is the most frequently hit
  item in this report, since "I spent it" is one of the two jar actions.

#### V2-23. Minor. Relabelling a bond row "Individual stock" in the edit form keeps a 30 year projection on a row that reads Individual stock

- **Repro:** e2e `-g "relabelling"`; unit `-t "relabelling a bond row"`. By hand: capture Bonds or
  CDs, $1,000, 360 months, 10%, then Edit and set What to "Individual stock" (one of the form's
  own suggestions), then Save.
- **Observed:** row "Individual stock" with "At 10.00% for 30 years, holding it to the end pays
  $16,449.40, so you would have $17,449.40."
- **Violates:** R16.3's distinction (a stock number is a guess about markets), and it is exactly
  V2-12's symptom, which now needs no hand-edited file. Before b143bdf this path erased the rate
  (V2-10), so the V2-10 fix opened it.
- **Cause, and why it is also a plan question:** R16.5 lets `holdingType` decide alone, and the
  edit form carries the type forward while leaving `what` free. The plan permits this. The
  architect should decide whether the type or the label wins, or whether a bond row's label is
  fixed. Filed Minor because the user typed both the rate and the new label.

#### V2-24. Minor. A new user's empty jar still says round-ups land there (V2-15, a fifth line)

- **Repro:** e2e `-g "empty jar says round-ups"`. Onboard, look at Home.
- **Observed:** jar $0.00 with "Nothing in the jar yet. **Round-ups**, catches and skips all land
  here." (`S.home.jarEmpty`, `strings.ts:145`), in the live bundle. This is on every new user's
  first Home screen.
- **Violates:** R6.1 and R2.1 (retired), and CLAUDE.md section 1 ("It does not do round-ups").
  My cycle 3 V2-15 test checked the four strings I listed and missed this one; the fix did the same.

#### V2-25. Minor (domain API only, no UI path found). `updateLedgerEntry` can put a term on a row stored as stocks, leaving a state the app's own import refuses

- **Repro:** unit `-t "domain API only"`.
- **Observed:** a row stored `holdingType: 'stocks'` plus the draft `{ what: 'Bonds or CDs',
  termMonths: 360, yieldBps: 1000 }` (no type) gives `ok: true`. The stored row is then
  `holdingType=stocks what="Bonds or CDs" term=360 rate=1000`, and its export is refused:
  `ledger[0].termMonths: only a bonds or CDs row may carry a term or a rate`.
- **Cause:** `validateDraft` judges bond-ness from the draft alone, while `applyEdit` keeps the
  stored type. The check needs the merged entry.
- **Why Minor:** `LedgerForm` only sends a term or a rate for a row that was a bond row when the
  form opened, and Invest hides the line (`isBondRow` is false), so nothing wrong renders. The
  domain layer, which CLAUDE.md calls the crown jewel, accepts a state its own validator rejects.

### Plan-vs-build gaps

- **None of the new code has a committed test.** `parseRateBps`, `parseTermMonths`, `isBondRow`,
  `putAsideCents`, `notBond`, `applyEdit`'s `null`/`undefined` semantics and `pick()` are
  referenced by no committed test (grep over `tests/`, excluding `tester-v3-*` and
  `tester-v4-*`). b143bdf touched one committed test (`tick.test.ts`, 3 lines), and the
  committed unit count is 700 before and after. `rule-index.json` says R16.5 is "Covered by
  ledger and validate tests and the tester V2-12 case", R16.6 "by the tester V2-10 unit and e2e
  cases", and R16.7 "by maturity.test.ts and the tester V2-11 e2e case". No committed ledger,
  validate or maturity test mentions either parser, `notBond` or `holdingType`, and the tester
  cases are uncommitted. `rules:check` counts that prose, so it stays green. **If my files are
  not committed, R16.5 to R16.7 have zero coverage.** CLAUDE.md section 5 asks for a fixture
  case per behavior change. Owner's call: commit the tester files, or have the coder write
  committed equivalents.
- **R12.1, the rule authority, still says "L1 on the first RoundUp."** The code and the fixes log
  say first habit. CLAUDE.md section 5 says change the rule, not just the code.
- **Plan 8.7a still says "No new ledger field"**, which R16.5's `holdingType` contradicts, and
  still lists a "target date fund" chip. The app has Bonds or CDs instead.
- **R16.2 changed a ceiling with no rule for values already stored** (V2-21), and **R16.5 lets
  the type and the label disagree** (V2-23). Both are architect decisions.
- **Still open from cycle 3:** 22 mentions of "sixteen" Learn pieces in the plan (there are
  twenty); R10.1 still says "from 19"; CLAUDE.md still calls habit detection R4 (it is R3.2).
- **Pre-existing, found by the coverage scan:** seven JSX text nodes are inline UI copy, against
  CLAUDE.md section 7. They are `LessonVisual.tsx` ("paycheck", "kept", "you're here", "Put in
  early", "Later"), `ProgressRing.tsx` ("of") and `Toast.tsx` ("OK"). lint-advice cannot see JSX
  text at all: a scratch plant `<p>Honestly, you should buy NVDA now, it will grow.</p>` passes
  it. None of the seven is advice today.

### Recorded, not filed (lint-advice holes with no exposure today)

All confirmed by running them; none exists in shipped copy.
- A banned phrase with a no-break space, a soft hyphen or a zero-width space inside it passes, and
  so does "cannot lose". U+2011 and U+02BC are caught.
- A sentence split across `+` passes: `'Putting away $20 a week ' + 'beats waiting…'`, and
  `'…will ' + 'grow…'`. `strings.ts` has no `+` concatenation today.
- **One unbalanced brace inside an interpolation hides the rest of the file.**
  `` `${x ? '{' : ''} …` `` throws the depth count off, and a control plant on the next line,
  "We recommend this fund for you.", then passes. The AST scan finds 0 unbalanced interpolations
  and 0 regex literals containing a quote in `src/`, so nothing is hidden today.

### Unverified concerns

- **`pick()` is safe today but fragile.** profile, settings, clock, milestones and demo are
  whitelisted by `Object.keys(initialAppState().x)`, so any future optional field that
  `initialAppState` omits would be silently dropped on import. From reading the code; no such
  field exists now.
- **The capture's row error is `role="alert"` and shows mid-typing.** "4." and ".5" are invalid,
  so typing "4.5" announces an error at the second keystroke. I did not run a screen reader.

### What held up

- The rich-profile round trip and the legacy RoundUp round trip (above): nothing dropped, added
  or changed, apart from the retired `roundUpsPaused`.
- All 43 cycle 3 unit cases pass, with the 14 former DEFECT cases green. The four reconciled or
  retitled e2e cases, and all 13 cycle 3 e2e cases, pass on mobile.
- R16.7 parsing (above). A term with no rate saves alone and renders no line. The capture
  preview matches what is stored.
- L1 through the real tick. R17 best week, R18 card identity, and R15.6 disclosure on all 32
  surfaces, all still green (cycle 3 spec).
- Typecheck, lint:copy (104 files), lint:advice (89 files), rules:check (30 rules, 111 cases),
  build and the bundle secret check are all clean.

### Gate counts, observed this pass

| gate | result |
|---|---|
| `npm test` | 35 files, **814 tests: 809 passed, 5 failed.** 700 committed, all pass. `tester-v3-cycle3` 43/43. `tester-v4-cycle4` 66 of 71; the 5 failures are V2-21, V2-22 (two cases), V2-23 and V2-25, failing on purpose. |
| `npm run typecheck` | clean, 7 tester files included (`--listFilesOnly`) |
| `npm run build` | clean: lint:copy ok (104), lint:advice ok (89), rules:check ok (30 rules, 111 cases), vite build, check-bundle-secrets ok |
| `npm run test:db` | real Neon, isolated schema: **7 files, 96 passed** (93 committed + 3 `tester-v3-backend`), 141 s |
| e2e, 11 committed specs, 4 projects, retries 1 | **348 passed, 28 skipped**, no `failed` or `flaky` line in Playwright's summary (11.3 min). Read from the count lines, not the tail (gotcha 9). This includes `tester-v2-regression`'s "44 px" case, which failed in cycle 3 (V2-13) and now passes on all four projects. |
| e2e, tester specs, mobile, retries 0 | 21 tests: **15 passed, 6 failed**, the 6 being V2-20, V2-21, V2-22 (two cases), V2-23 and V2-24 |
| e2e, tester specs, desktop, retries 0 | 21 tests: **15 passed, 6 failed**, the same six DEFECT cases as on mobile, with identical audit lines (at 1280 px every new control is 44 tall) |

### What I could not test

- A real push subscription, a real iPhone, Safari or WebKit, Firefox, screen readers, and the
  cron firing on its real schedule. None of these was touched by this cycle, and none is covered here.
- My own two specs on iphone-pro and iphone-pro-max. The committed suite ran on all four projects.
- The owner's R15.7 layer 3 read, which is theirs by decision.

### Tester files this cycle (uncommitted)

| file | cases | covers |
|---|---|---|
| `tests/unit/tester-v3-cycle3.test.ts` | 43 | Reconciled (disagreement 1); one-past-ceiling moved to `MAX_YIELD_BPS + 1`. All green. |
| `tests/e2e/tester-v3-cycle3.spec.ts` | 13 | Reconciled (disagreements 2, 3, 4). All green on mobile. |
| `tests/unit/tester-v4-cycle4.test.ts` | 71 | Parsers, isBondRow, applyEdit, round trips, legacy data, putAsideCents copy, L1, lint. 5 fail on purpose. |
| `tests/e2e/tester-v4-cycle4.spec.ts` | 8 | Edit form, relabel, capture batch, copy, old saved data, L1. 6 fail on purpose. |
| `tests/fixtures/tester-v4-lint-plants.ts` | n/a | Concatenation and brace plants for the lint CLI. |

```bash
npx vitest run tests/unit/tester-v3-cycle3.test.ts tests/unit/tester-v4-cycle4.test.ts   # 5 fail = V2-21, V2-22 x2, V2-23, V2-25
npx playwright test tests/e2e/tester-v3-cycle3.spec.ts tests/e2e/tester-v4-cycle4.spec.ts --project=mobile --retries=0   # 6 fail = V2-20 to V2-24
```

## Cycle 5, 2026-09-11: re-verification of V2-20 to V2-25 and the toast (e7bb37f)

Machine: darwin 25.6, Node 24, Playwright Chromium (headless shell 1243), one worker. Scope:
`57c7330..e7bb37f`, re-run against the code and the running app, not the commit message, and
walked through the build notes' "What the tester should re-check" list item by item.

### Verdict

**SHIP WITH RISK.** The V2-20, V2-21, V2-22, V2-24 and V2-25 fixes and the toast fix hold in the
code and on screen. V2-23 holds in two of its three forms. The load-path tidy the owner asked for
works through IndexedDB and through the mirror, and says so once. But the fixes opened one Major
defect, and it is live: production serves `assets/index-sX1V4cLs.js`, the exact bundle
`npm run build` emits at e7bb37f. **V2-26:** the jar move form on Home shows the new type chips and
a length and a rate, validates them, and then saves none of them. Moving the jar is how kept money
leaves it, so V2-23's decision is silently undone on the product's main path. The fix is one call
site. The second risk is V2-27. The new migrate added a way to throw in front of zustand's
unguarded write, and any throw there turns into a total wipe of the user's data. I found no trigger
a real build can produce, which is why it is Minor, but the consequence is the worst in this report.

**New defects: 0 Critical, 1 Major, 3 Minor.**

### V2-20 to V2-25 and the toast, re-verified

| id | ruling | evidence, this pass |
|---|---|---|
| V2-20 | **FIXED; a sibling remains (V2-28)** | E2e: Broad index fund $10 plus Bonds or CDs $2,000,000 disables Save and shows `S.invest.errAmountTooLarge` on that row; nothing is written (my cycle 4 case, now green, and the coder's v2-loop case). A double tap on Save writes one row. Code: `save` runs `validateDraft` on every row before any `addLedgerEntry`, with the same current date `addLedgerEntry` uses, so the pre-check and the write cannot disagree; the partial-write branch is unreachable as claimed. The build notes' re-check item, a Something else label that is too long, never reaches that path: `rowReady` disables Save first and nothing says why (V2-28). |
| V2-21 | **FIXED on both load paths and on import; opened V2-27** | Load, IndexedDB: a version 1 envelope holding a 30% bond row, a stock row with 360 months at 10% and a good untyped bond row loads with only the 30% rate and the stock row's term and rate removed; amounts, names, dates and every other part of the envelope are byte-identical (unit deep-equal); the envelope is rewritten at version 2; the toast reads "2 entries had a length or a rate..." and, at 320 px, sits at x=16, width 288; a second load says nothing; the old symptom is gone (the note edit that was refused now saves). Load, localStorage mirror: a version 1 mirror newer than IndexedDB wins, is tidied, the notice says "One entry...", and both IndexedDB and the mirror end at version 2. Import: the stock-row file imports with both fields removed, the notice shows once, no line renders, and a second load is silent; a string term is refused with "That looks like a Spare Change export, but part of it did not pass the app's checks... What it found: ledger[0].termMonths: expected a number of months". 4,284 import variants (17 numeric extremes including -0, 1e21, 2^53, Number.MAX_VALUE and JSON `1e400`, 7 type paths, 2 amounts) produce 0 absurd lines, remove 0 usable values, and leave 0 terms or rates on a non-bond row. A throw inside the new migrate wipes the profile (V2-27). |
| V2-22 | **FIXED** | "You have $4.35 set aside right now."; after "I spent it", "Nothing set aside right now. The next skip starts this line..."; the note names the jar. My two cycle 4 cases are green on screen and in unit. |
| V2-23 | **FIXED in the add and edit forms; NOT in the jar move form (V2-26)** | Edit: a renamed CD keeps its line and Invest shows "Bonds or CDs" beside "Individual stock" (by decision); picking Individual stocks clears the term and rate keys. Add: the name follows a chip only while empty or still the previous chip's label (sequence Bonds or CDs, Crypto, typed "My coins" kept, Individual stocks, "" for Something else, Cash savings, Bonds or CDs), and the picked type, 12 months and 450 bps are stored. Legacy row "Bonds or CDs" with no stored type, planted as version 1: no notice (nothing to tidy), opens with the Bonds or CDs chip pressed, prefilled "12" and "4.50", a note edit keeps the rate, the row is stamped `bondsCds`, the line stays, and no type pill shows. The jar move form shows the same chips, length and rate and throws all of them away (V2-26). At 320 px all six chips are at least 44 x 44 and on screen in all three forms; axe is clean in both themes with a chip picked in each form. |
| V2-24 | **FIXED** | "Nothing in the jar right now. Skips and paycheck catches land here." Both are true: `takeSkip` and `acceptCatch` (`addToJar`) are the only jar credits. |
| V2-25 | **FIXED** | Unit: a stocks row given a draft labelled "Bonds or CDs" with a term is refused `notBond`; a bond row can still change its term. |
| Toast | **FIXED** | At 320 px the long tidy notice is fully on screen (x=16, width 288, height 124). The coder's v2-loop case checks the position at every viewport. |

### New defects

#### V2-26. Major. The jar move form offers the six type chips and a length and a rate, and the save throws all of them away

- **What breaks:** `Home.tsx:319` passes only `{ date, what, note }` to `moveJarToLedger`, so the
  `holdingType`, `termMonths` and `yieldBps` that `LedgerForm` puts in the draft never reach the
  store. The form validates the length and rate, accepts them, closes, and stores neither.
- **Repro:** `npx playwright test tests/e2e/tester-v5-cycle5.spec.ts --project=mobile -g "jar move form on Home"`.
  By hand: make a habit, skip once (jar $4.35), Home > "I moved this into an investment", tap
  Bonds or CDs (the name fills "Bonds or CDs" and Length and Rate appear), enter 12 and 4.5, Save.
  Next day, skip again, move the jar, tap Individual stocks, type "My brokerage", Save.
- **Observed:** stored `{"id":"led:1","amountCents":435,"what":"Bonds or CDs","source":"jar"}` with no
  `holdingType`, no `termMonths`, no `yieldBps`; Invest shows no maturity line. The second move is
  stored `{"what":"My brokerage","source":"jar"}` with no `holdingType`, so Invest shows no type
  beside it and its edit form opens with no chip picked.
- **Expected:** the stored row carries `holdingType: "bondsCds", termMonths: 12, yieldBps: 450`, and
  `holdingType: "stocks"` on the second; Invest shows the line and the "Individual stocks" pill.
- **Violates:** R16.5 ("The type is picked from the six types in the ledger form"), R6.4 (the jar
  move "Opens the ledger form"), R16.7's principle that a typed value is refused or kept, never
  dropped, and the build notes' own claim that "The type chips appear in all three ledger forms
  (add, edit, and the jar move on Home) ... so a new entry can carry a type from the start."
- **Why Major, not Critical:** amount, date, name and source are stored correctly and no money is
  wrong. What is lost silently is what the user typed about it, on the one path by which kept
  money leaves the jar. `moveJarToLedger` in the domain accepts all three fields; the fix is the
  call site. The committed v2-loop V2-23 case covers only the edit form, which is why no gate saw it.

#### V2-27. Minor (no realistic trigger found; the consequence is total loss). A throw inside the new persist migrate boots the app as a brand new user, and the first state change overwrites everything stored

- **What breaks:** `store.ts` `migrate` calls `tidyLedger`, which calls `isBondRow(e)` on every row and
  reads `e.what.trim()` on rows with no type. A row it cannot read throws. zustand 4.5.7 catches
  the throw, `onRehydrateStorage` still sets `hydrated`, the store keeps its initial state, and
  zustand's `setState` wrapper persists on every change with no hydration guard.
- **Repro:** unit `npx vitest run tests/unit/tester-v5-cycle5.test.ts -t "migrate cannot read"`; e2e
  `-g "migrate cannot read"`. Plant a version 1 envelope whose ledger holds one row without `what`.
- **Observed:** unit: the same envelope at version 2 loads "Sam"; at version 1 the app boots as
  `{name:"", onboarded:false}`, and one theme tap stores `events 0, ledger 0, dayIndex 0` over
  `events 10, ledger 1, dayIndex 3`. E2e: boots to Welcome; after the first Welcome step storage
  holds `onboarded:false, events 0, visits 0, dayIndex 0` where it held `onboarded:true, events 10,
  visits 9, dayIndex 3`. Nothing is logged.
- **Expected:** the migrate never throws (a row it cannot read is left as it is), or a failed
  hydration never lets a write through.
- **Why Minor:** no build writes a row without a string `what`, so the trigger is corruption or a
  hand edit. Before e7bb37f the migrate was the identity and the same envelope loaded. The new
  migrate added a throw site in front of an unguarded write, and the cost of any future throw
  there is every byte of the user's data. A try/catch in `migrate` that returns `p` closes it.

#### V2-28. Minor (pre-existing; the V2-20 fix did not reach it). A Something else label over 60 characters disables Save and nothing on screen says why

- **Repro:** e2e `-g "one character too long"`. Capture: Broad index fund $10, Something else $5,
  label of 61 characters (the input's `maxLength` is 61, so it types).
- **Observed:** `saveEnabled=false`, `role="alert"` elements on screen: none, ledger 0.
- **Expected:** the row says why, as V2-20 now does for an amount over the cap
  (`S.capture.errLabelTooLong` exists and is only reachable from a Save that cannot be pressed).
- **Violates:** the capture's own contract that a row that is not ready "blocks the save rather than
  being silently dropped", with a reason; the build notes' re-check item, which says this case
  "takes the same check-first path". It never reaches `save`.

#### V2-29. Minor. An import refusal quotes the validator's internal problem string to the user, including text taken from the file

- **Repro:** unit `-t "refusal message for each kind"`; e2e `-g "string term is refused"`.
- **Observed:** "... What it found: ledger[0].termMonths: expected a number of months". For a file
  with an unknown Learn key, the key itself: "... What it found: learn.Buy NVDA now, it will double
  by spring: unknown learn id".
- **Violates:** CLAUDE.md section 7 (all UI copy lives in `strings.ts`): this sentence tail comes
  from `validate.ts` and from the file, so `lint:copy` and `lint:advice` never see it; the voice
  rule (a zero-based array path is not how a friend a year ahead talks). The advice text in the
  example is shown inside the app's own sentence.
- **Why Minor:** it needs a damaged or hand-edited file, and it is the user's own file.

### The conflicting cases, reconciled

Each case below encoded behavior the owner changed on purpose on 2026-09-11. None of them is a
defect in the new code, so I rewrote each one to the decision, kept the inputs, and marked the
rewrite inline. I am not arguing against either decision. The one defect around the V2-23 decision
is in how it was built (V2-26), not in the decision itself.

1. **`tester-v3-cycle3.test.ts`, "import rejects every present-but-unusable term or rate".** It
   encoded R16.2's old import rule. Now "R16.8: import removes every present number the rules cannot
   use and keeps the row, still refuses every non-number, and accepts the ceilings untouched". The
   same 12 inputs: the 8 numbers (601, 0, -12, 12.5 months; 2501, 5001, 0, 4.5 bps) import with
   `tidied 1`. The field is removed, and amount, name, date and the other field are unchanged. The
   4 non-numbers ("12", null, "450", null) are refused with the field's path. The ceilings import
   with `tidied 0`. Green.
2. **`tester-v3-cycle3.test.ts`, "DEFECT (import only): a CD rate and term on an Individual stocks
   row".** Now "V2-12 regression under R16.8". The file imports, `tidied 1`, and the term and rate
   are gone, so no line can render. The symptom V2-12 was about stays impossible. Green.
3. **`tester-v3-cycle3.test.ts`, control "You have kept $4.35 so far."** It pinned the copy my own
   V2-22 asked to change. Now it expects "You have $4.35 set aside right now." Green.
4. **`tester-v4-cycle4.test.ts`, the V2-23 relabel DEFECT.** It is now the decision: the renamed CD
   keeps its $17,449.40 figure, and Invest's pill condition holds ("Bonds or CDs" beside "Individual
   stock"). The form's draft for picking Individual stocks (`holdingType: "stocks"`, both `null`)
   removes both keys and the line. I accept the decision: the pill means the row can no longer pass
   for a stock, which was the harm V2-23 described. Green.
5. **`tester-v3-cycle3.spec.ts`, the stock-row import.** This is the e2e twin of 1 and 2. The file
   imports, "One entry had a length or a rate..." shows, the row is kept without either field, and
   no line renders. The bond control is unchanged ($17,449.40). Green.
6. **`tester-v3-cycle3.spec.ts`, "DEFECT R10.4: moving the jar into an investment doubles Your
   money".** This one was not on the coordinator's list. It asserted the old "You have kept"
   sentence. The figure it guards (V2-9) is unchanged: $4.35 before and after the move. It now
   expects V2-22's copy and is retitled "V2-9 regression". Green on mobile and desktop.
7. **`tester-v4-cycle4.spec.ts`, the relabel DEFECT and the 30% plant.** The relabel test now asserts
   the decision: the line stays, and "Bonds or CDs" shows beside "Individual stock". The 30% test
   needed a correction to my harness, not to the assertion. My cycle 4 `plant()` copied the current
   envelope's persist version, and since e7bb37f that is 2. A version 2 envelope holding a 30% row
   is a state no build writes, so the migrate rightly skips it and the case would have kept failing
   on an unreachable state. The plant now writes version 1, which is what the previous build wrote.
   The case then passes as the V2-21 regression it is: tidied on load, the note edit saves, and the
   app re-imports its own export.
8. **Retitles.** Every cycle 4 DEFECT case that is now green is retitled as a regression guard, in
   both v4 files. The v3 files keep their cycle 3 titles, with a header note that every DEFECT case
   there is a green guard.

### Plan-vs-build gaps

- **R16.8's load path has no committed test.** `rule-index.json` says R16.8, "tidied on load and on
  import", is "Covered by cycle3-fixes.test.ts (tidyLedger and the import path)". Nothing committed
  drives `store.ts` `migrate`, `PERSIST_VERSION` or `takeTidyNotice`. The three committed tests that
  mention a version 1 envelope are about v1 product files (A7). The owner's decision was "tidy on
  load, say so", and the load half is covered only by my uncommitted `tester-v5-cycle5` files.
- **Nothing committed covers the type chips outside the edit form.** The v2-loop V2-23 case opens
  only the edit form, which is how V2-26 passed every gate.
- **A truncated real export is still told "That file is not a Spare Change export."** R16.8 says an
  import that fails any check "says what failed rather than claiming the file is not an export".
  JSON that has been cut off fails the first check, and the app cannot know it was an export without
  sniffing the text. Architect's call.
- **The build notes' re-check list describes a path the code never takes** (V2-28).
- **Closed since cycle 4:** R12.1 now says L1 unlocks on the first habit, and 8.7a no longer says "No
  new ledger field". **Still open:** "sixteen" appears 22 times in the plan (the library is twenty),
  R10.1 still says "from 19", and CLAUDE.md section 5 still calls habit detection R4.

### Unverified concerns

- **A corrupt envelope string likely takes V2-27's path too.** A `JSON.parse` failure inside
  `createJSONStorage.getItem` rejects into the same zustand `.catch`, so the app would boot as a new
  user and the first write would replace the data. I read this in zustand 4.5.7's source; I did not
  run it. It predates this cycle.
- **The tidy notice says how many rows changed, not which, for 6 seconds, once.** That is R16.8 as
  written and it is built that way. A user with two such rows cannot tell afterwards which rates were
  removed, and the values are gone. I am recording this for the architect, not filing it.
- **An old build left open in another tab after a deploy keeps writing version 1 envelopes.** The
  new build then tidies again and shows the notice again. Reasoned from the code, not run; harmless.

### What held

- **R16.8 on load:** both envelope sources, the IndexedDB record and the localStorage mirror, when
  the mirror is newer. The envelope is rewritten at version 2, and a second load is silent. Every
  part of the envelope except the ledger fields the rules cannot use comes back deep-equal. A
  version 1 envelope that needs nothing leaves no notice.
- **R16.8 on import:** 4,284 variants and 0 problems (see V2-21). Every non-number is refused with
  the field named, and `tidyLedger` counts a row once and is idempotent. The app's own export of a
  tidied state re-imports with nothing left to tidy.
- **V2-23, as decided, in the add and edit forms:** the name fill follows the exact sequence, the
  type is stored, a rename keeps the type, and picking another type clears both keys. The legacy
  untyped bond row passes through a note edit. At 320 px all six chips are at least 44 x 44 and on
  screen in all three forms, with no sideways scroll. **axe is clean** (0 serious, 0 critical) in
  light and dark on the add form with Bonds or CDs and then Crypto picked, on the edit form with
  Individual stocks picked, and on the jar move form with Bonds or CDs picked.
- **V2-20:** Save is disabled with a reason on the row, nothing is written, and a double tap on Save
  writes once.
- **The toast** sits inside a 320 px screen with the longest message the app now shows.
- **Everything from cycles 3 and 4** still passes on mobile and desktop: all 13 cycle 3 and 8 cycle 4
  e2e tests, and all 43 and 71 unit cases.

### Gate counts, observed this pass

Read from each tool's summary lines. For Playwright, the "N passed / failed / flaky" lines, never
the log tail (gotcha 9).

| gate | result |
|---|---|
| `npm test` | 37 files, **845 tests: 844 passed, 1 failed.** All 720 committed pass (845 minus my 125). `tester-v3-cycle3` 43/43, `tester-v4-cycle4` 71/71, `tester-v5-cycle5` 10/11; the 1 is the V2-27 DEFECT case, failing on purpose. |
| `npm run typecheck` | clean, exit 0, every tester file included |
| `npm run build` | exit 0: lint:copy ok (104 files), lint:advice ok (89 files), rules:check ok (30 arithmetic rules, 111 cases, 30 rules covered), vite built in 1.43 s, check-bundle-secrets ok (14 files) |
| `npm run test:db` | real Neon, isolated schema: **7 files, 96 passed** (93 committed + 3 `tester-v3-backend`), 27.9 s |
| e2e, the 11 committed specs, 4 projects, retries 1 | 388 tests: **359 passed, 1 flaky, 28 skipped**; Playwright printed no `failed` line (15.2 min). The flaky one is `push-delivery.spec.ts:198` on mobile ("an unparseable payload, a wrong version and a wrong type each show one fallback"). It failed once in 16.9 s and passed on retry in 2.8 s. e7bb37f touched nothing under `api/`, `src/lib/push.ts` or `public/sw.js`. The coder's run had 360 passed and 0 flaky; this one retry is the whole difference. |
| e2e, tester v3 + v4 + v5, mobile, retries 0 | 33 tests: **29 passed, 4 failed**. The 4 were the three DEFECT cases (V2-26, V2-27, V2-28) plus the v3 R10.4 case (reconciliation 6), whose fix landed after this run had loaded the file. Rerun of that case alone: **1 passed**. |
| e2e, tester v3 + v4 + v5, desktop, retries 0 | 33 tests: **30 passed, 3 failed**, the same three DEFECT cases |
| production | `sparechangeinvesting.vercel.app` serves `assets/index-sX1V4cLs.js`, identical to the local build of e7bb37f (fetched read only) |

### What I could not test

- A real iPhone, Safari or WebKit, Firefox, screen readers, a real push arriving, and the cron on its
  real schedule. None of these was touched by this cycle, and none is covered here.
- My three tester specs on the iphone-pro and iphone-pro-max projects. They ran on mobile (375 px
  plus 320 px checks) and desktop only. The committed suite ran on all four projects.
- Production beyond one read-only fetch of its `index.html` to learn which bundle it serves. I
  read no user data there and wrote nothing.

### Tester files this cycle (uncommitted)

| file | cases | state |
|---|---|---|
| `tests/unit/tester-v3-cycle3.test.ts` | 43 | all pass (3 reconciled) |
| `tests/unit/tester-v4-cycle4.test.ts` | 71 | all pass (1 reconciled, 4 retitled) |
| `tests/unit/tester-v5-cycle5.test.ts` | 11 | 10 pass; 1 DEFECT fails on purpose (V2-27) |
| `tests/e2e/tester-v3-cycle3.spec.ts` | 13 | all pass (2 reconciled) |
| `tests/e2e/tester-v4-cycle4.spec.ts` | 8 | all pass (1 reconciled, plant fixed, 5 retitled) |
| `tests/e2e/tester-v5-cycle5.spec.ts` | 12 | 9 pass; 3 DEFECT fail on purpose (V2-26, V2-27, V2-28) |
| `tests/db/tester-v3-backend.test.ts` | 3 | pass (within 96) |
| `tests/fixtures/tester-v3-lint-plants.ts`, `tester-v4-lint-plants.ts` | n/a | unchanged |

**Ready to commit, as was done with tester-v2-\*:** all of v3 and v4 (unit, e2e, db, fixtures)
pass today. The two v5 files pass except for their four DEFECT cases, which fail until V2-26, V2-27
and V2-28 are fixed and then go green with no edit. If the owner wants a green commit today, commit
v3 and v4 now and v5 after those fixes. V2-29 has only a RECORD case, which does not fail.

```bash
npx vitest run tests/unit/tester-v3-cycle3.test.ts tests/unit/tester-v4-cycle4.test.ts tests/unit/tester-v5-cycle5.test.ts   # 1 fails = V2-27
npx playwright test tests/e2e/tester-v3-cycle3.spec.ts tests/e2e/tester-v4-cycle4.spec.ts tests/e2e/tester-v5-cycle5.spec.ts --project=mobile --retries=0   # 3 fail = V2-26, V2-27, V2-28
```

## Cycle 6, 2026-09-11: re-verification of V2-26 to V2-29 (64d619b)

Machine: darwin 25.6, Node 24, Playwright Chromium (headless shell 1243). Scope: re-ran my own
cycle 5 repros against 64d619b and worked the build notes' "What the tester should re-check"
list item by item, then probed the immediate neighbourhood of each fix. This was a focused
re-verification, not a full sweep; the plan-vs-build audit and the copy desk gate were out of
scope this pass.

### Verdict

**SHIP.** V2-26, V2-28 and V2-29 are fixed with no residue found anywhere I looked, including
every item on the re-check list. V2-27 is fixed for its stated purpose (a throw in the load-time
migrate can no longer wipe a profile) and holds on every re-check shape (ledger not an array, a
null row, a row whose `holdingType` is a number). Looking one layer past the re-check list found
one new Minor defect in the same code (V2-30): the fix's safety net is envelope-wide rather than
per-row, so one unreadable row silently blocks tidying of every other row in the same ledger,
forever. It needs the same hand-corrupted precondition V2-27 itself needed and costs no data,
only precision, which is why it does not change the ship call.

**New defects: 0 Critical, 0 Major, 1 Minor (V2-30).**

### V2-26 to V2-29, re-verified against my cycle 5 repros and the re-check list

| id | ruling | evidence, this pass |
|---|---|---|
| V2-26 | **FIXED, including both re-check cases** | `Home.tsx:319` now passes `holdingType`, `termMonths` and `yieldBps` from the jar move draft to `moveJarToLedger`. Domain: a jar move drafted as a CD stores `holdingType: "bondsCds", termMonths, yieldBps`; drafted as Individual stocks stores `holdingType: "stocks"` with neither key present (not `null`, not missing-but-implied: the key is absent, exactly as `makeEntry` only spreads a defined value). **Re-check, Something else + a typed name:** stores `holdingType: "other"` and the typed name; on screen (`tester-v6-cycle6.spec.ts`) the row shows the typed name, no maturity line and, by the app's own by-design rule for "other" rows, no type pill either (Invest.tsx's own comment: an "other" row's name is always the user's own, so the pill that disambiguates a renamed CD does not apply); opening it for edit shows the "Something else" chip pressed and every other chip unpressed. **Re-check, no type picked at all:** stores no `holdingType` key at all (verified it is absent, not `""` or `null`); on screen no chip is pressed on a later edit. |
| V2-27 | **FIXED for the wipe; opened V2-30** | `migratePersisted` never throws: a version 1 ledger is tidied once (unchanged from cycle 5), a version 2 envelope comes back as the same object, and a row it cannot read returns the envelope exactly as stored. **Re-check, ledger not an array** (`ledger: "not-an-array"`): `Array.isArray` guard trips first, returns the envelope unchanged, no throw. **Re-check, a null row** (`ledger: [bondRow(), null]`): `isBondRow(null)` throws inside `tidyLedger`, caught by `migratePersisted`'s try/catch, envelope unchanged, no throw escapes. **Re-check, a row whose `holdingType` is a number:** does not throw; `isBondRow` compares `5 === "bondsCds"`, false, so the row is treated as non-bond and its term/rate are tidied away; the bad-typed value itself passes through unchanged (`HOLDING_TYPES.find` degrades to `undefined` downstream, so this renders safely as untyped, not a crash). All three confirmed in `tester-v6-cycle6.test.ts`, 8 cases. |
| V2-28 | **FIXED, plus one neighbour case** | `errLabelTooLong` shows on the row (`invest-capture-label-error-other`) the moment the trimmed label exceeds 60 characters, and Save stays disabled. Neighbour, not on the re-check list: a label 61 characters AND an amount over the cap on the same row show **both** errors at once and Save stays off; fixing the label alone (61 to 60 chars) clears that error and re-enables Save with no page reload needed. `tester-v6-cycle6.spec.ts`, 2 cases. |
| V2-29 | **FIXED, including both re-check keys** | **Re-check, section `"constructor"`:** `S.settings.importInvalid('constructor')` returns the generic "one part of it" phrase, not `Object.prototype.constructor` or anything derived from it (`Object.prototype.hasOwnProperty.call` in `importPart` is the guard). **Re-check, section `"__proto__"`:** same fallback; `IMPORT_PARTS` is a plain object literal, so `IMPORT_PARTS.__proto__` never became an own property and `hasOwnProperty` correctly says no. Also tried `toString`, `hasOwnProperty`, `valueOf`, `isPrototypeOf`, `propertyIsEnumerable`: all five fall back safely. Every one of the 16 real section keys the validator can actually produce maps to its own words, not the fallback. End to end, on the real Settings screen (`tester-v6-cycle6.spec.ts`): exported a real profile, planted `ledger[0].termMonths = "DROP TABLE users;--"`, re-imported through the actual hidden file input; the shown message is exactly "That looks like a Spare Change export, but an investment entry did not pass the app's checks, so nothing changed." with none of `DROP TABLE`, `termMonths`, `led:` or a bracketed array index anywhere in it. **Note, not a defect:** neither re-check key is reachable through `parseImport` today. `validateImportedState`'s dynamic, user-controlled key paths (`lessons.<key>`, `learn.<key>`, `learnSurfaces.<key>`) always carry a dot before the user's key, so the leading-letters regex that derives `section` stops at the dot and never returns a bare `constructor` or `__proto__`; a top-level extraneous key of either name is simply ignored by the schema and, if anything else is missing, is refused with `importBad` (every problem ends `: missing`, so `looksLikeExport` is false) rather than `importInvalid`. Confirmed both ways in `tester-v6-cycle6.test.ts`. The defensive lookup is real hardening, just not load-bearing on any path I could find. |

### New defect

#### V2-30. Minor (same "no realistic trigger found" precondition as V2-27; costs precision, not data). `migratePersisted`'s safety net is whole-envelope, not per-row: one unreadable row blocks tidying of every other row in the ledger too, silently and permanently

- **What breaks:** `tidyLedger` builds its tidied array with `Array.prototype.map`. If the
  callback throws on any one row (an `isBondRow` call reading a property of `null`, or `.trim()`
  on a non-string `what`), `map` does not return the rows it already processed; it throws, and
  the throw propagates out of `tidyLedger` entirely. `migratePersisted`'s try/catch, which V2-27
  added specifically so a throw could never reach zustand's unguarded write, catches this at the
  whole-envelope level and returns the **entire stored state unchanged** — including every good
  row that should have been tidied.
- **Repro:** `npx vitest run tests/unit/tester-v6-cycle6.test.ts -t "one unreadable row blocks tidying"`.
  Plant a version 1 ledger with two rows: row 1 is a bond row carrying a stale 30% rate
  (`yieldBps: 3000`, over the current 2500 ceiling and exactly the shape R16.8/V2-21 says should
  be tidied away on load), row 2 is `{ id: 'led:2', what: 42 }` (a row with no readable `what`,
  the same unreadable shape the committed `cycle3-fixes.test.ts` already uses for its own V2-27
  case). Call `migratePersisted(envelope, 1)`.
- **Observed:** the returned object `=== ` the input object (`toBe`, not `toEqual`): nothing was
  tidied. Row 1 still carries `yieldBps: 3000`, a value R16.8 says a build with today's rules
  would never accept and should have removed on load.
- **Expected (per R16.8's own wording, "a term or rate ... is removed from **that row**"):**
  row 1's stale rate is removed and the user is told one row changed; row 2, being unreadable,
  is either skipped on its own or (per V2-27's already-accepted trade-off) left exactly as
  stored, but row 1's fate should not depend on row 2's shape.
- **Violates:** R16.8's "removed from that row" language, which reads as per-row, not
  per-ledger; and, less directly, R16.8's promise that a tidied user is "told once how many rows
  changed" — with this shape they are never told anything, because `noteTidied` is never reached.
- **Why Minor, not worse:** it needs the exact same precondition V2-27 itself needed — a row a
  real build never writes (no `what` at all, or a non-object row) — so the same "no realistic
  trigger found" note applies. Unlike V2-27, nothing is lost: amounts, names and every other
  field of every row, including the untidied one, survive intact forever. The cost is that a
  user who is unlucky enough to also have one corrupted row never gets R16.8's tidy, on that row
  or any other, and the app cannot tell them why, because it does not know either. The fix is
  inside `tidyLedger`: wrap the per-row work so one row's exception is caught and that row is
  left alone, rather than letting `Array.prototype.map` abort the whole pass.
- **Not reachable via import:** `validateImportedState` runs full schema checks (`c.str(v.what, ...)`
  etc.) on every ledger row before ever calling `tidyLedger`, so a row shaped like the repro above
  is refused outright on import, long before it could reach the same unguarded `.map`. This is a
  load-path-only finding, exactly like V2-27 was.

### Tester file correction

`tests/e2e/tester-v5-cycle5.spec.ts`, the "a stock row with a term and a rate imports..." case
(line 321), asserted the **pre-V2-29** refusal shape: `/^refused: ... but part of it did not
pass/` and `msg2.includes('ledger[')`. That is exactly the message V2-29 was written to remove,
so on 64d619b it failed (observed: `msg2: false`). This is not a new defect; it is a cycle 5 test
that predates the cycle 5 fix it was bundled next to. Reconciled in place (inverted the assertion
to require the old shape's absence and the new shape's presence, both confirmed against the real
screen: `"refused: That looks like a Spare Change export, but an investment entry did not pass
the app's checks, so nothing changed."`), retitled with a `(cycle 6: reconciled to V2-29)` tag,
and re-run green on mobile and desktop. No other case in tester-v3, v4 or v5 needed a change.

### Tester cases this cycle (uncommitted)

| file | cases | state |
|---|---|---|
| `tests/unit/tester-v6-cycle6.test.ts` | 19 | all pass |
| `tests/e2e/tester-v6-cycle6.spec.ts` | 5 | all pass (mobile and desktop) |

**Every case in tester-v3, v4 and v5 now passes, with no DEFECT case left red:** the four cases
that failed on purpose in cycle 5 (V2-26, V2-27, V2-28 in `tester-v5-cycle5.spec.ts`, V2-27 in
`tester-v5-cycle5.test.ts`) now pass unedited, exactly as the build notes predicted, and the one
stale assertion found above is fixed. Ready to commit as-is: v3 (13 e2e + 43 unit), v4 (8 e2e +
71 unit), v5 (12 e2e + 11 unit, one line corrected), plus this cycle's v6 (5 e2e + 19 unit) if the
owner wants this cycle's re-check coverage kept too.

```bash
npx vitest run tests/unit/tester-v3-cycle3.test.ts tests/unit/tester-v4-cycle4.test.ts tests/unit/tester-v5-cycle5.test.ts tests/unit/tester-v6-cycle6.test.ts   # 0 fail
npx playwright test tests/e2e/tester-v3-cycle3.spec.ts tests/e2e/tester-v4-cycle4.spec.ts tests/e2e/tester-v5-cycle5.spec.ts tests/e2e/tester-v6-cycle6.spec.ts --project=mobile --retries=0   # 0 fail
```

### What held (this cycle's re-checks, beyond V2-26 to V2-29 themselves)

- The add and edit ledger forms are untouched by this commit and still save every field
  (confirmed by reading `Invest.tsx`'s `onSave` callsites: both pass the whole `draft` object
  through, unlike the jar move form before V2-26).
- `HOLDING_TYPES.find` degrades safely (`undefined`, no throw) for a `holdingType` that is not
  one of the six real keys, whatever its type, on both the read side (Invest's pill, LedgerForm's
  chip highlighting) and the tidy side (`isBondRow`).
- A `schemaVersion` mismatch or a file missing every required key never reaches `importInvalid`
  at all: `looksLikeExport` is false for both, so the UI shows the generic `importBad` instead,
  which cannot leak anything because it takes no argument.

### Gate counts, observed this pass

Read from each tool's summary lines. For Playwright, the "N passed / failed / flaky" lines, never
the log tail (gotcha 9).

| gate | result |
|---|---|
| `npm test` (every `.test.ts` under `tests/unit`, committed plus every tester file) | **38 files, 867 passed, 867 total.** 723 committed + 144 tester (43 v3 + 71 v4 + 11 v5 + 19 v6, this cycle's new file), 0 failed. |
| `npm run typecheck` | clean, exit 0, tester-v6-cycle6.test.ts included |
| `npm run lint:copy` | ok, 104 files scanned |
| `npm run lint:advice` | ok, 89 files scanned |
| `npm run rules:check` | ok, 30 arithmetic rules, 111 cases, 30 rules covered |
| `npm run build` | exit 0: `tsc -p tsconfig.build.json && vite build` in 1.32s, `check-bundle-secrets` ok (14 files) |
| `npm run test:db` | not re-run: nothing under `api/` or `db/` changed this commit (same call as cycle 5) |
| e2e, the 11 committed specs, 4 projects, default retries | **367 passed, 1 flaky, 28 skipped, no `failed` line** (17.2 min). The flaky one is again `push-delivery.spec.ts:198` on mobile, the exact same test cycle 5 flagged as flaky and unrelated to this commit (nothing under `api/`, `src/lib/push.ts` or `public/sw.js` changed in 64d619b either). Failed once (`Timeout 15000ms exceeded` waiting for one notification), passed on retry. |
| e2e, tester v3 + v4 + v5, mobile, retries 0 | **33 tests, 33 passed, 0 failed.** All four cycle 5 DEFECT cases (V2-26, V2-27, V2-28 in the spec file) are green with no edit, as the build notes predicted. |
| e2e, tester v3 + v4 + v5, desktop, retries 0 | **33 tests, 33 passed, 0 failed.** |
| e2e, tester v6, mobile and desktop, retries 0 | **5 tests each, 10 passed, 0 failed.** |

### What I could not test

Same boundary as cycle 5: a real iPhone, Safari, WebKit, Firefox, screen readers, a real push
notification arriving, and the cron on its real schedule. This was a focused re-verification of
one commit, not a full sweep: I did not re-walk the whole plan-vs-build audit, re-run the copy
desk gate, or re-check production against this commit's bundle hash.

### V2-30 fixed (re-verified, uncommitted coder change to `migratePersisted`)

`migratePersisted` now tidies one ledger row at a time (`p.ledger.map` with a per-row try/catch)
instead of handing the whole array to `tidyLedger` in one shot, so a single unreadable row can no
longer block the tidy of every other row. Confirmed directly: a ledger with a bond row carrying a
stale `yieldBps: 3000` next to an unreadable `{ id: 'led:2', what: 42 }` row now comes back with
the bond row's rate dropped (other fields intact) and the unreadable row returned as the identical
object, no throw. The old case ("AUDIT: one unreadable row blocks tidying of every OTHER row...",
`tests/unit/tester-v6-cycle6.test.ts` ~line 137) asserted the pre-fix `0 of 2 tidied` behavior and
is retitled "V2-30 regression guard" with the assertions flipped to the fixed behavior; no other
case in the file was touched. `npx vitest run tests/unit/tester-v6-cycle6.test.ts`: 19 passed, 19
total, 0 failed.
