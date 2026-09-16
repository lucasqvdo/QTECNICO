import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.post('/asaas', async (req,res) => {
  const expectedToken=String(process.env.ASAAS_WEBHOOK_TOKEN||'').trim();
  const receivedToken=String(req.header('asaas-access-token')||'').trim();
  if(!expectedToken) return res.status(503).json({error:'ASAAS_WEBHOOK_TOKEN não configurado.'});
  if(!receivedToken||receivedToken!==expectedToken) return res.status(401).json({error:'Webhook não autorizado.'});

  const eventId=typeof req.body?.id==='string'?req.body.id.trim():'';
  const eventType=typeof req.body?.event==='string'?req.body.event.trim():'UNKNOWN';
  const payment=req.body?.payment||null;
  const subscription=req.body?.subscription||null;
  if(!eventId)return res.status(400).json({error:'Evento Asaas sem id.'});

  try{
    const duplicate=await pool.query(`SELECT 1 FROM subscription_events WHERE payload->>'asaasEventId'=$1 LIMIT 1`,[eventId]);
    if(duplicate.rows[0])return res.status(200).json({received:true,duplicate:true});

    const providerPaymentId=typeof payment?.id==='string'?payment.id:null;
    const providerSubscriptionId=typeof payment?.subscription==='string'?payment.subscription:(typeof subscription?.id==='string'?subscription.id:null);
    let subscriptionRow:any=null;
    if(providerSubscriptionId){
      const result=await pool.query(`SELECT id,account_id,status FROM subscriptions WHERE provider='asaas' AND provider_subscription_id=$1 LIMIT 1`,[providerSubscriptionId]);
      subscriptionRow=result.rows[0]||null;
    }
    if(!subscriptionRow&&providerPaymentId){
      const result=await pool.query(`SELECT s.id,s.account_id,s.status FROM subscription_payments p JOIN subscriptions s ON s.id=p.subscription_id WHERE p.provider='asaas' AND p.provider_payment_id=$1 LIMIT 1`,[providerPaymentId]);
      subscriptionRow=result.rows[0]||null;
    }

    if(subscriptionRow&&providerPaymentId){
      await pool.query(`INSERT INTO subscription_payments (subscription_id,account_id,amount,currency,status,due_at,paid_at,refunded_at,provider,provider_payment_id,invoice_url,failure_reason,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'asaas',$9,$10,$11,$12::jsonb) ON CONFLICT (provider_payment_id) DO UPDATE SET amount=EXCLUDED.amount,status=EXCLUDED.status,due_at=EXCLUDED.due_at,paid_at=EXCLUDED.paid_at,refunded_at=EXCLUDED.refunded_at,invoice_url=EXCLUDED.invoice_url,failure_reason=EXCLUDED.failure_reason,metadata=EXCLUDED.metadata,updated_at=NOW()`,[subscriptionRow.id,subscriptionRow.account_id,Number(payment?.value||0),payment?.currency||'BRL',payment?.status||eventType,payment?.dueDate||null,payment?.paymentDate||payment?.confirmedDate||null,payment?.refundDate||null,providerPaymentId,payment?.invoiceUrl||null,payment?.failureReason||null,JSON.stringify({asaasEventId:eventId,event:eventType,billingType:payment?.billingType||null,customer:payment?.customer||null,subscription:providerSubscriptionId})]);

      if(eventType==='PAYMENT_RECEIVED'||eventType==='PAYMENT_CONFIRMED'){
        await pool.query(`UPDATE subscriptions SET status='active',updated_at=NOW() WHERE id=$1`,[subscriptionRow.id]);
      }else if(eventType==='PAYMENT_OVERDUE'){
        await pool.query(`UPDATE subscriptions SET status='past_due',updated_at=NOW() WHERE id=$1 AND status NOT IN ('cancelled','canceled')`,[subscriptionRow.id]);
      }
    }

    if(subscriptionRow){
      await pool.query(`INSERT INTO subscription_events (account_id,subscription_id,actor_user_id,event_type,source,payload) VALUES ($1,$2,NULL,$3,'asaas_webhook',$4::jsonb)`,[subscriptionRow.account_id,subscriptionRow.id,eventType,JSON.stringify({asaasEventId:eventId,event:eventType,payment:payment||null,subscription:subscription||null})]);
    }

    return res.status(200).json({received:true,processed:Boolean(subscriptionRow)});
  }catch(error){
    console.error('Asaas webhook error:',error);
    return res.status(500).json({error:'Erro ao processar webhook Asaas.'});
  }
});

export default router;
