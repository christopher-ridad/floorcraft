import { parseClockTime } from '../clock';
import { randomId, type IdFactory, type ScheduleItem } from '../types';

/** Splits a line before each time, so several heats pasted onto one line come apart. */
const BEFORE_EACH_TIME = /(?=\b\d{1,2}:\d{2}\s*[AP]\.?M\b)/i;
/** The competition's page footer, e.g. `14th Annual Purdue Ballroom Classic`. */
const PAGE_FOOTER = /\s+\d+(st|nd|rd|th)\s+Annual.*$/i;
const HEAT_LINE = /^(\d{1,2}:\d{2}\s*[AP]\.?M\.?)\s+\[(\d+)\]\s+(.+)$/i;
const TIMED_LINE = /^(\d{1,2}:\d{2}\s*[AP]\.?M\.?)\s+(.+)$/i;
const NEXT_DAY = /sunday/i;

const normalizeTime = (time: string) => time.toUpperCase().replace(/\s+/g, ' ');

/**
 * Parses a pasted heat list, one item per line:
 * `9:39 AM [4] Newcomer Amer. Waltz 1st Round` is a heat, `12:00 PM Lunch` is a break.
 * Lines without a time are ignored.
 */
export function parseSchedule(text: string, createId: IdFactory = randomId): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  const lines = text.split(/\r?\n/).flatMap((line) => line.split(BEFORE_EACH_TIME));

  for (const rawLine of lines) {
    const line = rawLine.trim().replace(PAGE_FOOTER, '').trim();
    if (!line) continue;

    const heat = HEAT_LINE.exec(line);
    if (heat) {
      const [, time = '', eventNumber = '', name = ''] = heat;
      items.push({
        kind: 'heat',
        id: createId(),
        scheduledTime: normalizeTime(time),
        eventNumber: Number(eventNumber),
        name: name.trim(),
      });
      continue;
    }

    const timed = TIMED_LINE.exec(line);
    if (timed) {
      const [, time = '', label = ''] = timed;
      items.push({
        kind: 'break',
        id: createId(),
        scheduledTime: normalizeTime(time),
        label: label.trim(),
      });
    }
  }
  return restoreTimeOrder(items);
}

/**
 * Text copied from a two-column PDF comes out interleaved. If times ever go backwards, sort by
 * time. Next-day section lines stay at the end.
 */
function restoreTimeOrder(items: ScheduleItem[]): ScheduleItem[] {
  const isNextDay = (item: ScheduleItem) => item.kind === 'break' && NEXT_DAY.test(item.label);
  const sameDay = items.filter((item) => !isNextDay(item));
  const nextDay = items.filter(isNextDay);
  const minutes = (item: ScheduleItem) => parseClockTime(item.scheduledTime) ?? 0;

  const isOutOfOrder = sameDay.some(
    (item, i) => i > 0 && minutes(item) < minutes(sameDay[i - 1] as ScheduleItem),
  );
  if (isOutOfOrder) sameDay.sort((a, b) => minutes(a) - minutes(b));
  return sameDay.concat(nextDay);
}
