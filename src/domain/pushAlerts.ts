import { alertKey, nextAlert, type Alert } from './alerts';
import type { Competition } from './competition';
import { dancerName, isInCouple, partnerOf } from './dancers';
import { ROUND_LABELS } from './schedule/heatName';

/** A phone that has turned on notifications, and the dancer it belongs to. */
export interface PushRecipient {
  /** The phone's user id. */
  uid: string;
  /** Where to send: the phone's push token. */
  token: string;
  /** The dancer's display name, e.g. `Chris`. */
  dancer: string;
}

/** A notification to send now. */
export interface PlannedPush {
  recipient: PushRecipient;
  alert: Alert;
  /** Identifies this notification, so each is sent once per phone. Safe as a document id. */
  key: string;
  title: string;
  body: string;
}

export const pushKey = (uid: string, alert: Pick<Alert, 'type' | 'heatId'>) =>
  `${uid}_${alertKey(alert)}`;

/**
 * The notifications due now: for each phone, the same alert the app itself would give its
 * dancer (on deck about 15 minutes out, then up next), unless that phone was already sent it.
 */
export function planPushAlerts(
  competition: Competition,
  recipients: readonly PushRecipient[],
  nowMinutes: number,
  alreadySent: ReadonlySet<string>,
): PlannedPush[] {
  const pushes: PlannedPush[] = [];
  for (const recipient of recipients) {
    if (!recipient.dancer) continue;
    const prefix = `${recipient.uid}_`;
    const given = new Set(
      [...alreadySent]
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length)),
    );
    const alert = nextAlert(competition, { dancer: recipient.dancer, nowMinutes }, given);
    if (!alert) continue;
    const { title, body } = describe(competition, alert, recipient.dancer);
    pushes.push({ recipient, alert, key: pushKey(recipient.uid, alert), title, body });
  }
  return pushes;
}

function describe(competition: Competition, alert: Alert, dancer: string) {
  const heat = competition.schedule.find((item) => item.id === alert.heatId);
  const heatName = competition.items.get(alert.heatId)?.heatName;
  const couple = competition.heatTeams
    .get(alert.heatId)
    ?.dancing.find((candidate) => isInCouple(candidate, dancer));
  const partner = couple ? dancerName(partnerOf(couple, dancer)) || 'TBA' : '';

  const event = heatName?.baseName ?? (heat?.kind === 'heat' ? heat.name : 'your heat');
  const round = heatName && !heatName.isSingleRound ? ` ${ROUND_LABELS[heatName.round]}` : '';
  const withPartner = partner ? ` with ${partner}` : '';
  const heatNumber = heat?.kind === 'heat' ? ` · Heat ${heat.eventNumber}` : '';
  const what = `${event}${round}${withPartner}${heatNumber}`;

  return alert.type === 'up-next'
    ? { title: "You're up next", body: what }
    : {
        title: 'Get on deck',
        body: `${what} · about ${alert.minutesAway} min away`,
      };
}
