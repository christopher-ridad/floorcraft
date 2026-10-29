const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const P = require('../src/parse.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8');

test('parses every heat and break from the schedule', () => {
  const heats = P.parseSchedule(read('schedule-2025-tentative.txt'));
  assert.strictEqual(heats.filter(h => h.ev != null).length, 139);
  assert.ok(heats.some(h => h.label === 'Smooth Awards'));
});

test('restores time order for text pasted from a two-column PDF', () => {
  const lines = read('schedule-2025-tentative.txt').trim().split('\n');
  const half = Math.ceil(lines.length / 2), mixed = [];
  for (let i = 0; i < half; i++) mixed.push(lines[i] + ' ' + (lines[half + i] || ''));
  const a = P.parseSchedule(mixed.join('\n')).filter(h => h.ev != null).map(h => h.t + h.ev);
  const b = P.parseSchedule(lines.join('\n')).filter(h => h.ev != null).map(h => h.t + h.ev);
  assert.deepStrictEqual(a, b);
});

test('matches every partnership entry to a scheduled event', () => {
  const events = P.eventsFromSchedule(P.parseSchedule(read('schedule-2025-tentative.txt')));
  const couples = P.parseEntries(read('partnerships-2026.txt'));
  assert.strictEqual(couples.length, 20);
  const misses = [];
  for (const c of couples) for (const e of c.events) if (P.matchEntry(e, events) == null) misses.push(`${c.lead}/${c.follow}: ${e}`);
  assert.deepStrictEqual(misses, []);
});

test('handles shorthand: dance order, missing style, V. Waltz', () => {
  const events = P.eventsFromSchedule(P.parseSchedule(read('schedule-2025-tentative.txt')));
  assert.strictEqual(P.matchEntry('Silver I. Standard (TF)', events), 16);   // schedule lists (FT)
  assert.strictEqual(P.matchEntry('Newcomer Swing', events), 29);
  assert.strictEqual(P.matchEntry('Silver I. V. Waltz', events), 20);
  assert.strictEqual(P.matchEntry('Gold I. Latin (SCRJ)', events), 37);
});
