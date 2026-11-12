# Ballroom Heat Sheet

A phone-first heat sheet for a ballroom team at the **29th Annual Purdue Ballroom Classic** (Saturday, November 14, 2026). The official schedule and the team's partnerships are built in, so it builds every couple's schedule, tells each dancer who's up next, tracks callbacks round by round, and lets the team fix things when the day doesn't go to plan.

The app is made for this one competition only. The schedule and partnerships live in [src/domain/purdue.ts](src/domain/purdue.ts).

## What it does

- **Now:** your next heat, partner, and how many heats away it is. Below that, the heat on the floor and the team's next heats.
- **Schedule:** three views — **Team Schedule**, **My Schedule**, and **Entire Schedule**. Times re-estimate as the competition runs ahead or behind.
- **Callbacks:** everyone dances the first round. Later rounds are shown as _If called back_ (dashed and hatched) until someone records **Called back** or **Not called back**. A switch hides possible-callback heats.
- **Alerts:** a team rule, the same on every phone: get on deck when your heat is about 15 minutes away (by the live estimate), and a second alert when you're up next. Only for heats you're confirmed in. In the app: a chime (and vibration on Android).
- **Push notifications:** the same alerts with the app closed. Each phone turns them on once (**Turn on notifications** on the Now tab); on iPhone the app must first be added to the Home Screen, and the Home Screen app asks for the team link. A Cloud Function ([functions/src](functions/src)) sends them whenever the floor moves and every minute during the competition, once per phone and alert.
- **Day-of edits:** mark any heat as on the floor, fix a heat's time or name, add or delete heats, rename partners, and add or remove events.
- **Schedule:** the official 2026 schedule is loaded when the team is created. **Setup → Schedule** shows whether the schedule is the official one, and loads it over an older one; couples' entries and callbacks stay with their events even where events were renumbered.
- **Partnerships:** the 2026 partnerships sheet is built in too, and matched to events automatically (shorthand like `Silver I. Standard (TF)` matches `Silver Intl. Standard (FT)`). The first time a phone on the team opens the app, it writes the official schedule, roster and entries for everyone, once per version (`OFFICIAL_DATA_VERSION` in [src/domain/purdue.ts](src/domain/purdue.ts)); after that, day-of edits in **Setup → Couples & entries** are kept. To change the built-in data, edit that file and bump the version.

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
```

Layers only depend inward: ui → app → domain, and infra implements the interfaces app defines. ESLint enforces this.

## Running it

Development needs Node 20+, and Java 21+ for the Firebase emulators (firebase-tools refuses older Java). `npm run dev` always talks to the emulators, so start them with `npm run emulators` first; otherwise sign-in fails with "connection refused" on `localhost:9099`.

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

The security rules and the notification function deploy separately (the function needs the project on the Blaze plan):

```sh
npm ci --prefix functions
npx firebase deploy --only firestore:rules,functions --project production
```

## Data and syncing

The team's data lives in Firebase (Cloud Firestore): the roster of dancers and partnerships, and the Purdue Ballroom Classic's schedule, entries, floor position and callbacks. (The storage layout still keeps the competition as its own document under the team, as the design describes.) Every phone sees changes within a second or two. The layout and access rules are in [the design](docs/design/firebase-competitions.md) and [firestore.rules](firestore.rules).

The app reaches the data through the `HeatSheetRepository` interface in [src/app/ports.ts](src/app/ports.ts), implemented for Firestore in [src/infra/firebase/firestoreRepository.ts](src/infra/firebase/firestoreRepository.ts) and for this-phone-only storage in [src/infra/local/localRepository.ts](src/infra/local/localRepository.ts). A whole team can be saved as one JSON backup ([src/app/backup.ts](src/app/backup.ts)); data from the original Claude-artifact version converts to that format with [src/infra/legacy/legacyBackup.ts](src/infra/legacy/legacyBackup.ts).

## Getting in

- **No accounts.** The team link is the key: open it (or paste it on the welcome screen, e.g. in an iPhone Home Screen app), then pick your name.
- **Everyone on the team** gets the full Setup: the team link to share, couples and entries, freeing up names, backups. The rules in [firestore.rules](firestore.rules) keep everything from phones that haven't joined.
- **Captains** (whoever created the team) additionally replace the team link. The team is created once, at the app's address followed by `#setup`.

## Backups and moving data in

Captains can download a backup (the team and the competition, as one JSON file) and restore one in **Setup → Backup**. Restoring adds or replaces everything by id and makes the backup's competition the one everyone sees.

To bring in data from the original Claude-artifact version, export its `comp` documents (`schedule.json`, `entries.json`) into a folder, convert them, then restore the result:

```sh
npm run convert:legacy -- <export-folder> purdue-backup.json
```

After restoring it, load the official schedule in **Setup → Schedule**.

## Trying it locally

`npm run emulators` starts local Firebase, and `npm run dev` serves the app against it. Open it with `#setup` at the end of the address and create the team; the official schedule and everyone's dances come with it. Copy the team link from **Setup**. Open the team link in another browser to join as a teammate.
