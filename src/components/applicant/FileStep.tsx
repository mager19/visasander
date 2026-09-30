'use client';
import { useEffect, useRef, useState } from 'react';
import { uploadFile } from '@/lib/client/upload';
import { FILE_KINDS, FILE_LABELS, REQUIRED_FILE_KINDS, type FileKind } from '@/lib/form/file-kinds';

interface Props {
  token: string;
  files: { id: string; kind: string }[];
  onFilesChange: (files: { id: string; kind: string }[]) => void;
  next: () => void;
  back: () => void;
  /** True once the manager reviewed the application: list uploads only, no changes. */
  readOnly?: boolean;
}

const VERIFY_FAILED = 'No se pudo verificar el archivo. Inténtalo de nuevo con otra foto.';
const MESSAGES: Record<string, string> = {
  invalid_type: 'Formato no admitido. Usa JPG, PNG o PDF.',
  too_large: 'El archivo pesa demasiado (máximo 8 MB).',
  reviewed: 'Tu gestor ya revisó tu información. Escríbele si necesitas hacer cambios.',
  unauthorized: 'Tu sesión terminó. Vuelve a ingresar con tu código.',
  too_many_files: 'Ya subiste el máximo de archivos de este tipo. Quita uno para continuar.',
  upload_rejected: 'No se pudo subir el archivo. Inténtalo de nuevo.',
  content_type_mismatch: VERIFY_FAILED,
  not_uploaded: VERIFY_FAILED,
  invalid_key: VERIFY_FAILED,
  empty: VERIFY_FAILED,
  invalid_kind: VERIFY_FAILED,
};
const FALLBACK = 'No se pudo subir. Revisa tu conexión e inténtalo de nuevo.';
const REMOVE_FALLBACK = 'No se pudo quitar el archivo. Inténtalo de nuevo.';
const REPLACE_NOTICE = 'Subimos el archivo nuevo, pero no pudimos quitar el anterior. Quítalo con el botón "Quitar".';

/** Local-only preview of a file uploaded in this session (files loaded from the server have none). */
interface Preview { url: string | null; name: string; isImage: boolean }

export function FileStep({ token, files, onFilesChange, next, back, readOnly = false }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sessionEnded, setSessionEnded] = useState(false);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  // Mirror of `previews` so the unmount cleanup can revoke every object URL still alive.
  const previewsRef = useRef<Record<string, Preview>>({});
  previewsRef.current = previews;
  useEffect(() => () => {
    for (const p of Object.values(previewsRef.current)) if (p.url) URL.revokeObjectURL(p.url);
  }, []);

  function dropPreviews(ids: string[]) {
    setPreviews((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        if (next[id]?.url) URL.revokeObjectURL(next[id].url!);
        delete next[id];
      }
      return next;
    });
  }

  function fail(kind: string, code: string, fallback: string) {
    if (code === 'unauthorized') setSessionEnded(true);
    setErrors((x) => ({ ...x, [kind]: MESSAGES[code] ?? fallback }));
  }

  async function add(kind: FileKind, file: File | undefined) {
    if (!file || readOnly) return;
    setBusy(kind);
    setErrors((e) => ({ ...e, [kind]: '' }));
    try {
      const previous = files.filter((f) => f.kind === kind);
      const { id } = await uploadFile(token, kind, file);
      const isImage = file.type.startsWith('image/');
      setPreviews((p) => ({ ...p, [id]: { url: isImage ? URL.createObjectURL(file) : null, name: file.name, isImage } }));
      // Retake replaces: once the new file is stored, delete the previous ones (best effort, keep both on failure).
      const removed: string[] = [];
      let failedRemoval = false;
      for (const old of previous) {
        try {
          const r = await fetch(`/api/s/${token}/files/${old.id}`, { method: 'DELETE' });
          if (r.ok || r.status === 404) removed.push(old.id);
          else failedRemoval = true;
        } catch {
          failedRemoval = true;
        }
      }
      dropPreviews(removed);
      onFilesChange([...files.filter((f) => !removed.includes(f.id)), { id, kind }]);
      if (failedRemoval) setErrors((x) => ({ ...x, [kind]: REPLACE_NOTICE }));
    } catch (e) {
      fail(kind, (e as Error).message, FALLBACK);
    } finally {
      setBusy(null);
    }
  }

  async function remove(kind: string, id: string) {
    if (readOnly) return;
    setErrors((e) => ({ ...e, [kind]: '' }));
    try {
      const r = await fetch(`/api/s/${token}/files/${id}`, { method: 'DELETE' });
      if (r.ok) {
        dropPreviews([id]);
        onFilesChange(files.filter((f) => f.id !== id));
      }
      else fail(kind, r.status === 401 ? 'unauthorized' : r.status === 409 ? 'reviewed' : '', REMOVE_FALLBACK);
    } catch {
      fail(kind, '', REMOVE_FALLBACK);
    }
  }

  return (
    <div className="step">
      <h1>Sube tus documentos</h1>
      <p className="muted">{readOnly ? 'Estos son los documentos que subiste.' : 'Puedes tomar la foto con la cámara o elegir un archivo.'}</p>
      {sessionEnded && (
        <div className="notice" role="alert">
          <p>{MESSAGES.unauthorized}</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Ingresar de nuevo</button>
        </div>
      )}
      {FILE_KINDS.map((kind) => {
        const mine = files.filter((f) => f.kind === kind);
        const imagesOnly = kind === 'photo';
        return (
          <div className="card" key={kind} style={{ marginBottom: 16 }} data-file-kind={kind}>
            <h2>{FILE_LABELS[kind]}</h2>
            <p className="eyebrow">{REQUIRED_FILE_KINDS.includes(kind) ? 'Obligatorio' : 'Opcional'}</p>
            {mine.map((f, i) => (
              <p key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {previews[f.id]?.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previews[f.id].url!} alt={`Vista previa del archivo ${i + 1}`} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 12 }} />
                )}
                {previews[f.id] && !previews[f.id].isImage && <span className="pill" title={previews[f.id].name}>PDF · {previews[f.id].name}</span>}
                <span>✓ Archivo {i + 1} subido</span>{' '}
                {!readOnly && <button type="button" className="btn btn-ghost" style={{ minHeight: 40 }} onClick={() => void remove(kind, f.id)} disabled={busy !== null}>Quitar</button>}
              </p>
            ))}
            {readOnly && mine.length === 0 && <p className="muted">Sin archivos.</p>}
            {busy === kind && <p role="status">Subiendo…</p>}
            {errors[kind] && <p className="error" role="alert" style={{ color: 'var(--danger)' }}>{errors[kind]}</p>}
            {!readOnly && (
              <div style={{ display: 'grid', gap: 8 }}>
                <label className="btn btn-ghost">
                  {mine.length > 0 ? 'Tomar otra foto' : 'Tomar foto'}
                  <input className="sr-only" type="file" accept="image/*" capture="environment" disabled={busy !== null} onChange={(e) => { void add(kind, e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                <label className="btn btn-ghost">
                  {mine.length > 0 ? 'Reemplazar archivo' : 'Elegir archivo'}
                  <input className="sr-only" data-testid={`file-input-${kind}`} type="file" accept={imagesOnly ? 'image/*' : 'image/*,application/pdf'} disabled={busy !== null} onChange={(e) => { void add(kind, e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              </div>
            )}
          </div>
        );
      })}
      <div className="actions">
        <button className="btn btn-primary" onClick={next} disabled={busy !== null}>Continuar a revisión</button>
        <button className="btn btn-ghost" onClick={back}>Atrás</button>
      </div>
    </div>
  );
}
