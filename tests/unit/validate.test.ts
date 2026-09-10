/**
 * The import validator, rewritten for the v2 shape (plan 5.2, 5.5, 1.4, A7, R3.5, R11.1).
 *
 * Deleted with the simulated engine: every case about holdings, history, the trading day
 * index, the allocation, the quiz answers, the sweep fills and `firstSweepDayIndex`. Fourteen
 * cases. What replaces them are the v2 arrays (places, visits, nudges, ledger), the two rules
 * that make a forged file useless (habits are recomputed, `push` is dropped) and the v1
 * refusal.
 */
import { describe, expect, it } from 'vitest';
import { V1_REFUSAL, validateImportedState } from '../../src/state/validate';
import { parseImport, exportStateJson, pickAppState } from '../../src/state/persistence';
import { addLedgerEntry, completeOnboarding, forceNudge, injectHabitVisits, setNudgesEnabled, takeSkip, tickN } from '../../src/domain/tick';
import { initialAppState, type AppState, type Deps } from '../../src/domain/types';
import { createSimulatedTransactionSource } from '../../src/domain/simulator';
import { createSimulatedLocationSource } from '../../src/domain/places';

function deps(): Deps {
  return { transactions: createSimulatedTransactionSource(), location: createSimulatedLocationSource() };
}

function onboarded(): AppState {
  const s = initialAppState();
  s.profile = { ...s.profile, name: 'Sam', seed: 42, createdAt: '2026-09-06T00:00:00.000Z', fear: 'pointless', summerEarnedCents: 300000 };
  s.settings = { ...s.settings, nudgesEnabled: true };
  return completeOnboarding(s, { startDate: '2026-06-15', todayLocal: '2026-09-06', seedOverride: null });
}

/** A state where every v2 array is non empty: events, places, visits, habits, nudges, ledger. */
function lived(): AppState {
  let s = tickN(onboarded(), deps(), 20);
  s = forceNudge(setNudgesEnabled(injectHabitVisits(s, 'Demo Coffee', 510, 435), true));
  const nudge = s.nudges.find((n) => n.status === 'pending');
  if (nudge) s = takeSkip(s, nudge.id);
  const r = addLedgerEntry(s, { date: '2026-07-01', amountCents: 5000, what: 'Index fund', note: 'n', source: 'manual' }, '2026-07-01T10:00:00.000Z');
  return r.ok ? r.state : s;
}

const RICH = JSON.parse(JSON.stringify(pickAppState(lived()))) as AppState;
const rich = () => JSON.parse(JSON.stringify(RICH)) as AppState;

function mutated(fn: (g: Record<string, never>) => void): unknown {
  const g = rich() as unknown as Record<string, never>;
  fn(g);
  return g;
}

function expectRejected(input: unknown, matching?: RegExp) {
  const r = validateImportedState(input);
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.problems.length).toBeGreaterThan(0);
    if (matching) expect(r.problems.join('\n')).toMatch(matching);
  }
}

describe('the fixture itself is a real v2 state', () => {
  it('has every array populated, so the cases below are testing something', () => {
    expect(RICH.events.length).toBeGreaterThan(0);
    expect(RICH.places.length).toBeGreaterThan(0);
    expect(RICH.visits.length).toBeGreaterThan(0);
    expect(RICH.habits.length).toBeGreaterThan(0);
    expect(RICH.nudges.length).toBeGreaterThan(0);
    expect(RICH.ledger.length).toBeGreaterThan(0);
    expect(RICH.pendingPaychecks.length).toBeGreaterThan(0);
  });
});

