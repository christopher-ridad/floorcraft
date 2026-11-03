const LEVELS = [
  'newcomer',
  'bronze',
  'silver',
  'gold',
  'syllabus',
  'novice',
  'pre-champ',
  'prechamp',
  'championship',
  'open',
];

/** An event name reduced to comparable parts. */
export interface EventNameTokens {
  /** Leading level word, e.g. `silver`. Empty when the name doesn't start with one. */
  level: string;
  words: ReadonlySet<string>;
  /** Dance letters, sorted so `(TF)` and `(FT)` compare equal. */
  dances: string;
}

/**
 * Normalizes the many ways one event is written: `I.`/`Intl.`/`International`,
 * `A.`/`Amer.`/`American`, `V. Waltz`/`Viennese Waltz`, and any round words.
 */
export function tokenizeEventName(name: string): EventNameTokens {
  let text = ` ${name.toLowerCase()} `;
  const danceLetters = /\(([a-z]+)\)/.exec(text)?.[1] ?? '';

  text = text
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\ba\.\s/g, ' amer ')
    .replace(/\bi\.\s/g, ' intl ')
    .replace(/\bamerican\b/g, 'amer')
    .replace(/\binternational\b/g, 'intl')
    .replace(/\bv\.?\s*waltz\b/g, ' vwaltz ')
    .replace(/\bviennese waltz\b/g, ' vwaltz ')
    .replace(/\bpre-champ\b/g, 'prechamp')
    .replace(/\b(1st round|second round|2nd round|quarter|semi-final|final)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ');

  const words = text.split(/\s+/).filter(Boolean);
  const firstWord = words[0];
  const level = firstWord !== undefined && LEVELS.includes(firstWord) ? firstWord : '';
  if (level) words.shift();

  return {
    level,
    words: new Set(words),
    dances: danceLetters.toUpperCase().split('').sort().join(''),
  };
}
