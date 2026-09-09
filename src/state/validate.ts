// Plan v2 section 5.2 and A7: full shape, range, ordering and cross-field validation for
// imported state, rewritten for the v2 shape. Pure. Returns the validated state or the list
// of problems. Nothing here touches storage.
//
// A v1 envelope (schemaVersion 1) is refused with a named message rather than migrated: its
// holdings, history and allocation have no v2 meaning (plan section 3, "Explicitly out of
// scope").
import type { AppState, FearOption, LedgerKind, LedgerSource, LessonId, Place, PlaceVisit, Theme } from '../domain/types';
import { MAX_TERM_MONTHS, MAX_YIELD_BPS, isUsableTerm, isUsableYield } from '../domain/maturity';
import { LESSON_IDS, emptyLearn, emptyLearnSurfaces, initialPushState } from '../domain/types';
import { LEARN_IDS, LEARN_SURFACES } from '../content/learn';
import { compareDates, isValidDate, safeSimDate } from '../domain/dates';
import { recomputeHabits } from '../domain/habits';
import {
  JAR_GOAL_PRESETS,
  LEDGER_MAX_AMOUNT_CENTS,
  LEDGER_NOTE_MAX_LENGTH,
  LEDGER_WHAT_MAX_LENGTH,
  MAX_CATCH_PCT,
  MAX_MINUTE_OF_DAY,
  MAX_MONEY_CENTS,
  MAX_AGE,
  MAX_NAME_LENGTH,
  MIN_AGE,
  MIN_CATCH_PCT,
  SCHEMA_VERSION,
  V1_SCHEMA_VERSION,
} from '../config';

export type ValidationResult = { ok: true; state: AppState } | { ok: false; problems: string[] };

/** The named message a v1 file is refused with (plan 1.4, A7). */
export const V1_REFUSAL =
  'schemaVersion: this is a Spare Change v1 backup. v1 saved a simulated portfolio that v2 does not have, so it cannot be brought across. Reset the demo to start fresh.';

const THEMES: Theme[] = ['system', 'light', 'dark'];
const FEARS: FearOption[] = ['rent', 'pointless', 'confused', 'losing'];
const EVENT_KINDS: LedgerKind[] = ['Purchase', 'RoundUp', 'Catch', 'Skip', 'JarMove', 'JarEmptied', 'Paycheck'];
const PURCHASE_CATEGORIES = ['coffee', 'food', 'groceries', 'subscription', 'transport', 'campus', 'fun'];
const PAYCHECK_SOURCES = ['schedule', 'demo'];
const LEDGER_SOURCES: LedgerSource[] = ['jar', 'manual'];
const NUDGE_STATUSES = ['pending', 'skipped', 'expired'];
const MAX_SEED = 0xffffffff;

type Obj = Record<string, unknown>;

class Checker {
  readonly problems: string[] = [];

  fail(path: string, why: string): false {
    this.problems.push(`${path}: ${why}`);
    return false;
  }

  /** A plain object (not null, not an array). Rejects the `typeof null === 'object'` hole. */
  obj(v: unknown, path: string): v is Obj {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return this.fail(path, 'expected an object');
    return true;
  }

  arr(v: unknown, path: string): v is unknown[] {
    if (!Array.isArray(v)) return this.fail(path, 'expected an array');
    return true;
  }

  bool(v: unknown, path: string): v is boolean {
    if (typeof v !== 'boolean') return this.fail(path, 'expected a boolean');
    return true;
  }

  str(v: unknown, path: string): v is string {
    if (typeof v !== 'string') return this.fail(path, 'expected a string');
    return true;
  }

  strMax(v: unknown, path: string, max: number): v is string {
    if (!this.str(v, path)) return false;
    if (v.length > max) return this.fail(path, `expected at most ${max} characters`);
    return true;
  }

  /** Non-negative integer. Rejects NaN, Infinity, null, strings and negatives. */
  countInt(v: unknown, path: string): v is number {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return this.fail(path, 'expected a non-negative integer');
    return true;
  }

