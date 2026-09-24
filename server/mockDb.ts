import bcrypt from 'bcryptjs';
import { INITIAL_PLAN_CATALOG } from './planCatalog.js';

export interface MockStore {
  users: any[];
  accounts: any[];
  saas_plans: any[];
  clients: any[];
  orders: any[];
  expenses: any[];
  attendances: any[];
  attendance_photos: any[];
  order_payments: any[];
  company_profiles: any[];
  auth_sessions: any[];
  webauthn_challenges: any[];
  webauthn_auth_challenges: any[];
  webauthn_credentials: any[];
  password_reset_tokens: any[];
}

function initMockStore(): MockStore {
  const passwordHash = bcrypt.hashSync('123456', 10);
  const now = new Date();

  const accounts = [
    {
      id: 1,
      owner_user_id: 1,
      plan_key: 'pro',
      subscription_status: 'active',
      created_at: now,
    },
  ];

  const users = [
    {
      id: 1,
      account_id: 1,
      name: 'Lucas Qtech',
      role: 'Administrador e Responsável Técnico',
      phone: '(11) 99000-1234',
      email: 'lucas.qtech@gmail.com',
      password_hash: passwordHash,
      is_admin: true,
      photo_url: null,
      created_at: now,
    },
    {
      id: 2,
      account_id: 1,
      name: 'Carlos Eduardo Mendes',
      role: 'Técnico Eletricista — CREA/SP 123456',
      phone: '(11) 98888-5678',
      email: 'carlos.mendes@qtecnico.com.br',
      password_hash: passwordHash,
      is_admin: false,
      photo_url: null,
      created_at: now,
    },
  ];

  const clients = [
    {
      id: 1,
      account_id: 1,
      user_id: 1,
      name: 'Construtora Alpina Ltda',
      document: '12.345.678/0001-90',
      address: 'Av. Paulista, 1374 — São Paulo, SP',
      phone: '(11) 99832-4411',
      email: 'contato@alpina.com.br',
      created_at: now,
    },
    {
      id: 2,
      account_id: 1,
      user_id: 1,
      name: 'Residencial Parque Verde',
      document: '98.765.432/0001-11',
      address: 'Rua das Flores, 88 — Campinas, SP',
      phone: '(19) 98741-3300',
      email: 'admin@parqueverde.com.br',
      created_at: now,
    },
    {
      id: 3,
      account_id: 1,
      user_id: 1,
      name: 'Mercado Bom Preço',
      document: '45.678.901/0001-23',
      address: 'Rua XV de Novembro, 220 — Santos, SP',
      phone: '(13) 97654-8800',
      email: 'gerencia@bompreco.com.br',
      created_at: now,
    },
    {
      id: 4,
      account_id: 1,
      user_id: 1,
      name: 'Clínica São Lucas',
      document: '78.901.234/0001-56',
      address: 'Av. Dom Pedro I, 450 — Ribeirão Preto, SP',
      phone: '(16) 99123-5566',
      email: 'recepcao@saolucas.com.br',
      created_at: now,
    },
    {
      id: 5,
      account_id: 1,
      user_id: 1,
      name: 'Escola Estadual Tiradentes',
      document: '11.222.333/0001-44',
      address: 'Rua Independência, 300 — Sorocaba, SP',
      phone: '(15) 98900-1122',
      email: 'diretoria@eetiradentes.edu.br',
      created_at: now,
    },
  ];

  const orders = [
    {
      id: 'OS-2406-001',
      account_id: 1,
      user_id: 1,
      client_id: 1,
      client_name: 'Construtora Alpina Ltda',
      address: 'Av. Paulista, 1374 — Bela Vista, São Paulo/SP',
      phone: '(11) 99832-4411',
      type: 'Manutenção Elétrica',
      status: 'completed',
      date: '2026-06-03',
      priority: 'high',
      description: 'Troca de disjuntor geral de 200A e balanceamento de fases no QGBT principal do 3º subsolo.',
      client_value: 3800,
      payment_status: 'paid',
      paid_date: '2026-06-05',
      paid_amount: 3800,
      client_signature: null,
      assigned_technician_id: 2,
      assigned_technician_name: 'Carlos Eduardo Mendes',
      assigned_technician_ids: [2],
      created_at: new Date('2026-06-03T08:30:00Z'),
    },
    {
      id: 'OS-2406-002',
      account_id: 1,
      user_id: 1,
      client_id: 2,
      client_name: 'Residencial Parque Verde',
      address: 'Rua das Flores, 88 — Bloco B — Campinas/SP',
      phone: '(19) 98741-3300',
      type: 'Instalação Elétrica',
      status: 'in_progress',
      date: '2026-06-06',
      priority: 'medium',
      description: 'Instalação de infraestrutura e fiação para 4 pontos de recarga de veículos elétricos.',
      client_value: 7200,
      payment_status: 'partial',
      paid_date: '2026-06-06',
      paid_amount: 3600,
      client_signature: null,
      assigned_technician_id: 2,
      assigned_technician_name: 'Carlos Eduardo Mendes',
      assigned_technician_ids: [2],
      created_at: new Date('2026-06-06T09:00:00Z'),
    },
    {
      id: 'OS-2406-003',
      account_id: 1,
      user_id: 1,
      client_id: 3,
      client_name: 'Mercado Bom Preço',
      address: 'Rua XV de Novembro, 220 — Santos/SP',
      phone: '(13) 97654-8800',
      type: 'Reparo Emergencial',
      status: 'completed',
      date: '2026-06-08',
      priority: 'urgent',
      description: 'Sobrecarga no circuito dos balcões refrigerados da área de laticínios.',
      client_value: 2400,
      payment_status: 'paid',
      paid_date: '2026-06-08',
      paid_amount: 2400,
      client_signature: null,
      assigned_technician_id: 1,
      assigned_technician_name: 'Lucas Qtech',
      assigned_technician_ids: [1],
      created_at: new Date('2026-06-08T07:15:00Z'),
    },
    {
      id: 'OS-2406-004',
      account_id: 1,
      user_id: 1,
      client_id: 4,
      client_name: 'Clínica São Lucas',
      address: 'Av. Dom Pedro I, 450 — Ribeirão Preto/SP',
      phone: '(16) 99123-5566',
      type: 'Manutenção Preventiva',
      status: 'pending',
      date: '2026-06-12',
      priority: 'medium',
      description: 'Revisão termográfica semestral dos quadros elétricos de comando da UTI e centro cirúrgico.',
      client_value: 4500,
      payment_status: 'pending',
      paid_date: null,
      paid_amount: null,
      client_signature: null,
      assigned_technician_id: 2,
      assigned_technician_name: 'Carlos Eduardo Mendes',
      assigned_technician_ids: [2],
      created_at: new Date('2026-06-09T11:00:00Z'),
    },
    {
      id: 'OS-2406-005',
      account_id: 1,
      user_id: 1,
      client_id: 5,
      client_name: 'Escola Estadual Tiradentes',
      address: 'Rua Independência, 300 — Sorocaba/SP',
      phone: '(15) 98900-1122',
      type: 'Instalação Elétrica',
      status: 'pending',
      date: '2026-06-15',
      priority: 'low',
      description: 'Adequação dos circuitos elétricos e instalação de 24 luminárias LED de sobrepor no novo laboratório.',
      client_value: 3100,
      payment_status: 'pending',
      paid_date: null,
      paid_amount: null,
      client_signature: null,
      assigned_technician_id: 1,
      assigned_technician_name: 'Lucas Qtech',
      assigned_technician_ids: [1],
      created_at: new Date('2026-06-10T14:30:00Z'),
    },
  ];

  const expenses = [
    { id: 'exp-1', account_id: 1, order_id: 'OS-2406-001', label: 'Disjuntor Siemens 200A 3P', amount: 480 },
    { id: 'exp-2', account_id: 1, order_id: 'OS-2406-001', label: 'Cabo cobre 70mm² (12m)', amount: 320 },
    { id: 'exp-3', account_id: 1, order_id: 'OS-2406-002', label: 'Cabo flexível 10mm² (80m)', amount: 760 },
    { id: 'exp-4', account_id: 1, order_id: 'OS-2406-002', label: 'Eletroduto galvanizado 1.1/2" e conexões', amount: 430 },
    { id: 'exp-5', account_id: 1, order_id: 'OS-2406-003', label: 'Contator tripolar 32A + relé térmico Schneider', amount: 390 },
  ];

  const attendances = [
    {
      id: 'att-1',
      account_id: 1,
      order_id: 'OS-2406-001',
      start_time: '2026-06-03T08:45:00Z',
      end_time: '2026-06-03T12:15:00Z',
      duration_seconds: 12600,
      description: 'Desenergização do QGBT, desmontagem do disjuntor danificado e instalação do novo componente.',
    },
    {
      id: 'att-2',
      account_id: 1,
      order_id: 'OS-2406-002',
      start_time: '2026-06-06T09:15:00Z',
      end_time: '2026-06-06T15:00:00Z',
      duration_seconds: 20700,
      description: 'Fixação dos eletrodutos na garagem subterrânea e passagem dos cabos até os 4 pontos de recarga.',
    },
  ];

  const order_payments = [
    { id: 'pay-1', account_id: 1, order_id: 'OS-2406-001', label: 'PIX à vista', amount: 3800, date: '2026-06-05', status: 'paid' },
    { id: 'pay-2', account_id: 1, order_id: 'OS-2406-002', label: '1ª Parcela - 50% Entrada', amount: 3600, date: '2026-06-06', status: 'paid' },
    { id: 'pay-3', account_id: 1, order_id: 'OS-2406-002', label: '2ª Parcela - Entrega', amount: 3600, date: '2026-06-20', status: 'pending' },
    { id: 'pay-4', account_id: 1, order_id: 'OS-2406-003', label: 'Boleto Bancário', amount: 2400, date: '2026-06-08', status: 'paid' },
  ];

  const company_profiles = [
    {
      id: 1,
      account_id: 1,
      legal_name: 'QTECNICO SERVICOS ELETRICOS LTDA',
      trade_name: 'QTecnico Soluções Elétricas',
      document: '33.123.456/0001-89',
      phone: '(11) 3344-5566',
      email: 'contato@qtecnico.com.br',
      whatsapp: '(11) 99000-1234',
      website: 'https://qtecnico.com.br',
      postal_code: '01310-100',
      address: 'Av. Paulista',
      number: '1000',
      complement: 'Conjunto 42',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      logo_key: '',
      description: 'Prestação de serviços técnicos especializados em engenharia elétrica e manutenção predial.',
      created_at: now,
      updated_at: now,
    },
  ];

  return {
    saas_plans: INITIAL_PLAN_CATALOG.map(([key, name, description, amount, features, limits]) => ({
      plan_key: key, name, description, amount, features: [...features], limits: { ...limits },
    })),
    accounts,
    users,
    clients,
    orders,
    expenses,
    attendances,
    attendance_photos: [],
    order_payments,
    company_profiles,
    auth_sessions: [],
    webauthn_challenges: [],
    webauthn_auth_challenges: [],
    webauthn_credentials: [],
    password_reset_tokens: [],
  };
}

