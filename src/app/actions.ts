import type { ReadonlySignal, Signal } from '@preact/signals-core';
import { callbackKey, callbackMarkFor, type CallbackUpdate } from '../domain/callbacks';
import { parseClockTime } from '../domain/clock';
import type { Competition } from '../domain/competition';
import { parsePartnershipRows } from '../domain/entries/parsePartnershipRows';
import { advanceFloor, markOnFloor, moveFloorBack } from '../domain/floor';
import {
  identifyEvents,
  toScheduleLines,
  type ScheduleLine,
} from '../domain/schedule/identifyEvents';
import { parseSchedule } from '../domain/schedule/parseSchedule';
import { createDancerDirectory, importPartnerships, type UnmatchedEntry } from '../domain/team';
import type { CompetitionInfo, IdFactory, LiveState, Partnership } from '../domain/types';
import type { Clock, CompetitionSnapshot, HeatSheetRepository, TeamSnapshot } from './ports';
import type { Preferences } from './preferences';

/** `[12] Silver Amer. Smooth Final` is a heat; any other text is a break label. */
const HEAT_TEXT = /^\[(\d+)\]\s*(.+)$/;
const NEW_HEAT_NAME = 'New heat';

export interface ActionContext {
  repository: HeatSheetRepository;
  team: ReadonlySignal<TeamSnapshot>;
  competitionData: ReadonlySignal<CompetitionSnapshot>;
  activeCompetition: ReadonlySignal<CompetitionInfo | null>;
  competition: ReadonlySignal<Competition>;
  preferences: Signal<Preferences>;
  /** Reports the write's failure, if it fails. */
  save(write: Promise<void>): void;
  clock: Clock;
  createId: IdFactory;
  savePreferences(preferences: Preferences): void;
  forgetGivenAlerts(): void;
  playTestAlert(): void;
}

export type EditResult = 'saved' | 'invalid-time' | 'not-found';

export interface EntriesImportResult {
  couples: number;
  /** Entries that match no event on the schedule; the captain adds those by hand. */
  unmatched: UnmatchedEntry[];
}

export type Actions = ReturnType<typeof createActions>;

