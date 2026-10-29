# Ballroom Heat Sheet

A phone-first heat sheet for a ballroom team at a competition. Give it the competition schedule and the team's partnerships, and it builds every couple's schedule, tells each dancer who's up next, tracks callbacks round by round, and lets the team fix things when the day doesn't go to plan.

Built for the Purdue Ballroom Classic, with the 2025 schedule as the tentative starting point.

## What it does

- **Now:** your next heat, partner, and how many heats away it is. Below that, the heat on the floor and the team's next heats.
- **Schedule:** three views — **Team Schedule**, **My Schedule**, and **Entire Schedule**. Times re-estimate as the competition runs ahead or behind.
- **Callbacks:** everyone dances the first round. Later rounds are shown as _If called back_ (dashed and hatched) until someone records **Called back** or **Not called back**. A switch hides possible-callback heats.
- **Alerts:** a chime (and vibration on Android) when you're a few heats away, and again when you're on deck. Alerts only fire for heats you're confirmed in.
- **Day-of edits:** mark any heat as on the floor, fix a heat's time or name, add or delete heats, rename partners, and add or remove events.
- **Import:** paste the day-of schedule (from the PDF or live.o2cm.com) and the partnerships spreadsheet. Entries are matched to events automatically. Shorthand like `Silver I. Standard (TF)` matches `Silver Intl. Standard (FT)`.

## Project layout

A TypeScript + Preact app in four layers:

```
src/domain/        Pure logic: parsing, entry matching, callbacks, pace, alerts
src/app/           Signals store, actions, and the interfaces it needs (ports)
src/infra/         Claude database and localStorage sync, stored format, sound, wake lock
src/ui/            Preact components and CSS modules
src/main.tsx       Wires the browser adapters into the store and renders the app
index.html         Page entry
tests/             Unit and component tests (Vitest)
e2e/               Smoke test against the built file (Playwright)
data/              2025 tentative schedule and 2026 partnerships
```

Layers only depend inward: ui → app → domain, and infra implements the interfaces app defines. ESLint enforces this.

## Running it

Development needs Node 20+.

```sh
npm install
npm run dev        # local dev server with hot reload
npm run build      # build the app into one self-contained file: dist/index.html
npm test           # unit and component tests
npm run test:e2e   # browser smoke test (run npm run build first; npx playwright install chromium once)
npm run check      # lint, formatting, typecheck, tests, and build
```

`dist/index.html` runs straight from disk or any static host.

## Deploying

CI runs every check on pull requests. Each push to `main` that passes is published to GitHub Pages; to turn that on once, go to **Settings → Pages** and set **Source** to **GitHub Actions**.

To update the shared Claude artifact, publish the new `dist/index.html` to the same artifact.

## Syncing between phones

The shared version runs as a Claude artifact, which stores the schedule, the floor position, and callbacks in a shared database so every teammate's phone updates within seconds.

Opened on its own (for example from GitHub Pages), the app runs in **this phone only** mode: it works fully, but data is saved in that browser and isn't shared. To load the sample data, go to **Setup** and paste `data/schedule-2025-tentative.txt` and `data/partnerships-2026.txt` into the two import boxes.

Adding a different shared backend (Firebase, Supabase, etc.) means implementing the small `RawDocumentStore` interface in [src/infra/sync/documentSync.ts](src/infra/sync/documentSync.ts) and connecting it in [browserSyncConnector.ts](src/infra/sync/browserSyncConnector.ts). The app reads and writes three documents: `comp/schedule`, `comp/entries`, and `comp/live`. Each carries a `schemaVersion`; documents written by the original app are still read.
