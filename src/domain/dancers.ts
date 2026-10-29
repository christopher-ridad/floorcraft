import type { Competition } from './competition';
import type { Couple, Heat } from './types';

/** A dancer's display name: the name without notes like `(TBA)`. */
export const dancerName = (name: string) => name.replace(/\s*\(.*?\)\s*/g, '').trim();

export const isInCouple = (couple: Couple, dancer: string) =>
  dancerName(couple.lead) === dancer || dancerName(couple.follow) === dancer;

/** The other half of the couple, as written (notes included). */
export const partnerOf = (couple: Couple, dancer: string) =>
  dancerName(couple.lead) === dancer ? couple.follow : couple.lead;

export interface UpcomingHeat {
  heat: Heat;
  couple: Couple;
  /** True when the dancer only dances this heat if called back. */
  isPossible: boolean;
}

/** The dancer's heats from the one on the floor onward, confirmed or possible. */
export function upcomingHeatsFor(competition: Competition, dancer: string): UpcomingHeat[] {
  const fromIndex = Math.max(competition.currentIndex, 0);
  const upcoming: UpcomingHeat[] = [];
  competition.schedule.forEach((item, index) => {
    if (item.kind !== 'heat' || index < fromIndex) return;
    const team = competition.heatTeams.get(item.id);
    if (!team) return;
    const confirmed = team.dancing.find((couple) => isInCouple(couple, dancer));
    if (confirmed) {
      upcoming.push({ heat: item, couple: confirmed, isPossible: false });
      return;
    }
    const possible = team.possible.find((couple) => isInCouple(couple, dancer));
    if (possible) upcoming.push({ heat: item, couple: possible, isPossible: true });
  });
  return upcoming;
}

/** The next `limit` heats after the one on the floor that have anyone from the team in them. */
export function teamUpcomingHeats(
  competition: Competition,
  limit: number,
  includePossible: boolean,
): Heat[] {
  const heats: Heat[] = [];
  const items = competition.schedule;
  for (let i = Math.max(competition.currentIndex + 1, 0); i < items.length; i++) {
    if (heats.length >= limit) break;
    const item = items[i];
    if (item?.kind !== 'heat') continue;
    const team = competition.heatTeams.get(item.id);
    if (team && (team.dancing.length || (includePossible && team.possible.length))) {
      heats.push(item);
    }
  }
  return heats;
}
