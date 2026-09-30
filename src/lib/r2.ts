import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const SIGNED_URL_TTL_SECONDS = 300;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

let s3: S3Client | undefined;
function client(): S3Client {
  s3 ??= new S3Client({
    region: 'auto',
    endpoint: `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY') },
    // Recent SDK versions add checksum headers by default, which break browser PUTs against R2 presigned URLs.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return s3;
}

export const presignPut = (key: string, contentType: string, size: number): Promise<string> =>
  getSignedUrl(client(), new PutObjectCommand({ Bucket: env('R2_BUCKET'), Key: key, ContentType: contentType, ContentLength: size }), { expiresIn: SIGNED_URL_TTL_SECONDS });

/** Keeps only [A-Za-z0-9._-] so the value is safe inside a quoted Content-Disposition filename. */
export const sanitizeFilename = (name: string): string => name.replace(/[^A-Za-z0-9._-]/g, '');

export const presignGet = (key: string, filename?: string): Promise<string> => {
  const safe = filename ? sanitizeFilename(filename) : '';
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: env('R2_BUCKET'), Key: key, ResponseContentDisposition: safe ? `attachment; filename="${safe}"` : undefined }),
    { expiresIn: SIGNED_URL_TTL_SECONDS },
  );
};

export async function headObject(key: string): Promise<{ size: number; contentType: string } | null> {
  try {
    const r = await client().send(new HeadObjectCommand({ Bucket: env('R2_BUCKET'), Key: key }));
    return { size: r.ContentLength ?? 0, contentType: r.ContentType ?? '' };
  } catch (e) {
    // Only a genuinely missing object is "null"; credential, network or throttling errors must surface.
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}

export async function deleteObjects(keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    const r = await client().send(new DeleteObjectsCommand({ Bucket: env('R2_BUCKET'), Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }));
    if (r.Errors?.length) throw new Error(`R2 failed to delete ${r.Errors.length} object(s)`);
  }
}

export async function listObjectKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const r = await client().send(new ListObjectsV2Command({ Bucket: env('R2_BUCKET'), Prefix: prefix, ContinuationToken: continuationToken }));
    if (r.Contents) {
      for (const obj of r.Contents) {
        if (obj.Key) keys.push(obj.Key);
      }
    }
    if (!r.IsTruncated) break;
    continuationToken = r.NextContinuationToken;
  }
  return keys;
}
