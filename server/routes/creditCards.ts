import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { pool } from '../db.js';
import { getAccountContext } from '../planLimits.js';
import { CardInputError, cardInput, itemInput, invoiceDates, positiveId, validDate } from '../creditCards.js';

const router = Router();
router.use(requireAuth);
router.use(async (req, res, next) => {
  const account = await getAccountContext(req.userId);
  if (!account) return res.status(404).json({ error: 'Conta não encontrada' });
  res.locals.accountId = account.accountId;
  next();
});
const dateOnly = (value: any) => value instanceof Date ? value.toISOString().slice(0,10) : String(value).slice(0,10);
const mapCard = (r: any) => ({ id: Number(r.id), name: r.name, lastFour: r.last_four, closingDay: r.closing_day, dueDay: r.due_day });
const mapItem = (r: any) => ({ id: Number(r.id), description: r.description, category: r.category, purchaseDate: dateOnly(r.purchase_date), amount: Number(r.amount), source: r.source });
const mapInvoice = (r: any) => ({ id: Number(r.id), cardId: Number(r.card_id), cardName: r.card_name, lastFour: r.last_four, competence: dateOnly(r.competence).slice(0,7), closingDate: dateOnly(r.closing_date), dueDate: dateOnly(r.due_date), amount: Number(r.amount), status: r.status, paidAt: r.paid_at ? dateOnly(r.paid_at) : null, expenseId: Number(r.expense_id) });
const invoiceSelect = `SELECT i.*, c.name AS card_name, c.last_four, e.id AS expense_id, e.amount, e.status, e.paid_at
  FROM credit_card_invoices i JOIN credit_cards c ON c.id=i.card_id AND c.account_id=i.account_id
  JOIN company_expenses e ON e.credit_card_invoice_id=i.id AND e.account_id=i.account_id`;
async function detail(db: any, accountId: number, id: number) {
  const { rows } = await db.query(`${invoiceSelect} WHERE i.account_id=$1 AND i.id=$2`, [accountId, id]);
  if (!rows.length) throw new CardInputError('Fatura não encontrada.', 404);
  const items = await db.query('SELECT * FROM credit_card_invoice_items WHERE account_id=$1 AND invoice_id=$2 ORDER BY purchase_date,id', [accountId, id]);
  return { ...mapInvoice(rows[0]), items: items.rows.map(mapItem) };
}
async function transaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const value = await fn(client); await client.query('COMMIT'); return value; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function lockInvoice(db: any, accountId: number, id: number, editable = false) {
  const { rows } = await db.query(`SELECT i.id, e.status FROM credit_card_invoices i
    JOIN company_expenses e ON e.credit_card_invoice_id=i.id AND e.account_id=i.account_id
    WHERE i.account_id=$1 AND i.id=$2 FOR UPDATE OF i, e`, [accountId, id]);
  if (!rows.length) throw new CardInputError('Fatura não encontrada.', 404);
  if (editable && rows[0].status === 'paid') throw new CardInputError('Reabra a fatura paga antes de alterar os itens.', 409);
}

