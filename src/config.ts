// Plan v2 section 4. Every tunable constant a rule names lives here, so a threshold the
// architect called "a first guess, not a tuned result" (section 12.5) can be changed in one
// place. Section 7 keeps one implementation and one fixture, so there is nothing to match.

export const APP_VERSION = '0.2.0';
export const STORAGE_KEY = 'spare-change-state-v2';
export const SCHEMA_VERSION = 2 as const;

/** The v1 key and version, kept only so an old envelope can be recognised and refused (plan 1.4, A7). */
export const V1_STORAGE_KEY = 'spare-change-state';
export const V1_SCHEMA_VERSION = 1;

// Catch (R6.1, unchanged from v1).
export const DEFAULT_CATCH_PCT = 5;
export const MIN_CATCH_PCT = 1;
export const MAX_CATCH_PCT = 20;
export const PAYCHECK_FIRST_DAY = 3;
export const PAYCHECK_INTERVAL_DAYS = 14;
export const PAYCHECK_MIN_CENTS = 5000;
export const PAYCHECK_MAX_CENTS = 500000;
export const PAYCHECK_DIVISOR = 6;

// The jar (R6.3). A display-only target: nothing moves when it is reached.
export const JAR_GOAL_PRESETS: number[] = [1000, 2500, 5000, 10000];
export const DEFAULT_JAR_GOAL_CENTS = 2500;

// Time of day (R2.4, R4.2, R4.3).
export const MINUTES_PER_DAY = 1440;
export const MAX_MINUTE_OF_DAY = MINUTES_PER_DAY - 1;
export const NUDGE_LEAD_MINUTES = 20;
export const QUIET_START_MINUTE = 360; // 06:00
export const QUIET_END_MINUTE = 1260; // 21:00

// Places, visits and habits (R2.5, R3.1 to R3.4).
export const VISIT_RETENTION_DAYS = 90;
export const HABIT_WINDOW_DAYS = 14;
export const HABIT_MIN_VISITS = 3;
export const HABIT_MAX_SPREAD_MINUTES = 45;

// The estimate (R5.1).
export const ESTIMATE_WINDOW_DAYS = 60;
export const ESTIMATE_MAX_VISITS = 5;

// The manual investment ledger (R7.1).
export const LEDGER_MAX_AMOUNT_CENTS = 100_000_000;
export const LEDGER_WHAT_MAX_LENGTH = 60;
export const LEDGER_NOTE_MAX_LENGTH = 200;

// Summer (R10).
export const DEFAULT_SUMMER_EARNED_CENTS = 300000;
export const DEFAULT_AGE = 19;
export const MIN_AGE = 18;
export const MAX_AGE = 24;
export const ASSUMED_ANNUAL_RETURN = 0.07;
export const SUMMER_KEEP_RATE = 0.1;
export const CURVE_START_AGE = 19;
export const CURVE_LATE_START_AGE = 30;
export const CURVE_END_AGE = 65;

// Clock.
export const AUTO_ADVANCE_CAP_DAYS = 30;

// Import bounds (plan 5.4, carried over). Plausibility ceilings, not business rules.
export const MAX_MONEY_CENTS = 1e13;
export const MAX_NAME_LENGTH = 40;

// The tree (R8.1). Index = stage; stage 0 is a seed, before the first kept event of any kind.
export const TREE_STAGE_MIN_DAYS = [0, 0, 7, 21, 45, 90, 180];

// Lessons (R12).
export const FEAR_LESSON_DAY_10 = 10;
export const FEAR_LESSON_DAY_20 = 20;
export const FIRST_MONTH_DAY = 30;
export const FIRST_100_KEPT_CENTS = 10000;
