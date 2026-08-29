import type { Request, Response, NextFunction } from 'express';
import { pool } from './db.js';
import { getPlan, Plan, PlanFeatures } from './plans.js';

export interface AccountContext {
  accountId: number;
  plan: Plan;
}

/** Busca a account (e o plano) do usuário autenticado. */
export async function getAccountContext(userId: number): Promise<AccountContext | null> {
  const { rows } = await pool.query(
    `SELECT a.id as account_id, a.plan_key, a.subscription_status
     FROM users u JOIN accounts a ON a.id = u.account_id
     WHERE u.id = $1`,
    [userId]
  );
  if (rows.length === 0) return null;

  const row = rows[0];
  // Assinatura inadimplente/cancelada cai automaticamente pro plano Grátis,
  // mesmo que plan_key ainda esteja marcado como um plano pago no banco.
  const effectivePlanKey = row.subscription_status === 'active' ? row.plan_key : 'free';
  return { accountId: row.account_id, plan: getPlan(effectivePlanKey) };
}

/**
 * Middleware: bloqueia criação de novas ordens quando a account já atingiu o
 * limite mensal do plano. Anexa `res.locals.account` para as rotas reaproveitarem
 * sem consultar o banco de novo.
 */
export function enforceOrderLimit() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).userId as number;
    const ctx = await getAccountContext(userId);
    if (!ctx) {
      return res.status(403).json({ error: 'Conta sem plano associado. Contate o suporte.' });
    }
    res.locals.account = ctx;

    const limit = ctx.plan.limits.maxOrdersPerMonth;
    if (limit === null) return next(); // ilimitado

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int as count FROM orders
       WHERE user_id = $1 AND date_trunc('month', created_at) = date_trunc('month', NOW())`,
      [userId]
    );
    const usedThisMonth = rows[0].count as number;

    if (usedThisMonth >= limit) {
      return res.status(402).json({
        error: `Limite do plano ${ctx.plan.name} atingido (${limit} ordens/mês). Faça upgrade para continuar.`,
        code: 'PLAN_LIMIT_ORDERS',
        plan: ctx.plan.key,
        limit,
      });
    }
    next();
  };
}

/**
 * Middleware de checagem de feature (ex: relatórios financeiros, PDF, API).
 * Usar em rotas que só devem existir para planos pagos: `requireFeature('pdfExport')`.
 */
export function requireFeature(feature: keyof PlanFeatures) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).userId as number;
    const ctx = await getAccountContext(userId);
    if (!ctx) {
      return res.status(403).json({ error: 'Conta sem plano associado. Contate o suporte.' });
    }
    res.locals.account = ctx;

    if (!ctx.plan.features[feature]) {
      return res.status(402).json({
        error: `Recurso disponível a partir de um plano superior ao ${ctx.plan.name}.`,
        code: 'PLAN_LIMIT_FEATURE',
        feature,
        plan: ctx.plan.key,
      });
    }
    next();
  };
}

/**
 * Valida o número de fotos de um array de attendances contra o limite do plano.
 * Chamar dentro da rota (não como middleware de rota), já que hoje as fotos
 * chegam embutidas no payload de PUT /orders/:id, e não em um endpoint próprio.
 */
export function assertPhotoLimit(plan: Plan, attendances: { photos?: unknown[] }[]) {
  const limit = plan.limits.maxPhotosPerAttendance;
  if (limit === null) return; // ilimitado
  for (const a of attendances) {
    if ((a.photos?.length || 0) > limit) {
      const err: any = new Error(`Limite do plano ${plan.name} é de ${limit} fotos por atendimento.`);
      err.status = 402;
      err.code = 'PLAN_LIMIT_PHOTOS';
      throw err;
    }
  }
}
