import { createHash, randomBytes } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { pool } from './db.js';

export const SESSION_COOKIE = 'qtecnico_session';
export const CSRF_COOKIE = 'qtecnico_csrf';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((cookies, part) => {
    const index = part.indexOf('=');
    if (index <= 0) return cookies;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { cookies[key] = decodeURIComponent(value); } catch { cookies[key] = value; }
    return cookies;
  }, {});
}

function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function cookieOptions(httpOnly: boolean) {
  return {
    httpOnly,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
}

export async function createSession(userId: number, res: Response) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const csrfToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await pool.query(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );

  res.cookie(SESSION_COOKIE, token, cookieOptions(true));
  res.cookie(CSRF_COOKIE, csrfToken, cookieOptions(false));
}

export async function revokeCurrentSession(req: Request, res: Response) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) {
    await pool.query(
      'UPDATE auth_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
      [hashSessionToken(token)],
    );
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}

export function validateCsrf(req: Request) {
  const cookies = parseCookies(req);
  const cookieToken = cookies[CSRF_COOKIE];
  const headerToken = req.get('X-CSRF-Token');
  return Boolean(cookieToken && headerToken && cookieToken === headerToken);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: 'Não autorizado' });

  try {
    const result = await pool.query(
      `SELECT user_id FROM auth_sessions
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [hashSessionToken(token)],
    );
    const userId = result.rows[0]?.user_id;
    if (typeof userId !== 'number') return res.status(401).json({ error: 'Sessão inválida ou expirada' });

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !validateCsrf(req)) {
      return res.status(403).json({ error: 'Proteção CSRF inválida' });
    }

    req.userId = userId;
    next();
  } catch (error) {
    console.error('Session authorization error:', error);
    return res.status(401).json({ error: 'Sessão inválida' });
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  return requireAuth(req, res, async () => {
    try {
      const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.userId]);
      if (!result.rows[0]?.is_admin) return res.status(403).json({ error: 'Acesso administrativo não autorizado' });
      return next();
    } catch (error) {
      console.error('Admin authorization error:', error);
      return res.status(401).json({ error: 'Sessão inválida ou acesso não autorizado' });
    }
  });
}

export function hasSessionCookie(req: Request) {
  return Boolean(parseCookies(req)[SESSION_COOKIE]);
}
