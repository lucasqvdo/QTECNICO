import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { signToken, signPasswordResetToken, verifyPasswordResetToken } from '../auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Credenciais inválidas' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
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
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0) return res.status(409).json({ error: 'E-mail já cadastrado' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, role, phone, email, password_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, 'Técnico', '', email, hash]
    );
    const userId = result.rows[0].id;
    const token = signToken({ id: userId, email });

    res.status(201).json({
      token,
      user: { id: userId, name, role: 'Técnico', phone: '', email, photoUrl: null },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

router.post('/password-reset/request', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email) return res.status(400).json({ error: 'Informe o e-mail da conta' });

  try {
    const result = await pool.query('SELECT email FROM users WHERE LOWER(email) = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Não encontramos uma conta com esse e-mail' });
    }

    res.json({ exists: true, resetToken: signPasswordResetToken(result.rows[0].email) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao verificar a conta' });
  }
});

router.post('/password-reset/confirm', async (req, res) => {
  const { resetToken, password } = req.body;
  if (typeof resetToken !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Dados de recuperação inválidos' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' });
  }

  try {
    const payload = verifyPasswordResetToken(resetToken);
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE LOWER(email) = LOWER($2) RETURNING id',
      [hash, payload.email],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conta não encontrada' });
    }
    res.json({ success: true });
  } catch (e) {
    if (e instanceof Error && e.name === 'TokenExpiredError') {
      return res.status(400).json({ error: 'O código de recuperação expirou. Solicite um novo.' });
    }
    res.status(400).json({ error: 'O código de recuperação é inválido. Solicite um novo.' });
  }
});

export default router;