export function createActions(ctx: ActionContext) {
  const { repository, competition, clock, save } = ctx;
  const competitionId = () => ctx.activeCompetition.peek()?.id ?? null;
  const live = (): LiveState => competition.peek().live;

  function saveFloor(next: LiveState) {
    const id = competitionId();
    if (!id || next === live()) return;
    save(
      repository.saveFloor(id, {
        currentItemId: next.currentItemId,
        currentSetAt: next.currentSetAt,
      }),
    );
  }

  /** Applies a change to the schedule's lines, then re-identifies its events and saves it. */
  function saveScheduleLines(change: (lines: ScheduleLine[]) => ScheduleLine[]) {
    const id = competitionId();
    if (!id) return;
    const current = ctx.competitionData.peek().schedule;
    const schedule = identifyEvents(
      change(toScheduleLines(current.items)),
      current.events,
      ctx.createId,
    );
    save(repository.saveSchedule(id, schedule));
  }

  function saveEntriesOf(coupleId: string, change: (eventIds: readonly string[]) => string[]) {
    const id = competitionId();
    if (!id) return;
    const current = ctx.competitionData.peek().entries[coupleId] ?? [];
    save(repository.saveEntries(id, { [coupleId]: change(current) }));
  }

  /** Points a partnership at dancers by name, adding dancers who are new. */
  function savePartnershipNames(partnership: Partnership, lead: string, follow: string) {
    const directory = createDancerDirectory(ctx.team.peek().dancers, ctx.createId);
    const known = directory.dancers.length;
    const updated = {
      ...partnership,
      leadId: directory.idFor(lead),
      followId: directory.idFor(follow),
      active: true,
    };
    const added = directory.dancers.slice(known);
    if (added.length) save(repository.saveDancers(added));
    save(repository.savePartnerships([updated]));
  }

  return {
    // ---- Competitions ----

    /**
     * Creates a competition and makes it the one everyone sees; the previous one is archived.
     * Returns the new competition's id.
     */
    startCompetition(name: string, date: string): string {
      const id = ctx.createId();
      const previous = ctx.activeCompetition.peek();
      if (previous) save(repository.saveCompetition({ ...previous, status: 'archived' }));
      save(repository.saveCompetition({ id, name: name.trim(), date, status: 'active' }));
      save(repository.updateTeam({ activeCompetitionId: id }));
      return id;
    },

    // ---- The floor ----

    /** The next item is on the floor now. */
    advanceFloor() {
      saveFloor(advanceFloor(competition.peek(), clock.now()));
    },

    /** Corrects the floor back one item without changing the pace. */
    moveFloorBack() {
      saveFloor(moveFloorBack(competition.peek(), clock.now()));
    },

    putOnFloor(itemId: string) {
      saveFloor(markOnFloor(live(), itemId, clock.now()));
    },

    recordCallback(update: CallbackUpdate) {
      const id = competitionId();
      if (!id) return;
      const mark = callbackMarkFor(competition.peek().rounds, update);
      save(repository.saveCallback(id, callbackKey(update.coupleId, update.eventId), mark));
    },

    /** Clears the floor position and every callback mark. */
    resetLiveTracking() {
      const id = competitionId();
      if (!id) return;
      save(repository.clearLive(id));
      ctx.forgetGivenAlerts();
    },

    // ---- The schedule ----

    /**
     * Replaces the schedule with pasted text. Events that match the old schedule keep their ids,
     * so entries and callback marks stay attached. Clears the floor position.
     * Returns the number of heats found; nothing changes when there are none.
     */
    importSchedule(text: string): number {
      const id = competitionId();
      if (!id) return 0;
      const schedule = parseSchedule(text, {
        previousEvents: ctx.competitionData.peek().schedule.events,
        createId: ctx.createId,
      });
      const heatCount = schedule.items.filter((item) => item.kind === 'heat').length;
      if (!heatCount) return 0;
      save(repository.saveFloor(id, { currentItemId: null, currentSetAt: null }));
      save(repository.saveSchedule(id, schedule));
      return heatCount;
    },

    /** Saves a schedule line from its time and `[event] name` (a heat) or plain text (a break). */
    editScheduleItem(itemId: string, timeText: string, itemText: string): EditResult {
      const time = timeText.trim();
      if (parseClockTime(time) === null) return 'invalid-time';
      if (!ctx.competitionData.peek().schedule.items.some((item) => item.id === itemId)) {
        return 'not-found';
      }
      const text = itemText.trim();
      const heat = HEAT_TEXT.exec(text);
      const scheduledTime = time.toUpperCase();
      const edited: ScheduleLine = heat
        ? {
            kind: 'heat',
            id: itemId,
            scheduledTime,
            eventNumber: Number(heat[1]),
            name: heat[2] ?? '',
          }
        : { kind: 'break', id: itemId, scheduledTime, label: text };
      saveScheduleLines((lines) => lines.map((line) => (line.id === itemId ? edited : line)));
      return 'saved';
    },

    /**
     * Adds a placeholder heat right after an item, at the same time and in the same event
     * (after a break: the schedule's first event). Returns the new heat's id.
     */
    insertHeatAfter(itemId: string): string | null {
      const items = ctx.competitionData.peek().schedule.items;
      const after = items.find((item) => item.id === itemId);
      if (!after || !competitionId()) return null;
      const firstEvent = competition.peek().events.values().next().value;
      const heat: ScheduleLine = {
        kind: 'heat',
        id: ctx.createId(),
        scheduledTime: after.scheduledTime,
        eventNumber: after.kind === 'heat' ? after.eventNumber : (firstEvent?.eventNumber ?? 1),
        name: NEW_HEAT_NAME,
      };
      saveScheduleLines((lines) => {
        const index = lines.findIndex((line) => line.id === itemId);
        return [...lines.slice(0, index + 1), heat, ...lines.slice(index + 1)];
      });
      return heat.id;
    },

    deleteScheduleItem(itemId: string) {
      saveScheduleLines((lines) => lines.filter((line) => line.id !== itemId));
    },

    // ---- Couples and entries ----

    /**
     * Sets the team's partnerships and this competition's entries from pasted spreadsheet rows.
     * Partnerships not in the rows become inactive. Nothing changes when no rows are found.
     */
    importEntries(text: string): EntriesImportResult {
      const id = competitionId();
      const rows = parsePartnershipRows(text);
      if (!id || !rows.length) return { couples: 0, unmatched: [] };

      const result = importPartnerships(
        rows,
        ctx.team.peek(),
        competition.peek().events,
        ctx.createId,
      );
      const entries = Object.fromEntries(
        result.partnerships.map((partnership) => [
          partnership.id,
          result.entries[partnership.id] ?? [],
        ]),
      );
      save(repository.saveDancers(result.dancers));
      save(repository.savePartnerships(result.partnerships));
      save(repository.saveEntries(id, entries));
      return { couples: rows.length, unmatched: result.unmatched };
    },

    /** Adds a partnership with no events. Returns its id, or null without a lead's name. */
    addCouple(lead: string, follow: string): string | null {
      if (!lead.trim()) return null;
      const partnership: Partnership = {
        id: ctx.createId(),
        leadId: null,
        followId: null,
        active: true,
      };
      savePartnershipNames(partnership, lead, follow);
      return partnership.id;
    },

    /** Points the couple at dancers by name. A blank name is a partner to be announced. */
    renameCouple(coupleId: string, lead: string, follow: string) {
      const partnership = ctx.team
        .peek()
        .partnerships.find((candidate) => candidate.id === coupleId);
      if (partnership) savePartnershipNames(partnership, lead, follow);
    },

    /** Takes the couple off the team (kept for history) and out of this competition. */
    deleteCouple(coupleId: string) {
      const partnership = ctx.team
        .peek()
        .partnerships.find((candidate) => candidate.id === coupleId);
      if (!partnership) return;
      save(repository.savePartnerships([{ ...partnership, active: false }]));
      saveEntriesOf(coupleId, () => []);
    },

    addEntry(coupleId: string, eventId: string) {
      if (!competition.peek().events.has(eventId)) return;
      saveEntriesOf(coupleId, (eventIds) =>
        eventIds.includes(eventId) ? [...eventIds] : [...eventIds, eventId],
      );
    },

    removeEntry(coupleId: string, eventId: string) {
      saveEntriesOf(coupleId, (eventIds) => eventIds.filter((candidate) => candidate !== eventId));
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
