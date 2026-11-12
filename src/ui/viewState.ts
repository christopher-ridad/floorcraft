import { signal } from '@preact/signals';

export type Tab = 'now' | 'schedule' | 'people';
export type ScheduleFilter = 'team' | 'mine' | 'all';

const TABS: readonly Tab[] = ['now', 'schedule', 'people'];
const FILTERS: readonly ScheduleFilter[] = ['team', 'mine', 'all'];
const TOAST_DURATION_MS = 3800;

/** Where this device remembers its last tab and filter. Never throws. */
export interface ViewStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

function remembered<Choice extends string>(
  storage: ViewStorage,
  name: string,
  choices: readonly Choice[],
  fallback: Choice,
): Choice {
  const value = storage.get(`floorcraft:${name}`);
  return choices.find((choice) => choice === value) ?? fallback;
}

/** What this device is looking at. */
export function createViewState(storage: ViewStorage) {
  const tab = signal<Tab>(remembered(storage, 'tab', TABS, 'now'));
  const scheduleFilter = signal<ScheduleFilter>(remembered(storage, 'filter', FILTERS, 'team'));
  /** The dancer picked on the People tab, if any. */
  const viewingDancer = signal<string | null>(null);
  const toast = signal<{ text: string; id: number } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  return {
    tab,
    scheduleFilter,
    viewingDancer,
    toast,

    showTab(next: Tab) {
      tab.value = next;
      storage.set('floorcraft:tab', next);
    },
    setScheduleFilter(next: ScheduleFilter) {
      scheduleFilter.value = next;
      storage.set('floorcraft:filter', next);
    },
    showToast(text: string) {
      toast.value = { text, id: (toast.peek()?.id ?? 0) + 1 };
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (toast.value = null), TOAST_DURATION_MS);
    },
  };
}

export type ViewState = ReturnType<typeof createViewState>;
