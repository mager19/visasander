'use client';
import { mp } from '@/lib/paths';

export function LogoutButton() {
  async function logout() {
    await fetch('/api/manager/logout', { method: 'POST' });
    window.location.href = mp('/login');
  }
  return (
    <button type="button" className="btn btn-ghost" style={{ minHeight: 40 }} onClick={logout}>Salir</button>
  );
}
