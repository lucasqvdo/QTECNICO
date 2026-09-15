import { Router } from 'express';
import { pool } from '../db.js';
import { requireAdmin } from '../auth.js';

const router = Router();

function getStartDate(days: unknown) {
  const value = String(days ?? 'all');
  if (!['7', '30', '90', 'all'].includes(value)) return null;
  if (value === 'all') return null;
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - Number(value));
  return date.toISOString();
}

router.get('/summary', requireAdmin, async (req, res) => {
  try {
    const userId = req.userId;
    const userResult = await pool.query('SELECT account_id FROM users WHERE id = $1 AND is_admin = TRUE', [userId]);
    const accountId = userResult.rows[0]?.account_id;
    if (!accountId) return res.status(403).json({ error: 'Acesso administrativo não autorizado' });

    const startDate = getStartDate(req.query.days);
    const dateParams = startDate ? [accountId, startDate] : [accountId];
    const dateClause = startDate ? 'AND o.created_at >= $2' : '';
    const clientDateClause = startDate ? 'AND c.created_at >= $2' : '';

    const [stats, monthly, technicians, clients, recent] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE o.status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE o.status = 'in_progress')::int AS in_progress,
          COUNT(*) FILTER (WHERE o.status = 'completed')::int AS completed,
          COUNT(*) FILTER (WHERE o.status = 'cancelled')::int AS cancelled,
          COALESCE(SUM(o.client_value), 0)::numeric AS revenue,
          COALESCE((SELECT SUM(p.amount) FROM order_payments p WHERE p.account_id = $1 AND p.status = 'paid' ${startDate ? 'AND p.date >= $2' : ''}), 0)::numeric AS paid,
          COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.account_id = $1 ${startDate ? 'AND e.created_at >= $2' : ''}), 0)::numeric AS costs
        FROM orders o
        WHERE o.account_id = $1 ${dateClause}
      `, dateParams),
      pool.query(`
        SELECT to_char(date_trunc('month', o.date), 'YYYY-MM') AS month,
               COALESCE(SUM(o.client_value), 0)::numeric AS revenue,
               COUNT(*)::int AS orders
        FROM orders o
        WHERE o.account_id = $1 ${dateClause}
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 12
      `, dateParams),
      pool.query(`
        SELECT u.id, u.name,
               COUNT(o.id)::int AS orders,
               COUNT(o.id) FILTER (WHERE o.status = 'completed')::int AS completed,
               COALESCE(SUM(o.client_value), 0)::numeric AS revenue
        FROM users u
        LEFT JOIN orders o ON o.assigned_technician_id = u.id AND o.account_id = $1 ${dateClause.replace('o.created_at', 'o.created_at')}
        WHERE u.account_id = $1 AND u.is_admin = FALSE
        GROUP BY u.id, u.name
        ORDER BY completed DESC, orders DESC, u.name ASC
        LIMIT 10
      `, dateParams),
      pool.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE c.created_at >= date_trunc('month', CURRENT_DATE))::int AS new_this_month
        FROM clients c
        WHERE c.account_id = $1 ${clientDateClause}
      `, dateParams),
      pool.query(`
        SELECT o.id, o.client_name AS client, o.type, o.status, o.date,
               o.client_value::numeric AS value,
               o.assigned_technician_name AS technician
        FROM orders o
        WHERE o.account_id = $1 ${dateClause}
        ORDER BY o.created_at DESC
        LIMIT 8
      `, dateParams),
    ]);

    const row = stats.rows[0] ?? {};
    const revenue = Number(row.revenue || 0);
    const costs = Number(row.costs || 0);

    res.json({
      period: startDate ? String(req.query.days) : 'all',
      stats: {
        total: Number(row.total || 0),
        pending: Number(row.pending || 0),
        inProgress: Number(row.in_progress || 0),
        completed: Number(row.completed || 0),
        cancelled: Number(row.cancelled || 0),
        revenue,
        paid: Number(row.paid || 0),
        costs,
        margin: revenue - costs,
        clients: Number(clients.rows[0]?.total || 0),
        newClients: Number(clients.rows[0]?.new_this_month || 0),
      },
      monthly: monthly.rows.reverse().map((item) => ({ month: item.month, revenue: Number(item.revenue || 0), orders: Number(item.orders || 0) })),
      technicians: technicians.rows.map((item) => ({ id: item.id, name: item.name, orders: Number(item.orders || 0), completed: Number(item.completed || 0), revenue: Number(item.revenue || 0) })),
      recent: recent.rows.map((item) => ({ id: item.id, client: item.client, type: item.type, status: item.status, date: item.date, value: Number(item.value || 0), technician: item.technician || null })),
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ error: 'Erro ao carregar indicadores administrativos' });
  }
});

export default router;
