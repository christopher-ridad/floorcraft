import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const { buildHtml } = createRequire(import.meta.url)('../../build.js') as {
  buildHtml(): string;
};

export interface LegacyState {
  heats: object[];
  couples: object[];
  live?: { currentId: string | null; setAt: number | null; calls: object };
}

export interface LegacyAppOptions {
  state: LegacyState;
  prefs?: Record<string, unknown>;
  /** Wall-clock time the page sees for `Date.now()` and `new Date()`. */
  now: Date;
}

export interface LegacyApp {
  /** Evaluates an expression against the page's top-level scope (S, D, prefs, functions). */
  run<T = unknown>(expression: string): T;
  /** Text of the toast currently shown, if any. Clears it so the next read starts fresh. */
  takeToast(): string | null;
  close(): void;
}

/**
 * Loads the built legacy page in jsdom in "this phone only" mode, seeded through localStorage,
 * so tests can exercise the real app logic without changing it.
 */
export async function loadLegacyApp({ state, prefs, now }: LegacyAppOptions): Promise<LegacyApp> {
  const dom = new JSDOM(buildHtml(), {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      const fixedNow = now.getTime();
      const RealDate = window.Date;
      class FixedDate extends RealDate {
        constructor(...args: unknown[]) {
          if (args.length === 0) super(fixedNow);
          else super(...(args as [number]));
        }
        static override now() {
          return fixedNow;
        }
      }
      window.Date = FixedDate as DateConstructor;
      window.scrollTo = () => {};
      window.HTMLElement.prototype.scrollIntoView = () => {};
      window.localStorage.setItem('hs:local', JSON.stringify(state));
      window.localStorage.setItem('hs:prefs', JSON.stringify(prefs ?? {}));
    },
  });
  const { window } = dom;
  const evaluate = (window as unknown as { eval(code: string): unknown }).eval;

  // boot() awaits the (missing) shared database, then falls back to local mode.
  await new Promise((resolve) => setTimeout(resolve, 0));

  return {
    run: <T>(expression: string) => evaluate(expression) as T,
    takeToast() {
      const toast = window.document.querySelector('.toast');
      toast?.remove();
      return toast?.textContent ?? null;
    },
    close: () => window.close(),
  };
}
