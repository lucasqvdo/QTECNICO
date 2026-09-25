import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { pool } from '../server/db.js';
import { createSession } from '../server/auth.js';
import { CREDIT_CARDS_SCHEMA_SQL, invoiceDates, itemInput } from '../server/creditCards.js';
import { TRIAL_SCHEMA_SQL } from '../server/trial.js';
import cardsRouter from '../server/routes/creditCards.js';
import expensesRouter from '../server/routes/companyExpenses.js';

test('invoice dates and precise input validation', () => {
  assert.deepEqual(invoiceDates('2026-09',20,27), { competence:'2026-09-01',closingDate:'2026-09-20',dueDate:'2026-09-27' });
  assert.equal(invoiceDates('2026-01',25,5).closingDate,'2025-12-25');
  assert.equal(invoiceDates('2028-02',20,31).dueDate,'2028-02-29');
  assert.equal(invoiceDates('2026-02',30,31).closingDate,'2026-01-30');
  for (const month of ['2026-13','2026-00','x','2026-2']) assert.throws(()=>invoiceDates(month,20,27));
  for (const amount of [0,-1,NaN,Infinity,1.001,1.00001,'1',1e12]) assert.throws(()=>itemInput({description:'Test',category:'Outros',purchaseDate:'2026-09-25',amount}));
  assert.throws(()=>itemInput({description:'Test',category:'Outros',purchaseDate:'2026-02-30',amount:1}));
});

