import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, randomInt } from 'crypto';
import { pool } from '../db.js';
import { createSession, revokeCurrentSession } from '../auth.js';
import { requireAuth } from '../auth.js';
import { authRateLimit, passwordResetRequestRateLimit, passwordResetConfirmRateLimit } from '../security.js';

const router = Router();
const MIN_PASSWORD_LENGTH = 8;
let resetTableReady: Promise<void> | null = null;

async function ensureResetTable() {
  if (!resetTableReady) {
    resetTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens(user_id);
      CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_idx ON password_reset_tokens(expires_at);
    `).then(() => undefined).catch((error) => { resetTableReady = null; throw error; });
  }
  return resetTableReady;
}

function hashResetCode(code: string) { return createHash('sha256').update(code).digest('hex'); }

async function sendPasswordResetEmail(email: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error('RESEND_NOT_CONFIGURED');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [email], subject: 'Código para redefinir sua senha — QTecnico',
      text: `Seu código de recuperação do QTecnico é: ${code}\n\nEste código expira em 15 minutos. Se você não solicitou a redefinição de senha, ignore este e-mail.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0D1B2E"><h2>Redefinição de senha</h2><p>Recebemos uma solicitação para redefinir sua senha do QTecnico.</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:20px 0">${code}</div><p>O código expira em <strong>15 minutos</strong> e pode ser usado uma única vez.</p></div>`,
    }),
  });
  if (!response.ok) { console.error('Password reset email delivery failed:', response.status, await response.text().catch(() => '')); throw new Error('EMAIL_DELIVERY_FAILED'); }
}

function publicUser(user: any) {
  return { id: user.id, accountId: user.account_id == null ? null : Number(user.account_id), name: user.name, role: user.role || '', phone: user.phone || '', email: user.email, photoUrl: user.photo_url || null, isAdmin: Boolean(user.is_admin) };
}

router.post('/login', authRateLimit, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Credenciais inválidas' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    const user = result.rows[0];
    if (!user || !await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    await createSession(user.id, res);
    res.json({ user: publicUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

router.post('/register', authRateLimit, async (req, res) => {
  const { name, email, password } = req.body;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!name || !normalizedEmail || !password) return res.status(400).json({ error: 'Preencha todos os campos' });
  if (password.length < MIN_PASSWORD_LENGTH) return res.status(400).json({ error: `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres` });

  let registration: any = null;
  try {
    if (typeof name === 'string' && name.trim().startsWith('{')) registration = JSON.parse(name);
  } catch { return res.status(400).json({ error: 'Dados de cadastro inválidos' }); }
  if (!registration?.adminName || !registration?.company?.tradeName || !registration?.company?.legalName || !registration?.company?.document || !registration?.company?.email || !registration?.company?.phone) {
    return res.status(400).json({ error: 'Informe os dados básicos da empresa para criar a conta.' });
  }
  const adminName = String(registration.adminName).trim();
  const company = registration.company;
  if (registration.adminEmail && String(registration.adminEmail).trim().toLowerCase() !== normalizedEmail) return res.status(400).json({ error: 'O e-mail do administrador não confere.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS company_profiles (
        id BIGSERIAL PRIMARY KEY,
        account_id BIGINT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
        legal_name TEXT NOT NULL DEFAULT '', trade_name TEXT NOT NULL DEFAULT '', document TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', whatsapp TEXT NOT NULL DEFAULT '', website TEXT NOT NULL DEFAULT '',
        postal_code TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', number TEXT NOT NULL DEFAULT '', complement TEXT NOT NULL DEFAULT '',
        neighborhood TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT '', logo_key TEXT,
        description TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const exists = await client.query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    if (exists.rows.length > 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'E-mail já cadastrado' }); }
    const accountResult = await client.query(`INSERT INTO accounts (owner_user_id, plan_key, subscription_status) VALUES (NULL, 'essential', 'active') RETURNING id`);
    const accountId = accountResult.rows[0].id;
    const hash = await bcrypt.hash(password, 10);
    const userResult = await client.query(
      `INSERT INTO users (name, role, phone, email, password_hash, is_admin, account_id) VALUES ($1, $2, $3, $4, $5, TRUE, $6) RETURNING id, account_id, name, role, phone, email, photo_url, is_admin`,
      [adminName, 'Administrador', company.phone || '', normalizedEmail, hash, accountId],
    );
    const user = userResult.rows[0];
    await client.query('UPDATE accounts SET owner_user_id = $1 WHERE id = $2', [user.id, accountId]);
    await client.query(
      `INSERT INTO company_profiles (account_id, legal_name, trade_name, document, phone, email, whatsapp, website, postal_code, address, number, complement, neighborhood, city, state, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [accountId, company.legalName || '', company.tradeName || '', company.document || '', company.phone || '', company.email || '', company.whatsapp || '', company.website || '', company.postalCode || '', company.address || '', company.number || '', company.complement || '', company.neighborhood || '', company.city || '', company.state || '', company.description || ''],
    );
    await client.query('COMMIT');
    await createSession(user.id, res);
    res.status(201).json({ user: publicUser(user) });
  } catch (e) {
    await client.query('ROLLBACK'); console.error(e); res.status(500).json({ error: 'Erro ao criar conta' });
  } finally { client.release(); }
});

