import { ApplicantApp } from '@/components/applicant/ApplicantApp';
import { Notice } from '@/components/applicant/Notice';
import { getByToken } from '@/lib/repo/applications';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const app = await getByToken((await params).token);
  if (!app) return <Notice title="Enlace no válido">Revisa el enlace que te envió tu gestor.</Notice>;
  if (new Date(app.expiresAt) < new Date()) return <Notice title="Este enlace venció">Comunícate con tu gestor para pedir uno nuevo.</Notice>;
  if (app.locked) return <Notice title="Acceso bloqueado">Por seguridad bloqueamos el acceso tras varios intentos. Escríbele a tu gestor para que lo desbloquee.</Notice>;
  return <ApplicantApp token={(await params).token} firstName={app.clientName.trim().split(/\s+/)[0] ?? ''} />;
}
