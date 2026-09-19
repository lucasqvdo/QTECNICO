import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireAuth } from '../auth.js';
import { pool } from '../db.js';
import { uploadImage, isAllowedImage, isStorageConfigured, getDownloadUrl, deleteImageByKey } from '../storage.js';
import { getAccountContext } from '../planLimits.js';

const router = Router();
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ORPHAN_CHECK_DELAY_MS = 15 * 60 * 1000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

const ALLOWED_FOLDERS = new Set(['attendances', 'signatures', 'profiles']);

router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado (campo "file").' });
  if (!isAllowedImage(file.mimetype, file.size)) {
    return res.status(400).json({ error: 'Arquivo inválido: envie uma imagem (jpg/png/webp/heic) de até 10MB.' });
  }

  if (!isStorageConfigured()) {
    const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    return res.json({ key: dataUrl, url: dataUrl });
  }

  const folderParam = String(req.body?.folder || 'attendances');
  const folder = ALLOWED_FOLDERS.has(folderParam) ? folderParam : 'attendances';

  try {
    const ctx = await getAccountContext(req.userId);
    if (!ctx) return res.status(403).json({ error: 'Conta não encontrada' });

    const key = await uploadImage(file.buffer, file.mimetype, folder, ctx.accountId);

    if (folder === 'attendances') {
      setTimeout(async () => {
        try {
          const referenced = await pool.query(
            'SELECT 1 FROM attendance_photos WHERE account_id = $1 AND data_url = $2 LIMIT 1',
            [ctx.accountId, key]
          );
          if (referenced.rows.length === 0) {
            await deleteImageByKey(key);
            console.info('Upload de atendimento não associado removido do storage:', key);
          }
        } catch (cleanupError) {
          console.error('Falha ao verificar upload órfão:', cleanupError);
        }
      }, ORPHAN_CHECK_DELAY_MS).unref?.();
    }

    const url = await getDownloadUrl(key);
    res.json({ key, url });
  } catch (e) {
    console.error('Erro no upload de imagem:', e);
    res.status(500).json({ error: 'Erro ao enviar imagem' });
  }
});

router.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Arquivo muito grande: o limite é 10MB.' });
  console.error('Erro no upload:', err);
  res.status(500).json({ error: 'Erro ao processar upload.' });
});

export default router;
