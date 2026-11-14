import { describe, expect, it } from 'vitest';
import { isInCouple } from '../../src/domain/dancers';
import { itemAtTime, loadPurdueData, purdueCompetition } from '../../src/domain/purdue';
import type { ScheduleItem } from '../../src/domain/types';

/** A time on competition day (Saturday, November 14, 2026), local time. */
const onTheDay = (hours: number, minutes: number) =>
  new Date(2026, 10, 14, hours, minutes).getTime();

const describeItem = (item: ScheduleItem | null) =>
  item && (item.kind === 'heat' ? `${item.scheduledTime} [${item.eventNumber}]` : item.label);

describe('the built-in team', () => {
  it('has every partnership, each with its events on the schedule', () => {
    const { couples, entries, schedule } = loadPurdueData();
    expect(couples).toHaveLength(20);
    const eventIds = new Set(schedule.events.map((event) => event.eventId));
    for (const couple of couples) {
      expect(entries[couple.id]?.length, `${couple.lead} & ${couple.follow}`).toBeGreaterThan(0);
      expect(entries[couple.id]?.every((eventId) => eventIds.has(eventId))).toBe(true);
    }
  });

  it('numbers each couple by its lead', () => {
    const numberOf = (lead: string, follow: string) =>
      loadPurdueData().couples.find((c) => c.lead === lead && c.follow === follow)?.number;
    expect(numberOf('Chris', 'Brooke')).toBe('441');
    expect(numberOf('Zach', 'Erica')).toBe('390');
    expect(numberOf('Jenya', 'Alice')).toBe('329');
    expect(numberOf('Alice', 'Jiayi')).toBe('445');
    expect(numberOf('Yumna', 'Erica')).toBe('369');
    expect(numberOf('Liam (TBA)', 'Abby')).toBe('418');
    expect(numberOf('Sylvia', 'Aleksandra')).toBeUndefined();
  });

  it('gives each dancer their heats', () => {
    const competition = purdueCompetition(onTheDay(7, 0));
    expect(competition.dancers.get('Chris')).toMatchObject({ confirmedHeats: 13 });
    const chrisHeats = competition.schedule.filter(
      (item) =>
        item.kind === 'heat' &&
        competition.heatTeams.get(item.id)?.couples.some((couple) => isInCouple(couple, 'Chris')),
    );
    expect(chrisHeats.map(describeItem)).toContain('8:07 AM [1]');
  });
});

describe('what is happening now, by the posted times', () => {
  const { items } = loadPurdueData().schedule;

  it('is the last item that has started', () => {
    expect(describeItem(itemAtTime(items, onTheDay(8, 0)))).toBe('American Style Smooth Events');
    expect(describeItem(itemAtTime(items, onTheDay(8, 20)))).toBe('8:18 AM [2]');
    // A section title and its first heat share a time: the heat is what's on.
    expect(describeItem(itemAtTime(items, onTheDay(10, 57)))).toBe('10:57 AM [11]');
    expect(describeItem(itemAtTime(items, onTheDay(21, 0)))).toBe('Latin Awards');
  });

  it('is nothing before the start, or on any other day', () => {
    expect(itemAtTime(items, onTheDay(7, 59))).toBeNull();
    expect(itemAtTime(items, new Date(2026, 10, 13, 9, 0).getTime())).toBeNull();
    expect(itemAtTime(items, new Date(2026, 10, 15, 9, 0).getTime())).toBeNull();
  });

  it('places the competition there, at the posted times', () => {
    const competition = purdueCompetition(onTheDay(8, 20));
    expect(describeItem(competition.schedule[competition.currentIndex] ?? null)).toBe(
      '8:18 AM [2]',
    );
    expect(competition.delayMinutes).toBe(0);
    expect(purdueCompetition(onTheDay(7, 0)).currentIndex).toBe(-1);
  });
});
