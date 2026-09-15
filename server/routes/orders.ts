import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';
import { enforceOrderLimit, assertPhotoLimit, getAccountContext } from '../planLimits.js';
import { deleteImageByKey, getDownloadUrl } from '../storage.js';

const router = Router();

async function getAccessContext(userId: number) {
  const { rows } = await pool.query(`SELECT u.is_admin, u.account_id FROM users u WHERE u.id = $1`, [userId]);
  if (!rows[0]?.account_id) throw new Error('Conta não encontrada');
  return { accountId: rows[0].account_id as number, isAdmin: Boolean(rows[0].is_admin) };
}

function isSafeStorageKey(key: unknown, accountId: number, folder: string) {
  if (typeof key !== 'string' || !key) return false;
  if (key.startsWith('data:') || key.startsWith('http')) return true;
  return key.startsWith(`${folder}/${accountId}/`);
}

async function cleanupStorageKeyIfUnreferenced(key: string | null | undefined, accountId: number) {
  if (!key || key.startsWith('data:') || key.startsWith('http')) return;
  const [photoRef, signatureRef] = await Promise.all([
    pool.query('SELECT 1 FROM attendance_photos WHERE account_id=$1 AND data_url=$2 LIMIT 1', [accountId, key]),
    pool.query('SELECT 1 FROM orders WHERE account_id=$1 AND client_signature=$2 LIMIT 1', [accountId, key]),
  ]);
  if (!photoRef.rows[0] && !signatureRef.rows[0]) await deleteImageByKey(key);
}

async function cleanupStorageKeysIfUnreferenced(keys: Iterable<string>, accountId: number) {
  const uniqueKeys = [...new Set([...keys].filter(Boolean))];
  await Promise.all(uniqueKeys.map((key) => cleanupStorageKeyIfUnreferenced(key, accountId)));
}

async function fetchOrders(userId: number) {
  const { accountId, isAdmin } = await getAccessContext(userId);
  const ordersRes = await pool.query(
    isAdmin
      ? `SELECT o.* FROM orders o WHERE o.account_id = $1 ORDER BY o.created_at DESC`
      : `SELECT o.* FROM orders o WHERE o.account_id = $2 AND (o.user_id = $1 OR o.assigned_technician_id = $1) ORDER BY o.created_at DESC`,
    isAdmin ? [accountId] : [userId, accountId]
  );
  const orders = ordersRes.rows;
  if (orders.length === 0) return [];
  const orderIds = orders.map((o: any) => o.id);
  const [expRes, attRes, payRes] = await Promise.all([
    pool.query('SELECT * FROM expenses WHERE account_id = $1 AND order_id = ANY($2)', [accountId, orderIds]),
    pool.query('SELECT * FROM attendances WHERE account_id = $1 AND order_id = ANY($2) ORDER BY start_time ASC', [accountId, orderIds]),
    pool.query('SELECT * FROM order_payments WHERE account_id = $1 AND order_id = ANY($2) ORDER BY date ASC', [accountId, orderIds]),
  ]);
  const attIds = attRes.rows.map((a: any) => a.id);
  const photoRes = attIds.length > 0 ? await pool.query('SELECT * FROM attendance_photos WHERE account_id = $1 AND attendance_id = ANY($2)', [accountId, attIds]) : { rows: [] };
  const expensesByOrder: Record<string, any[]> = {};
  for (const e of expRes.rows) (expensesByOrder[e.order_id] ||= []).push({ id: e.id, label: e.label, amount: parseFloat(e.amount) });
  const paymentsByOrder: Record<string, any[]> = {};
  for (const p of payRes.rows) (paymentsByOrder[p.order_id] ||= []).push({ id: p.id, orderId: p.order_id, label: p.label, amount: parseFloat(p.amount), date: p.date instanceof Date ? p.date.toISOString().split('T')[0] : String(p.date).split('T')[0], status: p.status });
  const photosByAtt: Record<string, any[]> = {};
  const photoEntries = await Promise.all(photoRes.rows.map(async (p: any) => ({ attendanceId: p.attendance_id, photo: { id: p.id, key: p.data_url, dataUrl: await getDownloadUrl(p.data_url), name: p.name } })));
  for (const { attendanceId, photo } of photoEntries) (photosByAtt[attendanceId] ||= []).push(photo);
  const attsByOrder: Record<string, any[]> = {};
  for (const a of attRes.rows) (attsByOrder[a.order_id] ||= []).push({ id: a.id, startTime: a.start_time instanceof Date ? a.start_time.toISOString() : a.start_time, endTime: a.end_time instanceof Date ? a.end_time.toISOString() : a.end_time, durationSeconds: a.duration_seconds, description: a.description, photos: photosByAtt[a.id] || [] });
  return Promise.all(orders.map(async (o: any) => ({ id: o.id, clientId: o.client_id, client: o.client_name, address: o.address, phone: o.phone, type: o.type, status: o.status, date: o.date instanceof Date ? o.date.toISOString().split('T')[0] : String(o.date).split('T')[0], priority: o.priority, description: o.description, clientValue: parseFloat(o.client_value), paymentStatus: o.payment_status, paidDate: o.paid_date ? (o.paid_date instanceof Date ? o.paid_date.toISOString().split('T')[0] : String(o.paid_date).split('T')[0]) : undefined, paidAmount: o.paid_amount != null ? parseFloat(o.paid_amount) : undefined, clientSignature: (await getDownloadUrl(o.client_signature)) ?? undefined, clientSignatureKey: o.client_signature ?? undefined, assignedTechnicianId: o.assigned_technician_id ?? undefined, assignedTechnicianName: o.assigned_technician_name ?? undefined, expenses: expensesByOrder[o.id] || [], attendances: attsByOrder[o.id] || [], payments: paymentsByOrder[o.id] || [] })));
}