router.post('/logout', requireAuth, async (req, res) => {
  try { await revokeCurrentSession(req, res); return res.json({ success: true }); }
  catch (error) { console.error('Logout error:', error); res.clearCookie('qtecnico_session', { path: '/' }); res.clearCookie('qtecnico_csrf', { path: '/' }); return res.json({ success: true }); }
});

router.post('/password-reset/request', passwordResetRequestRateLimit, async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email) return res.status(400).json({ error: 'Informe o e-mail da conta' });
  try {
    await ensureResetTable();
    const result = await pool.query('SELECT id, email FROM users WHERE LOWER(email) = $1', [email]);
    const genericResponse = { message: 'Se o e-mail estiver cadastrado, enviaremos um código de recuperação. Verifique sua caixa de entrada.' };
    if (result.rows.length === 0) return res.json(genericResponse);
    const user = result.rows[0]; const code = String(randomInt(100000, 1000000)); const tokenHash = hashResetCode(`${user.id}:${code}`);
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1 OR expires_at < NOW()', [user.id]);
    await pool.query(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`, [user.id, tokenHash]);
    try { await sendPasswordResetEmail(user.email, code); }
    catch (error) { await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND token_hash = $2', [user.id, tokenHash]); console.error(error); return res.status(503).json({ error: 'O serviço de recuperação de senha está temporariamente indisponível. Tente novamente mais tarde.' }); }
    return res.json(genericResponse);
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Erro ao solicitar recuperação de senha' }); }
});

router.post('/password-reset/confirm', passwordResetConfirmRateLimit, async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || !/^\d{6}$/.test(code) || !password) return res.status(400).json({ error: 'Dados de recuperação inválidos' });
  if (password.length < MIN_PASSWORD_LENGTH) return res.status(400).json({ error: `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres` });
  try {
    await ensureResetTable();
    const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
    if (userResult.rows.length === 0) return res.status(400).json({ error: 'Código inválido ou expirado' });
    const userId = userResult.rows[0].id; const tokenHash = hashResetCode(`${userId}:${code}`); const hash = await bcrypt.hash(password, 10); const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tokenResult = await client.query(`SELECT id FROM password_reset_tokens WHERE user_id = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [userId, tokenHash]);
      if (tokenResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Código inválido ou expirado' }); }
      const updated = await client.query('UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id', [hash, userId]);
      if (updated.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Conta não encontrada' }); }
      const consumed = await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL RETURNING id', [tokenResult.rows[0].id]);
      if (consumed.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Código inválido ou expirado' }); }
      await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [userId]);
      await client.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
      await client.query('COMMIT'); return res.json({ success: true });
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  } catch (e) { console.error(e); return res.status(400).json({ error: 'Não foi possível redefinir a senha' }); }
});

export default router;
