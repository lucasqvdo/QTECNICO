import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';
import { getAccountContext, assertPhotoLimit } from '../planLimits.js';
import { getDownloadUrl } from '../storage.js';

const router = Router();

async function getAccessContext(userId: number) {
  const { rows } = await pool.query('SELECT is_admin, account_id FROM users WHERE id=$1', [userId]);
  if (!rows[0]?.account_id) throw new Error('Conta não encontrada');
  return { accountId: Number(rows[0].account_id), isAdmin: Boolean(rows[0].is_admin) };
}

function isSafeStorageKey(key: unknown, accountId: number, folder: string) {
  if (typeof key !== 'string' || !key) return false;
  if (key.startsWith('data:') || key.startsWith('http')) return true;
  return key.startsWith(`${folder}/${accountId}/`);
}

async function buildOrder(orderId: string, accountId: number, executor: { query: (text: string, params?: any[]) => Promise<any> } = pool, includeFinancial = false) {
  const orderRes = await executor.query('SELECT * FROM orders WHERE id=$1 AND account_id=$2', [orderId, accountId]);
  const o = orderRes.rows[0];
  if (!o) return null;
  const attRes = await executor.query('SELECT * FROM attendances WHERE order_id=$1 AND account_id=$2 ORDER BY start_time ASC', [orderId, accountId]);
  const attIds = attRes.rows.map((a: any) => a.id);
  const photoRes = attIds.length ? await executor.query('SELECT * FROM attendance_photos WHERE account_id=$1 AND attendance_id=ANY($2)', [accountId, attIds]) : { rows: [] as any[] };
  const photosByAtt: Record<string, any[]> = {};
  for (const p of photoRes.rows) {
    (photosByAtt[p.attendance_id] ||= []).push({ id: p.id, key: p.data_url, dataUrl: await getDownloadUrl(p.data_url), name: p.name });
  }
  const financial = includeFinancial ? await (async () => {
    const [expenses, payments] = await Promise.all([
      executor.query('SELECT * FROM expenses WHERE account_id=$1 AND order_id=$2', [accountId, orderId]),
      executor.query('SELECT * FROM order_payments WHERE account_id=$1 AND order_id=$2 ORDER BY date ASC', [accountId, orderId])
    ]);
    return {
      clientValue: parseFloat(o.client_value),
      paymentStatus: o.payment_status,
      paidDate: o.paid_date ? (o.paid_date instanceof Date ? o.paid_date.toISOString().split('T')[0] : String(o.paid_date).split('T')[0]) : undefined,
      paidAmount: o.paid_amount != null ? parseFloat(o.paid_amount) : undefined,
      expenses: expenses.rows.map((e:any)=>({id:e.id,label:e.label,amount:parseFloat(e.amount)})),
      payments: payments.rows.map((p:any)=>({id:p.id,orderId:p.order_id,label:p.label,amount:parseFloat(p.amount),date:p.date instanceof Date?p.date.toISOString().split('T')[0]:String(p.date).split('T')[0],status:p.status}))
    };
  })() : null;

  const ids = Array.isArray(o.assigned_technician_ids) && o.assigned_technician_ids.length ? o.assigned_technician_ids : o.assigned_technician_id ? [o.assigned_technician_id] : [];
  const techRes = ids.length ? await executor.query('SELECT id,name FROM users WHERE account_id=$1 AND id=ANY($2)', [accountId, ids]) : { rows: [] as any[] };
  const techMap = new Map(techRes.rows.map((t: any) => [Number(t.id), t.name]));
  const assignedTechnicians = ids.map((id: number) => ({ id: Number(id), name: techMap.get(Number(id)) || 'Técnico' }));
  return { id: o.id, clientId: o.client_id, client: o.client_name, address: o.address, phone: o.phone, type: o.type, status: o.status, date: o.date instanceof Date ? o.date.toISOString().split('T')[0] : String(o.date || '').split('T')[0], priority: o.priority, description: o.description, clientSignature: (await getDownloadUrl(o.client_signature)) ?? undefined, clientSignatureKey: o.client_signature ?? undefined, syncVersion: Number(o.sync_version ?? 1), assignedTechnicianId: ids[0] ?? undefined, assignedTechnicianName: assignedTechnicians[0]?.name ?? undefined, assignedTechnicianIds: ids, assignedTechnicians, attendances: attRes.rows.map((a: any) => ({ id: a.id, startTime: a.start_time instanceof Date ? a.start_time.toISOString() : a.start_time, endTime: a.end_time instanceof Date ? a.end_time.toISOString() : a.end_time, durationSeconds: a.duration_seconds, description: a.description, photos: photosByAtt[a.id] || [] })), ...(financial || {}) };
}

