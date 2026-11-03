import { signal } from '@preact/signals';

export type Tab = 'now' | 'schedule' | 'people' | 'setup';
export type ScheduleFilter = 'team' | 'mine' | 'all';

const TABS: readonly Tab[] = ['now', 'schedule', 'people', 'setup'];
const FILTERS: readonly ScheduleFilter[] = ['team', 'mine', 'all'];
const TOAST_DURATION_MS = 3800;

/** Where this phone remembers its last tab and filter. Never throws. */
export interface ViewStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** Reads a remembered choice, including the original app's JSON-encoded `hs:` keys. */
function remembered<Choice extends string>(
  storage: ViewStorage,
  name: string,
  choices: readonly Choice[],
  fallback: Choice,
): Choice {
  const legacy = storage.get(`hs:${name}`)?.replace(/^"|"$/g, '');
  const value = storage.get(`floorcraft:${name}`) ?? legacy;
  return choices.find((choice) => choice === value) ?? fallback;
}

/** UI-only state: what this phone is looking at. Nothing here is shared with the team. */
export function createViewState(storage: ViewStorage) {
  const tab = signal<Tab>(remembered(storage, 'tab', TABS, 'now'));
  const scheduleFilter = signal<ScheduleFilter>(remembered(storage, 'filter', FILTERS, 'team'));
  /** The dancer picked on the People tab, if any. */
  const viewingDancer = signal<string | null>(null);
  /** The schedule item whose sheet is open. */
  const openItemId = signal<string | null>(null);
  const toast = signal<{ text: string; id: number } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  return {
    tab,
    scheduleFilter,
    viewingDancer,
    openItemId,
    toast,

    showTab(next: Tab) {
      tab.value = next;
      storage.set('floorcraft:tab', next);
    },
    setScheduleFilter(next: ScheduleFilter) {
      scheduleFilter.value = next;
      storage.set('floorcraft:filter', next);
    },
    openItem(itemId: string) {
      openItemId.value = itemId;
    },
    closeItem() {
      openItemId.value = null;
    },
    showToast(text: string) {
      toast.value = { text, id: (toast.peek()?.id ?? 0) + 1 };
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (toast.value = null), TOAST_DURATION_MS);
    },
  };
}

export type ViewState = ReturnType<typeof createViewState>;
