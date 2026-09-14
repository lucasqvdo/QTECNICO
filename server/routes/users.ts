import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { getDownloadUrl } from '../storage.js';

const router = Router();
const MIN_PASSWORD_LENGTH = 8;

async function getAdminAccountId(userId: number) {
  const result = await pool.query(`SELECT account_id FROM users WHERE id = $1 AND is_admin = TRUE`, [userId]);
  return result.rows[0]?.account_id as number | undefined;
}

async function getCompanyProfile(accountId: number) {
  const result = await pool.query(
    `SELECT id, legal_name, trade_name, document, phone, whatsapp, email, website,
            address, number, complement, neighborhood, city, state, postal_code,
            logo_key, description, updated_at
     FROM company_profiles WHERE account_id = $1`, [accountId]
  );
  const c = result.rows[0];
  if (!c) return null;
  return {
    id: c.id, legalName: c.legal_name || '', tradeName: c.trade_name || '', document: c.document || '',
    phone: c.phone || '', whatsapp: c.whatsapp || '', email: c.email || '', website: c.website || '',
    address: c.address || '', number: c.number || '', complement: c.complement || '', neighborhood: c.neighborhood || '',
    city: c.city || '', state: c.state || '', postalCode: c.postal_code || '', logoKey: c.logo_key || '',
    description: c.description || '', updatedAt: c.updated_at,
  };
}

const normalize = (value: unknown) => typeof value === 'string' ? value.trim() : '';

