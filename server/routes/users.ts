import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

router.get('/me', requireAuth, async (req, res) => {
  const userId = (req as any).userId;
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
      photoUrl: u.photo_url || null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/me', requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const { name, role, phone, email, photoUrl } = req.body;
  try {
    await pool.query(
      'UPDATE users SET name=$1, role=$2, phone=$3, email=$4, photo_url=$5 WHERE id=$6',
      [name, role, phone, email, photoUrl || null, userId]
    );
    res.json({ id: userId, name, role, phone, email, photoUrl: photoUrl || null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

export default router;
