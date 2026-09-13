import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { pool } from './db.js';

if (!process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET não está definida. Configure a variável de ambiente JWT_SECRET antes de iniciar o servidor.'
  );
}

const SECRET: string = process.env.JWT_SECRET;

export function signToken(payload: Record<string, unknown>) {
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}

export function signPasswordResetToken(email: string) {
  return jwt.sign({ email, purpose: 'password-reset' }, SECRET, { expiresIn: '15m' });
}

export function verifyPasswordResetToken(token: string) {
  const payload = jwt.verify(token, SECRET) as Record<string, unknown>;
  if (payload.purpose !== 'password-reset' || typeof payload.email !== 'string') {
    throw new Error('Invalid password reset token');
  }
  return payload;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  try {
    const payload = jwt.verify(auth.slice(7), SECRET) as Record<string, unknown>;
    if (typeof payload.id !== 'number') {
      return res.status(401).json({ error: 'Token inválido' });
    }
    req.userId = payload.id;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

/**
 * Admin authorization is enforced server-side. The browser/device type is
 * never treated as proof of administrative permission.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    const payload = jwt.verify(auth.slice(7), SECRET) as Record<string, unknown>;
    if (typeof payload.id !== 'number') {
      return res.status(401).json({ error: 'Token inválido' });
    }

    req.userId = payload.id;
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE
    `);

    // Bootstrap only when no administrator exists yet: the oldest account is
    // treated as the initial owner. Once an admin exists, this never promotes
    // another account automatically.
    await pool.query(`
      UPDATE users
      SET is_admin = TRUE
      WHERE id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)
        AND NOT EXISTS (SELECT 1 FROM users WHERE is_admin = TRUE)
    `);

    const result = await pool.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [req.userId],
    );

    if (!result.rows[0]?.is_admin) {
      return res.status(403).json({ error: 'Acesso administrativo não autorizado' });
    }

    return next();
  } catch (error) {
    console.error('Admin authorization error:', error);
    return res.status(401).json({ error: 'Token inválido ou acesso não autorizado' });
  }
}