router.get('/me', requireAuth, async (req, res) => {
  const userId = req.userId;
  try {
    const result = await pool.query(
      'SELECT id, name, role, phone, email, photo_url, is_admin FROM users WHERE id = $1',
      [userId]
    );
    const u = result.rows[0];
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({
      id: u.id,
      name: u.name,
      role: u.role || '',
      phone: u.phone || '',
      email: u.email,
      isAdmin: Boolean(u.is_admin),
      photoUrl: await getDownloadUrl(u.photo_url),
      photoKey: u.photo_url || null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/admin/access', requireAdmin, async (_req, res) => {
  res.json({ allowed: true });
});

router.get('/admin/company-profile', requireAdmin, async (req, res) => {
  try {
    const accountId = await getAdminAccountId(req.userId);
    if (!accountId) return res.status(403).json({ error: 'Conta administrativa sem empresa associada' });
    res.json(await getCompanyProfile(accountId));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao carregar perfil da empresa' });
  }
});

router.put('/admin/company-profile', requireAdmin, async (req, res) => {
  try {
    const accountId = await getAdminAccountId(req.userId);
    if (!accountId) return res.status(403).json({ error: 'Conta administrativa sem empresa associada' });
    const existing = await pool.query('SELECT id FROM company_profiles WHERE account_id = $1', [accountId]);
    if (existing.rows[0]) {
      return res.status(403).json({ error: 'Os dados cadastrais da empresa são protegidos. Solicite alterações ao suporte do QTECNICO.' });
    }

    const data = {
      legalName: normalize(req.body?.legalName), tradeName: normalize(req.body?.tradeName), document: normalize(req.body?.document),
      phone: normalize(req.body?.phone), whatsapp: normalize(req.body?.whatsapp), email: normalize(req.body?.email).toLowerCase(),
      website: normalize(req.body?.website), address: normalize(req.body?.address), number: normalize(req.body?.number),
      complement: normalize(req.body?.complement), neighborhood: normalize(req.body?.neighborhood), city: normalize(req.body?.city),
      state: normalize(req.body?.state).toUpperCase().slice(0, 2), postalCode: normalize(req.body?.postalCode),
      logoKey: normalize(req.body?.logoKey), description: normalize(req.body?.description),
    };
    if (!data.tradeName && !data.legalName) return res.status(400).json({ error: 'Informe pelo menos a razão social ou o nome fantasia' });

    await pool.query(
      `INSERT INTO company_profiles
        (account_id, legal_name, trade_name, document, phone, whatsapp, email, website,
         address, number, complement, neighborhood, city, state, postal_code, logo_key, description, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
       ON CONFLICT (account_id) DO UPDATE SET
         legal_name=EXCLUDED.legal_name, trade_name=EXCLUDED.trade_name, document=EXCLUDED.document,
         phone=EXCLUDED.phone, whatsapp=EXCLUDED.whatsapp, email=EXCLUDED.email, website=EXCLUDED.website,
         address=EXCLUDED.address, number=EXCLUDED.number, complement=EXCLUDED.complement,
         neighborhood=EXCLUDED.neighborhood, city=EXCLUDED.city, state=EXCLUDED.state,
         postal_code=EXCLUDED.postal_code, logo_key=EXCLUDED.logo_key, description=EXCLUDED.description,
         updated_at=NOW()`,
      [accountId, data.legalName, data.tradeName, data.document, data.phone, data.whatsapp, data.email, data.website,
       data.address, data.number, data.complement, data.neighborhood, data.city, data.state, data.postalCode, data.logoKey, data.description]
    );
    res.json(await getCompanyProfile(accountId));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao salvar perfil da empresa' });
  }
});

router.get('/admin/team', requireAdmin, async (req, res) => {
  try {
    const accountId = await getAdminAccountId(req.userId);
    if (!accountId) return res.status(403).json({ error: 'Conta administrativa sem empresa associada' });
    const result = await pool.query(
      `SELECT id, name, role, phone, email, is_admin, created_at
       FROM users WHERE account_id = $1 ORDER BY name ASC, id ASC`, [accountId]
    );
    res.json(result.rows.map((u) => ({ id: u.id, name: u.name, role: u.role || 'Técnico', phone: u.phone || '', email: u.email, isAdmin: Boolean(u.is_admin), createdAt: u.created_at })));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao carregar equipe' }); }
});

router.post('/admin/team', requireAdmin, async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
  const role = typeof req.body.role === 'string' && req.body.role.trim() ? req.body.role.trim() : 'Técnico';
  if (!name || !email || !password) return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
  if (password.length < MIN_PASSWORD_LENGTH) return res.status(400).json({ error: `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres` });
  try {
    const accountId = await getAdminAccountId(req.userId);
    if (!accountId) return res.status(403).json({ error: 'Conta administrativa sem empresa associada' });
    const exists = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'E-mail já cadastrado' });
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, role, phone, email, password_hash, is_admin, account_id)
       VALUES ($1, $2, $3, $4, $5, FALSE, $6)
       RETURNING id, name, role, phone, email, is_admin, created_at`, [name, role, phone, email, hash, accountId]
    );
    const u = result.rows[0];
    res.status(201).json({ id: u.id, name: u.name, role: u.role || 'Técnico', phone: u.phone || '', email: u.email, isAdmin: false, createdAt: u.created_at });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao criar conta do técnico' }); }
});

router.delete('/admin/team/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const requesterId = req.userId;
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Técnico inválido' });
  if (id === requesterId) return res.status(400).json({ error: 'A conta administrativa atual não pode ser removida por ela mesma' });
  try {
    const accountId = await getAdminAccountId(requesterId);
    if (!accountId) return res.status(403).json({ error: 'Conta administrativa sem empresa associada' });
    const target = await pool.query('SELECT id, is_admin FROM users WHERE id = $1 AND account_id = $2', [id, accountId]);
    if (!target.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado na conta administrativa' });
    if (target.rows[0].is_admin) return res.status(400).json({ error: 'Remova o privilégio administrativo antes de excluir um administrador' });
    await pool.query('DELETE FROM users WHERE id = $1 AND account_id = $2', [id, accountId]);
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao remover técnico' }); }
});

router.put('/me', requireAuth, async (req, res) => {
  const userId = req.userId;
  const { name, phone, email, photoKey } = req.body;
  try {
    const current = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });
    await pool.query('UPDATE users SET name=$1, phone=$2, email=$3, photo_url=$4 WHERE id=$5', [name, phone, email, photoKey || null, userId]);
    res.json({ id: userId, name, role: current.rows[0].role || '', phone, email, photoUrl: await getDownloadUrl(photoKey || null), photoKey: photoKey || null });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao atualizar perfil' }); }
});

export default router;
