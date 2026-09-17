import { api } from './api';
import { cacheOrders, getQueue, getLastServerSync, removeQueueItem, updateQueueFailure } from './offlineStore';

let running = false;
let listenersBound = false;

export type SyncState = 'idle' | 'syncing' | 'error';
let state: SyncState = 'idle';

function emit() { window.dispatchEvent(new CustomEvent('qtecnico-sync-state', { detail: { state } })); }

export async function syncOfflineQueue(): Promise<void> {
  if (running || !navigator.onLine) return;
  running = true;
  state = 'syncing';
  emit();
  try {
    const queue = await getQueue();
    for (const item of queue.sort((a, b) => a.createdAt - b.createdAt)) {
      if (!navigator.onLine) break;
      try {
        const saved = await api.updateOrder(item.orderId, item.order);
        await cacheOrders([saved]);
        await removeQueueItem(item.id);
      } catch (error) {
        await updateQueueFailure(item.id, error instanceof Error ? error.message : 'Falha na sincronização');
        state = 'error';
        emit();
        break;
      }
    }
    if (state !== 'error') state = 'idle';
    emit();
  } finally {
    running = false;
  }
}

export async function getSyncInfo() {
  const queue = await getQueue();
  return { pending: queue.length, lastServerSync: await getLastServerSync(), state };
}

export function startOfflineSync() {
  if (listenersBound) return;
  listenersBound = true;
  window.addEventListener('online', () => { void syncOfflineQueue(); });
  window.setInterval(() => { void syncOfflineQueue(); }, 30000);
  if (navigator.onLine) void syncOfflineQueue();
}
