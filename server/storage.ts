import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

// Variáveis de ambiente necessárias (ver .env.example). Compatível com qualquer
// provedor S3-compatible (Backblaze B2, Cloudflare R2, Supabase Storage, etc.).
//
// O bucket é PRIVADO por design: nenhuma foto de cliente/atendimento é acessível
// por link direto. Toda leitura passa por uma URL assinada (presigned), gerada
// sob demanda e válida por tempo limitado — ver getDownloadUrl().
//
// STORAGE_ENDPOINT     - endpoint S3 do provedor (ex: https://s3.us-west-004.backblazeb2.com)
// STORAGE_REGION        - região exigida pelo SDK (Backblaze: ex 'us-west-004'; R2: 'auto')
// STORAGE_ACCESS_KEY_ID / STORAGE_SECRET_ACCESS_KEY - credenciais da API do bucket
// STORAGE_BUCKET_NAME   - nome do bucket
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
const MAX_BYTES = 10 * 1024 * 1024; // 10MB por arquivo
const DEFAULT_URL_TTL_SECONDS = 60 * 60; // 1 hora

export function isAllowedImage(mimetype: string, size: number) {
  return ALLOWED_MIME.has(mimetype) && size > 0 && size <= MAX_BYTES;
}

/**
 * Sobe um buffer de imagem para o bucket configurado e retorna a KEY do objeto
 * (não uma URL — o bucket é privado, então a key é o que deve ser persistido
 * no banco; a URL de exibição é gerada sob demanda por getDownloadUrl()).
 * `folder` organiza os arquivos (ex: 'attendances', 'signatures', 'profiles').
 */
export async function uploadImage(buffer: Buffer, mimetype: string, folder: string): Promise<string> {
  if (!s3) throw new Error('Storage não configurado (variáveis STORAGE_* ausentes)');

  const ext = mimetype.split('/')[1] || 'jpg';
  const key = `${folder}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;

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

/**
 * Gera uma URL assinada e temporária para exibir/baixar um objeto do bucket
 * privado. `key` é o valor salvo no banco (retornado por uploadImage).
 * Retorna null se a key estiver vazia/nula (nenhuma foto salva ainda).
 */
export async function getDownloadUrl(key: string | null | undefined, expiresInSeconds = DEFAULT_URL_TTL_SECONDS): Promise<string | null> {
  if (!key) return null;
  if (!s3) return null;
  // Compatibilidade com dados legados que ainda tenham uma data: URL (base64) —
  // nesse caso não há o que assinar, retorna como está.
  if (key.startsWith('data:') || key.startsWith('http')) return key;

  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: STORAGE_BUCKET_NAME, Key: key }),
    { expiresIn: expiresInSeconds }
  );
}

/** Remove um objeto do bucket a partir da key salva no banco. */
export async function deleteImageByKey(key: string | null | undefined): Promise<void> {
  if (!s3 || !key || key.startsWith('data:') || key.startsWith('http')) return;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: STORAGE_BUCKET_NAME, Key: key }));
  } catch (e) {
    // Não derruba a requisição principal por causa de uma falha de limpeza de storage.
    console.error('Falha ao remover objeto do storage:', e);
  }
}
