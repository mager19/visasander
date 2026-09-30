import type { ReactNode } from 'react';

/** Accessibility wiring every control receives from FieldInput. */
export interface ControlA11y {
  /** DOM id of the focusable control (unique per repeat entry via idPrefix). */
  id: string;
  /** id of the visible label, for aria-labelledby on grouped controls. */
  labelId: string;
  /** Space-separated ids of the hint, warning and error lines. */
  describedBy?: string;
  invalid: boolean;
}

interface Props {
  a11y: ControlA11y;
  label: ReactNode;
  hint?: string;
  error?: string;
  warnings?: string[];
  /** Grouped controls (radios, chips, date parts) label a group, not a single input. */
  group?: boolean;
  children: ReactNode;
}

export const idsFor = (id: string) => ({ label: `${id}-label`, hint: `${id}-hint`, warn: `${id}-warn`, err: `${id}-err` });

function AlertIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" className="field-icon">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.5v4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="11.2" r="0.95" fill="currentColor" />
    </svg>
  );
}

/** Shared layout: label -> optional hint -> control -> warning -> error. */
export function FieldShell({ a11y, label, hint, error, warnings = [], group, children }: Props) {
  const ids = idsFor(a11y.id);
  return (
    <div className="field">
      {group
        ? <span id={ids.label} className="field-label">{label}</span>
        : <label id={ids.label} htmlFor={a11y.id} className="field-label">{label}</label>}
      {hint && <p id={ids.hint} className="field-hint">{hint}</p>}
      {children}
      {warnings.length > 0 && (
        <p id={ids.warn} className="field-warning" role="status"><AlertIcon />{warnings.join(' ')}</p>
      )}
      {error && <p id={ids.err} className="field-error" role="alert"><AlertIcon />{error}</p>}
    </div>
  );
}
