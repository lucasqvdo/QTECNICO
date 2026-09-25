import { BACKOFFICE_MEMBERS_SCHEMA_SQL } from '../server/backofficeMembers.js';
import { TRIAL_SCHEMA_SQL } from '../server/trial.js';
import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { pool } from '../server/db.js';
import { INITIAL_PLAN_CATALOG } from '../server/planCatalog.js';
import { createBackofficeSession } from '../server/backofficeAuth.js';
import { getAccountEntitlements } from '../server/plans.js';
import backofficeRouter from '../server/routes/backoffice.js';

test('PostgreSQL: change plan down and up, with and without a subscription', async () => {
  const db = new PGlite();
  let server: ReturnType<ReturnType<typeof express>['listen']> | undefined;
  try {
    await db.exec(`
      CREATE TABLE accounts (id int PRIMARY KEY, plan_key text, subscription_status text, current_period_end timestamptz);
      CREATE TABLE users (id int PRIMARY KEY, account_id int, email text, is_admin boolean);
      CREATE TABLE auth_sessions (user_id int, token_hash text, expires_at timestamptz, revoked_at timestamptz);
      CREATE TABLE saas_plans (plan_key text PRIMARY KEY, name text, amount numeric, currency text, billing_interval text, active boolean, features jsonb, limits jsonb);
      CREATE TABLE subscriptions (id serial PRIMARY KEY, account_id int, plan_key text, status text, amount numeric, currency text, billing_interval text, current_period_start timestamptz, current_period_end timestamptz, metadata jsonb, created_at timestamptz DEFAULT NOW(), updated_at timestamptz DEFAULT NOW());
      CREATE TABLE subscription_events (id serial PRIMARY KEY, account_id int, subscription_id int, event_type text, actor_user_id int, source text, payload jsonb);
      CREATE TABLE orders (account_id int, created_at timestamptz);
      INSERT INTO accounts VALUES (1,'business','active',NOW() + INTERVAL '1 month'),(2,'essential','active',NULL);
      INSERT INTO users VALUES (1,1,'admin@example.test',TRUE),(2,2,'owner@example.test',TRUE);
      INSERT INTO users SELECT n,1,'technician' || n || '@example.test',FALSE FROM generate_series(3,14) n;
      INSERT INTO subscriptions (account_id,plan_key,status,amount,currency,billing_interval,current_period_start,current_period_end)
        VALUES (1,'business','active',199.90,'BRL','month',NOW(),NOW() + INTERVAL '1 month');
    `);
    await db.exec(TRIAL_SCHEMA_SQL);
    await db.exec(BACKOFFICE_MEMBERS_SCHEMA_SQL);
    await db.exec("INSERT INTO backoffice_members (user_id,role) VALUES (1,'owner')");
    for (const [key, name, , amount, features, limits] of INITIAL_PLAN_CATALOG) {
      await db.query('INSERT INTO saas_plans VALUES ($1,$2,$3,\'BRL\',\'month\',TRUE,$4,$5)', [key, name, amount, JSON.stringify(features), JSON.stringify(limits)]);
    }
    const query = async (sql: string, params?: any[]) => {
      const result = await db.query(sql, params);
      return { rows: result.rows, rowCount: result.affectedRows || result.rows.length };
    };
    mock.method(pool, 'query', query);
    mock.method(pool, 'connect', async () => ({ query, release() {} }));
    const cookies: Record<string, string> = {};
    await createBackofficeSession(1, { cookie: (name: string, value: string) => { cookies[name] = value; } } as any);
    const headers = {
      Cookie: Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; '),
      'X-CSRF-Token': cookies.qtecnico_backoffice_csrf,
      'Content-Type': 'application/json',
    };
    const app = express();
    app.use(express.json());
    app.use('/backoffice', backofficeRouter);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const change = (accountId: number, planKey: string) => fetch(`${url}/backoffice/account/${accountId}/action`, {
      method: 'POST', headers, body: JSON.stringify({ action: 'change_plan', planKey }),
    });
    for (const [key, maxUsers, ordersPerMonth, amount] of [
      ['essential', 2, 50, 49.90], ['pro', 10, 250, 99.90], ['business', 30, 1000, 199.90],
    ] as const) {
      const response = await change(1, key);
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      const access = await getAccountEntitlements(1);
      assert.equal(access.planKey, key);
      assert.equal(access.limits.maxUsers, maxUsers);
      assert.equal(access.limits.ordersPerMonth, ordersPerMonth);
      assert.equal(access.features.includes('consolidatedFinance'), key !== 'essential');
      assert.equal((await db.query<any>('SELECT COUNT(*)::int AS count FROM users WHERE account_id=1')).rows[0].count, 13);
      const subscription = (await db.query<any>('SELECT plan_key,amount FROM subscriptions WHERE account_id=1')).rows[0];
      assert.equal(subscription.plan_key, key);
      assert.equal(Number(subscription.amount), amount);
    }
    const newSubscription = await change(2, 'pro');
    assert.equal(newSubscription.status, 200, JSON.stringify(await newSubscription.json()));
    assert.equal((await getAccountEntitlements(2)).planKey, 'pro');
    assert.equal((await getAccountEntitlements(1)).planKey, 'business');
    const count = (await db.query<any>('SELECT COUNT(*)::int AS count FROM subscriptions WHERE account_id=2')).rows[0].count;
    assert.equal(count, 1);
    const invalid = await change(1, 'unknown');
    assert.equal(invalid.status, 400);
    assert.equal((await getAccountEntitlements(1)).planKey, 'business');
    const audit = (await db.query<any>("SELECT payload FROM subscription_events WHERE account_id=1 AND event_type='backoffice_change_plan' ORDER BY id")).rows;
    assert.equal(audit.length, 3);
    assert.equal(audit[0].payload.before.planKey, 'business');
    assert.equal(audit[0].payload.after.plan_key, 'essential');
    assert.equal(audit[2].payload.after.plan_key, 'business');
  } finally {
    if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    mock.restoreAll();
    await db.close();
  }
});
