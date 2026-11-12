import { ON_DECK_MINUTES } from '../../domain/alerts';
import { useApp } from '../context';

/**
 * Turning on notifications for when the app is closed, or what's in the way. With `onlyIfNeeded`,
 * shows nothing once they're on (or can't be had on this phone).
 */
export function NotificationsCard({ onlyIfNeeded = false }: { onlyIfNeeded?: boolean }) {
  const { session } = useApp();
  const status = session.pushStatus.value;
  if (onlyIfNeeded && (status === 'on' || status === 'unavailable')) return null;

  switch (status) {
    case 'on':
      return (
        <div class="card">
          <b class="ok">Notifications are on.</b>{' '}
          <span class="muted">
            This phone is told to get on deck about {ON_DECK_MINUTES} minutes before each heat, even
            with the app closed.
          </span>
        </div>
      );
    case 'off':
      return (
        <div class="card stack">
          <span>
            <b>Get told when to be on deck,</b> even with the app closed: about {ON_DECK_MINUTES}{' '}
            minutes before each heat, and again when you're up next.
          </span>
          <div>
            <button class="btn primary" onClick={() => void session.actions.turnOnNotifications()}>
              Turn on notifications
            </button>
          </div>
        </div>
      );
    case 'install-first':
      return (
        <div class="card stack">
          <b>Get told when to be on deck, even with the app closed</b>
          <span class="muted">On iPhone, notifications need the app on your Home Screen:</span>
          <ol>
            <li>
              Tap <b>Share</b> (the square with an arrow), then <b>Add to Home Screen</b>.
            </li>
            <li>
              Open <b>Heat Sheet</b> from your Home Screen. Paste the team link if it asks, and pick
              your name.
            </li>
            <li>
              Tap <b>Turn on notifications</b> there, then <b>Allow</b>.
            </li>
          </ol>
        </div>
      );
    case 'blocked':
      return (
        <div class="card stack">
          <b>Notifications are blocked on this phone</b>
          <span class="muted">
            To be told when to be on deck, allow notifications for Heat Sheet in your phone's
            Settings (on iPhone: Settings → Notifications → Heat Sheet), then reopen the app.
          </span>
        </div>
      );
    case 'unavailable':
      return (
        <div class="card muted">
          This browser can't show notifications while the app is closed. Keep the app open with the
          screen awake, and it will chime when it's time to get on deck.
        </div>
      );
  }
}
