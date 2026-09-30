import { useEffect, useState } from 'react';
import type { Field } from '@/lib/form/types';
import { splitMulti } from '@/lib/form/visibility';

interface Props { field: Field; value: string; error?: string; onChange: (v: string) => void; idPrefix?: string; dependsValue?: string }

type ColombiaData = typeof import('@/lib/data/colombia');

/** phase-2 will replace: plain select fed by the Colombia dataset, loaded lazily (separate chunk). */
function ColombiaSelect({ field, common, meta, label, err, dependsValue, onChange }: {
  field: Field; common: Record<string, unknown>; meta: Record<string, string>; label: React.ReactNode; err: React.ReactNode; dependsValue?: string; onChange: (v: string) => void;
}) {
  const [data, setData] = useState<ColombiaData | null>(null);
  useEffect(() => { let on = true; import('@/lib/data/colombia').then((m) => { if (on) setData(m); }); return () => { on = false; }; }, []);
  const list = !data ? [] : field.type === 'co_department' ? data.COLOMBIA_DEPARTMENTS : data.citiesOf(dependsValue ?? '');
  return (
    <div className="field">
      <label htmlFor={common.id as string}>{label}</label>
      <select {...common} {...meta} disabled={!data} onChange={(e) => onChange(e.target.value)}>
        <option value="">{data ? 'Selecciona…' : 'Cargando…'}</option>
        {list.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      {err}
    </div>
  );
}

export function FieldInput({ field, value, error, onChange, idPrefix = '', dependsValue }: Props) {
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
  if (field.type === 'multiselect') {
    // phase-2 will replace this temporary checkbox list
    const selected = splitMulti(value);
    const toggle = (v: string) => onChange((selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]).join(','));
    return (
      <fieldset className="field" {...meta}>
        <legend>{label}</legend>
        {field.options?.map((o) => (
          <label key={o.value}><input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} /> {o.label}</label>
        ))}
        {err}
      </fieldset>
    );
  }
  if (field.type === 'co_department' || field.type === 'co_city') {
    return <ColombiaSelect field={field} common={common} meta={meta} label={label} err={err} dependsValue={dependsValue} onChange={onChange} />;
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
