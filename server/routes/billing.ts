import { Router } from 'express';
import { pool } from '../db.js';
import { requireAdmin } from '../auth.js';
import { createAsaasCustomer, createAsaasSubscription, getAsaasSubscriptionPayments } from '../services/asaas.js';

const router = Router();
type BillingType = 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'UNDEFINED';

async function getAccountContext(userId: number) {
  const result = await pool.query(
    `SELECT a.id AS account_id,a.owner_user_id,cp.trade_name,cp.legal_name,cp.document,
            cp.email AS company_email,cp.phone,u.name AS owner_name,u.email AS owner_email
       FROM accounts a
       LEFT JOIN company_profiles cp ON cp.account_id=a.id
       LEFT JOIN users u ON u.id=a.owner_user_id
      WHERE a.owner_user_id=$1 LIMIT 1`,
    [userId],
  );
  return result.rows[0] || null;
}

async function syncAsaasPayments(accountId: number, subscriptionId: number, providerSubscriptionId: string) {
  const remote = await getAsaasSubscriptionPayments(providerSubscriptionId);
  const payments = Array.isArray(remote?.data) ? remote.data : [];
  for (const payment of payments) {
    if (!payment?.id) continue;
    await pool.query(
      `INSERT INTO subscription_payments
        (subscription_id,account_id,amount,currency,status,due_at,paid_at,refunded_at,provider,provider_payment_id,invoice_url,failure_reason,metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'asaas',$9,$10,$11,$12::jsonb)
       ON CONFLICT (provider_payment_id) DO UPDATE SET
         amount=EXCLUDED.amount,status=EXCLUDED.status,due_at=EXCLUDED.due_at,
         paid_at=EXCLUDED.paid_at,refunded_at=EXCLUDED.refunded_at,
         invoice_url=EXCLUDED.invoice_url,failure_reason=EXCLUDED.failure_reason,
         metadata=EXCLUDED.metadata,updated_at=NOW()`,
      [
        subscriptionId, accountId, Number(payment.value || 0), payment.currency || 'BRL',
        payment.status || 'PENDING', payment.dueDate || null,
        payment.paymentDate || payment.confirmedDate || null, payment.refundDate || null,
        payment.id, payment.invoiceUrl || null, payment.failureReason || null,
        JSON.stringify({ billingType: payment.billingType || null, customer: payment.customer || null, subscription: payment.subscription || providerSubscriptionId }),
      ],
    );
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
    if (subscription?.provider === 'asaas' && subscription.provider_subscription_id) {
      try { await syncAsaasPayments(account.account_id, subscription.id, subscription.provider_subscription_id); }
      catch (error) { console.warn('Billing Asaas refresh failed:', error); }
    }
    const localPayments = await pool.query(`SELECT id,amount,currency,status,due_at,paid_at,refunded_at,provider,provider_payment_id,invoice_url,failure_reason,created_at FROM subscription_payments WHERE account_id=$1 ORDER BY COALESCE(paid_at,due_at,created_at) DESC LIMIT 30`, [account.account_id]);
    return res.json({
      account: { id: account.account_id, company: account.trade_name || account.legal_name || 'Empresa', email: account.company_email || account.owner_email || '', document: account.document || '' },
      plans: plans.rows.map((p) => ({ key: p.plan_key, name: p.name, description: p.description, amount: Number(p.amount || 0), currency: p.currency, billingInterval: p.billing_interval, features: p.features, limits: p.limits })),
      subscription: subscription ? { id: subscription.id, planKey: subscription.plan_key, planName: subscription.plan_name, status: subscription.status, amount: Number(subscription.amount || 0), currency: subscription.currency, billingInterval: subscription.billing_interval, trialStartAt: subscription.trial_start_at, trialEndAt: subscription.trial_end_at, currentPeriodStart: subscription.current_period_start, currentPeriodEnd: subscription.current_period_end, canceledAt: subscription.canceled_at, provider: subscription.provider, providerSubscriptionId: subscription.provider_subscription_id } : null,
      payments: localPayments.rows.map((p) => ({ id: p.id, amount: Number(p.amount || 0), currency: p.currency, status: p.status, dueAt: p.due_at, paidAt: p.paid_at, refundedAt: p.refunded_at, provider: p.provider, providerPaymentId: p.provider_payment_id, invoiceUrl: p.invoice_url, failureReason: p.failure_reason, createdAt: p.created_at })),
    });
  } catch (error) {
    console.error('Customer billing error:', error);
    return res.status(500).json({ error: 'Não foi possível carregar a assinatura.' });
  }
});

