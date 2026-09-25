import type { Request, Response, NextFunction } from 'express';
import { getAccountContext, getMonthlyOrderUsage, type Plan } from './plans.js';
export { getAccountContext, type AccountContext } from './plans.js';

/** Limite mensal compartilhado por todos os usuários da mesma empresa. */
export function enforceOrderLimit() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId as number;
    const ctx = await getAccountContext(userId);
    if (!ctx) return res.status(403).json({ error: 'Conta sem plano associado. Contate o suporte.' });
    res.locals.account = ctx;

    const limit = ctx.plan.limits.ordersPerMonth;
    const usage = await getMonthlyOrderUsage(ctx.accountId, limit);

    // Limite de OS é soft/fair-use: nunca bloqueia uma OS urgente.
    // O consumo é exposto para a interface e registrado para acompanhamento.
    res.locals.orderUsage = usage;
    if (limit !== null && usage.used >= limit) {
      console.warn(`⚠️ Conta ${ctx.accountId} excedeu fair-use de OS do plano ${ctx.plan.key}: ${usage.used}/${limit}`);
    }
    next();
  };
}

/** Middleware de checagem de feature (ex: relatórios financeiros, PDF, API). */
export function requireFeature(feature: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId as number;
    const ctx = await getAccountContext(userId);
    if (!ctx) return res.status(403).json({ error: 'Conta sem plano associado. Contate o suporte.' });
    res.locals.account = ctx;

    if (!ctx.plan.features.includes(feature)) {
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
