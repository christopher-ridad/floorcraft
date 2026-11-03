import type { ComponentChildren } from 'preact';
import { useApp } from '../context';

interface EmptyStateProps {
  title: string;
  children: ComponentChildren;
  /** Offer a button to the Setup tab. */
  linkToSetup?: boolean;
}

export function EmptyState({ title, children, linkToSetup = false }: EmptyStateProps) {
  const { view } = useApp();
  return (
    <div class="empty">
      <b>{title}</b>
      {children}
      {linkToSetup && (
        <div style={{ marginTop: '14px' }}>
          <button class="btn primary" onClick={() => view.showTab('setup')}>
            Open Setup
          </button>
        </div>
      )}
    </div>
  );
}

/** Shown on tabs that need a schedule before there is one. */
export function NoSchedule() {
  const { loaded } = useApp().store;
  return loaded.value.schedule ? (
    <EmptyState title="No schedule yet" linkToSetup>
      Paste the heat list in Setup to build everyone's schedule.
    </EmptyState>
  ) : (
    <EmptyState title="Loading the schedule">
      Connecting to the team's shared heat sheet.
    </EmptyState>
  );
}
