import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { pool } from '../db.js';
import { signToken } from '../auth.js';

class EmailValidator {
  protected normalize(email: string): string {
    return email.trim().toLowerCase();
  }

  protected isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  protected async userExists(email: string): Promise<boolean> {
    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    return result.rows.length > 0;
  }
}

class RegisterEmailChecker extends EmailValidator {
  async ensureAvailable(email: string): Promise<string> {
    const normalized = this.normalize(email);
    if (!this.isValidEmail(normalized)) {
      throw new Error('E-mail inválido');
    }
    if (await this.userExists(normalized)) {
      throw new Error('E-mail já cadastrado');
    }
    return normalized;
  }
}

class ForgotPasswordEmailChecker extends EmailValidator {
  async ensureRegistered(email: string): Promise<string> {
    const normalized = this.normalize(email);
    if (!this.isValidEmail(normalized)) {
      throw new Error('E-mail inválido');
    }
    if (!(await this.userExists(normalized))) {
      throw new Error('E-mail não cadastrado');
    }
    return normalized;
  }
}

const RESET_TOKEN_TTL_MINUTES = 60;
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

function createTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendPasswordResetEmail(email: string, code: string) {
  const transporter = createTransporter();
  const resetLink = `${APP_URL}/reset-password?code=${encodeURIComponent(code)}&email=${encodeURIComponent(email)}`;

  if (!transporter) {
    console.log(`📧 Simulação de e-mail para ${email}`);
    console.log(`Link de reset: ${resetLink}`);
    console.log(`Código de reset: ${code}`);
    return { simulated: true, resetLink, code };
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'QTecnico <noreply@qtecnico.com>',
    to: email,
    subject: 'Código de redefinição de senha - QTecnico',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2 style="margin-bottom: 12px;">Redefinição de senha</h2>
        <p>Recebemos uma solicitação para redefinir sua senha.</p>
        <p>Use o código abaixo no aplicativo para continuar:</p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 10px; margin: 20px 0; color: #111827;">${code}</p>
        <p style="color:#6b7280; font-size: 12px;">Este código expira em 60 minutos.</p>
      </div>
    `,
  });

  return { simulated: false, resetLink, code };
}

function generateResetCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function createPasswordResetToken(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const code = generateResetCode();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();

  await pool.query('DELETE FROM password_reset_tokens WHERE email = $1', [normalizedEmail]);
  await pool.query(
    `INSERT INTO password_reset_tokens (email, token, expires_at)
     VALUES ($1, $2, $3)`,
    [normalizedEmail, code, expiresAt]
  );

  const mailInfo = await sendPasswordResetEmail(normalizedEmail, code);

  return { code, expiresAt, mailInfo };
}

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Credenciais inválidas' });

  try {
    const normalizedEmail = new RegisterEmailChecker().ensureAvailable ? undefined : undefined;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [String(email).trim().toLowerCase()]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'E-mail ou senha incorretos' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'E-mail ou senha incorretos' });

    const token = signToken({ id: user.id, email: user.email });
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role || '',
        phone: user.phone || '',
        email: user.email,
        photoUrl: user.photo_url || null,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Preencha todos os campos' });
  if (password.length < 6) return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' });

  try {
    const emailChecker = new RegisterEmailChecker();
    const normalizedEmail = await emailChecker.ensureAvailable(email);

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, role, phone, email, password_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, 'Técnico', '', normalizedEmail, hash]
    );
    const userId = result.rows[0].id;
    const token = signToken({ id: userId, email: normalizedEmail });

    res.status(201).json({
      token,
      user: { id: userId, name, role: 'Técnico', phone: '', email: normalizedEmail, photoUrl: null },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro ao criar conta';
    if (message === 'E-mail já cadastrado' || message === 'E-mail inválido') {
      return res.status(409).json({ error: message });
    }
    console.error(e);
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Informe o e-mail para recuperar a senha.' });

  try {
    const emailChecker = new ForgotPasswordEmailChecker();
    const normalizedEmail = await emailChecker.ensureRegistered(email);
    const { code, expiresAt, mailInfo } = await createPasswordResetToken(normalizedEmail);

    console.log(`🔐 Reset solicitado para ${normalizedEmail}. Código: ${code}`);

    return res.json({
      ok: true,
      message: `Se o e-mail ${normalizedEmail} estiver cadastrado, enviaremos um código de 6 dígitos para redefinir a senha.`,
      resetCode: code,
      expiresAt,
      emailInfo: mailInfo,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro ao recuperar senha';
    if (message === 'E-mail inválido' || message === 'E-mail não cadastrado') {
      return res.status(404).json({ error: message });
    }
    console.error(e);
    return res.status(500).json({ error: 'Erro ao recuperar senha' });
  }
});

router.post('/password-reset/confirm', async (req, res) => {
  const { email, code, password } = req.body;

  if (!email || !code || !password) {
    return res.status(400).json({ error: 'Informe o e-mail, o código e a nova senha.' });
  }

  if (!/^\d{6}$/.test(String(code).trim())) {
    return res.status(400).json({ error: 'O código deve conter 6 dígitos.' });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedCode = String(code).trim();
    const storedToken = await pool.query(
      `SELECT * FROM password_reset_tokens
       WHERE email = $1
         AND token = $2
         AND used_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [normalizedEmail, normalizedCode]
    );

    if (storedToken.rows.length === 0) {
      return res.status(400).json({ error: 'Código inválido ou expirado.' });
    }

    const hash = await bcrypt.hash(String(password), 10);

    await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, normalizedEmail]);
    await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [storedToken.rows[0].id]);

    return res.json({
      ok: true,
      message: 'Senha redefinida com sucesso.',
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro ao redefinir a senha.' });
  }
});

export default router;