  intBetween(v: unknown, path: string, lo: number, hi: number): v is number {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) return this.fail(path, `expected an integer ${lo} to ${hi}`);
    return true;
  }

  /**
   * R1.1: every monetary value is an integer number of cents. The plausibility ceiling stops
   * a structurally valid but absurd figure from reaching a selector.
   */
  money(v: unknown, path: string): v is number {
    if (!this.countInt(v, path)) return false;
    if ((v as number) > MAX_MONEY_CENTS) return this.fail(path, `expected at most ${MAX_MONEY_CENTS} cents`);
    return true;
  }

  nullableCountInt(v: unknown, path: string): boolean {
    if (v === null) return true;
    return this.countInt(v, path);
  }

  oneOf(v: unknown, path: string, allowed: readonly unknown[]): boolean {
    if (!allowed.includes(v)) return this.fail(path, `expected one of ${allowed.map((a) => JSON.stringify(a)).join(', ')}`);
    return true;
  }

  /** YYYY-MM-DD that is a real calendar date. */
  calendarDate(v: unknown, path: string): boolean {
    if (!this.str(v, path)) return false;
    if (!isValidDate(v)) return this.fail(path, 'expected a real YYYY-MM-DD date');
    return true;
  }

  optionalCalendarDate(v: unknown, path: string): boolean {
    if (v === '') return true;
    return this.calendarDate(v, path);
  }

  /** createdAt / readAt are ISO timestamps, not YYYY-MM-DD. Empty means "not set yet". */
  optionalTimestamp(v: unknown, path: string): boolean {
    if (!this.str(v, path)) return false;
    if (v === '') return true;
    if (Number.isNaN(Date.parse(v))) return this.fail(path, 'expected a parseable date-time string');
    return true;
  }

  minuteOfDay(v: unknown, path: string): v is number {
    return this.intBetween(v, path, 0, MAX_MINUTE_OF_DAY);
  }
}

function validateProfile(c: Checker, v: unknown): void {
  if (!c.obj(v, 'profile')) return;
  const onboarded = v.onboardingComplete === true;
  c.bool(v.onboardingComplete, 'profile.onboardingComplete');
  if (c.str(v.name, 'profile.name')) {
    if (v.name.length > MAX_NAME_LENGTH || (onboarded && v.name.length < 1)) {
      c.fail('profile.name', `expected 1 to ${MAX_NAME_LENGTH} characters`);
    }
  }
  c.str(v.email, 'profile.email');
  c.intBetween(v.seed, 'profile.seed', 0, MAX_SEED);
  c.optionalTimestamp(v.createdAt, 'profile.createdAt');
  if (v.summerEarnedCents !== null) c.money(v.summerEarnedCents, 'profile.summerEarnedCents');
  if (v.summerLeftCents !== null) c.money(v.summerLeftCents, 'profile.summerLeftCents');
  c.intBetween(v.age, 'profile.age', MIN_AGE, MAX_AGE);
  c.oneOf(v.fear, 'profile.fear', [...FEARS, null]);
}

function validateSettings(c: Checker, v: unknown): void {
  if (!c.obj(v, 'settings')) return;
  c.intBetween(v.catchPct, 'settings.catchPct', MIN_CATCH_PCT, MAX_CATCH_PCT);
  c.oneOf(v.jarGoalCents, 'settings.jarGoalCents', JAR_GOAL_PRESETS);
  c.oneOf(v.theme, 'settings.theme', THEMES);
  c.bool(v.nudgesEnabled, 'settings.nudgesEnabled');
  const start = c.minuteOfDay(v.quietStartMinute, 'settings.quietStartMinute');
  const end = c.minuteOfDay(v.quietEndMinute, 'settings.quietEndMinute');
  // R4.3 is a window inside one day. A pair that wraps midnight has no meaning here and the
  // UI never offers it, so a file claiming one is refused rather than silently reinterpreted.
  if (start && end && (v.quietStartMinute as number) > (v.quietEndMinute as number)) {
    c.fail('settings.quietEndMinute', 'expected at or after settings.quietStartMinute');
  }
  if (c.arr(v.mutedPlaceIds, 'settings.mutedPlaceIds')) {
    v.mutedPlaceIds.forEach((id, i) => c.strMax(id, `settings.mutedPlaceIds[${i}]`, 200));
  }
}

function validateClock(c: Checker, v: unknown, onboarded: boolean): void {
  if (!c.obj(v, 'clock')) return;
  if (onboarded) c.calendarDate(v.startDate, 'clock.startDate');
  else c.optionalCalendarDate(v.startDate, 'clock.startDate');
  c.countInt(v.dayIndex, 'clock.dayIndex');
  c.optionalCalendarDate(v.lastOpenedRealDate, 'clock.lastOpenedRealDate');
}

