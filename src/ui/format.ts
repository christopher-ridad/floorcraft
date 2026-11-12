/** Wording shown to the user. */
import { dancerName } from '../domain/dancers';
import { ROUND_LABELS, type HeatName } from '../domain/schedule/heatName';
import type { Couple } from '../domain/types';

export const coupleName = (couple: Couple) =>
  `${dancerName(couple.lead)} & ${dancerName(couple.follow) || 'TBA'}`;

export const partnerName = (name: string) => dancerName(name) || 'TBA';

export const roundLabel = (heatName: HeatName) =>
  heatName.isSingleRound ? 'Single round' : ROUND_LABELS[heatName.round];

export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** Joins class names, skipping falsy ones. */
export const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(' ');
