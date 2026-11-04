import type { InstallPlatform, InstallSupport } from '../../app/ports';

/** Chrome's install prompt event (not in the DOM types yet). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function detectPlatform(): InstallPlatform {
  const agent = navigator.userAgent;
  // iPads report themselves as Macs; touch support gives them away.
  if (/iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  return /Android/.test(agent) ? 'android' : 'other';
}

export function browserInstallSupport(): InstallSupport {
  let deferredPrompt: BeforeInstallPromptEvent | null = null;
  const listeners = new Set<(isAvailable: boolean) => void>();
  const notify = () => listeners.forEach((listener) => listener(!!deferredPrompt));

  window.addEventListener('beforeinstallprompt', (event) => {
    // Show our own install button instead of the browser's mini-bar.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });

  return {
    platform: detectPlatform(),
    isInstalled:
      matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true,
    onPromptAvailable(listener) {
      listeners.add(listener);
      listener(!!deferredPrompt);
      return () => listeners.delete(listener);
    },
    async promptInstall() {
      const prompt = deferredPrompt;
      if (!prompt) return false;
      deferredPrompt = null;
      notify();
      await prompt.prompt();
      return (await prompt.userChoice).outcome === 'accepted';
    },
  };
}
