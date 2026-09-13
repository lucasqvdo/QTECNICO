import { Router } from 'express';
import bcrypt from 'bcryptjs';
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

// Administrative team management. Password hashes and other secrets never
// leave the server; only the fields required by the admin UI are returned.
router.get('/admin/team', requireAdmin, async (_req, res) => {
  try {
    await ensureAdminSchema();
    const result = await pool.query(
      `SELECT id, name, role, phone, email, is_admin, created_at
       FROM users
       ORDER BY name ASC, id ASC`
    );
    res.json(result.rows.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role || 'Técnico',
      phone: u.phone || '',
      email: u.email,
      isAdmin: Boolean(u.is_admin),
      createdAt: u.created_at,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao carregar equipe' });
  }
});

router.post('/admin/team', requireAdmin, async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
  const role = typeof req.body.role === 'string' && req.body.role.trim() ? req.body.role.trim() : 'Técnico';

  if (!name || !email || !password) return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
  if (password.length < 6) return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' });

  try {
    await ensureAdminSchema();
    const exists = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'E-mail já cadastrado' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, role, phone, email, password_hash, is_admin)
       VALUES ($1, $2, $3, $4, $5, FALSE)
       RETURNING id, name, role, phone, email, is_admin, created_at`,
      [name, role, phone, email, hash]
    );
    const u = result.rows[0];
    res.status(201).json({
      id: u.id,
      name: u.name,
      role: u.role || 'Técnico',
      phone: u.phone || '',
      email: u.email,
      isAdmin: false,
      createdAt: u.created_at,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao criar conta do técnico' });
  }
});

router.delete('/admin/team/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const requesterId = req.userId;
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Técnico inválido' });
  if (id === requesterId) return res.status(400).json({ error: 'A conta administrativa atual não pode ser removida por ela mesma' });

  try {
    await ensureAdminSchema();
    const target = await pool.query('SELECT id, is_admin FROM users WHERE id = $1', [id]);
    if (!target.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (target.rows[0].is_admin) return res.status(400).json({ error: 'Remova o privilégio administrativo antes de excluir um administrador' });

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao remover técnico' });
  }
});

router.put('/me', requireAuth, async (req, res) => {
  const userId = req.userId;
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
