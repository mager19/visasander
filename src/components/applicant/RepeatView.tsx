'use client';
import { useState, type FormEvent } from 'react';
import type { Answers, Screen } from '@/lib/form/types';
import { validateFields } from '@/lib/form/validate';
import { FieldInput } from './FieldInput';

type Entry = Record<string, string>;
interface Props { screen: Screen; answers: Answers; persist: (patch: Answers) => Promise<boolean>; next: () => void; back: () => void; saving: boolean; readOnly: boolean }

export function RepeatView({ screen, answers, persist, next, back, saving, readOnly }: Props) {
  const { key, addLabel } = screen.repeat!;
  const [none, setNone] = useState(answers[`${key}__none`] === true);
  const [entries, setEntries] = useState<Entry[]>(() => (Array.isArray(answers[key]) && (answers[key] as Entry[]).length ? (answers[key] as Entry[]) : [{}]));
  const [errors, setErrors] = useState<Record<string, string>[]>([]);

  const setValue = (i: number, k: string, v: string) => setEntries((list) => list.map((e, j) => (j === i ? { ...e, [k]: v } : e)));
  // Drops values that fail validation (used when skipping) so the server never receives them.
  const validOnly = (entry: Entry): Entry => {
    const errs = validateFields(screen.fields, entry, {});
    return Object.fromEntries(Object.entries(entry).filter(([k, v]) => !v?.trim() || !errs[k]));
  };
  const save = (clean = false) => persist({ [key]: none ? [] : entries.map((e) => (clean ? validOnly(e) : e)).filter((e) => Object.values(e).some((v) => v?.trim())), [`${key}__none`]: none });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return next();
    if (!none) {
      const errs = entries.map((entry) => validateFields(screen.fields, entry, {}));
      setErrors(errs);
      if (errs.some((x) => Object.keys(x).length > 0)) return;
    }
    if (await save()) next();
  }

  return (
    <form onSubmit={onSubmit} className="step" noValidate>
      <h1>{screen.title}</h1>
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className="field">
        <button type="button" role="checkbox" aria-checked={none} className={`choice${none ? ' on' : ''}`} onClick={() => setNone((n) => !n)}>Ninguno / No aplica</button>
      </div>
      {!none && entries.map((entry, i) => (
        <div className="card" key={i} style={{ marginBottom: 16 }}>
          <p className="eyebrow">Registro {i + 1}</p>
          {screen.fields.map((f) => (
            // Field keys repeat per entry, so scope the DOM id by entry index.
            <FieldInput key={f.key} field={f} idPrefix={`${key}-${i}-`} value={entry[f.key] ?? ''} error={errors[i]?.[f.key]} onChange={(v) => setValue(i, f.key, v)} />
          ))}
          {entries.length > 1 && <button type="button" className="btn btn-ghost" onClick={() => setEntries((l) => l.filter((_, j) => j !== i))}>Quitar</button>}
        </div>
      ))}
      {!none && entries.length < 20 && <button type="button" className="btn btn-ghost" onClick={() => setEntries((l) => [...l, {}])}>{addLabel}</button>}
      </fieldset>
      <div className="actions">
        <button className="btn btn-primary" disabled={saving}>Siguiente</button>
        <button type="button" className="btn btn-ghost" onClick={async () => { if (readOnly || (await save(true))) next(); }} disabled={saving}>Saltar por ahora</button>
        <button type="button" className="btn btn-ghost" onClick={back}>Atrás</button>
      </div>
    </form>
  );
}
