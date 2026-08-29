import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import authRouter from './routes/auth.js';
import ordersRouter from './routes/orders.js';
import clientsRouter from './routes/clients.js';
import usersRouter from './routes/users.js';
import uploadsRouter from './routes/uploads.js';
import accountRouter from './routes/account.js';

import { existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

app.use(cors());
// Limite reduzido: fotos agora vão via upload multipart (/api/uploads) e só a URL
// trafega no JSON. 2mb cobre folgadamente o resto do payload (assinatura em base64
// pequena, textos, listas de despesas/pagamentos).
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth', authRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/users', usersRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/account', accountRouter);

async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'Técnico',
        phone TEXT DEFAULT '',
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        photo_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        name TEXT NOT NULL,
        document TEXT DEFAULT '',
        address TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        email TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        client_id TEXT REFERENCES clients(id),
        client_name TEXT NOT NULL,
        address TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        type TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        date DATE,
        priority TEXT DEFAULT 'medium',
        description TEXT DEFAULT '',
        client_value NUMERIC(14,2) DEFAULT 0,
        payment_status TEXT DEFAULT 'pending',
        paid_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        amount NUMERIC(14,2) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS attendances (
        id TEXT PRIMARY KEY,
        order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
        start_time TIMESTAMPTZ,
        end_time TIMESTAMPTZ,
        duration_seconds INTEGER DEFAULT 0,
        description TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS attendance_photos (
        id TEXT PRIMARY KEY,
        attendance_id TEXT REFERENCES attendances(id) ON DELETE CASCADE,
        data_url TEXT NOT NULL,
        name TEXT DEFAULT ''
      );
    `);

    const userCheck = await pool.query("SELECT id FROM users WHERE email = 'lucas.qtech@gmail.com'");

    if (userCheck.rows.length === 0) {
      // Nunca hardcode a senha do usuário de seed no código-fonte (fica exposta no
      // repositório). Usa SEED_USER_PASSWORD se definida; caso contrário, gera uma
      // senha aleatória e a imprime uma única vez no log do servidor.
      const seedPassword = process.env.SEED_USER_PASSWORD || crypto.randomBytes(9).toString('base64url');
      if (!process.env.SEED_USER_PASSWORD) {
        console.log(`🔑 Senha gerada para lucas.qtech@gmail.com: ${seedPassword} (defina SEED_USER_PASSWORD para fixar uma senha própria)`);
      }
      const hash = await bcrypt.hash(seedPassword, 10);
      const userRes = await pool.query(
        `INSERT INTO users (name, role, phone, email, password_hash)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        ['Lucas Qtech', 'Técnico Eletricista — CREA/SP 123456', '(11) 99000-1234', 'lucas.qtech@gmail.com', hash]
      );
      const userId = userRes.rows[0].id;

      const clientsData = [
        { id: 'c1', name: 'Construtora Alpina Ltda',    document: '12.345.678/0001-90', address: 'Av. Paulista, 1374 — São Paulo, SP',       phone: '(11) 99832-4411', email: 'contato@alpina.com.br' },
        { id: 'c2', name: 'Residencial Parque Verde',   document: '98.765.432/0001-11', address: 'Rua das Flores, 88 — Campinas, SP',         phone: '(19) 98741-3300', email: 'admin@parqueverde.com.br' },
        { id: 'c3', name: 'Mercado Bom Preço',          document: '45.678.901/0001-23', address: 'Rua XV de Novembro, 220 — Santos, SP',      phone: '(13) 97654-8800', email: 'gerencia@bompreco.com.br' },
        { id: 'c4', name: 'Clínica São Lucas',          document: '78.901.234/0001-56', address: 'Av. Dom Pedro I, 450 — Ribeirão Preto, SP', phone: '(16) 99123-5566', email: 'recepcao@saolucas.com.br' },
        { id: 'c5', name: 'Escola Estadual Tiradentes', document: '11.222.333/0001-44', address: 'Rua Independência, 300 — Sorocaba, SP',     phone: '(15) 98900-1122', email: 'diretoria@eetiradentes.edu.br' },
      ];
      for (const c of clientsData) {
        await pool.query(
          'INSERT INTO clients (id, user_id, name, document, address, phone, email) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [c.id, userId, c.name, c.document, c.address, c.phone, c.email]
        );
      }

      type OrderSeed = { id: string; clientId: string; client: string; address: string; phone: string; type: string; status: string; date: string; priority: string; description: string; clientValue: number; paymentStatus: string; paidDate?: string; expenses: { id: string; label: string; amount: number }[]; attendances: { id: string; startTime: string; endTime: string; durationSeconds: number; description: string }[] };
      const ordersData: OrderSeed[] = [
        { id: 'OS-2406-001', clientId: 'c1', client: 'Construtora Alpina Ltda',    address: 'Av. Paulista, 1374 — São Paulo, SP',       phone: '(11) 99832-4411', type: 'Instalação Elétrica',           status: 'in_progress', date: '2026-06-17', priority: 'high',   description: 'Instalação de quadro de distribuição e tomadas industriais.',            clientValue: 4800, paymentStatus: 'pending', expenses: [{ id: 'e1', label: 'Quadro de distribuição', amount: 980 }, { id: 'e2', label: 'Cabos e conectores', amount: 430 }, { id: 'e3', label: 'Deslocamento', amount: 120 }], attendances: [{ id: 'a1', startTime: '2026-06-17T08:00:00.000Z', endTime: '2026-06-17T10:30:00.000Z', durationSeconds: 9000, description: 'Instalação do quadro elétrico principal. Circuitos 1 a 8 concluídos.' }] },
        { id: 'OS-2406-002', clientId: 'c2', client: 'Residencial Parque Verde',   address: 'Rua das Flores, 88 — Campinas, SP',         phone: '(19) 98741-3300', type: 'Manutenção Preventiva',         status: 'pending',     date: '2026-06-18', priority: 'medium', description: 'Revisão geral do sistema de iluminação e disjuntores.',                  clientValue: 1200, paymentStatus: 'pending', expenses: [{ id: 'e4', label: 'Disjuntores', amount: 180 }, { id: 'e5', label: 'Deslocamento', amount: 80 }], attendances: [] },
        { id: 'OS-2406-003', clientId: 'c3', client: 'Mercado Bom Preço',          address: 'Rua XV de Novembro, 220 — Santos, SP',      phone: '(13) 97654-8800', type: 'Reparo Urgente',                status: 'pending',     date: '2026-06-17', priority: 'high',   description: 'Curto-circuito no setor de câmaras frias.',                            clientValue: 2600, paymentStatus: 'pending', expenses: [{ id: 'e6', label: 'Materiais elétricos', amount: 520 }, { id: 'e7', label: 'Deslocamento', amount: 150 }], attendances: [] },
        { id: 'OS-2406-004', clientId: 'c4', client: 'Clínica São Lucas',          address: 'Av. Dom Pedro I, 450 — Ribeirão Preto, SP', phone: '(16) 99123-5566', type: 'Instalação de SPDA',            status: 'completed',   date: '2026-06-15', priority: 'low',    description: 'Para-raios e aterramento conforme ABNT NBR 5419.',                     clientValue: 3500, paymentStatus: 'paid',    paidDate: '2026-06-16', expenses: [{ id: 'e8', label: 'Haste de aterramento', amount: 620 }, { id: 'e9', label: 'Condutor de cobre', amount: 380 }, { id: 'e10', label: 'Deslocamento', amount: 200 }], attendances: [{ id: 'a2', startTime: '2026-06-15T07:30:00.000Z', endTime: '2026-06-15T12:00:00.000Z', durationSeconds: 16200, description: 'Instalação completa do SPDA. Aterramento aprovado conforme ABNT NBR 5419.' }] },
        { id: 'OS-2406-005', clientId: 'c5', client: 'Escola Estadual Tiradentes', address: 'Rua Independência, 300 — Sorocaba, SP',     phone: '(15) 98900-1122', type: 'Laudo Técnico',                 status: 'cancelled',   date: '2026-06-14', priority: 'low',    description: 'Laudo de conformidade das instalações elétricas.',                     clientValue: 800,  paymentStatus: 'pending', expenses: [], attendances: [] },
        { id: 'OS-2405-001', clientId: 'c1', client: 'Construtora Alpina Ltda',    address: 'Av. Paulista, 1374 — São Paulo, SP',       phone: '(11) 99832-4411', type: 'Revisão Elétrica',              status: 'completed',   date: '2026-05-20', priority: 'medium', description: 'Revisão geral das instalações do 3º andar.',                           clientValue: 2200, paymentStatus: 'paid',    paidDate: '2026-05-25', expenses: [{ id: 'e11', label: 'Materiais', amount: 320 }, { id: 'e12', label: 'Deslocamento', amount: 80 }], attendances: [] },
        { id: 'OS-2405-002', clientId: 'c3', client: 'Mercado Bom Preço',          address: 'Rua XV de Novembro, 220 — Santos, SP',      phone: '(13) 97654-8800', type: 'Instalação de Iluminação',      status: 'completed',   date: '2026-05-10', priority: 'medium', description: 'Troca de toda a iluminação do salão principal para LED.',              clientValue: 3100, paymentStatus: 'paid',    paidDate: '2026-05-15', expenses: [{ id: 'e13', label: 'Luminárias LED', amount: 1100 }, { id: 'e14', label: 'Cabeamento', amount: 280 }], attendances: [] },
        { id: 'OS-2404-001', clientId: 'c2', client: 'Residencial Parque Verde',   address: 'Rua das Flores, 88 — Campinas, SP',         phone: '(19) 98741-3300', type: 'Instalação de AR Condicionado', status: 'completed',   date: '2026-04-08', priority: 'low',    description: 'Instalação elétrica para 4 splits novos.',                             clientValue: 1800, paymentStatus: 'paid',    paidDate: '2026-04-12', expenses: [{ id: 'e15', label: 'Materiais elétricos', amount: 420 }], attendances: [] },
        { id: 'OS-2404-002', clientId: 'c4', client: 'Clínica São Lucas',          address: 'Av. Dom Pedro I, 450 — Ribeirão Preto, SP', phone: '(16) 99123-5566', type: 'Manutenção Preventiva',         status: 'completed',   date: '2026-04-22', priority: 'medium', description: 'Revisão trimestral do sistema elétrico.',                               clientValue: 950,  paymentStatus: 'pending', expenses: [{ id: 'e16', label: 'Materiais', amount: 120 }, { id: 'e17', label: 'Deslocamento', amount: 90 }], attendances: [] },
      ];

      for (const o of ordersData) {
        await pool.query(
          `INSERT INTO orders (id, user_id, client_id, client_name, address, phone, type, status, date, priority, description, client_value, payment_status, paid_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [o.id, userId, o.clientId, o.client, o.address, o.phone, o.type, o.status,
           o.date, o.priority, o.description, o.clientValue, o.paymentStatus, o.paidDate || null]
        );
        for (const e of o.expenses) {
          await pool.query('INSERT INTO expenses (id, order_id, label, amount) VALUES ($1,$2,$3,$4)', [e.id, o.id, e.label, e.amount]);
        }
        for (const a of o.attendances) {
          await pool.query(
            `INSERT INTO attendances (id, order_id, start_time, end_time, duration_seconds, description) VALUES ($1,$2,$3,$4,$5,$6)`,
            [a.id, o.id, a.startTime, a.endTime, a.durationSeconds, a.description]
          );
        }
      }
      console.log('✅ Dados iniciais inseridos');
    }

    // Migrations para colunas novas
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_signature TEXT`);
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_payments (
        id TEXT PRIMARY KEY,
        order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
        label TEXT DEFAULT 'Pagamento',
        amount NUMERIC(14,2) NOT NULL,
        date DATE NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Migra pagamentos únicos antigos para a nova tabela
    await pool.query(`
      INSERT INTO order_payments (id, order_id, label, amount, date, status)
      SELECT
        'pay-mig-' || o.id,
        o.id,
        'Pagamento',
        COALESCE(o.paid_amount, o.client_value),
        COALESCE(o.paid_date, CURRENT_DATE),
        'paid'
      FROM orders o
      WHERE o.payment_status = 'paid'
        AND NOT EXISTS (SELECT 1 FROM order_payments op WHERE op.order_id = o.id)
    `);

    // --- Planos / contas ---
    // Uma "account" é a unidade que assina um plano. Hoje cada usuário é dono da
    // própria account (1:1); o campo existe separado de users pra permitir, no
    // futuro, vários técnicos (users) compartilhando a mesma account/plano
    // (planos Médio/Power), sem precisar de outra migração de schema.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        owner_user_id INTEGER REFERENCES users(id),
        plan_key TEXT NOT NULL DEFAULT 'free',
        subscription_status TEXT NOT NULL DEFAULT 'active',
        current_period_end TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_account_admin BOOLEAN NOT NULL DEFAULT true`);

    // Backfill: todo usuário existente que ainda não tem account ganha uma própria.
    // Fica no plano 'power' por padrão (sem limites) para não travar quem já estava
    // usando o app antes dos planos existirem — ajuste manualmente no banco se quiser
    // testar os limites de um plano menor.
    const orphanUsers = await pool.query(`SELECT id FROM users WHERE account_id IS NULL`);
    for (const u of orphanUsers.rows) {
      const accRes = await pool.query(
        `INSERT INTO accounts (owner_user_id, plan_key) VALUES ($1, 'power') RETURNING id`,
        [u.id]
      );
      await pool.query(`UPDATE users SET account_id = $1, is_account_admin = true WHERE id = $2`, [accRes.rows[0].id, u.id]);
    }

    console.log('✅ Banco de dados pronto');
  } catch (e) {
    console.error('❌ Erro ao inicializar banco:', e);
    process.exit(1);
  }
}

initDb().then(() => {
  // Serve frontend build if dist/ exists (production)
  const distPath = path.join(__dirname, '..', 'dist');
  if (existsSync(path.join(distPath, 'index.html'))) {
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
});
