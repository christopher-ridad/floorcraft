import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import {
  SyncFailure,
  type AccessRepository,
  type Membership,
  type SignInProvider,
} from '../../app/ports';

const toMembership = (uid: string, data: DocumentData): Membership => ({
  uid,
  dancerId: typeof data.dancerId === 'string' ? data.dancerId : null,
  provider: data.provider === 'google' ? 'google' : 'anonymous',
  joinedAt: typeof data.joinedAt === 'number' ? data.joinedAt : 0,
});

async function write(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
    throw new SyncFailure(
      String(code).endsWith('permission-denied') ? 'read-only' : 'network',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export interface FirestoreAccessOptions {
  firestore: Firestore;
  teamId: string;
  now?: () => number;
}

/** Team membership in Firestore, as described in docs/design/firebase-competitions.md. */
export function firestoreAccessRepository({
  firestore,
  teamId,
  now = () => Date.now(),
}: FirestoreAccessOptions): AccessRepository {
  const teamPath = `teams/${teamId}`;
  const memberRef = (uid: string) => doc(firestore, `${teamPath}/members/${uid}`);
  const joinRef = () => doc(firestore, `${teamPath}/private/join`);

  return {
    watchAccess(uid, onChange) {
      let stopMember: (() => void) | null = null;
      let isCaptain = false;
      /** Undefined until the membership document has loaded. */
      let membership: Membership | null | undefined;
      let stopped = false;
      const report = () => {
        if (!stopped && membership !== undefined) onChange({ kind: 'team', isCaptain, membership });
      };
      const lose = () => {
        if (stopped) return;
        stopped = true;
        stopMember?.();
        onChange({ kind: 'none' });
      };
      const stopTeam = onSnapshot(
        doc(firestore, teamPath),
        (team) => {
          if (!team.exists()) return lose();
          const captainUids: unknown = team.data().captainUids;
          isCaptain = Array.isArray(captainUids) && captainUids.includes(uid);
          report();
          stopMember ??= onSnapshot(
            memberRef(uid),
            (member) => {
              membership = member.exists() ? toMembership(uid, member.data()) : null;
              report();
            },
            lose,
          );
        },
        // Not allowed to read the team: not a member (or no longer one).
        lose,
      );
      return () => {
        stopped = true;
        stopTeam();
        stopMember?.();
      };
    },

    watchClaims(onChange) {
      return onSnapshot(
        collection(firestore, `${teamPath}/claims`),
        (claims) =>
          onChange(
            Object.fromEntries(claims.docs.map((claim) => [claim.id, String(claim.data().uid)])),
          ),
        () => onChange({}),
      );
    },

    watchJoinCode(onChange) {
      return onSnapshot(
        joinRef(),
        (join) => onChange(join.exists() ? String(join.data().code) : null),
        () => onChange(null),
      );
    },

    // The rules check captaincy against the team as it was before a write, so these happen in turn.
    createTeam: (uid, name, joinCode) =>
      write(async () => {
        await setDoc(doc(firestore, teamPath), {
          name,
          captainUids: [uid],
          activeCompetitionId: null,
          createdAt: now(),
        });
        await setDoc(joinRef(), { code: joinCode });
        await setDoc(memberRef(uid), { dancerId: null, provider: 'anonymous', joinedAt: now() });
      }),

    join: (uid, joinCode, provider: SignInProvider) =>
      write(() => setDoc(memberRef(uid), { dancerId: null, provider, joinedAt: now(), joinCode })),

    joinAsCaptain: (uid) =>
      write(() => setDoc(memberRef(uid), { dancerId: null, provider: 'google', joinedAt: now() })),

    claimDancer: (uid, dancerId, previousDancerId) =>
      write(async () => {
        if (dancerId === previousDancerId) return;
        const batch = writeBatch(firestore);
        batch.set(doc(firestore, `${teamPath}/claims/${dancerId}`), { uid });
        batch.update(memberRef(uid), { dancerId });
        if (previousDancerId) {
          batch.delete(doc(firestore, `${teamPath}/claims/${previousDancerId}`));
        }
        return batch.commit();
      }),

    setProvider: (uid, provider) => write(() => updateDoc(memberRef(uid), { provider })),

    releaseDancer: (dancerId, holderUid) =>
      write(async () => {
        await deleteDoc(doc(firestore, `${teamPath}/claims/${dancerId}`));
        // The phone that held the name stops being that dancer (if it's still on the team).
        await updateDoc(memberRef(holderUid), { dancerId: null }).catch(() => undefined);
      }),

    setJoinCode: (joinCode) => write(() => setDoc(joinRef(), { code: joinCode })),

    savePushToken: (uid, token) =>
      write(() =>
        setDoc(doc(firestore, `${teamPath}/pushTokens/${uid}`), { token, updatedAt: Date.now() }),
      ),
  };
}
