/** Settings kept on this device only. */
export interface Preferences {
  /** The dancer this device follows ("My Schedule"). Empty until chosen. */
  dancer: string;
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = {
  dancer: '',
};