export class MockPgPool {
  store: MockStore;
  private nextUserId = 3;
  private nextClientId = 6;

  constructor() {
    this.store = initMockStore();
  }

  on(event: string, _callback: any) {
    return this;
  }

  async connect() {
    return {
      query: (text: string, params?: any[]) => this.query(text, params),
      release: () => {},
    };
  }

  async query(text: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
    const raw = text.trim();
    const clean = raw.toLowerCase().replace(/\s+/g, ' ');

    // Transaction & DDL stubs
    if (
      clean.startsWith('begin') ||
      clean.startsWith('commit') ||
      clean.startsWith('rollback') ||
      clean.startsWith('create') ||
      clean.startsWith('alter') ||
      clean.startsWith('drop') ||
      clean.startsWith('do $$')
    ) {
      return { rows: [], rowCount: 0 };
    }

    // Regclass check
    if (clean.includes('to_regclass')) {
      return { rows: [{ table_name: 'public.accounts' }], rowCount: 1 };
    }

    // Integrity check
    if (clean.includes('(select count(*) from clients)')) {
      return {
        rows: [
          {
            clients: this.store.clients.length,
            orders: this.store.orders.length,
            expenses: this.store.expenses.length,
            attendances: this.store.attendances.length,
            payments: this.store.order_payments.length,
            photos: this.store.attendance_photos.length,
          },
        ],
        rowCount: 1,
      };
    }

    // --- SESSIONS ---
    if (clean.includes('into auth_rate_limits')) {
      return { rows: [{ count: 1, reset_at: new Date(Date.now() + 60000) }], rowCount: 1 };
    }

    if (clean.includes('from auth_sessions') && clean.includes('select user_id')) {
      const tokenHash = params[0];
      const session = this.store.auth_sessions.find(
        (s) => s.token_hash === tokenHash && !s.revoked_at && new Date(s.expires_at) > new Date()
      );
      return { rows: session ? [{ user_id: session.user_id }] : [], rowCount: session ? 1 : 0 };
    }

    if (clean.startsWith('insert into auth_sessions')) {
      const [userId, tokenHash, expiresAt] = params;
      this.store.auth_sessions.push({
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        revoked_at: null,
      });
      return { rows: [], rowCount: 1 };
    }

    if (clean.startsWith('update auth_sessions set revoked_at = now()')) {
      const tokenHash = params[0];
      const session = this.store.auth_sessions.find((s) => s.token_hash === tokenHash && !s.revoked_at);
      if (session) session.revoked_at = new Date();
      return { rows: [], rowCount: session ? 1 : 0 };
    }

    // Plano efetivo, com a mesma fonte usada pelo backend PostgreSQL.
    if (clean.includes('from accounts a left join saas_plans p on p.plan_key = a.plan_key')) {
      const accountId = clean.includes('(select account_id from users where id = $1)')
        ? this.store.users.find((u) => u.id === Number(params[0]))?.account_id
        : Number(params[0]);
      const account = this.store.accounts.find((a) => a.id === accountId);
      if (!account) return { rows: [], rowCount: 0 };
      const plan = this.store.saas_plans.find((p) => p.plan_key === account.plan_key);
      return { rows: [{ account_id: account.id, ...(plan || {}) }], rowCount: 1 };
    }

    // --- USERS ---
    if (clean.includes('from users') && clean.includes('lower(email) =')) {
      const email = String(params[0] || '').toLowerCase().trim();
      const user = this.store.users.find((u) => u.email.toLowerCase() === email);
      return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 };
    }

