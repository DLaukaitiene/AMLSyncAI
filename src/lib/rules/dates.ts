/**
 * Date and deadline arithmetic (spec §4.5, §11.0).
 *
 * All dates are ISO calendar dates ("YYYY-MM-DD") handled in UTC so that a
 * deadline never shifts because of the server's time zone. Working days come
 * from the firm's Country Profile (default Monday–Friday, no holidays).
 */

export type IsoDate = string; // YYYY-MM-DD

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDate(d: IsoDate): Date {
  if (!ISO_RE.test(d)) throw new Error(`Invalid ISO date: ${d}`);
  const date = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || toIsoDate(date) !== d) {
    throw new Error(`Invalid ISO date: ${d}`);
  }
  return date;
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(d: IsoDate, days: number): IsoDate {
  const date = parseIsoDate(d);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

/** Adds months, clamping to the last day of the target month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(d: IsoDate, months: number): IsoDate {
  const date = parseIsoDate(d);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return toIsoDate(date);
}

export function addYears(d: IsoDate, years: number): IsoDate {
  return addMonths(d, years * 12);
}

export function diffCalendarDays(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / 86_400_000);
}

export interface WorkingCalendar {
  /** ISO weekday numbers that are working days: 1 = Monday … 7 = Sunday. */
  workingWeekdays: readonly number[];
  /** Public holidays (ISO dates). */
  holidays: readonly IsoDate[];
}

export const DEFAULT_CALENDAR: WorkingCalendar = {
  workingWeekdays: [1, 2, 3, 4, 5],
  holidays: [],
};

export function isWorkingDay(d: IsoDate, cal: WorkingCalendar = DEFAULT_CALENDAR): boolean {
  const jsDay = parseIsoDate(d).getUTCDay(); // 0 = Sunday
  const isoDay = jsDay === 0 ? 7 : jsDay;
  return cal.workingWeekdays.includes(isoDay) && !cal.holidays.includes(d);
}

/**
 * The date on which `n` working days have elapsed after `start`.
 * The start day itself is not counted (a request received on Monday with a
 * 5-working-day deadline is due the following Monday).
 */
export function addWorkingDays(start: IsoDate, n: number, cal: WorkingCalendar = DEFAULT_CALENDAR): IsoDate {
  if (n < 0) throw new Error("n must be >= 0");
  if (cal.workingWeekdays.length === 0) throw new Error("Calendar has no working weekdays");
  let d = start;
  let remaining = n;
  while (remaining > 0) {
    d = addCalendarDays(d, 1);
    if (isWorkingDay(d, cal)) remaining--;
  }
  return d;
}
