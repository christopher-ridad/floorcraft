import { useEffect, useState } from 'preact/hooks';
import type { CompetitionEvent } from '../../domain/schedule/eventCatalog';
import type { Couple } from '../../domain/types';
import { useApp } from '../context';
import { coupleName, cx } from '../format';
import styles from './SetupView.module.css';

/** Edit couples, their names, and the events they're entered in. */
export function CouplesEditor() {
  const { store, view } = useApp();
  const competition = store.competition.value;
  const missing = competition.missingEntries.length;
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
      {!!missing && (
        <div class="banner">
          {missing} {missing > 1 ? 'entries are' : 'entry is'} for events no longer on the schedule.
          Remove {missing > 1 ? 'them' : 'it'} or pick the new event below.
        </div>
      )}
      <div class="card">
        {competition.couples.length ? (
          competition.couples.map((couple) => (
            <CoupleEditor
              key={couple.id}
              couple={couple}
              eventIds={competition.entries[couple.id] ?? []}
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
  /** Every event the couple is entered in, including ones no longer on the schedule. */
  eventIds: readonly string[];
  events: readonly CompetitionEvent[];
}

function EventOptions({ events, prompt }: { events: readonly CompetitionEvent[]; prompt: string }) {
  return (
    <>
      <option value="">{prompt}</option>
      {events.map((event) => (
        <option key={event.eventId} value={event.eventId}>
          {event.eventNumber} · {event.name}
        </option>
      ))}
    </>
  );
}

function CoupleEditor({ couple, eventIds, events }: CoupleEditorProps) {
  const { store, view } = useApp();
  const { actions, competition } = store;
  // Local drafts so a change arriving from another phone doesn't overwrite what's being typed.
  const [lead, setLead] = useState(couple.lead);
  const [follow, setFollow] = useState(couple.follow);
  useEffect(() => setLead(couple.lead), [couple.lead]);
  useEffect(() => setFollow(couple.follow), [couple.follow]);
  const [eventToAdd, setEventToAdd] = useState('');
  const [isConfirmingDelete, setConfirmingDelete] = useState(false);
  const missing = eventIds.filter((eventId) => !competition.value.events.has(eventId)).length;

  return (
    <details class={styles.couple}>
      <summary>
        <span>{coupleName(couple)}</span>
        <span class={cx(missing ? 'bad' : 'muted', styles.count)}>
          {missing ? `${missing} not on schedule` : `${eventIds.length} events`}
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
      {eventIds.map((eventId) => {
        const event = competition.value.events.get(eventId);
        const label = event
          ? `${event.eventNumber} · ${event.name}`
          : 'Event no longer on the schedule';
        return (
          <div class={styles.entry} key={eventId}>
            <span class={event ? undefined : 'bad'}>{label}</span>
            <button
              class="btn small ghost danger"
              aria-label={`Remove ${event?.name ?? 'missing event'}`}
              onClick={() => actions.removeEntry(couple.id, eventId)}
            >
              Remove
            </button>
          </div>
        );
      })}
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
            actions.addEntry(couple.id, eventToAdd);
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