    if (clean.includes('from users') && clean.includes('email =')) {
      const email = String(params[0] || '').toLowerCase().trim();
      const user = this.store.users.find((u) => u.email.toLowerCase() === email);
      return { rows: user ? [{ id: user.id }] : [], rowCount: user ? 1 : 0 };
    }

    if (clean.includes('from users') && clean.includes('is_admin from users where id = $1')) {
      const userId = Number(params[0]);
      const user = this.store.users.find((u) => u.id === userId);
      return { rows: user ? [{ is_admin: user.is_admin }] : [], rowCount: user ? 1 : 0 };
    }

    if (clean.includes('from users') && clean.includes('select is_admin,account_id from users where id=$1')) {
      const userId = Number(params[0]);
      const user = this.store.users.find((u) => u.id === userId);
      return {
        rows: user ? [{ is_admin: Boolean(user.is_admin), account_id: user.account_id }] : [],
        rowCount: user ? 1 : 0,
      };
    }

    if (clean.includes('from users') && clean.includes('account_id from users where id = $1 and is_admin = true')) {
      const userId = Number(params[0]);
      const user = this.store.users.find((u) => u.id === userId && u.is_admin);
      return { rows: user ? [{ account_id: user.account_id }] : [], rowCount: user ? 1 : 0 };
    }

