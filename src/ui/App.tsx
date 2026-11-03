import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import type { AppStore } from '../app/store';
import { paceStatus } from '../domain/pace';
import { HeatSheet } from './components/HeatSheet';
import { AppContext, useApp } from './context';
import { cx, noticeText, paceLabel } from './format';
import type { Tab, ViewState } from './viewState';
import { NowView } from './views/NowView';
import { PeopleView } from './views/PeopleView';
import { ScheduleView } from './views/ScheduleView';
import { SetupView } from './views/SetupView';
import styles from './App.module.css';

const COMPETITION_NAME = 'Purdue Ballroom Classic';

const VIEWS: Record<Tab, () => JSX.Element | null> = {
  now: NowView,
  schedule: ScheduleView,
  people: PeopleView,
  setup: SetupView,
};

export function App({ store, view }: { store: AppStore; view: ViewState }) {
  // Alerts, failed saves and other notices from the store show as toasts.
  useEffect(() => store.onNotice((notice) => view.showToast(noticeText(notice))), [store, view]);
  const CurrentView = VIEWS[view.tab.value];

  return (
    <AppContext.Provider value={{ store, view }}>
      <TopBar />
      <main class={styles.main}>
        <CurrentView />
      </main>
      <TabBar />
      <HeatSheet />
      <Toast />
    </AppContext.Provider>
  );
}

const SYNC_TITLES = {
  shared: 'Synced with the team',
  local: 'This phone only',
  connecting: 'Connecting',
} as const;

function TopBar() {
  const { store } = useApp();
  const pace = paceLabel(paceStatus(store.competition.value));
  const mode = store.syncMode.value;
  return (
    <header class={styles.top}>
      <div class={styles.brand}>
        Heat Sheet<small>{COMPETITION_NAME}</small>
      </div>
      <div class={styles.spacer} />
      <span class={cx(styles.pace, pace.isOffSchedule && styles.offSchedule)}>{pace.text}</span>
      <span
        class={cx(
          styles.sync,
          mode === 'shared' && styles.shared,
          mode === 'local' && styles.local,
        )}
        title={SYNC_TITLES[mode]}
        role="img"
        aria-label={SYNC_TITLES[mode]}
      />
    </header>
  );
}

const TABS: readonly { tab: Tab; label: string; icon: JSX.Element }[] = [
  {
    tab: 'now',
    label: 'Now',
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  { tab: 'schedule', label: 'Schedule', icon: <path d="M5 6h14M5 12h14M5 18h9" /> },
  {
    tab: 'people',
    label: 'People',
    icon: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" />
        <circle cx="17" cy="9" r="2.4" />
        <path d="M15.5 14.2c2.4-.4 4.3 1.2 5 4.3" />
      </>
    ),
  },
  {
    tab: 'setup',
    label: 'Setup',
    icon: (
      <>
        <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="10" cy="17" r="2" />
      </>
    ),
  },
];

function TabBar() {
  const { view } = useApp();
  const showTab = (tab: Tab) => {
    view.showTab(tab);
    window.scrollTo(0, 0);
  };
  return (
    <nav class={styles.tabs} aria-label="Sections">
      {TABS.map(({ tab, label, icon }) => (
        <button key={tab} aria-current={view.tab.value === tab} onClick={() => showTab(tab)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {icon}
          </svg>
          {label}
        </button>
      ))}
    </nav>
  );
}

function Toast() {
  const toast = useApp().view.toast.value;
  return toast ? (
    <div class={styles.toast} role="status" key={toast.id}>
      {toast.text}
    </div>
  ) : null;
}
