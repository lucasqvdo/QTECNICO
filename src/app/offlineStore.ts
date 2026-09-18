import type { ServiceOrder, AttendancePhoto, Client } from './types';
import type { UserProfile } from './api';

const DB_NAME = 'qtecnico-offline';
const DB_VERSION = 3;
const ORDERS = 'orders';
const CLIENTS = 'clients';
const META = 'meta';
const QUEUE = 'sync_queue';

type QueueItem = {
  id: string;
  type: 'order_create' | 'order_update' | 'attendance_photo' | 'signature_upload';
  orderId: string;
  attendanceId?: string;
  order: ServiceOrder;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  file?: Blob;
  fileName?: string;
  photoId?: string;
  lastError?: string;
  uploadedKey?: string;
  uploadedUrl?: string;
};

export type OfflineSnapshot = { orders: ServiceOrder[]; clients: Client[]; user: UserProfile | null };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB não disponível neste dispositivo.'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ORDERS)) db.createObjectStore(ORDERS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(CLIENTS)) db.createObjectStore(CLIENTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Não foi possível abrir o armazenamento local.'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Falha no armazenamento local.'));
    tx.onabort = () => reject(tx.error || new Error('Operação local cancelada.'));
  });
}

export async function getOfflineSnapshot(): Promise<OfflineSnapshot> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([ORDERS, CLIENTS, META], 'readonly');
    const ordersReq = tx.objectStore(ORDERS).getAll();
    const clientsReq = tx.objectStore(CLIENTS).getAll();
    const userReq = tx.objectStore(META).get('user');
    tx.oncomplete = () => resolve({ orders: (ordersReq.result || []) as ServiceOrder[], clients: (clientsReq.result || []) as Client[], user: userReq.result?.value || null });
    tx.onerror = () => reject(tx.error || new Error('Não foi possível ler o cache offline.'));
  });
}

export async function cacheUser(user: UserProfile | null): Promise<void> {
  if (!user) return;
  const db = await openDb();
  const tx = db.transaction(META, 'readwrite');
  tx.objectStore(META).put({ key: 'user', value: user });
  await txDone(tx);
}

export async function cacheSnapshot(orders: ServiceOrder[], user: UserProfile | null, clients?: Client[]): Promise<void> {
  const db = await openDb();
  const stores = clients ? [ORDERS, CLIENTS, META, QUEUE] : [ORDERS, META, QUEUE];
  const tx = db.transaction(stores, 'readwrite');
  const ordersStore = tx.objectStore(ORDERS);
  const pendingRequest = tx.objectStore(QUEUE).getAll();

  pendingRequest.onsuccess = () => {
    const pending = (pendingRequest.result || []) as QueueItem[];
    ordersStore.clear();
    for (const order of orders) ordersStore.put(order);

    // Nunca apague do cache local uma OS que ainda possui operação pendente.
    // Isso mantém o trabalho disponível após uma atualização online seguida
    // de perda de conexão antes da sincronização terminar.
    const pendingOrders = new Map<string, ServiceOrder>();
    for (const item of pending) pendingOrders.set(item.orderId, item.order);
    for (const order of pendingOrders.values()) ordersStore.put(order);

    if (clients) {
      const clientsStore = tx.objectStore(CLIENTS);
      clientsStore.clear();
      for (const client of clients) clientsStore.put(client);
    }
    if (user) tx.objectStore(META).put({ key: 'user', value: user });
    tx.objectStore(META).put({ key: 'last_server_sync', value: Date.now() });
  };
  await txDone(tx);
}

export async function cacheOrders(orders: ServiceOrder[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(ORDERS, 'readwrite');
  const store = tx.objectStore(ORDERS);
  for (const order of orders) store.put(order);
  await txDone(tx);
}

export async function cacheClients(clients: Client[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(CLIENTS, 'readwrite');
  const store = tx.objectStore(CLIENTS);
  store.clear();
  for (const client of clients) store.put(client);
  await txDone(tx);
}

export async function queueOrderCreate(order: ServiceOrder): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([QUEUE, ORDERS], 'readwrite');
  const now = Date.now();
  tx.objectStore(QUEUE).put({ id: `create:${order.id}`, type: 'order_create', orderId: order.id, order, createdAt: now, updatedAt: now, attempts: 0 } satisfies QueueItem);
  tx.objectStore(ORDERS).put(order);
  await txDone(tx);
}

export async function queueOrderUpdate(order: ServiceOrder): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([QUEUE, ORDERS], 'readwrite');
  const now = Date.now();
  tx.objectStore(QUEUE).put({ id: `order:${order.id}`, type: 'order_update', orderId: order.id, order, createdAt: now, updatedAt: now, attempts: 0 } satisfies QueueItem);
  tx.objectStore(ORDERS).put(order);
  await txDone(tx);
}

export async function queueAttendancePhoto(order: ServiceOrder, attendanceId: string, photoId: string, file: Blob, fileName: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([QUEUE, ORDERS], 'readwrite');
  const now = Date.now();
  tx.objectStore(QUEUE).put({ id: `photo:${order.id}:${photoId}`, type: 'attendance_photo', orderId: order.id, attendanceId, photoId, order, file, fileName, createdAt: now, updatedAt: now, attempts: 0 } satisfies QueueItem);
  tx.objectStore(ORDERS).put(order);
  await txDone(tx);
}

export async function queueSignatureUpload(order: ServiceOrder, file: Blob, fileName: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([QUEUE, ORDERS], 'readwrite');
  const now = Date.now();
  tx.objectStore(QUEUE).put({ id: `signature:${order.id}`, type: 'signature_upload', orderId: order.id, order, file, fileName, createdAt: now, updatedAt: now, attempts: 0 } satisfies QueueItem);
  tx.objectStore(ORDERS).put(order);
  await txDone(tx);
}

export async function getQueue(): Promise<QueueItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE, 'readonly');
    const req = tx.objectStore(QUEUE).getAll();
    tx.oncomplete = () => resolve((req.result || []) as QueueItem[]);
    tx.onerror = () => reject(tx.error || new Error('Não foi possível ler a fila offline.'));
  });
}

export async function updateQueueUpload(id: string, uploadedKey: string, uploadedUrl: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(QUEUE, 'readwrite');
  const store = tx.objectStore(QUEUE);
  const req = store.get(id);
  req.onsuccess = () => {
    const item = req.result as QueueItem | undefined;
    if (item) store.put({ ...item, uploadedKey, uploadedUrl, updatedAt: Date.now() });
  };
  await txDone(tx);
}

export async function updateQueueFailure(id: string, error: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(QUEUE, 'readwrite');
  const store = tx.objectStore(QUEUE);
  const req = store.get(id);
  req.onsuccess = () => {
    const item = req.result as QueueItem | undefined;
    if (item) store.put({ ...item, attempts: item.attempts + 1, lastError: error, updatedAt: Date.now() });
  };
  await txDone(tx);
}

export async function removeQueueItem(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(QUEUE, 'readwrite');
  tx.objectStore(QUEUE).delete(id);
  await txDone(tx);
}

export async function getLastServerSync(): Promise<number | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META, 'readonly');
    const req = tx.objectStore(META).get('last_server_sync');
    tx.oncomplete = () => resolve(typeof req.result?.value === 'number' ? req.result.value : null);
    tx.onerror = () => reject(tx.error || new Error('Não foi possível ler o estado offline.'));
  });
}

export async function markServerSync(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(META, 'readwrite');
  tx.objectStore(META).put({ key: 'last_server_sync', value: Date.now() });
  await txDone(tx);
}

export type { QueueItem };
export type { AttendancePhoto };
