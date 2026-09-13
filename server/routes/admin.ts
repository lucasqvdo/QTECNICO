import { Router } from 'express';
import { pool } from '../db.js';
import { requireAdmin } from '../auth.js';

const router = Router();

async function ensureAdminSchema() {
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE
  `);

  // The first account is the initial system owner/admin. New accounts remain
  // non-admin by default. This is idempotent and does not change existing
  // administrator assignments.
  await pool.query(`
    UPDATE users
    SET is_admin = TRUE
    WHERE id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM users WHERE is_admin = TRUE)
  `);
}

router.get('/access', async (req, res) => {
  try {
    await ensureAdminSchema();
    return requireAdmin(req, res, () => {
      res.json({ allowed: true });
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Não foi possível validar o acesso administrativo' });
  }
});

export default router;
