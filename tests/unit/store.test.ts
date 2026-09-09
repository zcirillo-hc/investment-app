import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'idb-keyval';
import { createAppStore } from '../../src/state/store';
import { clearPersistedState, exportStateJson, parseImport, pickAppState, readPersistedEnvelope, writeImportedState } from '../../src/state/persistence';
import { computeAutoAdvanceTicks, runAutoAdvance } from '../../src/state/bootstrap';
import { overrideUrlParams, parseUrlParams } from '../../src/state/urlParams';
import { STORAGE_KEY } from '../../src/config';
import { deps } from '../../src/state/deps';
import { useUiStore } from '../../src/state/uiStore';

async function waitFor(pred: () => Promise<boolean>, ms = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await pred()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('waitFor timed out');
}

// Plan v2 5.3: `setQuizAnswers` and `setAllocation` are gone with the quiz and the builder.
// Onboarding is three steps: name, summer money, fear check.
function onboard(store: ReturnType<typeof createAppStore>) {
  store.getState().setProfile('Sam', '');
  store.getState().setSummer(300000, 50000, 19);
  store.getState().setFear('pointless');
  store.getState().completeOnboarding();
}

describe('store', () => {
  beforeEach(async () => {
    await clearPersistedState();
    overrideUrlParams({ demo: true, freeze: true, start: '2026-06-15', seed: 42, nudge: false, push: null });
  });

  it('persists and rehydrates through IndexedDB', async () => {
    const a = createAppStore();
    await a.persist.rehydrate();
    onboard(a);
    a.getState().nextDay();
    expect(a.getState().clock.dayIndex).toBe(1);
    expect(a.getState().profile.seed).toBe(42);
    expect(a.getState().clock.startDate).toBe('2026-06-15');
    await waitFor(async () => {
      const raw = await get<string>(STORAGE_KEY);
      return !!raw && raw.includes('"dayIndex":1');
    });
    const b = createAppStore();
    await b.persist.rehydrate();
    expect(b.getState().profile.name).toBe('Sam');
    expect(b.getState().clock.dayIndex).toBe(1);
    expect(b.getState().events).toEqual(a.getState().events);
    expect((b.getState() as unknown as Record<string, unknown>).nextDay).toBeTypeOf('function');
  });

  it('export then import yields equal state', async () => {
    const a = createAppStore();
    await a.persist.rehydrate();
    onboard(a);
    a.getState().skipWeek();
    const json = exportStateJson(a.getState());
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(2);
    expect(Object.keys(parsed)).not.toContain('nextDay');
    // Plan 5.5: `push` is device state and never travels in an export.
    expect(Object.keys(parsed)).not.toContain('push');
    const r = parseImport(json);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Everything except `push`, which the validator resets from the browser rather than
      // restoring from a file that could point this browser at someone else's endpoint hash.
      const { push: _importedPush, ...imported } = r.state;
      const { push: _livePush, ...live } = pickAppState(a.getState());
      expect(imported).toEqual(live);
      await writeImportedState(r.state);
      const b = createAppStore();
      await b.persist.rehydrate();
      expect(pickAppState(b.getState())).toEqual(pickAppState(a.getState()));
    }
  });

  it('rejects malformed imports and leaves state alone', async () => {
    expect(parseImport('not json').ok).toBe(false);
    expect(parseImport('[]').ok).toBe(false);
    expect(parseImport('{"schemaVersion":2}').ok).toBe(false);
    // A7: a v1 envelope is refused with its own named message, never migrated.
    expect(parseImport('{"schemaVersion":1}').ok).toBe(false);
    const a = createAppStore();
    await a.persist.rehydrate();
    onboard(a);
    const good = JSON.parse(exportStateJson(a.getState()));
    good.jarCents = -5;
    expect(parseImport(JSON.stringify(good)).ok).toBe(false);
    good.jarCents = 0;
    good.settings.jarGoalCents = -1;
    expect(parseImport(JSON.stringify(good)).ok).toBe(false);
  });

  it('reset clears storage and returns to the initial state', async () => {
    const a = createAppStore();
    await a.persist.rehydrate();
    onboard(a);
    await waitFor(async () => !!(await get<string>(STORAGE_KEY)));
    await a.getState().resetDemo();
    expect(a.getState().profile.onboardingComplete).toBe(false);
    expect(a.getState().profile.name).toBe('');
    // the reset writes the initial state back (persist) but nothing onboarded remains
    const env = await readPersistedEnvelope();
    expect(env === null || env.state.profile.onboardingComplete === false).toBe(true);
  });

  /**
   * R6.2 and R6.3. The v1 case here counted the first automatic sweep. There is no sweep, so
   * this counts the thing that replaced it: crossing the display only jar goal, which
   * celebrates and never moves anything.
   */
  it('crossing the jar goal fires the celebration once per crossing, and moves no money', async () => {
    const a = createAppStore();
    await a.persist.rehydrate();
    onboard(a);
    let crossings = 0;
    let ticks = 0;
    while (ticks < 40 && crossings === 0) {
      if (a.getState().nextDay().crossedGoal) crossings += 1;
      ticks += 1;
    }
    expect(crossings).toBe(1);
    expect(a.getState().jarCents).toBeGreaterThanOrEqual(a.getState().settings.jarGoalCents);
    // R6.2: nothing left the jar on its own.
    expect(a.getState().ledger).toEqual([]);
    expect(a.getState().events.some((e) => e.kind === 'JarMove')).toBe(false);
    // And it does not fire again while the balance simply stays above the goal.
    expect(a.getState().nextDay().crossedGoal).toBe(false);
  });

  /** R6.4 and R6.5: the two user actions, and the animation that only a jar move plays. */
  it('the jar move writes one ledger entry, one JarMove event and empties the jar', async () => {
    const a = createAppStore();
    await a.persist.rehydrate();
    onboard(a);
    a.getState().skipWeek();
    const before = a.getState().jarCents;
    expect(before).toBeGreaterThan(0);
    const r = a.getState().moveJarToLedger({ date: '2026-06-22', what: 'Index fund', note: '' });
    expect(r.ok).toBe(true);
    expect(a.getState().jarCents).toBe(0);
    expect(a.getState().ledger).toHaveLength(1);
    expect(a.getState().ledger[0]).toMatchObject({ amountCents: before, source: 'jar' });
    expect(a.getState().events.filter((e) => e.kind === 'JarMove')).toHaveLength(1);
    expect(useUiStore.getState().jarMoveAnimation).not.toBeNull();
  });

  it('"I spent it" empties the jar, writes one neutral event and creates no ledger entry', async () => {
    const a = createAppStore();
    await a.persist.rehydrate();
    onboard(a);
    a.getState().skipWeek();
    expect(a.getState().jarCents).toBeGreaterThan(0);
    a.getState().emptyJar();
    expect(a.getState().jarCents).toBe(0);
    expect(a.getState().ledger).toEqual([]);
    expect(a.getState().events.filter((e) => e.kind === 'JarEmptied')).toHaveLength(1);
  });

  /** R4.5, R5.5 and 8.2: the demo force, the skip, and the idempotence that makes it safe. */
  it('a forced nudge can be skipped exactly once, crediting exactly the shown estimate', async () => {
    const a = createAppStore();
    await a.persist.rehydrate();
    onboard(a);
    a.getState().makeHabit();
    a.getState().forceNudge();
    const nudge = a.getState().nudges.find((n) => n.status === 'pending');
    expect(nudge).toBeTruthy();
    if (!nudge) return;
    const before = a.getState().jarCents;
    a.getState().takeSkip(nudge.id);
    expect(a.getState().jarCents).toBe(before + nudge.estimateCents);
    expect(a.getState().events.filter((e) => e.kind === 'Skip')).toHaveLength(1);
    // Arriving from the notification and from the card must not credit twice.
    a.getState().takeSkip(nudge.id);
    expect(a.getState().events.filter((e) => e.kind === 'Skip')).toHaveLength(1);
    expect(a.getState().jarCents).toBe(before + nudge.estimateCents);
  });

  /** R4.6 and R4.7: dismissing writes nothing and moves nothing. */
  it('"Not today" changes no counter and writes no event', async () => {
    const a = createAppStore();
    await a.persist.rehydrate();
    onboard(a);
    a.getState().makeHabit();
    a.getState().forceNudge();
    const nudge = a.getState().nudges.find((n) => n.status === 'pending');
    expect(nudge).toBeTruthy();
    if (!nudge) return;
    const before = { jar: a.getState().jarCents, events: a.getState().events.length };
    a.getState().dismissNudge(nudge.id);
    expect(a.getState().jarCents).toBe(before.jar);
    expect(a.getState().events).toHaveLength(before.events);
    expect(a.getState().nudges.find((n) => n.id === nudge.id)?.status).toBe('expired');
  });

  /** Plan 5.3: the actions the quiz and the allocation builder used are gone. */
  it('exposes no quiz or allocation action', () => {
    const a = createAppStore().getState() as unknown as Record<string, unknown>;
    for (const gone of ['setQuizAnswers', 'setAllocation', 'markAllocationExplainerSeen']) {
      expect(a[gone], gone).toBeUndefined();
    }
  });

  it('acceptCatch with a per-prompt pct leaves settings.catchPct unchanged', async () => {
    const a = createAppStore();
    await a.persist.rehydrate();
    onboard(a);
    a.getState().landPaycheck();
    expect(a.getState().pendingPaychecks.length).toBe(1);
    a.getState().acceptCatch(10);
    expect(a.getState().settings.catchPct).toBe(5);
    const c = a.getState().events.find((e) => e.kind === 'Catch');
    expect(c && c.kind === 'Catch' ? c.cents : 0).toBe(5000);
  });
});

