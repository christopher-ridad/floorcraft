# Ballroom Heat Sheet

A phone-first heat sheet for a ballroom team at a competition. Give it the competition schedule and the team's partnerships, and it builds every couple's schedule, tells each dancer who's up next, tracks callbacks round by round, and lets the team fix things when the day doesn't go to plan.

Built for the Purdue Ballroom Classic, with the 2025 schedule as the tentative starting point.

## What it does

- **Now:** your next heat, partner, and how many heats away it is. Below that, the heat on the floor and the team's next heats.
- **Schedule:** three views — **Team Schedule**, **My Schedule**, and **Entire Schedule**. Times re-estimate as the competition runs ahead or behind.
- **Callbacks:** everyone dances the first round. Later rounds are shown as *If called back* (dashed and hatched) until someone records **Called back** or **Not called back**. A switch hides possible-callback heats.
- **Alerts:** a chime (and vibration on Android) when you're a few heats away, and again when you're on deck. Alerts only fire for heats you're confirmed in.
- **Day-of edits:** mark any heat as on the floor, fix a heat's time or name, add or delete heats, rename partners, and add or remove events.
- **Import:** paste the day-of schedule (from the PDF or live.o2cm.com) and the partnerships spreadsheet. Entries are matched to events automatically. Shorthand like `Silver I. Standard (TF)` matches `Silver Intl. Standard (FT)`.

## Project layout

```
index.html                 Built app (open this, or host it)
src/app.html               App UI, styles, and logic
src/parse.js               Schedule/partnership parsing and event matching
build.js                   Inlines parse.js into app.html → index.html
data/                      2025 tentative schedule and 2026 partnerships
test/parse.test.js         Parser and matching tests
```

## Running it

No dependencies. Requires Node 18+ for building and tests.

```sh
npm run build   # regenerate index.html after editing src/
npm test        # check parsing and matching against the sample data
```

Open `index.html` in a browser, or host it anywhere static (GitHub Pages works: Settings → Pages → deploy from the `main` branch root).

## Syncing between phones

The shared version runs as a Claude artifact, which stores the schedule, the floor position, and callbacks in a shared database so every teammate's phone updates within seconds.

Opened on its own (for example from GitHub Pages), the app runs in **this phone only** mode: it works fully, but data is saved in that browser and isn't shared. To load the sample data, go to **Setup** and paste `data/schedule-2025-tentative.txt` and `data/partnerships-2026.txt` into the two import boxes.

Adding a different shared backend (Firebase, Supabase, etc.) means replacing the `db` calls in `boot()` and `persist()` in `src/app.html`. The app reads and writes three documents: `comp/schedule`, `comp/entries`, and `comp/live`.
