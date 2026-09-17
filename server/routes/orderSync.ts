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

async function buildOrder(orderId: string, accountId: number) {
  const orderRes = await pool.query('SELECT * FROM orders WHERE id=$1 AND account_id=$2', [orderId, accountId]);
  const o = orderRes.rows[0];
  if (!o) return null;
  const attRes = await pool.query('SELECT * FROM attendances WHERE order_id=$1 AND account_id=$2 ORDER BY start_time ASC', [orderId, accountId]);
  const attIds = attRes.rows.map((a: any) => a.id);
  const photoRes = attIds.length
    ? await pool.query('SELECT * FROM attendance_photos WHERE account_id=$1 AND attendance_id=ANY($2)', [accountId, attIds])
    : { rows: [] as any[] };
  const photosByAtt: Record<string, any[]> = {};
  for (const p of photoRes.rows) {
    (photosByAtt[p.attendance_id] ||= []).push({
      id: p.id,
      key: p.data_url,
      dataUrl: await getDownloadUrl(p.data_url),
      name: p.name,
    });
  }
  const ids = Array.isArray(o.assigned_technician_ids) && o.assigned_technician_ids.length
    ? o.assigned_technician_ids
    : o.assigned_technician_id ? [o.assigned_technician_id] : [];
  const techRes = ids.length ? await pool.query('SELECT id,name FROM users WHERE account_id=$1 AND id=ANY($2)', [accountId, ids]) : { rows: [] as any[] };
  const techMap = new Map(techRes.rows.map((t: any) => [Number(t.id), t.name]));
  const assignedTechnicians = ids.map((id: number) => ({ id: Number(id), name: techMap.get(Number(id)) || 'Técnico' }));
  return {
    id: o.id,
    clientId: o.client_id,
    client: o.client_name,
    address: o.address,
    phone: o.phone,
    type: o.type,
    status: o.status,
    date: o.date instanceof Date ? o.date.toISOString().split('T')[0] : String(o.date || '').split('T')[0],
    priority: o.priority,
    description: o.description,
    clientSignature: (await getDownloadUrl(o.client_signature)) ?? undefined,
    clientSignatureKey: o.client_signature ?? undefined,
    syncVersion: Number(o.sync_version ?? 1),
    assignedTechnicianId: ids[0] ?? undefined,
    assignedTechnicianName: assignedTechnicians[0]?.name ?? undefined,
    assignedTechnicianIds: ids,
    assignedTechnicians,
    attendances: attRes.rows.map((a: any) => ({
      id: a.id,
      startTime: a.start_time instanceof Date ? a.start_time.toISOString() : a.start_time,
      endTime: a.end_time instanceof Date ? a.end_time.toISOString() : a.end_time,
      durationSeconds: a.duration_seconds,
      description: a.description,
      photos: photosByAtt[a.id] || [],
    })),
  };
}

