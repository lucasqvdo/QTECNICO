import { createHash, randomBytes } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { pool } from './db.js';

export const BACKOFFICE_SESSION_COOKIE = 'qtecnico_backoffice_session';
export const BACKOFFICE_CSRF_COOKIE = 'qtecnico_backoffice_csrf';
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

function hashToken(token: string) { return createHash('sha256').update(token).digest('hex'); }

function configuredEmails() {
  return (process.env.BACKOFFICE_ADMIN_EMAILS || '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
}

export async function isPlatformAdmin(userId: number) {
  const configured = configuredEmails();
  if (!configured.length) return false;
  const result = await pool.query('SELECT email, is_admin FROM users WHERE id = $1', [userId]);
  const email = String(result.rows[0]?.email || '').trim().toLowerCase();
  return Boolean(result.rows[0]?.is_admin && email && configured.includes(email));
}

export async function createBackofficeSession(userId: number, res: Response) {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query('INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [userId, hashToken(token), expiresAt]);
  const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: SESSION_TTL_MS };
  res.cookie(BACKOFFICE_SESSION_COOKIE, token, options);
  res.cookie(BACKOFFICE_CSRF_COOKIE, csrfToken, { ...options, httpOnly: false });
}

export async function revokeBackofficeSession(req: Request, res: Response) {
  const token = parseCookies(req)[BACKOFFICE_SESSION_COOKIE];
  if (token) await pool.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL', [hashToken(token)]);
  res.clearCookie(BACKOFFICE_SESSION_COOKIE, { path: '/' });
  res.clearCookie(BACKOFFICE_CSRF_COOKIE, { path: '/' });
}

export async function requireBackofficeAuth(req: Request, res: Response, next: NextFunction) {
  const token = parseCookies(req)[BACKOFFICE_SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: 'Sessão do Backoffice não encontrada' });
  try {
    const result = await pool.query(`SELECT user_id FROM auth_sessions WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1`, [hashToken(token)]);
    const userId = result.rows[0]?.user_id;
    if (typeof userId !== 'number' || !(await isPlatformAdmin(userId))) return res.status(403).json({ error: 'Acesso restrito ao Backoffice QTECNICO' });
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const cookies = parseCookies(req);
      if (!cookies[BACKOFFICE_CSRF_COOKIE] || cookies[BACKOFFICE_CSRF_COOKIE] !== req.get('X-CSRF-Token')) return res.status(403).json({ error: 'Proteção CSRF inválida' });
    }
    req.userId = userId;
    next();
  } catch (error) { console.error('Backoffice session error:', error); return res.status(401).json({ error: 'Sessão do Backoffice inválida' }); }
}