router.get('/', requireAuth, async (req, res) => {
  try { res.json(await fetchOrders(req.userId)); } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

router.post('/', requireAuth, enforceOrderLimit(), async (req, res) => {
  const userId = req.userId;
  const o = req.body;
  const now = new Date();
  const ym = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  const id = o.id || `OS-${ym}-${rand}`;
  try {
    const { accountId } = await getAccessContext(userId);
    if (o.clientId != null) {
      const client = await pool.query('SELECT id, name FROM clients WHERE id=$1 AND account_id=$2', [o.clientId, accountId]);
      if (!client.rows[0]) return res.status(400).json({ error: 'Cliente não pertence à conta' });
      if (!o.client) o.client = client.rows[0].name;
    }
    if (o.assignedTechnicianId != null) {
      const tech = await pool.query('SELECT id, name FROM users WHERE id=$1 AND account_id=$2', [o.assignedTechnicianId, accountId]);
      if (!tech.rows[0]) return res.status(400).json({ error: 'Técnico não pertence à conta' });
      o.assignedTechnicianName = tech.rows[0].name;
    }
    if (o.clientSignatureKey != null && !isSafeStorageKey(o.clientSignatureKey, accountId, 'signatures')) return res.status(400).json({ error: 'Assinatura inválida para esta conta' });
    await pool.query(`INSERT INTO orders (id, account_id, user_id, client_id, client_name, address, phone, type, status, date, priority, description, client_value, payment_status, paid_date, paid_amount, client_signature, assigned_technician_id, assigned_technician_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`, [id, accountId, userId, o.clientId, o.client, o.address || '', o.phone || '', o.type || '', o.status || 'pending', o.date, o.priority || 'medium', o.description || '', o.clientValue || 0, o.paymentStatus || 'pending', o.paidDate || null, o.paidAmount ?? null, o.clientSignatureKey ?? null, o.assignedTechnicianId ?? null, o.assignedTechnicianName ?? null]);
    for (const e of (o.expenses || [])) await pool.query('INSERT INTO expenses (id, account_id, order_id, label, amount) VALUES ($1,$2,$3,$4,$5)', [e.id || `${Date.now()}-${Math.random()}`, accountId, id, e.label, e.amount]);
    const orders = await fetchOrders(userId);
    res.status(201).json(orders.find((x: any) => x.id === id));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao criar ordem' }); }
});

router.put('/:id', requireAuth, async (req, res) => {
  const userId = req.userId;
  const { id } = req.params;
  const o = req.body || {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(o, key);
  const db = await pool.connect();

  try {
    const { accountId, isAdmin } = await getAccessContext(userId);
    await db.query('BEGIN');

    const existingRes = await db.query(
      `SELECT o.* FROM orders o WHERE o.id = $1 AND o.account_id = $2 AND ${isAdmin ? 'TRUE' : '(o.user_id = $3 OR o.assigned_technician_id = $3)'} FOR UPDATE`,
      isAdmin ? [id, accountId] : [id, accountId, userId]
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Ordem não encontrada' });
    }

    if (isAdmin && has('clientId') && o.clientId != null) {
      const client = await db.query('SELECT id FROM clients WHERE id=$1 AND account_id=$2', [o.clientId, accountId]);
      if (!client.rows[0]) {
        await db.query('ROLLBACK');
        return res.status(400).json({ error: 'Cliente não pertence à conta' });
      }
    }

    if (isAdmin && has('assignedTechnicianId') && o.assignedTechnicianId != null) {
      const tech = await db.query('SELECT id, name FROM users WHERE id=$1 AND account_id=$2', [o.assignedTechnicianId, accountId]);
      if (!tech.rows[0]) {
        await db.query('ROLLBACK');
        return res.status(400).json({ error: 'Técnico não pertence à conta' });
      }
      o.assignedTechnicianName = tech.rows[0].name;
    }

    if (isAdmin && has('clientSignatureKey') && o.clientSignatureKey != null && !isSafeStorageKey(o.clientSignatureKey, accountId, 'signatures')) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: 'Assinatura inválida para esta conta' });
    }

    const clientId = isAdmin && has('clientId') ? (o.clientId ?? null) : existing.client_id;
    const clientName = isAdmin && has('client') ? (o.client ?? '') : existing.client_name;
    const address = isAdmin && has('address') ? (o.address ?? '') : existing.address;
    const phone = isAdmin && has('phone') ? (o.phone ?? '') : existing.phone;
    const type = isAdmin && has('type') ? (o.type ?? '') : existing.type;
    const status = has('status') ? (o.status ?? existing.status) : existing.status;
    const date = isAdmin && has('date') ? o.date : existing.date;
    const priority = isAdmin && has('priority') ? o.priority : existing.priority;
    const description = has('description') ? (o.description ?? '') : existing.description;
    const clientValue = isAdmin && has('clientValue') ? (o.clientValue ?? 0) : existing.client_value;
    const paymentStatus = isAdmin && has('paymentStatus') ? (o.paymentStatus ?? 'pending') : existing.payment_status;
    const paidDate = isAdmin && has('paidDate') ? (o.paidDate || null) : existing.paid_date;
    const paidAmount = isAdmin && has('paidAmount') ? (o.paidAmount ?? null) : existing.paid_amount;
    const clientSignature = isAdmin && has('clientSignatureKey') ? (o.clientSignatureKey ?? null) : existing.client_signature;
    const assignedTechnicianId = isAdmin && has('assignedTechnicianId') ? (o.assignedTechnicianId ?? null) : existing.assigned_technician_id;
    const assignedTechnicianName = isAdmin && has('assignedTechnicianId') ? (o.assignedTechnicianName ?? null) : existing.assigned_technician_name;

    await db.query(
      `UPDATE orders SET client_id=$1, client_name=$2, address=$3, phone=$4, type=$5, status=$6, date=$7, priority=$8, description=$9, client_value=$10, payment_status=$11, paid_date=$12, paid_amount=$13, client_signature=$14, assigned_technician_id=$15, assigned_technician_name=$16 WHERE id=$17 AND account_id=$18`,
      [clientId, clientName, address, phone, type, status, date, priority, description, clientValue, paymentStatus, paidDate, paidAmount, clientSignature, assignedTechnicianId, assignedTechnicianName, id, accountId]
    );

    const ctx = await getAccountContext(userId);
    if (has('attendances') && ctx) assertPhotoLimit(ctx.plan, o.attendances || []);

    if (isAdmin && has('expenses')) {
      await db.query('DELETE FROM expenses WHERE order_id = $1 AND account_id = $2', [id, accountId]);
      for (const e of (o.expenses || [])) {
        await db.query('INSERT INTO expenses (id, account_id, order_id, label, amount) VALUES ($1,$2,$3,$4,$5)', [e.id || `${Date.now()}-${Math.random()}`, accountId, id, e.label, e.amount]);
      }
    }

    if (isAdmin && has('payments')) {
      await db.query('DELETE FROM order_payments WHERE order_id = $1 AND account_id = $2', [id, accountId]);
      for (const p of (o.payments || [])) {
        await db.query('INSERT INTO order_payments (id, account_id, order_id, label, amount, date, status) VALUES ($1,$2,$3,$4,$5,$6,$7)', [p.id || `pay-${Date.now()}-${Math.random()}`, accountId, id, p.label || 'Pagamento', p.amount, p.date, p.status || 'pending']);
      }
    }

    let replacedPhotoKeys = new Set<string>();
    if (has('attendances')) {
      const existingPhotosRes = await db.query(
        `SELECT p.data_url FROM attendance_photos p JOIN attendances a ON a.id = p.attendance_id WHERE a.order_id = $1 AND p.account_id = $2 AND a.account_id = $2`,
        [id, accountId]
      );
      const existingPhotoKeys = new Set<string>(existingPhotosRes.rows.map((r: any) => r.data_url).filter(Boolean));
      replacedPhotoKeys = existingPhotoKeys;

      for (const a of (o.attendances || [])) {
        for (const p of (a.photos || [])) {
          if (p.key && !existingPhotoKeys.has(p.key) && !isSafeStorageKey(p.key, accountId, 'attendances')) {
            await db.query('ROLLBACK');
            return res.status(400).json({ error: 'Foto de atendimento inválida para esta conta' });
          }
        }
      }

      await db.query('DELETE FROM attendances WHERE order_id = $1 AND account_id = $2', [id, accountId]);
      for (const a of (o.attendances || [])) {
        const attendanceId = a.id || `${Date.now()}-${Math.random()}`;
        await db.query(
          `INSERT INTO attendances (id, account_id, order_id, start_time, end_time, duration_seconds, description) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [attendanceId, accountId, id, a.startTime, a.endTime, a.durationSeconds, a.description || '']
        );
        for (const p of (a.photos || [])) if (p.key) {
          await db.query(
            'INSERT INTO attendance_photos (id, account_id, attendance_id, data_url, name) VALUES ($1,$2,$3,$4,$5)',
            [p.id || `${Date.now()}-${Math.random()}`, accountId, attendanceId, p.key, p.name || '']
          );
        }
      }
    }

    await db.query('COMMIT');

    if (has('attendances')) {
      const newPhotoKeys = new Set<string>();
      for (const a of (o.attendances || [])) for (const p of (a.photos || [])) if (p.key) newPhotoKeys.add(p.key);
      await cleanupStorageKeysIfUnreferenced([...replacedPhotoKeys].filter((key) => !newPhotoKeys.has(key)), accountId);
    }
    if (existing.client_signature && existing.client_signature !== clientSignature) {
      await cleanupStorageKeyIfUnreferenced(existing.client_signature, accountId);
    }

    const orders = await fetchOrders(userId);
    res.json(orders.find((x: any) => x.id === id));
  } catch (e: any) {
    try { await db.query('ROLLBACK'); } catch {}
    if (e?.code === 'PLAN_LIMIT_PHOTOS') return res.status(e.status || 402).json({ error: e.message, code: e.code });
    console.error(e);
    res.status(500).json({ error: 'Erro ao atualizar ordem' });
  } finally {
    db.release();
  }
});

router.post('/:orderId/attendances/:attendanceId/photos', requireAuth, async (req, res) => {
  const userId = req.userId;
  const { orderId, attendanceId } = req.params;
  const { key, name } = req.body || {};
  if (!key) return res.status(400).json({ error: 'Chave da imagem não informada' });
  try {
    const { accountId, isAdmin } = await getAccessContext(userId);
    const orderRes = await pool.query(`SELECT id FROM orders WHERE id=$1 AND account_id=$2 AND ${isAdmin ? 'TRUE' : '(user_id=$3 OR assigned_technician_id=$3)'}`, isAdmin ? [orderId, accountId] : [orderId, accountId, userId]);
    if (!orderRes.rows[0]) return res.status(404).json({ error: 'Ordem não encontrada' });
    const attRes = await pool.query('SELECT id FROM attendances WHERE id=$1 AND order_id=$2 AND account_id=$3', [attendanceId, orderId, accountId]);
    if (!attRes.rows[0]) return res.status(404).json({ error: 'Atendimento não encontrado' });
    if (!isSafeStorageKey(key, accountId, 'attendances')) return res.status(400).json({ error: 'Foto inválida para esta conta' });
    const ctx = await getAccountContext(userId);
    if (ctx) {
      const photoCount = await pool.query('SELECT COUNT(*)::int AS count FROM attendance_photos WHERE account_id=$1 AND attendance_id=$2', [accountId, attendanceId]);
      assertPhotoLimit(ctx.plan, [{ id: attendanceId, photos: Array.from({ length: photoCount.rows[0].count }, (_, i) => ({ id: String(i), key: 'existing', dataUrl: '', name: '' })) }, { id: `new-${Date.now()}`, photos: [{ id: 'new', key, dataUrl: '', name: name || '' }] }]);
    }
    const photoId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await pool.query('INSERT INTO attendance_photos (id, account_id, attendance_id, data_url, name) VALUES ($1,$2,$3,$4,$5)', [photoId, accountId, attendanceId, key, name || '']);
    const url = await getDownloadUrl(key);
    res.status(201).json({ photo: { id: photoId, key, dataUrl: url, name: name || '' } });
  } catch (e: any) {
    if (e?.code === 'PLAN_LIMIT_PHOTOS') return res.status(e.status || 402).json({ error: e.message, code: e.code });
    console.error(e); res.status(500).json({ error: 'Erro ao adicionar foto ao atendimento' });
  }
});

router.delete('/:orderId/attendances/:attendanceId/photos/:photoId', requireAuth, async (req, res) => {
  try {
    const { accountId, isAdmin } = await getAccessContext(req.userId);
    const { orderId, attendanceId, photoId } = req.params;
    const orderRes = await pool.query(`SELECT id FROM orders WHERE id=$1 AND account_id=$2 AND ${isAdmin ? 'TRUE' : '(user_id=$3 OR assigned_technician_id=$3)'}`, isAdmin ? [orderId, accountId] : [orderId, accountId, req.userId]);
    if (!orderRes.rows[0]) return res.status(404).json({ error: 'Ordem não encontrada' });
    const photoRes = await pool.query('SELECT data_url FROM attendance_photos WHERE id=$1 AND attendance_id=$2 AND account_id=$3', [photoId, attendanceId, accountId]);
    if (!photoRes.rows[0]) return res.status(404).json({ error: 'Foto não encontrada' });
    const result = await pool.query('DELETE FROM attendance_photos WHERE id=$1 AND attendance_id=$2 AND account_id=$3', [photoId, attendanceId, accountId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Foto não encontrada' });
    await cleanupStorageKeyIfUnreferenced(photoRes.rows[0].data_url, accountId);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao remover foto' }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { accountId, isAdmin } = await getAccessContext(req.userId);
    if (!isAdmin) return res.status(403).json({ error: 'Somente administradores podem excluir ordens' });

    const orderId = req.params.id;
    const signatureRes = await pool.query('SELECT client_signature FROM orders WHERE id=$1 AND account_id=$2', [orderId, accountId]);
    if (!signatureRes.rows[0]) return res.status(404).json({ error: 'Ordem não encontrada' });
    const photoRes = await pool.query(
      `SELECT p.data_url FROM attendance_photos p JOIN attendances a ON a.id=p.attendance_id WHERE a.order_id=$1 AND a.account_id=$2 AND p.account_id=$2`,
      [orderId, accountId]
    );

    const result = await pool.query('DELETE FROM orders WHERE id = $1 AND account_id=$2', [orderId, accountId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Ordem não encontrada' });

    const keys = new Set<string>();
    if (signatureRes.rows[0].client_signature) keys.add(signatureRes.rows[0].client_signature);
    for (const row of photoRes.rows) if (row.data_url) keys.add(row.data_url);
    await cleanupStorageKeysIfUnreferenced(keys, accountId);

    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao deletar ordem' }); }
});

export default router;
