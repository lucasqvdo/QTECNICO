import { deleteOffline, getAllOffline, getOffline, putOffline, OFFLINE_STORES } from "./offlineDb";

const originalFetch = window.fetch.bind(window);
const ORDER_PATH = /^\/api\/orders(?:\/([^/]+))?$/;
const CLIENTS_PATH = "/api/clients";
const ME_PATH = "/api/users/me";

function networkRequest(resource: RequestInfo | URL, init?: RequestInit) {
  return originalFetch(resource, init);
}

function isNetworkFailure(error: unknown) {
  return error instanceof TypeError || !navigator.onLine;
}

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|; )qtecnico_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function cacheOrders(orders: any[]) {
  await Promise.all(orders.filter((order) => order && order.id != null).map((order) => putOffline(OFFLINE_STORES.serviceOrders, { ...order, id: String(order.id), updatedAt: new Date().toISOString() })));
}

async function cachedOrders() {
  const orders = await getAllOffline<any>(OFFLINE_STORES.serviceOrders);
  return orders.map(({ updatedAt: _updatedAt, ...order }) => order);
}

async function queueOrderChange(id: string, action: "update" | "create", payload: any) {
  const queueId = `${action}:order:${id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  await putOffline(OFFLINE_STORES.syncQueue, { id: queueId, entity: "service_order", entityId: id, action, payload, status: "pending", createdAt: new Date().toISOString() });
}

async function handleOfflineOrderUpdate(orderId: string, init?: RequestInit) {
  const cached = await getOffline<any>(OFFLINE_STORES.serviceOrders, orderId);
  if (!cached) throw new Error("Esta OS ainda não foi armazenada no dispositivo.");
  let patch: any = {};
  if (typeof init?.body === "string") {
    try { patch = JSON.parse(init.body); } catch { patch = {}; }
  }
  const merged = { ...cached, ...patch, id: orderId, updatedAt: new Date().toISOString(), offlinePendingSync: true };
  await putOffline(OFFLINE_STORES.serviceOrders, merged);
  await queueOrderChange(orderId, "update", patch);
  return new Response(JSON.stringify(merged), { status: 200, headers: { "Content-Type": "application/json", "X-QTecnico-Offline": "true" } });
}

async function handleOfflineOrderList() {
  const orders = await cachedOrders();
  if (!orders.length) throw new Error("Nenhuma OS disponível offline neste dispositivo.");
  return new Response(JSON.stringify(orders), { status: 200, headers: { "Content-Type": "application/json", "X-QTecnico-Offline": "true" } });
}

async function handleOfflineClients() {
  const clients = await getAllOffline<any>(OFFLINE_STORES.clients);
  return new Response(JSON.stringify(clients), { status: 200, headers: { "Content-Type": "application/json", "X-QTecnico-Offline": "true" } });
}

async function handleOfflineMe() {
  const user = await getOffline<any>(OFFLINE_STORES.metadata, "current_user");
  if (!user) throw new Error("Sessão offline não disponível neste dispositivo.");
  return new Response(JSON.stringify(user), { status: 200, headers: { "Content-Type": "application/json", "X-QTecnico-Offline": "true" } });
}

async function flushOrderQueue() {
  if (!navigator.onLine) return;
  const queue = await getAllOffline<any>(OFFLINE_STORES.syncQueue);
  const pending = queue.filter((item) => item?.status === "pending" && item?.entity === "service_order" && item?.action === "update").sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  for (const item of pending) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const csrf = getCsrfToken();
      if (csrf) headers["X-CSRF-Token"] = csrf;
      const response = await originalFetch(`/api/orders/${encodeURIComponent(String(item.entityId))}`, { method: "PUT", credentials: "include", headers, body: JSON.stringify(item.payload ?? {}) });
      if (!response.ok) break;
      const saved = await response.clone().json().catch(() => null);
      if (saved?.id != null) await putOffline(OFFLINE_STORES.serviceOrders, { ...saved, id: String(saved.id), updatedAt: new Date().toISOString(), offlinePendingSync: false });
      await deleteOffline(OFFLINE_STORES.syncQueue, item.id);
    } catch {
      break;
    }
  }
}

export function installOfflineFetchLayer() {
  window.fetch = async (resource: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = resource instanceof Request ? resource : new Request(resource, init);
    const url = new URL(request.url, window.location.origin);
    const method = request.method.toUpperCase();
    if (url.origin !== window.location.origin) return networkRequest(resource, init);
    const orderMatch = ORDER_PATH.exec(url.pathname);

    if (method === "GET" && orderMatch) {
      try {
        const response = await networkRequest(resource, init);
        if (response.ok) {
          const data = await response.clone().json().catch(() => null);
          if (Array.isArray(data)) await cacheOrders(data);
        }
        return response;
      } catch (error) {
        if (!isNetworkFailure(error)) throw error;
        return handleOfflineOrderList();
      }
    }

    if (method === "PUT" && orderMatch?.[1]) {
      try { return await networkRequest(resource, init); }
      catch (error) {
        if (!isNetworkFailure(error)) throw error;
        return handleOfflineOrderUpdate(decodeURIComponent(orderMatch[1]), init);
      }
    }

    if (method === "GET" && url.pathname === CLIENTS_PATH) {
      try {
        const response = await networkRequest(resource, init);
        if (response.ok) {
          const data = await response.clone().json().catch(() => null);
          if (Array.isArray(data)) await Promise.all(data.filter((client) => client?.id != null).map((client) => putOffline(OFFLINE_STORES.clients, { ...client, id: String(client.id), updatedAt: new Date().toISOString() })));
        }
        return response;
      } catch (error) {
        if (!isNetworkFailure(error)) throw error;
        return handleOfflineClients();
      }
    }

    if (method === "GET" && url.pathname === ME_PATH) {
      try {
        const response = await networkRequest(resource, init);
        if (response.ok) {
          const user = await response.clone().json().catch(() => null);
          if (user?.id != null) await putOffline(OFFLINE_STORES.metadata, { ...user, id: "current_user", cachedAt: new Date().toISOString() });
        }
        return response;
      } catch (error) {
        if (!isNetworkFailure(error)) throw error;
        return handleOfflineMe();
      }
    }

    return networkRequest(resource, init);
  };

  window.addEventListener("online", () => { void flushOrderQueue(); });
  if (navigator.onLine) window.setTimeout(() => { void flushOrderQueue(); }, 0);
}
