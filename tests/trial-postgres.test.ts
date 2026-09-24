import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { pool } from '../server/db.js';
import { TRIAL_SCHEMA_SQL, trialInfo, grantRegistrationTrial } from '../server/trial.js';
import { BACKOFFICE_MEMBERS_SCHEMA_SQL } from '../server/backofficeMembers.js';
import { INITIAL_PLAN_CATALOG } from '../server/planCatalog.js';
import { getAccountEntitlements } from '../server/plans.js';
import { createBackofficeSession, isPlatformAdmin } from '../server/backofficeAuth.js';
import { createSession } from '../server/auth.js';
import authRouter from '../server/routes/auth.js';
import backofficeRouter from '../server/routes/backoffice.js';
import dashboardRouter from '../server/routes/dashboard.js';
import usersRouter from '../server/routes/users.js';

test('PostgreSQL: registration, trial lifecycle, billing separation and Backoffice membership', async t => {
  const db = new PGlite();
  let server: ReturnType<ReturnType<typeof express>['listen']> | undefined;
  try {
    await db.exec(`
      CREATE TABLE accounts (id serial PRIMARY KEY, owner_user_id integer, plan_key text, subscription_status text, current_period_end timestamptz, created_at timestamptz DEFAULT NOW());
      CREATE TABLE users (id serial PRIMARY KEY, account_id integer, name text, email text UNIQUE, password_hash text, role text, phone text, photo_url text, is_admin boolean);
      CREATE TABLE auth_sessions (user_id integer, token_hash text, expires_at timestamptz, revoked_at timestamptz);
      CREATE TABLE auth_rate_limits (key text PRIMARY KEY, count integer, reset_at timestamptz, updated_at timestamptz);
      CREATE TABLE saas_plans (plan_key text PRIMARY KEY, name text, amount numeric, currency text, billing_interval text, active boolean, features jsonb, limits jsonb);
      CREATE TABLE subscriptions (id serial PRIMARY KEY, account_id integer, plan_key text, status text, amount numeric);
      CREATE TABLE subscription_payments (amount numeric, status text, paid_at timestamptz, due_at timestamptz);
      CREATE TABLE orders (account_id integer, created_at timestamptz);
      INSERT INTO accounts (plan_key,subscription_status) VALUES ('essential','active'),('pro','active');
      INSERT INTO users (account_id,name,email,is_admin) VALUES (1,'Owner','lucas.qvdo@gmail.com',TRUE),(2,'Tenant admin','tenant@example.test',TRUE),(2,'Collaborator','collaborator@example.test',FALSE);
    `);
    const query = async (sql: string, params?: any[]) => {
      const result = await db.query(sql, params);
      return { rows: result.rows, rowCount: result.affectedRows || result.rows.length };
    };
    mock.method(pool, 'query', query);
    mock.method(pool, 'connect', async () => ({ query, release() {} }));
    for (const [key,name,,amount,features,limits] of INITIAL_PLAN_CATALOG) {
      await db.query(`INSERT INTO saas_plans VALUES ($1,$2,$3,'BRL','month',TRUE,$4,$5)`, [key,name,amount,JSON.stringify(features),JSON.stringify(limits)]);
    }
    await db.exec(TRIAL_SCHEMA_SQL);
    await db.exec(BACKOFFICE_MEMBERS_SCHEMA_SQL);
    const headersFor = async (id: number, backoffice = true) => {
      const cookies: Record<string,string> = {};
      await (backoffice ? createBackofficeSession : createSession)(id, {cookie(name:string,value:string){cookies[name]=value;}} as any);
      return { Cookie: Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; '), 'X-CSRF-Token': cookies[backoffice ? 'qtecnico_backoffice_csrf' : 'qtecnico_csrf'], 'Content-Type':'application/json' };
    };
    const ownerHeaders = await headersFor(1);
    const tenantHeaders = await headersFor(2);
    const collaboratorHeaders = await headersFor(3);
    const app = express(); app.use(express.json());
    app.use('/auth',authRouter); app.use('/backoffice',backofficeRouter); app.use('/dashboard',dashboardRouter); app.use('/users',usersRouter);
    server=app.listen(0,'127.0.0.1'); await once(server,'listening');
    const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
    const post = (path:string,body:unknown,headers:Record<string,string>=ownerHeaders) => fetch(url+path,{method:'POST',headers,body:JSON.stringify(body)});
    const register = async (email:string,document:string) => {
      const result = await post('/auth/register',{email,password:'local-test-password',name:JSON.stringify({adminName:'New owner',company:{tradeName:'Trial company',legalName:'Trial company Ltd',document,email,phone:'11999999999'}})});
      const body=await result.json(); assert.equal(result.status,201,JSON.stringify(body)); return body.user;
    };
    let newUser: any;
    await t.test('idempotent migration preserves existing accounts and only seeds the specified owner', async()=>{
      const before=await db.query('SELECT * FROM accounts ORDER BY id');
      await db.exec(TRIAL_SCHEMA_SQL); await db.exec(BACKOFFICE_MEMBERS_SCHEMA_SQL);
      assert.deepEqual((await db.query('SELECT * FROM accounts ORDER BY id')).rows,before.rows);
      assert.equal((await getAccountEntitlements(1)).planKey,'essential');
      assert.equal((await getAccountEntitlements(2)).planKey,'pro');
      assert.equal((await getAccountEntitlements(1)).trial.status,'not_started');
      assert.equal(await isPlatformAdmin(1),true); assert.equal(await isPlatformAdmin(2),false);
      assert.equal((await db.query('SELECT * FROM backoffice_members')).rows.length,1);
    });
    await t.test('new registration gets exactly 14 days, Business access, no card, subscription or MRR',async()=>{
      newUser=await register('new@example.test','12.345.678/0001-90');
      const access=await getAccountEntitlements(newUser.accountId);
      assert.equal(access.planKey,'business'); assert.equal(access.contractedPlanKey,'essential');
      assert.equal(access.trial.daysRemaining,14); assert.equal(access.limits.maxUsers,30);
      assert.equal(new Date(access.trial.endsAt).getTime()-new Date(access.trial.startedAt).getTime(),14*86400000);
      assert.equal((await db.query('SELECT * FROM subscriptions')).rows.length,0);
      const summary=await (await fetch(url+'/dashboard/backoffice-summary',{headers:ownerHeaders})).json();
      assert.equal(summary.metrics.mrr,0); assert.equal(summary.metrics.trials,1);
      assert.equal(summary.plans.some((p:any)=>p.plan_key==='business'),false);
      const response=await fetch(url+'/users/trial',{headers:await headersFor(newUser.id,false)});
      assert.equal(response.status,200); assert.equal((await response.json()).trial.active,true);
    });
    await t.test('same normalized company document cannot receive a second trial',async()=>{
      const duplicate=await register('duplicate@example.test','12345678000190');
      assert.equal((await getAccountEntitlements(duplicate.accountId)).trial.active,false);
      assert.equal((await getAccountEntitlements(duplicate.accountId)).planKey,'essential');
      const count=(await db.query<any>('SELECT COUNT(*)::int AS count FROM company_trial_claims')).rows[0].count;
      assert.equal(count,1);
    });
    await t.test('a failed registration transaction rolls back the claim and trial',async()=>{
      await db.exec('BEGIN');
      await grantRegistrationTrial({query},2,'ROLLBACK123');
      await db.exec('ROLLBACK');
      assert.equal((await db.query<any>('SELECT COUNT(*)::int AS count FROM company_trial_claims')).rows[0].count,1);
      assert.equal((await getAccountEntitlements(2)).trial.active,false);
    });
    await t.test('trial actions reject unauthenticated, tenant-admin and missing CSRF requests',async()=>{
      const path=`/backoffice/account/${newUser.accountId}/trial`;
      assert.equal((await post(path,{action:'extend'},{'Content-Type':'application/json'})).status,401);
      assert.equal((await post(path,{action:'extend'},tenantHeaders)).status,403);
      assert.equal((await post(path,{action:'extend'},{...ownerHeaders,'X-CSRF-Token':''})).status,403);
      assert.equal((await post('/backoffice/account/1/trial',{action:'extend'})).status,409);
    });
    await t.test('owner extends by 7 days without changing the contracted plan or MRR',async()=>{
      const before=await getAccountEntitlements(newUser.accountId);
      const response=await post(`/backoffice/account/${newUser.accountId}/trial`,{action:'extend'});
      assert.equal(response.status,200);
      const after=await getAccountEntitlements(newUser.accountId);
      assert.equal(new Date(after.trial.endsAt).getTime()-new Date(before.trial.endsAt).getTime(),7*86400000);
      assert.equal(after.contractedPlanKey,'essential');
      assert.equal((await db.query('SELECT * FROM subscriptions')).rows.length,0);
    });
    await t.test('expiry restores each contracted plan and preserves stored operational data',async()=>{
      await db.query('INSERT INTO orders VALUES ($1,NOW())',[newUser.accountId]);
      for(const key of ['essential','pro','business']){
        await db.query(`UPDATE accounts SET plan_key=$1,trial_ends_at=NOW() - INTERVAL '1 second' WHERE id=$2`,[key,newUser.accountId]);
        const access=await getAccountEntitlements(newUser.accountId);
        assert.equal(access.planKey,key); assert.equal(access.trial.active,false);
        assert.equal(access.limits.ordersUsedThisMonth,1);
      }
      await db.query("UPDATE accounts SET plan_key='essential' WHERE id=$1",[newUser.accountId]);
    });
    await t.test('expired trial can be extended; explicitly ended trial cannot restart',async()=>{
      const path=`/backoffice/account/${newUser.accountId}/trial`;
      assert.equal((await post(path,{action:'extend'})).status,200);
      assert.equal((await getAccountEntitlements(newUser.accountId)).trial.daysRemaining,7);
      assert.equal((await post(path,{action:'end'})).status,200);
      const access=await getAccountEntitlements(newUser.accountId);
      assert.equal(access.trial.status,'ended'); assert.equal(access.planKey,'essential');
      assert.equal((await post(path,{action:'extend'})).status,409);
      assert.equal((await db.query('SELECT * FROM account_trial_events WHERE actor_user_id=1')).rows.length,3);
      await grantRegistrationTrial({query},newUser.accountId,'CHANGED_DOCUMENT');
      assert.equal((await getAccountEntitlements(newUser.accountId)).trial.status,'ended');
    });
    await t.test('only owner can add/remove collaborators; removal invalidates existing Backoffice access',async()=>{
      assert.equal((await post('/backoffice/collaborators',{email:'collaborator@example.test',action:'add'},tenantHeaders)).status,403);
      assert.equal((await post('/backoffice/collaborators',{email:'collaborator@example.test',action:'add'})).status,200);
      assert.equal(await isPlatformAdmin(3),true);
      assert.equal((await fetch(url+'/dashboard/backoffice-summary',{headers:collaboratorHeaders})).status,200);
      assert.equal((await post('/backoffice/collaborators',{email:'tenant@example.test',action:'add'},collaboratorHeaders)).status,403);
      assert.equal((await post('/backoffice/collaborators',{email:'lucas.qvdo@gmail.com',action:'remove'})).status,409);
      assert.equal((await post('/backoffice/collaborators',{email:'collaborator@example.test',action:'remove'})).status,200);
      assert.equal((await fetch(url+'/dashboard/backoffice-summary',{headers:collaboratorHeaders})).status,403);
      await db.exec(BACKOFFICE_MEMBERS_SCHEMA_SQL);
      assert.equal(await isPlatformAdmin(3),false);
      assert.equal((await db.query('SELECT * FROM backoffice_access_events')).rows.length,2);
    });
  } finally {
    if(server?.listening) await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));
    mock.restoreAll(); await db.close();
  }
});

test('trial clock boundaries and incomplete dates fail closed',()=>{
  const now=Date.parse('2026-09-24T12:00:00Z');
  const row={trial_plan_key:'business',trial_started_at:new Date(now-86400000),trial_ends_at:new Date(now+1)};
  assert.equal(trialInfo(row,now).daysRemaining,1);
  assert.equal(trialInfo({...row,trial_ends_at:new Date(now)},now).active,false);
  assert.equal(trialInfo({...row,trial_started_at:null},now).active,false);
  assert.equal(trialInfo({...row,trial_started_at:new Date(now+1)},now).active,false);
  assert.equal(trialInfo({...row,trial_ended_at:new Date(now)},now).active,false);
});
