import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

interface ScheduleItem {
  id: string;
  t: string;
  ev?: number;
  name?: string;
  label?: string;
}
interface LegacyParser {
  parseSchedule(text: string): ScheduleItem[];
  parseEntries(text: string): { lead: string; follow: string; events: string[] }[];
  eventsFromSchedule(heats: ScheduleItem[]): Map<number, unknown>;
  matchEntry(entry: string, events: Map<number, unknown>): number | null;
}

const parser = createRequire(import.meta.url)('../../src/parse.js') as LegacyParser;
const readData = (file: string) =>
  readFileSync(new URL(`../../data/${file}`, import.meta.url), 'utf8');

const schedule = readData('schedule-2025-tentative.txt');
const partnerships = readData('partnerships-2026.txt');
const events = parser.eventsFromSchedule(parser.parseSchedule(schedule));

describe('legacy parser', () => {
  it('parses every heat and break from the schedule', () => {
    const items = parser.parseSchedule(schedule);
    expect(items.filter((item) => item.ev != null)).toHaveLength(139);
    expect(items.some((item) => item.label === 'Smooth Awards')).toBe(true);
  });

  it('restores time order for text pasted from a two-column PDF', () => {
    const lines = schedule.trim().split('\n');
    const half = Math.ceil(lines.length / 2);
    const interleaved = lines.slice(0, half).map((line, i) => `${line} ${lines[half + i] ?? ''}`);
    const heatKeys = (text: string) =>
      parser
        .parseSchedule(text)
        .filter((item) => item.ev != null)
        .map((item) => `${item.t}${item.ev}`);

    expect(heatKeys(interleaved.join('\n'))).toEqual(heatKeys(lines.join('\n')));
  });

  it('matches every partnership entry to a scheduled event', () => {
    const couples = parser.parseEntries(partnerships);
    expect(couples).toHaveLength(20);

    const misses = couples.flatMap((couple) =>
      couple.events
        .filter((entry) => parser.matchEntry(entry, events) == null)
        .map((entry) => `${couple.lead}/${couple.follow}: ${entry}`),
    );
    expect(misses).toEqual([]);
  });

  it('handles shorthand: dance order, missing style, V. Waltz', () => {
    expect(parser.matchEntry('Silver I. Standard (TF)', events)).toBe(16); // schedule lists (FT)
    expect(parser.matchEntry('Newcomer Swing', events)).toBe(29);
    expect(parser.matchEntry('Silver I. V. Waltz', events)).toBe(20);
    expect(parser.matchEntry('Gold I. Latin (SCRJ)', events)).toBe(37);
  });
});
