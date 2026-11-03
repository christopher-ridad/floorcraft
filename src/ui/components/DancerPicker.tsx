import { useApp } from '../context';

interface DancerPickerProps {
  id: string;
  label: string;
  emptyOption: string;
}

/** Chooses which dancer this phone gives alerts for. */
export function DancerPicker({ id, label, emptyOption }: DancerPickerProps) {
  const { store, view } = useApp();
  const dancers = [...store.competition.value.dancers.keys()].sort();
  const { dancer } = store.preferences.value;

  const choose = (name: string) => {
    store.actions.updatePreferences({ dancer: name });
    if (name) view.showToast(`Alerts set for ${name}.`);
  };

  return (
    <label class="field" for={id}>
      {label}
      <select id={id} value={dancer} onChange={(event) => choose(event.currentTarget.value)}>
        <option value="">{emptyOption}</option>
        {dancers.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
