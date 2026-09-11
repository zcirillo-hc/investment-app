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