/**
 * R11.1 and R11.2: a place record is rebuilt field by field on import, so a coordinate, an
 * address or any other extra key in the file is dropped rather than carried into state.
 */
function validatePlace(c: Checker, v: unknown, path: string): void {
  if (!c.obj(v, path)) return;
  c.strMax(v.id, `${path}.id`, 200);
  c.strMax(v.displayName, `${path}.displayName`, 200);
  c.countInt(v.firstSeenDay, `${path}.firstSeenDay`);
  c.countInt(v.lastSeenDay, `${path}.lastSeenDay`);
  if (v.coarseLabel !== null) c.strMax(v.coarseLabel, `${path}.coarseLabel`, 60);
}

function validateVisit(c: Checker, v: unknown, path: string): void {
  if (!c.obj(v, path)) return;
  c.strMax(v.id, `${path}.id`, 200);
  c.strMax(v.placeId, `${path}.placeId`, 200);
  c.strMax(v.displayName, `${path}.displayName`, 200);
  c.countInt(v.dayIndex, `${path}.dayIndex`);
  c.calendarDate(v.date, `${path}.date`);
  c.minuteOfDay(v.minuteOfDay, `${path}.minuteOfDay`);
  if (v.amountCents !== null) c.money(v.amountCents, `${path}.amountCents`);
}

function validateNudge(c: Checker, v: unknown, path: string): void {
  if (!c.obj(v, path)) return;
  c.strMax(v.id, `${path}.id`, 200);
  c.strMax(v.placeId, `${path}.placeId`, 200);
  c.strMax(v.displayName, `${path}.displayName`, 200);
  c.countInt(v.dayIndex, `${path}.dayIndex`);
  c.minuteOfDay(v.nudgeMinute, `${path}.nudgeMinute`);
  c.money(v.estimateCents, `${path}.estimateCents`);
  c.oneOf(v.status, `${path}.status`, NUDGE_STATUSES);
}

/** R7.1. */
function validateLedgerEntry(c: Checker, v: unknown, path: string): void {
  if (!c.obj(v, path)) return;
  c.strMax(v.id, `${path}.id`, 200);
  c.calendarDate(v.date, `${path}.date`);
  if (c.money(v.amountCents, `${path}.amountCents`)) {
    if (v.amountCents <= 0) c.fail(`${path}.amountCents`, 'expected a positive amount');
    else if (v.amountCents > LEDGER_MAX_AMOUNT_CENTS) c.fail(`${path}.amountCents`, `expected at most ${LEDGER_MAX_AMOUNT_CENTS} cents`);
  }
  if (c.str(v.what, `${path}.what`)) {
    const t = v.what.trim();
    if (t.length < 1 || t.length > LEDGER_WHAT_MAX_LENGTH) c.fail(`${path}.what`, `expected 1 to ${LEDGER_WHAT_MAX_LENGTH} characters`);
  }
  c.strMax(v.note, `${path}.note`, LEDGER_NOTE_MAX_LENGTH);
  c.oneOf(v.source, `${path}.source`, LEDGER_SOURCES);
  c.optionalTimestamp(v.createdAt, `${path}.createdAt`);
  // R16. Optional, but present means valid. A hand edited file carrying a 900 month term or a
  // 4000% rate would otherwise render a maturity figure that is arithmetically real and
  // completely absurd, which is the silently wrong output class of defect.
  if (v.termMonths !== undefined && !isUsableTerm(v.termMonths as number)) {
    c.fail(`${path}.termMonths`, `expected a whole number of months, 1 to ${MAX_TERM_MONTHS}`);
  }
  if (v.yieldBps !== undefined && !isUsableYield(v.yieldBps as number)) {
    c.fail(`${path}.yieldBps`, `expected whole basis points, 1 to ${MAX_YIELD_BPS}`);
  }
}

