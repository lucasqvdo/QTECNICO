import { Router } from 'express';
import { pool } from '../db.js';
import { requireAdmin } from '../auth.js';
import { createAsaasCustomer, createAsaasSubscription, getAsaasSubscriptionPayments } from '../services/asaas.js';

const router = Router();

type BillingType = 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'UNDEFINED';

async function getAccountContext(userId: number) {
  const result = await pool.query(`
    SELECT a.id AS account_id,
           a.owner_user_id,
           cp.trade_name,
           cp.legal_name,
           cp.document,
           cp.email AS company_email,
           cp.phone,
           u.name AS owner_name,
           u.email AS owner_email
    FROM accounts a
    LEFT JOIN company_profiles cp ON cp.account_id = a.id
    LEFT JOIN users u ON u.id = a.owner_user_id
    WHERE a.owner_user_id = $1
    LIMIT 1
  `, [userId]);
  return result.rows[0] || null;
}

async function syncAsaasPayments(subscriptionId: number, providerSubscriptionId: string) {
  const remote = await getAsaasSubscriptionPayments(providerSubscriptionId);
  const payments = Array.isArray((remote as any)?.data) ? (remote as any).data : [];

  for (const payment of payments) {
    if (!payment?.id) continue;
    await pool.query(`
      INSERT INTO subscription_payments
        (subscription_id, account_id, amount, currency, status, due_at, paid_at, refunded_at, provider, provider_payment_id, invoice_url, failure_reason, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'asaas',$9,$10,$11,$12::jsonb)
      ON CONFLICT (provider_payment_id) DO UPDATE SET
        amount=EXCLUDED.amount,
        status=EXCLUDED.status,
        due_at=EXCLUDED.due_at,
        paid_at=EXCLUDED.paid_at,
        refunded_at=EXCLUDED.refunded_at,
        invoice_url=EXCLUDED.invoice_url,
        failure_reason=EXCLUDED.failure_reason,
        metadata=EXCLUDED.metadata,
        updated_at=NOW()
    `, [
      subscriptionId,
      Number(payment.accountId || 0),
      Number(payment.value || 0),
      payment.currency || 'BRL',
      payment.status || 'PENDING',
      payment.dueDate || null,
      payment.paymentDate || payment.confirmedDate || null,
      payment.refundDate || null,
      payment.id,
      payment.invoiceUrl || null,
      payment.failureReason || null,
      JSON.stringify({ billingType: payment.billingType || null, customer: payment.customer || null, subscription: payment.subscription || providerSubscriptionId })
    ]);
  }

  return payments;
}

