import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

async function fetchOrders(userId: number) {
  const ordersRes = await pool.query(
    'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  const orders = ordersRes.rows;
  if (orders.length === 0) return [];

  const orderIds = orders.map((o: any) => o.id);

  const [expRes, attRes, payRes] = await Promise.all([
    pool.query('SELECT * FROM expenses WHERE order_id = ANY($1)', [orderIds]),
    pool.query('SELECT * FROM attendances WHERE order_id = ANY($1) ORDER BY start_time ASC', [orderIds]),
    pool.query('SELECT * FROM order_payments WHERE order_id = ANY($1) ORDER BY date ASC', [orderIds]),
  ]);

  const attIds = attRes.rows.map((a: any) => a.id);
  const photoRes = attIds.length > 0
    ? await pool.query('SELECT * FROM attendance_photos WHERE attendance_id = ANY($1)', [attIds])
    : { rows: [] };

  const expensesByOrder: Record<string, any[]> = {};
  for (const e of expRes.rows) {
    if (!expensesByOrder[e.order_id]) expensesByOrder[e.order_id] = [];
    expensesByOrder[e.order_id].push({ id: e.id, label: e.label, amount: parseFloat(e.amount) });
  }

  const paymentsByOrder: Record<string, any[]> = {};
  for (const p of payRes.rows) {
    if (!paymentsByOrder[p.order_id]) paymentsByOrder[p.order_id] = [];
    paymentsByOrder[p.order_id].push({
      id: p.id,
      orderId: p.order_id,
      label: p.label,
      amount: parseFloat(p.amount),
      date: p.date instanceof Date ? p.date.toISOString().split('T')[0] : String(p.date).split('T')[0],
      status: p.status,
    });
  }

  const photosByAtt: Record<string, any[]> = {};
  for (const p of photoRes.rows) {
    if (!photosByAtt[p.attendance_id]) photosByAtt[p.attendance_id] = [];
    photosByAtt[p.attendance_id].push({ id: p.id, dataUrl: p.data_url, name: p.name });
  }

  const attsByOrder: Record<string, any[]> = {};
  for (const a of attRes.rows) {
    if (!attsByOrder[a.order_id]) attsByOrder[a.order_id] = [];
    attsByOrder[a.order_id].push({
      id: a.id,
      startTime: a.start_time instanceof Date ? a.start_time.toISOString() : a.start_time,
      endTime: a.end_time instanceof Date ? a.end_time.toISOString() : a.end_time,
      durationSeconds: a.duration_seconds,
      description: a.description,
      photos: photosByAtt[a.id] || [],
    });
  }

  return orders.map((o: any) => ({
    id: o.id,
    clientId: o.client_id,
    client: o.client_name,
    address: o.address,
    phone: o.phone,
    type: o.type,
    status: o.status,
    date: o.date instanceof Date ? o.date.toISOString().split('T')[0] : String(o.date).split('T')[0],
    priority: o.priority,
    description: o.description,
    clientValue: parseFloat(o.client_value),
    paymentStatus: o.payment_status,
    paidDate: o.paid_date
      ? (o.paid_date instanceof Date ? o.paid_date.toISOString().split('T')[0] : String(o.paid_date).split('T')[0])
      : undefined,
    paidAmount: o.paid_amount != null ? parseFloat(o.paid_amount) : undefined,
    clientSignature: o.client_signature ?? undefined,
    expenses: expensesByOrder[o.id] || [],
    attendances: attsByOrder[o.id] || [],
    payments: paymentsByOrder[o.id] || [],
  }));
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const orders = await fetchOrders((req as any).userId);
    res.json(orders);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const o = req.body;
  const now = new Date();
  const ym = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  const id = o.id || `OS-${ym}-${rand}`;

  try {
    await pool.query(
      `INSERT INTO orders (id, user_id, client_id, client_name, address, phone, type, status, date, priority, description, client_value, payment_status, paid_date, paid_amount, client_signature)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [id, userId, o.clientId, o.client, o.address || '', o.phone || '', o.type || '', o.status || 'pending',
       o.date, o.priority || 'medium', o.description || '', o.clientValue || 0,
       o.paymentStatus || 'pending', o.paidDate || null, o.paidAmount ?? null, o.clientSignature ?? null]
    );

    for (const e of (o.expenses || [])) {
      await pool.query(
        'INSERT INTO expenses (id, order_id, label, amount) VALUES ($1,$2,$3,$4)',
        [e.id || `${Date.now()}-${Math.random()}`, id, e.label, e.amount]
      );
    }

    const orders = await fetchOrders(userId);
    res.status(201).json(orders.find((x: any) => x.id === id));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao criar ordem' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const { id } = req.params;
  const o = req.body;

  try {
    await pool.query(
      `UPDATE orders SET client_id=$1, client_name=$2, address=$3, phone=$4, type=$5, status=$6,
       date=$7, priority=$8, description=$9, client_value=$10, payment_status=$11, paid_date=$12,
       paid_amount=$13, client_signature=$14
       WHERE id=$15 AND user_id=$16`,
      [o.clientId, o.client, o.address || '', o.phone || '', o.type || '', o.status,
       o.date, o.priority, o.description || '', o.clientValue,
       o.paymentStatus, o.paidDate || null,
       o.paidAmount ?? null, o.clientSignature ?? null, id, userId]
    );

    await pool.query('DELETE FROM expenses WHERE order_id = $1', [id]);
    for (const e of (o.expenses || [])) {
      await pool.query(
        'INSERT INTO expenses (id, order_id, label, amount) VALUES ($1,$2,$3,$4)',
        [e.id || `${Date.now()}-${Math.random()}`, id, e.label, e.amount]
      );
    }

    await pool.query('DELETE FROM order_payments WHERE order_id = $1', [id]);
    for (const p of (o.payments || [])) {
      await pool.query(
        'INSERT INTO order_payments (id, order_id, label, amount, date, status) VALUES ($1,$2,$3,$4,$5,$6)',
        [p.id || `pay-${Date.now()}-${Math.random()}`, id, p.label || 'Pagamento', p.amount, p.date, p.status || 'pending']
      );
    }

    await pool.query('DELETE FROM attendances WHERE order_id = $1', [id]);
    for (const a of (o.attendances || [])) {
      await pool.query(
        `INSERT INTO attendances (id, order_id, start_time, end_time, duration_seconds, description)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [a.id || `${Date.now()}-${Math.random()}`, id, a.startTime, a.endTime, a.durationSeconds, a.description || '']
      );
      for (const p of (a.photos || [])) {
        await pool.query(
          'INSERT INTO attendance_photos (id, attendance_id, data_url, name) VALUES ($1,$2,$3,$4)',
          [p.id || `${Date.now()}-${Math.random()}`, a.id, p.dataUrl, p.name || '']
        );
      }
    }

    const orders = await fetchOrders(userId);
    res.json(orders.find((x: any) => x.id === id));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao atualizar ordem' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM orders WHERE id = $1 AND user_id = $2', [id, userId]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao deletar ordem' });
  }
});

export default router;