describe('auto-advance', () => {
  it('2 days -> 2 ticks; 45 days -> 30; freeze -> 0; clock moved back -> 0', () => {
    expect(computeAutoAdvanceTicks('2026-09-04', '2026-09-06', false)).toBe(2);
    expect(computeAutoAdvanceTicks('2026-07-23', '2026-09-06', false)).toBe(30);
    expect(computeAutoAdvanceTicks('2026-09-04', '2026-09-06', true)).toBe(0);
    expect(computeAutoAdvanceTicks('2026-09-08', '2026-09-06', false)).toBe(0);
    expect(computeAutoAdvanceTicks('2026-09-06', '2026-09-06', false)).toBe(0);
  });
  it('runAutoAdvance ticks the state and updates lastOpenedRealDate', async () => {
    overrideUrlParams({ demo: false, freeze: false, start: '2026-06-15', seed: 42, nudge: false, push: null });
    const a = createAppStore();
    await a.persist.rehydrate();
    onboard(a);
    const s = { ...pickAppState(a.getState()), clock: { ...a.getState().clock, lastOpenedRealDate: '2026-09-04' } };
    const r = runAutoAdvance(s, deps, '2026-09-06', false);
    expect(r.ticks).toBe(2);
    expect(r.state.clock.dayIndex).toBe(2);
    expect(r.state.clock.lastOpenedRealDate).toBe('2026-09-06');
    const back = runAutoAdvance(s, deps, '2026-09-01', false);
    expect(back.ticks).toBe(0);
    expect(back.state.clock.lastOpenedRealDate).toBe('2026-09-01');
    const frozen = runAutoAdvance(s, deps, '2026-09-06', true);
    expect(frozen.ticks).toBe(0);
    expect(frozen.state.clock.lastOpenedRealDate).toBe('2026-09-04');
    const notOnboarded = runAutoAdvance({ ...s, profile: { ...s.profile, onboardingComplete: false } }, deps, '2026-09-06', false);
    expect(notOnboarded.ticks).toBe(0);
  });
});

describe('url params', () => {
  it('parses demo, freeze, start, seed', () => {
    expect(parseUrlParams('?demo=1&freeze=1&start=2026-06-15&seed=42')).toEqual({
      demo: true,
      freeze: true,
      start: '2026-06-15',
      seed: 42,
      nudge: false,
      push: null,
    });
    expect(parseUrlParams('')).toEqual({ demo: false, freeze: false, start: null, seed: null, nudge: false, push: null });
    expect(parseUrlParams('?start=2026-02-30&seed=abc&demo=0')).toEqual({
      demo: false,
      freeze: false,
      start: null,
      seed: null,
      nudge: false,
      push: null,
    });
  });

  // Plan 5.4 and 8.10: the two v2 parameters, and the refusal of an unknown push state.
  it('parses ?nudge=1 and the push state override', () => {
    expect(parseUrlParams('?nudge=1').nudge).toBe(true);
    expect(parseUrlParams('?push=denied').push).toBe('denied');
    expect(parseUrlParams('?push=needs-ios-install').push).toBe('needs-ios-install');
    expect(parseUrlParams('?push=nonsense').push).toBeNull();
  });
});
