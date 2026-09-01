import type { ServiceOrder, Client } from './types';

const BASE = '/api';

function getToken() {
  return localStorage.getItem('qtecnico_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error || 'Erro na requisição');
  }
  return res.json();
}

export interface UploadResult {
  /** Chave do objeto no bucket — persistir isso no banco (via createOrder/updateOrder/updateProfile). */
  key: string;
  /** URL assinada, temporária (1h) — só para exibir a prévia agora, nunca guardar isolada. */
  url: string;
}

async function uploadFile(file: File, folder: string): Promise<UploadResult> {
  const token = getToken();
  const form = new FormData();
  form.append('file', file);
  form.append('folder', folder);

  const res = await fetch(`${BASE}/uploads`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Sem Content-Type manual: o navegador define o boundary correto do multipart.
    },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro no upload' }));
    throw new Error(err.error || 'Erro no upload');
  }
  return res.json();
}

export interface UserProfile {
  id: number;
  name: string;
  role: string;
  phone: string;
  email: string;
  /** URL assinada e temporária, só para exibição — nunca persistir isolada. */
  photoUrl?: string | null;
  /** Chave do objeto no bucket privado — é o que deve ser enviado ao salvar. */
  photoKey?: string | null;
}

export const api = {
  uploadPhoto: (file: File, folder: 'attendances' | 'signatures' | 'profiles' = 'attendances') =>
    uploadFile(file, folder),

  getAccount: () => request('/account'),

  login: (email: string, password: string) =>
    request<{ token: string; user: UserProfile }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (name: string, email: string, password: string) =>
    request<{ token: string; user: UserProfile }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  forgotPassword: (email: string) =>
    request<{ ok: boolean; message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (email: string, code: string, password: string) =>
    request<{ ok: boolean; message: string }>('/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({ email, code, password }),
    }),

  getMe: () => request<UserProfile>('/users/me'),

  updateProfile: (data: Omit<UserProfile, 'id'>) =>
    request<UserProfile>('/users/me', { method: 'PUT', body: JSON.stringify(data) }),

  getOrders: () => request<ServiceOrder[]>('/orders'),

  createOrder: (o: ServiceOrder) =>
    request<ServiceOrder>('/orders', { method: 'POST', body: JSON.stringify(o) }),

  updateOrder: (o: ServiceOrder) =>
    request<ServiceOrder>(`/orders/${o.id}`, { method: 'PUT', body: JSON.stringify(o) }),

  deleteOrder: (id: string) =>
    request<{ success: boolean }>(`/orders/${id}`, { method: 'DELETE' }),

  getClients: () => request<Client[]>('/clients'),

  createClient: (c: Client) =>
    request<Client>('/clients', { method: 'POST', body: JSON.stringify(c) }),

  updateClient: (c: Client) =>
    request<Client>(`/clients/${c.id}`, { method: 'PUT', body: JSON.stringify(c) }),

  deleteClient: (id: string) =>
    request<{ success: boolean }>(`/clients/${id}`, { method: 'DELETE' }),

  // ── WebAuthn / Biometria ────────────────────────────────────────────────

  webauthn: {
    /** Opções para registrar uma nova credencial biométrica (requer JWT). */
    registerOptions: () =>
      request<Record<string, unknown>>('/auth/webauthn/register/options', { method: 'POST' }),

    /** Envia a resposta do authenticator para verificação (requer JWT). */
    registerVerify: (response: unknown) =>
      request<{ verified: boolean }>('/auth/webauthn/register/verify', {
        method: 'POST',
        body: JSON.stringify(response),
      }),

    /** Opções para autenticar via biometria (não requer JWT). */
    authenticateOptions: (email: string) =>
      request<Record<string, unknown> & { userId: number }>('/auth/webauthn/authenticate/options', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),

    /** Envia a resposta do authenticator → devolve token JWT. */
    authenticateVerify: (userId: number, response: unknown) =>
      request<{ token: string; user: UserProfile }>('/auth/webauthn/authenticate/verify', {
        method: 'POST',
        body: JSON.stringify({ userId, response }),
      }),

    /** Lista credenciais cadastradas no dispositivo (requer JWT). */
    listCredentials: () =>
      request<{ id: string; device_type: string; created_at: string; last_used_at: string | null }[]>(
        '/auth/webauthn/credentials',
      ),

    /** Remove uma credencial pelo id (requer JWT). */
    deleteCredential: (id: string) =>
      request<{ success: boolean }>(`/auth/webauthn/credentials/${id}`, { method: 'DELETE' }),
  },
};
