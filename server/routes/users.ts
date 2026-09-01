import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';
import { getDownloadUrl } from '../storage.js';

const router = Router();

router.get('/me', requireAuth, async (req, res) => {
  const userId = req.userId;
  try {
    const result = await pool.query(
      'SELECT id, name, role, phone, email, photo_url FROM users WHERE id = $1',
      [userId]
    );
    const u = result.rows[0];
    res.json({
      id: u.id,
      name: u.name,
      role: u.role || '',
      phone: u.phone || '',
      email: u.email,
      photoUrl: await getDownloadUrl(u.photo_url),
      photoKey: u.photo_url || null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/me', requireAuth, async (req, res) => {
  const userId = req.userId;
  // photoKey é o que deve ser persistido (chave do bucket privado). Mantemos
  // aceitar photoUrl por retrocompatibilidade, mas ele nunca deve ser salvo
  // como está — só photoKey (ou, em dados legados, um valor que já não seja
  // uma URL assinada) vai para a coluna.
  const { name, role, phone, email, photoKey } = req.body;
  try {
    await pool.query(
      'UPDATE users SET name=$1, role=$2, phone=$3, email=$4, photo_url=$5 WHERE id=$6',
      [name, role, phone, email, photoKey || null, userId]
    );
    res.json({
      id: userId, name, role, phone, email,
      photoUrl: await getDownloadUrl(photoKey || null),
      photoKey: photoKey || null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

export default router;
