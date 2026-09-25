import assert from 'node:assert/strict';
import { beforeEach, afterEach, mock, test } from 'node:test';
import { pool } from '../server/db.js';
import { MockPgPool } from '../server/mockDb.js';
import { getAccountContext, getAccountEntitlements, getAccountPlan, hasAccountFeature } from '../server/plans.js';
import { enforceOrderLimit, requireFeature, assertPhotoLimit } from '../server/planLimits.js';

let database: MockPgPool;
beforeEach(() => {
  database = new MockPgPool();
  mock.method(pool, 'query', (sql: string, params?: any[]) => database.query(sql, params));
});
afterEach(() => mock.restoreAll());

function selectPlan(key: string) {
  database.store.accounts[0].plan_key = key;
  return database.store.saas_plans.find((p) => p.plan_key === key);
}

function response() {
  return {
    locals: {} as Record<string, any>, statusCode: 200, body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

for (const [key, orders, users, financial] of [
  ['essential', 50, 2, false], ['pro', 250, 10, true], ['business', 1000, 30, true],
] as const) {
  test(`${key}: operation and administrative access use the same catalog`, async () => {
    selectPlan(key);
    const context = await getAccountContext(1);
    const entitlements = await getAccountEntitlements(1);
    assert.equal(context?.plan.key, key);
    assert.equal(context?.plan.limits.ordersPerMonth, orders);
    assert.equal(entitlements.limits.maxUsers, users);
    assert.equal(entitlements.limits.ordersPerMonth, orders);
    assert.deepEqual(entitlements.features, context?.plan.features);
    assert.equal(await hasAccountFeature(1, 'financialIndicators'), financial);
  });
}

test('catalog changes affect OS, dashboard and team limits without static fallbacks', async () => {
  const plan = selectPlan('pro');
  plan.limits = { maxUsers: 4, ordersPerMonth: 75, maxPhotosPerAttendance: 2 };
  plan.features = ['orders', 'pdf'];
  const access = await getAccountEntitlements(1);
  assert.equal(access.limits.maxUsers, 4);
  assert.equal(access.limits.ordersPerMonth, 75);
  assert.equal(await hasAccountFeature(1, 'financialIndicators'), false);
  const context = await getAccountContext(2);
  assert.equal(context?.accountId, 1);
  assert.equal(context?.plan.limits.ordersPerMonth, 75);
  assert.throws(() => assertPhotoLimit(context!.plan, [{ photos: [1, 2, 3] }]), { code: 'PLAN_LIMIT_PHOTOS' });
});

test('a pending subscription cannot override the effective account plan', async () => {
  selectPlan('essential');
  // Any lookup of the latest subscription would expose this pending upgrade.
  mock.method(pool, 'query', (sql: string, params?: any[]) => sql.includes('subscriptions')
    ? Promise.resolve({ rows: [{ plan_key: 'business', status: 'pending_payment' }], rowCount: 1 })
    : database.query(sql, params));
  assert.equal((await getAccountEntitlements(1)).planKey, 'essential');
  assert.equal(await hasAccountFeature(1, 'auditLog'), false);
  // Activation changes accounts.plan_key; every consumer sees it immediately.
  selectPlan('business');
  assert.equal((await getAccountContext(1))?.plan.key, 'business');
  assert.equal(await hasAccountFeature(1, 'auditLog'), true);
});

test('usage includes all technicians, excludes other accounts and other months', async () => {
  selectPlan('essential');
  const now = new Date();
  database.store.orders = [
    { account_id: 1, user_id: 1, created_at: now },
    { account_id: 1, user_id: 2, created_at: now },
    { account_id: 2, user_id: 3, created_at: now },
    { account_id: 1, created_at: new Date(now.getFullYear(), now.getMonth(), 0) },
    { account_id: 1, created_at: new Date(now.getFullYear(), now.getMonth() + 1, 1) },
  ];
  const access = await getAccountEntitlements(1);
  assert.equal(access.limits.ordersUsedThisMonth, 2);
  assert.equal(access.limits.ordersUsagePercent, 4);
});

for (const used of [40, 50, 51]) {
  test(`fair-use at ${used}/50 exposes usage and allows the next OS`, async () => {
    selectPlan('essential');
    database.store.orders = Array.from({ length: used }, () => ({ account_id: 1, created_at: new Date() }));
    mock.method(console, 'warn', () => {});
    const res = response();
    let proceeded = false;
    await enforceOrderLimit()({ userId: 1 } as any, res as any, () => { proceeded = true; });
    assert.equal(proceeded, true);
    assert.deepEqual(res.locals.orderUsage, { used, limit: 50, percent: Math.round(used / 50 * 100) });
    assert.equal((await getAccountEntitlements(1)).limits.ordersUsagePercent, res.locals.orderUsage.percent);
  });
}

test('explicit unlimited OS still reports real usage', async () => {
  selectPlan('business').limits.ordersPerMonth = null;
  database.store.orders = [{ account_id: 1, created_at: new Date() }];
  const access = await getAccountEntitlements(1);
  assert.equal(access.limits.ordersPerMonth, null);
  assert.equal(access.limits.ordersUsedThisMonth, 1);
  assert.equal(access.limits.ordersUsagePercent, 0);
});

test('zero limits are preserved rather than replaced by defaults or infinity', async () => {
  const plan = selectPlan('essential');
  plan.limits.maxUsers = 0;
  plan.limits.ordersPerMonth = 0;
  const access = await getAccountEntitlements(1);
  assert.equal(access.limits.maxUsers, 0);
  assert.equal(access.limits.ordersPerMonth, 0);
  assert.equal(Number.isFinite(access.limits.ordersUsagePercent), true);
});

for (const invalid of [undefined, -1, '50', 1.5]) {
  test(`invalid order limit ${String(invalid)} fails instead of granting unlimited usage`, async () => {
    selectPlan('essential').limits.ordersPerMonth = invalid;
    await assert.rejects(getAccountPlan(1), /Limite inválido/);
  });
}

test('unknown plan fails rather than silently selecting a different tier', async () => {
  selectPlan('unknown');
  await assert.rejects(getAccountContext(1), /ausente ou inválido/);
  await assert.rejects(getAccountEntitlements(1), /ausente ou inválido/);
});

test('users without an account cannot use another tenant or advance the middleware', async () => {
  assert.equal(await getAccountContext(999), null);
  const res = response();
  await enforceOrderLimit()({ userId: 999 } as any, res as any, () => assert.fail('unexpected access'));
  assert.equal(res.statusCode, 403);
});

test('feature middleware enforces the canonical catalog feature names', async () => {
  selectPlan('essential');
  const res = response();
  await requireFeature('consolidatedFinance')({ userId: 1 } as any, res as any, () => assert.fail('unexpected access'));
  assert.equal(res.statusCode, 402);
  assert.equal(res.body.code, 'PLAN_LIMIT_FEATURE');
  selectPlan('pro');
  let proceeded = false;
  await requireFeature('consolidatedFinance')({ userId: 1 } as any, response() as any, () => { proceeded = true; });
  assert.equal(proceeded, true);
});