    if (clean.includes('from users') && clean.includes('select id, name, role, phone, email, photo_url, is_admin from users where id = $1')) {
      const userId = Number(params[0]);
      const user = this.store.users.find((u) => u.id === userId);
      return {
        rows: user
          ? [
              {
                id: user.id,
                name: user.name,
                role: user.role,
                phone: user.phone,
                email: user.email,
                photo_url: user.photo_url,
                is_admin: user.is_admin,
              },
            ]
          : [],
        rowCount: user ? 1 : 0,
      };
    }

    if (clean.includes('from users') && clean.includes('account_id=$1 and id=any($2)')) {
      const accountId = Number(params[0]);
      const ids: number[] = Array.isArray(params[1]) ? params[1] : [];
      const rows = this.store.users.filter((u) => u.account_id === accountId && ids.includes(Number(u.id)));
      return { rows, rowCount: rows.length };
    }

    if (clean === 'select count(*)::int as count from users where account_id = $1') {
      const count = this.store.users.filter((u) => u.account_id === Number(params[0])).length;
      return { rows: [{ count }], rowCount: 1 };
    }

    if (clean.includes('from users') && clean.includes('where account_id = $1')) {
      const accountId = Number(params[0]);
      const rows = this.store.users
        .filter((u) => u.account_id === accountId)
        .map((u) => ({
          id: u.id,
          name: u.name,
          role: u.role,
          phone: u.phone,
          email: u.email,
          is_admin: u.is_admin,
          created_at: u.created_at,
        }));
      return { rows, rowCount: rows.length };
    }

