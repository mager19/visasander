'use client';
import { useMemo, useState } from 'react';
import { saveAnswers, type ApplicantState } from '@/lib/client/api';
import { computeProgress } from '@/lib/form/progress';
import { buildSteps, firstIncompleteStep } from '@/lib/form/steps';
import type { Answers } from '@/lib/form/types';
import { FileStep } from './FileStep';
import { ProgressBar } from './ProgressBar';
import { RepeatView } from './RepeatView';
import { Review } from './Review';
import { ScreenView } from './ScreenView';

export function Wizard({ token, initial }: { token: string; initial: ApplicantState }) {
  const [answers, setAnswers] = useState<Answers>(initial.answers);
  const [files, setFiles] = useState(initial.files);
  const steps = useMemo(() => buildSteps(answers), [answers]);
  const done = initial.status === 'submitted' || initial.status === 'reviewed';
  const [index, setIndex] = useState(() => {
    const s = buildSteps(initial.answers);
    return done ? s.length - 1 : firstIncompleteStep(s, initial.answers);
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [reviewed, setReviewed] = useState(initial.status === 'reviewed');
  const [unauthorized, setUnauthorized] = useState(false);

  const step = steps[Math.min(index, steps.length - 1)];
  const progress = useMemo(() => computeProgress(answers, files.map((f) => f.kind)), [answers, files]);
  const next = () => setIndex((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setIndex((i) => Math.max(i - 1, 0));
  const goToChapter = (chapterId: string) => {
    const i = steps.findIndex((s) => s.kind === 'chapter' && s.chapter.id === chapterId);
    if (i >= 0) setIndex(i);
  };

  async function persist(patch: Answers): Promise<boolean> {
    setSaving(true);
    setSaveError(false);
    setReviewed(false);
    setUnauthorized(false);
    const result = await saveAnswers(token, patch);
    setSaving(false);
    if (result === 'ok') {
      setAnswers((a) => ({ ...a, ...patch }));
      return true;
    }
    if (result === 'reviewed') setReviewed(true);
    else if (result === 'unauthorized') setUnauthorized(true);
    else setSaveError(true);
    return false;
  }

  return (
    <div className="shell">
      {reviewed && <div className="notice" role="alert">Tu gestor ya revisó tu información. Escríbele si necesitas hacer cambios.</div>}
      {unauthorized && (
        <div className="notice" role="alert">
          <p>Tu sesión terminó. Vuelve a ingresar con tu código.</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Ingresar de nuevo</button>
        </div>
      )}
      <p className="eyebrow" style={{ margin: '0 0 8px' }}>ID {initial.shortId} · guárdalo para retomar</p>
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
          ? <RepeatView screen={step.screen} answers={answers} persist={persist} next={next} back={back} saving={saving} readOnly={reviewed} />
          : <ScreenView screen={step.screen} answers={answers} persist={persist} next={next} back={back} saving={saving} readOnly={reviewed} />)}
        {step.kind === 'files' && <FileStep token={token} files={files} onFilesChange={setFiles} next={next} back={back} readOnly={reviewed} />}
        {step.kind === 'review' && <Review token={token} shortId={initial.shortId} status={initial.status} answers={answers} files={files} goToChapter={goToChapter} back={back} readOnly={reviewed} />}
      </main>
    </div>
  );
}
