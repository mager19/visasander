import type { Field } from '@/lib/form/types';

interface Props { field: Field; value: string; error?: string; onChange: (v: string) => void; idPrefix?: string }

export function FieldInput({ field, value, error, onChange, idPrefix = '' }: Props) {
  const id = `f-${idPrefix}${field.key}`;
  const common = { id, value, 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-err` : undefined };
  const err = error && <span id={`${id}-err`} className="error" role="alert">{error}</span>;
  const label = <>{field.label}{!field.required && <span className="muted"> (opcional)</span>}</>;
  const meta = { 'data-field': field.key, 'data-type': field.type };

  if (field.type === 'yesno') {
    return (
      <fieldset className="field" {...meta}>
        <legend>{label}</legend>
        <div className="choices" role="radiogroup">
          {([['yes', 'Sí'], ['no', 'No']] as const).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={value === v} className={`choice${value === v ? ' on' : ''}`} onClick={() => onChange(v)}>{l}</button>
          ))}
        </div>
        {err}
      </fieldset>
    );
  }
  if (field.type === 'select') {
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <select {...common} {...meta} onChange={(e) => onChange(e.target.value)}>
          <option value="">Selecciona…</option>
          {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {err}
      </div>
    );
  }
  if (field.type === 'textarea') {
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <textarea {...common} {...meta} onChange={(e) => onChange(e.target.value)} />
        {err}
      </div>
    );
  }
  const input = {
    text: { type: 'text' }, tel: { type: 'tel', inputMode: 'tel' as const }, email: { type: 'email', inputMode: 'email' as const, autoComplete: 'email' },
    date: { type: 'date' }, number: { type: 'text', inputMode: 'decimal' as const },
  }[field.type];
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input {...common} {...meta} {...input} onChange={(e) => onChange(e.target.value)} />
      {err}
    </div>
  );
}
