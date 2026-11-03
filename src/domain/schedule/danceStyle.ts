import type { DanceStyle } from '../types';

const AMERICAN = /\s(amer|american|a)\s/;
const INTERNATIONAL = /\s(intl|international|i)\s/;
const LATIN_FAMILY = /\s(cha|rumba|swing|bolero|mambo|rhythm|samba|jive|paso|latin)\s/;
const RHYTHM_ONLY = /\s(swing|bolero|mambo|rhythm)\s/;
const LATIN_ONLY = /\s(jive|samba|paso|latin)\s/;
const SMOOTH = /\s(smooth)\s/;
const STANDARD = /\s(standard|quickstep)\s/;

/**
 * Works out the style lane of an event name. American or International decides the pair
 * (smooth/rhythm or standard/latin); otherwise dances unique to one style decide.
 */
export function classifyDanceStyle(eventName: string): DanceStyle {
  const text = ` ${eventName.toLowerCase().replace(/[.,]/g, ' ')} `;
  const isLatinFamily = LATIN_FAMILY.test(text);
  if (AMERICAN.test(text)) return isLatinFamily ? 'rhythm' : 'smooth';
  if (INTERNATIONAL.test(text)) return isLatinFamily ? 'latin' : 'standard';
  if (RHYTHM_ONLY.test(text)) return 'rhythm';
  if (LATIN_ONLY.test(text)) return 'latin';
  if (SMOOTH.test(text)) return 'smooth';
  if (STANDARD.test(text)) return 'standard';
  return 'other';
}