describe('validateImportedState: happy paths', () => {
  it('accepts a rich exported state and returns exactly the v2 AppState keys', () => {
    const r = validateImportedState(rich());
    expect(r.ok, r.ok ? '' : r.problems.join('\n')).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.state).sort()).toEqual(
        [
          'clock',
          'demo',
          'events',
          'flags',
          'habits',
          'jarCents',
          'learn',
          'learnSurfaces',
          'ledger',
          'lessons',
          'milestones',
          'nudges',
          'pendingPaychecks',
          'places',
          'profile',
          'push',
          'schemaVersion',
          'settings',
          'visits',
        ].sort(),
      );
    }
  });

  it('accepts a fresh, never onboarded state (blank name, blank dates)', () => {
    const r = validateImportedState(JSON.parse(JSON.stringify(initialAppState())));
    expect(r.ok, r.ok ? '' : r.problems.join('\n')).toBe(true);
  });

  it('drops unknown top level keys instead of carrying them into the store', () => {
    const r = validateImportedState({ ...rich(), evilKey: { drop: 'me' } } as unknown);
    expect(r.ok).toBe(true);
    if (r.ok) expect('evilKey' in (r.state as unknown as Record<string, unknown>)).toBe(false);
  });

  it('parseImport round trips an exported string and reports problems on failure', () => {
    const json = exportStateJson(rich());
    expect(parseImport(json).ok, 'a fresh export must import').toBe(true);
    const notJson = parseImport('{{{');
    expect(notJson.ok).toBe(false);
    if (!notJson.ok) expect(notJson.problems[0]).toMatch(/JSON/);
  });
});

