import type { ComponentChildren } from 'preact';

export function EmptyState({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <div class="empty">
      <b>{title}</b>
      {children}
    </div>
  );
}
