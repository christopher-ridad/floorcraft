/** Settings kept on this device only. */
export interface Preferences {
  /** The dancer this device follows ("My Schedule"). Empty until chosen. */
  dancer: string;
  /** Show heats a couple only dances if called back. */
  showPossibleHeats: boolean;
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = {
  dancer: '',
  showPossibleHeats: true,
};
