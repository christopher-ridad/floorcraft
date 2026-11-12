# Design: Firebase, competitions, and team access

Status: agreed · 2026-11-02 · Purdue (Nov 14) runs on Firebase

> **Update, 2026-11-11: Purdue only.** The app is now specific to the Purdue Ballroom Classic. The official 2026 schedule is built in ([src/domain/purdue.ts](../../src/domain/purdue.ts)) and replaces schedule pasting; team creation sets up that one competition; competition creation and archiving, the general schedule parser, the event review flag, and the after-Purdue milestones 6 and 7 are dropped. The Firestore layout and rules below are unchanged, so existing data needs no migration: the competition is still one document under `competitions/`, pointed to by `activeCompetitionId`. Sections below that describe the dropped features are kept as history.
>
> **Update, 2026-11-12: no accounts.** Google sign-in is removed. The team link is the only key: every phone that joins with it can set everything up; captains (the team's creator) only replace the join code. The team is created once at `#setup`.

## Summary

Move the heat sheet from the Claude artifact database to Firebase, and from "one competition, pasted from a spreadsheet" to "one team, one active competition at a time." The captain signs in with Google and sets up each competition. Teammates join with a link, pick their name once, and can then move the floor and record callbacks. The app is hosted on GitHub Pages.

### Goals

- Shared, live data that doesn't require a Claude account.
- The team roster (dancers and partnerships) carries over between competitions; each competition has its own schedule, entries, floor position and callbacks.
- Setup works for any competition's schedule, not just Purdue's naming.
- Captain-only setup, enforced by the server.
- Each phone is linked to a dancer, so the app knows who is acting.
- Keeps working through poor venue Wi-Fi.
- Fixes the five known bugs (see [Bug fixes](#bug-fixes-folded-in)).

### Non-goals

- More than one team per deployment.
- Multi-day competitions. All of the team's competitions are one day.
- Scraping schedules from o2cm or elsewhere. The captain pastes them.
- ~~Push notifications when the app is closed.~~ Added 2026-11-12: web push through Firebase Cloud Messaging, sent by a Cloud Function (`functions/`); tokens in `teams/{t}/pushTokens/{uid}`, sent notifications in `competitions/{c}/pushSent/{uid}_{heatId}:{type}`.

## Who uses it

| Role                      | How they get in                                                           | Can do                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Captain** (one or more) | Google sign-in, listed in the team's `captainUids`                        | Everything: team roster, competitions, schedules, entries, join link, removing phones, adding and removing captains |
| **Member**                | Opens the join link, picks their name; may optionally sign in with Google | Read everything; move the floor; record callbacks                                                                   |
| **Anyone else**           | —                                                                         | Nothing. Data is not readable without membership.                                                                   |

## Data model (Firestore)

```
teams/{teamId}
  name, captainUids[], activeCompetitionId, createdAt

teams/{teamId}/private/join                    { code }                       captains only
teams/{teamId}/members/{uid}                   { dancerId | null, provider: 'anonymous' | 'google',
                                                 joinedAt, joinCode }
teams/{teamId}/claims/{dancerId}               { uid }                        one phone per dancer
teams/{teamId}/dancers/{dancerId}              { name, active }
teams/{teamId}/partnerships/{partnershipId}    { leadId, followId, active }

teams/{teamId}/competitions/{competitionId}
  name, date, status: 'setup' | 'active' | 'archived', createdAt

  .../schedule/current                         { items: ScheduleItem[], events: { [eventId]: EventDetails } }
  .../entries/{partnershipId}                  { eventIds: string[] }
  .../live/floor                               { currentItemId, currentSetAt, updatedBy, updatedAt }
  .../callbacks/{partnershipId}_{eventId}      { reachedRound, eliminated, updatedBy, updatedAt }
```

Notes:

- **One team per deployment.** `teamId` is set in the app's config. It's still in the path, so the layout stays clean if that ever changes.
- **Dancers and partnerships are separate documents.** A rename is one edit, and entries link to a partnership, not to names.
- **Events get a stable `eventId`** that is separate from the printed event number. Heats in the schedule reference it. If a re-pasted schedule renumbers events, ids carry over by matching event details, so entries and callbacks stay attached (bug 2).
- **`EventDetails`**: `{ eventId, eventNumber, name, level, style, dances[], confirmed }`. `confirmed` is set when the captain reviews the event.
- **The schedule is one document.** About 150 lines is roughly 20 KB, well under Firestore's 1 MB document limit, and it's only written during setup.
- **One document per callback mark**, so two people recording at the same time never overwrite each other (bug 1).
- **The floor document stores the absolute current item**, never "advance by one." Two people tapping "Next heat is up" at once both write the same value, so the floor can't skip a heat.

## Access rules (sketch)

```
function team(t)       { return get(/databases/$(database)/documents/teams/$(t)).data; }
function signedIn()    { return request.auth != null; }
function isCaptain(t)  { return signedIn() && request.auth.uid in team(t).captainUids; }
function isMember(t)   { return signedIn() && exists(/databases/$(database)/documents/teams/$(t)/members/$(request.auth.uid)); }
function canRead(t)    { return isCaptain(t) || isMember(t); }
function isGoogle()    { return request.auth.token.firebase.sign_in_provider == 'google.com'; }

match /teams/{t} {
  allow read:   if canRead(t);
  // First run only: whoever creates the team becomes its captain (must be a Google account).
  allow create: if signedIn() && isGoogle() && request.resource.data.captainUids == [request.auth.uid];
  // Captains edit the team, including who the captains are, but can't remove the last one.
  allow update: if isCaptain(t) && request.resource.data.captainUids.size() > 0;

  match /private/join          { allow read, write: if isCaptain(t); }

  match /members/{uid} {
    allow read:   if canRead(t);
    // Joining: your own document, with the current join code.
    allow create: if signedIn() && request.auth.uid == uid
                  && request.resource.data.joinCode == get(/databases/$(database)/documents/teams/$(t)/private/join).data.code;
    // Linking yourself to a dancer you've claimed; captains can change anything.
    allow update: if isCaptain(t) || (request.auth.uid == uid
                  && getAfter(/databases/$(database)/documents/teams/$(t)/claims/$(request.resource.data.dancerId)).data.uid == uid);
    allow delete: if isCaptain(t) || request.auth.uid == uid;
  }

  // `create` only succeeds when the document doesn't exist, so a dancer can only be claimed once.
  match /claims/{dancerId} {
    allow read:   if canRead(t);
    allow create: if isMember(t) && request.resource.data.uid == request.auth.uid;
    allow delete: if isCaptain(t) || resource.data.uid == request.auth.uid;
  }

  match /dancers/{id}           { allow read: if canRead(t); allow write: if isCaptain(t); }
  match /partnerships/{id}      { allow read: if canRead(t); allow write: if isCaptain(t); }

  match /competitions/{c} {
    allow read: if canRead(t); allow write: if isCaptain(t);
    match /schedule/{doc}       { allow read: if canRead(t); allow write: if isCaptain(t); }
    match /entries/{p}          { allow read: if canRead(t); allow write: if isCaptain(t); }
    // Live tracking: any member, and they must sign their writes.
    match /live/{doc}           { allow read: if canRead(t);
                                  allow write: if canRead(t) && request.resource.data.updatedBy == request.auth.uid; }
    match /callbacks/{key}      { allow read: if canRead(t);
                                  allow write: if canRead(t) && request.resource.data.updatedBy == request.auth.uid;
                                  allow delete: if canRead(t); }
  }
}
```

The rules live in the repo as `firestore.rules` and are covered by tests run against the Firebase emulator (`@firebase/rules-unit-testing`): for example, a member can't edit the schedule, a wrong join code can't join, and a dancer can't be claimed twice.

The team-creation rule only matters once. After you've created the team, any later attempt fails because the document already exists.

## Sign-in and joining

**Captain.** Signs in with Google (popup, with a redirect fallback for browsers that block popups). On first run the app offers "Create team," which makes you the captain.

**Joining.** The captain shares `https://<pages-url>/#join=CODE`. On open, the app:

1. signs the phone in anonymously,
2. creates its member document with the code (the rules check it),
3. removes the code from the address bar,
4. shows the roster: "Who are you?"

Picking a name claims that dancer, and alerts are set up for them right away. A name already linked to another phone shows as taken; only the captain can release it.

**Optional Google sign-in for members.** A "Keep my identity across devices" button links the anonymous account to Google, keeping the same user id. If that Google account is already used on another phone, the app signs into it and moves the membership over.

**Removing a phone.** The captain deletes its member document and claim. That phone's live updates fail with permission-denied, and the app shows "You've been removed from the team. Ask your captain for the join link."

**Co-captains.** A captain can make any member who has signed in with Google a captain, and can remove a captain. Anonymous members have to sign in with Google first, so every captain is a real account. The app won't remove the last captain, and the rules enforce that too.

**Changing the join code.** The captain generates a new code. Phones that already joined stay; the old link stops working.

**Staying signed in.** Firebase keeps the session in the browser. Safari on iPhone deletes site data after 7 days without a visit unless the app is added to the Home Screen. With one competition per quarter, most iPhone users would rejoin each time (open the link, tap their name). The app will suggest "Add to Home Screen" after joining.

## Captain setup flow

1. **Team.** Add dancers and partnerships, or paste the partnerships spreadsheet to create them. Edited in the app from then on; CSV export keeps the spreadsheet in sync if you still want it.
2. **New competition.** Name and date. Status is `setup`, so members don't see it yet.
3. **Schedule.** Paste the heat list. Each event is read into level, style, dances and round, then shown on a **review screen** with anything unclear flagged. Re-pasting an updated schedule shows what changed: added, removed and renumbered events.
4. **Entries.** For each partnership, pick events from this competition's event list. "Suggest from last competition" fills in events with the same level, style and dances as last time, for you to review. Pasting from a spreadsheet goes through the same matching and review.
5. **Make active.** The previous active competition is archived, and the team now sees this one.
6. **Competition day.** Everyone moves the floor and records callbacks. You can still fix schedule lines.

Archived competitions are read-only under **Setup → Past competitions**.

## Reading any competition's schedule

Schedule parsing becomes general instead of tied to Purdue:

- **Lines:** a time, then an optional event number (`[12]`, `12`, `#12`), then the event name. Breaks and section headings are kept as labels.
- **Event names** are broken into parts using dictionaries of the usual spellings:
  - level: Newcomer, Bronze, Silver, Gold, Novice, Pre-Champ, Champ, Open, Syllabus
  - style: Amer./American Smooth and Rhythm, Intl./International Standard and Latin
  - dances: W, T, F, V, Q, C, R, S, J, P, B, M, Swing, plus full names
  - round: 1st/2nd round, Quarter, Semi, Final
- **Anything the parser isn't sure about** is flagged on the review screen and fixed with a tap. Unusual combinations (a Waltz/Tango event, say) are just that competition's events.
- **Tests** use real schedules from several competitions, which I still need from you, alongside Purdue 2025.

## Offline and unreliable Wi-Fi

- Firestore's persistent local cache keeps the last data on the phone and queues writes while offline. They sync when the connection returns.
- The top bar shows a small "Offline — changes will sync" status.
- Callbacks are separate documents and the floor position is written as an absolute value, so syncing after being offline can't lose other people's marks.

## Bug fixes folded in

| #   | Bug                                                               | Fix                                                                                                                                                                |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Simultaneous callback edits overwrite each other                  | One document per callback mark                                                                                                                                     |
| 2   | A renumbered schedule moves callback marks to the wrong events    | Stable `eventId`s, carried over on re-import                                                                                                                       |
| 3   | Multi-day handling (10-hour rule, Sunday special case)            | Single-day by design: drop the Sunday case; ignore a floor time set on a different day                                                                             |
| 4   | "On the floor now" shows for a heat you only dance if called back | Only confirmed heats count                                                                                                                                         |
| 5   | A pending callback keeps asking after the next round has passed   | Keep asking, by design, but mark it **overdue** once the next round has started and list overdue ones first, so it's clear the answer is late rather than upcoming |

## Architecture changes

The layers stay the same; the content changes.

- **Domain:** add `Dancer`, `Partnership`, `Competition` and `EventDetails`. `Couple` becomes a partnership plus its names. Entries and callbacks are keyed by `eventId`. Add the general event-name parser and the "suggest from last competition" matcher.
- **App:** a session store (auth state, membership, role), a team store and an active-competition store. The ports become repositories (`TeamRepository`, `CompetitionRepository`) and an `AuthService`.
- **Infra:** `infra/firebase/` with the app config, auth and Firestore repositories. The Claude-database and localStorage sync backends are removed.
- **UI:** join flow, captain sign-in, team editor, competition list, schedule review, entries editor. Setup only shows for captains.
- **Development and tests:** the Firebase Local Emulator Suite for development, rules tests and the Playwright smoke test (in CI too), so tests never touch real data.
- **Bundle:** the Firebase SDK grows the page from about 30 KB to about 230 KB gzipped (measured), downloaded once and then cached.

## Moving the existing data

1. I export the current data from the Claude artifact database to a JSON file.
2. A one-time conversion turns it into the new shape:
   - couples become dancers and partnerships
   - entries become event picks
   - the schedule becomes the competition **Purdue Ballroom Classic, November 14, 2026**: active if it hasn't happened yet, archived if it has
   - the floor position and callback marks are dropped. Before the competition they're only test data, and afterwards they're no longer needed.
3. You import the file from **Setup → Import backup**, which stays useful as a general backup and restore.
4. The Claude artifact can then be retired.

## What you'll need to do in Firebase

I'll write step-by-step instructions when we get there:

1. Create a Firebase project (free Spark plan, no card).
2. Add a web app and send me its config. It isn't secret; it's meant to sit in the page.
3. Create the Firestore database in production mode, in a US region.
4. In Authentication, turn on **Google** and **Anonymous**, and add the GitHub Pages domain to the authorized domains.
5. Deploy `firestore.rules`, either by pasting into the console or with the Firebase CLI. CI deployment can come later.

## Milestones

Purdue (November 14) runs on Firebase, so the work is split into what competition day needs and what can follow.

### Before Purdue

| #   | Milestone                                                                                                                                                                                                      | Target    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1   | **Foundation:** Firebase SDK and config, emulator, auth service, `firestore.rules` with tests                                                                                                                  | Nov 4     |
| 2   | **Data model and migration:** dancers, partnerships, competitions, `eventId`s, one document per callback; Firestore repositories; import of the current Purdue data                                            | Nov 6     |
| 3   | **Access:** captain Google sign-in, team creation, join link, name claiming; Setup only for captains                                                                                                           | Nov 8     |
| 4   | **Setup for this competition:** the existing schedule paste and couples editor moved onto the new model, so re-pasting the day-of schedule keeps entries and callbacks attached; bug fixes 3–5; offline status | Nov 9     |
| 5   | **Go live:** deploy the rules, publish to GitHub Pages, migrate the data, team dry run on real phones, fix what it finds                                                                                       | Nov 10–12 |

**Freeze on November 12:** after that, only fixes for problems that would break competition day.

### After Purdue

6. Schedule review screen and the general event-name parser, tested with other competitions' schedules.
7. "Suggest from last competition," past competitions view, CSV export.
8. Member management screen (see and remove phones), co-captain screen, optional Google sign-in for members, "Add to Home Screen" prompt. Until then, captains can do these in the Firebase console if needed.
9. Retire the Claude artifact.

Each milestone is its own pull request, with CI passing.

## Timeline and fallback

- **The Claude artifact stays as it is until after November 14** as a backup. If the Firebase version has trouble on the day, the team switches to the old link.
- To keep the backup usable, the day-of schedule is pasted into both apps.
- **The team dry run (November 10–12)** has several teammates join on their own phones, move the floor and record callbacks at the same time. It's the real test of joining, sync and the rules.

## Decisions

1. **Migrated competition:** Purdue Ballroom Classic, November 14, 2026.
2. **Co-captains:** yes. Captains can add and remove captains, but not the last one.
3. **Bug 5:** keep asking for missed callbacks, marked overdue.
4. **Sample schedules:** not yet available. Milestone 4 adds tests as they arrive.
