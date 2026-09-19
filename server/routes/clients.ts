import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { getAccountContext } from '../planLimits.js';

const router = Router();

async function getAccountId(userId: number) {
  const ctx = await getAccountContext(userId);
  if (!ctx) throw new Error('Conta não encontrada');
  return ctx.accountId;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const accountId = await getAccountId(req.userId);
    const result = await pool.query(
      `SELECT c.* FROM clients c
       WHERE c.account_id = $1
       ORDER BY c.name`,
      [accountId]
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

router.post('/', requireAdmin, async (req, res) => {
  const userId = req.userId;
  const c = req.body;
  const id = c.id || Date.now().toString();
  try {
    const accountId = await getAccountId(userId);
    const existing = await pool.query('SELECT id, name, document, address, phone, email FROM clients WHERE id=$1 AND account_id=$2', [id, accountId]);
    if (existing.rows[0]) {
      await pool.query(
        'UPDATE clients SET name=$1, document=$2, address=$3, phone=$4, email=$5 WHERE id=$6 AND account_id=$7',
        [c.name, c.document || '', c.address || '', c.phone || '', c.email || '', id, accountId]
      );
      return res.status(200).json({ id, name: c.name, document: c.document || '', address: c.address || '', phone: c.phone || '', email: c.email || '' });
    }
    await pool.query(
      'INSERT INTO clients (id, account_id, user_id, name, document, address, phone, email) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, accountId, userId, c.name, c.document || '', c.address || '', c.phone || '', c.email || '']
    );
    res.status(201).json({ id, name: c.name, document: c.document || '', address: c.address || '', phone: c.phone || '', email: c.email || '' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao criar cliente' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const userId = req.userId;
  const { id } = req.params;
  const c = req.body;
  try {
    const accountId = await getAccountId(userId);
    const result = await pool.query(
      `UPDATE clients SET name=$1, document=$2, address=$3, phone=$4, email=$5
       WHERE id=$6 AND account_id=$7`,
      [c.name, c.document || '', c.address || '', c.phone || '', c.email || '', id, accountId]
    );
    if (result.rowCount === 0) {
      // Upsert: if client wasn't in DB yet, insert it with the specified ID
      await pool.query(
        'INSERT INTO clients (id, account_id, user_id, name, document, address, phone, email) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [id, accountId, userId, c.name, c.document || '', c.address || '', c.phone || '', c.email || '']
      );
    }
    res.json({ id, name: c.name, document: c.document || '', address: c.address || '', phone: c.phone || '', email: c.email || '' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const accountId = await getAccountId(req.userId);
    const result = await pool.query(
      'DELETE FROM clients WHERE id = $1 AND account_id=$2',
      [req.params.id, accountId]
    );
    if (result.rowCount === 0) return res.json({ success: true, alreadyDeleted: true });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao deletar cliente' });
  }
});

export default router;
