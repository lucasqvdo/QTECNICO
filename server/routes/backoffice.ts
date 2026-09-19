import { Router } from 'express';
import { pool } from '../db.js';
import { requireBackofficeAuth } from '../backofficeAuth.js';
import { getAsaasStatus } from '../services/asaas.js';

const router = Router();
const allowedActions = new Set(['change_plan','activate','suspend','cancel','reactivate','extend_period','manual_payment']);

async function getAccount(accountId:number) {
  const result = await pool.query(`SELECT a.id,COALESCE(cp.trade_name,cp.legal_name,'Sem empresa') AS company,cp.legal_name,COALESCE(cp.document,'') AS document,COALESCE(cp.phone,'') AS phone,COALESCE(cp.email,u.email,'') AS billing_email,COALESCE(u.name,'') AS owner,COALESCE(u.email,'') AS email,a.plan_key AS legacy_plan,a.subscription_status AS legacy_status,a.current_period_end AS legacy_period_end,a.created_at,s.id AS subscription_id,s.plan_key AS subscription_plan,s.status AS subscription_status,s.amount AS subscription_amount,s.currency AS subscription_currency,s.billing_interval,s.trial_start_at,s.trial_end_at,s.current_period_start,s.current_period_end AS subscription_period_end,s.canceled_at,s.provider AS subscription_provider,s.provider_subscription_id,s.metadata AS subscription_metadata,sp.name AS plan_name FROM accounts a LEFT JOIN company_profiles cp ON cp.account_id=a.id LEFT JOIN users u ON u.id=a.owner_user_id LEFT JOIN LATERAL (SELECT * FROM subscriptions sx WHERE sx.account_id=a.id ORDER BY sx.created_at DESC LIMIT 1) s ON TRUE LEFT JOIN saas_plans sp ON sp.plan_key=COALESCE(s.plan_key,a.plan_key) WHERE a.id=$1`,[accountId]);
  return result.rows[0]||null;
}

router.get('/asaas-status',requireBackofficeAuth,async(_req,res)=>{
  try {
    res.json(await getAsaasStatus());
  } catch(error) {
    console.error('Asaas status error:',error);
    res.status(502).json({error:error instanceof Error?error.message:'Não foi possível autenticar no Asaas Sandbox'});
  }
});

router.get('/account/:id',requireBackofficeAuth,async(req,res)=>{
  const accountId=Number(req.params.id); if(!Number.isInteger(accountId)||accountId<=0) return res.status(400).json({error:'Conta inválida.'});
  try{
    const account=await getAccount(accountId); if(!account) return res.status(404).json({error:'Conta não encontrada.'});
    const [payments,events,plans]=await Promise.all([
      pool.query(`SELECT p.id,p.amount,p.status,p.due_at,p.paid_at,p.refunded_at,p.provider,p.provider_payment_id,p.invoice_url,p.failure_reason,p.metadata,p.created_at,s.plan_key FROM subscription_payments p JOIN subscriptions s ON s.id=p.subscription_id WHERE p.account_id=$1 ORDER BY COALESCE(p.paid_at,p.due_at,p.created_at) DESC LIMIT 200`,[accountId]),
      pool.query(`SELECT e.id,e.event_type,e.source,e.payload,e.created_at,COALESCE(u.name,u.email) AS actor_name FROM subscription_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.account_id=$1 ORDER BY e.created_at DESC LIMIT 100`,[accountId]),
      pool.query(`SELECT plan_key AS key,name,amount,billing_interval,active FROM saas_plans ORDER BY amount,id`)
    ]);
    const subscriptionMetadata=account.subscription_metadata&&typeof account.subscription_metadata==='object'?account.subscription_metadata:{};
    res.json({account:{id:account.id,company:account.company,legalName:account.legal_name,document:account.document,phone:account.phone,billingEmail:account.billing_email,owner:account.owner,email:account.email,createdAt:account.created_at,legacyPlan:account.legacy_plan,legacyStatus:account.legacy_status,subscription:account.subscription_id?{id:account.subscription_id,planKey:account.subscription_plan,status:account.subscription_status,amount:Number(account.subscription_amount||0),currency:account.subscription_currency,billingInterval:account.billing_interval,trialStartAt:account.trial_start_at,trialEndAt:account.trial_end_at,currentPeriodStart:account.current_period_start,currentPeriodEnd:account.subscription_period_end,canceledAt:account.canceled_at,planName:account.plan_name,provider:account.subscription_provider,providerSubscriptionId:account.provider_subscription_id,metadata:subscriptionMetadata}:null},payments:payments.rows.map(p=>({id:p.id,amount:Number(p.amount||0),status:p.status,dueAt:p.due_at,paidAt:p.paid_at,refundedAt:p.refunded_at,provider:p.provider,providerPaymentId:p.provider_payment_id,invoiceUrl:p.invoice_url,failureReason:p.failure_reason,metadata:p.metadata||{},plan:p.plan_key,createdAt:p.created_at})),events:events.rows.map(e=>({id:e.id,eventType:e.event_type,source:e.source,actorName:e.actor_name,createdAt:e.created_at,payload:e.payload})),plans:plans.rows.map(p=>({key:p.key,name:p.name,amount:Number(p.amount||0),billingInterval:p.billing_interval,active:p.active}))});
  }catch(error){console.error('Backoffice account detail error:',error);res.status(500).json({error:'Não foi possível carregar a conta'});}
});

