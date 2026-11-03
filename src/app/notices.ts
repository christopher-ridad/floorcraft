import type { Alert } from '../domain/alerts';
import type { SyncErrorCode } from './ports';

/** One-off messages for the user. The UI decides how to word and show them. */
export type Notice =
  | { kind: 'alert'; alert: Alert }
  | { kind: 'save-failed'; code: SyncErrorCode; detail: string }
  | { kind: 'wake-lock-refused' };

export type NoticeListener = (notice: Notice) => void;

export class NoticeChannel {
  private readonly listeners = new Set<NoticeListener>();

  subscribe(listener: NoticeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(notice: Notice): void {
    for (const listener of this.listeners) listener(notice);
  }
}
