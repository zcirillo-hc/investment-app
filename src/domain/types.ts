// Plan v2 section 5.2. The v2 AppState shape.
import type { Cents, LocationSource, Paycheck, PlaceVisit, PurchaseCategory, TransactionSource } from './interfaces';
import { LEARN_IDS, LEARN_SURFACES, type LearnSurface } from '../content/learn';
import { DEFAULT_AGE, DEFAULT_CATCH_PCT, DEFAULT_JAR_GOAL_CENTS, QUIET_END_MINUTE, QUIET_START_MINUTE, SCHEMA_VERSION } from '../config';

export type { Cents, LocationSource, Paycheck, PlaceVisit, Purchase, PurchaseCategory, TransactionSource } from './interfaces';

export type LessonId = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'L8';
export const LESSON_IDS: LessonId[] = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8'];

export type FearOption = 'rent' | 'pointless' | 'confused' | 'losing';
export type Theme = 'system' | 'light' | 'dark';
export type SummerOverride = 'on' | 'off' | null;

/** R2.2. `coarseLabel` is display only and is null on web, which has no location source. */
export interface Place {
  id: string;
  displayName: string;
  firstSeenDay: number;
  lastSeenDay: number;
  coarseLabel: string | null;
}

/** R3. Derived from `visits` on every tick and never trusted from an import. */
export interface Habit {
  placeId: string;
  isHabit: boolean;
  visitCount: number;
  usualMinute: number | null;
  spreadMinutes: number | null;
  estimateCents: Cents | null;
}

export type NudgeStatus = 'pending' | 'skipped' | 'expired';

/** R4. */
export interface Nudge {
  id: string;
  placeId: string;
  displayName: string;
  dayIndex: number;
  nudgeMinute: number;
  estimateCents: Cents;
  status: NudgeStatus;
}

export type LedgerSource = 'jar' | 'manual';

/** R7.1. */
export interface LedgerEntry {
  id: string;
  date: string; // YYYY-MM-DD
  amountCents: Cents;
  what: string;
  note: string;
  source: LedgerSource;
  createdAt: string; // ISO
  // R16. Only a bond or CD row carries these, and only when the user filled them in. Absent on
  // every other holding type and on every entry written before R16 existed, which is why they
  // are optional rather than defaulted: a zero here would render as a real 0.00% rate.
  termMonths?: number;
  yieldBps?: number;
}

interface EventBase {
  id: string;
  dayIndex: number;
  date: string;
}
export interface PurchaseEvent extends EventBase {
  kind: 'Purchase';
  purchaseId: string;
  merchant: string;
  category: PurchaseCategory;
  cents: Cents;
}
/**
 * LEGACY ONLY. Round-ups were removed when skipping became the single way to fill the jar.
 * Nothing creates one any more. The shape stays so a profile saved before the removal still
 * loads, still shows its old history, and still counts toward totals, rather than a user's
 * numbers dropping overnight because we changed our minds about a feature.
 */
export interface RoundUpEvent extends EventBase {
  kind: 'RoundUp';
  purchaseId: string;
  merchant: string;
  purchaseCents: Cents;
  cents: Cents;
}
export interface CatchEvent extends EventBase {
  kind: 'Catch';
  paycheckId: string;
  paycheckCents: Cents;
  pct: number;
  cents: Cents;
}
/** R5.5. Carries the place display name so a deleted place never erases the user's record (R11.3). */
export interface SkipEvent extends EventBase {
  kind: 'Skip';
  nudgeId: string;
  placeId: string;
  displayName: string;
  cents: Cents;
}
/** R6.4. */
export interface JarMoveEvent extends EventBase {
  kind: 'JarMove';
  ledgerEntryId: string;
  cents: Cents;
}
/** R6.5. */
export interface JarEmptiedEvent extends EventBase {
  kind: 'JarEmptied';
  cents: Cents;
}
export interface PaycheckEvent extends EventBase {
  kind: 'Paycheck';
  paycheckId: string;
  cents: Cents;
  source: Paycheck['source'];
}
export type LedgerEvent =
  | PurchaseEvent
  | RoundUpEvent
  | CatchEvent
  | SkipEvent
  | JarMoveEvent
  | JarEmptiedEvent
  | PaycheckEvent;
export type LedgerKind = LedgerEvent['kind'];

/** R9.1 to R9.3: the three kinds that count as money kept. */
export type KeptKind = 'RoundUp' | 'Catch' | 'Skip';
export const KEPT_KINDS: KeptKind[] = ['RoundUp', 'Catch', 'Skip'];

export interface LessonState {
  unlockedDay: number | null;
  readAt: string | null;
}

export type { LearnSurface };

/**
 * Plan v2 R12.5. A surfacing moment highlights a Learn piece that was already readable and
 * stays readable. `firedDay` is when the moment happened, `dismissed` is the user closing the
 * card. Neither field can gate anything, which is the point of storing them apart from
 * `learn` itself.
 */
export interface LearnSurfaceState {
  firedDay: number | null;
  dismissed: boolean;
}

/**
 * Plan v2 5.5. Device state, not user data: an import never restores it, and the validator
 * recomputes `supportState` from the browser rather than trusting a file (see validate.ts).
 */
