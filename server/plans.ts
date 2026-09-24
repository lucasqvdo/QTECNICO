import { pool } from './db.js';

export interface PlanLimits {
  ordersPerMonth: number | null;
  maxPhotosPerAttendance: number | null;
  maxUsers: number;
  [key: string]: unknown;
}

export interface Plan {
  key: string;
  name: string;
  features: string[];
  limits: PlanLimits;
}

export interface AccountContext {
  accountId: number;
  plan: Plan;
}

function readLimit(value: unknown, nullable = false): number | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Limite inválido no catálogo de planos');
  }
  return value;
}

async function loadAccountContext(id: number, byUser: boolean): Promise<AccountContext | null> {
  // accounts.plan_key é o plano efetivo. Uma assinatura pending_payment ainda
  // não concede acesso; cobrança/backoffice atualizam a conta na ativação.
  const { rows } = await pool.query(
    `SELECT a.id AS account_id, p.plan_key, p.name, p.features, p.limits
       FROM accounts a
       LEFT JOIN saas_plans p ON p.plan_key = a.plan_key
      WHERE a.id = ${byUser ? '(SELECT account_id FROM users WHERE id = $1)' : '$1'}`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  if (!row.plan_key || !Array.isArray(row.features) || !row.features.every((feature: unknown) => typeof feature === 'string')) {
    throw new Error('Plano da conta ausente ou inválido no catálogo');
  }
  const limits = row.limits;
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) {
    throw new Error('Limites do plano ausentes no catálogo');
  }
  return {
    accountId: Number(row.account_id),
    plan: {
      key: row.plan_key,
      name: row.name,
      features: row.features,
      limits: {
        ...limits,
        maxUsers: readLimit(limits.maxUsers) as number,
        ordersPerMonth: readLimit(limits.ordersPerMonth, true),
        maxPhotosPerAttendance: readLimit(limits.maxPhotosPerAttendance ?? null, true),
      },
    },
  };
}

export function getAccountContext(userId: number) {
  return loadAccountContext(userId, true);
}

export async function getAccountPlan(accountId: number): Promise<Plan> {
  const context = await loadAccountContext(accountId, false);
  if (!context) throw new Error('Conta não encontrada');
  return context.plan;
}

export async function getMonthlyOrderUsage(accountId: number, limit: number | null) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM orders o
      WHERE o.account_id = $1
        AND o.created_at >= date_trunc('month', NOW())
        AND o.created_at < date_trunc('month', NOW()) + INTERVAL '1 month'`,
    [accountId],
  );
  const used = Number(rows[0]?.count || 0);
  return { used, limit, percent: limit !== null && limit > 0 ? Math.round((used / limit) * 100) : 0 };
}

export async function getAccountEntitlements(accountId: number) {
  const plan = await getAccountPlan(accountId);
  const usage = await getMonthlyOrderUsage(accountId, plan.limits.ordersPerMonth);
  return {
    planKey: plan.key,
    features: plan.features,
    limits: { ...plan.limits, ordersUsedThisMonth: usage.used, ordersUsagePercent: usage.percent },
  };
}

export async function hasAccountFeature(accountId: number, feature: string) {
  const plan = await getAccountPlan(accountId);
  return plan.features.includes(feature);
}
