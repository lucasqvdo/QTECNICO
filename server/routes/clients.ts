import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const userId = req.userId;
  try {
    const result = await pool.query(
      'SELECT * FROM clients WHERE user_id = $1 ORDER BY name',
      [userId]
    );
    res.json(result.rows.map((c: any) => ({
      id: c.id, name: c.name, document: c.document,
      address: c.address, phone: c.phone, email: c.email,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const userId = req.userId;
  const c = req.body;
  const id = c.id || Date.now().toString();
  try {
    await pool.query(
      'INSERT INTO clients (id, user_id, name, document, address, phone, email) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, userId, c.name, c.document || '', c.address || '', c.phone || '', c.email || '']
    );
    res.status(201).json({ id, name: c.name, document: c.document || '', address: c.address || '', phone: c.phone || '', email: c.email || '' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao criar cliente' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  const userId = req.userId;
  const { id } = req.params;
  const c = req.body;
  try {
    await pool.query(
      'UPDATE clients SET name=$1, document=$2, address=$3, phone=$4, email=$5 WHERE id=$6 AND user_id=$7',
      [c.name, c.document || '', c.address || '', c.phone || '', c.email || '', id, userId]
    );
    res.json({ id, name: c.name, document: c.document || '', address: c.address || '', phone: c.phone || '', email: c.email || '' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  const userId = req.userId;
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM clients WHERE id = $1 AND user_id = $2', [id, userId]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao deletar cliente' });
  }
});

export default router;
