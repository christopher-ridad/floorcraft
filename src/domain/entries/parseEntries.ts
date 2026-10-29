import { randomId, type Couple, type IdFactory } from '../types';

const LEVEL = '(?:Newcomer|Bronze|Silver|Gold|Novice|Pre-Champ|Championship)';
/** The level column in space-separated rows, e.g. `Bronze, Silver `. */
const LEVEL_COLUMN = new RegExp(`^(${LEVEL}(?:\\s*,\\s*${LEVEL})*)\\s+(?=\\S)`, 'i');
const HEADER_ROW = /^lead\b/i;
const SHEET_TITLE_ROW = /spreadsheet$/i;
const NAME_NOTE = /^\(.*\)$/;

/**
 * Parses rows from the partnerships spreadsheet: lead, follow, level, then events separated by
 * commas. Rows can be tab-separated (copied from the sheet) or space-separated.
 * Rows without a lead or any events are skipped.
 */
export function parseEntries(text: string, createId: IdFactory = randomId): Couple[] {
  const couples: Couple[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || HEADER_ROW.test(line) || SHEET_TITLE_ROW.test(line)) continue;

    const { lead, follow, events } = line.includes('\t')
      ? splitTabSeparatedRow(line)
      : splitSpaceSeparatedRow(line);
    const entries = events
      .split(/\s*,\s*/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (!lead || !entries.length) continue;

    couples.push({ id: createId(), lead, follow: follow || 'TBA', entries, manualMatches: [] });
  }
  return couples;
}

interface Row {
  lead: string;
  follow: string;
  events: string;
}

function splitTabSeparatedRow(line: string): Row {
  const [lead = '', follow = '', levelOrEvents = '', ...eventColumns] = line
    .split('\t')
    .map((cell) => cell.trim());
  return { lead, follow, events: eventColumns.join(', ') || levelOrEvents };
}

function splitSpaceSeparatedRow(line: string): Row {
  const words = line.split(/\s+/);
  const lead = takeName(words);
  const follow = takeName(words);
  return { lead, follow, events: words.join(' ').replace(LEVEL_COLUMN, '') };
}

/** Takes a one-word name plus any notes after it, e.g. `Liam (TBA)`. */
function takeName(words: string[]): string {
  let name = words.shift() ?? '';
  while (words[0] !== undefined && NAME_NOTE.test(words[0])) name += ` ${words.shift()}`;
  return name;
}