describe('1.4 and A7: a v1 file is refused, never migrated', () => {
  it('refuses schemaVersion 1 with its own named message', () => {
    const r = validateImportedState({ schemaVersion: 1, profile: {}, holdings: {}, history: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems).toEqual([V1_REFUSAL]);
      expect(V1_REFUSAL).toContain('v1 backup');
      expect(V1_REFUSAL).toContain('Reset the demo');
    }
  });

  it('says nothing about the individual v1 fields, because it never got that far', () => {
    const r = validateImportedState({ schemaVersion: 1, jarCents: -500 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems).toHaveLength(1);
  });

  it('refuses any other version too', () => {
    expectRejected({ ...rich(), schemaVersion: 3 }, /schemaVersion/);
    expectRejected({ ...rich(), schemaVersion: '2' }, /schemaVersion/);
  });
});

describe('validateImportedState: root and shape', () => {
  it('rejects non objects and arrays', () => {
    expectRejected(null);
    expectRejected('a state');
    expectRejected([]);
  });

  it('rejects a missing top level key by name', () => {
    for (const k of [
      'profile',
      'settings',
      'clock',
      'jarCents',
      'places',
      'visits',
      'habits',
      'nudges',
      'ledger',
      'events',
      'pendingPaychecks',
      'lessons',
      'milestones',
      'flags',
      'demo',
    ]) {
      expectRejected(
        mutated((g) => delete g[k]),
        new RegExp(`${k}: missing`),
      );
    }
  });

  it('rejects null where an object is expected, which typeof would let through', () => {
    for (const k of ['profile', 'settings', 'clock', 'lessons', 'milestones', 'flags', 'demo']) {
      expectRejected(
        mutated((g) => ((g as Record<string, unknown>)[k] = null)),
        new RegExp(k),
      );
    }
    for (const k of ['places', 'visits', 'habits', 'nudges', 'ledger', 'events', 'pendingPaychecks']) {
      expectRejected(
        mutated((g) => ((g as Record<string, unknown>)[k] = {})),
        new RegExp(k),
      );
    }
  });
});

describe('R1.1: money and indices are non negative integers', () => {
  it('rejects fractional, negative, NaN, null and string money', () => {
    for (const v of [1.5, -1, NaN, Infinity, null, '500', undefined]) {
      expectRejected(
        mutated((g) => ((g as Record<string, unknown>).jarCents = v)),
        /jarCents/,
      );
    }
  });

  it('rejects a bad day index on the clock, an event, a visit and a nudge', () => {
    expectRejected(
      mutated((g) => ((g.clock as Record<string, unknown>).dayIndex = -1)),
      /clock\.dayIndex/,
    );
    expectRejected(
      mutated((g) => (((g.events as unknown[])[0] as Record<string, unknown>).dayIndex = -2)),
      /events\[0\]\.dayIndex/,
    );
    expectRejected(
      mutated((g) => (((g.visits as unknown[])[0] as Record<string, unknown>).dayIndex = 2.5)),
      /visits\[0\]\.dayIndex/,
    );
    expectRejected(
      mutated((g) => (((g.nudges as unknown[])[0] as Record<string, unknown>).estimateCents = -1)),
      /nudges\[0\]\.estimateCents/,
    );
  });

  it('rejects jarCents at Number.MAX_SAFE_INTEGER, which is finite and absurd', () => {
    expectRejected(
      mutated((g) => ((g as unknown as AppState).jarCents = Number.MAX_SAFE_INTEGER)),
      /jarCents/,
    );
  });
});

describe('dates', () => {
  it('rejects dates that are not YYYY-MM-DD or are not real calendar days', () => {
    for (const d of ['yesterday', '2026-13-01', '2026-02-30', '06/15/2026', '2026-6-15', '', 20260615]) {
      expectRejected(
        mutated((g) => ((g.clock as Record<string, unknown>).startDate = d)),
        /clock\.startDate/,
      );
    }
  });

  it('rejects a bad event date, visit date and ledger date', () => {
    expectRejected(
      mutated((g) => (((g.events as unknown[])[0] as Record<string, unknown>).date = 'soon')),
      /events\[0\]\.date/,
    );
    expectRejected(
      mutated((g) => (((g.visits as unknown[])[0] as Record<string, unknown>).date = '2026-02-31')),
      /visits\[0\]\.date/,
    );
    expectRejected(
      mutated((g) => (((g.ledger as unknown[])[0] as Record<string, unknown>).date = '15/06/2026')),
      /ledger\[0\]\.date/,
    );
  });

  it('rejects an unparseable createdAt but accepts an ISO timestamp', () => {
    expectRejected(
      mutated((g) => ((g.profile as Record<string, unknown>).createdAt = 'the other day')),
      /createdAt/,
    );
    expect(validateImportedState(mutated((g) => ((g.profile as Record<string, unknown>).createdAt = '2026-01-02T03:04:05.678Z'))).ok).toBe(true);
  });
});

describe('enums and ranges', () => {
  it('rejects out of range settings and profile values', () => {
    // R6.3: the jar goal must be one of the four presets, so a file cannot invent one.
    expectRejected(
      mutated((g) => ((g.settings as Record<string, unknown>).jarGoalCents = 1234)),
      /jarGoalCents/,
    );
    expectRejected(
      mutated((g) => ((g.settings as Record<string, unknown>).catchPct = 0)),
      /catchPct/,
    );
    expectRejected(
      mutated((g) => ((g.settings as Record<string, unknown>).catchPct = 21)),
      /catchPct/,
    );
    expectRejected(
      mutated((g) => ((g.settings as Record<string, unknown>).nudgesEnabled = 1)),
      /nudgesEnabled/,
    );
    expectRejected(
      mutated((g) => ((g.profile as Record<string, unknown>).age = 17)),
      /profile\.age/,
    );
    expectRejected(
      mutated((g) => ((g.profile as Record<string, unknown>).fear = 'everything')),
      /profile\.fear/,
    );
    expectRejected(
      mutated((g) => ((g.demo as Record<string, unknown>).summerOverride = 'maybe')),
      /summerOverride/,
    );
  });

  it('R4.3 and A10: rejects a quiet hour window that wraps midnight or leaves the day', () => {
    expectRejected(
      mutated((g) => ((g.settings as Record<string, unknown>).quietStartMinute = 1300)),
      /quietEndMinute/,
    );
    expectRejected(
      mutated((g) => ((g.settings as Record<string, unknown>).quietEndMinute = 1440)),
      /quietEndMinute/,
    );
  });

  it('rejects an onboarded profile with an empty name and any name over 40 characters', () => {
    expectRejected(
      mutated((g) => ((g.profile as Record<string, unknown>).name = '')),
      /profile\.name/,
    );
    expectRejected(
      mutated((g) => ((g.profile as Record<string, unknown>).name = 'x'.repeat(41))),
      /profile\.name/,
    );
    expect(validateImportedState(mutated((g) => ((g.profile as Record<string, unknown>).name = 'x'.repeat(40)))).ok).toBe(true);
  });

  it('rejects a nudge with an unknown status or a minute outside the day', () => {
    expectRejected(
      mutated((g) => (((g.nudges as unknown[])[0] as Record<string, unknown>).status = 'snoozed')),
      /nudges\[0\]\.status/,
    );
    expectRejected(
      mutated((g) => (((g.nudges as unknown[])[0] as Record<string, unknown>).nudgeMinute = 1440)),
      /nudges\[0\]\.nudgeMinute/,
    );
  });

  it('R2.4: rejects a visit minute outside the day', () => {
    expectRejected(
      mutated((g) => (((g.visits as unknown[])[0] as Record<string, unknown>).minuteOfDay = -1)),
      /visits\[0\]\.minuteOfDay/,
    );
    expectRejected(
      mutated((g) => (((g.visits as unknown[])[0] as Record<string, unknown>).minuteOfDay = 1440)),
      /visits\[0\]\.minuteOfDay/,
    );
  });
});

describe('R7.1: the ledger', () => {
  it('rejects a zero, negative or oversized amount', () => {
    for (const v of [0, -1, 100_000_001]) {
      expectRejected(
        mutated((g) => (((g.ledger as unknown[])[0] as Record<string, unknown>).amountCents = v)),
        /ledger\[0\]\.amountCents/,
      );
    }
  });

  it('rejects an empty or over long `what`, and an over long note', () => {
    expectRejected(
      mutated((g) => (((g.ledger as unknown[])[0] as Record<string, unknown>).what = '   ')),
      /ledger\[0\]\.what/,
    );
    expectRejected(
      mutated((g) => (((g.ledger as unknown[])[0] as Record<string, unknown>).what = 'x'.repeat(61))),
      /ledger\[0\]\.what/,
    );
    expectRejected(
      mutated((g) => (((g.ledger as unknown[])[0] as Record<string, unknown>).note = 'x'.repeat(201))),
      /ledger\[0\]\.note/,
    );
  });

  it('rejects an unknown source', () => {
    expectRejected(
      mutated((g) => (((g.ledger as unknown[])[0] as Record<string, unknown>).source = 'brokerage')),
      /ledger\[0\]\.source/,
    );
  });
});

describe('array element shapes', () => {
  it('rejects an unknown event kind and kind specific field damage', () => {
    expectRejected(
      mutated((g) => (((g.events as unknown[])[0] as Record<string, unknown>).kind = 'Withdrawal')),
      /events\[0\]\.kind/,
    );
    // The deleted kinds are as unknown as any other invented one.
    for (const kind of ['Sweep', 'Fee']) {
      expectRejected(
        mutated((g) => (((g.events as unknown[])[0] as Record<string, unknown>).kind = kind)),
        /events\[0\]\.kind/,
      );
    }
    expectRejected(
      mutated((g) =>
        (g.events as unknown[]).push({ kind: 'Catch', id: 'c', dayIndex: 1, date: '2026-06-16', paycheckId: 'p', paycheckCents: 5000, pct: 900, cents: 250 }),
      ),
      /pct/,
    );
    expectRejected(
      mutated((g) => (g.events as unknown[]).push(null)),
      /events/,
    );
  });

  it('rejects a Skip event missing the place it names', () => {
    expectRejected(
      mutated((g) => {
        const s = g as unknown as AppState;
        const i = s.events.findIndex((e) => e.kind === 'Skip');
        (s.events[i] as unknown as Record<string, unknown>).displayName = 42;
      }),
      /displayName/,
    );
  });

  it('rejects a pending paycheck missing its fields', () => {
    expectRejected(
      mutated((g) => ((g.pendingPaychecks as unknown[]) = [{ id: 'x' }])),
      /pendingPaychecks\[0\]/,
    );
    expectRejected(
      mutated((g) => ((g.pendingPaychecks as unknown[]) = [{ id: 'x', dayIndex: 1, amountCents: -5, source: 'demo' }])),
      /amountCents/,
    );
  });
});

describe('lessons, learn and milestones', () => {
  it('requires exactly the eight known lesson ids with the right shape', () => {
    expectRejected(
      mutated((g) => delete (g.lessons as Record<string, never>).L8),
      /lessons/,
    );
    expectRejected(
      mutated((g) => ((g.lessons as Record<string, unknown>).L9 = { unlockedDay: null, readAt: null })),
      /lessons/,
    );
    expectRejected(
      mutated((g) => ((g.lessons as Record<string, unknown>).L2 = { unlockedDay: -1, readAt: null })),
      /lessons\.L2\.unlockedDay/,
    );
    expectRejected(
      mutated((g) => ((g.lessons as Record<string, unknown>).L2 = { unlockedDay: 0, readAt: 'whenever' })),
      /lessons\.L2\.readAt/,
    );
  });

  it('R12.5: rebuilds the learn map with every piece unlocked, whatever the file claimed', () => {
    const r = validateImportedState(
      mutated((g) => {
        (g as Record<string, unknown>).learn = { E01: { unlockedDay: null, readAt: null } };
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      // A file cannot lock a piece, because nothing in the library is ever locked.
      for (const id of Object.keys(r.state.learn)) expect(r.state.learn[id].unlockedDay, id).toBe(0);
      expect(Object.keys(r.state.learn)).toHaveLength(20);
    }
  });

  it('refuses an unknown learn id rather than carrying it in', () => {
    expectRejected(
      mutated((g) => {
        (g as Record<string, unknown>).learn = { E99: { unlockedDay: 0, readAt: null } };
      }),
      /learn\.E99/,
    );
  });

  it('defaults the learn map and the surfaces when an older v2 file has neither', () => {
    const r = validateImportedState(
      mutated((g) => {
        delete (g as Record<string, never>).learn;
        delete (g as Record<string, never>).learnSurfaces;
      }),
    );
    expect(r.ok, r.ok ? '' : r.problems.join('\n')).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.state.learn)).toHaveLength(20);
      expect(r.state.learnSurfaces.dayThirty).toEqual({ firedDay: null, dismissed: false });
    }
  });

  it('rejects bad milestone values and a non boolean confetti flag', () => {
    expectRejected(
      mutated((g) => ((g.milestones as Record<string, unknown>).confettiShown = 1)),
      /confettiShown/,
    );
    expectRejected(
      mutated((g) => ((g.milestones as Record<string, unknown>).firstSkipDayIndex = -4)),
      /firstSkipDayIndex/,
    );
  });
});

