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

export interface UserProfile {
  id: number;
  name: string;
  role: string;
  phone: string;
  email: string;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: UserProfile }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
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
};
