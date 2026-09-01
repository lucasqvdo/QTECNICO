// Estende a interface Request do Express para incluir campos injetados
// pelo middleware requireAuth (server/auth.ts).
// Isso elimina a necessidade de (req as any).userId em todas as rotas.

declare namespace Express {
  interface Request {
    /** ID do usuário autenticado — preenchido pelo middleware requireAuth. */
    userId?: number;
  }
}
