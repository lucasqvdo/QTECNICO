import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

// Backoffice is restricted to platform administrators. We deliberately do not
// expose tenant/account data through the normal company-admin APIs.
async function requireBackofficeAdmin(req: any, res: any, next: any) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Não autenticado' });
    const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows[0]?.is_admin) return res.status(403).json({ error: 'Acesso restrito ao Backoffice QTECNICO' });
    next();
  } catch (error) {
    console.error('Backoffice authorization error:', error);
    res.status(500).json({ error: 'Erro ao validar acesso' });
  }
}

router.get('/accounts', requireAuth, requireBackofficeAdmin, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.id, COALESCE(cp.trade_name, cp.legal_name, 'Sem empresa') AS company,
             COALESCE(cp.document, '') AS document,
             COALESCE(u.name, '') AS owner, COALESCE(u.email, '') AS email,
             a.plan_key AS plan, a.subscription_status AS status,
             a.current_period_end AS period_end, a.created_at
      FROM accounts a
      LEFT JOIN company_profiles cp ON cp.account_id = a.id
      LEFT JOIN users u ON u.id = a.owner_user_id
      ORDER BY a.created_at DESC
    `);
    res.json({ accounts: result.rows.map(r => ({ id:r.id, company:r.company, document:r.document, owner:r.owner, email:r.email, plan:r.plan, status:r.status, periodEnd:r.period_end, createdAt:r.created_at })) });
  } catch (error) {
    console.error('Backoffice accounts error:', error);
    res.status(500).json({ error: 'Não foi possível carregar as contas' });
  }
});

export default router;
