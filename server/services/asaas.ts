const DEFAULT_SANDBOX_URL = 'https://api-sandbox.asaas.com/v3';
const DEFAULT_PRODUCTION_URL = 'https://api.asaas.com/v3';

export type AsaasEnvironment = 'sandbox' | 'production';

function getEnvironment(): AsaasEnvironment {
  return process.env.PAYMENT_ENV === 'production' ? 'production' : 'sandbox';
}

function getBaseUrl(): string {
  const environment = getEnvironment();
  const configured = String(process.env.ASAAS_API_URL || '').trim().replace(/\/$/, '');
  const expected = environment === 'production' ? DEFAULT_PRODUCTION_URL : DEFAULT_SANDBOX_URL;
  if (configured) {
    if (environment === 'sandbox' && !configured.startsWith(DEFAULT_SANDBOX_URL)) throw new Error('ASAAS_API_URL incompatível com PAYMENT_ENV=sandbox.');
    if (environment === 'production' && !configured.startsWith(DEFAULT_PRODUCTION_URL)) throw new Error('ASAAS_API_URL incompatível com PAYMENT_ENV=production.');
    return configured;
  }
  return expected;
}

function getApiKey(): string {
  const key = String(process.env.ASAAS_API_KEY || '').trim();
  if (!key) throw new Error('ASAAS_API_KEY não configurada.');
  const environment = getEnvironment();
  if (environment === 'sandbox' && !key.startsWith('$aact_hmlg_')) throw new Error('ASAAS_API_KEY não parece ser uma chave Sandbox.');
  if (environment === 'production' && !key.startsWith('$aact_prod_')) throw new Error('ASAAS_API_KEY não parece ser uma chave de Produção.');
  return key;
}

export async function asaasRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${getBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  headers.set('access_token', getApiKey());
  headers.set('Content-Type', 'application/json');
  headers.set('User-Agent', `QTECNICO/1.0 (${getEnvironment()})`);
  const response = await fetch(url, { ...init, headers });
  const text = await response.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!response.ok) {
    const detail = typeof body === 'object' && body && 'errors' in body ? JSON.stringify((body as { errors?: unknown }).errors) : response.statusText;
    throw new Error(`Asaas ${response.status}: ${detail}`);
  }
  return body as T;
}

export async function getAsaasStatus() {
  const environment = getEnvironment();
  const accountStatus = await asaasRequest<{ commercialInfo?: string; bankAccountInfo?: string; documentation?: string; general?: string }>('/myAccount/status/');
  return { environment, baseUrl: getBaseUrl(), authenticated: true, accountStatus };
}

export async function createAsaasCustomer(input: { name: string; cpfCnpj?: string; email?: string; mobilePhone?: string; externalReference?: string }) {
  return asaasRequest('/customers', { method: 'POST', body: JSON.stringify({ ...input, notificationDisabled: true }) });
}

export async function createAsaasPayment(input: { customer: string; billingType: 'BOLETO' | 'PIX' | 'CREDIT_CARD' | 'UNDEFINED'; value: number; dueDate: string; description?: string; externalReference?: string }) {
  return asaasRequest('/payments', { method: 'POST', body: JSON.stringify(input) });
}

export async function createAsaasSubscription(input: { customer: string; billingType: 'BOLETO' | 'PIX' | 'CREDIT_CARD' | 'UNDEFINED'; value: number; nextDueDate: string; cycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY'; description?: string; externalReference?: string }) {
  return asaasRequest('/subscriptions', { method: 'POST', body: JSON.stringify(input) });
}

export async function getAsaasSubscription(subscriptionId: string) {
  return asaasRequest<any>(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

export async function getAsaasSubscriptionPayments(subscriptionId: string) {
  return asaasRequest<{ object?: string; hasMore?: boolean; totalCount?: number; limit?: number; offset?: number; data?: any[] }>(`/subscriptions/${encodeURIComponent(subscriptionId)}/payments`);
}

export function getAsaasEnvironment() {
  return getEnvironment();
}
