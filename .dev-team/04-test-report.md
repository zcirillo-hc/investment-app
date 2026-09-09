# Test Report

Tester pass over `.dev-team/02-plan.md` and `.dev-team/03-build-notes.md`, 2026-09-06. Environment: Node 24.17, Playwright 1.63 Chromium, dev server on http://localhost:5173, viewports 375 x 812 (isMobile, hasTouch) and 1280 x 800. The coder's suites were green before I started (lint:copy, vitest 100/100, e2e 6/6) and I did not re-verify them; everything below is what those suites do not cover.

**Revised 2026-09-06, cycle 2.** Re-tested after the architect resolved P1 to P5 and the coder
fixed D1 to D9 plus the three concerns. In this pass I **did** re-run every suite myself rather
than take the counts on report; see "Final numbers, verified by me". The cycle-1 material below is
kept verbatim as the record of what was filed; cycle-2 findings start at "Cycle 2: re-test of the
fixes and their neighborhoods".

**Revised 2026-09-07, cycle 5 (final verification).** Narrow re-test of C4-8 to C4-11 and the six
cycle 4 defects they fix, plus a full regression sweep. All four items verified and D13 to D18 all
verified fixed; three new Minor defects, D19 to D21. See "Cycle 5 verification" below; the verdict
line at the top of that section is the current one.

**Revised 2026-09-06, cycle 4 (risk closure).** Adversarial verification of C4-1 to C4-7 against
plan section 13, plus a full regression sweep of cycles 1 to 3. Six new defects, D13 to D18, two of
them Major. See "Cycle 4 verification" below; superseded by the cycle 5 section.

**Revised 2026-09-06, cycle 3 (final exchange).** Re-tested D10, D11 and D12 against the revised
plan (Cycle 3 revision log entry: the precise Tooltip spec in section 6, the 5.4 ordering and
cross-field rules for P6, and 12.1 rule 8 for P7), ruled on the coder's two disputes over my own
`tester-cycle2.spec.ts` tests, and re-ran every suite myself. See "Cycle 3: re-test of D10 to D12,
P6, P7, and the two disputes" below.

## Verdict

**SHIP WITH RISK (cycle 5, current).** Every cycle 4 defect is verified fixed and all four cycle 5
items (C4-8 to C4-11) meet their acceptance criteria, including the amended C4-4 axe scan in both
themes at both viewports. The remaining risk is small and specific: **D20**, a Minor regression that
C4-8 introduced in the control it was rewriting - in dark mode the Settings pause switch is the same
colour on and off, because `dark:bg-muted` is emitted after `checked:bg-leaf` at equal specificity -
plus **D21**, a Minor blind spot in the guard meant to prevent exactly that class of regression, and
**D19**, a Minor dev-gated theme bug on the error boundary. No Major or Critical defects are open.
D20 is a one-line fix and is the only thing standing between this and a clean SHIP. See
"Cycle 5 verification".

**SHIP WITH RISK (cycle 4).** Superseded. C4-4 failed and six new defects D13 to D18 were filed;
all six are now closed. Kept as the record of where cycle 4 closed.

**PASS (cycle 3).** Every defect on the board is verified fixed against the running app, not just
against the coder's description of it: D10 (corrupt `clock.startDate` boots and renders, backstopped
by an error boundary), D11 (the tooltip breadth sweep is 0 of 29 failing on both viewports, and the
coder's own 116-tap `tooltip.spec.ts` sweep is clean), D12 (the Welcome import control measures
44 px at 375), P6 (the validator now rejects every reversed-order, cross-field-inconsistent, and
out-of-bounds shape I threw at it, and a real export still imports), and P7 (Welcome's terms are
wrapped and keyboard-only onboarding still completes, now at 10 tab stops instead of 6). Both of
the coder's disputes over my cycle-2 tests checked out on my own independent verification, not just
on the coder's say-so, and I have fixed my own tests accordingly rather than leave them red for the
manager. 24 of 24 acceptance criteria now pass. `npm run lint:copy` (71 files, 0 problems),
`npm test` (19 files, 239/239), `npm run build` (clean), and `npm run e2e` (112 tests, 104 passed,
0 failed, 8 skipped, both projects) are all green, run by me in this pass, after my test fixes.

> Cycle 2 verdict, kept for the record: **SHIP WITH RISK.** All nine cycle-1 defects are verified
> fixed and the Critical import hole (D1) is genuinely closed, but the D6 tooltip fix introduced a
> Major regression: a tooltip tapped in the lower part of the viewport closes itself in the same
> interaction, so 11 of 29 terms on mobile and 7 of 29 on desktop show nothing at all (D11).
> Criterion 20 therefore still fails, now for a different reason than in cycle 1. 23 of 24 criteria
> pass.

> Cycle 1 verdict, kept for the record: **PASS WITH DEFECTS.** The definition-of-done flow holds on
> both viewports and 22 of 24 acceptance criteria pass, but import validation is shallow enough that
> a malformed backup file writes `NaN` money into IndexedDB or makes the app render nothing on every
> normal open (Critical, D1), tooltip coverage fails criterion 20 on several screens (Major, D3), and
> criterion 12 cannot pass on the Growth preset because the plan contradicts itself (architect item).

### Cycle 2 status at a glance

| Defect | Status |
|---|---|
| D1 Critical, import accepts malformed files | **VERIFIED FIXED** |
| D2 Minor, profile edit re-seeds the simulator | **VERIFIED FIXED** |
| D3 Major, missing tooltip terms | **VERIFIED FIXED** (one documented gap remains on Welcome, see P7) |
| D4 Minor, onboarding forward-jump | **VERIFIED FIXED** |
| D5 Minor, scroll carries across routes | **VERIFIED FIXED** |
| D6 Minor, pinned tooltip outlives focus / floats / two at once | **VERIFIED FIXED, but REGRESSED elsewhere (D11)** |
| D7 Minor, tap targets under 44 px | **VERIFIED FIXED** for every named control; one control missed (D12) |
| D8 Minor, native validation and stale error | **VERIFIED FIXED** |
| D9 Minor, dust shares after full liquidation | **VERIFIED FIXED** |
| Concern 1 `useHoldRepeat` | **VERIFIED FIXED** |
| Concern 2 two bubbles at once | **VERIFIED FIXED** |
| Concern 3 catch sheet on a short viewport | **VERIFIED FIXED** |
| D10 Minor, boot throws on a corrupt `clock.startDate` | **VERIFIED FIXED (cycle 3)** |
| D11 Major, tooltip closes itself when tapped low in the viewport | **VERIFIED FIXED (cycle 3)** |
| D12 Minor, Welcome import link is 20 px tall at 375 | **VERIFIED FIXED (cycle 3)** |

## Defects

Severity definitions: Critical = data loss, security exposure, or silently wrong output; Major = a must-have criterion does not hold under normal use; Minor = edge case, cosmetic, or degraded experience that does not block the DoD.

### D1. Critical. Import accepts malformed files that corrupt persisted state or brick the app

- **Violates:** plan 11 ("Import of a malformed file: clear error, state untouched"), 5.4 (import "validates schemaVersion and required keys, then replaces state"), 4.1 (money is always integer cents).
- **What breaks:** `parseImport` checks only top-level keys plus a handful of types. Thirteen structurally wrong files pass and are written to IndexedDB by `writeImportedState`, then the app reloads into them.
- **Repro (browser, both viewports):** onboard at the demo URL, Settings > Export JSON, Demo tray > Reset demo, then at Welcome use "Have a backup? Import it" with the export edited as follows.
  - `clock.lastOpenedRealDate: "yesterday"` then open `/?demo=1` (no `freeze=1`, i.e. a normal open): `runAutoAdvance` calls `daysBetween('yesterday', today)` which throws `Error: Bad date: yesterday`; React unmounts and **nothing renders on any open without `?freeze=1`**. Observed: `screen-home` count 0, pageerror logged. The only recovery is clearing site data.
  - `pendingPaychecks: [{}]`: catch sheet renders "That is **$NaN.NaN**", "Yes, keep $NaN.NaN"; accepting writes `jarCents: NaN` and a `Catch` event with `cents: NaN` to storage. Observed jar amount after accept: `$NaN.NaN`. The jar can never sweep again (`NaN >= threshold` is false).
  - `holdings.VTI: "lots"`: Home shows Invested **$NaN.NaN**, growth **+$NaN.NaN since you started**.
  - `lessons.L1: null`: passes because `typeof null === 'object'`. Home renders (the fear lesson short-circuits `nextLessonId`), but the Lessons tab throws; reloading on `/lessons` renders nothing (main count 0, 8 page errors).
  - Also accepted without complaint: negative holdings, `events[].cents` as a string (contributed becomes a string concatenation), negative `dayIndex`, `sweepThresholdCents: 0`, `catchPct: 999` (Settings displays 999%), `theme: "purple"`, `riskProfile: "yolo"`, `age: 900`, a 5,000 character name.
- **Evidence:** `tests/unit/tester-domain.test.ts` > "plan 5.4 / 11: import validation" (13 failing cases) and "FINDING: garbage lastOpenedRealDate"; `tests/e2e/tester-attacks.spec.ts` > "hostile import files" (four failing tests per project, console lines `catch amount from {} paycheck: $NaN.NaN`, `invested with string holding: $NaN.NaN`, `home after garbage lastOpened without freeze: 0`, `lessons screen after null lesson import: 0`).
- **Exposure note:** only reachable through a hand-edited or damaged file; the app's own exports round-trip correctly (verified, including an export from a different seed). Severity is Critical by definition (persisted corruption, unrecoverable boot) but the trigger is not in the normal flow. Part of the blame is the plan's own wording (see plan-level item P3).

### D2. Minor (silent). Editing name or email in Settings silently re-derives the simulator seed

- **Violates:** plan 5.4 (`profile.seed = fnv1a32(...)`, "overridden by `?seed=<int>`"), plan 11 determinism.
- **What breaks:** `setProfile` recomputes `seed` on every call. The Settings profile fields call it on blur, so a name edit after onboarding replaces the `?seed=42` override with a hash of the new name, and every future simulated day comes from a different stream. Nothing tells the user; the demo tray seed readout just changes.
- **Repro:** demo URL, onboard, Settings, change name to "Samantha", tab out. Demo tray "Seed" reads `3520731057` (was 42). Store-level: `tests/unit/tester-store.test.ts` > "FINDING: editing the profile after onboarding changes profile.seed" (seed 42 becomes 2119724903).
- **Expected:** seed fixed at onboarding completion; profile edits never touch it.

### D3. Major. Criterion 20 second sentence fails: tooltip terms are missing on several appearances

