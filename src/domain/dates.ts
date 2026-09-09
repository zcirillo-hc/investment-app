// All simulated-date math is done in UTC (plan 4.14). Local time is used only
// for todayLocal() and lastOpenedRealDate.

const MS_PER_DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function parseDate(s: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Bad date: ${s}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function isValidDate(s: string): boolean {
  if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(s)) return false;
  const [y, m, d] = parseDate(s);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toISO(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function utcMs(date: string): number {
  const [y, m, d] = parseDate(date);
  return Date.UTC(y, m - 1, d);
}

export function fromUtcMs(ms: number): string {
  const dt = new Date(ms);
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = parseDate(date);
  return fromUtcMs(Date.UTC(y, m - 1, d + n));
}

export function simDate(startDate: string, dayIndex: number): string {
  return addDays(startDate, dayIndex);
}

/**
 * `simDate` for render paths (D10). A state hand-edited in storage, or written by a build
 * that predates the import validator, can carry an unparseable `clock.startDate`; a screen
 * must degrade to showing no date rather than throwing and unmounting the whole app.
 */
export function safeSimDate(startDate: string, dayIndex: number): string | null {
  if (!isValidDate(startDate) || !Number.isInteger(dayIndex)) return null;
  try {
    return simDate(startDate, dayIndex);
  } catch {
    return null;
  }
}

/** `formatDateLong` that yields an empty string instead of throwing on a bad date (D10). */
export function formatDateLongSafe(date: string | null): string {
  if (!date || !isValidDate(date)) return '';
  return formatDateLong(date);
}

/** `formatDateShort` that yields the raw string instead of throwing on a bad date (D10). */
export function formatDateShortSafe(date: string | null): string {
  if (!date) return '';
  if (!isValidDate(date)) return date;
  return formatDateShort(date);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(date: string): number {
  return new Date(utcMs(date)).getUTCDay();
}

export function isWeekday(date: string): boolean {
  const w = weekday(date);
  return w >= 1 && w <= 5;
}

export function dayOfMonth(date: string): number {
  return parseDate(date)[2];
}

export function monthOf(date: string): number {
  return parseDate(date)[1];
}

export function yearOf(date: string): number {
  return parseDate(date)[0];
}

/** Whole days from a to b (b - a). Both YYYY-MM-DD. DST-safe because it uses UTC. */
export function daysBetween(a: string, b: string): number {
  return Math.round((utcMs(b) - utcMs(a)) / MS_PER_DAY);
}

/** Local calendar date of `now` as YYYY-MM-DD. */
export function todayLocal(now: Date = new Date()): string {
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function formatDateLong(date: string): string {
  const [y, m, d] = parseDate(date);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function formatDateShort(date: string): string {
  const [, m, d] = parseDate(date);
  return `${MONTHS[m - 1]} ${d}`;
}

export function isSummerMonth(date: string): boolean {
  const m = monthOf(date);
  return m >= 6 && m <= 8;
}

export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Plan v2 R2.4 and R4.2: minute of day helpers. A minute of day is an integer 0 to 1439.

export function clampMinuteOfDay(minute: number): number {
  if (!Number.isFinite(minute)) return 0;
  return Math.min(1439, Math.max(0, Math.round(minute)));
}

export function minuteOfDayFromHM(hour: number, minute: number): number {
  return clampMinuteOfDay(hour * 60 + minute);
}

/** "8:15 am". Used everywhere a usual time or a nudge time is shown. */
export function formatMinuteOfDay(minute: number): string {
  const m = clampMinuteOfDay(minute);
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h24 < 12 ? 'am' : 'pm';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
}
