/** Wording shown to the user. */
import type { Notice } from '../app/notices';
import { dancerName } from '../domain/dancers';
import type { PaceStatus } from '../domain/pace';
import { ROUND_LABELS, type HeatName } from '../domain/schedule/heatName';
import type { Couple } from '../domain/types';

export const coupleName = (couple: Couple) =>
  `${dancerName(couple.lead)} & ${dancerName(couple.follow) || 'TBA'}`;

export const partnerName = (name: string) => dancerName(name) || 'TBA';

export const roundLabel = (heatName: HeatName) =>
  heatName.isSingleRound ? 'Single round' : ROUND_LABELS[heatName.round];

export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

export function paceLabel(pace: PaceStatus): { text: string; isOffSchedule: boolean } {
  switch (pace.kind) {
    case 'not-started':
      return { text: 'Not started', isOffSchedule: false };
    case 'on-time':
      return { text: 'On time', isOffSchedule: false };
    case 'behind':
      return { text: `${pace.minutes} min behind`, isOffSchedule: true };
    case 'ahead':
      return { text: `${pace.minutes} min ahead`, isOffSchedule: true };
  }
}

export function noticeText(notice: Notice): string {
  switch (notice.kind) {
    case 'alert':
      return notice.alert.type === 'on-deck'
        ? "You're on deck. Next heat is yours."
        : `Heads up: you dance in ${notice.alert.heatsAway} heats.`;
    case 'save-failed':
      if (notice.code === 'read-only') {
        return 'You have view-only access, so this change was not saved. Ask the owner for edit access.';
      }
      if (notice.code === 'quota-exceeded') return `Storage is full: ${notice.detail}`;
      return 'Could not save. Check your connection and try again.';
    case 'wake-lock-refused':
      return 'This browser would not keep the screen on.';
  }
}

/** Joins class names, skipping falsy ones. */
export const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(' ');
