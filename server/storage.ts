import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

// Variáveis de ambiente necessárias (ver .env.example). Compatível com qualquer
// provedor S3-compatible (Backblaze B2, Cloudflare R2, Supabase Storage, etc.).
//
// O bucket é PRIVADO por design: nenhuma foto de cliente/atendimento é acessível
// por link direto. Toda leitura passa por uma URL assinada (presigned), gerada
// sob demanda e válida por tempo limitado — ver getDownloadUrl().
const {
  STORAGE_ENDPOINT,
  STORAGE_REGION,
  STORAGE_ACCESS_KEY_ID,
  STORAGE_SECRET_ACCESS_KEY,
  STORAGE_BUCKET_NAME,
} = process.env;

const storageConfigured = Boolean(
  STORAGE_ENDPOINT && STORAGE_ACCESS_KEY_ID && STORAGE_SECRET_ACCESS_KEY && STORAGE_BUCKET_NAME
);

export function isStorageConfigured() {
  return storageConfigured;
}

const s3 = storageConfigured
  ? new S3Client({
      region: STORAGE_REGION || 'auto',
      endpoint: STORAGE_ENDPOINT,
      credentials: {
        accessKeyId: STORAGE_ACCESS_KEY_ID!,
        secretAccessKey: STORAGE_SECRET_ACCESS_KEY!,
      },
    })
  : null;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_URL_TTL_SECONDS = 60 * 60;

export function isAllowedImage(mimetype: string, size: number) {
  return ALLOWED_MIME.has(mimetype) && size > 0 && size <= MAX_BYTES;
}

/**
 * Creates an account-scoped object key when accountId is supplied.
 * The optional argument keeps migration scripts and legacy callers compatible.
 */
export async function uploadImage(buffer: Buffer, mimetype: string, folder: string, accountId?: number): Promise<string> {
  if (!s3) throw new Error('Storage não configurado (variáveis STORAGE_* ausentes)');

  const ext = mimetype.split('/')[1] || 'jpg';
  const safeFolder = accountId != null ? `${folder}/${accountId}` : folder;
  const key = `${safeFolder}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: STORAGE_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
    })
  );

  return key;
}

export async function getDownloadUrl(key: string | null | undefined, expiresInSeconds = DEFAULT_URL_TTL_SECONDS): Promise<string | null> {
  if (!key) return null;
  if (!s3) return null;
  if (key.startsWith('data:') || key.startsWith('http')) return key;

  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: STORAGE_BUCKET_NAME, Key: key }),
    { expiresIn: expiresInSeconds }
  );
}

export async function deleteImageByKey(key: string | null | undefined): Promise<void> {
  if (!s3 || !key || key.startsWith('data:') || key.startsWith('http')) return;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: STORAGE_BUCKET_NAME, Key: key }));
  } catch (e) {
    console.error('Falha ao remover objeto do storage:', e);
  }
}
