import type { DanceStyle, Round } from '../types';
import { classifyDanceStyle } from './danceStyle';

/** Round words as they appear in heat names. Checked in order, so `semi-final` wins over `final`. */
const ROUND_NAMES: readonly (readonly [string, Round])[] = [
  ['1st round', 1],
  ['first round', 1],
  ['second round', 2],
  ['2nd round', 2],
  ['quarter', 3],
  ['semi-final', 4],
  ['semi final', 4],
  ['semifinal', 4],
  ['final', 5],
];

export const ROUND_LABELS: Readonly<Record<Round, string>> = {
  1: '1st Round',
  2: '2nd Round',
  3: 'Quarter',
  4: 'Semi',
  5: 'Final',
};

export interface HeatName {
  /** The event name without its round, e.g. `Bronze Amer. Smooth (WT)`. */
  baseName: string;
  round: Round;
  /** True when the name has no round: the event is danced once. */
  isSingleRound: boolean;
  /** Dance letters from the parentheses, e.g. `WT`. Empty when none are listed. */
  dances: string;
  style: DanceStyle;
}

export function parseHeatName(name: string): HeatName {
  const lowerName = name.toLowerCase();
  const roundName = ROUND_NAMES.find(([text]) => lowerName.includes(text));

  let baseName = name;
  if (roundName) {
    const start = lowerName.indexOf(roundName[0]);
    baseName = name.slice(0, start) + name.slice(start + roundName[0].length);
  }

  return {
    baseName: baseName.replace(/\s+/g, ' ').trim(),
    round: roundName ? roundName[1] : 5,
    isSingleRound: !roundName,
    dances: /\(([A-Za-z]+)\)/.exec(name)?.[1]?.toUpperCase() ?? '',
    style: classifyDanceStyle(name),
  };
}
