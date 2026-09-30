'use client';
import { useState, type FormEvent } from 'react';
import type { Answers, Screen } from '@/lib/form/types';
import { buildSkipPayload, clearDependents } from '@/lib/form/skip';
import { validateFields } from '@/lib/form/validate';
import { isVisible } from '@/lib/form/visibility';
import { FieldInput } from './FieldInput';

interface Props {
  screen: Screen;
  answers: Answers;
  persist: (patch: Answers) => Promise<boolean>;
  next: () => void;
  back: () => void;
  saving: boolean;
  readOnly: boolean;
}

export function ScreenView({ screen, answers, persist, next, back, saving, readOnly }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(screen.fields.map((f) => [f.key, typeof answers[f.key] === 'string' && (answers[f.key] as string) !== '' ? (answers[f.key] as string) : (f.default ?? '')])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fields = screen.fields.filter((f) => isVisible(f.showIf, { ...answers, ...values }));

  // Persist only fields currently visible, so values hidden by showIf are never written.
  const visibleValues = () => Object.fromEntries(fields.map((f) => [f.key, values[f.key] ?? '']));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return next();
    const errs = validateFields(fields, values, answers);
    setErrors(errs);
    if (Object.keys(errs).length === 0 && (await persist(visibleValues()))) next();
  }
  async function skip() {
    if (readOnly) return next();
    // Invalid values are sent as '' (checked against the context the server will see).
    if (await persist(buildSkipPayload(fields, values, answers))) next();
  }

  return (
    <form onSubmit={onSubmit} className="step" noValidate>
      <h1>{screen.title}</h1>
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {fields.map((f) => (
        <FieldInput key={f.key} field={f} value={values[f.key] ?? ''} error={errors[f.key]} dependsValue={f.dependsOn ? values[f.dependsOn] : undefined} onChange={(v) => setValues((s) => clearDependents(screen.fields, { ...s, [f.key]: v }, f.key))} />
      ))}
      </fieldset>
      <div className="actions">
        <button className="btn btn-primary" disabled={saving}>Siguiente</button>
        <button type="button" className="btn btn-ghost" onClick={skip} disabled={saving}>Saltar por ahora</button>
        <button type="button" className="btn btn-ghost" onClick={back}>Atrás</button>
      </div>
    </form>
  );
}
