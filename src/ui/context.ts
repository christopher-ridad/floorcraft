import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { minutesSinceMidnight } from '../domain/clock';
import type { AppStore } from '../app/store';
import type { ViewState } from './viewState';

export interface AppContextValue {
  store: AppStore;
  view: ViewState;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <App>');
  return value;
}

/** The time of day in minutes, refreshed every 20 seconds for "in ~N min" countdowns. */
export function useMinuteOfDay(refreshMs = 20_000): number {
  const [minute, setMinute] = useState(() => minutesSinceMidnight(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setMinute(minutesSinceMidnight(new Date())), refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs]);
  return minute;
}
