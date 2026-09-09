import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayOfMonth,
  daysBetween,
  formatDateLong,
  isSummerMonth,
  isValidDate,
  isWeekday,
  simDate,
  todayLocal,
  weekday,
} from '../../src/domain/dates';

describe('dates', () => {
  it('sim dates cross month ends and Feb 29 in UTC', () => {
    expect(simDate('2026-06-15', 0)).toBe('2026-06-15');
    expect(simDate('2026-06-15', 16)).toBe('2026-07-01');
    expect(simDate('2026-01-30', 2)).toBe('2026-02-01');
    expect(simDate('2028-02-28', 1)).toBe('2028-02-29');
    expect(simDate('2028-02-28', 2)).toBe('2028-03-01');
    expect(simDate('2027-02-28', 1)).toBe('2027-03-01');
    expect(simDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09'); // US DST change day, unaffected
  });
  it('weekday detection', () => {
    expect(weekday('2026-06-15')).toBe(1); // Monday
    expect(isWeekday('2026-06-15')).toBe(true);
    expect(isWeekday('2026-06-20')).toBe(false); // Saturday
    expect(isWeekday('2026-06-21')).toBe(false); // Sunday
  });
  it('day of month 1 detection', () => {
    expect(dayOfMonth('2026-07-01')).toBe(1);
    expect(dayOfMonth('2026-07-31')).toBe(31);
  });
  it('daysBetween across a DST change', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-11-01', '2026-11-02')).toBe(1);
    expect(daysBetween('2026-06-15', '2026-06-13')).toBe(-2);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
  });
  it('todayLocal uses local getters', () => {
    const d = new Date(2026, 8, 6, 23, 30); // Sept 6 local, late evening
    expect(todayLocal(d)).toBe('2026-09-06');
  });
  it('formatting and validation', () => {
    expect(formatDateLong('2026-06-15')).toBe('Jun 15, 2026');
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(isValidDate('nope')).toBe(false);
    expect(isSummerMonth('2026-06-01')).toBe(true);
    expect(isSummerMonth('2026-08-31')).toBe(true);
    expect(isSummerMonth('2026-09-01')).toBe(false);
  });
});
