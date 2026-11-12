# Purdue Classic Heat Sheet

A simple website for the team at the **29th Annual Purdue Ballroom Classic** (Saturday, November 14, 2026). Anyone with the link can open it, on a phone or a computer; there are no accounts.

## What it shows

- **Now:** your next heat and partner (pick your name once; it's remembered on that device), what the posted schedule says is on the floor, and the team's next heats. On competition day "now" follows the clock and the posted times; the real floor may run behind.
- **Schedule:** **Team Schedule**, **My Schedule** and **Entire Schedule**.
- **People:** each dancer's heats.
- **Rounds:** every round of a couple's events is listed. Later rounds are marked _If called back_; callbacks themselves aren't tracked, so check the posted callback lists.

Phones get bottom tabs; wider screens get the tabs in the top bar and a wider page.

## The data

The official schedule and the team's partnerships are built in, in [src/domain/purdue.ts](src/domain/purdue.ts). To change them, edit that file and push. Partnership shorthand like `Silver I. Standard (TF)` is matched to `Silver Intl. Standard (FT)` automatically, and a test checks that every entry matches an event.

## Project layout

```
src/domain/   Pure logic: the built-in data, schedule parsing, entry matching, rounds, times
src/app/      A small store: the schedule with "now" placed by the clock, and this device's settings
src/infra/    Browser storage for those settings
src/ui/       Preact components and CSS modules
tests/        Unit and component tests (Vitest)
```

Layers only depend inward: ui → app → domain, and infra implements what app needs. ESLint enforces this.

## Running it

Needs Node 20+.

```sh
npm install
npm run dev     # local dev server with hot reload
npm test        # unit and component tests
npm run check   # lint, formatting, typecheck, tests, and build
npm run build   # one self-contained file: dist/index.html
```

## Publishing

Each push to `main` that passes CI is published to GitHub Pages: https://christopher-ridad.github.io/floorcraft/
