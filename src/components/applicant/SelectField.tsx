import type { ControlA11y } from './FieldShell';

interface Props {
  fieldKey: string;
  type: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  a11y: ControlA11y;
  placeholder?: string;
  disabled?: boolean;
}

/** Styled native select (custom chevron, refined focus); keeps the phone's native picker. */
export function SelectField({ fieldKey, type, options, value, onChange, a11y, placeholder = 'Selecciona…', disabled }: Props) {
  return (
    <select
      id={a11y.id}
      className="control select"
      value={value}
      disabled={disabled}
      aria-invalid={a11y.invalid}
      aria-describedby={a11y.describedBy}
      data-field={fieldKey}
      data-type={type}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