router.put('/:id/sync', requireAuth, async (req, res) => {
  const userId = req.userId;
  const { id } = req.params;
  const body = req.body || {};
  const has = (key:string) => Object.prototype.hasOwnProperty.call(body, key);
  const operationId = typeof body.operationId === 'string' && body.operationId ? body.operationId : null;
  const baseVersion = body.baseVersion == null ? null : Number(body.baseVersion);
  const db = await pool.connect();
  let accountId = 0;

  try {
    const access = await getAccessContext(userId);
    accountId = access.accountId;
    const { isAdmin } = access;
    await db.query('BEGIN');

    if (operationId) {
      const op = await db.query(`SELECT status,response_status,response_body FROM sync_operations WHERE operation_id=$1 AND account_id=$2 AND entity_type='service_order' AND entity_id=$3 FOR UPDATE`, [operationId, accountId, id]);
      if (op.rows[0]?.status === 'completed') {
        await db.query('ROLLBACK');
        return res.status(op.rows[0].response_status || 200).json(op.rows[0].response_body || {});
      }
      if (op.rows[0]?.status === 'processing') {
        await db.query('ROLLBACK');
        return res.status(409).json({ error:'Operação de sincronização ainda está sendo processada', code:'SYNC_OPERATION_PROCESSING', operationId });
      }
      if (!op.rows[0]) {
        await db.query(`INSERT INTO sync_operations (operation_id,account_id,entity_type,entity_id,base_version,status) VALUES ($1,$2,'service_order',$3,$4,'processing')`, [operationId, accountId, id, Number.isFinite(baseVersion) ? baseVersion : null]);
      }
    }

    const orderRes = await db.query(`SELECT o.* FROM orders o WHERE o.id=$1 AND o.account_id=$2 AND ${isAdmin ? 'TRUE' : '(o.user_id=$3 OR o.assigned_technician_id=$3 OR $3=ANY(COALESCE(o.assigned_technician_ids,ARRAY[]::INTEGER[])))'} FOR UPDATE`, isAdmin ? [id, accountId] : [id, accountId, userId]);
    const existing = orderRes.rows[0];
    if (!existing) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error:'Ordem não encontrada' });
    }

    const currentVersion = Number(existing.sync_version ?? 1);
    if (Number.isFinite(baseVersion) && baseVersion !== currentVersion) {
      const conflict = { error:'Conflito de versão', code:'SYNC_CONFLICT', operationId, currentVersion, serverOrder: await buildOrder(id, accountId, db, isAdmin) };
      if (operationId) await db.query(`UPDATE sync_operations SET status='conflict',response_status=409,response_body=$1::jsonb,processed_at=now() WHERE operation_id=$2 AND account_id=$3`, [JSON.stringify(conflict), operationId, accountId]);
      await db.query('COMMIT');
      return res.status(409).json(conflict);
    }

    if (!isAdmin && has('assignedTechnicianIds')) {
      await db.query('ROLLBACK');
      return res.status(403).json({ error:'Técnico não pode alterar a atribuição da O.S.' });
    }

    if (isAdmin && has('clientId') && body.clientId != null) {
      const client = await db.query('SELECT id FROM clients WHERE id=$1 AND account_id=$2', [body.clientId, accountId]);
      if (!client.rows[0]) {
        await db.query('ROLLBACK');
        return res.status(400).json({ error:'Cliente não pertence à conta' });
      }
    }

    const normalizeTechnicianIds = (value:unknown):number[] => Array.isArray(value) ? [...new Set(value.map(Number).filter(n => Number.isInteger(n) && n > 0))] : [];
    const requestedTechnicians = isAdmin && has('assignedTechnicianIds')
      ? normalizeTechnicianIds(body.assignedTechnicianIds)
      : isAdmin && has('assignedTechnicianId')
        ? normalizeTechnicianIds([body.assignedTechnicianId])
        : (Array.isArray(existing.assigned_technician_ids) ? existing.assigned_technician_ids : (existing.assigned_technician_id ? [existing.assigned_technician_id] : []));
    const techs = requestedTechnicians.length
      ? await db.query('SELECT id,name FROM users WHERE account_id=$1 AND id=ANY($2) AND COALESCE(is_admin,false)=false', [accountId, requestedTechnicians])
      : { rows: [] as any[] };
    if (techs.rows.length !== requestedTechnicians.length) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error:'Um ou mais técnicos não pertencem à conta ou não são técnicos' });
    }
    const first = techs.rows[0];

    if (has('clientSignatureKey') && body.clientSignatureKey != null && !isSafeStorageKey(body.clientSignatureKey, accountId, 'signatures')) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error:'Assinatura inválida para esta conta' });
    }

    const clientId = isAdmin && has('clientId') ? (body.clientId ?? null) : existing.client_id;
    const clientName = isAdmin && has('client') ? (body.client ?? '') : existing.client_name;
    const address = isAdmin && has('address') ? (body.address ?? '') : existing.address;
    const phone = isAdmin && has('phone') ? (body.phone ?? '') : existing.phone;
    const type = isAdmin && has('type') ? (body.type ?? '') : existing.type;
    const status = has('status') ? (body.status ?? existing.status) : existing.status;
    const date = isAdmin && has('date') ? body.date : existing.date;
    const priority = isAdmin && has('priority') ? body.priority : existing.priority;
    const description = has('description') ? (body.description ?? '') : existing.description;
    const clientValue = isAdmin && has('clientValue') ? (body.clientValue ?? 0) : existing.client_value;
    const paymentStatus = isAdmin && has('paymentStatus') ? (body.paymentStatus ?? 'pending') : existing.payment_status;
    const paidDate = isAdmin && has('paidDate') ? (body.paidDate || null) : existing.paid_date;
    const paidAmount = isAdmin && has('paidAmount') ? (body.paidAmount ?? null) : existing.paid_amount;
    const clientSignature = isAdmin && has('clientSignatureKey')
      ? (body.clientSignatureKey ?? null)
      : (has('clientSignatureKey') && body.clientSignatureKey != null ? body.clientSignatureKey : existing.client_signature);

    if (has('attendances')) {
      const ctx = await getAccountContext(userId);
      if (ctx) assertPhotoLimit(ctx.plan, body.attendances || []);
      for (const a of (body.attendances || [])) {
        for (const p of (a.photos || [])) {
          if (p.key && !isSafeStorageKey(p.key, accountId, 'attendances')) {
            await db.query('ROLLBACK');
            return res.status(400).json({ error:'Foto de atendimento inválida para esta conta' });
          }
        }
      }
    }

    await db.query(`UPDATE orders SET client_id=$1,client_name=$2,address=$3,phone=$4,type=$5,status=$6,date=$7,priority=$8,description=$9,client_value=$10,payment_status=$11,paid_date=$12,paid_amount=$13,client_signature=$14,assigned_technician_id=$15,assigned_technician_name=$16,assigned_technician_ids=$17,sync_version=sync_version+1 WHERE id=$18 AND account_id=$19`,
      [clientId,clientName,address,phone,type,status,date,priority,description,clientValue,paymentStatus,paidDate,paidAmount,clientSignature,first?.id ?? null,first?.name ?? null,requestedTechnicians,id,accountId]);

    if (isAdmin && has('expenses')) {
      await db.query('DELETE FROM expenses WHERE order_id=$1 AND account_id=$2', [id, accountId]);
      for (const e of (body.expenses || [])) {
        await db.query('INSERT INTO expenses (id,account_id,order_id,label,amount) VALUES ($1,$2,$3,$4,$5)', [e.id || `${Date.now()}-${Math.random()}`, accountId, id, e.label, e.amount]);
      }
    }

    if (isAdmin && has('payments')) {
      await db.query('DELETE FROM order_payments WHERE order_id=$1 AND account_id=$2', [id, accountId]);
      for (const p of (body.payments || [])) {
        await db.query('INSERT INTO order_payments (id,account_id,order_id,label,amount,date,status) VALUES ($1,$2,$3,$4,$5,$6,$7)', [p.id || `pay-${Date.now()}-${Math.random()}`, accountId, id, p.label || 'Pagamento', p.amount, p.date, p.status || 'pending']);
      }
    }

    if (has('attendances')) {
      await db.query('DELETE FROM attendances WHERE order_id=$1 AND account_id=$2', [id, accountId]);
      for (const a of (body.attendances || [])) {
        const attendanceId = a.id || `${Date.now()}-${Math.random()}`;
        await db.query('INSERT INTO attendances (id,account_id,order_id,start_time,end_time,duration_seconds,description) VALUES ($1,$2,$3,$4,$5,$6,$7)', [attendanceId,accountId,id,a.startTime,a.endTime,a.durationSeconds,a.description || '']);
        for (const p of (a.photos || [])) if (p.key) {
          await db.query('INSERT INTO attendance_photos (id,account_id,attendance_id,data_url,name) VALUES ($1,$2,$3,$4,$5)', [p.id || `${Date.now()}-${Math.random()}`,accountId,attendanceId,p.key,p.name || '']);
        }
      }
    }

    const result = await buildOrder(id, accountId, db, isAdmin);
    if (!result) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error:'Ordem não encontrada após sincronização' });
    }
    if (operationId) {
      await db.query(`UPDATE sync_operations SET status='completed',response_status=200,response_body=$1::jsonb,processed_at=now() WHERE operation_id=$2 AND account_id=$3`, [JSON.stringify(result), operationId, accountId]);
    }
    await db.query('COMMIT');
    return res.json(result);
  } catch (e:any) {
    try { await db.query('ROLLBACK'); } catch {}
    if (e?.code === 'PLAN_LIMIT_PHOTOS') return res.status(e.status || 402).json({ error:e.message, code:e.code });
    console.error('❌ Erro na sincronização versionada da O.S.:', e);
    if (operationId && accountId) {
      try { await pool.query(`UPDATE sync_operations SET status='failed',response_status=500,response_body=$1::jsonb,processed_at=now() WHERE operation_id=$2 AND account_id=$3`, [JSON.stringify({error:e?.message || 'Erro ao sincronizar O.S.'}),operationId,accountId]); } catch {}
    }
    return res.status(500).json({ error:e?.message || 'Erro ao sincronizar O.S.' });
  } finally {
    db.release();
  }
});
export default router;
