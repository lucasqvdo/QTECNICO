import type { Express, Request } from 'express';
import cors from 'cors';

function allowedOrigins() {
  return (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

export function applyHttpSecurity(app: Express) {
  const configuredOrigins = allowedOrigins();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (configuredOrigins.includes(origin)) return callback(null, true);
      if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
      return callback(new Error('Origin não autorizada'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 600,
  }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (process.env.NODE_ENV === 'production' && req.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });
}
