import { Router } from 'express';
import { getMonthlyOrderUsage } from '../plans.js';
import { requireAuth } from '../auth.js';
import { getAccountContext } from '../planLimits.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const userId = req.userId;
  const ctx = await getAccountContext(userId);
  if (!ctx) return res.status(404).json({ error: 'Conta não encontrada' });

  const usage = await getMonthlyOrderUsage(ctx.accountId, ctx.plan.limits.ordersPerMonth);
  const hasFeature = (feature: string) => ctx.plan.features.includes(feature);

  res.json({
    plan: ctx.plan.key,
    planName: ctx.plan.name,
    // Mantém o contrato legado deste endpoint, derivado do catálogo atual.
    limits: {
      maxOrdersPerMonth: ctx.plan.limits.ordersPerMonth,
      maxPhotosPerAttendance: ctx.plan.limits.maxPhotosPerAttendance,
      maxUsers: ctx.plan.limits.maxUsers,
    },
    features: {
      financialReports: hasFeature('reports'),
      pdfExport: hasFeature('pdf'),
      clientNotifications: hasFeature('clientNotifications'),
      multiUser: ctx.plan.limits.maxUsers > 1,
      api: hasFeature('integrations'),
      whiteLabel: hasFeature('whiteLabel'),
    },
    usage: {
      ordersThisMonth: usage.used,
      ordersLimit: usage.limit,
    },
  });
});

export default router;
