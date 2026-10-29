import { useEffect, useState } from 'preact/hooks';
import type { EntryMatch } from '../../domain/competition';
import type { CompetitionEvent } from '../../domain/schedule/eventCatalog';
import type { Couple } from '../../domain/types';
import { useApp } from '../context';
import { coupleName, cx } from '../format';
import styles from './SetupView.module.css';

/** Edit couples, their names, and which event each entry counts toward. */
export function CouplesEditor() {
  const { store, view } = useApp();
  const competition = store.competition.value;
  const unmatched = competition.unmatchedEntries.length;
  const events = [...competition.events.values()].sort((a, b) => a.eventNumber - b.eventNumber);
  const [lead, setLead] = useState('');
  const [follow, setFollow] = useState('');

  const addCouple = () => {
    if (!store.actions.addCouple(lead, follow)) {
      view.showToast('Type at least the lead’s name.');
      return;
    }
    setLead('');
    setFollow('');
  };

  return (
    <>
      {!!unmatched && (
        <div class="banner">
          {unmatched} {unmatched > 1 ? 'entries don’t' : 'entry doesn’t'} match any heat on the
          schedule. Pick the right event below.
        </div>
      )}
      <div class="card">
        {competition.couples.length ? (
          competition.couples.map((couple) => (
            <CoupleEditor
              key={couple.id}
              couple={couple}
              matches={competition.entryMatches.get(couple.id) ?? []}
              events={events}
            />
          ))
        ) : (
          <div class="muted">No couples yet.</div>
        )}
        <div class={cx('row', 'nowrap', styles.newCouple)}>
          <input
            type="text"
            placeholder="Lead"
            aria-label="New couple lead"
            value={lead}
            onInput={(event) => setLead(event.currentTarget.value)}
          />
          <input
            type="text"
            placeholder="Follow"
            aria-label="New couple follow"
            value={follow}
            onInput={(event) => setFollow(event.currentTarget.value)}
          />
          <button class="btn small primary" onClick={addCouple}>
            Add couple
          </button>
        </div>
      </div>
    </>
  );
}

interface CoupleEditorProps {
  couple: Couple;
  matches: readonly EntryMatch[];
  events: readonly CompetitionEvent[];
}

function EventOptions({ events, prompt }: { events: readonly CompetitionEvent[]; prompt: string }) {
  return (
    <>
      <option value="">{prompt}</option>
      {events.map((event) => (
        <option key={event.eventNumber} value={event.eventNumber}>
          {event.eventNumber} · {event.baseName}
        </option>
      ))}
    </>
  );
}

function CoupleEditor({ couple, matches, events }: CoupleEditorProps) {
  const { store, view } = useApp();
  const { actions, competition } = store;
  // Local drafts so a change arriving from another phone doesn't overwrite what's being typed.
  const [lead, setLead] = useState(couple.lead);
  const [follow, setFollow] = useState(couple.follow);
  useEffect(() => setLead(couple.lead), [couple.lead]);
  useEffect(() => setFollow(couple.follow), [couple.follow]);
  const [eventToAdd, setEventToAdd] = useState('');
  const [isConfirmingDelete, setConfirmingDelete] = useState(false);
  const unmatched = matches.filter((match) => match.eventNumber === null).length;

  return (
    <details class={styles.couple}>
      <summary>
        <span>{coupleName(couple)}</span>
        <span class={cx(unmatched ? 'bad' : 'muted', styles.count)}>
          {unmatched ? `${unmatched} unmatched` : `${matches.length} events`}
        </span>
      </summary>
      <div class="row nowrap">
        <input
          type="text"
          aria-label="Lead"
          value={lead}
          onInput={(event) => setLead(event.currentTarget.value)}
        />
        <input
          type="text"
          aria-label="Follow"
          value={follow}
          onInput={(event) => setFollow(event.currentTarget.value)}
        />
        <button
          class="btn small"
          onClick={() => {
            actions.renameCouple(couple.id, lead, follow);
            view.showToast('Names saved.');
          }}
        >
          Save
        </button>
      </div>
      {matches.map((match, index) => (
        <div class={styles.entry} key={`${index}:${match.entry}`}>
          <span>
            {match.entry}
            <br />
            {match.eventNumber !== null ? (
              <span class={cx('ok', styles.matched)}>
                Heat {match.eventNumber}:{' '}
                {competition.value.events.get(match.eventNumber)?.baseName}
              </span>
            ) : (
              <select
                aria-label={`Pick event for ${match.entry}`}
                onChange={(event) => {
                  const eventNumber = Number(event.currentTarget.value);
                  if (eventNumber) actions.chooseEventForEntry(couple.id, index, eventNumber);
                }}
              >
                <EventOptions events={events} prompt="Pick the event…" />
              </select>
            )}
          </span>
          <button
            class="btn small ghost danger"
            aria-label={`Remove ${match.entry}`}
            onClick={() => actions.removeEntry(couple.id, index)}
          >
            Remove
          </button>
        </div>
      ))}
      <div class="row nowrap">
        <select
          aria-label="Add event"
          value={eventToAdd}
          onChange={(event) => setEventToAdd(event.currentTarget.value)}
        >
          <EventOptions events={events} prompt="Add an event…" />
        </select>
        <button
          class="btn small"
          onClick={() => {
            if (!eventToAdd) return;
            actions.addEntry(couple.id, Number(eventToAdd));
            setEventToAdd('');
          }}
        >
          Add
        </button>
      </div>
      {isConfirmingDelete ? (
        <div class="row">
          <span class="bad">Delete this couple?</span>
          <button class="btn small danger" onClick={() => actions.deleteCouple(couple.id)}>
            Delete
          </button>
          <button class="btn small" onClick={() => setConfirmingDelete(false)}>
            Keep
          </button>
        </div>
      ) : (
        <div>
          <button class="btn small ghost danger" onClick={() => setConfirmingDelete(true)}>
            Delete couple
          </button>
        </div>
      )}
    </details>
  );
}