- **Violates:** criterion 20 ("Every term in the tooltip list (12.2) renders a tooltip where it appears"), 12.1 rule 8, 4.6 (sweep line tooltip "filled at the last closing price").
- **Observed (DOM audit of `[data-testid^="term-"]`):**
  - Portfolio holdings table: "US stocks", "World stocks", "Bonds", "Real estate", "Cash-like" are plain `tickerLabel` text, no `Term`. Portfolio terms present: portfolio, growthSinceStart, contributions, holdings, fractionalShare only.
  - Home: "you've put in $X" has no `contributions` term (Portfolio's copy of the same line has one); "Invested" has no `portfolio` term. Home terms present: sevenPercent, growthSinceStart, jar only.
  - Allocation explainer copy ("Stocks grow more... Bonds and cash-like are the steady part") and lesson L3 ("companies or bonds") mention listed terms unwrapped.
  - `S.home.sweepFillNote` and the `closingPrice` tooltip entry exist but are never rendered anywhere (`grep closingPrice src/screens src/components` is empty). The Activity sweep line's tooltip is the generic `sweep` definition, which says nothing about the fill price, so 4.6's tooltip requirement is unmet.
- **Evidence:** `tests/e2e/tester-attacks.spec.ts` > "tooltip coverage" (fails both projects; console `home terms [...]`, `portfolio terms [...]`).
- **Impact note:** low user impact, but the build notes concede this was "not audited exhaustively" and the criterion is explicit.

### D4. Minor. Typing `/onboarding/allocation` after Welcome skips fear check and quiz entirely

- **Violates:** plan 6 routing (onboarding is a sequence; "Onboarding progress is persisted so a refresh resumes at the same step"), criteria 4 to 6 by consequence.
- **Repro:** demo URL, enter a name, Continue, then navigate to `/onboarding/allocation?demo=1&freeze=1&start=2026-06-15&seed=42`. The allocation screen renders with `riskProfile: null`, so the guardrail floor is 0 (amber can never show) and there is no "Back to the ... mix" link. Save completes onboarding: Home shows "Nothing new yet" (no fear lesson), quizAnswers `[]`.
- **Evidence:** `tester-attacks.spec.ts` > "typing /onboarding/allocation with only a name" (console `screen reached by direct allocation URL: screen-allocation`).
- **Expected:** `OnboardingRoute` should redirect to `resumePath(state)` when the requested step is ahead of the persisted progress.

### D5. Minor. Scroll position carries across route changes, so Home opens scrolled to the bottom after onboarding

- **Violates:** criterion 7 in spirit ("Home renders with the jar... the tree at stage 0"), plan 6.7 layout.
- **Repro:** finish onboarding on mobile. `window.scrollY` on Home immediately after Save is 777 (max scroll; page height 1589). Desktop: 289. Switching tabs from a fully scrolled Settings lands Lessons at scrollY 338.
- **This is the orchestrator's item (a).** The "empty tree card" in the full-page screenshot is not a layout bug: the stage-0 seed is a 22 x 20 px ellipse at the bottom of the 200 px card, the page was scrolled 777 px so the card sat at the top edge under the sticky header, and the open demo tray covered the seed. The "second header" is Playwright's full-page stitching of a `position: sticky` header at that scroll offset. Viewport screenshots with the card scrolled into view show the seed correctly: `scratchpad/a-mobile-home-tree-in-view.png`, `a-mobile-home-viewport.png`, `a-mobile-home-fullpage.png` (scratchpad = `/private/tmp/claude-501/-Users-zacharycirillo-Desktop-Claude-investing-app--roundup/6a1b3958-496b-45d6-9c7f-a4ae8dc79e88/scratchpad`). DOM: `tree-stage-0` rect 22.5 x 20.6, `transform: none`, opacity settled, zero console errors.
- **Expected:** scroll to top on pathname change (a `ScrollToTop` effect on `useLocation`).

### D6. Minor. Pinned tooltips do not follow their anchor on scroll, and a click-pin outlives focus and pointer

- **Violates:** plan 6 global components ("tap or hover or focus opens; Escape closes"), plan 11 ("tooltips open on tap and close on outside tap").
- **Observed (desktop allocation screen, `scratchpad/shots.mjs`):**
  - Hover then move away: closes (0 bubbles). Click pins: bubble persists after the pointer leaves and after Tab moves focus away (1 bubble). Escape and outside pointerdown close it. Clicking a +/- button counts as an outside click and closes it.
  - Position is computed once in a `useLayoutEffect([open])` with `position: fixed`. Scrolling 200 px while pinned: bubble stayed at viewport y 287 while its anchor moved to y 61, so the definition floats 226 px away from the term (`b-desktop-alloc-scrolled-pinned.png`).
  - Two bubbles can be open at once (a pinned one plus a hovered one) because pin state is per instance.
- **This is the orchestrator's item (b):** the tooltip over "World stocks" was pinned by a click on the term and stays until an outside pointerdown or Escape; it is not a hover-leave failure. Hover-leave itself works (verified: `tooltip still open after hovering term then clicking + and moving away: 0`).

### D7. Minor. Mobile tap targets under 44 px on user-facing controls

- **Violates:** plan 11 ("tap targets at least 44 px").
- **Measured at 375 x 812** (`tester-attacks.spec.ts` > "tap targets under 44px per screen", console `SMALL TARGETS`): "Your milestones" link 108 x 20, Portfolio "Edit mix" 54 x 20, catch sheet "Change %" text link, Settings name and email inputs 311 x 36, pause switch 44 x 24, header logo 148 x 36, demo tray "Hide" 26 x 16 and all five tray buttons 36 px tall. Inline `Term` spans are 17 to 18 px tall (the build notes declare this). The nav tabs, threshold segments, +/- steppers and primary buttons are all 44 px or more.

### D8. Minor. Native email validation blocks submit, leaving a stale, wrong error message on Welcome; Settings profile edits fail silently

- **Violates:** 6.1 copy (`emailInvalid` string never shown for `a@`), criterion 2 holds only via the browser.
- **Repro:** Welcome, name of 41 chars, Continue (error "Keep the name under 40 characters."). Fix the name to 40 chars, email `a@`, Continue. The `type="email"` input fails HTML constraint validation so the submit handler never runs; the browser shows its own bubble and the page keeps displaying "Keep the name under 40 characters." even though the name is now valid (`name value length 40`). Settings: email `a@` then blur is silently not saved, no message (`alerts after invalid email in settings: 0`).
- 40-character names are accepted and 41 rejected (verified). Emoji and quotes in the name are fine.

### D9. Minor. Full-liquidation fee leaves dust shares

- **Violates:** plan 11 ("Fee when portfolio is worth less than $1: value goes to $0... holdings all 0").
- **Repro:** `tests/unit/tester-domain.test.ts` > "FINDING: fee sale leaves dust shares": VTI 0.005 shares plus VTIP 0.00001 shares (0.04 cents, rounds to 0) on a fee day. Value goes to 0 and the fee is capped correctly, but VTIP keeps its 0.00001 shares because `sellForCash` skips holdings whose rounded value is 0. Next tick does not crash. Cosmetic in the holdings table only.

---

# Cycle 2: re-test of the fixes and their neighborhoods

Environment: same machine, Node 24.17, Playwright 1.63 Chromium, dev server on
http://localhost:5173, projects `mobile` (375 x 812, isMobile, hasTouch) and `desktop`
(1280 x 800). Everything below was run, not read. Scratchpad probes:
`/private/tmp/claude-501/-Users-zacharycirillo-Desktop-Claude-investing-app--roundup/6a1b3958-496b-45d6-9c7f-a4ae8dc79e88/scratchpad/probe{,2,3,4,5}.mjs`.

## Verification of D1 to D9

### D1. Critical, import validation. VERIFIED FIXED.

`validateImportedState` in `src/state/validate.ts` rejects all 13 cycle-1 shapes plus the
garbage-date case, and it holds against 30 hostile shapes it had never seen
(`tests/unit/tester-cycle2.test.ts`, all 30 reject): deeply nested wrong types
(`events[i].fills[0].shares` a string, `history[3].valueCents` null), allocation summing to 99
and to 101, fractional allocation percents, `lessons` with 7 keys, `lessons` with 8 keys where
one is unknown, a lesson entry missing `readAt`, an unknown ticker in `holdings`, `events` as an
array of strings, a `Sweep` whose `fills` is a string, `profile: null`, `settings: []`,
`clock.startDate` of `2026-02-30`, an event date of `2026-13-01`, a fractional and a negative
`jarCents`, a string `confettiShown`, a bogus `demo.summerOverride`, empty `flags`, 4-entry and
out-of-range `quizAnswers`, `seed` at 2^32 and at -1, a 41-character name, an onboarded state
with an empty name, and a top-level string, number and null. A real 40-tick export is still
accepted (no false rejection). Browser: rejection now happens at both entry points with the
state and the current screen untouched, including from a **funded** Settings import
(`settings-import-message` reads "That file is not a Spare Change export. Nothing changed.",
`dayIndex` and `holdings.VTI` unchanged), and a valid export still round-trips through Settings
with `seed` 42, the same `dayIndex` and the same event count. Zero console and page errors on
every rejection path. The boot crash is gone for `lastOpenedRealDate` (see D10 for the half that
is not).

### D2. Seed re-derived on profile edit. VERIFIED FIXED.

`setProfile` only computes the seed while `onboardingComplete` is false. Browser: after
onboarding at `?seed=42`, editing **both** the name (to "Samantha") and the email (to
`sam@example.com`) leaves the demo tray seed at 42 and the exported `profile.seed` at 42, with
both new values stored.

### D3. Missing tooltip terms. VERIFIED FIXED (one gap remains, P7).

DOM audit after the fix: Portfolio now renders `term-usStocks`, `term-worldStocks`,
`term-bonds`, `term-realEstateFund`, `term-cashLike`, `term-holdings`, `term-fractionalShare`;
Home now renders `term-contributions` and `term-portfolio` alongside the cycle-1 set;
`term-closingPrice` renders on the Activity sweep line, so plan 4.6's fill-price tooltip finally
exists in the DOM. What remains unwrapped is the Welcome copy ("rounds up", "jar", "paycheck",
"Round-ups", "Catches"), which the coder wrapped and then deliberately reverted. See P7: the
justification for that revert was an over-specific assumption in **my** test, and I have removed
it.

### D4. Onboarding forward-jump. VERIFIED FIXED.

Every forward-jump combination, both viewports:

| From | `/onboarding/summer` | `/onboarding/fear` | `/onboarding/quiz` | `/onboarding/allocation` |
|---|---|---|---|---|
| empty storage | welcome | welcome | welcome | welcome |
| name only | summer | **fear** | summer | summer |
| name + fear | summer | fear | quiz | **quiz** |
| completed | home | home | home | allocation (Edit mix, by design) |

`/welcome` after completion also redirects to Home. The one remaining forward jump, name-only to
`/onboarding/fear`, is the coder's documented choice and is harmless: it leaves
`summerEarnedCents` null, which is the identical state to leaving the field blank, and criterion
3 explicitly supports that ("Leaving earnings blank uses $3,000 and says so on screen"). Not a
defect.

### D5. Scroll reset. VERIFIED FIXED.

Measured at 375 x 812 with the page scrolled to the bottom before each navigation: Home to
Lessons 801 to 0, Lessons to Settings 522 to 0, back to Home 522 to 0. Opening a lesson also
lands at 0. **Back-button navigation does not reset**: 1052 to 522, i.e. the browser's own scroll
restoration wins the race against the effect. That is conventional SPA behaviour and the plan
says nothing either way, so it is recorded as an observation, not a defect. Worth knowing that
the two directions are inconsistent.

### D6. Tooltip pin, blur, scroll, one-at-a-time. VERIFIED FIXED, but see D11.

Confirmed on the Portfolio screen with each term centred and the scroll settled first: exactly
one bubble ever exists (pinning a second term closes the first), Tab away closes it, a 200 px
page scroll closes it, Escape closes it, an outside tap closes it, a route change leaves no
orphan bubble, and a pinned bubble sits 8 px under its anchor. Zero console errors. The fix works
as described; the problem is what it does to terms that are **not** centred (D11).

### D7. Tap targets. VERIFIED FIXED for every named control; one control missed (D12).

At 375 x 812, with inline `Term` spans and the demo tray excluded per the revised plan 11, the
small-target audit is **empty on Home, Activity, Portfolio, Lessons and Settings**, and empty on
the catch sheet with "Change %" open. Every control the revised section 11 names is at or above
44 px. The Welcome screen is not clean (D12).

### D8. Email validation. VERIFIED FIXED.

Welcome is `noValidate` and validates on submit, so the app's own copy is what the user sees. The
valid-then-invalid-then-valid sequence behaves: `a@` on submit gives "That does not look like an
email. You can also leave it blank."; fixing it to `a@b.co` clears the message with no second
submit; breaking it again and submitting shows it again. The cycle-1 stale-message case is gone:
with a 41-character name **and** a bad email, the message reads "Keep the name under 40
characters."; fixing only the name switches the message to the email error rather than leaving a
lie on screen. Settings announces `settings-profile-error` on a rejected email and on an empty
name, leaves the stored value alone (exported `email` still `""`, `name` still "Sam"), and saves
once the value is valid.

### D9. Dust shares. VERIFIED FIXED.

The cycle-1 case (VTI 0.005 + VTIP 0.00001 shares on a fee day) now ends with every holding
exactly 0 and a portfolio value of 0. A partial sale still sells exactly the requested cents and
leaves the other holdings alone. One residual, not a defect: a portfolio of **pure** dust (total
value already 0 cents) hits the `target <= 0` early return in `sellForCash`, so the dust survives.
It is unreachable in practice, because a fee against a zero-value portfolio is capped to 0 and no
`Fee` event is emitted.

### The three unverified concerns. ALL THREE VERIFIED FIXED.

1. **`useHoldRepeat`.** Driven with real pointer events at 375 x 812: a 900 ms hold on
   `alloc-BND-minus` released 120 px off the button stops the repeat (20 to 14, then stable
   through a further 600 ms), the next real click steps (14 to 13), a keyboard Enter after that
   also steps (13 to 12), and a 700 ms hold released **on** the button steps 3 times without an
   extra tail click. The concern was real and is closed.
2. **Two bubbles at once.** Closed as part of D6, verified above.
3. **Catch sheet on a short viewport.** At 375 x 600 with the demo tray open and "Change %"
   expanded: the sheet caps at 540 px with a 778 px scroll height and scrolls internally, the
   accept button sits at y 128 to 180, the tray top is at y 260, `elementFromPoint` at the accept
   button's centre returns `catch-accept` (nothing covers it), and the click lands. Better than
   the coder's own note, which said the tray covers the button at that height. It does not.

## New defects found in the neighborhood

### D11. Major. A tooltip tapped in the lower part of the viewport closes itself immediately

- **Regression introduced by the D6 fix.** Violates criterion 20 ("Every term in the tooltip list
  (12.2) renders a tooltip where it appears") and plan 11 ("tooltips open on tap and close on
  outside tap").
- **What breaks:** `Tooltip.tsx` positions the bubble once at `anchor.bottom + 8` in fixed
  coordinates with no flip-above, and the D6 fix added `window.addEventListener('scroll', close,
  true)`. When the anchor is low, the portalled bubble lands past the viewport bottom, the browser
  emits a scroll event (scroll anchoring; the offset does not even change), and the capturing
  listener closes the bubble the same interaction that opened it. The user sees nothing.
- **Repro (`scratchpad/probe5.mjs`, mobile 375 x 812, Settings screen):** scroll so the term sits
  ~120 px from the viewport bottom, wait 1200 ms for every scroll event to drain, then
  `page.touchscreen.tap` it. No Playwright auto-scroll is involved.
  - `term-threshold` at y 524: **0 bubbles**. `term-catch` at y 684: **0 bubbles**. `term-fee` at
    y 692: **0 bubbles**.
  - The identical taps with the same terms centred (y 406) give **1 bubble** each. The trigger is
    position, not the term.
- **Breadth (`scratchpad/probe4.mjs`, clicking every distinct term on every screen):**
  - mobile 375 x 812: **11 of 29** terms close immediately. Home `roundUp`; Activity `sweep`,
    `fee`; Portfolio `holdings`, `usStocks`, `bonds`, `cashLike`; Settings `threshold`, `sweep`,
    `catch`, `fee`.
  - desktop 1280 x 800: **7 of 29**. Home `roundUp`; Activity `closingPrice`, `fee`; Portfolio
    `usStocks`, `cashLike`, `fractionalShare`; Settings `fee`.
- **Event trace (`scratchpad/probe3.mjs`):** `mouseenter -> pointerdown -> focus -> pointerup
  (open=true) -> click (open=true) -> SCROLL target=document y=247 -> closed`. `y` is unchanged
  across the scroll event.
- **Observed vs. expected:** observed, the tooltip opens and closes within one interaction and
  `data-term-open` returns to null. Expected, the bubble stays open until Escape, an outside tap,
  focus leaving, or a scroll the **user** performed.
- **Regression test:** `tests/e2e/tester-cycle2.spec.ts` > "D11: tapping a term low in the
  viewport keeps its tooltip open" and "D11 breadth".
- **Note for the fix:** closing on any scroll event is the wrong rule. Either compare
  `window.scrollY` / the container's `scrollTop` against the value captured at open and close only
  on a real delta, or reposition the bubble on scroll, and flip it above the anchor when it does
  not fit below.

### D10. Minor. Boot still throws on a corrupt `clock.startDate`, and the app renders nothing

- **Violates:** the intent stated in `src/state/bootstrap.ts` ("boot must never throw over it")
  and plan 11's malformed-state guarantee, though not a plan clause about import (import now
  rejects this shape correctly).
- **What breaks:** the coder guarded `runAutoAdvance` against an unparseable `startDate`, but the
  **render** path is unguarded. `src/screens/Home.tsx:51` calls
  `formatDateLong(simDate(state.clock.startDate, d))` for any reached milestone, and
  `src/screens/Lessons.tsx:54` does the same for `pathFinished`. `parseDate` throws
  `Error: Bad date: someday`, there is no error boundary, and React unmounts the whole tree.
  `src/domain/selectors.ts:13` guards only for the empty string, not for an unparseable one.
- **Repro (`scratchpad/probe.mjs` probe 1, and `tester-cycle2.spec.ts` > "D10"):** onboard,
  tap "Next day" once (so a milestone exists), export, then write the export back into IndexedDB
  under `spare-change-state` with `clock.startDate: "someday"`, and open `/?demo=1&start=...`.
  - Observed: `{ screen: null, bodyLen: 0 }`, page errors `Error: Bad date: someday` x3 plus
    React's "The above error occurred in the `<Home>` component".
  - Expected: the app renders something, the way it now does for a corrupt `lastOpenedRealDate`.
- **Exposure, stated plainly:** this is **not** reachable through import any more (the validator
  rejects a bad `startDate`) or through any UI action. It needs hand-edited storage, or a state
  written by the pre-validator build, which is exactly the upgrade case the coder's own comment
  says it was hardening against. That bounded exposure is why this is Minor and not a repeat of
  D1's Critical.

### D12. Minor. The Welcome "Have a backup? Import it" control is 168 x 20 at 375 px

- **Violates:** revised plan 11, "tap targets at least 44 px on every user-facing interactive
  control, **including but not limited to**" the named list. This control is neither an inline
  `Term` nor part of the demo tray, so neither exemption applies.
- **Repro:** open `/?demo=1&freeze=1&start=2026-06-15&seed=42` at 375 x 812 with empty storage
  and measure the button. `SMALL on screen-welcome: [ 'Have a backup? Import it 168x20' ]`. Every
  other screen's audit is empty.
- **Why it was missed:** the D7 fix worked from the enumerated list in the revised plan 11 and
  never audited the Welcome screen, which is outside the app shell.
- **Regression test:** `tests/e2e/tester-cycle2.spec.ts` > "D12".

## Cycle 3: re-test of D10 to D12, P6, P7, and the two disputes

Everything below is from commands and browser sessions I ran myself in this pass, against the
Cycle 3 plan revision (section 6 Global components' precise Tooltip spec, 5.4's ordering and
cross-field rules, and 12.1 rule 8 on Welcome).

### D11. VERIFIED FIXED

- **Coder's own regression suite, re-run by me:** `tests/e2e/tester-cycle2.spec.ts` > "D11
  breadth" reports **0 of 29** terms closing themselves on both viewports (was 11 of 29 mobile, 7
  of 29 desktop). `tests/e2e/tooltip.spec.ts` > "every term on every screen holds its bubble at
  every scroll position" checked **116 taps on mobile and 116 on desktop, 0 failures**, at four
  scroll offsets (25%, 50%, 72%, `vh - 130`) across all five screens, with the demo tray hidden.
- **Source verified:** `src/components/Tooltip.tsx`'s scroll and resize listeners now call
  `place()` (reposition), not `close()`. `place()` flips to `placement: 'above'` when the bubble
  does not fit below and clamps horizontally and vertically. `openedAt` records the opening
  event's timestamp so a synthetic follow-on from the same tap cannot close what it opened.
