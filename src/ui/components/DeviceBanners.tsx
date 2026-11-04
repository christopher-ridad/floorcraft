import { useEffect, useState } from 'preact/hooks';
import { useApp } from '../context';
import { cx } from '../format';
import styles from './DeviceBanners.module.css';

/** Offers to reload into a new version of the app once it has downloaded. */
export function UpdateBanner() {
  const { device } = useApp();
  const [isReady, setReady] = useState(false);
  useEffect(() => device.updates.onReady(() => setReady(true)), [device]);
  if (!isReady) return null;
  return (
    <div class={styles.update} role="status">
      A new version is ready.
      <button class="btn small" onClick={() => device.updates.apply()}>
        Reload
      </button>
    </div>
  );
}

/** iPhone steps for adding the app to the Home Screen. */
export function IosInstallSteps() {
  return (
    <ol class={styles.steps}>
      <li>
        Tap the <b>Share</b> button (the square with an arrow) in Safari.
      </li>
      <li>
        Choose <b>Add to Home Screen</b>, then <b>Add</b>.
      </li>
      <li>Open Heat Sheet from your Home Screen.</li>
    </ol>
  );
}

/**
 * Suggests installing the app: an install button where the browser offers one (Android), the
 * Home Screen steps on iPhone. Hidden once installed or dismissed.
 */
export function InstallCard({ dismissible = true }: { dismissible?: boolean }) {
  const { device, view } = useApp();
  const { install } = device;
  const [canPrompt, setCanPrompt] = useState(false);
  useEffect(() => install.onPromptAvailable(setCanPrompt), [install]);

  if (install.isInstalled || (dismissible && view.isInstallCardDismissed.value)) return null;
  if (install.platform !== 'ios' && !canPrompt) return null;

  return (
    <div class={cx('card', styles.install)}>
      <b>Install Heat Sheet</b>
      <span class="muted">
        Opens full screen from your home screen, starts even on bad Wi-Fi, and keeps you signed in
        between competitions.
      </span>
      {install.platform === 'ios' ? (
        <IosInstallSteps />
      ) : (
        <div class="row" style={{ marginTop: '10px' }}>
          <button class="btn small primary" onClick={() => void install.promptInstall()}>
            Install app
          </button>
        </div>
      )}
      {dismissible && (
        <div style={{ marginTop: '8px' }}>
          <button class="btn small ghost" onClick={() => view.dismissInstallCard()}>
            Not now
          </button>
        </div>
      )}
    </div>
  );
}