    if (clean.startsWith('insert into users')) {
      const id = this.nextUserId++;
      const name = params[0];
      const role = params[1];
      const phone = params[2];
      const email = params[3];
      const password_hash = params[4];
      const is_admin = params[5] === true || clean.includes('true');
      const account_id = params[6] ?? 1;

      const newUser = {
        id,
        name,
        role,
        phone,
        email,
        password_hash,
        is_admin,
        account_id,
        photo_url: null,
        created_at: new Date(),
      };
      this.store.users.push(newUser);
      return {
        rows: [
          {
            id: newUser.id,
            name: newUser.name,
            role: newUser.role,
            phone: newUser.phone,
            email: newUser.email,
            photo_url: newUser.photo_url,
            is_admin: newUser.is_admin,
          },
        ],
        rowCount: 1,
      };
    }

    if (clean.startsWith('update users set name=$1, phone=$2, email=$3, photo_url=$4')) {
      const [name, phone, email, photoUrl, id, accountId] = params;
      const user = this.store.users.find((u) => u.id === Number(id) && u.account_id === Number(accountId));
      if (user) {
        user.name = name;
        user.phone = phone;
        user.email = email;
        user.photo_url = photoUrl;
      }
      return { rows: [], rowCount: user ? 1 : 0 };
    }

    // --- ACCOUNTS & PLAN LIMITS ---
    if (clean.startsWith('insert into accounts')) {
      const id = this.store.accounts.length + 1;
      this.store.accounts.push({
        id,
        owner_user_id: null,
        plan_key: 'pro',
        subscription_status: 'active',
        created_at: new Date(),
      });
      return { rows: [{ id }], rowCount: 1 };
    }

    if (clean.startsWith('update accounts set owner_user_id = $1 where id = $2')) {
      const [ownerId, accountId] = params;
      const acc = this.store.accounts.find((a) => a.id === Number(accountId));
      if (acc) acc.owner_user_id = Number(ownerId);
      return { rows: [], rowCount: 1 };
    }

    // --- CLIENTS ---
    if (clean.includes('from clients') && clean.includes('order by c.name')) {
      const accountId = Number(params[0]);
      const rows = this.store.clients.filter((c) => c.account_id === accountId);
      return { rows, rowCount: rows.length };
    }

    if (clean.includes('from clients') && clean.includes('where id=$1 and account_id=$2')) {
      const [id, accountId] = params;
      const client = this.store.clients.find((c) => c.id === Number(id) && c.account_id === Number(accountId));
      return { rows: client ? [{ ...client }] : [], rowCount: client ? 1 : 0 };
    }

    if (clean.startsWith('insert into clients')) {
      const id = this.nextClientId++;
      const [accountId, userId, name, document, address, phone, email] = params;
      const client = {
        id,
        account_id: Number(accountId),
        user_id: Number(userId),
        name,
        document,
        address,
        phone,
        email,
        created_at: new Date(),
      };
      this.store.clients.push(client);
      return { rows: [{ id }], rowCount: 1 };
    }

    if (clean.startsWith('update clients set')) {
      const [name, document, address, phone, email, id, accountId] = params;
      const client = this.store.clients.find((c) => c.id === Number(id) && c.account_id === Number(accountId));
      if (client) {
        client.name = name;
        client.document = document;
        client.address = address;
        client.phone = phone;
        client.email = email;
      }
      return { rows: [], rowCount: client ? 1 : 0 };
    }

    if (clean.startsWith('delete from clients where id = $1 and account_id=$2')) {
      const [id, accountId] = params;
      const idx = this.store.clients.findIndex((c) => c.id === Number(id) && c.account_id === Number(accountId));
      if (idx !== -1) this.store.clients.splice(idx, 1);
      return { rows: [], rowCount: idx !== -1 ? 1 : 0 };
    }