describe('R3.5: habits are derived, so a forged habits array is worthless', () => {
  it('recomputes them from the visits and ignores what the file claimed', () => {
    const r = validateImportedState(
      mutated((g) => {
        const s = g as unknown as AppState;
        s.habits = s.habits.map((h) => ({ ...h, isHabit: true, visitCount: 9999, usualMinute: 1, spreadMinutes: 0, estimateCents: 99_999_99 }));
      }),
    );
    expect(r.ok, r.ok ? '' : r.problems.join('\n')).toBe(true);
    if (r.ok) {
      const forged = r.state.habits.find((h) => h.visitCount === 9999);
      expect(forged).toBeUndefined();
      // And they still line up with the places that survived.
      expect(r.state.habits.map((h) => h.placeId).sort()).toEqual(r.state.places.map((p) => p.id).sort());
    }
  });
});

/**
 * Criterion 13 says "no KEY matching /lat|lon|lng|coord|geo/i", and the distinction is load
 * bearing: the merchant "Late Night Ramen" puts the letters "lat" in a VALUE of every export
 * that has been anywhere near it. A raw text grep over the file reports a coordinate leak that
 * is not there. This walks the keys, which is what the criterion actually asks for.
 */
function keysOf(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      keysOf(v, out);
    }
  }
  return out;
}

