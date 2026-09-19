import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { requireAdmin } from '../auth.js';
import { createBackofficeSession, requireBackofficeAuth, revokeBackofficeSession, isPlatformAdmin } from '../backofficeAuth.js';

const router = Router();

function getStartDate(days: unknown) {
  const value = String(days ?? 'all');
  if (!['7', '30', '90', 'all'].includes(value)) return null;
  if (value === 'all') return null;
  const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - Number(value)); return date.toISOString();
}

router.post('/backoffice-login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) return res.status(400).json({ error: 'Informe e-mail e senha.' });
  try {
    const result = await pool.query('SELECT id, name, email, password_hash, is_admin FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
    const user = result.rows[0];
    if (!user || !user.is_admin || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Credenciais de Backoffice inválidas.' });
    if (!(await isPlatformAdmin(user.id))) return res.status(403).json({ error: 'Este usuário não possui acesso ao Backoffice QTECNICO.' });
    await createBackofficeSession(user.id, res);
    return res.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) { console.error('Backoffice login error:', error); return res.status(500).json({ error: 'Erro interno ao autenticar o Backoffice.' }); }
});

router.post('/backoffice-logout', requireBackofficeAuth, async (req, res) => {
  try { await revokeBackofficeSession(req, res); return res.json({ success: true }); }
  catch (error) { console.error('Backoffice logout error:', error); return res.json({ success: true }); }
});

router.get('/summary', requireAdmin, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT account_id FROM users WHERE id = $1 AND is_admin = TRUE', [req.userId]);
    const accountId = userResult.rows[0]?.account_id;
    if (!accountId) return res.status(403).json({ error: 'Acesso administrativo não autorizado' });
    const startDate = getStartDate(req.query.days);
    const dateParams = startDate ? [accountId, startDate] : [accountId];
    const dateClause = startDate ? 'AND o.created_at >= $2' : '';
    const clientDateClause = startDate ? 'AND c.created_at >= $2' : '';
    const [stats, monthly, technicians, clients, recent] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE o.status='pending')::int AS pending, COUNT(*) FILTER (WHERE o.status='in_progress')::int AS in_progress, COUNT(*) FILTER (WHERE o.status='completed')::int AS completed, COUNT(*) FILTER (WHERE o.status='cancelled')::int AS cancelled, COALESCE(SUM(o.client_value),0)::numeric AS revenue, COALESCE((SELECT SUM(p.amount) FROM order_payments p WHERE p.account_id=$1 AND p.status='paid' ${startDate ? 'AND p.date >= $2' : ''}),0)::numeric AS paid, COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.account_id=$1 ${startDate ? 'AND (e.order_id IS NULL OR EXISTS (SELECT 1 FROM orders eo WHERE eo.id=e.order_id AND eo.created_at >= $2 AND eo.account_id=$1))' : ''}),0)::numeric AS costs FROM orders o WHERE o.account_id=$1 ${dateClause}`, dateParams),
      pool.query(`SELECT to_char(date_trunc('month',o.date),'YYYY-MM') AS month, COALESCE(SUM(o.client_value),0)::numeric AS revenue, COUNT(*)::int AS orders FROM orders o WHERE o.account_id=$1 ${dateClause} GROUP BY 1 ORDER BY 1 DESC LIMIT 12`, dateParams),
      pool.query(`SELECT u.id,u.name,COUNT(o.id)::int AS orders,COUNT(o.id) FILTER (WHERE o.status='completed')::int AS completed,COALESCE(SUM(o.client_value),0)::numeric AS revenue FROM users u LEFT JOIN orders o ON o.assigned_technician_id=u.id AND o.account_id=$1 ${dateClause} WHERE u.account_id=$1 AND u.is_admin=FALSE GROUP BY u.id,u.name ORDER BY completed DESC,orders DESC,u.name ASC LIMIT 10`, dateParams),
      pool.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER (WHERE c.created_at >= date_trunc('month',CURRENT_DATE))::int AS new_this_month FROM clients c WHERE c.account_id=$1 ${clientDateClause}`, dateParams),
      pool.query(`SELECT o.id,o.client_name AS client,o.type,o.status,o.date,o.client_value::numeric AS value,o.assigned_technician_name AS technician FROM orders o WHERE o.account_id=$1 ${dateClause} ORDER BY o.created_at DESC LIMIT 8`, dateParams),
    ]);
    const row = stats.rows[0] || {}; const revenue=Number(row.revenue||0); const costs=Number(row.costs||0);
    res.json({ period:startDate?String(req.query.days):'all', stats:{ total:Number(row.total||0), pending:Number(row.pending||0), inProgress:Number(row.in_progress||0), completed:Number(row.completed||0), cancelled:Number(row.cancelled||0), revenue, paid:Number(row.paid||0), costs, margin:revenue-costs, clients:Number(clients.rows[0]?.total||0), newClients:Number(clients.rows[0]?.new_this_month||0) }, monthly:monthly.rows.reverse().map((x)=>({month:x.month,revenue:Number(x.revenue||0),orders:Number(x.orders||0)})), technicians:technicians.rows.map((x)=>({id:x.id,name:x.name,orders:Number(x.orders||0),completed:Number(x.completed||0),revenue:Number(x.revenue||0)})), recent:recent.rows.map((x)=>({id:x.id,client:x.client,type:x.type,status:x.status,date:x.date,value:Number(x.value||0),technician:x.technician||null})) });
  } catch (error) { console.error('Dashboard summary error:',error); res.status(500).json({error:'Erro ao carregar indicadores administrativos'}); }
});