    // --- ORDERS ---
    if (clean.includes('count(*)::int as count from orders o where o.account_id = $1')) {
      const accountId = Number(params[0]);
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const count = this.store.orders.filter((o) => o.account_id === accountId
        && new Date(o.created_at) >= start && new Date(o.created_at) < end).length;
      return { rows: [{ count }], rowCount: 1 };
    }

    if (clean.includes('from orders o') && clean.includes('order by o.created_at desc')) {
      const accountId = Number(params[0]);
      const rows = this.store.orders.filter((o) => o.account_id === accountId);
      return { rows, rowCount: rows.length };
    }

    if (clean.includes('from orders o where o.id=$1 and o.account_id=$2')) {
      const [id, accountId] = params;
      const order = this.store.orders.find((o) => o.id === String(id) && o.account_id === Number(accountId));
      return { rows: order ? [{ ...order }] : [], rowCount: order ? 1 : 0 };
    }

    if (clean.includes('select client_signature from orders where id=$1 and account_id=$2')) {
      const [id, accountId] = params;
      const order = this.store.orders.find((o) => o.id === String(id) && o.account_id === Number(accountId));
      return { rows: order ? [{ client_signature: order.client_signature }] : [], rowCount: order ? 1 : 0 };
    }

    if (clean.startsWith('insert into orders')) {
      const [
        id,
        account_id,
        user_id,
        client_id,
        client_name,
        address,
        phone,
        type,
        status,
        date,
        priority,
        description,
        client_value,
        payment_status,
        paid_date,
        paid_amount,
        client_signature,
        assigned_technician_id,
        assigned_technician_name,
        assigned_technician_ids,
      ] = params;

      this.store.orders.unshift({
        id,
        account_id: Number(account_id),
        user_id: Number(user_id),
        client_id: client_id ? Number(client_id) : null,
        client_name,
        address,
        phone,
        type,
        status: status || 'pending',
        date,
        priority: priority || 'medium',
        description,
        client_value: Number(client_value) || 0,
        payment_status: payment_status || 'pending',
        paid_date: paid_date || null,
        paid_amount: paid_amount != null ? Number(paid_amount) : null,
        client_signature: client_signature || null,
        assigned_technician_id: assigned_technician_id ? Number(assigned_technician_id) : null,
        assigned_technician_name: assigned_technician_name || null,
        assigned_technician_ids: Array.isArray(assigned_technician_ids) ? assigned_technician_ids : [],
        created_at: new Date(),
      });
      return { rows: [], rowCount: 1 };
    }

    if (clean.startsWith('update orders set')) {
      const [
        client_id,
        client_name,
        address,
        phone,
        type,
        status,
        date,
        priority,
        description,
        client_value,
        payment_status,
        paid_date,
        paid_amount,
        client_signature,
        assigned_technician_id,
        assigned_technician_name,
        assigned_technician_ids,
        id,
        account_id,
      ] = params;

      const order = this.store.orders.find((o) => o.id === String(id) && o.account_id === Number(account_id));
      if (order) {
        order.client_id = client_id;
        order.client_name = client_name;
        order.address = address;
        order.phone = phone;
        order.type = type;
        order.status = status;
        order.date = date;
        order.priority = priority;
        order.description = description;
        order.client_value = client_value;
        order.payment_status = payment_status;
        order.paid_date = paid_date;
        order.paid_amount = paid_amount;
        order.client_signature = client_signature;
        order.assigned_technician_id = assigned_technician_id;
        order.assigned_technician_name = assigned_technician_name;
        order.assigned_technician_ids = assigned_technician_ids;
      }
      return { rows: [], rowCount: order ? 1 : 0 };
    }

    if (clean.startsWith('delete from orders where id=$1 and account_id=$2')) {
      const [id, accountId] = params;
      const idx = this.store.orders.findIndex((o) => o.id === String(id) && o.account_id === Number(accountId));
      if (idx !== -1) {
        this.store.orders.splice(idx, 1);
        this.store.expenses = this.store.expenses.filter((e) => e.order_id !== String(id));
        this.store.order_payments = this.store.order_payments.filter((p) => p.order_id !== String(id));
        this.store.attendances = this.store.attendances.filter((a) => a.order_id !== String(id));
      }
      return { rows: [], rowCount: idx !== -1 ? 1 : 0 };
    }

