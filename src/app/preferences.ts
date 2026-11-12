/** Per-phone settings. They are never shared with the team. */
export interface Preferences {
  /** The dancer this phone gives alerts for. Empty until chosen. */
  dancer: string;
  chime: boolean;
  vibrate: boolean;
  keepScreenAwake: boolean;
  /** Show heats a couple only dances if called back. */
  showPossibleHeats: boolean;
  /** This phone chose not to link to a dancer (e.g. a captain who isn't dancing). */
  skipDancerClaim: boolean;
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = {
  dancer: '',
  chime: true,
  vibrate: true,
  keepScreenAwake: false,
  showPossibleHeats: true,
  skipDancerClaim: false,
};
