'use client';
import { useState, type FormEvent } from 'react';
import type { Answers, Screen } from '@/lib/form/types';
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
}

export function ScreenView({ screen, answers, persist, next, back, saving }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(screen.fields.map((f) => [f.key, typeof answers[f.key] === 'string' ? (answers[f.key] as string) : ''])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fields = screen.fields.filter((f) => isVisible(f.showIf, { ...answers, ...values }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validateFields(fields, values, answers);
    setErrors(errs);
    if (Object.keys(errs).length === 0 && (await persist(values))) next();
  }
  async function skip() {
    if (await persist(values)) next();
  }

  return (
    <form onSubmit={onSubmit} className="step" noValidate>
      <h1>{screen.title}</h1>
      {fields.map((f) => (
        <FieldInput key={f.key} field={f} value={values[f.key] ?? ''} error={errors[f.key]} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
      ))}
      <div className="actions">
        <button className="btn btn-primary" disabled={saving}>Siguiente</button>
        <button type="button" className="btn btn-ghost" onClick={skip} disabled={saving}>Saltar por ahora</button>
        <button type="button" className="btn btn-ghost" onClick={back}>Atrás</button>
      </div>
    </form>
  );
}
