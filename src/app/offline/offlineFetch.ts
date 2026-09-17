import { deleteOffline, getAllOffline, getOffline, putOffline, OFFLINE_STORES } from "./offlineDb";

const originalFetch = window.fetch.bind(window);
const ORDER_PATH = /^\/api\/orders(?:\/([^/]+))?$/;
const ATTENDANCE_PHOTO_PATH = /^\/api\/orders\/([^/]+)\/attendances\/([^/]+)\/photos$/;
const ATTENDANCE_PHOTO_DELETE_PATH = /^\/api\/orders\/([^/]+)\/attendances\/([^/]+)\/photos\/([^/]+)$/;
const UPLOADS_PATH = "/api/uploads";
const CLIENTS_PATH = "/api/clients";
const ME_PATH = "/api/users/me";

function networkRequest(resource: RequestInfo | URL, init?: RequestInit) { return originalFetch(resource, init); }
function isNetworkFailure(error: unknown) { return error instanceof TypeError || !navigator.onLine; }
function getCsrfToken() { const match = document.cookie.match(/(?:^|; )qtecnico_csrf=([^;]+)/); return match ? decodeURIComponent(match[1]) : null; }
async function cacheOrder(order: any) { if (!order || order.id == null) return; await putOffline(OFFLINE_STORES.serviceOrders, { ...order, id: String(order.id), updatedAt: new Date().toISOString() }); }
async function cacheOrders(orders: any[]) { await Promise.all(orders.filter((order) => order && order.id != null).map(cacheOrder)); }
async function cachedOrders() { const orders = await getAllOffline<any>(OFFLINE_STORES.serviceOrders); return orders.map(({ updatedAt: _updatedAt, ...order }) => order); }
async function queueOrderChange(id: string, action: "update" | "create", payload: any) {
  const queue = await getAllOffline<any>(OFFLINE_STORES.syncQueue);
  const existing = queue.find((item) => item?.status === "pending" && item?.entity === "service_order" && item?.entityId === id && item?.action === action);
  if (existing) {
    await putOffline(OFFLINE_STORES.syncQueue, { ...existing, payload: { ...(existing.payload || {}), ...(payload || {}) }, updatedAt: new Date().toISOString() });
    return;
  }
  const queueId = `${action}:order:${id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  await putOffline(OFFLINE_STORES.syncQueue, { id: queueId, entity: "service_order", entityId: id, action, payload, status: "pending", createdAt: new Date().toISOString() });
}
async function handleOfflineOrderUpdate(orderId: string, init?: RequestInit) {
  const cached = await getOffline<any>(OFFLINE_STORES.serviceOrders, orderId); if (!cached) throw new Error("Esta OS ainda não foi armazenada no dispositivo.");
  let patch: any = {}; if (typeof init?.body === "string") { try { patch = JSON.parse(init.body); } catch { patch = {}; } }
  const merged = { ...cached, ...patch, id: orderId, updatedAt: new Date().toISOString(), offlinePendingSync: true };
  await putOffline(OFFLINE_STORES.serviceOrders, merged); await queueOrderChange(orderId, "update", patch);
  return new Response(JSON.stringify(merged), { status: 200, headers: { "Content-Type": "application/json", "X-QTecnico-Offline": "true" } });
}
async function handleOfflineOrderList() { const orders = await cachedOrders(); if (!orders.length) throw new Error("Nenhuma OS disponível offline neste dispositivo."); return new Response(JSON.stringify(orders), { status: 200, headers: { "Content-Type": "application/json", "X-QTecnico-Offline": "true" } }); }
async function handleOfflineOrderDetail(orderId: string) { const order = await getOffline<any>(OFFLINE_STORES.serviceOrders, orderId); if (!order) throw new Error("Esta OS ainda não foi armazenada no dispositivo."); const { updatedAt: _updatedAt, ...cleanOrder } = order; return new Response(JSON.stringify(cleanOrder), { status: 200, headers: { "Content-Type": "application/json", "X-QTecnico-Offline": "true" } }); }
async function handleOfflineClients() { const clients = await getAllOffline<any>(OFFLINE_STORES.clients); return new Response(JSON.stringify(clients), { status: 200, headers: { "Content-Type": "application/json", "X-QTecnico-Offline": "true" } }); }
async function handleOfflineMe() { const user = await getOffline<any>(OFFLINE_STORES.metadata, "current_user"); if (!user) throw new Error("Sessão offline não disponível neste dispositivo."); return new Response(JSON.stringify(user), { status: 200, headers: { "Content-Type": "application/json", "X-QTecnico-Offline": "true" } }); }
function offlineKey(folder: string, fileName: string) { return `offline/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`; }
async function fileToDataUrl(file: Blob) { const buffer = await file.arrayBuffer(); let binary = ""; const bytes = new Uint8Array(buffer); const chunk = 0x8000; for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk)); return `data:${file.type || "application/octet-stream"};base64,${btoa(binary)}`; }
async function handleOfflineUpload(request: Request) {
  const form = await request.clone().formData(); const file = form.get("file"); const folder = String(form.get("folder") || "attendances");
  if (!(file instanceof Blob)) throw new Error("Nenhum arquivo de imagem informado.");
  const name = file instanceof File ? file.name : `offline-${Date.now()}.png`; const key = offlineKey(folder, name); const dataUrl = await fileToDataUrl(file);
  await putOffline(OFFLINE_STORES.photos, { id: key, key, folder, name, type: file.type, blob: file, dataUrl, status: "pending", createdAt: new Date().toISOString() });
  await putOffline(OFFLINE_STORES.syncQueue, { id: `upload:${key}`, entity: "photo_upload", entityId: key, action: "upload", payload: { key, folder, name }, status: "pending", createdAt: new Date().toISOString() });
  return new Response(JSON.stringify({ key, url: dataUrl }), { status: 200, headers: { "Content-Type": "application/json", "X-QTecnico-Offline": "true" } });
}
async function handleOfflineAttendancePhoto(orderId: string, attendanceId: string, request: Request) {
  const body = await request.clone().json().catch(() => null); const key = String(body?.key || ""); const name = String(body?.name || "Foto");
  const photo = key ? await getOffline<any>(OFFLINE_STORES.photos, key) : undefined; if (!photo) throw new Error("Foto offline não encontrada no dispositivo.");
  const order = await getOffline<any>(OFFLINE_STORES.serviceOrders, orderId); if (!order) throw new Error("Esta OS ainda não foi armazenada no dispositivo.");
  const attendances = Array.isArray(order.attendances) ? order.attendances.map((a: any) => ({ ...a, photos: Array.isArray(a.photos) ? [...a.photos] : [] })) : [];
  const attendance = attendances.find((a: any) => String(a.id) === attendanceId); if (!attendance) throw new Error("Atendimento não encontrado no armazenamento offline.");
  const localPhoto = { id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, key, dataUrl: photo.dataUrl, name }; attendance.photos.push(localPhoto);
  await putOffline(OFFLINE_STORES.serviceOrders, { ...order, attendances, offlinePendingSync: true, updatedAt: new Date().toISOString() });
  await putOffline(OFFLINE_STORES.syncQueue, { id: `attendance-photo:${localPhoto.id}`, entity: "attendance_photo", entityId: localPhoto.id, action: "associate", payload: { orderId, attendanceId, photoId: localPhoto.id, tempKey: key, name }, status: "pending", createdAt: new Date().toISOString() });
  return new Response(JSON.stringify({ photo: localPhoto }), { status: 200, headers: { "Content-Type": "application/json", "X-QTecnico-Offline": "true" } });
}
async function removePendingPhotoQueues(photo: any) {
  const queue = await getAllOffline<any>(OFFLINE_STORES.syncQueue);
  for (const item of queue) {
    const sameTempKey = item?.payload?.tempKey === photo?.key || item?.entityId === photo?.key;
    const samePhotoId = item?.payload?.photoId === photo?.id || item?.entityId === photo?.id;
    const uploadForPhoto = item?.entity === "photo_upload" && sameTempKey;
    const associationForPhoto = item?.entity === "attendance_photo" && samePhotoId;
    if (uploadForPhoto || associationForPhoto) await deleteOffline(OFFLINE_STORES.syncQueue, item.id);
  }
}
async function handleOfflineAttendancePhotoDelete(orderId: string, attendanceId: string, photoId: string) {
  const order = await getOffline<any>(OFFLINE_STORES.serviceOrders, orderId); if (!order) throw new Error("Esta OS ainda não foi armazenada no dispositivo.");
  const attendances = Array.isArray(order.attendances) ? order.attendances.map((a: any) => ({ ...a, photos: Array.isArray(a.photos) ? [...a.photos] : [] })) : [];
  const attendance = attendances.find((a: any) => String(a.id) === attendanceId); if (!attendance) throw new Error("Atendimento não encontrado no armazenamento offline.");
  const photo = attendance.photos.find((p: any) => String(p.id) === photoId);
  if (!photo) throw new Error("Foto não encontrada no armazenamento offline.");
  const localPhoto = photo.key ? await getOffline<any>(OFFLINE_STORES.photos, photo.key) : undefined;
  await removePendingPhotoQueues(photo);
  attendance.photos = attendance.photos.filter((p: any) => String(p.id) !== photoId);
  await putOffline(OFFLINE_STORES.serviceOrders, { ...order, attendances, offlinePendingSync: true, updatedAt: new Date().toISOString() });
  if (localPhoto?.key && String(localPhoto.key).startsWith("offline/")) {
    await deleteOffline(OFFLINE_STORES.photos, localPhoto.key);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json", "X-QTecnico-Offline": "true" } });
  }
  await putOffline(OFFLINE_STORES.syncQueue, {
    id: `attendance-photo-delete:${orderId}:${attendanceId}:${photoId}`,
    entity: "attendance_photo_delete",
    entityId: photoId,
    action: "delete",
    payload: { orderId, attendanceId, photoId },
    status: "pending",
    createdAt: new Date().toISOString(),
  });
  return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json", "X-QTecnico-Offline": "true" } });
}
async function reconcileOfflineSignature(tempKey: string, remoteKey: string, remoteUrl: string, localDataUrl?: string) {
  const queue = await getAllOffline<any>(OFFLINE_STORES.syncQueue);
  const pendingOrders = queue.filter((item) => item?.status === "pending" && item?.entity === "service_order" && item?.action === "update");
  for (const item of pendingOrders) {
    const payload = item.payload && typeof item.payload === "object" ? { ...item.payload } : {};
    const matchesKey = payload.clientSignatureKey === tempKey;
    const matchesUrl = localDataUrl && payload.clientSignature === localDataUrl;
    if (!matchesKey && !matchesUrl) continue;
    if (matchesKey) payload.clientSignatureKey = remoteKey;
    if (matchesUrl || matchesKey) payload.clientSignature = remoteUrl;
    await putOffline(OFFLINE_STORES.syncQueue, { ...item, payload });
  }
}
async function flushPhotoQueue() {
  if (!navigator.onLine) return;
  const queue = await getAllOffline<any>(OFFLINE_STORES.syncQueue);
  const uploads = queue.filter((item) => item?.status === "pending" && item?.entity === "photo_upload").sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const item of uploads) {
    try {
      const photo = await getOffline<any>(OFFLINE_STORES.photos, item.entityId); if (!photo?.blob) { await deleteOffline(OFFLINE_STORES.syncQueue, item.id); continue; }
      const form = new FormData(); form.append("file", photo.blob, photo.name); form.append("folder", photo.folder);
      const headers: Record<string, string> = {}; const csrf = getCsrfToken(); if (csrf) headers["X-CSRF-Token"] = csrf;
      const response = await originalFetch(UPLOADS_PATH, { method: "POST", credentials: "include", headers, body: form }); if (!response.ok) break;
      const saved = await response.json(); await putOffline(OFFLINE_STORES.photos, { ...photo, remoteKey: saved.key, remoteUrl: saved.url, status: "uploaded" });
      if (photo.folder === "signatures" && saved.key && saved.url) await reconcileOfflineSignature(photo.key, saved.key, saved.url, photo.dataUrl);
      await deleteOffline(OFFLINE_STORES.syncQueue, item.id);
    } catch { break; }
  }
  const refreshedQueue = await getAllOffline<any>(OFFLINE_STORES.syncQueue);
  const associations = refreshedQueue.filter((item) => item?.status === "pending" && item?.entity === "attendance_photo").sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const item of associations) {
    try {
      const photo = await getOffline<any>(OFFLINE_STORES.photos, item.payload?.tempKey); if (!photo?.remoteKey) break;
      const headers: Record<string, string> = { "Content-Type": "application/json" }; const csrf = getCsrfToken(); if (csrf) headers["X-CSRF-Token"] = csrf;
      const response = await originalFetch(`/api/orders/${encodeURIComponent(item.payload.orderId)}/attendances/${encodeURIComponent(item.payload.attendanceId)}/photos`, { method: "POST", credentials: "include", headers, body: JSON.stringify({ key: photo.remoteKey, url: photo.remoteUrl, name: item.payload.name }) }); if (!response.ok) break;
      await deleteOffline(OFFLINE_STORES.syncQueue, item.id);
      const orderResponse = await originalFetch(`/api/orders/${encodeURIComponent(item.payload.orderId)}`, { credentials: "include" }); if (orderResponse.ok) { const fresh = await orderResponse.json().catch(() => null); if (fresh?.id != null) await cacheOrder(fresh); }
      await deleteOffline(OFFLINE_STORES.photos, item.payload.tempKey);
    } catch { break; }
  }
  const deleteQueue = (await getAllOffline<any>(OFFLINE_STORES.syncQueue)).filter((item) => item?.status === "pending" && item?.entity === "attendance_photo_delete").sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const item of deleteQueue) {
    try {
      const headers: Record<string, string> = {}; const csrf = getCsrfToken(); if (csrf) headers["X-CSRF-Token"] = csrf;
      const response = await originalFetch(`/api/orders/${encodeURIComponent(item.payload.orderId)}/attendances/${encodeURIComponent(item.payload.attendanceId)}/photos/${encodeURIComponent(item.payload.photoId)}`, { method: "DELETE", credentials: "include", headers }); if (!response.ok) break;
      await deleteOffline(OFFLINE_STORES.syncQueue, item.id);
      const orderResponse = await originalFetch(`/api/orders/${encodeURIComponent(item.payload.orderId)}`, { credentials: "include" }); if (orderResponse.ok) { const fresh = await orderResponse.json().catch(() => null); if (fresh?.id != null) await cacheOrder(fresh); }
    } catch { break; }
  }
}
async function flushOrderQueue() {
  if (!navigator.onLine) return; await flushPhotoQueue();
  const queue = await getAllOffline<any>(OFFLINE_STORES.syncQueue); const pending = queue.filter((item) => item?.status === "pending" && item?.entity === "service_order" && item?.action === "update").sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const item of pending) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" }; const csrf = getCsrfToken(); if (csrf) headers["X-CSRF-Token"] = csrf;
      const response = await originalFetch(`/api/orders/${encodeURIComponent(String(item.entityId))}`, { method: "PUT", credentials: "include", headers, body: JSON.stringify(item.payload ?? {}) }); if (!response.ok) break;
      const saved = await response.clone().json().catch(() => null); if (saved?.id != null) await cacheOrder({ ...saved, offlinePendingSync: false }); await deleteOffline(OFFLINE_STORES.syncQueue, item.id);
    } catch { break; }
  }
}
export function installOfflineFetchLayer() {
  window.fetch = async (resource: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = resource instanceof Request ? resource : new Request(resource, init); const url = new URL(request.url, window.location.origin); const method = request.method.toUpperCase();
    if (url.origin !== window.location.origin) return networkRequest(resource, init);
    const orderMatch = ORDER_PATH.exec(url.pathname); const attendancePhotoMatch = ATTENDANCE_PHOTO_PATH.exec(url.pathname); const attendancePhotoDeleteMatch = ATTENDANCE_PHOTO_DELETE_PATH.exec(url.pathname);
    if (method === "GET" && orderMatch) { try { const response = await networkRequest(resource, init); if (response.ok) { const data = await response.clone().json().catch(() => null); if (Array.isArray(data)) await cacheOrders(data); else if (data?.id != null && orderMatch[1]) await cacheOrder(data); } return response; } catch (error) { if (!isNetworkFailure(error)) throw error; if (orderMatch[1]) return handleOfflineOrderDetail(decodeURIComponent(orderMatch[1])); return handleOfflineOrderList(); } }
    if (method === "PUT" && orderMatch?.[1]) { try { return await networkRequest(resource, init); } catch (error) { if (!isNetworkFailure(error)) throw error; return handleOfflineOrderUpdate(decodeURIComponent(orderMatch[1]), init); } }
    if (method === "POST" && url.pathname === UPLOADS_PATH) { try { return await networkRequest(resource, init); } catch (error) { if (!isNetworkFailure(error)) throw error; return handleOfflineUpload(request); } }
    if (method === "POST" && attendancePhotoMatch) { try { return await networkRequest(resource, init); } catch (error) { if (!isNetworkFailure(error)) throw error; return handleOfflineAttendancePhoto(decodeURIComponent(attendancePhotoMatch[1]), decodeURIComponent(attendancePhotoMatch[2]), request); } }
    if (method === "DELETE" && attendancePhotoDeleteMatch) { try { return await networkRequest(resource, init); } catch (error) { if (!isNetworkFailure(error)) throw error; return handleOfflineAttendancePhotoDelete(decodeURIComponent(attendancePhotoDeleteMatch[1]), decodeURIComponent(attendancePhotoDeleteMatch[2]), decodeURIComponent(attendancePhotoDeleteMatch[3])); } }
    if (method === "GET" && url.pathname === CLIENTS_PATH) { try { const response = await networkRequest(resource, init); if (response.ok) { const data = await response.clone().json().catch(() => null); if (Array.isArray(data)) await Promise.all(data.filter((client) => client?.id != null).map((client) => putOffline(OFFLINE_STORES.clients, { ...client, id: String(client.id), updatedAt: new Date().toISOString() }))); } return response; } catch (error) { if (!isNetworkFailure(error)) throw error; return handleOfflineClients(); } }
    if (method === "GET" && url.pathname === ME_PATH) { try { const response = await networkRequest(resource, init); if (response.ok) { const user = await response.clone().json().catch(() => null); if (user?.id != null) await putOffline(OFFLINE_STORES.metadata, { ...user, id: "current_user", cachedAt: new Date().toISOString() }); } return response; } catch (error) { if (!isNetworkFailure(error)) throw error; return handleOfflineMe(); } }
    return networkRequest(resource, init);
  };
  window.addEventListener("online", () => { void flushOrderQueue(); }); if (navigator.onLine) window.setTimeout(() => { void flushOrderQueue(); }, 0);
}
