/** A deterministic failure (HTTP 4xx): retrying the same request cannot succeed. `message` is the server's error code. */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 800): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof NonRetryableError) throw e;
      last = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw last;
}

/** Throws NonRetryableError for any 4xx (code = 'unauthorized' on 401, 'reviewed' on 409, else the server's error code) and a plain Error for 5xx. */
async function ensureOk(r: Response, fallback: string): Promise<void> {
  if (r.ok) return;
  const body = (await r.json().catch(() => ({}))) as { error?: string };
  if (r.status === 401) throw new NonRetryableError('unauthorized');
  if (r.status === 409) throw new NonRetryableError('reviewed');
  if (r.status >= 400 && r.status < 500) throw new NonRetryableError(body.error ?? fallback);
  throw new Error(body.error ?? fallback);
}

/** Downscales large photos before upload; falls back to the original if the browser can't decode it. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', quality));
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}

export async function uploadFile(token: string, kind: string, file: File): Promise<{ id: string }> {
  const blob = await compressImage(file);
  const mimeType = blob.type || file.type;
  const json = { 'content-type': 'application/json' };

  const presign = await withRetry(async () => {
    const r = await fetch(`/api/s/${token}/files/presign`, { method: 'POST', headers: json, body: JSON.stringify({ kind, mimeType, size: blob.size }) });
    await ensureOk(r, 'presign');
    return (await r.json()) as { uploadUrl: string; objectKey: string };
  });
  await withRetry(async () => {
    const r = await fetch(presign.uploadUrl, { method: 'PUT', headers: { 'content-type': mimeType }, body: blob });
    // A 4xx from storage (expired URL, size/signature mismatch) cannot succeed on retry; 5xx and network errors can.
    if (r.status >= 400 && r.status < 500) throw new NonRetryableError('upload_rejected');
    if (!r.ok) throw new Error('upload');
  });
  return withRetry(async () => {
    const r = await fetch(`/api/s/${token}/files/complete`, { method: 'POST', headers: json, body: JSON.stringify({ kind, objectKey: presign.objectKey, mimeType }) });
    await ensureOk(r, 'complete');
    return (await r.json()) as { id: string };
  });
}