test('PostgreSQL: cards, monthly invoices, single payable, isolation and existing finance', async t => {
  const db = new PGlite();
  let server: ReturnType<ReturnType<typeof express>['listen']> | undefined;
  try {
    await db.exec(`
      CREATE TABLE accounts(id SERIAL PRIMARY KEY,plan_key TEXT);
      CREATE TABLE users(id SERIAL PRIMARY KEY,account_id INTEGER);
      CREATE TABLE auth_sessions(user_id INTEGER,token_hash TEXT,expires_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ);
      CREATE TABLE saas_plans(plan_key TEXT PRIMARY KEY,name TEXT,features JSONB,limits JSONB);
      INSERT INTO accounts(plan_key) VALUES('business'),('business');
      INSERT INTO users(account_id) VALUES(1),(2),(1);
      INSERT INTO saas_plans VALUES('business','Business','[]','{"maxUsers":30,"ordersPerMonth":null}');
    `);
    // Run the legacy expense DDL from startup, not a simplified substitute.
    const startup = readFileSync(new URL('../server/index.ts',import.meta.url),'utf8');
    const ddl = startup.match(/CREATE TABLE IF NOT EXISTS company_expenses \([\s\S]*?\n      \)/)![0];
    await db.exec(ddl);
    for (const match of startup.matchAll(/await pool.query\(`(ALTER TABLE company_expenses[^`]+)`\)/g)) await db.exec(match[1]);
    await db.exec(TRIAL_SCHEMA_SQL);
    await db.exec("INSERT INTO company_expenses(account_id,description,amount,due_date) VALUES(1,'Legacy expense',55,'2026-09-27')");
    const before = (await db.query('SELECT * FROM company_expenses')).rows;
    await db.exec(CREDIT_CARDS_SCHEMA_SQL);
    await db.exec(CREDIT_CARDS_SCHEMA_SQL);
    assert.deepEqual((await db.query('SELECT * FROM company_expenses')).rows.map(({credit_card_invoice_id,...r}:any)=>r),before);
    await assert.rejects(db.query("INSERT INTO company_expenses(account_id,description,amount,due_date) VALUES(1,'Invalid zero',0,'2026-09-27')"));
    const query = async (sql:string,params?:any[]) => { const r=await db.query(sql,params); return {rows:r.rows,rowCount:r.affectedRows??r.rows.length}; };
    mock.method(pool,'query',query);
    mock.method(pool,'connect',async()=>({query,release(){}}));
    const headersFor = async(id:number)=>{
      const cookies:Record<string,string>={};
      await createSession(id,{cookie(name:string,value:string){cookies[name]=value}} as any);
      return {'Content-Type':'application/json',Cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; '),'X-CSRF-Token':cookies.qtecnico_csrf};
    };
    const owner=await headersFor(1), other=await headersFor(2), colleague=await headersFor(3);
    const app=express(); app.use(express.json());app.use('/cards',cardsRouter);app.use('/expenses',expensesRouter);
    app.use((err:any,_req:any,res:any,_next:any)=>res.status(500).json({error:err.message}));
    server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const url=`http://127.0.0.1:${(server.address() as any).port}`;
    const call=async(method:string,path:string,body?:any,headers=owner,expected=200)=>{
      const r=await fetch(url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
      const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return data;
    };
    let card:any,invoice:any,itemId:number;
    const purchase={description:'Combustível',category:'Combustível',purchaseDate:'2026-09-10',amount:10.10};
    await t.test('auth, CSRF, card validation and tenant-derived ownership',async()=>{
      await call('GET','/cards',undefined,{} as any,401);
      await call('POST','/cards',{}, {'Content-Type':'application/json',Cookie:owner.Cookie} as any,403);
      await call('POST','/cards',{name:'Inter',lastFour:'123456781234',closingDay:20,dueDay:27},owner,400);
      await call('POST','/cards',{name:'Inter',lastFour:'1234',closingDay:32,dueDay:27},owner,400);
      card=await call('POST','/cards',{name:'Inter',lastFour:'0034',closingDay:20,dueDay:27,account_id:2},owner,201);
      assert.equal(card.lastFour,'0034');assert.equal((await call('GET','/cards')).length,1);
      assert.equal((await call('GET','/cards',undefined,colleague)).length,1);
      assert.deepEqual(await call('GET','/cards',undefined,other),[]);
      await call('PUT',`/cards/${card.id}`,{name:'Hacked',lastFour:'1234',closingDay:20,dueDay:27},other,404);
    });
    await t.test('monthly creation is idempotent and creates exactly one zero payable',async()=>{
      invoice=await call('POST',`/cards/${card.id}/invoices`,{competence:'2026-09',amount:999,accountId:2},owner,201);
      const repeat=await call('POST',`/cards/${card.id}/invoices`,{competence:'2026-09'},owner,201);
      assert.equal(invoice.id,repeat.id);assert.equal(invoice.amount,0);assert.deepEqual(invoice.items,[]);
      assert.equal((await call('GET','/expenses')).length,2);
      assert.equal((await call('GET',`/cards/${card.id}/invoices`)).length,1);
      await call('POST',`/cards/${card.id}/invoices`,{competence:'2026-10'},other,404);
      await call('GET',`/cards/invoices/${invoice.id}`,undefined,other,404);
      await call('GET',`/cards/${card.id}/invoices`,undefined,other,404);
      await call('PATCH',`/cards/invoices/${invoice.id}/payment`,{status:'paid',paidAt:'2026-09-27'},owner,400);
    });
    await t.test('manual items recalculate the one payable precisely without duplicate costs',async()=>{
      invoice=await call('POST',`/cards/invoices/${invoice.id}/items`,{...purchase,source:'pdf',account_id:2},owner,201);
      itemId=invoice.items[0].id;assert.equal(invoice.items[0].source,'manual');
      invoice=await call('POST',`/cards/invoices/${invoice.id}/items`,{...purchase,amount:20.20},owner,201);
      assert.equal(invoice.amount,30.30);
      const expenses=await call('GET','/expenses');assert.equal(expenses.length,2);
      assert.equal(expenses.reduce((s:number,e:any)=>s+e.amount,0),85.30);
      assert.equal(expenses.find((e:any)=>e.creditCardInvoiceId===invoice.id).amount,30.30);
      invoice=await call('PUT',`/cards/invoices/${invoice.id}/items/${itemId}`,{...purchase,amount:15.25,category:'Ferramentas'});
      assert.equal(invoice.amount,35.45);assert.equal(invoice.items[0].category,'Ferramentas');
      for (const method of ['POST','PUT','DELETE']) await call(method,`/cards/invoices/${invoice.id}/items${method==='POST'?'':`/${itemId}`}`,method==='DELETE'?undefined:purchase,other,404);
      await call('PATCH',`/cards/invoices/${invoice.id}/payment`,{status:'pending'},other,404);
      const next=await call('POST',`/cards/${card.id}/invoices`,{competence:'2026-10'},owner,201);
      await call('PUT',`/cards/invoices/${next.id}/items/${itemId}`,purchase,owner,404);
      await call('DELETE',`/cards/invoices/${next.id}/items/${itemId}`,undefined,owner,404);
      await call('POST',`/cards/invoices/${invoice.id}/items`,{...purchase,amount:-1},owner,400);
      await call('DELETE',`/cards/invoices/${invoice.id}/items/999999`,undefined,owner,404);
      assert.equal((await call('GET',`/cards/invoices/${invoice.id}`)).amount,35.45);
    });
    await t.test('failed total update rolls back the item insert',async()=>{
      const before=await call('GET',`/cards/invoices/${invoice.id}`);
      await call('POST',`/cards/invoices/${invoice.id}/items`,{...purchase,amount:999999999999.99},owner,400);
      assert.deepEqual(await call('GET',`/cards/invoices/${invoice.id}`),before);
    });
    await t.test('prevent payable edits/deletion, freeze paid invoice and reopen explicitly',async()=>{
      const expense=(await call('GET','/expenses')).find((e:any)=>e.creditCardInvoiceId===invoice.id);
      await call('PUT',`/expenses/${expense.id}`,{...expense,amount:999},owner,409);
      await call('DELETE',`/expenses/${expense.id}`,undefined,owner,409);
      invoice=await call('PATCH',`/cards/invoices/${invoice.id}/payment`,{status:'paid',paidAt:'2026-09-27'});
      assert.equal(invoice.status,'paid');assert.equal(invoice.paidAt,'2026-09-27');
      await call('POST',`/cards/invoices/${invoice.id}/items`,purchase,owner,409);
      await call('PUT',`/cards/invoices/${invoice.id}/items/${itemId}`,purchase,owner,409);
      await call('DELETE',`/cards/invoices/${invoice.id}/items/${itemId}`,undefined,owner,409);
      await call('PATCH',`/cards/invoices/${invoice.id}/payment`,{status:'pending'});
      for(const item of invoice.items) invoice=await call('DELETE',`/cards/invoices/${invoice.id}/items/${item.id}`);
      assert.equal(invoice.amount,0);assert.equal(invoice.items.length,0);assert.equal(invoice.paidAt,null);
    });
    await t.test('existing CRUD/installments and migration after data preserve finance',async()=>{
      const existing=(await call('GET','/expenses')).find((e:any)=>e.description==='Legacy expense');
      const edited=await call('PUT',`/expenses/${existing.id}`,{...existing,amount:75,paymentMethod:'pix'});
      assert.equal(edited.amount,75);assert.equal(edited.paymentMethod,'pix');
      const installments=await call('POST','/expenses',{description:'Equipment',amount:100,dueDate:'2026-01-31',installmentCount:3},owner,201);
      assert.deepEqual(installments.map((e:any)=>e.amount),[33.34,33.33,33.33]);
      for(const expense of installments) await call('DELETE',`/expenses/${expense.id}`);
      const before=await call('GET','/expenses');await db.exec(CREDIT_CARDS_SCHEMA_SQL);assert.deepEqual(await call('GET','/expenses'),before);
      await call('PUT',`/cards/${card.id}`,{name:'New name',lastFour:'0034',closingDay:25,dueDay:5});
      assert.equal((await call('GET',`/cards/invoices/${invoice.id}`)).dueDate,'2026-09-27');
      const future=await call('POST',`/cards/${card.id}/invoices`,{competence:'2027-01'},owner,201);
      assert.equal(future.closingDate,'2026-12-25');assert.equal(future.dueDate,'2027-01-05');
      await assert.rejects(db.query('INSERT INTO credit_card_invoices(account_id,card_id,competence,closing_date,due_date) VALUES(2,$1,\'2026-09-01\',\'2026-09-20\',\'2026-09-27\')',[card.id]));
      await assert.rejects(db.query('INSERT INTO credit_card_invoice_items(account_id,invoice_id,description,category,purchase_date,amount) VALUES(2,$1,\'No\',\'Other\',\'2026-09-01\',1)',[invoice.id]));
    });
  } finally { if(server) await new Promise<void>(resolve=>server!.close(()=>resolve())); mock.restoreAll();await db.close(); }
});