export type PushSupportState = 'ready' | 'needs-ios-install' | 'denied' | 'unsupported' | 'unknown';
export type PushErrorKind = 'network' | 'server' | 'permission' | null;

export interface PushState {
  supportState: PushSupportState;
  subscribed: boolean;
  /** For display and for the delete flow only. Never a key the app invented (plan 6.10). */
  endpointHash: string | null;
  /** IANA name, R14.3. Never an offset. */
  tz: string | null;
  /** R14.2 dedupe: the last schedule the client successfully published. */
  lastScheduleSent: { date: string; minute: number | null } | null;
  lastError: PushErrorKind;
}


export interface AppState {
  schemaVersion: typeof SCHEMA_VERSION;
  profile: {
    name: string;
    email: string;
    seed: number;
    createdAt: string;
    onboardingComplete: boolean;
    summerEarnedCents: Cents | null;
    summerLeftCents: Cents | null;
    age: number;
    fear: FearOption | null;
  };
  settings: {
    catchPct: number;
    jarGoalCents: Cents;
    theme: Theme;
    nudgesEnabled: boolean;
    quietStartMinute: number;
    quietEndMinute: number;
    mutedPlaceIds: string[];
  };
  clock: {
    startDate: string;
    dayIndex: number;
    lastOpenedRealDate: string;
  };
  jarCents: Cents;
  places: Place[];
  visits: PlaceVisit[];
  habits: Habit[];
  nudges: Nudge[];
  ledger: LedgerEntry[];
  events: LedgerEvent[];
  pendingPaychecks: Paycheck[];
  lessons: Record<LessonId, LessonState>;
  /**
   * Plan v2 8.9 and R12.5: the Learn library's read state, in the same shape as `lessons` and
   * keyed separately. Every piece starts unlocked on day 0, on a freshly cleared profile,
   * because nothing in the library is ever locked.
   */
  learn: Record<string, LessonState>;
  learnSurfaces: Record<LearnSurface, LearnSurfaceState>;
  milestones: {
    first100Kept: number | null;
    firstSummer: number | null;
    pathFinished: number | null;
    firstSkipDayIndex: number | null;
    confettiShown: boolean;
  };
  flags: {
    nudgeExplainerSeen: boolean;
    privacyExplainerSeen: boolean;
    /** Plan 9.4a: shown and accepted before any permission prompt is attempted. */
    serverPrivacySeen: boolean;
    installExplainerSeen: boolean;
    investCapturePromptSeen: boolean;
  };
  push: PushState;
  demo: { summerOverride: SummerOverride };
}

export interface Deps {
  transactions: TransactionSource;
  location: LocationSource;
}

export function emptyLessons(): Record<LessonId, LessonState> {
  const out = {} as Record<LessonId, LessonState>;
  for (const id of LESSON_IDS) out[id] = { unlockedDay: null, readAt: null };
  return out;
}

/**
 * Plan v2 R12.5: every Learn piece is readable from day 0 on a freshly cleared profile, so
 * `unlockedDay` is 0 here and is never written again. It exists only so the two maps share a
 * shape; nothing reads it to decide whether a piece can be opened.
 */
export function emptyLearn(): Record<string, LessonState> {
  const out: Record<string, LessonState> = {};
  for (const id of LEARN_IDS) out[id] = { unlockedDay: 0, readAt: null };
  return out;
}

export function emptyLearnSurfaces(): Record<LearnSurface, LearnSurfaceState> {
  const out = {} as Record<LearnSurface, LearnSurfaceState>;
  for (const k of LEARN_SURFACES) out[k] = { firedDay: null, dismissed: false };
  return out;
}

/** Plan v2 5.5. Device state; `supportState` is recomputed from the browser on every boot. */
export function initialPushState(): PushState {
  return {
    supportState: 'unknown',
    subscribed: false,
    endpointHash: null,
    tz: null,
    lastScheduleSent: null,
    lastError: null,
  };
}

export function initialAppState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: {
      name: '',
      email: '',
      seed: 0,
      createdAt: '',
      onboardingComplete: false,
      summerEarnedCents: null,
      summerLeftCents: null,
      age: DEFAULT_AGE,
      fear: null,
    },
    settings: {
      catchPct: DEFAULT_CATCH_PCT,
      jarGoalCents: DEFAULT_JAR_GOAL_CENTS,
      theme: 'system',
      // R4.5: nudges are off until the user turns them on.
      nudgesEnabled: false,
      quietStartMinute: QUIET_START_MINUTE,
      quietEndMinute: QUIET_END_MINUTE,
      mutedPlaceIds: [],
    },
    clock: { startDate: '', dayIndex: 0, lastOpenedRealDate: '' },
    jarCents: 0,
    places: [],
    visits: [],
    habits: [],
    nudges: [],
    ledger: [],
    events: [],
    pendingPaychecks: [],
    lessons: emptyLessons(),
    learn: emptyLearn(),
    learnSurfaces: emptyLearnSurfaces(),
    milestones: { first100Kept: null, firstSummer: null, pathFinished: null, firstSkipDayIndex: null, confettiShown: false },
    flags: {
      nudgeExplainerSeen: false,
      privacyExplainerSeen: false,
      serverPrivacySeen: false,
      installExplainerSeen: false,
      investCapturePromptSeen: false,
    },
    push: initialPushState(),
    demo: { summerOverride: null },
  };
}
