import type { ReadonlySignal, Signal } from '@preact/signals-core';
import { callbackKey, callbackMarkFor, type CallbackUpdate } from '../domain/callbacks';
import { parseClockTime } from '../domain/clock';
import type { Competition } from '../domain/competition';
import { parsePartnershipRows } from '../domain/entries/parsePartnershipRows';
import { advanceFloor, markOnFloor, moveFloorBack } from '../domain/floor';
import {
  isOfficialSchedule,
  OFFICIAL_DATA_VERSION,
  OFFICIAL_PARTNERSHIPS_TEXT,
  officialSchedule,
  PURDUE_CLASSIC,
} from '../domain/purdue';
import { buildEventCatalog } from '../domain/schedule/eventCatalog';
import {
  identifyEvents,
  toScheduleLines,
  type ScheduleLine,
} from '../domain/schedule/identifyEvents';
import { createDancerDirectory, importPartnerships } from '../domain/team';
import type { CompetitionInfo, IdFactory, LiveState, Partnership, Schedule } from '../domain/types';
import { BACKUP_FORMAT, BACKUP_VERSION, type TeamBackup } from './backup';
import type {
  Clock,
  CompetitionSnapshot,
  HeatSheetRepository,
  TeamInfo,
  TeamSnapshot,
} from './ports';
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

export interface OfficialScheduleResult {
  heats: number;
  /** Couples' entries for events that aren't on the official schedule. */
  droppedEntries: number;
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

  /**
   * Ids for what the built-in data adds, the same on every phone: if two phones apply it at
   * once, they write the same documents instead of duplicating dancers, couples or events.
   */
  const officialIds = (part: string): IdFactory => {
    let next = 0;
    return () => `official-${OFFICIAL_DATA_VERSION}-${part}${++next}`;
  };

  function writeOfficialData(info: CompetitionInfo, current: Schedule) {
    const isOfficial = isOfficialSchedule(current.items);
    const schedule = isOfficial
      ? current
      : officialSchedule({ previousEvents: current.events, createId: officialIds('s') });
    if (!isOfficial) {
      // Every line is new, so the floor position no longer points at anything.
      if (ctx.competitionData.peek().floor.currentItemId && info.id === competitionId()) {
        save(repository.saveFloor(info.id, { currentItemId: null, currentSetAt: null }));
      }
      save(repository.saveSchedule(info.id, schedule));
    }

    const roster = importPartnerships(
      parsePartnershipRows(OFFICIAL_PARTNERSHIPS_TEXT),
      ctx.team.peek(),
      buildEventCatalog(schedule.events),
      officialIds('r'),
    );
    save(repository.saveDancers(roster.dancers));
    save(repository.savePartnerships(roster.partnerships));
    save(
      repository.saveEntries(
        info.id,
        Object.fromEntries(
          roster.partnerships.map((partnership) => [
            partnership.id,
            roster.entries[partnership.id] ?? [],
          ]),
        ),
      ),
    );
    save(repository.saveCompetition({ ...info, officialVersion: OFFICIAL_DATA_VERSION }));
  }

  return {
    // ---- The competition ----

    /**
     * Sets up the Purdue Ballroom Classic with its official schedule, partnerships and entries, for
     * a team that was just created. Returns the competition's id.
     */
    setUpCompetition(): string {
      const info: CompetitionInfo = { id: ctx.createId(), ...PURDUE_CLASSIC, status: 'active' };
      writeOfficialData(info, { items: [], events: [] });
      save(repository.updateTeam({ activeCompetitionId: info.id }));
      return info.id;
    },

    /**
     * Brings the competition up to the built-in data: the official schedule (unless it already is
     * the official one), and the team's official partnerships and entries. Dancers, partnerships
     * and events that already exist keep their ids, so callbacks and phones' names stay attached.
     * Returns false when there's no competition to update.
     */
    applyOfficialData(): boolean {
      const info = ctx.activeCompetition.peek();
      if (!info) return false;
      writeOfficialData(info, ctx.competitionData.peek().schedule);
      return true;
    },

    // ---- Backups ----

    /**
     * The team and the active competition as one file. (Only the active competition's schedule
     * and entries are loaded on the phone, so earlier competitions aren't included.)
     */
    exportBackup(): TeamBackup {
      const { team, dancers, partnerships } = ctx.team.peek();
      const active = ctx.activeCompetition.peek();
      const { schedule, entries, floor, callbacks } = ctx.competitionData.peek();
      return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date(clock.now()).toISOString(),
        team: { name: team?.name ?? '', activeCompetitionId: active?.id ?? null },
        dancers,
        partnerships,
        competitions: active ? [{ info: active, schedule, entries, floor, callbacks }] : [],
      };
    },

    /**
     * Adds everything in a backup to the team: dancers, partnerships and competitions are added or
     * replaced by id. The backup's active competition becomes the one everyone sees, and the
     * previously active one is archived.
     */
    importBackup(backup: TeamBackup) {
      save(repository.saveDancers(backup.dancers));
      save(repository.savePartnerships(backup.partnerships));
      for (const { info, schedule, entries } of backup.competitions) {
        save(repository.saveCompetition(info));
        save(repository.saveSchedule(info.id, schedule));
        save(repository.saveEntries(info.id, entries));
      }

      const activeId = backup.team.activeCompetitionId;
      const previous = ctx.activeCompetition.peek();
      if (previous && activeId && previous.id !== activeId) {
        save(repository.saveCompetition({ ...previous, status: 'archived' }));
      }
      const change: Partial<TeamInfo> = {};
      if (backup.team.name) change.name = backup.team.name;
      if (activeId) change.activeCompetitionId = activeId;
      if (Object.keys(change).length) save(repository.updateTeam(change));

      // Live tracking can only be written for the active competition, so only its is restored.
      const active = backup.competitions.find(({ info }) => info.id === activeId);
      if (!active) return;
      if (active.floor.currentItemId) save(repository.saveFloor(active.info.id, active.floor));
      for (const [key, mark] of Object.entries(active.callbacks)) {
        save(repository.saveCallback(active.info.id, key, mark));
      }
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
     * Replaces the schedule with the official one. Events that match the current schedule keep
     * their ids, so entries and callback marks stay attached. Clears the floor position, since
     * every line is new.
     */
    loadOfficialSchedule(): OfficialScheduleResult {
      const id = competitionId();
      if (!id) return { heats: 0, droppedEntries: 0 };
      const schedule = officialSchedule({
        previousEvents: ctx.competitionData.peek().schedule.events,
        createId: ctx.createId,
      });
      save(repository.saveFloor(id, { currentItemId: null, currentSetAt: null }));
      save(repository.saveSchedule(id, schedule));

      const eventIds = new Set(schedule.events.map((event) => event.eventId));
      const coupleIds = new Set(competition.peek().couples.map((couple) => couple.id));
      const droppedEntries = Object.entries(ctx.competitionData.peek().entries)
        .filter(([coupleId]) => coupleIds.has(coupleId))
        .flatMap(([, ids]) => ids)
        .filter((eventId) => !eventIds.has(eventId)).length;
      return {
        heats: schedule.items.filter((item) => item.kind === 'heat').length,
        droppedEntries,
      };
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
