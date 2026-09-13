import type { ServiceOrder, Client } from './types';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';

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
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  let body: any = null;
  if (text && contentType.includes('application/json')) {
    body = JSON.parse(text);
  }
  if (!res.ok) {
    throw new Error(body?.error || (contentType.includes('text/html')
      ? 'O servidor retornou uma página HTML em vez de uma resposta da API'
      : 'Erro na requisição'));
  }
  if (!body) throw new Error('A API retornou uma resposta inválida');
  return body as T;
}

export interface UserProfile {
  id: number;
  name: string;
  role: string;
  phone: string;
  email: string;
  isAdmin?: boolean;
  photoUrl?: string | null;
}

export interface TeamMember {
  id: number;
  name: string;
  role: string;
  phone: string;
  email: string;
  isAdmin: boolean;
  createdAt?: string;
}

export const api = {
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

  requestPasswordReset: (email: string) =>
    request<{ exists: boolean; resetToken: string }>('/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (resetToken: string, password: string) =>
    request<{ success: boolean }>('/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({ resetToken, password }),
    }),

  webauthnRegisterOptions: () =>
    request<PublicKeyCredentialCreationOptionsJSON>('/auth/webauthn/register/options', { method: 'POST' }),

  webauthnRegisterVerify: (response: RegistrationResponseJSON) =>
    request<{ success: boolean }>('/auth/webauthn/register/verify', {
      method: 'POST',
      body: JSON.stringify(response),
    }),

  webauthnAuthenticationOptions: (email: string) =>
    request<PublicKeyCredentialRequestOptionsJSON>('/auth/webauthn/authenticate/options', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  webauthnAuthenticationVerify: (response: AuthenticationResponseJSON) =>
    request<{ token: string; user: UserProfile }>('/auth/webauthn/authenticate/verify', {
      method: 'POST',
      body: JSON.stringify(response),
    }),

  getMe: () => request<UserProfile>('/users/me'),
  getAdminAccess: () => request<{ allowed: boolean }>('/users/admin/access'),
  getTeam: () => request<TeamMember[]>('/users/admin/team'),
  createTeamMember: (data: { name: string; email: string; password: string; phone: string; role: string }) =>
    request<TeamMember>('/users/admin/team', { method: 'POST', body: JSON.stringify(data) }),
  deleteTeamMember: (id: number) =>
    request<{ success: boolean }>(`/users/admin/team/${id}`, { method: 'DELETE' }),

  updateProfile: (data: Omit<UserProfile, 'id'>) =>
    request<UserProfile>('/users/me', { method: 'PUT', body: JSON.stringify(data) }),

  getOrders: () => request<ServiceOrder[]>('/orders'),
  createOrder: (order: ServiceOrder) =>
    request<ServiceOrder>('/orders', { method: 'POST', body: JSON.stringify(order) }),
  updateOrder: (id: string, order: Partial<ServiceOrder>) =>
    request<ServiceOrder>(`/orders/${id}`, { method: 'PUT', body: JSON.stringify(order) }),
  deleteOrder: (id: string) =>
    request<{ success: boolean }>(`/orders/${id}`, { method: 'DELETE' }),

  getClients: () => request<Client[]>('/clients'),
  createClient: (client: Client) =>
    request<Client>('/clients', { method: 'POST', body: JSON.stringify(client) }),
  updateClient: (id: string, client: Partial<Client>) =>
    request<Client>(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(client) }),
  deleteClient: (id: string) =>
    request<{ success: boolean }>(`/clients/${id}`, { method: 'DELETE' }),
};
