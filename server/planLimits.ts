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
  return { accountId: row.account_id, plan: getPlan(row.plan_key) };
}

/** Limite mensal compartilhado por todos os usuários da mesma empresa. */
export function enforceOrderLimit() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId as number;
    const ctx = await getAccountContext(userId);
    if (!ctx) return res.status(403).json({ error: 'Conta sem plano associado. Contate o suporte.' });
    res.locals.account = ctx;

    const limit = ctx.plan.limits.maxOrdersPerMonth;
    if (limit === null) return next();

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int as count FROM orders o
       WHERE o.account_id = $1
         AND date_trunc('month', o.created_at) = date_trunc('month', NOW())`,
      [ctx.accountId]
    );
    const usedThisMonth = rows[0].count as number;

    // Limite de OS é soft/fair-use: nunca bloqueia uma OS urgente.
    // O consumo é exposto para a interface e registrado para acompanhamento.
    res.locals.orderUsage = { used: usedThisMonth, limit, percent: Math.round((usedThisMonth / limit) * 100) };
    if (usedThisMonth >= limit) {
      console.warn(`⚠️ Conta ${ctx.accountId} excedeu fair-use de OS do plano ${ctx.plan.key}: ${usedThisMonth}/${limit}`);
    }
    next();
  };
}

/** Middleware de checagem de feature (ex: relatórios financeiros, PDF, API). */
export function requireFeature(feature: keyof PlanFeatures) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId as number;
    const ctx = await getAccountContext(userId);
    if (!ctx) return res.status(403).json({ error: 'Conta sem plano associado. Contate o suporte.' });
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

export function assertPhotoLimit(plan: Plan, attendances: { photos?: unknown[]; [key: string]: any }[]) {
  const limit = plan.limits.maxPhotosPerAttendance;
  if (limit === null) return;
  for (const a of attendances) {
    if ((a.photos?.length || 0) > limit) {
      const err: any = new Error(`Limite do plano ${plan.name} é de ${limit} fotos por atendimento.`);
      err.status = 402;
      err.code = 'PLAN_LIMIT_PHOTOS';
      throw err;
    }
  }
}
