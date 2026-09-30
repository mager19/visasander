import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/manager/LogoutButton';
import { NewApplication } from '@/components/manager/NewApplication';
import { computeProgress } from '@/lib/form/progress';
import { isManager } from '@/lib/manager-auth';
import { MAX_ATTEMPTS } from '@/lib/constants';
import { mp } from '@/lib/paths';
import { listApplications } from '@/lib/repo/applications';
import { allFileKinds } from '@/lib/repo/files';
import { STATUS_LABEL } from '@/lib/status';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  if (!(await isManager())) redirect(mp('/login'));
  const { q = '', status = '' } = await searchParams;
  const [apps, kinds] = await Promise.all([listApplications({ q, status }), allFileKinds()]);

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Solicitudes</h1>
        <LogoutButton />
      </header>
      <NewApplication />
      <form method="get" className="card" style={{ display: 'grid', gap: 8 }}>
        <div className="field" style={{ margin: 0 }}><label htmlFor="q">Buscar por nombre o ID</label><input id="q" name="q" defaultValue={q} /></div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="status">Estado</label>
          <select id="status" name="status" defaultValue={status}>
            <option value="">Todos</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <button className="btn btn-ghost">Filtrar</button>
      </form>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
        {apps.map((a) => {
          const p = computeProgress(a.answers, kinds[a.id] ?? []);
          const days = Math.ceil((new Date(a.expiresAt).getTime() - Date.now()) / 86_400_000);
          return (
            <li key={a.id} className="card">
              <Link href={mp(`/${a.id}`)} style={{ textDecoration: 'none' }}><h2 style={{ margin: 0 }}>{a.clientName}</h2></Link>
              <p className="eyebrow">{a.shortId} · <span className="pill">{STATUS_LABEL[a.status]}</span>{(a.locked || a.failedAttempts >= MAX_ATTEMPTS) && <> · <span className="pill">Bloqueada</span></>}</p>
              <div className="progress" role="progressbar" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`Avance de ${a.clientName}`}><span style={{ width: `${p.percent}%` }} /></div>
              <p className="muted" style={{ margin: '6px 0 0' }}>{p.percent}% · vence en {days} días</p>
            </li>
          );
        })}
        {apps.length === 0 && <li className="muted">No hay solicitudes.</li>}
      </ul>
    </>
  );
}
