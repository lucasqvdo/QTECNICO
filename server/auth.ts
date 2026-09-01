import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

if (!process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET não está definida. Configure a variável de ambiente JWT_SECRET antes de iniciar o servidor.'
  );
}

const SECRET: string = process.env.JWT_SECRET;

export function signToken(payload: Record<string, unknown>) {
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  try {
    const payload = jwt.verify(auth.slice(7), SECRET) as Record<string, unknown>;
    req.userId = payload.id as number;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}