- **Flip-above, checked directly:** `tooltip.spec.ts` > "the bubble flips above its anchor when
  there is no room below" passes on both projects: `{ bubbles: 1, placement: 'above', inside:
  true, gap: 8 }`.
- **My own sweep, both viewports, both with the demo tray open and hidden:** tapped every `Term`
  on Home, Activity, Portfolio, Lessons and Settings at 375 x 812 and 1280 x 800, at scroll
  offsets including the lower half of the mobile viewport. Every tap that actually reached a term
  (as confirmed by `document.elementFromPoint`) opened exactly one bubble that stayed open past
  Escape, an outside tap, blur, and a route change, and only ever closed on one of those, never on
  a bare scroll.
- **Regression test:** `tests/e2e/tester-cycle2.spec.ts` > "D11 breadth" now green.

### D10. VERIFIED FIXED

- **Regression test, re-run by me:** `tests/e2e/tester-cycle2.spec.ts` > "D10: a hand-corrupted
  startDate in IndexedDB still boots" passes on both projects: `{ screen: 'screen-home', bodyLen:
  473 }`, zero console and page errors.
- **Source verified:** `src/domain/selectors.ts`'s `currentDate` now goes through
  `safeSimDate`, which returns `null` instead of throwing on an unparseable `startDate`.
  `Home.tsx` and `Lessons.tsx` call `formatDateLongSafe(safeSimDate(...))`, which degrades to an
  empty string. A new `src/components/ErrorBoundary.tsx` is wired into `main.tsx` as a backstop:
  it renders `app-error` with an `app-error-reset` button (min-height 44 px) that clears storage
  and reloads. I did not manage to trigger the boundary itself (no remaining render path throws
  on this input), so the boundary's own UI is verified by reading the code and by the DoD spec's
  clean run, not by observing it fire — consistent with what the coder flagged as unverified.
- **Bounded exposure, as before:** not reachable through import (the validator rejects a bad
  `startDate`) or any UI action; needs hand-edited storage or a pre-validator state. Still Minor.

### D12. VERIFIED FIXED

- **Regression test, re-run by me:** `tests/e2e/tester-cycle2.spec.ts` > "D12" passes: `welcome
  import link box: { width: 199.6, height: 44 }` at 375 x 812.
- **Source verified:** `src/screens/Welcome.tsx` now renders a visible `<button>` (min-height
  44 px) as the control, with the file `<input>` moved out of the tab order (`tabIndex={-1}`,
  `aria-hidden`) so it no longer creates a second same-named accessible control. `setInputFiles`
  on `welcome-import` still works; the four hostile-import Welcome tests and the funded-Settings
  round trip all still pass.

### P6. Validator ordering and cross-field rules: VERIFIED CLOSED

- **My cycle-2 AUDIT cases, re-run against the new validator:** a reversed `history` array,
  a reversed `events` array, `holdings.VTI = 1e308`, `jarCents` at `Number.MAX_SAFE_INTEGER`, an
  event `dayIndex` of 999999 against a lower `clock.dayIndex`, and `clock.dayIndex` at 100000 are
  now **all rejected** (`tests/unit/tester-cycle2.test.ts`, all 43 tests pass, including the
  AUDIT cases that now assert `accepted: false`). A genuine 40-tick export still imports; no false
  rejection anywhere I tried.
- **Source verified:** `src/state/validate.ts`'s new `validateOrdering` enforces non-decreasing
  `dayIndex` on `events` and `history`, caps every element's `dayIndex` at `clock.dayIndex`, and
  checks `milestones.firstSweepDayIndex` against an actual `Sweep` event. `money()` and `shares()`
  now reject non-finite values and cap at `MAX_MONEY_CENTS` (1e13) and `MAX_SHARES_PER_TICKER`
  (1e9), matching the plan's Cycle 3 bounds exactly. `clock.tradingDayIndex` is capped at
  `MAX_TRADING_DAY_INDEX` (399) and at `clock.dayIndex`.
- **Not re-chased further, out of this exchange's scope:** whether a `Sweep.tradingDayIndex` is
  also required to be at most `clock.tradingDayIndex` (as opposed to just capped at 399, which the
  coder's build notes flag as a judgment call). Worth a look in a future pass, not filed as a
  defect here.

### P7. Welcome `Term` wrapping: VERIFIED CLOSED

- **Source verified:** `src/content/strings.ts`'s `welcome.explanation` and all three `how` cards
  carry `[[term|label]]` markers, and `src/screens/Welcome.tsx` renders them through `RichText`.
  The rendered page shows `term-roundUp`, `term-jar`, `term-catch`, `term-sweep`, `term-etf`.
- **Keyboard-only onboarding, re-run by me:** `tests/e2e/tester-attacks.spec.ts` > "keyboard-only
  onboarding" passes on desktop. It now tabs until `welcome-name` is focused rather than assuming
  a single Tab (my own cycle-2 concession), and the observed tab count rose from 6 to **10** with
  the new terms in the tab order, which plan 11 explicitly permits ("not a claim about tab-stop
  count").
- Criterion 20 now passes in full: every term on the tooltip list (12.2) renders a tooltip where
  it appears, including on Welcome.

## Rulings on the coder's two cycle-3 disputes

The coder left two of my `tester-cycle2.spec.ts` tests failing (lines 325 and 365 as filed) and,
correctly, did not edit them. I own those files. **Both rulings go against me**, on my own
independent verification, not just the coder's report, and I have fixed my tests accordingly.

### 1. Line 325, "closes on scroll" assertion. CONCEDED. The coder is right.

The Cycle 3 plan revision (section 6, Global components) states in as many words: "on scroll it
repositions to keep following the anchor and does not close, so a scroll event alone ... is never
a valid close trigger." My test asserted the opposite: `bubbles === 0` after a page scroll. I
re-ran the test before touching anything and confirmed the failure myself: `bubbles after a page
scroll that moved { before: 253, after: 153 } : 1`. I then read `Tooltip.tsx` and confirmed the
scroll listener calls `place()`, not `close()`, exactly per the revised spec. There is no
implementation that satisfies both the plan and my old assertion. **Rewritten** to assert the
bubble stays at 1 after a real scroll and that its gap to the anchor stays within tolerance
(reposition, not close), then closes normally on Escape. Re-run: passes on both projects.

### 2. Line 365, "D11 low-viewport repro". CONCEDED. The coder is right.

The test scrolled each term to `innerHeight - 120` and tapped there. The coder said this
coordinate lands inside the demo tray (a fixed bottom drawer that `?demo=1` opens by default) on
mobile for all three terms and on desktop for `term-fee`, not on the term itself, and that hiding
the tray and repeating the identical taps gives 1 bubble each. **I verified this myself**, from
scratch, with a standalone script against the same dev server and the same `?demo=1` fixture URL,
using `document.elementFromPoint` at the exact tap coordinates before touching any test file:

```
375x812  tray open   term-threshold -> under demo-date   (inTray) bubbles=0
375x812  tray open   term-catch     -> under demo-tray   (inTray) bubbles=0
375x812  tray open   term-fee       -> under demo-reset  (inTray) bubbles=0
375x812  tray hidden term-threshold -> under term-threshold        bubbles=1
375x812  tray hidden term-catch     -> under term-catch            bubbles=1
375x812  tray hidden term-fee       -> under term-fee              bubbles=1
1280x800 tray open   term-fee       -> under demo-land-paycheck (inTray) bubbles=0
1280x800 tray hidden term-fee       -> under term-fee                    bubbles=1
```

Every 0-bubble result lands on the tray, not the term; hiding the tray flips every one to 1
bubble. The defect D11 was filed for is fixed (see D11 above: 0 of 29 on both viewports, 116/116
taps clean in `tooltip.spec.ts`). The test's repro coordinate, not the product, was wrong.
**Fixed** by clicking `demo-collapse` before the loop, so the tap coordinate reaches the term it
claims to test. Re-run: passes on both projects.

## Standing disagreements for the manager

**None.** The one standing disagreement carried from cycle 2 (whether Welcome's copy is exempt
from 12.1 rule 8) is resolved: the architect ruled for wrapping (Cycle 3 plan revision), the coder
wrapped it, and I verified it renders and that keyboard-only onboarding still completes. Both of
the coder's cycle-3 disputes are conceded above, with my own tests fixed to match, not left red.
There is no open item between the coder and me at the close of this exchange.

## Final numbers, verified by me

Every number below is from a run I executed in this pass, not from the build notes.

| Command | Result |
|---|---|
| `npm run lint:copy` | **ok, 70 files scanned, 0 problems** |
| `npm test` (Vitest) | **19 files, 223 tests, 223 passed, 0 failed** |
| `npm run build` | **clean** (lint:copy ok, `tsc --noEmit` clean, Vite ok, 876.59 kB JS / 28.26 kB CSS, the pre-existing chunk-size warning) |
| `npm run e2e` (both projects, 3 spec files) | **88 passed, 8 failed, 8 skipped**, 6.6 min |

The coder reported 180 unit tests and a 44/10/4 e2e split. Both were accurate for the tree as it
stood; the unit count is now 223 and the e2e total 104 because I added
`tests/unit/tester-cycle2.test.ts` (43) and `tests/e2e/tester-cycle2.spec.ts`.

Breaking down the 8 e2e failures:

- **7 are my own new regression tests, failing by design** until D10, D11 and D12 are fixed: D10 x2,
  D11 x2, D11-breadth x2, D12 x1 (mobile only).
- **1 is a flake, not a defect:** `tester-attacks.spec.ts` > "lesson read advances the ring"
  failed once inside the coder's shared `onboard()` fixture, at `fixtures.ts:57`, with
  `alloc-BND-pct` reading 33% instead of 20% after 15 `alloc-BND-plus` clicks. Cause: the +/-
  buttons accelerate on a 450 ms hold, so a click that the machine stretches past 450 ms steps
  several times. It failed while four suites and several probes were competing for the machine and
  **passed 3 of 3** when re-run idle. Not a product bug, but worth handing over: `fixtures.ts`
  does 30 rapid clicks on a hold-accelerating control, and `dod.spec.ts` uses the same fixture, so
  this will bite CI on a loaded runner. Setting the values directly, or asserting the value rather
  than the click count, would remove the hazard.

`dod.spec.ts` is **3 tests x 2 projects, 6 of 6 passing**. Note that its "tooltips open on tap and
close on Escape" case passes because it uses a term high on the page; that is why D11 was invisible
to it.

### Cycle 3 final numbers, verified by me

Run after the coder's D10/D11/D12/P6/P7 fixes and after I fixed my own two disputed tests (see
"Rulings on the coder's two cycle-3 disputes" above). Every number below is from a command I
executed in this pass.

| Command | Result |
|---|---|
| `npm run lint:copy` | **ok, 71 files scanned, 0 problems** |
| `npm test` (Vitest) | **19 files, 239 tests, 239 passed, 0 failed** |
| `npm run build` | **clean** (`tsc --noEmit` clean, Vite ok, 879.69 kB JS / 28.84 kB CSS, the pre-existing chunk-size warning) |
| `npm run e2e` (both projects, all spec files) | **112 tests, 104 passed, 0 failed, 8 skipped**, 8.6 min |

This matches the coder's reported cycle-3 numbers exactly (239 unit tests, 112 e2e tests, 8
skipped for the desktop-only/mobile-only cases) with one difference: the coder's own run still
showed 4 e2e failures (the two disputes, one per project) because it correctly left my files
untouched. After I conceded both disputes and fixed my tests, a clean re-run shows **0 failed**.
I ran the full suite twice, once before my test edits (112 tests: 100 passed, 4 failed, 8 skipped,
7.7 min — reproducing the coder's numbers exactly) and once after (112: 104 passed, 0 failed, 8
skipped, 8.6 min), so the before/after is my own observation, not taken on report.

`dod.spec.ts` is 6 of 6 passing on both projects, unchanged. Every screen walked during this pass
(Home, Activity, Portfolio, Lessons, lesson page, locked lesson, allocation edit, milestone modal,
catch sheet, Settings, Welcome) logged zero console and page errors; the allocation +/- buttons and
the catch sheet accept/decline/Change-% flow were exercised inside the funded fixture used by
`tooltip.spec.ts` and `tester-cycle2.spec.ts` and show no regression from the Tooltip rewrite.

## Rulings on the coder's three cycle-2 disagreements

The coder left three of my tests failing and did not edit them. I own those files. All three
rulings go against me, and I have updated my tests accordingly.

### 1. The four "hostile import files" e2e tests. **CONCEDED. The coder is right.**

Those four tests were written in cycle 1 as characterisation tests of the D1 bug: at the time
`parseImport` **accepted** the files, so the tests asserted what happened next (`$NaN` in the
catch sheet, `screen-home` after a bad import, `welcome-import-error` count 0). Revised plan 5.4
now says the opposite in as many words: "On any failure, the import shows the existing
import-error copy and leaves the current state completely untouched." My own unit tests in
`tests/unit/tester-domain.test.ts` > "plan 5.4 / 11: import validation" already asserted
`parseImport(...).ok === false` for exactly these four shapes, so my e2e suite was contradicting
my unit suite. The coder identified that correctly and did not quietly edit my file, which is the
right call. **Rewritten** in `tests/e2e/tester-attacks.spec.ts` to assert rejection with the error
copy shown, the screen unchanged, and zero console errors. The boot-with-a-bad-date coverage that
those tests used to carry is preserved, now through storage corruption instead of import, in
`tests/e2e/tester-cycle2.spec.ts` — and that is how D10 was found.

### 2. "Growth preset gives VTIP zero shares". **CONCEDED. The coder is right.**

I filed this as plan-level item P1 and titled the test "criterion 12 as written", i.e. the
pre-revision wording. The architect reworded criterion 12 to "every ticker with a nonzero weight"
and added a 6.5 note that the Growth preset's 0 % VTIP is intentional. Making my assertion pass
would now require changing the Growth preset against the plan. **Rewritten** to assert the
revised criterion: VTIP is exactly 0, and VTI, VXUS, BND and VNQ all hold shares, with the chart
at 31 points. It passes on both projects.

### 3. The "name 41 chars" test tail. **CONCEDED. The coder is right.**

After the 40-character name is accepted the test did a bare `page.goto(START)` and expected
Welcome. With a name persisted and onboarding incomplete, `/` correctly resumes at
`/onboarding/summer` per plan 6, so whether `welcome-name` existed depended on the IndexedDB
write race. The flake was in my test, not the app. **Rewritten** to delete the IndexedDB database
before the emoji case, since the demo tray (and therefore `demo-reset`) does not exist on the
onboarding screens.

### One ruling that goes the other way

Not one of the coder's three, but it belongs here. The build notes justify reverting the
criterion-20 `Term` wrapping on the Welcome copy because "the tester's 'keyboard-only onboarding'
test tabs once to reach the name field and it started failing". That test's single `Tab` was my
assumption, not a plan requirement: plan 11 asks only for "keyboard-only completion of
onboarding", with no tab count. My test should not be the reason an acceptance criterion goes
unmet. I have **loosened my test** to tab until `welcome-name` is focused, so wrapping the Welcome
terms is now free. Criterion 20 stays FAIL until that wrapping is restored (P7).

## Did the coder touch my test files? No.

The coder claims it modified nothing under `tests/`. Confirmed, on three independent lines of
evidence:

1. **Timestamps.** At the start of this pass, `tests/unit/tester-domain.test.ts` (09:53),
   `tests/unit/tester-store.test.ts` (09:51) and `tests/e2e/tester-attacks.spec.ts` (09:53) still
   carried their cycle-1 mtimes. The coder's earliest source change is `src/state/validate.ts`,
   `store.ts`, `persistence.ts` and `bootstrap.ts` at 10:06, and its own new tests are 10:15 and
   10:16. Everything of mine predates everything of the coder's.
2. **Content.** `tester-domain.test.ts` still reports exactly 46 tests and `tester-store.test.ts`
   exactly 3, matching the counts in my cycle-1 report.
3. **The failures were mine, verbatim.** My first `npm run e2e` this pass reproduced exactly the
   10 failures the coder described, with my own test titles and my own `console.log` strings
   (`home after garbage lastOpened without freeze:`, `VTIP shares on Growth preset:`). A file that
   had been edited would not fail in precisely the shape I wrote it.

The only edits to `tester-*` files in this pass are mine, each marked in-file with a comment
naming the concession or the reason.

## Plan-vs-build gaps

### Coder deviated and documented (build notes section 2 and 3): checked, all consistent with the running app

`SimContext.startDate`; synthetic seed 20260919 with the committed JSON matching the generator; Welcome import input; theme mirrored to localStorage; lesson marked read on mount; `stat-invested` inside the summer card; milestone modal deferred behind the paycheck queue; `Paycheck` ledger events; whole-file copy lint; "+$0.00 since you started" for zero growth (plan 4.8 says "$0.00" with no sign before the first sweep, the coder chose the signed form and said so).

### Coder deviated silently

1. Plan 4.6 tooltip "filled at the last closing price" was written (`S.home.sweepFillNote`, `TOOLTIPS.closingPrice`) but never rendered (D3).
2. 12.1 rule 8 not applied to Portfolio fund labels, Home "put in", the allocation explainer, or L3's "bonds" (D3).
3. Plan 6 step sequencing is enforced only by "has a name" (D4).
4. Import validation stops at key presence (D1). Plan 5.4 literally asks for that much, so this is shared with P3 below.
5. `setProfile` re-seeds after onboarding (D2). Plan 5.4 defines the seed formula but clearly intends `?seed` to win; the coder applied the override only at `completeOnboarding`.
6. No scroll reset on navigation (D5). The plan does not say it either way; it is a normal SPA expectation.

### Plan itself is wrong or contradictory (for the ARCHITECT)

- **P1. Criterion 12 versus 6.5.** Criterion 12 requires "holdings for each of the five tickers with nonzero shares", but the Growth preset is 55/25/10/10/**0**, so a Growth user never buys VTIP. Verified: Growth profile, 35 days, Portfolio `holding-VTIP[data-shares]` = `0`. The e2e only passes because it uses Balanced. Either the criterion should read "for every ticker with nonzero weight" or Growth needs a nonzero VTIP weight.
- **P2. Plan 11 "byte-identical exported state on two fresh runs"** is impossible as specified because `profile.createdAt` (wall clock at Welcome) and `clock.lastOpenedRealDate` live in the exported state. Exports are identical once those two fields are masked (verified in `tester-store.test.ts`). The guidance should say so.
- **P3. Plan 5.4 import rule is too weak for plan 11.** 5.4 says "validates `schemaVersion` and required keys"; plan 11 demands "malformed file: clear error, state untouched". The coder built 5.4 and D1 is the result. The plan should require a full shape and range check (types, integer cents, non-negative, date format, enum membership, array element shapes).
- **P4. Plan 11 "tap targets at least 44 px"** conflicts with plan 6's inline `Term` text and the compact demo tray. The build notes flag the terms; the architect should decide whether inline terms and the dev tray are exempt (D7 lists the user-facing ones that are not inline text).
- **P5. Plan 4.8** says both "Display always signed" and "Before the first sweep show '$0.00 since you started'". The coder picked signed; the plan should pick one.

**Cycle 2: P1 to P5 are all resolved in the plan and confirmed against the running app.** Criterion
12 passes on both presets under the new wording; the determinism guidance with the two wall-clock
fields masked passes; the 44 px exemptions are stated and the audit is clean under them (except
D12); 4.8's signed-zero form matches the build. Two new items:

- **P6. Plan 5.4's validator list has no ordering or cross-field consistency rule.** The validator
  correctly rejects every malformed *shape* I could construct, but it accepts a structurally valid
  file whose arrays are in the wrong order or whose fields disagree with each other, and those go
  straight into the UI. Verified accepted (`tests/unit/tester-cycle2.test.ts`, AUDIT cases): an
  `events` array reversed; a `history` array reversed (first `dayIndex` 40, last 5, so the Portfolio
  chart is drawn backwards, which is silently wrong output); an event `dayIndex` of 999999 against a
  `clock.dayIndex` of 40; `clock.dayIndex` 100000, far past the 400-point price series (it does not
  throw, prices are frozen at the end, and a tick from there still works); `jarCents` at
  `Number.MAX_SAFE_INTEGER`; and `holdings.VTI = 1e308`, which is *finite* and so satisfies 5.4's
  wording, but makes the portfolio value `Infinity`. A 200,000-element `events` array validates in
  ~500 ms, so there is no hang, but there is no size cap either. The architect should decide whether
  5.4 wants monotonic `dayIndex` on `events` and `history`, a consistency rule against `clock`, and
  plausibility bounds on money and shares, or whether this is out of scope. I did **not** file these
  as coder defects: the coder built exactly what 5.4 lists.
- **P7. Criterion 20 versus plan 11's keyboard requirement, on the Welcome screen.** The coder
  wrapped and then reverted the `Term` markers on `welcome.explanation` and the three "how" cards,
  because `Term` spans are `tabIndex=0` and sit before the name input. The conflict it cited was
  with *my* test's assumption of a single Tab, not with plan 11, which asks only for "keyboard-only
  completion of onboarding". I have loosened my test, so the coder can restore the wrapping. The
  architect only needs to rule if it disagrees: either Welcome's pre-onboarding marketing copy is
  formally exempt from 12.1 rule 8, or the terms get wrapped and criterion 20 is met. As things
  stand, criterion 20 fails partly because of this.

## Acceptance criteria

| # | Result | Reason |
|---|---|---|
| 1 | PASS | Fresh storage shows Welcome; `/portfolio` before onboarding redirects to Welcome; completed profile shows Home (coder e2e both viewports, re-checked in my spec). |
| 2 | PASS | 41 chars rejected, 40 accepted, emoji and quotes accepted, no password field anywhere. **Cycle 2:** the app now validates the email itself (`noValidate` + on-submit), the copy in 6.1 is what the user sees, and the stale-message case is gone (D8 fixed). |
| 3 | PASS | Unit: $98,460 and $44,367; 7% tooltip present; blank, 0 and negative earnings show the $3,000 note; $99,999,999 renders without NaN or Infinity. |
| 4 | PASS | "pointless" gives L7 card (coder e2e); "losing" gives L4 card immediately (my spec). |
| 5 | PASS | Boundaries 8/9 and 12/13 (unit); back-navigation and re-answering to 13 gives Growth (my spec). |
| 6 | PASS | Drag verified with mouse, touch (CDP) and arrow keys, moving points between two segments only; +/- and amber; second-confirm tap works and resets when the mix changes; explainer shows once. |
| 7 | PASS | Jar $0.00, tree stage 0, invested $0.00. **Cycle 2:** Home now lands at scrollY 0 (D5 fixed). |
| 8 | PASS | Coder e2e; round-ups from day 1 at every seed tried. |
| 9 | PASS | First sweep on day 3 to 7 at seeds 0, 1, 2, 3, 42, 99, 12345, 4294967295; 12 to 14 sweeps in 60 days; confetti gated once by the store. |
| 10 | PASS | $25.00 at 5%; pct 1 gives $5.00 and sweeps immediately on accept; pct 20 gives $100.00; Settings still 5%. |
| 11 | PASS | Days 3 and 17 queue in order; declining the first keeps the second (`pay-3` then `pay-17`). |
| 12 | **PASS (cycle 2)** | Re-tested against the revised wording. Growth: VTIP exactly 0 (weight 0%), VTI 0.0853 / VXUS 0.1710 / BND 0.0621 / VNQ 0.0511 shares, chart 31 points. Balanced still passes. Fee line and provenance label verified. P1 closed by the architect. |
| 13 | PASS | Fee event on July 1, value drops exactly $1.00 on flat prices, capped at portfolio value, growth includes fees ($600 in, $100 fee, growth -$1.00). |
| 14 | PASS | L1, L2, L3, L7 unlock with pulse; opening L7 marks read and ring goes 0 to 1 (my spec). |
| 15 | PASS | Only `since you started` growth lines; bundle has no "daily"/"per day" growth wording; the one "daily" is the tooltip saying a daily number is never shown. |
| 16 | PASS | Reload immediately after three Next-day taps still shows day 3 (write race did not bite); reset returns to Welcome. |
| 17 | PASS | Own export re-imports (also across seeds, seed 7 export restores day 7 and seed 7); `schemaVersion: 2` rejected with the copy message. Malformed shapes are D1. |
| 18 | PASS | Unit: 2, 30 cap, freeze, negative; browser: two-days-ago date without freeze shows "2 days went by" toast and day 2. |
| 19 | PASS | Coder e2e; September 1 tick sets `firstSummer` and "kept this summer" sums June 1 to date (unit). |
| 20 | **PASS (cycle 3)** | First sentence PASS: `lint:copy` ok on 71 files, bundle has zero U+2014/U+2013. Second sentence now PASS: **D11** is fixed (0 of 29 terms fail on either viewport, 116/116 taps clean in `tooltip.spec.ts`) and **P7** is closed (Welcome's terms are wrapped, `term-roundUp`/`term-jar`/`term-catch`/`term-sweep`/`term-etf` all render, keyboard-only onboarding still completes at 10 tab stops). Every term in the tooltip list (12.2) now renders a readable tooltip where it appears, on both viewports, at every scroll position tried. |
| 21 | PASS | Coder e2e (dark applies immediately, survives reload); mirror logic read and consistent. Not re-run by me. |
| 22 | PASS | Zero console errors and page errors across my runs on both viewports including the lesson page, locked lesson, milestone modal and allocation edit; reduced motion by coder e2e. |
| 23 | PASS | `scrollWidth <= innerWidth` at 375 on Home, Activity, Portfolio (empty and funded), Lessons, lesson page, locked lesson, allocation edit, milestone modal, catch sheet with tray open; bottom tab bar at 375, left rail at 1280. |
| 24 | **PASS (cycle 3)** | Verified by me, not taken on report: `npm run lint:copy` ok (71 files), `npm test` 19 files / 239 tests / 239 passed, `npm run build` clean. `npm run e2e` runs the DoD scenario on both viewports and `dod.spec.ts` is 6/6 on both; the full suite is 112 tests, 104 passed, 0 failed, 8 skipped after my two disputed tests were fixed (see "Cycle 3 final numbers"). No caveat remains. |

## What I tried that held up

**Cycle 2 additions:**

- The import validator against 30 hostile shapes it had never seen: every one rejected, and a real
  40-tick export still accepted. No false rejections anywhere, including from a funded state.
- A 200,000-element `events` array validates in ~500 ms. No hang, no stack overflow.
- `clock.dayIndex` of 100,000, far past the 400-point price series: prices freeze at the series end
  as designed, and a tick from there does not throw.
- Rejection at both import entry points leaves the current screen as well as the state untouched,
  with zero console and page errors on every path I tried.
- Boot with a corrupt `lastOpenedRealDate` in storage, unfrozen: renders Home, no errors. The
  browser auto-advance path and the "2 days went by" toast still work.
- The full onboarding route-guard matrix in both directions, plus refresh at each step, quiz Back
  and re-answer, and Portfolio "Edit mix" into `/onboarding/allocation` after completion (still
  allowed by design; Save returns to Portfolio, not Home).
- `useHoldRepeat` under real pointer events: hold-and-release off the button, the click after it,
  the keyboard activation after that, and a hold released on the button.
- A walk of every screen plus opening a lesson, editing the mix, and accepting a catch: zero
  console errors, so the D3, D5, D6 and D7 edits introduced none.
- Tooltips: one at a time, closes on focusing a non-term control, closes on a scroll that actually
  moved, closes on Escape, closes on an outside tap, no orphan bubble after a route change, and a
  pinned bubble sitting 8 px under its anchor. All of this holds when the term is not low in the
  viewport (D11).
- The 44 px audit is clean on all five in-app screens and on the catch sheet with "Change %" open.
- The catch sheet at 375 x 600 with the tray open and "Change %" expanded: caps at 540 px, scrolls
  internally, accept button unobstructed and clickable.

**From cycle 1, still passing:**

- Money: 200 ticks with random accept/decline/pct catches and random demo paychecks: `sum(fills) === sum(Sweep)`, every ledger amount an integer, no negative holding, sweep-day value equals previous value at today's prices plus the sweep with **0 cents** drift (55 sweeps, 7 fees). Remainder cents go to the largest weight, ties to VTI. Exact-dollar phone plan on the 20th produces no round-up and no feed line.
- Determinism and batching: identical state on two fresh runs; 30 x Next day equals 4 x Skip a week plus 2 x Next day; `tickN(0)` is identity; exports identical across runs except the two timestamp fields.
- Rules: threshold $5 to $1 with $3 in the jar sweeps only at the next tick, for $3 plus that day's round-ups (unit and browser); paused round-ups keep purchases and leave the jar and L1 untouched; fee under $1 caps at the value and the next tick does not crash; dip lesson does not fire from fees alone over 45 flat days; tree stage boundaries 7/21/45/90/180; week window excludes day D-7 and includes D-6; allocation +/- and drag at 0 and 100 never break the sum or go negative; quiz with empty answers is Conservative; `parseDollarInput` rejects `1e5`, `-500`, three decimals.
- Persistence: IndexedDB mocked to throw (private mode): store hydrates, 10 ticks run in memory, fallback flag set, export/import/reset all resolve. Immediate reload after actions keeps them.
- UI: keyboard-only onboarding on desktop (Tab and Enter only, 6 tabs to the summer Continue, 27 to Save; tooltips open on focus). Long-press on the logo opens the tray on touch and mouse without `?demo`. Age select tampering to 99 is clamped to 24. Refresh at summer, fear, quiz and allocation resumes there. Two queued paychecks prompt in order. Back button during the sweep animation and returning leaves no dangling animation and no errors. `/lessons/L9` redirects to Lessons. Catch sheet accept button bottom (392) sits above the open tray (472) on mobile.
- Copy: built bundle has no em or en dashes, no "should have", "wasted", "bad with money", "missed out", "guaranteed", "will be worth"; "just", "only", "behind" appear only in non-shaming uses.

## Unverified concerns

- `useHoldRepeat` never resets `held` when a press is released outside the button (pointerleave stops the timers but not the flag), so the next real click on that +/- button is likely swallowed. Not reproduced; reasoning from `src/lib/hooks.ts`.
- Two tooltip bubbles were open at once in the scripted sequence in `scratchpad/shots.mjs` (pinned "World stocks" plus "Cash-like"). The mechanism (per-instance pin state) is clear; the exact trigger for the second bubble in that run was not isolated.
- On viewports shorter than 812 px with the tray open and "Change %" expanded, the catch sheet has no max-height or internal scroll, so the accept button could be pushed off the top. Not in the plan's viewports; not measured.

**Cycle 2: all three cycle-1 concerns are now confirmed and fixed** (see "The three unverified
concerns" above). New concerns from this pass, stated plainly as unconfirmed:

- Extra unknown keys **inside** `profile` and `settings` survive validation and are carried into the
  store and back out through export (`profile.injected` came back verbatim). Only unknown *top-level*
  keys are dropped. I could not construct any harm from this in this app, and the plan does not
  forbid it. Unconfirmed as a defect; recorded so nobody rediscovers it.
- The back-button scroll behaviour (1052 to 522, not 0) looks like a race between `ScrollToTop` and
  the browser's own scroll restoration. It reproduced in the one measurement I took, but I did not
  repeat it enough to know whether it is deterministic.
- `sellForCash` returns early on a pure-dust portfolio (`total === 0`), leaving the dust shares. I
  could not construct a path that reaches it in the running app, because a fee against a zero-value
  portfolio is capped to 0 and emits no `Fee` event. Unconfirmed as reachable.

## What I could not test

- iOS Safari long-press (callout menu) and real-device touch drag; touch was driven through CDP in Chromium only.
- `npm run prices:real` and the "real" provenance label path (needs network; Stooq returned HTML for the coder too).
- Private browsing in a real browser (mocked `idb-keyval` only) and the `settings-storage-fallback` line rendering.
- The 400-day series end ("prices are frozen" tray note): about 18 simulated months, not exercised.
- The milestone PNG "Save image" download in a real browser (only the anchor and data URL were inspected).
- Dark mode was not visually audited by me beyond the coder's e2e class assertions.
- Screen reader behaviour of `Term` (`aria-describedby` only appears while open).

**Cycle 2 additions to this list, and do not read any of it as a pass:**

- D11 was found and characterised in Chromium only. Whether Safari and Firefox emit the same
  scroll event on portal insertion is unknown, so the *breadth* numbers (11 of 29, 7 of 29) may
  differ on other engines. That the bubble closes on any scroll event is engine-independent and
  certain from the code.
- Real-device touch for D11: everything was Chromium's touch emulation. On a real phone,
  momentum scrolling makes this worse, not better, but I did not measure it.
- The rewritten hostile-import e2e tests exercise rejection at Welcome and at a funded Settings
  import. I did not test a rejected import while a catch sheet or a milestone modal was open.
- I did not re-audit dark mode after the D7 box-size changes to the pause switch and the Settings
  inputs, which the coder asked for. The coder says it toggled both states in the browser; I did
  not independently confirm the visuals.
- The upgrade path that makes D10 reachable (a state written by the pre-validator build, then
  opened by this build) was simulated by writing to IndexedDB directly, not by actually running
  the old build first.

## Tests added

All new files are prefixed `tester-`; nothing under `src/` or the coder's tests was modified. The failing cases are intentional regression tests for the defects above and will go green when the defects are fixed.

- `tests/unit/tester-domain.test.ts` (46 tests, 15 fail by design: 13 import shapes, garbage `lastOpenedRealDate`, dust shares). Run: `npx vitest run tests/unit/tester-domain.test.ts`.
- `tests/unit/tester-store.test.ts` (3 tests, 1 fails by design: profile edit re-seeds). Mocks `idb-keyval` to throw. Run: `npx vitest run tests/unit/tester-store.test.ts`.
- `tests/e2e/tester-attacks.spec.ts` (26 tests per project, 9 fail by design per project: four hostile imports, seed rename, stale Welcome error, allocation URL bypass, VTIP zero shares on Growth, tooltip coverage). Run: `npx playwright test tests/e2e/tester-attacks.spec.ts` (about 3.5 minutes, needs the dev server or lets Playwright start it). Screenshots land in the scratchpad path above.
- Full unit run with everything: 149 tests, 133 pass, 16 fail, all failures in `tester-*` files. `npm run typecheck` is clean with the new files.
- Scratchpad-only scripts (not in the repo): `shots.mjs` (orchestrator items a and b) and `scroll.mjs` (D5 measurements).

### Cycle 2

Two new tester-owned files, plus edits to three of my own cycle-1 tests (the concessions above).
I still touched nothing under `src/` and nothing in the coder's tests.

- `tests/unit/tester-cycle2.test.ts` (43 tests, all pass): 30 new hostile import shapes that must
  be rejected, 8 AUDIT cases probing what the validator *accepts* (these feed P6), and the D9 dust
  neighborhood. Run: `npx vitest run tests/unit/tester-cycle2.test.ts`.
- `tests/e2e/tester-cycle2.spec.ts` (~26 tests per project): import rejection at both entry points
  including from a funded Settings import, boot with corrupt storage (D10), seed frozen after
  profile edits, the full forward-jump route-guard matrix, scroll reset including the back button,
  tooltip pin/blur/scroll/one-at-a-time and the D11 regression tests, 44 px audits including the
  catch sheet and D12, the email-validation sequences, the catch sheet at 375 x 600, `useHoldRepeat`
  after an off-button release, and a console-cleanliness walk. Run:
  `npx playwright test tests/e2e/tester-cycle2.spec.ts`.
- Edited in `tests/e2e/tester-attacks.spec.ts`, each with an in-file comment naming the concession:
  the four "hostile import files" tests now assert rejection; the Growth/VTIP test now asserts the
  revised criterion 12; the "name 41 chars" test now clears storage before its emoji case; and the
  keyboard-only onboarding test no longer assumes the name input is the first tab stop.
- Scratchpad-only probes (not in the repo): `probe.mjs` (D10 boot, Portfolio tooltips, Edit-mix
  destination), `probe2.mjs` and `probe3.mjs` (tooltip event traces), `probe4.mjs` (the 29-term
  sweep behind D11's breadth numbers), `probe5.mjs` (settled-scroll taps, the clean D11 repro).

---

## Cycle 4 verification

**Verdict: SHIP WITH RISK.** Six of the seven risk-closure items hold up under attack and the
persistence race (C4-1), the item most likely to hide a subtle bug, survived every hostile variant
I could build; C4-4 is the exception - its own Escape acceptance criterion is broken by the fix
that was written for it, and the scan it is measured by reports a serious violation on every
screen in dark mode.

Everything below is from commands I ran in this pass. Nothing is taken on the build notes' word.

### Per-item status

| Item | Status | Basis |
|---|---|---|
| **C4-1** persistence write race | **VERIFIED** | 10-cycle reload loop reproduced, plus 11 harder variants I wrote (below). Nothing lost, nothing resurrected, no crash. |
| **C4-2** allocation touch robustness | **VERIFIED** | CDP touch drag both directions, 4000 px past both ends, `touchCancel` mid-drag, 44 x 56 px hit areas at 375, arrows and shift-arrows on all four handles. |
| **C4-3** long-press robustness | **VERIFIED** | Touch hold opens the tray, `contextmenu` is prevented mid-press, a cancel never opens it, a drag away never opens it, a short tap never opens it, a press behind an open sheet is harmless. |
| **C4-4** tooltip accessibility | **FAILED** | Light-mode scan is genuinely clean (0 serious, 0 critical, no rule excluded). But Escape does **not** close a hover-opened tooltip (D13), which is half of the item's own acceptance text, and the same scan in dark mode reports a serious `color-contrast` violation on 16 of 17 screen states at both viewports (D14). |
| **C4-5** milestone PNG | **VERIFIED** | Reproduced 1080 x 1080 for all three planted cards and for a milestone I fired naturally by simulating 14 weeks. One neighbourhood defect, D16. |
| **C4-6** error boundary | **VERIFIED** | Boundary renders, reset recovers to a Welcome I then onboarded end to end back to a funded, day-advancing Home. Gating is honest: in a real `vite build` the string `boom` is not in the bundle and `?boom=1` does nothing. |
| **C4-7** bundle size | **VERIFIED** | Confirmed against a real production build served by `vite preview`, not just the build log. |

### Confirmed defects

#### D13. Major. Escape does not close a hover-opened tooltip; the C4-4 focus return reopens it.

`Tooltip.tsx:134` closes the bubble and then calls `anchor.current?.focus()`. When the tooltip was
opened by hover (or by anything that left focus elsewhere), that `focus()` fires the anchor's
`onFocus`, which is `show(pinned.current, e.timeStamp)` - and `close()` has just set
`pinned.current = false`, so `show(false)` runs and sets `open` back to true in the same React
batch. Net effect: the bubble never closes. A second Escape does close it, because by then the
anchor already holds focus and `focus()` is a no-op.

**Repro** (`tests/e2e/tester-cycle4.spec.ts`, "Escape on a HOVER-opened tooltip must close it"):

```
npx playwright test tests/e2e/tester-cycle4.spec.ts --project=desktop -g "HOVER-opened"
```

1. `page.goto('/?demo=1&freeze=1&start=2026-06-15&seed=42')`, Welcome screen.
2. `page.getByTestId('welcome-name').focus()` - park focus off the term.
3. Hover the first `[data-testid^="term-"]`. Bubble appears.
4. Press Escape.

**Observed:** `hover-open Escape: active welcome-name -> term-roundUp, bubbles after Escape = 1`.
Focus does return to the anchor, but the bubble is still open.
**Expected:** zero bubbles.

**Violates:** plan 13.2 C4-4, "Escape closes the open tooltip and returns focus to its anchor," and
plan 6 "Global components," "closes on Escape." This is a **regression introduced by C4-4** - before
this cycle the Escape handler was `close()` with no focus call, and it closed cleanly. The coder's
own test (`axe.spec.ts:175`) misses it because both of its cases open the tooltip by click or by
Enter, which leave the anchor already focused, so the `focus()` call is a no-op there.

#### D14. Major. The C4-4 scan fails in dark mode: a serious violation on 16 of 17 screen states.

I re-ran the coder's exact 17-state axe walk with the theme forced to dark
(`tests/e2e/tester-axe-dark.spec.ts`, same `AxeBuilder`, same `reducedMotion: 'reduce'`, no rule
excluded). Every state except the error boundary reports `color-contrast: serious`, on both the
`mobile` and `desktop` projects.

**Repro:**

```
npx playwright test tests/e2e/tester-axe-dark.spec.ts
```

**Observed** (worst offenders, measured by axe):

| Element | Pair | Ratio |
|---|---|---|
| Every primary button (`welcome-continue`, `settings-theme-*`, `settings-threshold-*`, `milestone-save`) | `#ffffff` on `#58c88c` | **2.08:1** |
| `settings-reset` and the "New" badge | `#ecf4ee` on `#fa8c76` | **2.06:1** |
| `demo-land-paycheck` | `#ecf4ee` on `#f0b446` | **1.65:1** |

