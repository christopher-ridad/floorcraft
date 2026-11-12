import { describe, expect, it } from 'vitest';
import { minutesSinceMidnight } from '../../src/domain/clock';
import { planPushAlerts, pushKey, type PushRecipient } from '../../src/domain/pushAlerts';
import { at, competitionWith } from './fixture';

const chris: PushRecipient = { uid: 'chrisPhone', token: 't-chris', dancer: 'Chris' };
const alex: PushRecipient = { uid: 'alexPhone', token: 't-alex', dancer: 'Alex' };
const jo: PushRecipient = { uid: 'joPhone', token: 't-jo', dancer: 'Jo' };

/** The floor reached h1 at 9:00; it's 9:20, so the floor is 23 minutes behind. */
const running = competitionWith({ currentItemId: 'h1', currentSetAt: at(9, 0) });
const now = minutesSinceMidnight(new Date(at(9, 20)));

describe('push notifications', () => {
  it('tell each phone what the app would: up next, or on deck about 15 minutes out', () => {
    const pushes = planPushAlerts(running, [chris, alex, jo], now, new Set());
    expect(
      pushes.map(({ recipient, key, title, body }) => [recipient.uid, key, title, body]),
    ).toEqual([
      [
        'chrisPhone',
        'chrisPhone_h2:up-next',
        "You're up next",
        'Bronze Amer. Smooth (FV) with Brooke · Heat 2',
      ],
      [
        'alexPhone',
        'alexPhone_h4:on-deck',
        'Get on deck',
        'Newcomer Intl. Cha Cha 1st Round with Sam · Heat 3 · about 3 min away',
      ],
    ]);
  });

  it('are sent once per phone, and other phones are unaffected', () => {
    const sent = new Set([pushKey('chrisPhone', { type: 'up-next', heatId: 'h2' })]);
    const pushes = planPushAlerts(running, [chris, alex], now, sent);
    expect(pushes.map((push) => push.key)).toEqual(['alexPhone_h4:on-deck']);
  });

  it('skip the on-deck notice once a phone was told it is up next', () => {
    const sent = new Set([pushKey('alexPhone', { type: 'up-next', heatId: 'h4' })]);
    expect(planPushAlerts(running, [alex], now, sent)).toEqual([]);
  });

  it('wait until 15 minutes out', () => {
    expect(planPushAlerts(running, [alex], now - 20, new Set())).toEqual([]);
  });

  it('send nothing before the competition starts, or to a phone with no dancer', () => {
    expect(planPushAlerts(competitionWith(), [chris], now, new Set())).toEqual([]);
    expect(planPushAlerts(running, [{ ...chris, dancer: '' }], now, new Set())).toEqual([]);
  });
});
