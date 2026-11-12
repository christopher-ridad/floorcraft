import { computed, effect, signal } from '@preact/signals-core';
import { dancerName } from '../domain/dancers';
import { OFFICIAL_DATA_VERSION } from '../domain/purdue';
import { generateJoinCode } from './joinCode';
import {
  AuthFailure,
  type AccessRepository,
  type AuthService,
  type AuthUser,
  type PushNotifications,
  type PushStatus,
  type TeamAccess,
} from './ports';
import type { AppStore } from './store';

/**
 * Where this phone is on the way into the team:
 * - `loading`: working out who is signed in and what they can see.
 * - `signed-out`: nobody is signed in and there's no join link.
 * - `joining`: using a join link.
 * - `join-failed`: the join link didn't work.
 * - `not-member`: signed in, but not on the team (a Google account can create the team here).
 * - `choose-dancer`: on the team; picking which dancer this phone belongs to.
 * - `ready`: in.
 */
export type SessionPhase =
  'loading' | 'signed-out' | 'joining' | 'join-failed' | 'not-member' | 'choose-dancer' | 'ready';

/** Something the person tried that didn't work; the UI words it. */
export type SessionProblem =
  'sign-in-failed' | 'team-exists' | 'dancer-taken' | 'notifications-refused' | 'network';

export interface SessionDependencies {
  auth: AuthService;
  access: AccessRepository;
  store: AppStore;
  /** The code from a join link this page was opened with, if any. */
  joinCode: string | null;
  /** Called once the join code has been used, so the link can be cleared from the address bar. */
  onJoinCodeUsed(): void;
  createJoinCode?: () => string;
  /** Notifications while the app is closed. Without it, they're unavailable. */
  push?: PushNotifications;
}

const NO_PUSH: PushNotifications = {
  status: () => 'unavailable',
  getToken: () => Promise.reject(new Error('Notifications are unavailable here.')),
};

export type Session = ReturnType<typeof createSession>;
export type SessionActions = Session['actions'];

/** The code in a team link (`…#join=CODE`), or a bare code. Null when there's none. */
export function joinCodeFromLink(text: string): string | null {
  const trimmed = text.trim();
  const fromLink = /#join=([^&\s]+)/.exec(trimmed)?.[1];
  if (fromLink) return decodeURIComponent(fromLink);
  return /^[\w-]{4,}$/.test(trimmed) ? trimmed : null;
}

const problemFor = (error: unknown): SessionProblem => {
  if (error instanceof AuthFailure) return 'sign-in-failed';
  return 'network';
};