router.get('/', async (_req, res) => {
  const result = await pool.query('SELECT * FROM credit_cards WHERE account_id=$1 ORDER BY name,id', [res.locals.accountId]);
  res.json(result.rows.map(mapCard));
});
router.post('/', async (req, res) => {
  const values = cardInput(req.body);
  const result = await pool.query('INSERT INTO credit_cards(account_id,name,last_four,closing_day,due_day) VALUES($1,$2,$3,$4,$5) RETURNING *', [res.locals.accountId, ...values]);
  res.status(201).json(mapCard(result.rows[0]));
});
router.put('/:cardId', async (req, res) => {
  const values = cardInput(req.body);
  const result = await pool.query('UPDATE credit_cards SET name=$3,last_four=$4,closing_day=$5,due_day=$6 WHERE account_id=$1 AND id=$2 RETURNING *', [res.locals.accountId, positiveId(req.params.cardId), ...values]);
  if (!result.rows.length) throw new CardInputError('Cartão não encontrado.', 404);
  res.json(mapCard(result.rows[0]));
});
router.get('/:cardId/invoices', async (req, res) => {
  const id = positiveId(req.params.cardId), a = res.locals.accountId;
  const card = await pool.query('SELECT id FROM credit_cards WHERE account_id=$1 AND id=$2', [a, id]);
  if (!card.rows.length) throw new CardInputError('Cartão não encontrado.', 404);
  const result = await pool.query(`${invoiceSelect} WHERE i.account_id=$1 AND i.card_id=$2 ORDER BY i.competence DESC`, [a, id]);
  res.json(result.rows.map(mapInvoice));
});
router.post('/:cardId/invoices', async (req, res) => {
  const a = res.locals.accountId, cardId = positiveId(req.params.cardId);
  const result = await transaction(async db => {
    // Serialize creation per card: repeated requests return the same month and payable.
    const card = (await db.query('SELECT * FROM credit_cards WHERE account_id=$1 AND id=$2 FOR UPDATE', [a, cardId])).rows[0];
    if (!card) throw new CardInputError('Cartão não encontrado.', 404);
    const dates = invoiceDates(req.body?.competence, card.closing_day, card.due_day);
    const existing = await db.query('SELECT id FROM credit_card_invoices WHERE account_id=$1 AND card_id=$2 AND competence=$3', [a, cardId, dates.competence]);
    if (existing.rows.length) return detail(db, a, Number(existing.rows[0].id));
    const inserted = await db.query('INSERT INTO credit_card_invoices(account_id,card_id,competence,closing_date,due_date) VALUES($1,$2,$3,$4,$5) RETURNING id', [a, cardId, dates.competence, dates.closingDate, dates.dueDate]);
    const id = Number(inserted.rows[0].id);
    await db.query(`INSERT INTO company_expenses(account_id,description,category,amount,due_date,credit_card_invoice_id)
      VALUES($1,$2,'Cartão de crédito',0,$3,$4)`, [a, `Fatura ${card.name} •••• ${card.last_four} — ${String(req.body.competence).split('-').reverse().join('/')}`, dates.dueDate, id]);
    return detail(db, a, id);
  });
  res.status(201).json(result);
});
router.get('/invoices/:invoiceId', async (req, res) => {
  res.json(await detail(pool, res.locals.accountId, positiveId(req.params.invoiceId)));
});
router.patch('/invoices/:invoiceId/payment', async (req, res) => {
  const a = res.locals.accountId, id = positiveId(req.params.invoiceId);
  if (!['pending','paid'].includes(req.body?.status)) throw new CardInputError('Status inválido.');
  const paidAt = req.body.status === 'paid' ? validDate(req.body.paidAt) : null;
  res.json(await transaction(async db => {
    await lockInvoice(db, a, id);
    const updated = await db.query(`UPDATE company_expenses SET status=$3,paid_at=$4,updated_at=NOW()
      WHERE account_id=$1 AND credit_card_invoice_id=$2 AND ($3='pending' OR amount>0) RETURNING id`, [a, id, req.body.status, paidAt]);
    if (!updated.rows.length) throw new CardInputError('Adicione itens antes de pagar a fatura.');
    return detail(db, a, id);
  }));
});

// A future PDF confirmation can use the same locked transaction and total
// recalculation. Import provenance/deduplication columns already exist; public
// manual endpoints deliberately never accept source/account/total from clients.
for (const method of ['post','put','delete'] as const) {
  router[method](`/invoices/:invoiceId/items${method === 'post' ? '' : '/:itemId'}`, async (req, res) => {
    const a = res.locals.accountId, id = positiveId(req.params.invoiceId);
    const itemId = method === 'post' ? null : positiveId(req.params.itemId);
    const values = method === 'delete' ? [] : itemInput(req.body);
    const result = await transaction(async db => {
      await lockInvoice(db, a, id, true);
      if (method === 'post') {
        await db.query('INSERT INTO credit_card_invoice_items(account_id,invoice_id,description,category,purchase_date,amount) VALUES($1,$2,$3,$4,$5,$6)', [a, id, ...values]);
      } else {
        const changed = method === 'put'
          ? await db.query('UPDATE credit_card_invoice_items SET description=$4,category=$5,purchase_date=$6,amount=$7,updated_at=NOW() WHERE account_id=$1 AND invoice_id=$2 AND id=$3 RETURNING id', [a,id,itemId,...values])
          : await db.query('DELETE FROM credit_card_invoice_items WHERE account_id=$1 AND invoice_id=$2 AND id=$3 RETURNING id', [a,id,itemId]);
        if (!changed.rows.length) throw new CardInputError('Item não encontrado.', 404);
      }
      await db.query(`UPDATE company_expenses SET amount=(SELECT COALESCE(SUM(amount),0) FROM credit_card_invoice_items WHERE account_id=$1 AND invoice_id=$2), updated_at=NOW()
        WHERE account_id=$1 AND credit_card_invoice_id=$2`, [a,id]);
      return detail(db,a,id);
    });
    res.status(method === 'post' ? 201 : 200).json(result);
  });
}
router.use((error: any, _req: any, res: any, next: any) => {
  if (error instanceof CardInputError) return res.status(error.status).json({ error: error.message });
  if (error?.code === '22003') return res.status(400).json({ error: 'O total da fatura excede o valor permitido.' });
  next(error);
});
export default router;
