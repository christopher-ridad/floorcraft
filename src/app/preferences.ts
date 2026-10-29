/** Per-phone settings. They are never shared with the team. */
export interface Preferences {
  /** The dancer this phone gives alerts for. Empty until chosen. */
  dancer: string;
  alertThresholdHeats: number;
  chime: boolean;
  vibrate: boolean;
  keepScreenAwake: boolean;
  /** Show heats a couple only dances if called back. */
  showPossibleHeats: boolean;
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = {
  dancer: '',
  alertThresholdHeats: 3,
  chime: true,
  vibrate: true,
  keepScreenAwake: false,
  showPossibleHeats: true,
};

export const ALERT_THRESHOLD_CHOICES = [1, 2, 3, 4, 5, 6, 8] as const;