**Expected:** the C4-4 acceptance text says the scan "reports zero serious or critical violations"
and does not qualify a theme.

**Scope caveat, stated plainly:** plan 13.1 lists "dark mode visual re-audit" as deliberately left
open this cycle, so the coder has a defensible reading that C4-4 is a light-mode criterion. I am
filing it anyway because the criterion as written is unqualified and because the user asked
specifically whether anything became unreadable in dark mode. **This needs an architect or manager
ruling on which plan text governs, not a coder fix argued into or out of existence.** The dominant
cause (white on the dark `--c-leaf`) is pre-existing and untouched by cycle 4; the part cycle 4 did
cause is D15.

#### D15. Minor. The C4-4 palette work measurably lowered dark-mode contrast.

The white-to-`text-ink` label swap in `Button.tsx` (`danger`, `amber`) and on the allocation bar
segments raises contrast in light mode and lowers it in dark mode, where `--c-ink` is `#ecf4ee`.
Computed (WCAG 2.x relative luminance, my own calculation, cross-checked against axe's reported
numbers):

| Surface | Before (white) | After (ink) |
|---|---|---|
| `danger` button on dark coral | 2.31:1 | **2.06:1** |
| `amber` button on dark amber | 1.85:1 | **1.66:1** |
| Allocation segment label on VTI green | 3.38:1 | **3.02:1** |
| Allocation segment label on VTIP grey | 2.84:1 | **2.53:1** |

