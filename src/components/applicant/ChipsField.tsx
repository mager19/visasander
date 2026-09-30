import type { Option } from '@/lib/form/types';
import { splitMulti } from '@/lib/form/visibility';
import type { ControlA11y } from './FieldShell';
import { CheckIcon } from './SegmentedField';

interface Props {
  fieldKey: string;
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  a11y: ControlA11y;
}

/** Multiselect as toggle chips; the value stays a comma-separated list in option order. */
export function ChipsField({ fieldKey, options, value, onChange, a11y }: Props) {
  const selected = splitMulti(value);
  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
    onChange(options.map((o) => o.value).filter((x) => next.includes(x)).join(','));
  };

  return (
    <div className="chips" role="group" aria-labelledby={a11y.labelId} aria-describedby={a11y.describedBy} data-field={fieldKey} data-type="multiselect">
      {options.map((o, i) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            id={i === 0 ? a11y.id : undefined}
            type="button"
            role="checkbox"
            aria-checked={on}
            aria-invalid={a11y.invalid || undefined}
            className="chip"
            onClick={() => toggle(o.value)}
          >
            {on && <CheckIcon />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