    // --- EXPENSES ---
    if (clean.includes('from expenses') && clean.includes('order_id=any($2)')) {
      const accountId = Number(params[0]);
      const orderIds = params[1] || [];
      const rows = this.store.expenses.filter((e) => e.account_id === accountId && orderIds.includes(e.order_id));
      return { rows, rowCount: rows.length };
    }

    if (clean.startsWith('insert into expenses')) {
      const [id, account_id, order_id, label, amount] = params;
      this.store.expenses.push({
        id,
        account_id: Number(account_id),
        order_id,
        label,
        amount: Number(amount) || 0,
      });
      return { rows: [], rowCount: 1 };
    }

    if (clean.startsWith('delete from expenses where order_id=$1 and account_id=$2')) {
      const [orderId, accountId] = params;
      this.store.expenses = this.store.expenses.filter((e) => !(e.order_id === String(orderId) && e.account_id === Number(accountId)));
      return { rows: [], rowCount: 1 };
    }

    // --- ATTENDANCES ---
    if (clean.includes('from attendances') && clean.includes('order_id=any($2)')) {
      const accountId = Number(params[0]);
      const orderIds = params[1] || [];
      const rows = this.store.attendances.filter((a) => a.account_id === accountId && orderIds.includes(a.order_id));
      return { rows, rowCount: rows.length };
    }

    if (clean.startsWith('insert into attendances')) {
      const [id, account_id, order_id, start_time, end_time, duration_seconds, description] = params;
      this.store.attendances.push({
        id,
        account_id: Number(account_id),
        order_id,
        start_time,
        end_time,
        duration_seconds: Number(duration_seconds) || 0,
        description,
      });
      return { rows: [], rowCount: 1 };
    }

    if (clean.startsWith('delete from attendances where order_id=$1 and account_id=$2')) {
      const [orderId, accountId] = params;
      this.store.attendances = this.store.attendances.filter((a) => !(a.order_id === String(orderId) && a.account_id === Number(accountId)));
      return { rows: [], rowCount: 1 };
    }

    // --- ATTENDANCE PHOTOS ---
    if (clean.includes('from attendance_photos') && clean.includes('attendance_id=any($2)')) {
      const accountId = Number(params[0]);
      const attIds = params[1] || [];
      const rows = this.store.attendance_photos.filter((p) => p.account_id === accountId && attIds.includes(p.attendance_id));
      return { rows, rowCount: rows.length };
    }

    if (clean.startsWith('insert into attendance_photos')) {
      const [id, account_id, attendance_id, data_url, name] = params;
      this.store.attendance_photos.push({
        id,
        account_id: Number(account_id),
        attendance_id,
        data_url,
        name,
      });
      return { rows: [], rowCount: 1 };
    }

    if (clean.includes('delete from attendance_photos')) {
      return { rows: [], rowCount: 1 };
    }

    // --- PAYMENTS ---
    if (clean.includes('from order_payments') && clean.includes('order_id=any($2)')) {
      const accountId = Number(params[0]);
      const orderIds = params[1] || [];
      const rows = this.store.order_payments.filter((p) => p.account_id === accountId && orderIds.includes(p.order_id));
      return { rows, rowCount: rows.length };
    }

    if (clean.startsWith('insert into order_payments')) {
      const [id, account_id, order_id, label, amount, date, status] = params;
      this.store.order_payments.push({
        id,
        account_id: Number(account_id),
        order_id,
        label,
        amount: Number(amount) || 0,
        date,
        status: status || 'pending',
      });
      return { rows: [], rowCount: 1 };
    }

    if (clean.startsWith('delete from order_payments where order_id=$1 and account_id=$2')) {
      const [orderId, accountId] = params;
      this.store.order_payments = this.store.order_payments.filter((p) => !(p.order_id === String(orderId) && p.account_id === Number(accountId)));
      return { rows: [], rowCount: 1 };
    }

    // --- COMPANY PROFILES ---
    if (clean.includes('from company_profiles where account_id = $1')) {
      const accountId = Number(params[0]);
      const profile = this.store.company_profiles.find((p) => p.account_id === accountId) || this.store.company_profiles[0];
      return { rows: profile ? [{ ...profile }] : [], rowCount: profile ? 1 : 0 };
    }

