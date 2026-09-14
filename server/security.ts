import type { RequestHandler } from 'express';
import { pool } from './db.js';

export function createRateLimiter(options: { windowMs: number; max: number; message?: string }): RequestHandler {
  return async (req, res, next) => {
    const now = new Date();
    const resetAt = new Date(now.getTime() + options.windowMs);
    const key = `${req.ip || req.socket.remoteAddress || 'unknown'}:${req.path}`;

    try {
      const result = await pool.query(
        `INSERT INTO auth_rate_limits (key, count, reset_at, updated_at)
         VALUES ($1, 1, $2, NOW())
         ON CONFLICT (key) DO UPDATE
         SET count = CASE
           WHEN auth_rate_limits.reset_at <= NOW() THEN 1
           ELSE auth_rate_limits.count + 1
         END,
         reset_at = CASE
           WHEN auth_rate_limits.reset_at <= NOW() THEN EXCLUDED.reset_at
           ELSE auth_rate_limits.reset_at
         END,
         updated_at = NOW()
         RETURNING count, reset_at`,
        [key, resetAt],
      );

      const bucket = result.rows[0];
      if (Number(bucket.count) > options.max) {
        const retryAfter = Math.max(1, Math.ceil((new Date(bucket.reset_at).getTime() - Date.now()) / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({
          error: options.message || 'Muitas tentativas. Tente novamente mais tarde.',
        });
      }

      // Opportunistically remove stale buckets without adding a scheduled job.
      if (Math.random() < 0.01) {
        await pool.query('DELETE FROM auth_rate_limits WHERE reset_at < NOW() - INTERVAL \'1 hour\'').catch(() => undefined);
      }

      next();
    } catch (error) {
      // Rate limiting must not make the entire application unavailable if the limiter store is temporarily unreachable.
      // Fail closed for authentication-sensitive routes and fail open only for non-sensitive uses.
      console.error('Rate limiter error:', error);
      return res.status(503).json({ error: 'Serviço temporariamente indisponível. Tente novamente.' });
    }
  };
}

export const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Muitas tentativas de autenticação. Aguarde alguns minutos e tente novamente.',
});

export const passwordResetRequestRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Muitas solicitações de recuperação. Aguarde alguns minutos e tente novamente.',
});

export const passwordResetConfirmRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Muitas tentativas de código. Aguarde alguns minutos e tente novamente.',
});

export const webAuthnRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: 'Muitas tentativas de biometria. Aguarde alguns minutos e tente novamente.',
});