router.post('/billing/subscribe', requireAdmin, async (req, res) => {
  try {
    const planKey = typeof req.body?.planKey === 'string' ? req.body.planKey.trim() : '';
    const billingType = String(req.body?.billingType || 'PIX').toUpperCase() as BillingType;
    if (!planKey) return res.status(400).json({ error: 'Informe o plano.' });
    if (!['PIX','CREDIT_CARD','BOLETO','UNDEFINED'].includes(billingType)) return res.status(400).json({ error: 'Forma de pagamento inválida.' });
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
      const customer = await createAsaasCustomer({ name: account.trade_name || account.legal_name || account.owner_name, cpfCnpj: account.document || undefined, email: account.company_email || account.owner_email || undefined, mobilePhone: account.phone || undefined, externalReference: `qtecnico:account:${account.account_id}` }) as any;
      asaasCustomerId = customer?.id;
      if (!asaasCustomerId) return res.status(502).json({ error: 'O Asaas não retornou o identificador do cliente.' });
    }
    const dueDate = new Date().toISOString().slice(0, 10);
    const remoteSubscription = await createAsaasSubscription({ customer: asaasCustomerId, billingType, value: Number(plan.amount), nextDueDate: dueDate, cycle: 'MONTHLY', description: `QTECNICO — ${plan.name}`, externalReference: `qtecnico:account:${account.account_id}:plan:${planKey}` }) as any;
    if (!remoteSubscription?.id) return res.status(502).json({ error: 'O Asaas não retornou o identificador da assinatura.' });
    const inserted = await pool.query(`INSERT INTO subscriptions (account_id,plan_key,status,billing_interval,amount,currency,current_period_start,current_period_end,provider,provider_subscription_id,metadata) VALUES ($1,$2,$3,'month',$4,'BRL',NOW(),$5,'asaas',$6,$7::jsonb) RETURNING id`, [account.account_id, planKey, 'pending_payment', Number(plan.amount), remoteSubscription.nextDueDate || dueDate, remoteSubscription.id, JSON.stringify({ asaasCustomerId, asaasSubscriptionId: remoteSubscription.id, billingType })]);
    const subscriptionId = inserted.rows[0].id;
    await pool.query(`INSERT INTO subscription_events (account_id,subscription_id,actor_user_id,event_type,source,payload) VALUES ($1,$2,$3,'subscription_created','customer',$4::jsonb)`, [account.account_id, subscriptionId, req.userId, JSON.stringify({ provider: 'asaas', providerSubscriptionId: remoteSubscription.id, asaasCustomerId, planKey, billingType })]);
    let payments: any[] = [];
    try { payments = await syncAsaasPayments(account.account_id, subscriptionId, remoteSubscription.id); }
    catch (error) { console.warn('Initial Asaas payment sync failed:', error); }
    return res.status(201).json({ success: true, subscriptionId, providerSubscriptionId: remoteSubscription.id, payments: payments.map((p: any) => ({ id: p.id, status: p.status, invoiceUrl: p.invoiceUrl, dueDate: p.dueDate, value: Number(p.value || 0), billingType: p.billingType })) });
  } catch (error) {
    console.error('Customer subscription error:', error);
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Não foi possível criar a assinatura no Asaas.' });
  }
});

