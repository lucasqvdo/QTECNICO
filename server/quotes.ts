import { pool } from './db.js';

export async function migrateQuotes(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotes (
      id BIGSERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
      number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','approved','rejected','expired','converted')),
      issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
      valid_until DATE,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      discount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
      notes TEXT NOT NULL DEFAULT '',
      order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
      approved_at TIMESTAMPTZ,
      converted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(account_id, number)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quote_items (
      id BIGSERIAL PRIMARY KEY,
      quote_id BIGINT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      item_type TEXT NOT NULL DEFAULT 'service' CHECK (item_type IN ('service','material','other')),
      quantity NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
      unit_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS service_address TEXT NOT NULL DEFAULT ''`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quote_images (
      id BIGSERIAL PRIMARY KEY,
      quote_id BIGINT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      storage_key TEXT NOT NULL,
      caption TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS quote_images_quote_idx ON quote_images(quote_id,sort_order,id)');

  await pool.query('CREATE INDEX IF NOT EXISTS quotes_account_status_idx ON quotes(account_id,status,created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS quotes_client_idx ON quotes(account_id,client_id)');
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS quote_id BIGINT REFERENCES quotes(id) ON DELETE SET NULL');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS orders_quote_uidx ON orders(account_id,quote_id) WHERE quote_id IS NOT NULL');
}