const COORD_KEY = /lat|lon|lng|coord|geo/i;

describe('R11.1 and 5.5: what an import may never carry in', () => {
  it('drops a coordinate off a place, a visit and an event', () => {
    const r = validateImportedState(
      mutated((g) => {
        const s = g as unknown as Record<string, unknown>;
        (s.places as Record<string, unknown>[])[0].lat = 51.5;
        (s.places as Record<string, unknown>[])[0].lon = -0.12;
        (s.visits as Record<string, unknown>[])[0].coords = { lat: 51.5, lon: -0.12 };
      }),
    );
    expect(r.ok, r.ok ? '' : r.problems.join('\n')).toBe(true);
    if (r.ok) {
      const offenders = keysOf(r.state).filter((k) => COORD_KEY.test(k));
      expect(offenders).toEqual([]);
    }
  });

  it('drops the whole push block, so a forged file cannot point this browser at an endpoint', () => {
    const r = validateImportedState(
      mutated((g) => {
        (g as Record<string, unknown>).push = {
          supportState: 'ready',
          subscribed: true,
          endpointHash: 'deadbeef'.repeat(8),
          tz: 'Europe/London',
          lastScheduleSent: { date: '2026-06-29', minute: 460 },
          lastError: null,
        };
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.push.subscribed).toBe(false);
      expect(r.state.push.endpointHash).toBeNull();
      expect(r.state.push.tz).toBeNull();
      expect(r.state.push.lastScheduleSent).toBeNull();
      expect(r.state.push.supportState).toBe('unknown');
    }
  });

  it('R11.2 and criterion 13: an export carries no coordinate key and no push block', () => {
    const parsed = JSON.parse(exportStateJson(rich())) as unknown;
    expect(keysOf(parsed).filter((k) => COORD_KEY.test(k))).toEqual([]);
    expect((parsed as Record<string, unknown>).push).toBeUndefined();
  });

  it('criterion 13: and no float outside the summer projection inputs', () => {
    const parsed = JSON.parse(exportStateJson(rich())) as unknown;
    const floats: string[] = [];
    const walk = (v: unknown, path: string): void => {
      if (typeof v === 'number' && !Number.isInteger(v)) floats.push(`${path} = ${v}`);
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    walk(parsed, 'export');
    expect(floats).toEqual([]);
  });
});

describe('ordering and cross field rules', () => {
  it('rejects a reversed events array', () => {
    expectRejected(
      mutated((g) => {
        const s = g as unknown as AppState;
        s.events = [...s.events].reverse();
      }),
      /events\[\d+\]\.dayIndex/,
    );
  });

  it('accepts an events array that is already in order', () => {
    expect(validateImportedState(rich()).ok).toBe(true);
  });

  it('rejects an event, a nudge and a paycheck dated past clock.dayIndex', () => {
    expectRejected(
      mutated((g) => {
        const s = g as unknown as AppState;
        s.events[s.events.length - 1].dayIndex = 999999;
      }),
      /events\[\d+\]\.dayIndex: expected at most clock\.dayIndex/,
    );
    expectRejected(
      mutated((g) => {
        const s = g as unknown as AppState;
        s.nudges[0].dayIndex = s.clock.dayIndex + 1;
      }),
      /nudges\[0\]\.dayIndex/,
    );
    expectRejected(
      mutated((g) => {
        const s = g as unknown as AppState;
        s.pendingPaychecks = [{ id: 'p-x', dayIndex: s.clock.dayIndex + 5, amountCents: 50000, source: 'schedule' }];
      }),
      /pendingPaychecks\[0\]\.dayIndex/,
    );
  });

  it('rejects a place last seen before it was first seen, or after today', () => {
    expectRejected(
      mutated((g) => {
        const s = g as unknown as AppState;
        s.places[0].lastSeenDay = s.places[0].firstSeenDay - 1;
      }),
      /places\[0\]\.lastSeenDay/,
    );
    expectRejected(
      mutated((g) => {
        const s = g as unknown as AppState;
        s.places[0].lastSeenDay = s.clock.dayIndex + 1;
      }),
      /places\[0\]\.lastSeenDay/,
    );
  });

  it('rejects a firstSkipDayIndex with no matching Skip event', () => {
    expectRejected(
      mutated((g) => {
        const s = g as unknown as AppState;
        // A day that no Skip event actually falls on, so the claim is provably invented.
        const skipDays = new Set(s.events.filter((e) => e.kind === 'Skip').map((e) => e.dayIndex));
        let day = 0;
        while (skipDays.has(day)) day += 1;
        s.milestones.firstSkipDayIndex = day;
      }),
      /firstSkipDayIndex: expected to match/,
    );
  });

  it('accepts the real firstSkipDayIndex from a lived in export', () => {
    const g = rich();
    expect(g.milestones.firstSkipDayIndex).not.toBeNull();
    expect(validateImportedState(g).ok).toBe(true);
  });
});

describe('reporting', () => {
  it('collects every problem in one pass instead of stopping at the first', () => {
    const r = validateImportedState(
      mutated((g) => {
        (g.settings as Record<string, unknown>).theme = 'purple';
        (g.settings as Record<string, unknown>).catchPct = 999;
        (g.profile as Record<string, unknown>).age = 900;
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.length).toBeGreaterThanOrEqual(3);
  });

  it('is pure: the input object is not modified', () => {
    const g = rich();
    const before = JSON.stringify(g);
    validateImportedState(g);
    expect(JSON.stringify(g)).toBe(before);
  });

  it('survives a very large events array without throwing', () => {
    const g = rich();
    const last = g.events[g.events.length - 1];
    for (let i = 0; i < 5000; i++) g.events.push({ ...last, id: `bulk:${i}` });
    const r = validateImportedState(g);
    expect(typeof r.ok).toBe('boolean');
  });
});
