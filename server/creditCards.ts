import { pool } from './db.js';

// Applied after company_expenses exists. The transaction/advisory lock also
// serializes overlapping Render boots. Existing expense values are untouched.
export const CREDIT_CARDS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS credit_cards (
  id BIGSERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  last_four TEXT NOT NULL CHECK (last_four ~ '^[0-9]{4}$'),
  closing_day INTEGER NOT NULL CHECK (closing_day BETWEEN 1 AND 31),
  due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, id)
);
CREATE TABLE IF NOT EXISTS credit_card_invoices (
  id BIGSERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  card_id BIGINT NOT NULL,
  competence DATE NOT NULL CHECK (EXTRACT(DAY FROM competence) = 1),
  closing_date DATE NOT NULL,
  due_date DATE NOT NULL CHECK (due_date > closing_date),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (account_id, card_id) REFERENCES credit_cards(account_id, id),
  UNIQUE (account_id, card_id, competence),
  UNIQUE (account_id, id)
);
CREATE TABLE IF NOT EXISTS credit_card_invoice_items (
  id BIGSERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  invoice_id BIGINT NOT NULL,
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 250),
  category TEXT NOT NULL CHECK (length(trim(category)) BETWEEN 1 AND 120),
  purchase_date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','pdf')),
  source_reference TEXT,
  source_metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (account_id, invoice_id) REFERENCES credit_card_invoices(account_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS credit_card_items_invoice_idx ON credit_card_invoice_items(account_id, invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS credit_card_items_source_idx ON credit_card_invoice_items(account_id, invoice_id, source, source_reference) WHERE source_reference IS NOT NULL;
ALTER TABLE company_expenses ADD COLUMN IF NOT EXISTS credit_card_invoice_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS company_expenses_invoice_idx ON company_expenses(account_id, credit_card_invoice_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'company_expenses'::regclass AND conname = 'company_expenses_invoice_fk') THEN
    ALTER TABLE company_expenses ADD CONSTRAINT company_expenses_invoice_fk FOREIGN KEY (account_id, credit_card_invoice_id) REFERENCES credit_card_invoices(account_id, id);
  END IF;
END $$;
ALTER TABLE company_expenses DROP CONSTRAINT IF EXISTS company_expenses_amount_check;
ALTER TABLE company_expenses ADD CONSTRAINT company_expenses_amount_check CHECK (amount > 0 OR (amount = 0 AND credit_card_invoice_id IS NOT NULL));
`;

export async function migrateCreditCards() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(74632901)');
    await client.query(CREDIT_CARDS_SCHEMA_SQL);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export class CardInputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function positiveId(value: unknown): number {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw new CardInputError('Identificador inválido.');
  return Number(value);
}
function requiredText(value: unknown, max: number, label: string) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new CardInputError(`${label} inválido(a).`);
  return value.trim();
}
export function validDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9998-12-31' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new CardInputError('Data inválida.');
  return value;
}
export function cardInput(body: any) {
  const name = requiredText(body?.name, 100, 'Nome');
  if (typeof body?.lastFour !== 'string' || !/^\d{4}$/.test(body.lastFour)) throw new CardInputError('Informe somente os últimos 4 dígitos.');
  for (const day of [body.closingDay, body.dueDay]) {
    if (!Number.isInteger(day) || day < 1 || day > 31) throw new CardInputError('Os dias devem estar entre 1 e 31.');
  }
  return [name, body.lastFour, body.closingDay, body.dueDay];
}
export function itemInput(body: any) {
  const description = requiredText(body?.description, 250, 'Descrição');
  const category = requiredText(body?.category, 120, 'Categoria');
  const purchaseDate = validDate(body?.purchaseDate);
  const amount = body?.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99 || !/^\d+(\.\d{1,2})?$/.test(String(amount))) throw new CardInputError('Informe um valor positivo com até duas casas decimais.');
  return [description, category, purchaseDate, amount];
}

// Competence is the month of payment. Clamp 29/30/31 to the month's last day.
export function invoiceDates(competence: unknown, closingDay: number, dueDay: number) {
  if (typeof competence !== 'string' || !/^\d{4}-\d{2}$/.test(competence)) throw new CardInputError('Competência inválida.');
  validDate(`${competence}-01`);
  const [year, month] = competence.split('-').map(Number);
  const date = (offset: number, day: number) => {
    const first = new Date(Date.UTC(year, month - 1 + offset, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(last, day));
    return first.toISOString().slice(0,10);
  };
  const dueDate = date(0, dueDay);
  let closingDate = date(0, closingDay);
  if (closingDate >= dueDate) closingDate = date(-1, closingDay);
  return { competence: `${competence}-01`, closingDate, dueDate };
}
