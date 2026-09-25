import { randomUUID } from 'crypto';
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { pool } from '../db.js';
import { getAccountContext } from '../planLimits.js';

const router=Router(); router.use(requireAuth);
async function aid(userId:number){return (await getAccountContext(userId))?.accountId??null}
const map=(r:any)=>({id:Number(r.id),description:r.description,category:r.category,supplier:r.supplier||'',amount:Number(r.amount),dueDate:r.due_date,status:r.status,paidAt:r.paid_at,recurrence:r.recurrence,notes:r.notes||'',installmentGroupId:r.installment_group_id||null,installmentNumber:Number(r.installment_number||1),installmentCount:Number(r.installment_count||1),createdAt:r.created_at,updatedAt:r.updated_at});
const addMonths=(date:string,months:number)=>{const [y,m,d]=date.slice(0,10).split('-').map(Number);const target=new Date(Date.UTC(y,m-1+months,1));const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();target.setUTCDate(Math.min(d,last));return target.toISOString().slice(0,10)};

router.get('/',async(req,res)=>{const a=await aid(req.userId);if(!a)return res.status(404).json({error:'Conta não encontrada'});const q=await pool.query('SELECT * FROM company_expenses WHERE account_id=$1 ORDER BY due_date DESC,id DESC',[a]);res.json(q.rows.map(map))});

router.post('/',async(req,res)=>{
  const a=await aid(req.userId);if(!a)return res.status(404).json({error:'Conta não encontrada'});
  const{description,category='Outros',supplier='',amount,dueDate,status='pending',paidAt=null,recurrence='once',notes='',installmentCount=1}=req.body||{};
  const count=Math.floor(Number(installmentCount)||1);
  if(!String(description||'').trim()||!(Number(amount)>0)||!dueDate)return res.status(400).json({error:'Informe descrição, valor e vencimento.'});
  if(count<1||count>120)return res.status(400).json({error:'A quantidade de parcelas deve estar entre 1 e 120.'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const groupId=count>1?randomUUID():null;
    const totalCents=Math.round(Number(amount)*100);
    const baseCents=Math.floor(totalCents/count);
    const remainder=totalCents-(baseCents*count);
    const created:any[]=[];
    for(let i=1;i<=count;i++){
      const installmentCents=baseCents+(i<=remainder?1:0);
      const installmentAmount=installmentCents/100;
      const installmentDue=addMonths(String(dueDate),i-1);
      const installmentDescription=count>1?`${String(description).trim()} (${i}/${count})`:String(description).trim();
      const q=await client.query('INSERT INTO company_expenses(account_id,description,category,supplier,amount,due_date,status,paid_at,recurrence,notes,installment_group_id,installment_number,installment_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',[a,installmentDescription,String(category),String(supplier).trim(),installmentAmount,installmentDue,status,status==='paid'?(paidAt||installmentDue):null,count>1?'once':recurrence,String(notes).trim(),groupId,i,count]);
      created.push(map(q.rows[0]));
    }
    await client.query('COMMIT');
    res.status(201).json(created);
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
});

router.put('/:id',async(req,res)=>{const a=await aid(req.userId);if(!a)return res.status(404).json({error:'Conta não encontrada'});const{description,category='Outros',supplier='',amount,dueDate,status='pending',paidAt=null,recurrence='once',notes=''}=req.body||{};if(!String(description||'').trim()||!(Number(amount)>0)||!dueDate)return res.status(400).json({error:'Informe descrição, valor e vencimento.'});const q=await pool.query('UPDATE company_expenses SET description=$1,category=$2,supplier=$3,amount=$4,due_date=$5,status=$6,paid_at=$7,recurrence=$8,notes=$9,updated_at=NOW() WHERE id=$10 AND account_id=$11 RETURNING *',[String(description).trim(),String(category),String(supplier).trim(),Number(amount),dueDate,status,status==='paid'?(paidAt||dueDate):null,recurrence,String(notes).trim(),req.params.id,a]);if(!q.rows.length)return res.status(404).json({error:'Despesa não encontrada'});res.json(map(q.rows[0]))});
router.delete('/:id',async(req,res)=>{const a=await aid(req.userId);if(!a)return res.status(404).json({error:'Conta não encontrada'});const q=await pool.query('DELETE FROM company_expenses WHERE id=$1 AND account_id=$2 RETURNING id',[req.params.id,a]);if(!q.rows.length)return res.status(404).json({error:'Despesa não encontrada'});res.json({success:true})});
export default router;