router.get('/backoffice-summary', requireBackofficeAuth, async (_req,res)=>{
  try {
    const [accounts, plans, billing] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE subscription_status='active')::int AS active, COUNT(*) FILTER (WHERE subscription_status IN ('trial','trialing'))::int AS trials, COUNT(*) FILTER (WHERE subscription_status IN ('past_due','overdue','unpaid'))::int AS overdue, COUNT(*) FILTER (WHERE subscription_status IN ('cancelled','canceled'))::int AS cancelled FROM accounts`),
      pool.query(`SELECT plan_key,COUNT(*)::int AS count FROM accounts GROUP BY plan_key ORDER BY count DESC`),
      pool.query(`SELECT COALESCE((SELECT SUM(amount) FROM subscriptions WHERE status='active'),0)::numeric AS mrr, COALESCE((SELECT SUM(amount) FROM subscription_payments WHERE status='paid' AND paid_at >= date_trunc('month',CURRENT_DATE)),0)::numeric AS received_this_month, COALESCE((SELECT SUM(amount) FROM subscription_payments WHERE status IN ('pending','open') AND (due_at IS NULL OR due_at >= CURRENT_DATE)),0)::numeric AS receivable`),
    ]);
    const row = billing.rows[0] || {};
    res.json({metrics:{total:Number(accounts.rows[0]?.total||0),active:Number(accounts.rows[0]?.active||0),trials:Number(accounts.rows[0]?.trials||0),overdue:Number(accounts.rows[0]?.overdue||0),cancelled:Number(accounts.rows[0]?.cancelled||0),mrr:Number(row.mrr||0),receivedThisMonth:Number(row.received_this_month||0),receivable:Number(row.receivable||0)},plans:plans.rows});
  } catch(error){console.error('Backoffice summary error:',error);res.status(500).json({error:'Não foi possível carregar o Backoffice'});}
});

router.get('/backoffice-accounts', requireBackofficeAuth, async (_req,res)=>{
  try {
    const result=await pool.query(`SELECT a.id,COALESCE(cp.trade_name,cp.legal_name,'Sem empresa') AS company,COALESCE(cp.document,'') AS document,COALESCE(u.name,'') AS owner,COALESCE(u.email,'') AS email,a.plan_key AS legacy_plan,a.subscription_status AS legacy_status,a.current_period_end AS legacy_period_end,a.created_at,s.id AS subscription_id,s.plan_key AS subscription_plan,s.status AS subscription_status,s.amount AS subscription_amount,s.current_period_end AS subscription_period_end,s.trial_end_at,sp.name AS plan_name,sp.amount AS plan_catalog_amount FROM accounts a LEFT JOIN company_profiles cp ON cp.account_id=a.id LEFT JOIN users u ON u.id=a.owner_user_id LEFT JOIN LATERAL (SELECT * FROM subscriptions sx WHERE sx.account_id=a.id ORDER BY sx.created_at DESC LIMIT 1) s ON TRUE LEFT JOIN saas_plans sp ON sp.plan_key=COALESCE(s.plan_key,a.plan_key) ORDER BY a.created_at DESC`);
    res.json({accounts:result.rows.map((r)=>({id:r.id,company:r.company,document:r.document,owner:r.owner,email:r.email,plan:r.subscription_plan||r.legacy_plan,status:r.subscription_status||r.legacy_status,periodEnd:r.subscription_period_end||r.legacy_period_end,trialEnd:r.trial_end_at,subscriptionId:r.subscription_id,amount:r.subscription_amount!=null?Number(r.subscription_amount):Number(r.plan_catalog_amount||0),planName:r.plan_name||r.legacy_plan,createdAt:r.created_at}))});
  } catch(error){console.error('Backoffice accounts error:',error);res.status(500).json({error:'Não foi possível carregar as contas'});}
});

router.get('/backoffice-payments', requireBackofficeAuth, async (_req,res)=>{
  try {
    const result=await pool.query(`SELECT p.id,p.account_id,COALESCE(cp.trade_name,cp.legal_name,'Sem empresa') AS company,p.amount,p.currency,p.status,p.due_at,p.paid_at,p.refunded_at,p.provider,p.provider_payment_id,p.invoice_url,p.failure_reason,p.created_at,s.plan_key FROM subscription_payments p JOIN subscriptions s ON s.id=p.subscription_id LEFT JOIN company_profiles cp ON cp.account_id=p.account_id ORDER BY COALESCE(p.paid_at,p.due_at,p.created_at) DESC LIMIT 200`);
    res.json({payments:result.rows.map((r)=>({id:r.id,accountId:r.account_id,company:r.company,amount:Number(r.amount||0),currency:r.currency,status:r.status,dueAt:r.due_at,paidAt:r.paid_at,refundedAt:r.refunded_at,provider:r.provider,providerPaymentId:r.provider_payment_id,invoiceUrl:r.invoice_url,failureReason:r.failure_reason,plan:r.plan_key,createdAt:r.created_at}))});
  } catch(error){console.error('Backoffice payments error:',error);res.status(500).json({error:'Não foi possível carregar os pagamentos SaaS'});}
});

router.get('/backoffice-plans', requireBackofficeAuth, async (_req,res)=>{
  try {
    const result=await pool.query(`SELECT id,plan_key,name,description,amount,currency,billing_interval,active,features,limits,created_at,updated_at FROM saas_plans ORDER BY amount ASC,id ASC`);
    res.json({plans:result.rows.map((r)=>({id:r.id,key:r.plan_key,name:r.name,description:r.description,amount:Number(r.amount||0),currency:r.currency,billingInterval:r.billing_interval,active:r.active,features:r.features,limits:r.limits,createdAt:r.created_at,updatedAt:r.updated_at}))});
  } catch(error){console.error('Backoffice plans error:',error);res.status(500).json({error:'Não foi possível carregar os planos SaaS'});}
});

export default router;
