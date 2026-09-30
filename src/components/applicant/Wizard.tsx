'use client';
import { useMemo, useState } from 'react';
import { saveAnswers, type ApplicantState } from '@/lib/client/api';
import { computeProgress } from '@/lib/form/progress';
import { buildSteps, firstIncompleteStep } from '@/lib/form/steps';
import type { Answers } from '@/lib/form/types';
import { ProgressBar } from './ProgressBar';
import { RepeatView } from './RepeatView';
import { ScreenView } from './ScreenView';

export function Wizard({ token, initial }: { token: string; initial: ApplicantState }) {
  const [answers, setAnswers] = useState<Answers>(initial.answers);
  // setFiles is wired in Task 11 (files step).
  const [files, setFiles] = useState(initial.files);
  void setFiles;
  const steps = useMemo(() => buildSteps(answers), [answers]);
  const done = initial.status === 'submitted' || initial.status === 'reviewed';
  const [index, setIndex] = useState(() => {
    const s = buildSteps(initial.answers);
    return done ? s.length - 1 : firstIncompleteStep(s, initial.answers);
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [reviewed, setReviewed] = useState(initial.status === 'reviewed');

  const step = steps[Math.min(index, steps.length - 1)];
  const progress = useMemo(() => computeProgress(answers, files.map((f) => f.kind)), [answers, files]);
  const next = () => setIndex((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setIndex((i) => Math.max(i - 1, 0));

  async function persist(patch: Answers): Promise<boolean> {
    setSaving(true);
    setSaveError(false);
    const result = await saveAnswers(token, patch);
    setSaving(false);
    if (result === 'ok') {
      setAnswers((a) => ({ ...a, ...patch }));
      return true;
    }
    if (result === 'reviewed') setReviewed(true);
    else setSaveError(true);
    return false;
  }

  return (
    <div className="shell">
      {reviewed && <div className="notice" role="alert">Tu gestor ya revisó tu información. Escríbele si necesitas hacer cambios.</div>}
      <ProgressBar percent={progress.percent} />
      {saveError && <div className="notice" role="alert">No pudimos guardar. Revisa tu conexión e inténtalo de nuevo.</div>}
      <main className="step" data-step={step.kind} key={`${step.kind}-${index}`}>
        {step.kind === 'chapter' && (
          <>
            <p className="eyebrow">Sección</p>
            <h1>{step.chapter.title}</h1>
            <p className="muted">Tus respuestas se guardan automáticamente.</p>
            <div className="actions">
              <button className="btn btn-primary" onClick={next}>Empezar</button>
              {index > 0 && <button className="btn btn-ghost" onClick={back}>Atrás</button>}
            </div>
          </>
        )}
        {step.kind === 'screen' && (step.screen.repeat
          ? <RepeatView screen={step.screen} answers={answers} persist={persist} next={next} back={back} saving={saving} />
          : <ScreenView screen={step.screen} answers={answers} persist={persist} next={next} back={back} saving={saving} />)}
        {step.kind === 'files' && <p>Archivos (Task 11)</p>}
        {step.kind === 'review' && <p>Revisión (Task 11)</p>}
      </main>
    </div>
  );
}