function validateEvent(c: Checker, v: unknown, path: string): void {
  if (!c.obj(v, path)) return;
  c.str(v.id, `${path}.id`);
  c.countInt(v.dayIndex, `${path}.dayIndex`);
  c.calendarDate(v.date, `${path}.date`);
  if (!c.oneOf(v.kind, `${path}.kind`, EVENT_KINDS)) return;
  c.money(v.cents, `${path}.cents`);
  switch (v.kind) {
    case 'Purchase':
      c.str(v.purchaseId, `${path}.purchaseId`);
      c.str(v.merchant, `${path}.merchant`);
      c.oneOf(v.category, `${path}.category`, PURCHASE_CATEGORIES);
      break;
    case 'RoundUp':
      c.str(v.purchaseId, `${path}.purchaseId`);
      c.str(v.merchant, `${path}.merchant`);
      c.money(v.purchaseCents, `${path}.purchaseCents`);
      break;
    case 'Catch':
      c.str(v.paycheckId, `${path}.paycheckId`);
      c.money(v.paycheckCents, `${path}.paycheckCents`);
      c.intBetween(v.pct, `${path}.pct`, MIN_CATCH_PCT, MAX_CATCH_PCT);
      break;
    case 'Skip':
      c.str(v.nudgeId, `${path}.nudgeId`);
      c.strMax(v.placeId, `${path}.placeId`, 200);
      c.strMax(v.displayName, `${path}.displayName`, 200);
      break;
    case 'JarMove':
      c.str(v.ledgerEntryId, `${path}.ledgerEntryId`);
      break;
    case 'JarEmptied':
      break;
    case 'Paycheck':
      c.str(v.paycheckId, `${path}.paycheckId`);
      c.oneOf(v.source, `${path}.source`, PAYCHECK_SOURCES);
      break;
  }
}

function validatePaycheck(c: Checker, v: unknown, path: string): void {
  if (!c.obj(v, path)) return;
  c.str(v.id, `${path}.id`);
  c.countInt(v.dayIndex, `${path}.dayIndex`);
  c.money(v.amountCents, `${path}.amountCents`);
  c.oneOf(v.source, `${path}.source`, PAYCHECK_SOURCES);
}

function validateLessons(c: Checker, v: unknown): void {
  if (!c.obj(v, 'lessons')) return;
  const keys = Object.keys(v);
  if (keys.length !== LESSON_IDS.length) c.fail('lessons', `expected exactly ${LESSON_IDS.length} lesson ids`);
  for (const k of keys) if (!LESSON_IDS.includes(k as LessonId)) c.fail(`lessons.${k}`, 'unknown lesson id');
  for (const id of LESSON_IDS) {
    const l = v[id];
    if (!c.obj(l, `lessons.${id}`)) continue;
    c.nullableCountInt(l.unlockedDay, `lessons.${id}.unlockedDay`);
    if (l.readAt !== null) c.optionalTimestamp(l.readAt, `lessons.${id}.readAt`);
  }
}

/**
 * Plan v2 8.9 and R12.5. The Learn map is optional in a file: a v2 export written before the
 * library existed is a valid export with no library progress in it, not a forged one, so a
 * missing map defaults to every piece unread rather than failing the import. What is present
 * is checked, and an unknown id is refused.
 *
 * `unlockedDay` is not range checked against anything, because nothing in the library is ever
 * locked; it is rebuilt as 0 below no matter what the file said.
 */
function validateLearn(c: Checker, v: unknown): void {
  if (v === undefined) return;
  if (!c.obj(v, 'learn')) return;
  for (const k of Object.keys(v)) if (!LEARN_IDS.includes(k)) c.fail(`learn.${k}`, 'unknown learn id');
  for (const id of LEARN_IDS) {
    const l = v[id];
    if (l === undefined) continue;
    if (!c.obj(l, `learn.${id}`)) continue;
    if (l.readAt !== null && l.readAt !== undefined) c.optionalTimestamp(l.readAt, `learn.${id}.readAt`);
  }
}

function validateLearnSurfaces(c: Checker, v: unknown): void {
  if (v === undefined) return;
  if (!c.obj(v, 'learnSurfaces')) return;
  for (const k of Object.keys(v)) if (!(LEARN_SURFACES as string[]).includes(k)) c.fail(`learnSurfaces.${k}`, 'unknown surface');
  for (const k of LEARN_SURFACES) {
    const e = v[k];
    if (e === undefined) continue;
    if (!c.obj(e, `learnSurfaces.${k}`)) continue;
    c.nullableCountInt(e.firedDay, `learnSurfaces.${k}.firedDay`);
    c.bool(e.dismissed, `learnSurfaces.${k}.dismissed`);
  }
}