router.put('/:id/sync', requireAuth, async (req, res) => {
  const userId = req.userId;
  const { id } = req.params;
  const body = req.body || {};
  const operationId = typeof body.operationId === 'string' && body.operationId ? body.operationId : null;
  const baseVersion = body.baseVersion == null ? null : Number(body.baseVersion);
  const db = await pool.connect();

  try {
    const { accountId, isAdmin } = await getAccessContext(userId);
    await db.query('BEGIN');

    if (operationId) {
      const op = await db.query(
        `SELECT status,response_status,response_body FROM sync_operations WHERE operation_id=$1 AND account_id=$2 AND entity_type='service_order' AND entity_id=$3 FOR UPDATE`,
        [operationId, accountId, id],
      );
      if (op.rows[0]?.status === 'completed') {
        await db.query('ROLLBACK');
        return res.status(op.rows[0].response_status || 200).json(op.rows[0].response_body || { error: 'Operação já processada' });
      }
      if (op.rows[0]?.status === 'processing') {
        await db.query('ROLLBACK');
        return res.status(409).json({ error: 'Operação de sincronização ainda está sendo processada', code: 'SYNC_OPERATION_PROCESSING', operationId });
      }
      if (!op.rows[0]) {
        await db.query(
          `INSERT INTO sync_operations (operation_id,account_id,entity_type,entity_id,base_version,status) VALUES ($1,$2,'service_order',$3,$4,'processing')`,
          [operationId, accountId, id, Number.isFinite(baseVersion) ? baseVersion : null],
        );
      }
    }

    const orderRes = await db.query(
      `SELECT o.* FROM orders o WHERE o.id=$1 AND o.account_id=$2 AND ${isAdmin ? 'TRUE' : '(o.user_id=$3 OR o.assigned_technician_id=$3 OR $3=ANY(COALESCE(o.assigned_technician_ids,ARRAY[]::INTEGER[])))'} FOR UPDATE`,
      isAdmin ? [id, accountId] : [id, accountId, userId],
    );
    const existing = orderRes.rows[0];
    if (!existing) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Ordem não encontrada' });
    }

    const currentVersion = Number(existing.sync_version ?? 1);
    if (Number.isFinite(baseVersion) && baseVersion !== currentVersion) {
      if (operationId) {
        await db.query(`UPDATE sync_operations SET status='conflict',response_status=409,response_body=$1::jsonb,processed_at=now() WHERE operation_id=$2 AND account_id=$3`, [JSON.stringify({ error: 'Conflito de versão', code: 'SYNC_CONFLICT', operationId, currentVersion, serverOrder: await buildOrder(id, accountId) }), operationId, accountId]);
      }
      await db.query('COMMIT');
      return res.status(409).json({ error: 'Conflito de versão', code: 'SYNC_CONFLICT', operationId, currentVersion, serverOrder: await buildOrder(id, accountId) });
    }

    if (!isAdmin && body.assignedTechnicianIds) {
      await db.query('ROLLBACK');
      return res.status(403).json({ error: 'Técnico não pode alterar a atribuição da O.S.' });
    }

    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
    const status = has('status') ? body.status : existing.status;
    const description = has('description') ? String(body.description ?? '') : existing.description;
    const signatureKey = has('clientSignatureKey') ? (body.clientSignatureKey ?? null) : existing.client_signature;

    if (has('clientSignatureKey') && signatureKey != null && !isSafeStorageKey(signatureKey, accountId, 'signatures')) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: 'Assinatura inválida para esta conta' });
    }

    if (has('attendances')) {
      const ctx = await getAccountContext(userId);
      if (ctx) assertPhotoLimit(ctx.plan, body.attendances || []);
      for (const a of (body.attendances || [])) {
        for (const p of (a.photos || [])) {
          if (p.key && !isSafeStorageKey(p.key, accountId, 'attendances')) {
            await db.query('ROLLBACK');
            return res.status(400).json({ error: 'Foto de atendimento inválida para esta conta' });
          }
        }
      }
      await db.query('DELETE FROM attendances WHERE order_id=$1 AND account_id=$2', [id, accountId]);
      for (const a of (body.attendances || [])) {
        const attendanceId = a.id || `${Date.now()}-${Math.random()}`;
        await db.query(
          'INSERT INTO attendances (id,account_id,order_id,start_time,end_time,duration_seconds,description) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [attendanceId, accountId, id, a.startTime, a.endTime, a.durationSeconds, a.description || ''],
        );
        for (const p of (a.photos || [])) {
          if (p.key) await db.query('INSERT INTO attendance_photos (id,account_id,attendance_id,data_url,name) VALUES ($1,$2,$3,$4,$5)', [p.id || `${Date.now()}-${Math.random()}`, accountId, attendanceId, p.key, p.name || '']);
        }
      }
    }

    await db.query(
      `UPDATE orders SET status=$1,description=$2,client_signature=$3,sync_version=sync_version+1 WHERE id=$4 AND account_id=$5`,
      [status, description, signatureKey, id, accountId],
    );
    await db.query('COMMIT');

    const result = await buildOrder(id, accountId);
    if (!result) return res.status(404).json({ error: 'Ordem não encontrada após sincronização' });

    if (operationId) {
      await pool.query(
        `UPDATE sync_operations SET status='completed',response_status=200,response_body=$1::jsonb,processed_at=now() WHERE operation_id=$2 AND account_id=$3`,
        [JSON.stringify(result), operationId, accountId],
      );
    }
    return res.json(result);
  } catch (e: any) {
    try { await db.query('ROLLBACK'); } catch {}
    if (e?.code === 'PLAN_LIMIT_PHOTOS') return res.status(e.status || 402).json({ error: e.message, code: e.code });
    console.error('❌ Erro na sincronização versionada da O.S.:', e);
    if (operationId) {
      try { await pool.query(`UPDATE sync_operations SET status='failed',response_status=500,response_body=$1::jsonb,processed_at=now() WHERE operation_id=$2 AND account_id=$3`, [JSON.stringify({ error: e?.message || 'Erro ao sincronizar O.S.' }), operationId, accountId],); } catch {}
    }
    return res.status(500).json({ error: e?.message || 'Erro ao sincronizar O.S.' });
  } finally {
    db.release();
  }
});

export default router;
