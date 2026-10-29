import type { ReadonlySignal, Signal } from '@preact/signals-core';
import { recordCallback, type CallbackUpdate } from '../domain/callbacks';
import { parseClockTime } from '../domain/clock';
import type { Competition } from '../domain/competition';
import { parseEntries } from '../domain/entries/parseEntries';
import { advanceFloor, markOnFloor, moveFloorBack } from '../domain/floor';
import { parseSchedule } from '../domain/schedule/parseSchedule';
import type { Couple, IdFactory, ScheduleItem } from '../domain/types';
import type { Clock, CompetitionDocuments, DocumentName } from './ports';
import type { Preferences } from './preferences';

/** `[12] Silver Amer. Smooth Final` is a heat; any other text is a break label. */
const HEAT_TEXT = /^\[(\d+)\]\s*(.+)$/;
const NEW_HEAT_NAME = 'New heat';
const UNKNOWN_PARTNER = 'TBA';

export interface ActionContext {
  documents: { [Name in DocumentName]: ReadonlySignal<CompetitionDocuments[Name]> };
  preferences: Signal<Preferences>;
  competition: ReadonlySignal<Competition>;
  commit<Name extends DocumentName>(name: Name, value: CompetitionDocuments[Name]): void;
  clock: Clock;
  createId: IdFactory;
  savePreferences(preferences: Preferences): void;
  forgetGivenAlerts(): void;
  playTestAlert(): void;
}

export type EditResult = 'saved' | 'invalid-time' | 'not-found';

export type Actions = ReturnType<typeof createActions>;