/** Rebuilt field by field from what survived validation, defaulting anything absent. */
function cleanLearn(v: unknown): AppState['learn'] {
  const out = emptyLearn();
  if (typeof v !== 'object' || v === null) return out;
  const src = v as Record<string, { readAt?: unknown }>;
  for (const id of LEARN_IDS) {
    const readAt = src[id]?.readAt;
    // R12.5: unlockedDay is always 0. A file claiming otherwise cannot lock a piece.
    out[id] = { unlockedDay: 0, readAt: typeof readAt === 'string' ? readAt : null };
  }
  return out;
}

function cleanLearnSurfaces(v: unknown): AppState['learnSurfaces'] {
  const out = emptyLearnSurfaces();
  if (typeof v !== 'object' || v === null) return out;
  const src = v as Record<string, { firedDay?: unknown; dismissed?: unknown }>;
  for (const k of LEARN_SURFACES) {
    const e = src[k];
    out[k] = {
      firedDay: typeof e?.firedDay === 'number' ? e.firedDay : null,
      dismissed: e?.dismissed === true,
    };
  }
  return out;
}

function validateMilestones(c: Checker, v: unknown): void {
  if (!c.obj(v, 'milestones')) return;
  c.nullableCountInt(v.first100Kept, 'milestones.first100Kept');
  c.nullableCountInt(v.firstSummer, 'milestones.firstSummer');
  c.nullableCountInt(v.pathFinished, 'milestones.pathFinished');
  c.nullableCountInt(v.firstSkipDayIndex, 'milestones.firstSkipDayIndex');
  c.bool(v.confettiShown, 'milestones.confettiShown');
}

/**
 * Ordering and cross-field consistency. A file can be perfectly shaped and still be nonsense:
 * an event dated past the clock claims something that has not happened yet, and a
 * `firstSkipDayIndex` with no Skip behind it lights a lesson that never unlocked.
 */
