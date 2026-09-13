import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { getDownloadUrl } from '../storage.js';

const router = Router();

async function ensureAdminSchema() {
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE
  `);

  await pool.query(`
    UPDATE users
    SET is_admin = TRUE
    WHERE id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM users WHERE is_admin = TRUE)
  `);
}

router.get('/me', requireAuth, async (req, res) => {
  const userId = req.userId;
  try {
    await ensureAdminSchema();
    const result = await pool.query(
      'SELECT id, name, role, phone, email, photo_url, is_admin FROM users WHERE id = $1',
      [userId]
    );
    const u = result.rows[0];
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({
      id: u.id,
      name: u.name,
      role: u.role || '',
      phone: u.phone || '',
      email: u.email,
      isAdmin: Boolean(u.is_admin),
      photoUrl: await getDownloadUrl(u.photo_url),
      photoKey: u.photo_url || null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/admin/access', async (req, res) => {
  try {
    await ensureAdminSchema();
    return requireAdmin(req, res, () => {
      res.json({ allowed: true });
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro ao validar acesso administrativo' });
  }
});

router.put('/me', requireAuth, async (req, res) => {
  const userId = req.userId;
  // Role and admin privileges are server-controlled. A profile update must
  // never be able to self-promote a user to an administrative role.
  const { name, phone, email, photoKey } = req.body;
  try {
    const current = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });

    await pool.query(
      'UPDATE users SET name=$1, phone=$2, email=$3, photo_url=$4 WHERE id=$5',
      [name, phone, email, photoKey || null, userId]
    );
    res.json({
      id: userId,
      name,
      role: current.rows[0].role || '',
      phone,
      email,
      photoUrl: await getDownloadUrl(photoKey || null),
      photoKey: photoKey || null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

export default router;