export function createActions(ctx: ActionContext) {
  const { documents, competition, commit, clock } = ctx;
  const live = () => documents.live.peek();
  const schedule = () => documents.schedule.peek();
  const couples = () => documents.entries.peek();

  function updateCouple(coupleId: string, change: (couple: Couple) => Couple | null) {
    let changed = false;
    const next = couples().map((couple) => {
      if (couple.id !== coupleId) return couple;
      const updated = change(couple);
      if (!updated) return couple;
      changed = true;
      return updated;
    });
    if (changed) commit('entries', next);
  }

  return {
    // ---- The floor ----

    /** The next item is on the floor now. */
    advanceFloor() {
      const next = advanceFloor(competition.peek(), clock.now());
      if (next !== live()) commit('live', next);
    },

    /** Corrects the floor back one item without changing the pace. */
    moveFloorBack() {
      const next = moveFloorBack(competition.peek(), clock.now());
      if (next !== live()) commit('live', next);
    },

    putOnFloor(itemId: string) {
      commit('live', markOnFloor(live(), itemId, clock.now()));
    },

    recordCallback(update: CallbackUpdate) {
      const callbacks = recordCallback(live().callbacks, competition.peek().rounds, update);
      commit('live', { ...live(), callbacks });
    },

    /** Clears the floor position and every callback mark. */
    resetLiveTracking() {
      commit('live', { currentItemId: null, currentSetAt: null, callbacks: {} });
      ctx.forgetGivenAlerts();
    },

    // ---- The schedule ----

    /**
     * Replaces the schedule with pasted text. Clears the floor position; callback marks are kept.
     * Returns the number of heats found; nothing changes when there are none.
     */
    importSchedule(text: string): number {
      const items = parseSchedule(text, ctx.createId);
      const heatCount = items.filter((item) => item.kind === 'heat').length;
      if (!heatCount) return 0;
      commit('live', { ...live(), currentItemId: null, currentSetAt: null });
      commit('schedule', items);
      return heatCount;
    },

    /** Saves a schedule line from its time and `[event] name` (a heat) or plain text (a break). */
    editScheduleItem(itemId: string, timeText: string, itemText: string): EditResult {
      const time = timeText.trim();
      if (parseClockTime(time) === null) return 'invalid-time';
      if (!schedule().some((item) => item.id === itemId)) return 'not-found';

      const text = itemText.trim();
      const heat = HEAT_TEXT.exec(text);
      const scheduledTime = time.toUpperCase();
      const edited: ScheduleItem = heat
        ? {
            kind: 'heat',
            id: itemId,
            scheduledTime,
            eventNumber: Number(heat[1]),
            name: heat[2] ?? '',
          }
        : { kind: 'break', id: itemId, scheduledTime, label: text };
      commit(
        'schedule',
        schedule().map((item) => (item.id === itemId ? edited : item)),
      );
      return 'saved';
    },

    /**
     * Adds a placeholder heat right after an item, at the same time and in the same event
     * (after a break: the schedule's first event). Returns the new heat's id.
     */
    insertHeatAfter(itemId: string): string | null {
      const items = schedule();
      const index = items.findIndex((item) => item.id === itemId);
      const after = items[index];
      if (!after) return null;

      const eventNumber =
        after.kind === 'heat'
          ? after.eventNumber
          : (competition.peek().events.keys().next().value ?? 1);
      const heat: ScheduleItem = {
        kind: 'heat',
        id: ctx.createId(),
        scheduledTime: after.scheduledTime,
        eventNumber,
        name: NEW_HEAT_NAME,
      };
      commit('schedule', [...items.slice(0, index + 1), heat, ...items.slice(index + 1)]);
      return heat.id;
    },

    deleteScheduleItem(itemId: string) {
      commit(
        'schedule',
        schedule().filter((item) => item.id !== itemId),
      );
    },

    // ---- Couples and entries ----

    /** Replaces every couple with pasted partnership rows. Returns how many were found. */
    importEntries(text: string): number {
      const imported = parseEntries(text, ctx.createId);
      if (imported.length) commit('entries', imported);
      return imported.length;
    },

    /** Adds a couple with no events. Returns its id, or null without a lead's name. */
    addCouple(lead: string, follow: string): string | null {
      const leadName = lead.trim();
      if (!leadName) return null;
      const couple: Couple = {
        id: ctx.createId(),
        lead: leadName,
        follow: follow.trim() || UNKNOWN_PARTNER,
        entries: [],
        manualMatches: [],
      };
      commit('entries', [...couples(), couple]);
      return couple.id;
    },

    renameCouple(coupleId: string, lead: string, follow: string) {
      updateCouple(coupleId, (couple) => ({
        ...couple,
        lead: lead.trim() || UNKNOWN_PARTNER,
        follow: follow.trim() || UNKNOWN_PARTNER,
      }));
    },

    deleteCouple(coupleId: string) {
      commit(
        'entries',
        couples().filter((couple) => couple.id !== coupleId),
      );
    },

    /** Enters the couple in a scheduled event, pinned to that event. */
    addEntry(coupleId: string, eventNumber: number) {
      const event = competition.peek().events.get(eventNumber);
      if (!event) return;
      updateCouple(coupleId, (couple) =>
        couple.entries.includes(event.baseName)
          ? null
          : {
              ...couple,
              entries: [...couple.entries, event.baseName],
              manualMatches: [...couple.manualMatches, { entry: event.baseName, eventNumber }],
            },
      );
    },

    removeEntry(coupleId: string, entryIndex: number) {
      updateCouple(coupleId, (couple) => {
        const entry = couple.entries[entryIndex];
        if (entry === undefined) return null;
        return {
          ...couple,
          entries: couple.entries.filter((_, index) => index !== entryIndex),
          manualMatches: couple.manualMatches.filter((match) => match.entry !== entry),
        };
      });
    },

    /** Pins an entry to an event by hand, replacing the automatic match. */
    chooseEventForEntry(coupleId: string, entryIndex: number, eventNumber: number) {
      updateCouple(coupleId, (couple) => {
        const entry = couple.entries[entryIndex];
        if (entry === undefined) return null;
        return {
          ...couple,
          manualMatches: [
            ...couple.manualMatches.filter((match) => match.entry !== entry),
            { entry, eventNumber },
          ],
        };
      });
    },

    // ---- This phone ----

    updatePreferences(change: Partial<Preferences>) {
      const next = { ...ctx.preferences.peek(), ...change };
      ctx.preferences.value = next;
      ctx.savePreferences(next);
    },

    testAlert() {
      ctx.playTestAlert();
    },
  };
}