    if (clean.startsWith('insert into company_profiles')) {
      const [
        accountId,
        legalName,
        tradeName,
        document,
        phone,
        email,
        whatsapp,
        website,
        postalCode,
        address,
        number,
        complement,
        neighborhood,
        city,
        state,
        description,
      ] = params;

      let profile = this.store.company_profiles.find((p) => p.account_id === Number(accountId));
      if (!profile) {
        profile = {
          id: this.store.company_profiles.length + 1,
          account_id: Number(accountId),
          legal_name: legalName || '',
          trade_name: tradeName || '',
          document: document || '',
          phone: phone || '',
          email: email || '',
          whatsapp: whatsapp || '',
          website: website || '',
          postal_code: postalCode || '',
          address: address || '',
          number: number || '',
          complement: complement || '',
          neighborhood: neighborhood || '',
          city: city || '',
          state: state || '',
          logo_key: '',
          description: description || '',
          created_at: new Date(),
          updated_at: new Date(),
        };
        this.store.company_profiles.push(profile);
      } else {
        Object.assign(profile, {
          legal_name: legalName,
          trade_name: tradeName,
          document,
          phone,
          email,
          whatsapp,
          website,
          postal_code: postalCode,
          address,
          number,
          complement,
          neighborhood,
          city,
          state,
          description,
          updated_at: new Date(),
        });
      }
      return { rows: [], rowCount: 1 };
    }

    // --- DASHBOARD SUMMARY ---
    if (clean.includes('count(*) filter (where o.status =') || clean.includes('coalesce(sum(o.client_value), 0)::numeric as revenue')) {
      const total = this.store.orders.length;
      const pending = this.store.orders.filter((o) => o.status === 'pending').length;
      const in_progress = this.store.orders.filter((o) => o.status === 'in_progress').length;
      const completed = this.store.orders.filter((o) => o.status === 'completed').length;
      const cancelled = this.store.orders.filter((o) => o.status === 'cancelled').length;
      const revenue = this.store.orders.reduce((acc, o) => acc + (Number(o.client_value) || 0), 0);
      const paid = this.store.order_payments
        .filter((p) => p.status === 'paid')
        .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
      const costs = this.store.expenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

      return {
        rows: [
          {
            total,
            pending,
            in_progress,
            completed,
            cancelled,
            revenue,
            paid,
            costs,
          },
        ],
        rowCount: 1,
      };
    }

    if (clean.includes("to_char(date_trunc('month', o.date), 'yyyy-mm') as month")) {
      const monthsMap = new Map<string, { revenue: number; orders: number }>();
      for (const o of this.store.orders) {
        const m = String(o.date).slice(0, 7) || '2026-06';
        const curr = monthsMap.get(m) || { revenue: 0, orders: 0 };
        curr.revenue += Number(o.client_value) || 0;
        curr.orders += 1;
        monthsMap.set(m, curr);
      }
      const rows = Array.from(monthsMap.entries()).map(([month, data]) => ({
        month,
        revenue: data.revenue,
        orders: data.orders,
      }));
      return { rows, rowCount: rows.length };
    }

    if (clean.includes('select u.id, u.name') && clean.includes('count(o.id) filter (where o.status = \'completed\')')) {
      const techUsers = this.store.users.filter((u) => !u.is_admin);
      const rows = techUsers.map((u) => {
        const userOrders = this.store.orders.filter((o) => o.assigned_technician_id === u.id);
        const completed = userOrders.filter((o) => o.status === 'completed').length;
        const revenue = userOrders.reduce((acc, o) => acc + (Number(o.client_value) || 0), 0);
        return {
          id: u.id,
          name: u.name,
          orders: userOrders.length,
          completed,
          revenue,
        };
      });
      return { rows, rowCount: rows.length };
    }

    if (clean.includes('select count(*)::int as total') && clean.includes('from clients c')) {
      return {
        rows: [{ total: this.store.clients.length, new_this_month: this.store.clients.length }],
        rowCount: 1,
      };
    }

    if (clean.includes('select o.id, o.client_name as client') && clean.includes('from orders o')) {
      const rows = this.store.orders.slice(0, 8).map((o) => ({
        id: o.id,
        client: o.client_name,
        type: o.type,
        status: o.status,
        date: o.date,
        value: o.client_value,
        technician: o.assigned_technician_name,
      }));
      return { rows, rowCount: rows.length };
    }

    // Default fallback
    return { rows: [], rowCount: 0 };
  }
}