router.post('/account/:id/action',requireBackofficeAuth,async(req,res)=>{
  const accountId=Number(req.params.id); const action=String(req.body?.action||''); if(!Number.isInteger(accountId)||accountId<=0) return res.status(400).json({error:'Conta inválida.'}); if(!allowedActions.has(action)) return res.status(400).json({error:'Ação inválida.'});
  const actor=Number(req.userId); const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const accountResult=await client.query(`SELECT a.*,s.id AS subscription_id,s.plan_key AS subscription_plan,s.status AS subscription_status,s.amount AS subscription_amount,s.billing_interval,s.currency AS subscription_currency,s.current_period_start,s.current_period_end FROM accounts a LEFT JOIN LATERAL (SELECT * FROM subscriptions sx WHERE sx.account_id=a.id ORDER BY sx.created_at DESC LIMIT 1) s ON TRUE WHERE a.id=$1 FOR UPDATE`,[accountId]);
    const before=accountResult.rows[0]; if(!before) throw new Error('Conta não encontrada.');
    let subscriptionId=before.subscription_id;
    if(!subscriptionId){
      const plan=(await client.query('SELECT plan_key,amount,currency,billing_interval FROM saas_plans WHERE plan_key=$1 AND active=TRUE LIMIT 1',[before.plan_key||'free'])).rows[0]; if(!plan) throw new Error('Plano atual não encontrado.');
      const now=new Date(); const end=new Date(now); end.setMonth(end.getMonth()+1);
      const s=await client.query(`INSERT INTO subscriptions (account_id,plan_key,status,billing_interval,amount,currency,current_period_start,current_period_end,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[accountId,plan.plan_key,before.subscription_status||'active',plan.billing_interval,plan.amount,plan.currency,now,end,JSON.stringify({createdFrom:'backoffice',actorUserId:actor})]); subscriptionId=s.rows[0].id;
    }
    if(action==='change_plan'){
      const planKey=String(req.body?.planKey||''); const plan=(await client.query('SELECT plan_key,amount,currency,billing_interval FROM saas_plans WHERE plan_key=$1 AND active=TRUE LIMIT 1',[planKey])).rows[0]; if(!plan) throw new Error('Plano selecionado não existe ou está inativo.');
      await client.query(`UPDATE subscriptions SET plan_key=$1,amount=$2,currency=$3,billing_interval=$4,updated_at=NOW() WHERE id=$5`,[plan.plan_key,plan.amount,plan.currency,plan.billing_interval,subscriptionId]);
      await client.query(`UPDATE accounts SET plan_key=$1,current_period_end=(SELECT current_period_end FROM subscriptions WHERE id=$2) WHERE id=$3`,[plan.plan_key,subscriptionId,accountId]);
    } else if(action==='activate'||action==='reactivate'){
      await client.query(`UPDATE subscriptions SET status='active',canceled_at=NULL,updated_at=NOW() WHERE id=$1`,[subscriptionId]); await client.query(`UPDATE accounts SET subscription_status='active',plan_key=(SELECT plan_key FROM subscriptions WHERE id=$1),current_period_end=(SELECT current_period_end FROM subscriptions WHERE id=$1) WHERE id=$2`,[subscriptionId,accountId]);
    } else if(action==='suspend'){
      await client.query(`UPDATE subscriptions SET status='paused',updated_at=NOW() WHERE id=$1`,[subscriptionId]); await client.query(`UPDATE accounts SET subscription_status='paused' WHERE id=$1`,[accountId]);
    } else if(action==='cancel'){
      await client.query(`UPDATE subscriptions SET status='canceled',canceled_at=NOW(),updated_at=NOW() WHERE id=$1`,[subscriptionId]); await client.query(`UPDATE accounts SET subscription_status='cancelled' WHERE id=$1`,[accountId]);
    } else if(action==='extend_period'){
      const periodEnd=new Date(String(req.body?.periodEnd||'')); if(Number.isNaN(periodEnd.getTime())) throw new Error('Data de período inválida.'); await client.query(`UPDATE subscriptions SET current_period_end=$1,updated_at=NOW() WHERE id=$2`,[periodEnd,subscriptionId]); await client.query(`UPDATE accounts SET current_period_end=$1 WHERE id=$2`,[periodEnd,accountId]);
    } else if(action==='manual_payment'){
      const amount=Number(req.body?.amount); if(!Number.isFinite(amount)||amount<0) throw new Error('Valor de pagamento inválido.'); const paidAt=req.body?.paidAt?new Date(String(req.body.paidAt)):new Date(); if(Number.isNaN(paidAt.getTime())) throw new Error('Data de pagamento inválida.');
      await client.query(`INSERT INTO subscription_payments (subscription_id,account_id,amount,currency,status,paid_at,provider,metadata) VALUES ($1,$2,$3,$4,'paid',$5,'manual',$6)`,[subscriptionId,accountId,amount,before.subscription_currency||'BRL',paidAt,JSON.stringify({actorUserId:actor,source:'backoffice'})]);
      await client.query(`UPDATE subscriptions SET status='active',updated_at=NOW() WHERE id=$1`,[subscriptionId]); await client.query(`UPDATE accounts SET subscription_status='active' WHERE id=$1`,[accountId]);
    }
    const after=await client.query(`SELECT plan_key,subscription_status,current_period_end FROM accounts WHERE id=$1`,[accountId]);
    await client.query(`INSERT INTO subscription_events (account_id,subscription_id,event_type,actor_user_id,source,payload) VALUES ($1,$2,$3,$4,'backoffice',$5)`,[accountId,subscriptionId,`backoffice_${action}`,actor,JSON.stringify({before:{planKey:before.plan_key,status:before.subscription_status,periodEnd:before.current_period_end},after:after.rows[0]||null,request:req.body||{}})]);
    await client.query('COMMIT'); res.json({success:true});
  }catch(error){await client.query('ROLLBACK'); console.error('Backoffice account action error:',error);res.status(400).json({error:error instanceof Error?error.message:'Não foi possível executar a ação'});}finally{client.release();}
});

export default router;
