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
npm run test:e2e       # builds for the emulators and runs browser tests against them (npx playwright install chromium once)
npm run check          # lint, formatting, typecheck, tests, and build
```

The data model and access rules are described in [docs/design/firebase-competitions.md](docs/design/firebase-competitions.md); the rules themselves are in [firestore.rules](firestore.rules).

`dist/index.html` runs straight from disk or any static host.

## Deploying

CI runs every check on pull requests. Each push to `main` that passes is published to GitHub Pages; to turn that on once, go to **Settings → Pages** and set **Source** to **GitHub Actions**.

## Data and syncing

The team's data lives in Firebase (Cloud Firestore): a permanent roster of dancers and partnerships, and one active competition at a time with its schedule, entries, floor position and callbacks. Every phone sees changes within a second or two. The layout and access rules are in [the design](docs/design/firebase-competitions.md) and [firestore.rules](firestore.rules).

The app reaches the data through the `HeatSheetRepository` interface in [src/app/ports.ts](src/app/ports.ts), implemented for Firestore in [src/infra/firebase/firestoreRepository.ts](src/infra/firebase/firestoreRepository.ts) and for this-phone-only storage in [src/infra/local/localRepository.ts](src/infra/local/localRepository.ts). A whole team can be saved as one JSON backup ([src/app/backup.ts](src/app/backup.ts)); data from the original Claude-artifact version converts to that format with [src/infra/legacy/legacyBackup.ts](src/infra/legacy/legacyBackup.ts).

## Getting in

- **Captains** sign in with Google. The first Google account to open the app can create the team and becomes its captain.
- **Teammates** open the team link the captain shares (**Setup → Team link**), then pick their name. No account needed; a teammate can optionally link a Google account to keep their spot on any device.
- **Setup** shows only this phone's settings to teammates; captains also get the team link, the schedule, and couples. The rules in [firestore.rules](firestore.rules) enforce this on the server.

## Installing on a phone

Heat Sheet installs as an app from the browser: on Android, **Install app** (Chrome offers it, and the app shows a button); on iPhone, Safari's **Share → Add to Home Screen**. Installed, it opens full screen, starts offline from a saved copy, and on iPhone stays signed in between competitions.

On iPhone, the Home Screen app has its own storage, separate from Safari. A team link opened in Safari therefore asks to install first, then join from the app with the **team code** (shown with the team link in Setup).

New versions load automatically when online; an app left open during a release offers **Reload**.

## Backups and moving data in

Captains can download a backup (the team and the active competition, as one JSON file) and restore one in **Setup → Backup**. Restoring adds or replaces everything by id and makes the backup's competition the one everyone sees.

To bring in data from the original Claude-artifact version, export its `comp` documents (`schedule.json`, `entries.json`) into a folder, convert them, then restore the result:

```sh
npm run convert:legacy -- <export-folder> purdue-backup.json --name "Purdue Ballroom Classic" --date 2026-11-14
```

## Trying it locally

`npm run emulators` starts local Firebase, and `npm run dev` serves the app against it. Sign in as captain with the emulator's fake Google sign-in, create the team, then paste `data/schedule-2025-tentative.txt` and `data/partnerships-2026.txt` into **Setup**. Open the team link in another browser to join as a teammate.
