import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';
import { getAccountContext } from '../planLimits.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const userId = req.userId;
  const ctx = await getAccountContext(userId);
  if (!ctx) return res.status(404).json({ error: 'Conta não encontrada' });

  let ordersThisMonth = 0;
  if (ctx.plan.limits.maxOrdersPerMonth !== null) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int as count FROM orders
       WHERE user_id = $1 AND date_trunc('month', created_at) = date_trunc('month', NOW())`,
      [userId]
    );
    ordersThisMonth = rows[0].count;
  }

  res.json({
    plan: ctx.plan.key,
    planName: ctx.plan.name,
    limits: ctx.plan.limits,
    features: ctx.plan.features,
    usage: {
      ordersThisMonth,
      ordersLimit: ctx.plan.limits.maxOrdersPerMonth,
    },
  });
});

export default router;
