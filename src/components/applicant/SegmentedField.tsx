import { useRef, type KeyboardEvent } from 'react';
import type { Option } from '@/lib/form/types';
import type { ControlA11y } from './FieldShell';

interface Props {
  fieldKey: string;
  type: string;
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  a11y: ControlA11y;
}

export function CheckIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" className="check-icon">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Segmented radio buttons for yes/no and short selects. Arrow keys move the selection (radio group pattern). */
export function SegmentedField({ fieldKey, type, options, value, onChange, a11y }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = options.findIndex((o) => o.value === value);

  function onKeyDown(e: KeyboardEvent, i: number) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div className="segmented" role="radiogroup" aria-labelledby={a11y.labelId} aria-describedby={a11y.describedBy} aria-invalid={a11y.invalid || undefined} data-field={fieldKey} data-type={type}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el; }}
            id={i === 0 ? a11y.id : undefined}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (current < 0 && i === 0) ? 0 : -1}
            className="segment"
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {on && <CheckIcon />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
