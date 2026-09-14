import type { ServiceOrder, Client } from './types';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';

const BASE = '/api';

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|; )qtecnico_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  const res = await fetch(`${BASE}${path}`, { ...options, credentials: 'include', headers });
  if (res.status === 401) window.dispatchEvent(new CustomEvent('qtecnico-session-expired'));
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  let body: any = null;
  if (text && contentType.includes('application/json')) body = JSON.parse(text);
  if (!res.ok) throw new Error(body?.error || (contentType.includes('text/html') ? 'O servidor retornou uma página HTML em vez de uma resposta da API' : 'Erro na requisição'));
  if (!body) throw new Error('A API retornou uma resposta inválida');
  return body as T;
}

async function uploadFile<T>(file: File, folder: 'attendances' | 'signatures' | 'profiles' = 'attendances'): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  form.append('folder', folder);
  const headers: Record<string, string> = {};
  const csrf = getCsrfToken();
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const res = await fetch(`${BASE}/uploads`, { method: 'POST', body: form, credentials: 'include', headers });
  if (res.status === 401) window.dispatchEvent(new CustomEvent('qtecnico-session-expired'));
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || 'Erro ao enviar imagem');
  return body as T;
}

function notifyAuthenticated() {
  window.dispatchEvent(new CustomEvent('qtecnico-authenticated'));
}

export interface UserProfile {
  id: number; name: string; role: string; phone: string; email: string; isAdmin?: boolean; photoUrl?: string | null;
}
export interface TeamMember {
  id: number; name: string; role: string; phone: string; email: string; isAdmin: boolean; createdAt?: string;
}
export interface CompanyProfileData {
  id: number; legalName: string; tradeName: string; document: string; phone: string; whatsapp: string;
  email: string; website: string; postalCode: string; address: string; number: string; complement: string;
  neighborhood: string; city: string; state: string; logoKey: string; description: string; updatedAt?: string;
}

type AuthResponse = { user: UserProfile; token?: never };

export const api = {
  login: async (email: string, password: string) => {
    const result = await request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    notifyAuthenticated();
    return result;
  },
  register: async (name: string, email: string, password: string) => {
    const result = await request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    notifyAuthenticated();
    return result;
  },
  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  requestPasswordReset: (email: string) => request<{ message: string }>('/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (email: string, code: string, password: string) => request<{ success: boolean }>('/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ email, code, password }) }),
  webauthnRegisterOptions: () => request<PublicKeyCredentialCreationOptionsJSON>('/auth/webauthn/register/options', { method: 'POST' }),
  webauthnRegisterVerify: (response: RegistrationResponseJSON) => request<{ success: boolean }>('/auth/webauthn/register/verify', { method: 'POST', body: JSON.stringify(response) }),
  webauthnAuthenticationOptions: (email?: string) => request<PublicKeyCredentialRequestOptionsJSON>('/auth/webauthn/authenticate/options', { method: 'POST', body: JSON.stringify(email?.trim() ? { email: email.trim() } : {}) }),
  webauthnAuthenticationVerify: async (response: AuthenticationResponseJSON) => {
    const result = await request<AuthResponse>('/auth/webauthn/authenticate/verify', { method: 'POST', body: JSON.stringify(response) });
    notifyAuthenticated();
    return result;
  },
  getMe: () => request<UserProfile>('/users/me'),
  getAdminAccess: () => request<{ allowed: boolean }>('/users/admin/access'),
  getTeam: () => request<TeamMember[]>('/users/admin/team'),
  createTeamMember: (data: { name: string; email: string; password: string; phone: string; role: string }) => request<TeamMember>('/users/admin/team', { method: 'POST', body: JSON.stringify(data) }),
  deleteTeamMember: (id: number) => request<{ success: boolean }>(`/users/admin/team/${id}`, { method: 'DELETE' }),
  updateProfile: (data: Omit<UserProfile, 'id'>) => request<UserProfile>('/users/me', { method: 'PUT', body: JSON.stringify(data) }),
  getCompanyProfile: () => request<CompanyProfileData | null>('/users/admin/company-profile'),
  updateCompanyProfile: (data: CompanyProfileData) => request<CompanyProfileData>('/users/admin/company-profile', { method: 'PUT', body: JSON.stringify(data) }),
  uploadPhoto: (file: File, folder: 'attendances' | 'signatures' | 'profiles' = 'attendances') => uploadFile<{ key: string; url: string }>(file, folder),
  addAttendancePhoto: (orderId: string, attendanceId: string, file: File) => uploadFile<{ key: string; url: string }>(file, 'attendances').then(({ key, url }) => request<{ photo: { id: string; key: string; dataUrl: string; name: string } }>(`/orders/${encodeURIComponent(orderId)}/attendances/${encodeURIComponent(attendanceId)}/photos`, { method: 'POST', body: JSON.stringify({ key, url, name: file.name }) })),
  deleteAttendancePhoto: (orderId: string, attendanceId: string, photoId: string) => request<{ success: boolean }>(`/orders/${encodeURIComponent(orderId)}/attendances/${encodeURIComponent(attendanceId)}/photos/${encodeURIComponent(photoId)}`, { method: 'DELETE' }),
  getOrders: () => request<ServiceOrder[]>('/orders'),
  createOrder: (order: ServiceOrder) => request<ServiceOrder>('/orders', { method: 'POST', body: JSON.stringify(order) }),
  updateOrder: (id: string, order: Partial<ServiceOrder>) => request<ServiceOrder>(`/orders/${id}`, { method: 'PUT', body: JSON.stringify(order) }),
  deleteOrder: (id: string) => request<{ success: boolean }>(`/orders/${id}`, { method: 'DELETE' }),
  getClients: () => request<Client[]>('/clients'),
  createClient: (client: Client) => request<Client>('/clients', { method: 'POST', body: JSON.stringify(client) }),
  updateClient: (id: string, client: Partial<Client>) => request<Client>(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(client) }),
  deleteClient: (id: string) => request<{ success: boolean }>(`/clients/${id}`, { method: 'DELETE' }),
};