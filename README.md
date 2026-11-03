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

Development needs Node 20+, and Java 11+ for the Firebase emulators.

```sh
npm install
npm run dev            # local dev server with hot reload
npm run emulators      # local Firebase (Auth + Firestore) with its UI at http://localhost:4000
npm run build          # build the app into one self-contained file: dist/index.html
npm test               # unit and component tests
npm run test:emulator  # Firestore security rules and Firebase integration tests (starts the emulators)
npm run test:e2e       # browser smoke test (run npm run build first; npx playwright install chromium once)
npm run check          # lint, formatting, typecheck, tests, and build
```

The data model and access rules are described in [docs/design/firebase-competitions.md](docs/design/firebase-competitions.md); the rules themselves are in [firestore.rules](firestore.rules).

`dist/index.html` runs straight from disk or any static host.

## Deploying

CI runs every check on pull requests. Each push to `main` that passes is published to GitHub Pages; to turn that on once, go to **Settings → Pages** and set **Source** to **GitHub Actions**.

## Data and syncing

The team's data lives in Firebase (Cloud Firestore): a permanent roster of dancers and partnerships, and one active competition at a time with its schedule, entries, floor position and callbacks. Every phone sees changes within a second or two. The layout and access rules are in [the design](docs/design/firebase-competitions.md) and [firestore.rules](firestore.rules).

The app reaches the data through the `HeatSheetRepository` interface in [src/app/ports.ts](src/app/ports.ts), implemented for Firestore in [src/infra/firebase/firestoreRepository.ts](src/infra/firebase/firestoreRepository.ts) and for this-phone-only storage in [src/infra/local/localRepository.ts](src/infra/local/localRepository.ts). A whole team can be saved as one JSON backup ([src/app/backup.ts](src/app/backup.ts)); data from the original Claude-artifact version converts to that format with [src/infra/legacy/legacyBackup.ts](src/infra/legacy/legacyBackup.ts).

Until sign-in is wired in, the app runs on this-phone-only storage. To load the sample data, go to **Setup** and paste `data/schedule-2025-tentative.txt` and `data/partnerships-2026.txt` into the two import boxes.