function validateOrdering(c: Checker, input: Obj): void {
  const clock = input.clock as { dayIndex: number; startDate: string };
  const dayIndex = clock.dayIndex;

  /**
   * Test report V2-6. Six shapes the plan's own rules forbid were being accepted, and one of
   * them lost money: two ledger entries sharing an id total correctly and then BOTH vanish
   * when either is deleted, because `removeEntry` filters by id. Nothing the app itself writes
   * can produce any of these, so each needs a hand edited or corrupted file, and "clear error,
   * state untouched" (plan 11) is the documented answer to exactly that.
   *
   * Uniqueness is asserted generally rather than for the two arrays the report happened to
   * name: an id is the handle every delete, edit and lookup in the app uses, so a shared id is
   * a silent aliasing bug wherever it appears.
   */
  const uniqueIds = (arr: unknown[], path: string) => {
    const seen = new Set<string>();
    arr.forEach((el, i) => {
      const id = (el as { id: unknown }).id;
      if (typeof id !== 'string') return;
      if (seen.has(id)) c.fail(`${path}[${i}].id`, `expected a unique id (${JSON.stringify(id)} appears more than once)`);
      seen.add(id);
    });
  };

  const ordered = (arr: unknown[], path: string) => {
    let prev = -1;
    arr.forEach((el, i) => {
      const d = (el as { dayIndex: number }).dayIndex;
      if (d < prev) c.fail(`${path}[${i}].dayIndex`, `expected non-decreasing order (${d} follows ${prev})`);
      if (d > dayIndex) c.fail(`${path}[${i}].dayIndex`, `expected at most clock.dayIndex (${dayIndex})`);
      prev = Math.max(prev, d);
    });
  };

  const events = input.events as unknown[];
  ordered(events, 'events');
  ordered(input.visits as unknown[], 'visits');

  // R4.4: at most one nudge per simulated day, in stored state as well as in the loop that
  // writes it. Two on one day means only the first pending one is ever reachable.
  const nudgeDays = new Set<number>();
  (input.nudges as unknown[]).forEach((n, i) => {
    const d = (n as { dayIndex: number }).dayIndex;
    if (d > dayIndex) c.fail(`nudges[${i}].dayIndex`, `expected at most clock.dayIndex (${dayIndex})`);
    if (nudgeDays.has(d)) c.fail(`nudges[${i}].dayIndex`, `expected at most one nudge per day (day ${d} appears more than once)`);
    nudgeDays.add(d);
  });

  const places = input.places as unknown[];
  places.forEach((p, i) => {
    const pl = p as { firstSeenDay: number; lastSeenDay: number };
    if (pl.lastSeenDay < pl.firstSeenDay) c.fail(`places[${i}].lastSeenDay`, 'expected at or after firstSeenDay');
    if (pl.lastSeenDay > dayIndex) c.fail(`places[${i}].lastSeenDay`, `expected at most clock.dayIndex (${dayIndex})`);
  });

  uniqueIds(places, 'places');
  uniqueIds(input.visits as unknown[], 'visits');
  uniqueIds(input.nudges as unknown[], 'nudges');
  uniqueIds(input.ledger as unknown[], 'ledger');
  uniqueIds(events, 'events');
  uniqueIds(input.pendingPaychecks as unknown[], 'pendingPaychecks');

  /**
   * R11.3: deleting a place deletes its visits, so a visit naming a place that is not in the
   * file is state the app cannot produce. It is invisible on Places, which means it cannot be
   * deleted through the UI, and it carries a `displayName` straight back out into the next
   * export.
   */
  const placeIds = new Set(places.map((p) => (p as { id: unknown }).id).filter((id): id is string => typeof id === 'string'));
  (input.visits as unknown[]).forEach((v, i) => {
    const pid = (v as { placeId: string }).placeId;
    if (!placeIds.has(pid)) c.fail(`visits[${i}].placeId`, `expected to name a place in this file (${JSON.stringify(pid)} does not)`);
  });

  /**
   * R7.1: a ledger entry's `date` may not be later than the current simulated date. A future
   * date sorts to the top of Invest for as long as the profile exists.
   */
  const today = safeSimDate(clock.startDate, dayIndex);
  if (today !== null) {
    (input.ledger as unknown[]).forEach((e, i) => {
      const d = (e as { date: string }).date;
      if (compareDates(d, today) > 0) c.fail(`ledger[${i}].date`, `expected at or before the current simulated date (${today})`);
    });
  }

  (input.pendingPaychecks as unknown[]).forEach((p, i) => {
    const d = (p as { dayIndex: number }).dayIndex;
    if (d > dayIndex) c.fail(`pendingPaychecks[${i}].dayIndex`, `expected at most clock.dayIndex (${dayIndex})`);
  });

  // A lesson cannot have unlocked on a day that has not happened. Cosmetic on its own, and
  // the same class of forged state as the rest of this function.
  const lessons = input.lessons as Record<string, { unlockedDay: number | null }>;
  for (const id of LESSON_IDS) {
    const day = lessons[id]?.unlockedDay;
    if (typeof day === 'number' && day > dayIndex) {
      c.fail(`lessons.${id}.unlockedDay`, `expected at most clock.dayIndex (${dayIndex})`);
    }
  }

  const firstSkip = (input.milestones as { firstSkipDayIndex: number | null }).firstSkipDayIndex;
  if (firstSkip !== null) {
    const matched = events.some((e) => {
      const ev = e as { kind: string; dayIndex: number };
      return ev.kind === 'Skip' && ev.dayIndex === firstSkip;
    });
    if (!matched) c.fail('milestones.firstSkipDayIndex', 'expected to match the dayIndex of a Skip event');
  }
}

const REQUIRED_KEYS = [
  'schemaVersion',
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
] as const;

/** R11.1: rebuilt field by field, so nothing extra in the file survives the import. */
function cleanPlace(p: Place): Place {
  return {
    id: p.id,
    displayName: p.displayName,
    firstSeenDay: p.firstSeenDay,
    lastSeenDay: p.lastSeenDay,
    coarseLabel: p.coarseLabel ?? null,
  };
}

function cleanVisit(v: PlaceVisit): PlaceVisit {
  return {
    id: v.id,
    placeId: v.placeId,
    displayName: v.displayName,
    dayIndex: v.dayIndex,
    date: v.date,
    minuteOfDay: v.minuteOfDay,
    amountCents: v.amountCents ?? null,
  };
}

/**
 * Full shape and range check. Anything that would let bad data reach the store or the UI is
 * rejected, so a malformed file always leaves state untouched.
 */