export function createSession(deps: SessionDependencies) {
  const { auth, access, store } = deps;
  const createJoinCode = deps.createJoinCode ?? (() => generateJoinCode());
  const push = deps.push ?? NO_PUSH;
  const pushStatus = signal<PushStatus>(push.status());

  const user = signal<AuthUser | null | undefined>(undefined);
  const teamAccess = signal<TeamAccess | undefined>(undefined);
  const joinState = signal<'idle' | 'joining' | 'failed'>(deps.joinCode ? 'joining' : 'idle');
  const claims = signal<Record<string, string>>({});
  const joinCode = signal<string | null>(null);
  const problem = signal<SessionProblem | null>(null);
  /** Set while the person is changing which dancer they are. */
  const isChoosingDancer = signal(false);
  let pendingJoinCode = deps.joinCode;

  const membership = computed(() =>
    teamAccess.value?.kind === 'team' ? teamAccess.value.membership : null,
  );
  const isCaptain = computed(() => teamAccess.value?.kind === 'team' && teamAccess.value.isCaptain);
  /** Everyone on the team sets things up: the team link is the only key. */
  const canSetUp = computed(() => teamAccess.value?.kind === 'team');

  const phase = computed<SessionPhase>(() => {
    if (joinState.value === 'joining') return 'joining';
    if (joinState.value === 'failed') return 'join-failed';
    if (user.value === undefined) return 'loading';
    if (user.value === null) return 'signed-out';
    const current = teamAccess.value;
    if (!current) return 'loading';
    if (current.kind === 'none') return 'not-member';
    if (!current.membership) return 'loading';
    if (isChoosingDancer.value) return 'choose-dancer';
    const skipped = store.preferences.value.skipDancerClaim;
    return current.membership.dancerId || skipped ? 'ready' : 'choose-dancer';
  });

  const stops: (() => void)[] = [];
  let stopTeamWatchers: (() => void)[] = [];
  let stopAccess: (() => void) | null = null;

  function stopWatchingTeam() {
    stopTeamWatchers.forEach((stop) => stop());
    stopTeamWatchers = [];
    store.dispose();
    claims.value = {};
    joinCode.value = null;
  }

  function useJoinCode(): string | null {
    const code = pendingJoinCode;
    if (code) {
      pendingJoinCode = null;
      deps.onJoinCodeUsed();
    }
    return code;
  }

  async function joinWith(signedIn: AuthUser, code: string) {
    joinState.value = 'joining';
    try {
      await access.join(signedIn.uid, code, signedIn.isAnonymous ? 'anonymous' : 'google');
      joinState.value = 'idle';
      watchAccess(signedIn);
    } catch {
      joinState.value = 'failed';
    }
  }

  function onAccess(signedIn: AuthUser, next: TeamAccess) {
    teamAccess.value = next;
    if (next.kind === 'none') {
      stopWatchingTeam();
      const code = useJoinCode();
      if (code) void joinWith(signedIn, code);
      else if (joinState.peek() === 'joining') joinState.value = 'idle';
      return;
    }

    // Already on the team: a join link has nothing left to do.
    useJoinCode();
    joinState.value = 'idle';
    if (!stopTeamWatchers.length) {
      store.start();
      stopTeamWatchers.push(access.watchClaims((value) => (claims.value = value)));
      stopTeamWatchers.push(access.watchJoinCode((value) => (joinCode.value = value)));
    }
    if (next.isCaptain && !next.membership) {
      access.joinAsCaptain(signedIn.uid).catch(() => (problem.value = 'network'));
    }
  }

  function watchAccess(signedIn: AuthUser) {
    stopAccess?.();
    stopAccess = access.watchAccess(signedIn.uid, (next) => onAccess(signedIn, next));
  }

  function onUserChange(next: AuthUser | null) {
    stopAccess?.();
    stopAccess = null;
    stopWatchingTeam();
    teamAccess.value = undefined;
    user.value = next;
    if (next) {
      watchAccess(next);
    } else if (pendingJoinCode) {
      joinState.value = 'joining';
      auth.signInAnonymously().catch(() => (joinState.value = 'failed'));
    }
  }

  /** Alerts follow the dancer this phone belongs to, unless the person picked someone else. */
  function followClaimedDancer() {
    return effect(() => {
      const dancerId = membership.value?.dancerId;
      const dancer = store.team.value.dancers.find((candidate) => candidate.id === dancerId);
      if (dancer && !store.preferences.peek().dancer) {
        store.actions.updatePreferences({ dancer: dancerName(dancer.name) });
      }
    });
  }

  /**
   * When a phone on the team finds the competition behind the built-in schedule and partnerships,
   * it writes them, once per version, so every phone shows the team's dances with nothing to paste.
   */
  function applyOfficialDataOnce() {
    let appliedTo: string | null = null;
    return effect(() => {
      const info = store.activeCompetition.value;
      const { team, competition } = store.loaded.value;
      if (!canSetUp.value || !team || !competition || !info) return;
      const key = `${info.id}@${OFFICIAL_DATA_VERSION}`;
      if ((info.officialVersion ?? 0) >= OFFICIAL_DATA_VERSION || appliedTo === key) return;
      appliedTo = key;
      store.actions.applyOfficialData();
    });
  }

  /** Saves this phone's push token, so notifications reach it. Rejects if that fails. */
  async function registerForPush() {
    const signedIn = user.peek();
    if (!signedIn) return;
    try {
      const token = await push.getToken();
      await access.savePushToken(signedIn.uid, token);
    } finally {
      pushStatus.value = push.status();
    }
  }

  /**
   * A phone that already allowed notifications re-sends its token each time the app opens, since
   * push tokens can change.
   */
  function refreshPushToken() {
    let refreshedFor: string | null = null;
    return effect(() => {
      const uid = user.value?.uid;
      if (!uid || !membership.value || pushStatus.value !== 'on' || refreshedFor === uid) return;
      refreshedFor = uid;
      registerForPush().catch(() => {});
    });
  }

  async function attempt(run: () => Promise<void>) {
    problem.value = null;
    try {
      await run();
    } catch (error) {
      problem.value = problemFor(error);
    }
  }

  const actions = {
    /**
     * First-time setup: creates the team with this phone as its captain, and sets up the Purdue
     * Ballroom Classic with its official schedule, partnerships and entries. Fails with
     * `team-exists` if the team can't be created (usually: it already exists).
     */
    async createTeam(teamName: string) {
      problem.value = null;
      let signedIn = user.peek();
      if (!signedIn) {
        try {
          signedIn = await auth.signInAnonymously();
        } catch {
          problem.value = 'sign-in-failed';
          return;
        }
      }
      try {
        await access.createTeam(signedIn.uid, teamName.trim(), createJoinCode());
      } catch {
        problem.value = 'team-exists';
        return;
      }
      store.actions.setUpCompetition();
      watchAccess(signedIn);
    },

    /** Links this phone to a dancer. Fails with `dancer-taken` if another phone has them. */
    chooseDancer: (dancerId: string) =>
      attempt(async () => {
        const signedIn = user.peek();
        const current = membership.peek();
        if (!signedIn || !current) return;
        try {
          await access.claimDancer(signedIn.uid, dancerId, current.dancerId);
        } catch {
          problem.value = 'dancer-taken';
          return;
        }
        const dancer = store.team.peek().dancers.find((candidate) => candidate.id === dancerId);
        store.actions.updatePreferences({
          dancer: dancer ? dancerName(dancer.name) : '',
          skipDancerClaim: false,
        });
        isChoosingDancer.value = false;
      }),

    /**
     * Moves a name another phone has to this one: for the same person on a new phone, a new
     * browser, or their iPhone's Home Screen app. The other phone stops being that dancer.
     */
    takeOverDancer: (dancerId: string) =>
      attempt(async () => {
        const holder = claims.peek()[dancerId];
        const signedIn = user.peek();
        if (holder && holder !== signedIn?.uid) await access.releaseDancer(dancerId, holder);
        await actions.chooseDancer(dancerId);
      }),

    /** This phone doesn't belong to a dancer (e.g. a captain who isn't dancing). */
    skipChoosingDancer() {
      store.actions.updatePreferences({ skipDancerClaim: true });
      isChoosingDancer.value = false;
    },

    /** Goes back to picking which dancer this phone belongs to. */
    changeDancer() {
      problem.value = null;
      isChoosingDancer.value = true;
    },

    /** Keeps this member's identity on any device by linking a Google account. */
    signOut: () => attempt(() => auth.signOut()),

    /**
     * Joins with a pasted team link (or just its code), for a copy of the app that wasn't opened
     * from the link, such as one added to an iPhone's Home Screen. Returns false if there's no
     * code in the text.
     */
    joinWithLink(text: string): boolean {
      const code = joinCodeFromLink(text);
      if (!code) return false;
      problem.value = null;
      pendingJoinCode = code;
      joinState.value = 'joining';
      const signedIn = user.peek();
      if (signedIn) watchAccess(signedIn);
      else auth.signInAnonymously().catch(() => (joinState.value = 'failed'));
      return true;
    },

    /** Asks to allow notifications on this phone and starts sending them here. From a tap. */
    turnOnNotifications: () =>
      attempt(async () => {
        try {
          await registerForPush();
        } catch {
          problem.value = pushStatus.peek() === 'on' ? 'network' : 'notifications-refused';
        }
      }),

    /** Frees a dancer's name so they can pick it on another phone. */
    releaseDancer: (dancerId: string) =>
      attempt(async () => {
        const holder = claims.peek()[dancerId];
        if (holder) await access.releaseDancer(dancerId, holder);
      }),

    /** Makes a new join link; the old one stops working. Captains only. */
    replaceJoinCode: () => attempt(() => access.setJoinCode(createJoinCode())),
  };

  return {
    phase,
    user: computed(() => user.value ?? null),
    membership,
    isCaptain,
    canSetUp,
    claims,
    joinCode,
    problem,
    pushStatus,
    actions,

    start() {
      if (stops.length) return;
      stops.push(
        auth.onUserChange(onUserChange),
        followClaimedDancer(),
        applyOfficialDataOnce(),
        refreshPushToken(),
      );
    },

    dispose() {
      stopAccess?.();
      stopWatchingTeam();
      while (stops.length) stops.pop()?.();
    },
  };
}
