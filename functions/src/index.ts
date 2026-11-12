/**
 * Push notifications: tells each dancer to get on deck about 15 minutes before their heat, and
 * again when they're up next, even when the app is closed.
 *
 * Runs whenever the floor moves, and every minute (a heat comes within 15 minutes as time passes,
 * not only when the floor moves). Outside the competition both return after two reads.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { sendDueAlerts, type PushSender } from './sendDueAlerts';

/** Purdue's local time. Schedule times and "today" are read in it; servers run on UTC. */
const TIME_ZONE = 'America/Indiana/Indianapolis';
process.env.TZ = TIME_ZONE;

/** The one team this deployment serves (src/infra/firebase/config.ts). */
const TEAM_ID = 'purdue';
/** A notification is useless once the heat has started. */
const TIME_TO_LIVE_SECONDS = 15 * 60;

// The database is in nam5 (US multi-region), served from us-central1.
setGlobalOptions({ region: 'us-central1', maxInstances: 2 });
initializeApp();
const db = getFirestore();

const send: PushSender = async (token, push) => {
  try {
    await getMessaging().send({
      token,
      // Data only: the app's service worker (public/sw.js) shows it, the same on every browser.
      data: {
        title: push.title,
        body: push.body,
        tag: push.alert.heatId,
        type: push.alert.type,
      },
      webpush: {
        headers: { Urgency: 'high', TTL: String(TIME_TO_LIVE_SECONDS) },
      },
    });
    return 'sent';
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    ) {
      return 'gone';
    }
    logger.warn('Push failed', { code, uid: push.recipient.uid });
    return 'sent';
  }
};

async function run(teamId: string) {
  const sent = await sendDueAlerts(db, teamId, Date.now(), send);
  if (sent.length)
    logger.info(`Sent ${sent.length} notifications`, { keys: sent.map((p) => p.key) });
}

export const pushOnFloorChange = onDocumentWritten(
  'teams/{teamId}/competitions/{competitionId}/live/floor',
  (event) => run(event.params.teamId),
);

export const pushEveryMinute = onSchedule(
  { schedule: 'every 1 minutes', timeZone: TIME_ZONE },
  () => run(TEAM_ID),
);