export function validateImportedState(input: unknown): ValidationResult {
  const c = new Checker();
  if (!c.obj(input, 'root')) return { ok: false, problems: c.problems };
  if (input.schemaVersion === V1_SCHEMA_VERSION) return { ok: false, problems: [V1_REFUSAL] };
  if (input.schemaVersion !== SCHEMA_VERSION) return { ok: false, problems: [`schemaVersion: expected ${SCHEMA_VERSION}`] };
  const missing = REQUIRED_KEYS.filter((k) => !(k in input));
  if (missing.length > 0) return { ok: false, problems: missing.map((k) => `${k}: missing`) };

  const profile = input.profile;
  const onboarded = c.obj(profile, 'profile') && profile.onboardingComplete === true;
  validateProfile(c, profile);
  validateSettings(c, input.settings);
  validateClock(c, input.clock, onboarded);
  c.money(input.jarCents, 'jarCents');
  if (c.arr(input.places, 'places')) input.places.forEach((p, i) => validatePlace(c, p, `places[${i}]`));
  if (c.arr(input.visits, 'visits')) input.visits.forEach((v, i) => validateVisit(c, v, `visits[${i}]`));
  // `habits` is derived (plan 5.2). It is checked only for being an array and is then thrown
  // away and recomputed, which removes a whole class of forged state.
  c.arr(input.habits, 'habits');
  if (c.arr(input.nudges, 'nudges')) input.nudges.forEach((n, i) => validateNudge(c, n, `nudges[${i}]`));
  if (c.arr(input.ledger, 'ledger')) input.ledger.forEach((e, i) => validateLedgerEntry(c, e, `ledger[${i}]`));
  if (c.arr(input.events, 'events')) input.events.forEach((e, i) => validateEvent(c, e, `events[${i}]`));
  if (c.arr(input.pendingPaychecks, 'pendingPaychecks')) input.pendingPaychecks.forEach((p, i) => validatePaycheck(c, p, `pendingPaychecks[${i}]`));
  validateLessons(c, input.lessons);
  validateLearn(c, input.learn);
  validateLearnSurfaces(c, input.learnSurfaces);
  validateMilestones(c, input.milestones);
  if (c.obj(input.flags, 'flags')) {
    c.bool(input.flags.nudgeExplainerSeen, 'flags.nudgeExplainerSeen');
    c.bool(input.flags.privacyExplainerSeen, 'flags.privacyExplainerSeen');
    c.bool(input.flags.investCapturePromptSeen, 'flags.investCapturePromptSeen');
    // The two panel flags arrived with the push backend (plan 5.5) and are optional for the
    // same reason `learn` is: an older v2 file is not a forged one.
    if (input.flags.serverPrivacySeen !== undefined) c.bool(input.flags.serverPrivacySeen, 'flags.serverPrivacySeen');
    if (input.flags.installExplainerSeen !== undefined) c.bool(input.flags.installExplainerSeen, 'flags.installExplainerSeen');
  }
  if (c.obj(input.demo, 'demo')) c.oneOf(input.demo.summerOverride, 'demo.summerOverride', ['on', 'off', null]);

  // Cross-field and ordering rules run only once every element is known to be well shaped.
  if (c.problems.length === 0) validateOrdering(c, input);

  if (c.problems.length > 0) return { ok: false, problems: c.problems };

  const src = input as unknown as AppState;
  const places = src.places.map(cleanPlace);
  const visits = src.visits.map(cleanVisit);
  const state: AppState = {
    schemaVersion: SCHEMA_VERSION,
    profile: src.profile,
    settings: src.settings,
    clock: src.clock,
    jarCents: src.jarCents,
    places,
    visits,
    // R3.5: recomputed from the visits, never trusted from the file.
    habits: recomputeHabits(places, visits, src.clock.dayIndex),
    nudges: src.nudges,
    ledger: src.ledger,
    events: src.events,
    pendingPaychecks: src.pendingPaychecks,
    lessons: src.lessons,
    learn: cleanLearn((input as Record<string, unknown>).learn),
    learnSurfaces: cleanLearnSurfaces((input as Record<string, unknown>).learnSurfaces),
    milestones: src.milestones,
    flags: {
      nudgeExplainerSeen: src.flags.nudgeExplainerSeen === true,
      privacyExplainerSeen: src.flags.privacyExplainerSeen === true,
      serverPrivacySeen: src.flags.serverPrivacySeen === true,
      installExplainerSeen: src.flags.installExplainerSeen === true,
      investCapturePromptSeen: src.flags.investCapturePromptSeen === true,
    },
    // Plan v2 5.5: `push` is device state and an import never restores it. Whatever the file
    // claimed is dropped and `supportState` is recomputed from the browser on the next render.
    // Without this, a forged file could point a browser at someone else's endpoint hash in the
    // Nudges card.
    push: initialPushState(),
    demo: src.demo,
  };
  return { ok: true, state };
}
