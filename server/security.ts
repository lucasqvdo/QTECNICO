import type { RequestHandler } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: { windowMs: number; max: number; message?: string }): RequestHandler {
  const buckets = new Map<string, Bucket>();

  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip || req.socket.remoteAddress || 'unknown'}:${req.path}`;
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: options.message || 'Muitas tentativas. Tente novamente mais tarde.',
      });
    }

    next();
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
