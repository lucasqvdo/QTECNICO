import assert from 'node:assert/strict';
import { beforeEach, afterEach, mock, test } from 'node:test';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import { pool } from '../server/db.js';
import { MockPgPool } from '../server/mockDb.js';
import { createSession } from '../server/auth.js';
import { createBackofficeSession } from '../server/backofficeAuth.js';
import backofficeRouter from '../server/routes/backoffice.js';
import usersRouter from '../server/routes/users.js';
import accountRouter from '../server/routes/account.js';

let database: MockPgPool;
let server: Server;
let url: string;
let headers: Record<string, string>;
beforeEach(async () => {
  database = new MockPgPool();
  database.store.accounts[0].plan_key = 'essential';
  mock.method(pool, 'query', (sql: string, params?: any[]) => database.query(sql, params));
  const cookies: Record<string, string> = {};
  await createSession(1, { cookie: (name: string, value: string) => { cookies[name] = value; } } as any);
  headers = {
    Cookie: Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; '),
    'X-CSRF-Token': cookies.qtecnico_csrf,
    'Content-Type': 'application/json',
  };
  const app = express();
  app.use(express.json());
  app.use('/api/users', usersRouter);
  app.use('/api/backoffice', backofficeRouter);
  // A rota legada é montada só neste teste de compatibilidade.
  app.use('/api/account', accountRouter);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  mock.restoreAll();
});

test('authenticated account and admin access expose consistent catalog limits', async () => {
  const plan = database.store.saas_plans.find(p => p.plan_key === 'essential');
  plan.limits.ordersPerMonth = 73;
  plan.limits.maxUsers = 3;
  const accessResponse = await fetch(`${url}/api/users/admin/access`, { headers });
  const accountResponse = await fetch(`${url}/api/account`, { headers });
  assert.equal(accessResponse.status, 200);
  assert.equal(accountResponse.status, 200);
  const access = await accessResponse.json();
  const account = await accountResponse.json();
  assert.equal(access.limits.ordersPerMonth, 73);
  assert.equal(account.limits.maxOrdersPerMonth, 73);
  assert.equal(access.limits.maxUsers, 3);
  assert.equal(account.limits.maxUsers, 3);
  assert.equal(access.limits.ordersUsedThisMonth, account.usage.ordersThisMonth);
  assert.equal(account.features.pdfExport, true);
  assert.equal(account.features.financialReports, false);
});

test('team creation rejects requests at the catalog user limit in the backend', async () => {
  const result = await fetch(`${url}/api/users/admin/team`, {
    method: 'POST', headers,
    body: JSON.stringify({ name: 'Técnico teste', email: 'tecnico@example.test', password: 'test-only-password' }),
  });
  assert.equal(result.status, 403);
  const body = await result.json();
  assert.equal(body.code, 'PLAN_USER_LIMIT');
  assert.equal(body.limit, 2);
  assert.equal(database.store.users.length, 2);
});


test('manual payment activates the subscription plan for subsequent access', async () => {
  const subscription = { id: 12, plan_key: 'pro', account_id: 1, status: 'pending_payment' };
  const account = database.store.accounts[0];
  const query = async (sql: string, params: any[] = []) => {
    if (sql === 'SELECT email, is_admin FROM users WHERE id = $1') {
      return { rows: [database.store.users[0]], rowCount: 1 };
    }
    if (sql.includes('SELECT a.*,s.id AS subscription_id')) {
      return { rows: [{ ...account, subscription_id: subscription.id, subscription_status: subscription.status, subscription_currency: 'BRL' }], rowCount: 1 };
    }
    if (sql.startsWith("UPDATE subscriptions SET status='active'")) subscription.status = 'active';
    if (sql.startsWith("UPDATE accounts SET subscription_status='active'")) {
      account.subscription_status = 'active';
      if (sql.includes('plan_key=(SELECT plan_key FROM subscriptions')) {
        assert.deepEqual(params, [subscription.id, account.id]);
        account.plan_key = subscription.plan_key;
      }
    }
    if (sql.startsWith('SELECT plan_key,subscription_status')) return { rows: [{ ...account }], rowCount: 1 };
    if (/^(BEGIN|COMMIT|ROLLBACK|UPDATE |INSERT INTO subscription_)/.test(sql)) return { rows: [], rowCount: 1 };
    return database.query(sql, params);
  };
  mock.method(pool, 'query', query);
  mock.method(pool, 'connect', async () => ({ query, release() {} }));
  const cookies: Record<string, string> = {};
  await createBackofficeSession(1, { cookie: (name: string, value: string) => { cookies[name] = value; } } as any);
  const result = await fetch(`${url}/api/backoffice/account/1/action`, {
    method: 'POST',
    headers: {
      Cookie: Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; '),
      'X-CSRF-Token': cookies.qtecnico_backoffice_csrf,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'manual_payment', amount: 99.90 }),
  });
  assert.equal(result.status, 200);
  const access = await fetch(`${url}/api/users/admin/access`, { headers });
  assert.equal(access.status, 200);
  const body = await access.json();
  assert.equal(body.planKey, 'pro');
  assert.equal(body.limits.maxUsers, 10);
});
