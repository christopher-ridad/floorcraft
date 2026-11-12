import { randomId, type EventDetails, type IdFactory, type Schedule } from '../types';
import { identifyEvents, type ScheduleLine } from './identifyEvents';

const HEAT_LINE = /^(\d{1,2}:\d{2}\s*[AP]M)\s+\[(\d+)\]\s+(.+)$/i;
const TIMED_LINE = /^(\d{1,2}:\d{2}\s*[AP]M)\s+(.+)$/i;

const normalizeTime = (time: string) => time.toUpperCase().replace(/\s+/g, ' ');

export interface ParseScheduleOptions {
  /** The events of the schedule being replaced, so matching events keep their ids. */
  previousEvents?: readonly EventDetails[];
  createId?: IdFactory;
}

/**
 * Reads a schedule written one item per line, in the posted format:
 * `9:20 AM [4] Newcomer Amer. Waltz 1st Round` is a heat, `10:42 AM Smooth Awards` is a break.
 * Lines without a time are ignored.
 */
export function parseSchedule(
  text: string,
  { previousEvents = [], createId = randomId }: ParseScheduleOptions = {},
): Schedule {
  return identifyEvents(parseScheduleLines(text, createId), previousEvents, createId);
}

function parseScheduleLines(text: string, createId: IdFactory): ScheduleLine[] {
  const items: ScheduleLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
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
  return items;
}
