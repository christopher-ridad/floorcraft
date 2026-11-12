import type { JSX } from 'preact';
import type { AppStore } from '../app/store';
import { localDate } from '../domain/clock';
import { PURDUE_CLASSIC } from '../domain/purdue';
import { AppContext, useApp } from './context';
import type { Tab, ViewState } from './viewState';
import { NowView } from './views/NowView';
import { PeopleView } from './views/PeopleView';
import { ScheduleView } from './views/ScheduleView';
import styles from './App.module.css';

const VIEWS: Record<Tab, () => JSX.Element | null> = {
  now: NowView,
  schedule: ScheduleView,
  people: PeopleView,
};

interface AppProps {
  store: AppStore;
  view: ViewState;
}

export function App({ store, view }: AppProps) {
  return (
    <AppContext.Provider value={{ store, view }}>
      <HeatSheetApp />
      <Toast />
    </AppContext.Provider>
  );
}

function HeatSheetApp() {
  const { view } = useApp();
  const CurrentView = VIEWS[view.tab.value];
  return (
    <>
      <TopBar />
      <main class={styles.main}>
        <CurrentView />
      </main>
    </>
  );
}

/** The day, written out, e.g. `Sat, Nov 14`. */
const competitionDay = new Date(`${PURDUE_CLASSIC.date}T12:00:00`).toLocaleDateString('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

/** Whether the competition is on, by the date and the posted times. */
function statusText(store: AppStore): string {
  const today = localDate(Date.now());
  if (today < PURDUE_CLASSIC.date) return competitionDay;
  if (today > PURDUE_CLASSIC.date) return 'Finished';
  return store.competition.value.currentIndex >= 0 ? 'Today · by the posted times' : 'Today';
}

function TopBar() {
  const { store } = useApp();
  return (
    <header class={styles.top}>
      <div class={styles.brand}>
        Heat Sheet
        <small>{PURDUE_CLASSIC.name}</small>
      </div>
      <TabBar />
      <div class={styles.spacer} />
      <span class={styles.pace}>{statusText(store)}</span>
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
];

/** Bottom tabs on a phone; a menu in the top bar on a wider screen. */
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