All eight values fail 4.5:1, so nothing readable became unreadable - but four surfaces got worse in
a theme build notes deviation 2 says was "untouched." It was untouched as *tokens*; the labels sitting
on it were not. Fix is a theme-aware label token rather than a flat `text-ink`.

#### D16. Minor. The milestone save control is fully obscured by the demo tray at 375 px, on all three cards.

**Repro** (`tests/e2e/tester-cycle4.spec.ts`, "the save control is reachable at 375 px WITH the demo
tray open"): onboard, plant the three milestones, load `/?demo=1&...` so the tray is open by
default (plan 6.13), open the milestone modal, and ask `document.elementFromPoint` what is on top
of the centre of each `milestone-save`.

**Observed:**

```
first100Kept: save control obscured by demo-skip-week
firstSummer:  save control obscured by demo-tray
pathFinished: save control obscured by demo-tray
```

**Expected:** `milestone-save`. The control itself is a correct 44 px tall; it is simply covered.

The coder hit the same obstruction on desktop and worked around it *in the test* by dropping
`?demo=1` (build notes, "Found and fixed during this cycle"). That makes the C4-5 result honest but
leaves the obstruction shipped. This is the **third** instance of this class - cycle 3 had terms
behind the tray, and the coder's own notes record a fourth. Plan 11 exempts the tray from the
tap-target rule; it does not license the tray to sit on top of user-facing controls. Mitigation
exists (`demo-collapse`), which is why this is Minor and not Major.

#### D17. Minor. `vite.config.ts` documents a mechanism that was withdrawn.

`vite.config.ts` lines 4-11 state: "Route-level `React.lazy` (see `src/routes.tsx`) already keeps
Recharts out of the initial load, since every chart lives on a lazily loaded screen."

**Observed:** `src/routes.tsx` contains no `React.lazy` and no `Suspense`; all eleven screens are
static imports. `grep -c "lazy" src/routes.tsx` is 0. The withdrawal is correctly recorded in the
build notes (deviation 1) but the code comment describing the shipped mechanism was left saying the
opposite, in the one file a future reader will open to understand C4-7.

#### D18. Minor, latent, not reachable from the UI today. `dragAllocation` has two NaN holes.

`src/domain/risk.ts:102`. C4-2 gave this function a second caller (the arrow keys), so it is worth
recording what it does with bad input:

- `dragAllocation(a, 0, NaN)` returns an allocation with `NaN` in both adjacent segments and a total
  of `NaN`, because `applied === 0` is false for `NaN` so the early return is skipped.
- `dragAllocation(a, NaN, 10)` passes the `boundaryIndex < 0 || >= 4` guard (every `NaN` comparison
  is false), so `TICKERS[NaN]` is `undefined` and the result gains an `"undefined": NaN` key.

**Repro:** `npx vitest run tests/unit/tester-cycle4.test.ts` - the two `it.fails` cases marked
"KNOWN HOLE". They are marked known-failing rather than reported as user-facing, because neither
caller can produce a `NaN`: `onPointerMove` guards `width <= 0` and reads numeric `clientX`, and
`onKey` only ever passes +/-1 and +/-5. A `Number.isFinite` guard closes both.

### Ruling on the coder's route-level `React.lazy` call

**I agree the withdrawal was the right call, and I agree with the reasoning.** Plan 13.3 says every
existing test must stay green and plan 13.4 forbids editing the tester's files; plan 13.2 permits
`manualChunks` on its own ("React.lazy plus Suspense ... **and/or** ... manualChunks"); and the
component-level split hits the number anyway. The coder escalated instead of quietly rewriting my
assertions, which is exactly the right behaviour.

**But the four tests were not defending a real requirement.** Two of them are mine and I have read
them again:

- `tester-cycle2.spec.ts:178` (D4 route guard) does
  `page.evaluate(() => document.querySelector('[data-testid^="screen-"]')?.getAttribute(...))`
  immediately after `page.goto`. It is testing which screen the guard lands on. The synchronous
  DOM read is scaffolding, not the assertion.
- `tester-attacks.spec.ts:680` (tooltip coverage) does `locator(...).evaluateAll(...)` immediately
  after a nav click. It is testing which terms exist on Portfolio. Same story.

Both relied on synchronous rendering by accident. Neither asserts, and neither should assert, that
a route transition is synchronous. **So it was plan constraint 13.3, not the product, that blocked
route-level splitting.** If the architect wants route-level lazy in a later cycle, I will add an
auto-waiting `await expect(...).toBeVisible()` before each of those reads - it is a two-line change
per test and it does not weaken either assertion.

Worth saying, though: it buys nothing measurable. I served a real `vite build` through
`vite preview` and watched the network. A cold load of `/` requests exactly
`index-*.js`, `react-*.js`, `motion-*.js` and nothing else; `charts-*.js` (399.02 kB) is not
requested until a chart mounts. Route-level lazy would move the same 399 kB that is already moved.

### Regression statement

**No regression from cycle 4 in any pre-existing suite.** Every failure in my final full run is one
of my own new adversarial tests, failing by design against D13 and D14.

- `npm test`: 275 passed, 0 failed. The 239 that existed at the cycle-3 close all still pass; the
  coder added 11 and I added 25.
- Full `npm run e2e`, both projects: 0 failures in `dod.spec.ts` (3 x 2), `tooltip.spec.ts` (4 x 2,
  the 116-tap-per-viewport full sweep, unchanged assertions after the `Tooltip.tsx` edits),
  `tester-attacks.spec.ts` (26 x 2), `tester-cycle2.spec.ts` (23 x 2), `cycle4.spec.ts` (14 x 2) and
  `axe.spec.ts` (2 x 2).
- Export/import round trip: green (`tester-cycle2.spec.ts` D1-neighbourhood cases and `dod.spec.ts`
  step 14). I additionally verified by hand that a corrupt mirror cannot resurrect pre-import state:
  I exported a day-3 state, rewound it to day 0 in the file, imported it, reloaded, and the app
  stayed at day 0. The `freezePersistence()` latch does what the build notes claim.
- Onboarding route guard: re-verified from empty storage on eight routes and from a half-finished
  profile, including that a typed `/onboarding/allocation` cannot skip the fear check and quiz.
- Zero console and zero page errors on every screen I walked, on both projects, including a direct
  refresh on `/`, `/activity`, `/portfolio`, `/lessons`, `/lessons/L1`, `/lessons/L8` (locked) and
  `/settings`, and on a throttled connection.
- `npm run lint:copy`: ok, 75 files, 0 problems. a recursive grep for the em dash character across `src/` and `tests/` finds one hit, the
  regex inside `copy.test.ts` that enforces the rule. No em dash entered the new code.
- `npx tsc --noEmit`: clean, including my new specs.
- **The coder did not edit any tester file.** `tester-attacks.spec.ts` (11:12), `tester-cycle2.spec.ts`
  (12:19), `tester-cycle2.test.ts` (11:11), `tester-domain.test.ts` (09:53) and
  `tester-store.test.ts` (09:51) all carry mtimes from before the first cycle-4 edit (14:11), and
  their test counts still match what this report recorded at the cycle-3 close (43 in
  `tester-cycle2.test.ts`, 26 and 23 per project in the two e2e files).

### What I attacked and it held

**C4-1, the item I spent the most time on.** Beyond re-running the coder's ten-cycle loop, all of
these pass, on both projects:

- Reload with zero delay immediately after accepting a catch; after a settings change; in the same
  frame as a sweep animation.
- `page.close({ runBeforeUnload: true })` instead of a reload, then reopening in a new page: the
  action survived, so the `pagehide` flush is doing real work.
- A mirror **older** than IndexedDB never rolls the app back. A mirror **newer** wins, is applied,
  and is written back to IndexedDB before render (I forced this by capturing the mirror, advancing a
  day, then rewriting IndexedDB with the older record: the app recovered the lost day and repaired
  the record).
- A truncated mirror (`{"rev":999999,"state":`) is ignored, not thrown on. A structurally valid
  mirror with a huge `rev` and a garbage `clock.startDate` boots to a rendered page, not a blank one.
- Two tabs: a stale second tab that is backgrounded and closed does **not** clobber the first tab's
  five newer actions - the revision comparison holds. Two tabs both writing is last-writer-wins, as
  the build notes admit; a fresh third tab sees one of the two real states and boots cleanly, with
  no resurrection loop. Multi-tab is not in the plan, so this is a documented limitation, not a
  defect.
- Reload immediately after Reset demo, twice in a row, still lands on Welcome. (Observation: the
  reload's own `pagehide` flush repopulates the mirror with the *reset* state, 1116 bytes. Harmless,
  because boot sees no IndexedDB record and discards the mirror - but it is a live example of the
  flush running after a clear.)
- At the adapter level (`tests/unit/tester-cycle4.test.ts`, 25 tests): a `localStorage.setItem` that
  throws does not break a state change or the flush; a `getItem` that throws still hydrates from
  IndexedDB; a string, null, object, boolean, `NaN`, `Infinity`, negative or equal `rev` never beats
  a real record; a record with no `rev` is trusted over a mirror that has one; the freeze latch drops
  writes until the next hydrate and `removeItem` lifts it; a hundred identical flushes never advance
  the revision; twenty overlapping `setItem` calls leave both stores agreeing on the same revision;
  and `persistedEnvelopeJson()` is byte-identical to what zustand writes, which is what stops every
  `pagehide` from inflating the revision.

**C4-2.** Touch drag right then left moves only the two adjacent segments and the total stays 100.
Dragging 4000 px past either end clamps to 0/100 with every segment a valid integer. `touchCancel`
after leaving the bar ends the drag, leaves a valid mix, and no subsequent pointer move touches the
allocation - the drag really is off, not merely idle. All four handles are 44 x 56 px at 375. Arrow
keys step exactly 1 and shift-arrows exactly 5, correctly clamped where the neighbour runs out
(handle 3's shift-step moves 4, not 5, because VTIP only had 4 left; that is right, and my first
version of the test was wrong about it). The +/- flow and the amber risk read are unaffected.
Keyboard-only onboarding still completes with the four new tab stops.

**C4-3.** A real touch hold opens the tray and a short tap immediately after does not toggle it. A
`contextmenu` dispatched mid-press is `defaultPrevented` and the tray still opens. A `touchCancel`
partway never opens it and a later full press still works. A press dragged well away from the logo
does not open it. A short tap never opens it. A long press behind an open catch sheet leaves the
sheet usable.

**C4-4, the parts that hold.** The light-mode scan is real: `new AxeBuilder({ page }).analyze()`
with no `disableRules` and no `exclude`, 17 states x 2 viewports, 0 serious and 0 critical, and the
four moderate findings the build notes list (`region`, `page-has-heading-one`, `heading-order`,
`landmark-one-main`) are exactly what I see too - the exclusion list is honest because there is no
exclusion list. `role="tooltip"` is on the bubble whenever it is rendered, `aria-describedby` points
at it while open, and the anchor's accessible name is now "term, hint" rather than 29 identical
hints. Escape returns focus correctly in all four cases I tried; it just fails to close in one of
them (D13). The 116-tap sweep is unchanged and green.

**C4-5.** All three planted cards download a real PNG with an 89504e47 signature and IHDR
1080 x 1080, and so does a milestone I let fire naturally over 14 simulated weeks - which matters,
because planting state into IndexedDB could in principle produce a card the real trigger path never
would.

**C4-6.** The boundary catches, the reset control is 44 px+, and clicking it clears storage and
lands on Welcome. I then onboarded fully from there and advanced a day, so "recovers to a working
app" is verified end to end, not just to the next screen. A state poisoned with `holdings: null`
renders a page rather than a blank document. In a production build the harness is not merely gated,
it is absent: `boom` does not appear in `index-*.js` and `?boom=1` renders the app normally.

**C4-7.** Reproduced the build exactly: no chunk-size warning, entry 201.84 kB, initial payload
479.58 kB (index + react + motion, the only three preloaded in `dist/index.html`), `charts`
399.02 kB lazy. Verified on the real artefact rather than the log: a cold production load fetches
three JS files and no charts chunk; the charts chunk arrives only when a chart mounts; zero console
errors. Under CDP throttling (400 ms latency, ~400 kbit/s) the Portfolio, allocation and summer
chart containers hold their reserved height and y position exactly - measured before and after the
Recharts canvas lands, to the pixel - so the fixed-height Suspense fallback really does prevent
layout shift. A first-time visitor on a cold, throttled connection gets the summer curves with no
shift and no error.

### What I could not test

Unchanged from cycle 3 and explicitly out of scope per plan 13.1: real price data, real iOS or
Android devices (so iOS Safari's touch callout, which C4-3's CSS targets, is still unverified where
it actually matters), WebKit and Firefox engines, real private-browsing profiles, and the 400-day
price series end. Added this cycle: I could not test whether the dark palette is *aesthetically*
acceptable, only whether it measures - and it does not.

### Cycle 4 final numbers, verified by me

Every number is from a command I executed in this pass, after the last code change.

| Command | Result |
|---|---|
| `npm run lint:copy` | **ok, 75 files scanned, 0 problems** |
| `npx tsc --noEmit -p tsconfig.json` | **clean** (including my three new spec files) |
| `npm test` (Vitest) | **21 files, 275 tests, 275 passed, 0 failed** (was 239 at the cycle-3 close: +11 coder in `tests/unit/cycle4.test.ts`, +25 mine in `tests/unit/tester-cycle4.test.ts`) |
| `npm run build` | **clean, no chunk-size warning.** `index` 201.84 kB, `react` 163.37 kB, `motion` 114.37 kB (**initial payload 479.58 kB**), `charts` 399.02 kB lazy, three canvas chunks 0.94 / 1.25 / 1.29 kB, CSS 29.01 kB. Reproduces the coder's figures exactly. |
| Production-artefact check (`vite preview` + network trace) | Cold load of `/` requests `index`, `react`, `motion` and nothing else; `charts-*.js` first requested only when a chart mounts; 0 console errors; `?boom=1` inert and the string `boom` absent from the bundle |
| `npm run e2e` (both projects, all 8 spec files) | **206 tests: 183 passed, 4 failed, 19 skipped**, 15.2 min |

The 4 e2e failures are all my own new tests, failing by design:

| Failing test | Defect it documents |
|---|---|
| `tester-axe-dark.spec.ts` "dark mode: no serious or critical violations" (mobile) | D14 |
| `tester-axe-dark.spec.ts` "dark mode: no serious or critical violations" (desktop) | D14 |
| `tester-cycle4.spec.ts` "Escape on a HOVER-opened tooltip must close it" (desktop) | D13 |
| `tester-cycle4.spec.ts` "the save control is reachable at 375 px WITH the demo tray open" (mobile) | D16 |

Per file, per project: `dod.spec.ts` 3, `tooltip.spec.ts` 4, `axe.spec.ts` 2, `cycle4.spec.ts` 14,
`tester-attacks.spec.ts` 26, `tester-cycle2.spec.ts` 23, `tester-cycle4.spec.ts` 30,
`tester-axe-dark.spec.ts` 1. The 19 skips are the 12 the coder reported (8 from the cycle-3 close
plus 4 touch-only) plus 7 of mine that are viewport- or touch-gated.

I ran the full suite twice. The first run (before I added the C4-5 and route-guard cases) was
198 tests: 177 passed, 3 failed, 18 skipped, 12.0 min, with the same defects failing. **No flakes:
the pre-existing suites were 0-failure in both runs.**

### Tests added this cycle

- `tests/e2e/tester-cycle4.spec.ts` - 30 tests per project. C4-1 hostile persistence (11), C4-2
  handles (6), C4-3 long-press (4), C4-4 Escape (1), C4-5 milestone PNG (2), C4-6 boundary (2),
  C4-7 routing and throttled charts (3), reset and route guard (2).
- `tests/e2e/tester-axe-dark.spec.ts` - the coder's 17-state axe walk, forced into dark mode.
- `tests/unit/tester-cycle4.test.ts` - 25 tests. Hostile `localStorage`, forged and malformed
  revisions, the freeze latch, flush-revision stability, concurrent writes, and `dragAllocation`
  fuzzing (two cases marked `it.fails` as known latent holes, D18).
- Scratchpad-only (not in the repo): `prod-check.mjs`, the `vite preview` network and `?boom=1`
  production-gating check; a WCAG relative-luminance calculator used to cross-check axe's dark-mode
  ratios in D15.

### Standing items for the manager

1. **D14 needs a scope ruling, not an argument.** Plan 13.2's C4-4 acceptance text is unqualified
   about theme; plan 13.1 defers the dark-mode audit. Both are in the same plan section. Someone
   above the coder and me has to say which governs before this is called done either way.
2. **The demo tray keeps landing on top of user-facing controls** (D16, and two earlier instances).
   Worth one small fix - a lower z-index or an inset when a modal or sheet is open - rather than a
   fourth workaround in a fourth test.
3. **Multi-tab is last-writer-wins** and the mirror is shared. The coder disclosed it, I confirmed
   it, and the plan never asked for anything better. Flagging it only so nobody discovers it later
   and calls it a surprise.


## Cycle 5 verification

**Verdict: SHIP WITH RISK.** Every cycle 4 defect on the board (D13 to D18) is verified fixed
against the running app, and all four cycle 5 items meet their acceptance criteria including the
amended C4-4 scan in both themes at both viewports; the risk is one new Minor regression that C4-8
introduced in the control it was rewriting (D20, the dark-mode pause switch no longer changes
colour when you turn it on) plus a guard that cannot see the file the defect it guards against
lived in (D21).

This was a narrow re-test of C4-8 to C4-11 and a regression sweep, not a fresh audit. Everything
below is from commands I ran in this pass. The coder's contrast table was re-measured rather than
read, from rendered elements rather than from the token file it was computed against.

### Per-item status

| Item | Status | Basis |
|---|---|---|
| **C4-8** dark palette contrast (D14, D15) | **VERIFIED** | My own axe walk, 21 screen states, light and dark, both viewports: 0 serious, 0 critical on all four combinations. Every ratio the coder claims reproduces as rendered. One new Minor defect in the neighbourhood (D20) and one in its guard (D21). |
| **C4-9** Escape on a hover-opened tooltip (D13) | **VERIFIED** | Nine attacks on the one-shot latch across both viewports and four scroll offsets. I could not defeat it in either direction: it never leaves a bubble open, and it never swallows a real re-open. |
| **C4-10** demo tray over milestone save (D16) | **VERIFIED** | `milestone-save` is the topmost element at five probe points on all three cards with the tray open at 375 and 1280, and a real actionability-checked click downloads all three PNGs at 1080 x 1080. The coder removed its own workaround. |
| **C4-11** stale comment and NaN guard (D17, D18) | **VERIFIED** | `vite.config.ts` describes what ships and `React.lazy` does not appear in it; the guard closes both NaN paths plus twelve more bad-argument shapes I threw at it. |

### D13 to D18

| Defect | Status | Evidence |
|---|---|---|
| **D13** Escape does not close a hover-opened tooltip | **VERIFIED FIXED** | `bubbles after Escape = 0` on both projects, with focus correctly returned to the anchor. Survives every attempt to defeat the latch (below). |
| **D14** dark-mode axe: serious on 16 of 17 states | **VERIFIED FIXED** | 0 serious and 0 critical on 21 states x 2 themes x 2 viewports, in a spec I wrote, not the coder's. |
| **D15** cycle 4's label swap lowered four dark pairs | **VERIFIED FIXED** | All four measured as rendered: danger 2.06 -> **7.25**, amber 1.66 -> **9.05**, VTI segment 3.02 -> **4.97**, VTIP segment 2.53 -> **5.91**. Closed as a byproduct of C4-8, as the plan predicted. |
| **D16** tray covers `milestone-save` at 375 px | **VERIFIED FIXED** | Topmost on all three cards, tray open, no workaround. |
| **D17** stale `vite.config.ts` comment | **VERIFIED FIXED** | `grep -c "React.lazy" vite.config.ts` = 0; the comment's claims about `src/routes.tsx` and the chart wrappers both check out against the code. |
| **D18** `dragAllocation` NaN holes | **VERIFIED FIXED** | Both cases now pass as ordinary assertions, plus twelve more non-finite and wrong-typed inputs. |

**No cycle 4 defect regressed.**

### The two-character edit, done

`tests/unit/tester-cycle4.test.ts` is mine, so the coder was right not to touch it and right to say
so rather than quietly editing it. I have un-marked both `it.fails` "KNOWN HOLE" cases and turned
them into positive assertions that the guard works, and added a third case for the rest of C4-11's
acceptance text ("any other non-finite input ... `Infinity`, string-typed args"):

- `D18: a NaN delta is a no-op, not a NaN-poisoned allocation` - asserts an exact no-op, a total of
  100, and that every value is finite.
- `D18: a NaN boundary index is a no-op and never adds an "undefined" key`.
- `D18: every other non-finite or wrong-typed argument is an exact no-op` - 14 argument pairs:
  `Infinity`, `-Infinity`, a fractional index (`0.5`, `1.0000001`), string-typed args, `undefined`,
  `null`, `{}` and `[]`, each asserted to return the input unchanged with five keys summing to 100.

That file went from 25 tests (2 failing by design) to 26 tests, all passing.

### C4-9: what I did to the latch

The mechanism is a one-shot `refocusing` ref raised around the Escape handler's `anchor.focus()`
and cleared in a `finally`. A latch like that fails in one of two directions: too narrow and D13
comes back, too wide and it eats a legitimate focus. I attacked both. All of these pass:

- **Hover-opened with focus parked elsewhere**, then Escape: 0 bubbles, focus returns to the anchor.
- **Click-opened, Enter-opened, and Tab-opened** (reached by Tab alone from the top of the
  document, no pointer involved): 0 bubbles, focus stays on the anchor.
- **Escape then immediately Tab**: the term Escape closed does not reopen (`data-term-open` is
  null on it). Focus lands on the next term, which correctly opens its own bubble - that is the
  focus-opens behaviour working, not a leak.
- **Escape then Shift+Tab back onto the same term**: the bubble opens again. The latch really is
  one-shot and does not survive the call.
- **Escape then leave the term and hover it again**: opens. **Escape with the pointer left resting
  on the term**: stays closed for at least 400 ms, which is the case the build notes asked me to
  check.
- **Escape then click**: opens and pins; a second click toggles it shut.
- **Rapid double and triple Escape**: stays closed, focus on the anchor, zero console errors.
- **A second term opened by hover while a first is pinned, then Escape**: 0 bubbles, and the first
  one does not resurrect.
- **Four scroll offsets (0, 200, 600, bottom) on Portfolio (12 terms), first three visible terms at
  each, click-opened and hover-opened**: no failures on either project.

### C4-8: I re-measured the contrast rather than trusting the table

The coder's `tests/unit/contrast.test.ts` parses `src/index.css` and computes ratios from the token
text. That validates the tokens; it does not validate what the browser paints. I measured rendered
elements instead: `getComputedStyle().color` against the first non-transparent ancestor background,
compositing alpha down the stack, WCAG 2.x relative luminance, with the 4.5:1 / 3:1 bar chosen from
each element's own computed font size and weight.

**Every claimed figure reproduces**, in some cases to the second decimal:

| Pair | Coder claims | I measure (rendered) |
|---|---|---|
| white-equivalent on `--c-leaf`, dark (primary button) | 8.04 | **8.04** (`#14201a` on `#58c88c`) |
| ink-equivalent on `--c-coral`, dark (Reset demo, "New" badge) | 7.25 | **7.25** (`#14201a` on `#fa8c76`) |
| ink-equivalent on `--c-amber`, dark (Land a paycheck) | 9.05 | **9.05** (`#14201a` on `#f0b446`) |
| segment label on VTI / VXUS / BND / VNQ / VTIP | 4.97 / 5.80 / 6.89 / 5.77 / 5.91 | **4.97 / 5.80 / 6.89 / 5.77 / 5.91** |
| coral as text on the ground, **light** (form errors) | 5.52 | **5.52** (`#b8330f` on `#f0f8f2`) |

The one number that does not match is in the app's favour: chart axis ticks render at **13.62:1**,
not the claimed 7.96:1, because they resolve to `--c-ink` on the card rather than `--c-muted` on
the ground. Confirmed visually - the `$5.00`/`$6.00` axis labels that were `#666` are now clearly
legible on the dark card.

I also measured surfaces the coder's table does not name, in both themes: the "New" badge on
Lessons and on Home (7.25 dark), the locked badge (4.59, the tightest passing value in the app),
the amber risk-read card (5.66 dark, 4.86 light), the milestone save control, the catch sheet, the
demo tray's five buttons, muted body text on every card and screen background, and the error
boundary. **Nothing measured below its bar in either theme.**

### C4-8 by eye, dark mode

I captured and looked at 28 dark-mode screenshots across the walk. The palette holds up:

- **Allocation segments** - dark labels on the five bright fills, clearly legible, still recognisably
  the brand colours.
- **The amber risk-read card** - dark amber card, amber text, readable; reads as a warning.
- **Charts** - axis labels and gridlines legible on the dark card, which is the `#666` fix landing.
- **The demo tray's five buttons** - green, amber and coral fills with dark labels, all crisp.
- **Confetti banner, "New" badges, catch sheet, milestone modal, lesson illustrations, jar and
  tree** - all clean. The near-black label on a light-green button is a real visual change, as the
  build notes warn, but it reads as deliberate rather than broken.
- **The one thing that is wrong is the Settings pause switch**, which is D20 below.

### Ruling on the dark hairline divider (`--c-line` at 1.52:1)

**I agree with the coder's judgement call, with one correction to how it is framed.**

`--c-line` is used for card rings, hairline dividers, and the quiz's "upcoming" progress dot. WCAG
1.4.11 applies to the visual information needed to identify **user interface components** and their
states, and to **graphical objects required to understand content**. A card's ring and a hairline
divider are grouping decoration: they identify no control and carry no information the layout does
not already carry. The quiz dot is not a control (it is not clickable), and the step is stated in
text beside it, so it is redundant presentation. Both are exempt. Raising `--c-line` to 3:1 needs
roughly `#6E8A78`, which puts a hard frame around every card - a real design cost for no
accessibility gain. **Not a defect. Do not raise it.**

The correction: the coder presents this as a dark-mode exception. It is not a dark-mode issue at
all. I measured the same "upcoming" quiz dot in both themes against the page it sits on:

| Theme | `--c-line` | Ratio vs page |
|---|---|---|
| light | `210 226 216` | **1.24:1** |
| dark | `52 70 60` | **1.73:1** |

**Light mode is worse**, and has been shipping since cycle 1 through four clean light-mode axe
scans without anyone calling it a defect. So the right record is "hairlines are decorative in both
themes and exempt in both", not "we granted dark mode an exception". Judging the dark value as a
defect while the light value passes unremarked would be incoherent.

### New defects

#### D20. Minor. In dark mode the Settings pause switch looks identical on and off.

`src/screens/Settings.tsx:107` builds the switch as, in part:

```
bg-line ... checked:bg-leaf ... dark:bg-muted dark:before:bg-on-leaf
```

Tailwind emits `.dark\:bg-muted:is(.dark *)` **after** `.checked\:bg-leaf:checked`, and the two
have equal specificity (0,2,0). Source order therefore decides, and `dark:bg-muted` wins - in dark
mode the track is `--c-muted` whether the switch is on or off. `checked:bg-leaf` is dead in dark.

**Repro** (`tests/e2e/tester-cycle5.spec.ts`, "the checked and unchecked tracks are different
colours"):

```
npx playwright test tests/e2e/tester-cycle5.spec.ts --project=mobile -g "pause switch"
```

**Observed:**

```
light switch OFF track=rgb(210, 226, 216)  ON track=rgb(22, 112, 63)   <- different, correct
dark  switch OFF track=rgb(160, 180, 168)  ON track=rgb(160, 180, 168) <- identical
```

I confirmed the competing rules directly from `document.styleSheets` in the running page, and
confirmed the appearance in screenshots: the light switch goes green when on; the dark switch does
not change at all.

**Expected:** the checked track is visibly distinct from the unchecked track, as it is in light.

**Why Minor and not Major:** the knob still translates (`matrix(...,2,2)` to `matrix(...,22,2)`),
so state is still perceivable by position, and axe reports nothing. It is not unusable and it is
not a WCAG 1.4.11 failure. But it is a **regression introduced by C4-8**: before this cycle the
dark checked track was leaf green (with a white knob at 2.09:1, which is what the coder was fixing).
The fix removed the bad contrast and the state colour together.

**Violates:** the coder's own stated mechanism in build notes cycle 5 ("Dark now uses a dark knob on
a `--c-muted` **unchecked** track"), which is not what ships - the muted track is used for both
states. Also plan criterion 21 in spirit (Settings' Dark option working), though not its letter.

**Fix is one line**: `dark:checked:bg-leaf` after `dark:bg-muted`, or reorder so the checked
variant wins.

#### D21. Minor. The `on-*` regression guard cannot see `Button.tsx`, which is where D14 lived.

`tests/unit/contrast.test.ts:136` greps every `.tsx` for a `text-white` or `text-ink` label on a
`bg-leaf` / `bg-coral` / `bg-amber` fill. Its regex only matches JSX attributes:

```
/class(?:Name)?=(?:"([^"]*)"|\{`([^`]*)`\})/g
```

`Button.tsx` does not write its classes in an attribute. It writes them in a plain object literal
(`primary: 'bg-leaf text-on-leaf ...'`), so the guard never sees the file - and `Button.tsx` is
exactly where D14's worst pair (white on leaf, 2.08:1, every primary button in the app) lived.

**Repro** - I reintroduced D14 and ran the guard:

```
# in src/components/Button.tsx, change primary to 'bg-leaf text-white ...'
npx vitest run tests/unit/contrast.test.ts
```

**Observed:** `67 passed`. The exact defect C4-8 exists to prevent is reintroduced and the guard is
green.
**Expected:** the guard fails.

**The backstop does work, which is why this is Minor.** With the same violation injected I ran my
dark axe walk: `color-contrast: serious` fires on every one of the 21 states. So the guarantee
holds; it is the fast local guard that has the hole. Source restored and re-verified clean
(`67 passed`, `tsc --noEmit` clean, `primary: 'bg-leaf text-on-leaf ...'`).

The coder disclosed this class of weakness honestly in "Known weak points" ("a colour applied
through a computed string ... slips past both the grep test and the axe walk") but understated it:
this is not an exotic runtime-computed string, it is the single most important component file, and
the build notes credit the grep with having "found the two I had missed by hand".

#### D19. Minor, dev-gated. The error boundary paints the light palette when App throws on its first render.

`applyTheme` runs in a `useEffect` inside `App` (`src/App.tsx:20-23`), and `ErrorBoundary` sits
outside `App` in `main.tsx`. A throw during App's **first** render commits nothing, so no effect
runs, `<html>` never gets the `dark` class, and the boundary renders in the light palette even
though the theme mirror says dark.

**Repro:**

```
npx playwright test tests/e2e/tester-cycle5.spec.ts -g "D19"
```

**Observed** with `spare-change-theme = dark`: a normal screen gives
`{dark: true, bg: rgb(18,28,23)}`; `/?boom=1` gives
`{dark: false, dataTheme: null, bg: rgb(240,248,242), mirror: "dark"}`.

**Scope, and why this is Minor rather than Major - I checked before filing.** A crash that happens
**after** the first commit keeps the theme correctly: with a poisoned persisted state
(`holdings = null`), the real and reachable crash path, the boundary renders with
`{dark: true, bg: rgb(18,28,23)}`. App's first render always returns the "hydrating" placeholder,
which commits and runs the theme effect, so in a production build the light-palette boundary needs
a throw during that very first render. The only thing that does that today is the dev-gated
`?boom=1` fault, and I re-confirmed it is constant-folded out of the production bundle
(`function Ia(){return!1}`, and `grep -c boom` on the bundle is 0).

Both palettes are readable (light boundary measures 6.13:1 on the button, 5.71:1 on the body), so
there is no contrast failure either way. Filed for two reasons: it is a latent theme bug that a
future first-render throw would expose, and it means the "dark error boundary" state in every dark
axe walk - the coder's and mine - was never actually scanned in dark. **The dark scan's real
coverage is 20 of 21 states in dark plus one that cannot be rendered in dark.** Stating that
plainly because the raw "0 serious across all states, both themes" line implies more than it has.

### Plan-vs-build gaps

**None outstanding.** Checked each acceptance criterion against the running system:

- **C4-4 (amended)**: axe over every `dod.spec.ts` screen, both viewports, both themes, a tooltip
  open where a term exists, 0 serious and 0 critical. Met, and exceeded - I added four error states
  no previous walk rendered (empty name, bad import on Welcome, bad email and bad import on
  Settings), which is where the coder's own `--c-coral-ink` light-mode fix lives. The Escape
  assertion covers hover-opened as required. **One honest qualification: the error-boundary state
  is scanned in the light palette in both runs, per D19.**
- **C4-8**: the unit check computes ratios for 26 documented token pairs in both themes plus the
  five segment labels and re-asserts the four D15 pairs, 67 assertions. Met. The extra grep the
  coder added on top is where D21 is.
- **C4-9**: the hover-opened Escape e2e case exists and passes alongside the click- and
  Enter-opened cases. Met.
- **C4-10**: the test opens the modal at 375 px with the tray open on all three cards and does not
  drop `?demo=1` or collapse the tray. Met - and I verified the coder removed the C4-5 workaround
  rather than leaving it: `cycle4.spec.ts:283` now loads `/?demo=1&...` with a comment recording
  why.
- **C4-11**: comment accurate, `React.lazy` absent, both cases un-marked and passing plus the
  additional non-finite cases. Met.

**Built beyond what the plan asked, and correctly disclosed:** the light-mode `--c-coral-ink` fix
(deviation 2). C4-8 was scoped dark-only. This is a genuine 2.69:1 body-text failure on form errors
and negative growth figures, it is the same class of defect, and light-mode axe still reports 0. I
verified the fixed value as rendered (5.52:1) and the error states now render in the walk.
**Correct call, correctly flagged.**

### Regression statement

**No regression in any pre-existing suite, and no cycle 1 to 4 defect reopened.** Every failure in
my final full run is one of my own new adversarial tests failing by design against D20.

- `npm test`: **344 passed, 0 failed**, 22 files. The 275 that existed at the cycle 4 close all
  still pass.
- Full `npm run e2e`, both projects: see the table below. `dod.spec.ts`, the 116-tap-per-viewport
  `tooltip.spec.ts` sweep with unchanged assertions, `tester-attacks.spec.ts`, `tester-cycle2.spec.ts`
  and `tester-cycle4.spec.ts` are all 0-failure.
- **Tooltip tap sweep**: clean on both projects after the `Tooltip.tsx` C4-9 edit, which is the
  spec plan 13.3 names as the most likely casualty of a tooltip change.
- **Export/import round trip and the persistence reload loop from C4-1**: green
  (`dod.spec.ts` step 14, `tester-cycle2.spec.ts`, `tester-cycle4.spec.ts`'s eleven hostile
  variants).
- **Production artefact** (real `vite build` through `vite preview`, network traced): a cold load of
  `/` fetches `index`, `react`, `motion` and the CSS and nothing else; the 399 kB `charts` chunk is
  requested only when a chart mounts; `?boom=1` is inert and the string `boom` is absent from the
  bundle; **0 console errors and 0 page errors** on every load, in both themes; dark mode paints
  from the mirror on a cold production load.
- `npm run lint:copy`: **ok, 75 files scanned, 0 problems.**
- `npx tsc --noEmit`: **clean**, including my three new spec files.
- **The coder edited no tester file.** Every `tester-*` file carries an mtime at or before 11:12 on
  2026-09-07, before the coder's cycle 5 edit window (11:51 to 12:00). The 24 files it did touch
  match its declared list: the token file and `tailwind.config.ts`, `Button.tsx`, `AllocationBar.tsx`,
  `Confetti.tsx`, `ErrorBoundary.tsx`, `LessonVisual.tsx`, `MilestoneCard.tsx`, `SweepAnimation.tsx`,
  `Tooltip.tsx`, the three chart canvases, `risk.ts`, `vite.config.ts`, four screens, and its own
  four test files (`axe.spec.ts`, `cycle4.spec.ts`, `contrast.test.ts`, `risk.test.ts`).
  **Declaration accurate.**

One caveat on process, mine not the coder's: my first full e2e run was contaminated because I
mutated `Button.tsx` for the D21 experiment while it was in flight. I discarded that run entirely
and re-ran the whole suite clean after restoring the file. The numbers below are from the clean run.

### What I attacked and it held

- The C4-9 latch, from both directions, nine ways (listed above).
- The milestone modal after the C4-10 layout change: still `overflow-y: auto`, still scrollable to
  the last card, panel never pushed off the top, backdrop still dismisses, the tray underneath is
  still clickable (the `pointer-events-none` wrapper does what the notes claim), and all three save
  controls stay topmost with the tray open, collapsed, and absent.
- A **short viewport** (375 x 560) with the tray open, which squeezes the panel to 212 px against a
  348 px inset: still scrollable, still not pushed off the top, save control still topmost. The
  `min(80vh,100%)` cap holds where I expected it to break.
- Real trusted clicks on `milestone-save` with the tray open (not `dispatchEvent`), so Playwright's
  own actionability check had to agree nothing covered it: three 1080 x 1080 PNGs on both projects.
- `dragAllocation` with 14 bad-argument shapes beyond the two the plan named.
- Zero console and zero page errors across every screen in both themes, on both projects, and on a
  cold production load.

### What I could not test

- **Real screen readers.** The axe walk and the `role="tooltip"` / `aria-describedby` wiring are
  static checks. Nobody has driven this app with VoiceOver, NVDA or TalkBack, and C4-4 is an
  accessibility item. This gap has been open since cycle 4 and is not closed.
- **Real iOS Safari and Android Chrome.** Everything here is Chromium, including the `mobile`
  project. The long-press, `touch-action` and `-webkit-touch-callout` work from C4-3 is still
  unverified on the browser it was written for.
- **Actual colour perception.** I measured ratios and looked at screenshots. Nobody with low vision,
  and no colour-blind simulation, has looked at the new dark palette.
- **The dark error-boundary rendering**, because per D19 it does not render in dark. Its light
  rendering is measured and passes.
- **Scale**: no long-running session, no months of simulated data, no low-end device, no real
  network.

### Cycle 5 final numbers, verified by me

Every number is from a command I executed in this pass, after the last code change and after
restoring `Button.tsx`.

| Command | Result |
|---|---|
| `npm run lint:copy` | **ok, 75 files scanned, 0 problems** |
| `npx tsc --noEmit -p tsconfig.json` | **clean** (including my three new spec files) |
| `npm test` (Vitest) | **22 files, 344 tests, 344 passed, 0 failed** (275 at the cycle 4 close: +68 coder, +1 net mine from un-marking the two `it.fails` and adding a third case) |
| `npm run build` | **clean, no chunk-size warning.** `index` 202.13 kB, `react` 163.37 kB, `motion` 114.37 kB (**initial payload 479.87 kB**), `charts` 399.02 kB lazy, three canvas chunks 1.19 / 1.43 / 1.46 kB, CSS 30.02 kB. Reproduces the coder's figures exactly; CSS grew 1.01 kB from the new tokens. |
| Production-artefact check (`vite preview` + network trace) | Cold load of `/` requests `index`, `react`, `motion`, CSS and nothing else; `charts-*.js` only when a chart mounts; **0 console errors** in both themes; dark applies from the mirror; `?boom=1` inert, gate constant-folded to `return!1`, string `boom` absent |
| My axe walk, light + dark x mobile + desktop, 21 states each | **0 serious, 0 critical on all four combinations.** Moderate only, unchanged from cycle 4: `region` x20, `heading-order` x2, `page-has-heading-one` x2, `landmark-one-main` x1 |
| Rendered-contrast measurement, both themes | **Nothing below its bar.** All five claimed dark figures and the light `--c-coral-ink` figure reproduce exactly |
| `npm run e2e` (both projects, all 11 spec files) | **258 tests: 230 passed, 3 failed, 25 skipped**, 28.2 min. Of the three failures, one is mine failing by design against D20 and two are wall-clock timeouts under machine load, both re-verified passing in isolation (below). |

The three e2e failures, itemised honestly:

| Failing test | What it is |
|---|---|
| `tester-cycle5.spec.ts` "dark: the checked and unchecked tracks are different colours" (mobile) | **Mine, failing by design.** Documents D20. |
| `tooltip.spec.ts:95` "every term on every screen holds its bubble at every scroll position" (desktop) | **Not a defect: a wall-clock timeout.** The 116-tap sweep spends 23 s in `waitForTimeout` alone and hits the 120 s per-test budget on a loaded machine. Re-run alone with `--timeout=300000`: **"116 taps checked, 0 obstructed and skipped, 0 failures", 1 passed in 1.7 min.** The assertions are clean. |
| `tester-cycle4.spec.ts:743` "a first-time visitor gets the summer curves with no layout shift" (desktop) | **Not a defect: the same.** A deliberately throttled cold load inside a 120 s budget. Re-run alone: **1 passed in 1.3 min**, `box 220 px -> 220 px`, no layout shift. |

I established these two are load, not code, before writing them off. The same `tooltip.spec.ts:95`
passed inside the full run on both projects (it printed its "0 failures" line), and on a re-run of
just `tooltip.spec.ts --project=desktop` a *different* test in the file timed out while `:95`
passed - a moving target is the signature of a time budget, not a bug. I had also left 12 stray
Chromium processes behind from the run I discarded; after killing them the same four-test file went
from **16.0 min to 3.2 min**. Both tests then passed individually with room to spare.

**Standing concern, not a cycle 5 defect:** `tooltip.spec.ts:95`'s 120 s budget is marginal on this
hardware and it is a pre-existing spec that cycle 5 did not touch. It will keep flaking in CI. Its
assertions are sound; the budget is not. Raising the timeout or trimming the fixed 200 ms sleep per
tap would fix it.

Per file, per project (129 each, 258 total): `dod.spec.ts` 3, `tooltip.spec.ts` 4,
`axe.spec.ts` 4, `cycle4.spec.ts` 15, `tester-attacks.spec.ts` 26, `tester-cycle2.spec.ts` 23,
`tester-cycle4.spec.ts` 30, `tester-axe-dark.spec.ts` 1, `tester-cycle5.spec.ts` 19,
`tester-cycle5-axe.spec.ts` 2, `tester-cycle5-contrast.spec.ts` 2. The 25 skips are the 19 from the
cycle 4 close plus 6 of mine that are hover- or viewport-gated.

### Tests added this cycle

- `tests/e2e/tester-cycle5.spec.ts` - C4-9 latch attacks (9), C4-8 error-boundary theme probes (2),
  the D20 switch check (2), C4-10 modal and tray probes (5).
- `tests/e2e/tester-cycle5-axe.spec.ts` - my own 21-state axe walk parameterised over both themes,
  adding four error states no previous walk rendered.
- `tests/e2e/tester-cycle5-contrast.spec.ts` - rendered-contrast measurement of ~45 element pairs
  per theme, with the bar chosen from each element's own font size and weight.
- `tests/unit/tester-cycle4.test.ts` - the two `it.fails` cases converted to passing assertions,
  plus a third covering the rest of C4-11's acceptance text. 25 tests (2 red) to 26, all green.
- Scratchpad only (not in the repo): `prod-check.mjs`; a switch and progress-dot probe used for D20
  and the hairline ruling; 28 dark-mode screenshots.

### Standing items for the manager

1. **D20 is a one-line fix and it is a regression from this cycle.** If you want a clean SHIP rather
   than SHIP WITH RISK, this is the only thing in the way.
2. **D21 leaves the fast guard blind to `Button.tsx`.** The axe walk catches the regression class
   anyway, so this is not urgent, but the guard currently gives false confidence in the one file
   that matters most. Widening the regex to plain string literals is small.
3. **Screen-reader testing has now been listed as untested for two cycles** on an item (C4-4) whose
   entire purpose is assistive-technology support. Someone should decide whether that is acceptable
   for v1 or whether it needs a real pass.
4. **The `--bottom-inset` coupling is now load-bearing for the milestone modal** (build notes' own
   weak point). It held everywhere I pushed it, including a 375 x 560 viewport, but this is the
   fourth instance of the tray-overlap class and the fix is a convention rather than a constraint
   the code enforces.

---

## Revision log

### Cycle 1, 2026-09-06

Initial adversarial pass. D1 to D9 filed, plan-level items P1 to P5 raised for the architect,
three unverified concerns recorded, 22 of 24 criteria passing.

### Cycle 2, 2026-09-06

**What changed.** Re-tested every one of D1 to D9 and the three concerns by running the app, not by
reading the diff, and attacked the neighborhood of each fix. All twelve are verified fixed. The
import validator in particular is strong: it rejected all 30 new hostile shapes I threw at it,
including deeply nested wrong types, allocations summing to 99, duplicate and missing lesson ids,
and non-calendar dates, while still accepting a real 40-tick export. Criterion 12 now passes on
both presets under the architect's revised wording, and the determinism guidance holds with the two
wall-clock fields masked.

**Why the verdict moved from PASS WITH DEFECTS to SHIP WITH RISK rather than to a clean pass.**
Three new defects, one of them a regression from this cycle's own work:

- **D11, Major.** The D6 tooltip fix closes the bubble on *any* scroll event. Because the bubble is
  placed at `anchor.bottom + 8` with no flip-above, opening one low in the viewport makes the
  browser emit a scroll event, and the tooltip closes itself in the same interaction. 11 of 29
  terms on mobile, 7 of 29 on desktop. Criterion 20 fails on this alone. It is a narrow fix
  (compare the scroll offset against the value at open, and flip the bubble when it does not fit),
  but nobody should call this done while it stands.
- **D10, Minor.** Boot still throws `Bad date` on a corrupt `clock.startDate` because `Home.tsx:51`
  and `Lessons.tsx:54` call `simDate` unguarded and there is no error boundary. Not reachable via
  import any more, so it is Minor, but it is the exact case `bootstrap.ts` says it hardened.
- **D12, Minor.** The Welcome import link is 168 x 20 at 375 px. The D7 fix worked from the plan's
  enumerated list and never audited the Welcome screen.

**Rulings on the coder's three disagreements: I conceded all three**, explicitly, and updated my
own tests to assert the correct post-fix behaviour rather than leaving them red. The coder was
right that my four hostile-import e2e tests contradicted both revised plan 5.4 and my own unit
suite; right that the VTIP test asserted a criterion the architect had superseded; and right that
the "name 41 chars" tail was flaky by construction. The coder also behaved correctly in leaving
them failing and escalating instead of editing my files.

**Standing disagreement to hand to the manager.** One, and it is small. The build notes justify
reverting the criterion-20 `Term` wrapping on the Welcome copy on the grounds that it broke the
plan 11 keyboard requirement. It did not: it broke *my* test's assumption that the name input is
the first tab stop, which the plan never says. I have removed that assumption from my test, so the
coder can restore the wrapping and close criterion 20's remaining gap. If the architect would
rather formally exempt Welcome's pre-onboarding marketing copy from 12.1 rule 8, that also closes
it, and P7 asks for that ruling. Either way, criterion 20 does not pass today.

**Also for the architect: P6.** The validator built to plan 5.4 rejects every malformed shape but
accepts structurally valid nonsense: reversed `events` and `history` arrays (a backwards Portfolio
chart, i.e. silently wrong output), event `dayIndex` values wildly out of range against
`clock.dayIndex`, and `holdings` of 1e308, which is finite as 5.4 requires but makes the portfolio
value `Infinity`. These are plan-list gaps, not coder defects, so they are filed as P6 rather than
as defects against the build.

### Cycle 3, 2026-09-06 (final exchange)

**What changed.** Re-verified D10, D11 and D12 and the plan-level items P6 and P7 by running the
app against the Cycle 3 plan revision, not by reading the coder's description of the fixes: the
precise Tooltip behavior spec added to section 6 ("Global components"), the ordering and
cross-field rules added to 5.4, and 12.1 rule 8's explicit statement that Welcome's copy is not
exempt from `Term` wrapping. All five are **verified fixed / closed**. The tooltip breadth sweep
that found D11 (11 of 29 mobile, 7 of 29 desktop) now reports 0 of 29 on both viewports, and the
coder's own 116-tap `tooltip.spec.ts` sweep, which I re-ran, is clean on both projects. The
validator's new ordering and cross-field rules reject every one of my cycle-2 AUDIT shapes
(reversed history, reversed events, `holdings` of 1e308, out-of-range `dayIndex`) while still
accepting a genuine export. Welcome's terms are wrapped and keyboard-only onboarding still
completes, now at 10 tab stops instead of 6, which plan 11 explicitly allows.

**Rulings on the coder's two disputes: I conceded both**, on my own independent verification, not
on the coder's report alone:

1. **Line 325, "closes on scroll."** The Cycle 3 plan revision states plainly that a scroll
   repositions the bubble and never closes it. My test asserted the opposite. I reproduced the
   failure myself, read `Tooltip.tsx` to confirm the scroll listener now repositions rather than
   closes, and rewrote the assertion to check the bubble stays open and keeps tracking its anchor
   after a real scroll.
2. **Line 365, the D11 low-viewport repro.** The coder said the tap coordinate
   (`innerHeight - 120`) lands inside the demo tray, not on the term, because `?demo=1` opens the
   tray by default. I verified this from scratch with my own `document.elementFromPoint` script
   against the same fixture URL, independent of the coder's numbers: every 0-bubble result landed
   on a tray element (`demo-date`, `demo-tray`, `demo-reset`, `demo-land-paycheck`), and hiding the
   tray flipped every one to 1 bubble. Fixed by collapsing the tray before the loop.

Both fixes are in `tests/e2e/tester-cycle2.spec.ts`, each marked in-file with a comment naming the
concession. I re-ran the full suite before and after: before, 112 tests / 100 passed / 4 failed
(the two disputes, one per project) / 8 skipped, reproducing the coder's numbers exactly; after,
112 / 104 / 0 / 8, clean.

**Standing disagreements handed to the manager: none.** The one disagreement carried out of cycle
2 (Welcome's `Term` wrapping) is resolved: the architect ruled for wrapping, the coder wrapped it,
and I verified it renders correctly and does not break keyboard-only onboarding. Both of the
coder's cycle-3 disputes are conceded, with my own tests fixed rather than left red. Verdict moves
from SHIP WITH RISK to **PASS**, 24 of 24 criteria.

### Cycle 4, 2026-09-06: risk closure C4-1 to C4-7

**What changed.** Adversarial verification of the seven risk-closure items and their
neighbourhoods, plus a regression sweep of every cycle 1 to 3 suite. Everything below was run, not
read: 275 Vitest tests, 206 Playwright tests across both projects, a real `vite build` served
through `vite preview` with a network trace, and a WCAG luminance calculation cross-checked against
axe's own numbers.

**Verdict moves from PASS to SHIP WITH RISK.** Five items are clean, C4-5 is clean with a
neighbourhood defect, and C4-4 fails - which matters because C4-4 was the accessibility item.

**Per item: C4-1 VERIFIED, C4-2 VERIFIED, C4-3 VERIFIED, C4-4 FAILED, C4-5 VERIFIED,
C4-6 VERIFIED, C4-7 VERIFIED.**

**C4-1, the item flagged as most likely to hide a subtle bug, is the strongest work in this
cycle.** I could not break it. Beyond the coder's ten-cycle reload loop I ran eleven harder
variants - reload mid sweep animation, immediately after accepting a catch, after a settings
change, after an import, after a reset; `page.close()` instead of reload; two tabs where a stale
one is backgrounded and closed; a mirror forced older and forced newer than IndexedDB; a truncated
mirror; a semantically garbage mirror with a forged revision - plus 25 unit tests at the adapter
level with a `localStorage` that throws on read and on write, and with string, null, object,
boolean, `NaN`, `Infinity`, negative and equal forged revisions. Nothing lost, nothing resurrected,
no blank page. The `freezePersistence()` latch genuinely fixes the pre-import resurrection the
coder found, and `persistedEnvelopeJson()` really is byte-identical to zustand's envelope, which is
what stops every backgrounding from inflating the revision.

**Six new defects, D13 to D18. Two Major:**

- **D13, Major, and a regression introduced by C4-4 itself.** `Tooltip.tsx`'s new
  Escape-returns-focus calls `anchor.focus()` after `close()`, and the anchor's `onFocus` calls
  `show()`, so a hover-opened tooltip closes and immediately reopens in the same batch. Escape does
  not close it. The coder's own test misses this because both of its cases open the bubble by click
  or by Enter, which leave the anchor already focused so the `focus()` call is a no-op. This
  directly contradicts the item's own acceptance text and plan 6's tooltip spec.
- **D14, Major, needs an architect ruling rather than a fix argued either way.** I re-ran the
  coder's exact 17-state axe walk with the theme forced to dark: `color-contrast: serious` on 16 of
  17 states, both viewports, worst 1.65:1. The C4-4 acceptance text says "zero serious or critical"
  without qualifying a theme; plan 13.1 defers the dark-mode audit. Both statements are in section
  13. The dominant cause (white on the dark `--c-leaf`, 2.08:1, on every primary button) is
  pre-existing and untouched.

Four Minor: **D15**, cycle 4's white-to-ink label swap measurably lowered four dark-mode pairs
(2.31 -> 2.06, 1.85 -> 1.66, 3.38 -> 3.02, 2.84 -> 2.53) in a theme the build notes call untouched;
**D16**, the demo tray fully covers `milestone-save` on all three cards at 375 px, the third
instance of this obstruction class and one the coder worked around in its own test rather than
fixing; **D17**, `vite.config.ts` still documents the route-level `React.lazy` that was withdrawn,
in the one file a reader will open to understand C4-7; **D18**, two latent `NaN` holes in
`dragAllocation`, which C4-2 gave a second caller - not reachable from the UI today, and filed as
known-failing rather than dressed up as user-facing.

**Ruling on the coder's route-level `React.lazy` judgment call: I agree with the withdrawal, and I
agree with the reasoning.** Plan 13.3 requires every existing test to stay green and 13.4 forbids
editing my files; 13.2 explicitly permits `manualChunks` on its own; the component-level split
removes the same 399 kB. Escalating rather than quietly rewriting my assertions was the right
behaviour. **But the two of the four tests that are mine were not defending a real requirement** -
`tester-cycle2.spec.ts:178` and `tester-attacks.spec.ts:680` both read the DOM synchronously right
after a navigation as scaffolding for assertions about route-guard destinations and term coverage.
Neither asserts, or should assert, that a route transition is synchronous. So it was constraint
13.3, not the product, that blocked route-level splitting, and I will add auto-waiting assertions to
both if the architect ever wants it. It buys nothing measurable either way: I watched a cold
production load fetch three JS files and no charts chunk.

**No regression from cycle 4.** All 239 cycle-3 unit tests still pass, and every pre-existing e2e
spec - `dod.spec.ts`, the 116-tap `tooltip.spec.ts` sweep, `tester-attacks.spec.ts`,
`tester-cycle2.spec.ts` - is 0-failure across two full runs. Export/import round trip, the
onboarding route guard, `lint:copy` (75 files, 0 problems), no em dashes, and a clean `tsc --noEmit`
all confirmed. The coder edited no tester file: mtimes and per-file test counts both match what this
report recorded at the cycle-3 close.

### Cycle 5, 2026-09-07: final verification of C4-8 to C4-11

**What changed.** Narrow re-test of the four cycle 5 items and the six cycle 4 defects they fix,
plus a full regression sweep. Everything was run, not read: 344 Vitest tests, 258 Playwright tests across both projects, four
independent axe walks (light and dark x mobile and desktop, 21 screen states each) in a spec I
wrote rather than the coder's, a rendered-contrast measurement of about 45 element pairs per theme
taken from `getComputedStyle` rather than from the token file, 28 dark-mode screenshots reviewed by
eye, and a real `vite build` served through `vite preview` with a network trace.

**Verdict stays SHIP WITH RISK, but for a much smaller reason than in cycle 4.** Cycle 4's verdict
was driven by a failed accessibility item and two Major defects. Those are gone. What remains is one
Minor regression introduced by C4-8 itself (D20) and one Minor gap in the guard meant to prevent
exactly that class of regression (D21).

**Per item: C4-8 VERIFIED, C4-9 VERIFIED, C4-10 VERIFIED, C4-11 VERIFIED.
D13 through D18 all VERIFIED FIXED. Nothing regressed.**

**The dark palette work is real and the coder's numbers are honest.** I measured rendered elements
rather than trusting the table, and every claimed figure reproduces: 8.04:1 white-equivalent on
leaf, 7.25:1 on coral, 9.05:1 on amber, 4.97 / 5.80 / 6.89 / 5.77 / 5.91 on the five segment fills,
5.52:1 for the light-mode `--c-coral-ink` fix. D15's four regressed pairs are all closed as a
byproduct, as the plan predicted. My own axe walk reports 0 serious and 0 critical on all four
theme-viewport combinations, including four error states no previous walk ever rendered.

**C4-9's one-shot latch survived nine attempts to defeat it** in both directions - Escape then Tab,
Escape then Shift+Tab back, Escape then re-hover, Escape then click, rapid triple Escape, a second
term open, four scroll offsets, Tab-only keyboard entry, both viewports. It never leaves a bubble
open and it never swallows a legitimate re-open.

**C4-10 is fixed at the product level, not worked around in the test.** I verified the coder removed
its own cycle 4 workaround, and confirmed reachability with real actionability-checked clicks
(three 1080 x 1080 PNGs) rather than synthetic events, at five probe points per card, with the tray
open, collapsed and absent, and on a 375 x 560 viewport that squeezes the panel to 212 px.

**Three new Minor defects, D19 to D21:**

- **D20**, and the one that matters: in dark mode the Settings pause switch is the same colour on
  and off. `dark:bg-muted` is emitted after `checked:bg-leaf` at equal specificity, so the checked
  variant is dead in dark. This is a **regression introduced by C4-8** - the fix removed the bad
  white-knob contrast and the state colour together. Minor only because the knob still translates,
  so state is still perceivable. One-line fix.
- **D21**: the `on-*` regression guard greps JSX `className` attributes only, so it cannot see
  `Button.tsx`, which writes its classes in an object literal - and `Button.tsx` is where D14's
  worst pair lived. I proved it by reintroducing D14 verbatim: the guard reports 67 passed. The axe
  walk does catch it (serious on all 21 states), so the guarantee holds and this is Minor, but the
  build notes credit the grep with more coverage than it has. Source restored and re-verified.
- **D19**, dev-gated: the error boundary paints the light palette when App throws on its **first**
  render, because `applyTheme` runs in an effect inside `App` and `ErrorBoundary` sits outside it. I
  checked the scope before filing rather than after: a real crash (poisoned persisted state) keeps
  the theme correctly, and the only first-render throw today is the `?boom=1` fault, which is
  constant-folded out of production. Its consequence for this cycle is worth stating plainly: the
  dark axe walk really covers 20 of 21 states in dark plus one that cannot render in dark.

**Ruling on the coder's hairline-divider judgement call: I agree, do not raise `--c-line`.** Card
rings, hairline dividers and the quiz's "upcoming" dot are decorative grouping and redundant
presentation, exempt from WCAG 1.4.11, and raising them to 3:1 would frame every card. One
correction to the framing: this is not a dark-mode exception. I measured the same dot at **1.24:1
in light** against **1.73:1 in dark** - light is worse and has passed four clean scans unremarked.
The record should be "hairlines are decorative in both themes", not "dark mode gets an exception".

**The two-character edit is done.** The two `it.fails` "KNOWN HOLE" cases in my
`tests/unit/tester-cycle4.test.ts` are now positive assertions that the guard works, plus a third
case covering the rest of C4-11's acceptance text (`Infinity`, fractional index, string-typed,
`undefined`, `null`, object and array arguments - 14 pairs, each an exact no-op). The coder was
right to escalate rather than edit my file.

**No regression.** All 275 cycle 4 unit tests still pass inside the 344, the 116-tap
`tooltip.spec.ts` sweep is clean on both projects after the `Tooltip.tsx` edit, `dod.spec.ts`,
export/import round trip, the C4-1 persistence reload loop, `lint:copy` (75 files, 0 problems) and
`tsc --noEmit` are all green, and a cold production load still fetches three JS files and no charts
chunk with zero console errors. The coder edited no tester file - mtimes confirm it, and the 24
files it did touch match its declared list exactly.

**Process note, mine not the coder's:** my first full e2e run was contaminated because I mutated
`Button.tsx` for the D21 experiment while it was in flight. I discarded that run entirely and
re-ran the whole suite clean after restoring the file. Reported numbers are from the clean run.
