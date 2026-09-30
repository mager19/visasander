import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CopyButton } from '@/components/manager/CopyButton';
import { DetailActions } from '@/components/manager/DetailActions';
import { chapterAsText, chapterRows } from '@/lib/form/display';
import { FILE_LABELS, type FileKind } from '@/lib/form/file-kinds';
import { computeProgress } from '@/lib/form/progress';
import { CHAPTERS } from '@/lib/form/schema';
import { isManager } from '@/lib/manager-auth';
import { mp } from '@/lib/paths';
import { getById } from '@/lib/repo/applications';
import { listFiles } from '@/lib/repo/files';
import { sessionStats } from '@/lib/repo/sessions';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isManager())) redirect(mp('/login'));
  const { id } = await params;
  const app = await getById(id);
  if (!app) notFound();
  const [files, stats] = await Promise.all([listFiles(id), sessionStats(id)]);
  const progress = computeProgress(app.answers, files.map((f) => f.kind));
  const chapterStatus = new Map(progress.chapters.map((c) => [c.id, c]));

  return (
    <>
      <Link href={mp()}>← Solicitudes</Link>
      <header>
        <p className="eyebrow">{app.shortId} · {app.status}</p>
        {app.status === 'reviewed' && <p className="muted">El cliente no puede editar mientras esté revisada.</p>}
        <h1>{app.clientName}</h1>
        <div className="progress" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress.percent}%` }} /></div>
        <p className="muted"><span data-testid="progress-percent">{progress.percent}%</span> completado · {stats.count} sesión(es) activa(s){stats.lastSeenAt && ` · último acceso ${new Date(stats.lastSeenAt).toLocaleString('es-CO')}`}</p>
      </header>

      {CHAPTERS.map((ch) => {
        const cp = chapterStatus.get(ch.id)!;
        return (
          <section className="card" key={ch.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>{ch.title} <span className="pill">{cp.missing.length === 0 ? '✓ Completa' : `⚠ Faltan ${cp.missing.length}`}</span></h2>
              <CopyButton text={chapterAsText(ch, app.answers)} label="Copiar datos" />
            </div>
            <dl style={{ margin: '12px 0 0' }}>
              {chapterRows(ch, app.answers).map((r, i) => (
                <div key={i} style={{ padding: '6px 0', borderTop: '1px solid var(--ash)' }}>
                  <dt className="muted" style={{ fontSize: 14 }}>{r.label}</dt>
                  <dd style={{ margin: 0, background: r.missing ? 'var(--lime)' : undefined, borderRadius: 8, padding: r.missing ? '0 8px' : 0 }}>{r.value || (r.missing ? 'Falta' : '—')}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}

      <section className="card">
        <h2>Archivos <span className="pill">{chapterStatus.get('files')!.missing.length === 0 ? '✓ Completos' : `⚠ Faltan ${chapterStatus.get('files')!.missing.length}`}</span></h2>
        <ul>
          {files.map((f) => <li key={f.id}><a href={`/api/manager/files/${f.id}`} target="_blank" rel="noreferrer">{FILE_LABELS[f.kind as FileKind]} ({f.mimeType.split('/')[1]}, {Math.round(f.sizeBytes / 1024)} KB)</a></li>)}
          {files.length === 0 && <li className="muted">Sin archivos.</li>}
        </ul>
      </section>

      <DetailActions id={app.id} locked={app.locked} status={app.status} initialNotes={app.managerNotes} />
    </>
  );
}
