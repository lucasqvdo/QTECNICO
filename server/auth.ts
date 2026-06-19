import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const SECRET = process.env.JWT_SECRET || 'qtecnico_jwt_secret_2024';

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
    (req as any).userId = payload.id;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}
