import { pool } from './db.js';

export async function migratePreventiveMaintenance() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS preventive_maintenance_plans (
      id BIGSERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      interval_days INTEGER NOT NULL CHECK (interval_days > 0),
      first_scheduled_date DATE NOT NULL,
      next_scheduled_date DATE NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS preventive_plans_account_next_idx ON preventive_maintenance_plans(account_id, active, next_scheduled_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS preventive_plans_client_idx ON preventive_maintenance_plans(account_id, client_id)`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS preventive_plan_id BIGINT REFERENCES preventive_maintenance_plans(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS preventive_scheduled_date DATE`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS orders_preventive_occurrence_uidx ON orders(account_id, preventive_plan_id, preventive_scheduled_date) WHERE preventive_plan_id IS NOT NULL AND preventive_scheduled_date IS NOT NULL`);
}
