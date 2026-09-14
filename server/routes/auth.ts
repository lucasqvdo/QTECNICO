import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, randomInt } from 'crypto';
import { pool } from '../db.js';
import { createSession, revokeCurrentSession } from '../auth.js';
import {
  authRateLimit,
  passwordResetRequestRateLimit,
  passwordResetConfirmRateLimit,
} from '../security.js';

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
    `).then(() => undefined).catch((error) => {
      resetTableReady = null;
      throw error;
    });
  }
  return resetTableReady;
}

function hashResetCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

async function sendPasswordResetEmail(email: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error('RESEND_NOT_CONFIGURED');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Código para redefinir sua senha — QTecnico',
      text: `Seu código de recuperação do QTecnico é: ${code}\n\nEste código expira em 15 minutos. Se você não solicitou a redefinição de senha, ignore este e-mail.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0D1B2E"><h2>Redefinição de senha</h2><p>Recebemos uma solicitação para redefinir sua senha do QTecnico.</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:20px 0">${code}</div><p>O código expira em <strong>15 minutos</strong> e pode ser usado uma única vez.</p><p style="color:#64748B;font-size:13px">Se você não solicitou a redefinição, ignore este e-mail.</p></div>`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('Password reset email delivery failed:', response.status, detail);
    throw new Error('EMAIL_DELIVERY_FAILED');
  }
}

function publicUser(user: any) {
  return {
    id: user.id,
    name: user.name,
    role: user.role || '',
    phone: user.phone || '',
    email: user.email,
    photoUrl: user.photo_url || null,
    isAdmin: Boolean(user.is_admin),
  };
}

router.post('/login', authRateLimit, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Credenciais inválidas' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    if (!await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ error: 'E-mail ou senha incorretos' });

    await createSession(user.id, res);
    res.json({ user: publicUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/register', authRateLimit, async (req, res) => {
  const { name, email, password } = req.body;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!name || !normalizedEmail || !password) return res.status(400).json({ error: 'Preencha todos os campos' });
  if (password.length < MIN_PASSWORD_LENGTH) return res.status(400).json({ error: `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres` });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    if (exists.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'E-mail já cadastrado' });
    }

    const hash = await bcrypt.hash(password, 10);
    const userResult = await client.query(
      `INSERT INTO users (name, role, phone, email, password_hash, is_admin)
       VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id, name, role, phone, email, photo_url, is_admin`,
      [name, 'Administrador', '', normalizedEmail, hash],
    );
    const user = userResult.rows[0];
    const accountResult = await client.query(
      `INSERT INTO accounts (owner_user_id, plan_key, subscription_status)
       VALUES ($1, 'free', 'active') RETURNING id`,
      [user.id],
    );
    await client.query('UPDATE users SET account_id = $1 WHERE id = $2', [accountResult.rows[0].id, user.id]);
    await client.query('COMMIT');

    await createSession(user.id, res);
    res.status(201).json({ user: publicUser(user) });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Erro ao criar conta' });
  } finally {
    client.release();
  }
});

router.post('/logout', async (req, res) => {
  try {
    await revokeCurrentSession(req, res);
    return res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.clearCookie('qtecnico_session', { path: '/' });
    res.clearCookie('qtecnico_csrf', { path: '/' });
    return res.json({ success: true });
  }
});

router.post('/password-reset/request', passwordResetRequestRateLimit, async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email) return res.status(400).json({ error: 'Informe o e-mail da conta' });

  try {
    await ensureResetTable();
    const result = await pool.query('SELECT id, email FROM users WHERE LOWER(email) = $1', [email]);
    const genericResponse = { message: 'Se o e-mail estiver cadastrado, enviaremos um código de recuperação. Verifique sua caixa de entrada.' };
    if (result.rows.length === 0) return res.json(genericResponse);

    const user = result.rows[0];
    const code = String(randomInt(100000, 1000000));
    const tokenHash = hashResetCode(`${user.id}:${code}`);
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1 OR expires_at < NOW()', [user.id]);
    await pool.query(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`, [user.id, tokenHash]);

    try {
      await sendPasswordResetEmail(user.email, code);
    } catch (error) {
      await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND token_hash = $2', [user.id, tokenHash]);
      console.error('Password reset email could not be delivered:', error instanceof Error ? error.message : error);
      return res.status(503).json({ error: 'O serviço de recuperação de senha está temporariamente indisponível. Tente novamente mais tarde.' });
    }
    return res.json(genericResponse);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro ao solicitar recuperação de senha' });
  }
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
    const userId = userResult.rows[0].id;
    const tokenHash = hashResetCode(`${userId}:${code}`);
    const hash = await bcrypt.hash(password, 10);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const tokenResult = await client.query(
        `SELECT id FROM password_reset_tokens WHERE user_id = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [userId, tokenHash],
      );
      if (tokenResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Código inválido ou expirado' });
      }
      const updated = await client.query('UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id', [hash, userId]);
      if (updated.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Conta não encontrada' });
      }
      const consumed = await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL RETURNING id', [tokenResult.rows[0].id]);
      if (consumed.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Código inválido ou expirado' });
      }
      await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [userId]);
      await client.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
      await client.query('COMMIT');
      return res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(e);
    return res.status(400).json({ error: 'Não foi possível redefinir a senha' });
  }
});

export default router;
