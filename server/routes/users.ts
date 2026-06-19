import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

router.get('/me', requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  try {
    const result = await pool.query(
      'SELECT id, name, role, phone, email FROM users WHERE id = $1',
      [userId]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/me', requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const { name, role, phone, email } = req.body;
  try {
    await pool.query(
      'UPDATE users SET name=$1, role=$2, phone=$3, email=$4 WHERE id=$5',
      [name, role, phone, email, userId]
    );
    res.json({ id: userId, name, role, phone, email });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

export default router;
