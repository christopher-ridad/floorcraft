const MINUTES_PER_DAY = 24 * 60;
const CLOCK_TIME = /(\d{1,2}):(\d{2})\s*([AP])\.?M/i;

/** Parses a 12-hour time such as `9:39 AM` or `1:05 p.m.` into minutes after midnight. */
export function parseClockTime(text: string): number | null {
  const match = CLOCK_TIME.exec(text);
  if (!match) return null;
  const [, hours = '', minutes = '', meridiem = ''] = match;
  const hour24 = (Number(hours) % 12) + (meridiem.toUpperCase() === 'P' ? 12 : 0);
  return hour24 * 60 + Number(minutes);
}

/** Formats minutes after midnight as `9:39 AM`, wrapping past midnight. Empty for no time. */
export function formatClockTime(minutes: number | null): string {
  if (minutes === null || Number.isNaN(minutes)) return '';
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour24 = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  return `${hour24 % 12 || 12}:${String(minute).padStart(2, '0')} ${hour24 < 12 ? 'AM' : 'PM'}`;
}

/** Local time of day in minutes, including seconds as a fraction. */
export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

/** Epoch ms of local midnight on the day of `timestamp`. */
export function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
