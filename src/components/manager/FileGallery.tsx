'use client';
import { useState } from 'react';

interface GalleryFile { id: string; label: string; mimeType: string; sizeKb: number }

function ImagePreview({ id, label }: { id: string; label: string }) {
  const [nonce, setNonce] = useState(0);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div role="alert">
        <p className="muted" style={{ margin: 0 }}>No se pudo cargar la vista previa.</p>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 40 }} onClick={() => { setFailed(false); setNonce((n) => n + 1); }}>Reintentar</button>
      </div>
    );
  }
  return (
    // The route 302-redirects to a short-lived signed R2 URL, which the browser follows.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/manager/files/${id}?t=${nonce}`} alt={label} loading="lazy" onError={() => setFailed(true)} style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 12, objectFit: 'contain' }} />
  );
}

export function FileGallery({ files }: { files: GalleryFile[] }) {
  if (files.length === 0) return <p className="muted">Sin archivos.</p>;
  return (
    <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 16 }}>
      {files.map((f) => {
        const isImage = f.mimeType.startsWith('image/');
        return (
          <li key={f.id} style={{ display: 'grid', gap: 8 }}>
            <strong>{f.label}</strong>
            <span className="muted">{f.mimeType.split('/')[1]}, {f.sizeKb} KB</span>
            {isImage
              ? <ImagePreview id={f.id} label={f.label} />
              : <p style={{ margin: 0 }}><span className="pill">PDF</span> <a href={`/api/manager/files/${f.id}`} target="_blank" rel="noreferrer">Abrir</a></p>}
            <p style={{ margin: 0 }}><a href={`/api/manager/files/${f.id}?download=1`}>Descargar</a></p>
          </li>
        );
      })}
    </ul>
  );
}
