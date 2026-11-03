import type { EventCatalog } from '../schedule/eventCatalog';
import { tokenizeEventName } from './eventNameTokens';

/**
 * Finds the event an entry like `Silver I. Standard (TF)` refers to. The event must have the
 * same level and dances and contain every word of the entry; among those, the event with the
 * fewest extra words wins, and ties go to the earliest event. Returns the event number, or null.
 */
export function matchEntry(entry: string, events: EventCatalog): number | null {
  const wanted = tokenizeEventName(entry);
  let bestEventNumber: number | null = null;
  let fewestExtraWords = Infinity;

  for (const { eventNumber, tokens } of events.values()) {
    if (tokens.level !== wanted.level) continue;
    if (wanted.dances && tokens.dances !== wanted.dances) continue;
    // An entry with no dances listed only matches single-dance events.
    if (!wanted.dances && tokens.dances.length > 1) continue;
    if (![...wanted.words].every((word) => tokens.words.has(word))) continue;

    const extraWords = tokens.words.size - wanted.words.size;
    if (extraWords < fewestExtraWords) {
      bestEventNumber = eventNumber;
      fewestExtraWords = extraWords;
    }
  }
  return bestEventNumber;
}
