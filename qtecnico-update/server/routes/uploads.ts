import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../auth.js';
import { uploadImage, isAllowedImage, isStorageConfigured, getDownloadUrl } from '../storage.js';

const router = Router();

// Guarda o arquivo em memória (buffer) — não escreve em disco, só repassa pro storage.
const upload = multer({ storage: multer.memoryStorage() });

// folder é restrito a um conjunto conhecido para não deixar o cliente escrever
// em qualquer "pasta" arbitrária do bucket.
const ALLOWED_FOLDERS = new Set(['attendances', 'signatures', 'profiles']);

router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  if (!isStorageConfigured()) {
    return res.status(503).json({
      error: 'Storage de imagens não configurado no servidor (variáveis STORAGE_* ausentes).',
    });
  }

  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado (campo "file").' });
  }

  if (!isAllowedImage(file.mimetype, file.size)) {
    return res.status(400).json({ error: 'Arquivo inválido: envie uma imagem (jpg/png/webp/heic) de até 10MB.' });
  }

  const folderParam = String(req.body?.folder || 'attendances');
  const folder = ALLOWED_FOLDERS.has(folderParam) ? folderParam : 'attendances';

  try {
    const key = await uploadImage(file.buffer, file.mimetype, folder);
    // `key` é o que o frontend deve reenviar depois para o app salvar a ordem
    // (é o valor persistido no banco). `url` é só para exibir a prévia
    // imediatamente após o upload — expira em 1h, não deve ser guardada.
    const url = await getDownloadUrl(key);
    res.json({ key, url });
  } catch (e) {
    console.error('Erro no upload de imagem:', e);
    res.status(500).json({ error: 'Erro ao enviar imagem' });
  }
});

export default router;
