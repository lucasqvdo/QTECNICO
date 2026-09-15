import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireAuth } from '../auth.js';
import { pool } from '../db.js';
import { uploadImage, isAllowedImage, isStorageConfigured, getDownloadUrl, deleteImageByKey } from '../storage.js';

const router = Router();

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB — deve ser igual ao MAX_BYTES em storage.ts
const ORPHAN_CHECK_DELAY_MS = 15 * 60 * 1000; // dá tempo para o frontend concluir a associação

// Guarda o arquivo em memória (buffer) — não escreve em disco, só repassa pro storage.
// O limite de fileSize rejeita o upload ANTES de carregar o arquivo inteiro na memória,
// evitando que arquivos gigantes esgotem a RAM do servidor (DoS).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

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

    // Atendimento usa um fluxo em duas etapas: upload -> associação ao atendimento.
    // Se a segunda etapa nunca acontecer (cancelamento, fechamento do app, falha de rede,
    // etc.), a imagem não deve ficar indefinidamente órfã no B2. Fazemos uma verificação
    // tardia somente para objetos da pasta de atendimentos; os fluxos de assinatura/perfil
    // permanecem inalterados.
    if (folder === 'attendances') {
      setTimeout(async () => {
        try {
          const referenced = await pool.query(
            'SELECT 1 FROM attendance_photos WHERE data_url = $1 LIMIT 1',
            [key]
          );
          if (referenced.rows.length === 0) {
            await deleteImageByKey(key);
            console.info('Upload de atendimento não associado removido do storage:', key);
          }
        } catch (cleanupError) {
          // A limpeza é best-effort; uma falha aqui não afeta a requisição original.
          console.error('Falha ao verificar upload órfão:', cleanupError);
        }
      }, ORPHAN_CHECK_DELAY_MS).unref?.();
    }

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

// Handler de erros do multer — converte LIMIT_FILE_SIZE numa resposta 400 legível,
// em vez de deixar o Express retornar um 500 genérico.
router.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Arquivo muito grande: o limite é 10MB.' });
  }
  console.error('Erro no upload:', err);
  res.status(500).json({ error: 'Erro ao processar upload.' });
});

export default router;