router.post('/billing/refresh', requireAdmin, async (req, res) => {
  try {
    const account = await getAccountContext(req.userId!);
    if (!account) return res.status(403).json({ error: 'Conta SaaS não encontrada.' });
    const result = await pool.query(`SELECT id,provider_subscription_id FROM subscriptions WHERE account_id=$1 AND provider='asaas' ORDER BY created_at DESC LIMIT 1`, [account.account_id]);
    const subscription = result.rows[0];
    if (!subscription?.provider_subscription_id) return res.status(404).json({ error: 'Nenhuma assinatura Asaas encontrada.' });
    const payments = await syncAsaasPayments(account.account_id, subscription.id, subscription.provider_subscription_id);
    return res.json({ payments: payments.map((p: any) => ({ id: p.id, status: p.status, invoiceUrl: p.invoiceUrl, dueDate: p.dueDate, value: Number(p.value || 0), billingType: p.billingType })) });
  } catch (error) {
    console.error('Customer billing refresh error:', error);
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Não foi possível atualizar a cobrança.' });
  }
});

router.post('/webhooks/asaas', async (req, res) => {
  const expectedToken = String(process.env.ASAAS_WEBHOOK_TOKEN || '').trim();
  const receivedToken = String(req.header('asaas-access-token') || '').trim();
  if (!expectedToken) return res.status(503).json({ error: 'ASAAS_WEBHOOK_TOKEN não configurado.' });
  if (!receivedToken || receivedToken !== expectedToken) return res.status(401).json({ error: 'Webhook não autorizado.' });
  const eventId = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  const eventType = typeof req.body?.event === 'string' ? req.body.event.trim() : 'UNKNOWN';
  const payment = req.body?.payment || null;
  const subscription = req.body?.subscription || null;
  if (!eventId) return res.status(400).json({ error: 'Evento Asaas sem id.' });
  try {
    const providerPaymentId = typeof payment?.id === 'string' ? payment.id : null;
    const providerSubscriptionId = typeof payment?.subscription === 'string' ? payment.subscription : (typeof subscription?.id === 'string' ? subscription.id : null);
    const externalReference = typeof payment?.externalReference === 'string' ? payment.externalReference : (typeof subscription?.externalReference === 'string' ? subscription.externalReference : '');
    const accountMatch = externalReference.match(/^qtecnico:account:(\d+)(?::plan:[^:]+)?$/);
    const referencedAccountId = accountMatch ? Number(accountMatch[1]) : null;

    const duplicate = await pool.query(`SELECT subscription_id FROM subscription_events WHERE payload->>'asaasEventId'=$1 ORDER BY id DESC LIMIT 1`, [eventId]);
    if (duplicate.rows[0]?.subscription_id) return res.status(200).json({ received: true, duplicate: true, processed: true });

    let subscriptionRow: any = null;
    if (providerSubscriptionId) {
      const result = await pool.query(`SELECT id,account_id,status FROM subscriptions WHERE provider='asaas' AND provider_subscription_id=$1 LIMIT 1`, [providerSubscriptionId]);
      subscriptionRow = result.rows[0] || null;
    }
    if (!subscriptionRow && providerPaymentId) {
      const result = await pool.query(`SELECT s.id,s.account_id,s.status FROM subscription_payments p JOIN subscriptions s ON s.id=p.subscription_id WHERE p.provider='asaas' AND p.provider_payment_id=$1 LIMIT 1`, [providerPaymentId]);
      subscriptionRow = result.rows[0] || null;
    }
    if (!subscriptionRow && referencedAccountId) {
      const result = await pool.query(`SELECT id,account_id,status FROM subscriptions WHERE account_id=$1 AND provider='asaas' ORDER BY created_at DESC LIMIT 1`, [referencedAccountId]);
      subscriptionRow = result.rows[0] || null;
    }

    if (!subscriptionRow) {
      if (duplicate.rows[0]) {
        await pool.query(`UPDATE subscription_events SET account_id=COALESCE(account_id,$1),payload=$2::jsonb WHERE payload->>'asaasEventId'=$3 AND subscription_id IS NULL`, [referencedAccountId, JSON.stringify({ asaasEventId: eventId, event: eventType, payment, subscription, pendingReason: 'subscription_not_found' }), eventId]);
      } else {
        await pool.query(`INSERT INTO subscription_events (account_id,subscription_id,actor_user_id,event_type,source,payload) VALUES ($1,NULL,NULL,$2,'asaas_webhook',$3::jsonb)`, [referencedAccountId, eventType, JSON.stringify({ asaasEventId: eventId, event: eventType, payment, subscription, pendingReason: 'subscription_not_found' })]);
      }
      console.warn('Asaas webhook deferred: subscription not found', { eventId, providerPaymentId, providerSubscriptionId, referencedAccountId, eventType });
      return res.status(409).json({ received: true, processed: false, retry: true, reason: 'Subscription not found yet.' });
    }

    if (providerPaymentId) {
      await pool.query(`INSERT INTO subscription_payments (subscription_id,account_id,amount,currency,status,due_at,paid_at,refunded_at,provider,provider_payment_id,invoice_url,failure_reason,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'asaas',$9,$10,$11,$12::jsonb) ON CONFLICT (provider_payment_id) DO UPDATE SET subscription_id=EXCLUDED.subscription_id,account_id=EXCLUDED.account_id,amount=EXCLUDED.amount,status=EXCLUDED.status,due_at=EXCLUDED.due_at,paid_at=EXCLUDED.paid_at,refunded_at=EXCLUDED.refunded_at,invoice_url=EXCLUDED.invoice_url,failure_reason=EXCLUDED.failure_reason,metadata=EXCLUDED.metadata,updated_at=NOW()`, [subscriptionRow.id, subscriptionRow.account_id, Number(payment?.value || 0), payment?.currency || 'BRL', payment?.status || eventType, payment?.dueDate || null, payment?.paymentDate || payment?.confirmedDate || null, payment?.refundDate || null, providerPaymentId, payment?.invoiceUrl || null, payment?.failureReason || null, JSON.stringify({ asaasEventId: eventId, event: eventType, billingType: payment?.billingType || null, customer: payment?.customer || null, subscription: providerSubscriptionId })]);
    }

    const pendingEvent = await pool.query(`SELECT id FROM subscription_events WHERE payload->>'asaasEventId'=$1 AND subscription_id IS NULL ORDER BY id DESC LIMIT 1`, [eventId]);
    if (pendingEvent.rows[0]) {
      await pool.query(`UPDATE subscription_events SET account_id=$1,subscription_id=$2,payload=$3::jsonb WHERE id=$4`, [subscriptionRow.account_id, subscriptionRow.id, JSON.stringify({ asaasEventId: eventId, event: eventType, payment, subscription, replayed: true }), pendingEvent.rows[0].id]);
    } else {
      await pool.query(`INSERT INTO subscription_events (account_id,subscription_id,actor_user_id,event_type,source,payload) VALUES ($1,$2,NULL,$3,'asaas_webhook',$4::jsonb)`, [subscriptionRow.account_id, subscriptionRow.id, eventType, JSON.stringify({ asaasEventId: eventId, event: eventType, payment, subscription })]);
    }

    if (eventType === 'PAYMENT_RECEIVED' || eventType === 'PAYMENT_CONFIRMED') {
      const updatedSubscription = await pool.query(`UPDATE subscriptions SET status='active',updated_at=NOW() WHERE id=$1 RETURNING plan_key,current_period_start,current_period_end`, [subscriptionRow.id]);
      const activeSubscription = updatedSubscription.rows[0];
      if (activeSubscription) {
        await pool.query(`UPDATE accounts SET plan_key=$1,subscription_status='active',current_period_end=$2,updated_at=NOW() WHERE id=$3`, [activeSubscription.plan_key, activeSubscription.current_period_end || null, subscriptionRow.account_id]);
      }
    } else if (eventType === 'PAYMENT_OVERDUE') {
      await pool.query(`UPDATE subscriptions SET status='past_due',updated_at=NOW() WHERE id=$1 AND status NOT IN ('cancelled','canceled')`, [subscriptionRow.id]);
      await pool.query(`UPDATE accounts SET subscription_status='past_due',updated_at=NOW() WHERE id=$1`, [subscriptionRow.account_id]);
    }
    return res.status(200).json({ received: true, processed: true });
  } catch (error) {
    console.error('Asaas webhook error:', error);
    return res.status(500).json({ error: 'Erro ao processar webhook Asaas.' });
  }
});

export default router;