router.get('/billing', requireAdmin, async (req, res) => {
  try {
    const account = await getAccountContext(req.userId!);
    if (!account) return res.status(403).json({ error: 'Conta SaaS não encontrada.' });

    const [plans, subscriptionResult] = await Promise.all([
      pool.query(`SELECT plan_key,name,description,amount,currency,billing_interval,features,limits FROM saas_plans WHERE active=TRUE ORDER BY amount ASC`),
      pool.query(`SELECT s.*,sp.name AS plan_name,sp.description AS plan_description FROM subscriptions s LEFT JOIN saas_plans sp ON sp.plan_key=s.plan_key WHERE s.account_id=$1 ORDER BY s.created_at DESC LIMIT 1`, [account.account_id]),
    ]);

    const subscription = subscriptionResult.rows[0] || null;
    let payments: any[] = [];
    if (subscription?.provider === 'asaas' && subscription.provider_subscription_id) {
      try {
        payments = await syncAsaasPayments(subscription.id, subscription.provider_subscription_id);
      } catch (error) {
        console.warn('Billing Asaas refresh failed:', error);
      }
    }

    const localPayments = await pool.query(`SELECT id,amount,currency,status,due_at,paid_at,refunded_at,provider,provider_payment_id,invoice_url,failure_reason,created_at FROM subscription_payments WHERE account_id=$1 ORDER BY COALESCE(paid_at,due_at,created_at) DESC LIMIT 30`, [account.account_id]);

    res.json({
      account: { id: account.account_id, company: account.trade_name || account.legal_name || 'Empresa', email: account.company_email || account.owner_email || '', document: account.document || '' },
      plans: plans.rows.map((p) => ({ key: p.plan_key, name: p.name, description: p.description, amount: Number(p.amount || 0), currency: p.currency, billingInterval: p.billing_interval, features: p.features, limits: p.limits })),
      subscription: subscription ? {
        id: subscription.id,
        planKey: subscription.plan_key,
        planName: subscription.plan_name,
        status: subscription.status,
        amount: Number(subscription.amount || 0),
        currency: subscription.currency,
        billingInterval: subscription.billing_interval,
        trialStartAt: subscription.trial_start_at,
        trialEndAt: subscription.trial_end_at,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        canceledAt: subscription.canceled_at,
        provider: subscription.provider,
        providerSubscriptionId: subscription.provider_subscription_id,
      } : null,
      payments: localPayments.rows.map((p) => ({ id: p.id, amount: Number(p.amount || 0), currency: p.currency, status: p.status, dueAt: p.due_at, paidAt: p.paid_at, refundedAt: p.refunded_at, provider: p.provider, providerPaymentId: p.provider_payment_id, invoiceUrl: p.invoice_url, failureReason: p.failure_reason, createdAt: p.created_at })),
    });
  } catch (error) {
    console.error('Customer billing error:', error);
    res.status(500).json({ error: 'Não foi possível carregar a assinatura.' });
  }
});

router.post('/billing/subscribe', requireAdmin, async (req, res) => {
  try {
    const planKey = typeof req.body?.planKey === 'string' ? req.body.planKey.trim() : '';
    const billingType = String(req.body?.billingType || 'PIX').toUpperCase() as BillingType;
    if (!planKey) return res.status(400).json({ error: 'Informe o plano.' });
    if (!['PIX', 'CREDIT_CARD', 'BOLETO', 'UNDEFINED'].includes(billingType)) return res.status(400).json({ error: 'Forma de pagamento inválida.' });

    const account = await getAccountContext(req.userId!);
    if (!account) return res.status(403).json({ error: 'Conta SaaS não encontrada.' });

    const planResult = await pool.query(`SELECT plan_key,name,amount,billing_interval,active FROM saas_plans WHERE plan_key=$1 LIMIT 1`, [planKey]);
    const plan = planResult.rows[0];
    if (!plan || !plan.active) return res.status(404).json({ error: 'Plano não encontrado ou inativo.' });
    if (Number(plan.amount || 0) <= 0) return res.status(400).json({ error: 'O plano gratuito não precisa de cobrança.' });

    const activeResult = await pool.query(`SELECT id FROM subscriptions WHERE account_id=$1 AND status IN ('active','trial','trialing','past_due','unpaid') ORDER BY created_at DESC LIMIT 1`, [account.account_id]);
    if (activeResult.rows[0]) return res.status(409).json({ error: 'A empresa já possui uma assinatura ativa. Consulte o Financeiro para alterar o plano.' });

    const previousResult = await pool.query(`SELECT metadata FROM subscriptions WHERE account_id=$1 AND provider='asaas' ORDER BY created_at DESC LIMIT 1`, [account.account_id]);
    let asaasCustomerId = previousResult.rows[0]?.metadata?.asaasCustomerId || null;

    if (!asaasCustomerId) {
      const customer = await createAsaasCustomer({
        name: account.trade_name || account.legal_name || account.owner_name,
        cpfCnpj: account.document || undefined,
        email: account.company_email || account.owner_email || undefined,
        mobilePhone: account.phone || undefined,
        externalReference: `qtecnico:account:${account.account_id}`,
      }) as any;
      asaasCustomerId = customer?.id;
      if (!asaasCustomerId) return res.status(502).json({ error: 'O Asaas não retornou o identificador do cliente.' });
    }

    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate());
    const dueDate = nextDueDate.toISOString().slice(0, 10);
    const cycle = String(plan.billing_interval).toLowerCase() === 'month' ? 'MONTHLY' : 'MONTHLY';

    const remoteSubscription = await createAsaasSubscription({
      customer: asaasCustomerId,
      billingType,
      value: Number(plan.amount),
      nextDueDate: dueDate,
      cycle,
      description: `QTECNICO — ${plan.name}`,
      externalReference: `qtecnico:account:${account.account_id}:plan:${planKey}`,
    }) as any;

    if (!remoteSubscription?.id) return res.status(502).json({ error: 'O Asaas não retornou o identificador da assinatura.' });

    const inserted = await pool.query(`
      INSERT INTO subscriptions
        (account_id,plan_key,status,billing_interval,amount,currency,current_period_start,current_period_end,provider,provider_subscription_id,metadata)
      VALUES ($1,$2,$3,'month',$4,'BRL',NOW(),$5,'asaas',$6,$7::jsonb)
      RETURNING id
    `, [
      account.account_id,
      planKey,
      remoteSubscription.status || 'active',
      Number(plan.amount),
      remoteSubscription.nextDueDate || dueDate,
      remoteSubscription.id,
      JSON.stringify({ asaasCustomerId, asaasSubscriptionId: remoteSubscription.id, billingType }),
    ]);

    const subscriptionId = inserted.rows[0].id;
    await pool.query(`INSERT INTO subscription_events (account_id,subscription_id,actor_user_id,event_type,source,payload) VALUES ($1,$2,$3,'subscription_created','customer',$4::jsonb)`, [account.account_id, subscriptionId, req.userId, JSON.stringify({ provider:'asaas', providerSubscriptionId:remoteSubscription.id, asaasCustomerId, planKey, billingType })]);

    let payments: any[] = [];
    try {
      payments = await syncAsaasPayments(subscriptionId, remoteSubscription.id);
    } catch (error) {
      console.warn('Initial Asaas payment sync failed:', error);
    }

    res.status(201).json({ success: true, subscriptionId, providerSubscriptionId: remoteSubscription.id, payments: payments.map((p:any) => ({ id:p.id, status:p.status, invoiceUrl:p.invoiceUrl, dueDate:p.dueDate, value:Number(p.value||0), billingType:p.billingType })) });
  } catch (error) {
    console.error('Customer subscription error:', error);
    res.status(502).json({ error: error instanceof Error ? error.message : 'Não foi possível criar a assinatura no Asaas.' });
  }
});

router.post('/billing/refresh', requireAdmin, async (req, res) => {
  try {
    const account = await getAccountContext(req.userId!);
    if (!account) return res.status(403).json({ error: 'Conta SaaS não encontrada.' });
    const subscriptionResult = await pool.query(`SELECT id,provider_subscription_id FROM subscriptions WHERE account_id=$1 AND provider='asaas' ORDER BY created_at DESC LIMIT 1`, [account.account_id]);
    const subscription = subscriptionResult.rows[0];
    if (!subscription?.provider_subscription_id) return res.status(404).json({ error: 'Nenhuma assinatura Asaas encontrada.' });
    const payments = await syncAsaasPayments(subscription.id, subscription.provider_subscription_id);
    res.json({ payments: payments.map((p:any) => ({ id:p.id,status:p.status,invoiceUrl:p.invoiceUrl,dueDate:p.dueDate,value:Number(p.value||0),billingType:p.billingType })) });
  } catch (error) {
    console.error('Customer billing refresh error:', error);
    res.status(502).json({ error: error instanceof Error ? error.message : 'Não foi possível atualizar a cobrança.' });
  }
});

export default router;
