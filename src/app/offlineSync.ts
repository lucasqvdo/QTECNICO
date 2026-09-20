import { api } from './api';
import {
  cacheOrders,
  cacheClients,
  getQueue,
  getLastServerSync,
  removeQueueItem,
  updateQueueFailure,
  markQueueAttempt,
  clearLegacyRecoveryItems,
  markQueueManualRecovery,
  updateQueueUpload,
  markServerSync,
  getOfflineSnapshot,
  updateCachedPhoto,
  type QueueItem
} from './offlineStore';

let running = false;
let listenersBound = false;
let state: 'idle' | 'syncing' | 'error' = 'idle';

function emit() {
  window.dispatchEvent(new CustomEvent('qtecnico-sync-state', { detail: { state } }));
}

function isNetworkError(error: unknown): boolean {
  if (!navigator.onLine) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) return true;
  const msg = String((error as any)?.message || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('offline') ||
    msg.includes('tempo limite') ||
    msg.includes('abort') ||
    msg.includes('connection')
  );
}

function asFile(item: QueueItem): File {
  if (!item.file) throw new Error('Arquivo offline não encontrado.');
  return new File([item.file], item.fileName || 'arquivo-offline', {
    type: item.file.type || 'application/octet-stream'
  });
}

async function syncClientCreate(item: QueueItem) {
  if (!item.client) return;
  const saved = await api.createClientOnline(item.client);
  await cacheClients([saved]);
}

async function syncClientUpdate(item: QueueItem) {
  if (!item.client || !item.clientId) return;
  const saved = await api.updateClientOnline(item.clientId, item.client);
  await cacheClients([saved]);
}

async function syncClientDelete(item: QueueItem) {
  if (!item.clientId) return;
  try {
    await api.deleteClientOnline(item.clientId);
  } catch (err: any) {
    if (isNetworkError(err)) throw err;
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('não encontrad') || err?.status === 404) return;
    throw err;
  }
}

async function syncCreate(item: QueueItem) {
  const snapshot = await getOfflineSnapshot();
  const currentOrder = (item.orderId ? snapshot.orders.find(o => o.id === item.orderId) : null) || item.order;
  if (!currentOrder) return;
  const saved = await api.createOrderOnline(currentOrder);
  await cacheOrders([saved]);
}

async function syncOrder(item: QueueItem) {
  const snapshot = await getOfflineSnapshot();
  const currentOrder = (item.orderId ? snapshot.orders.find(o => o.id === item.orderId) : null) || item.order;
  if (!currentOrder) return;
  const saved = await api.syncOrderOnline(item.orderId, { ...currentOrder }, item.id, item.baseVersion);
  await cacheOrders([saved]);
}

async function syncDelete(item: QueueItem) {
  if (!item.orderId) return;
  try {
    await api.deleteOrderOnline(item.orderId);
  } catch (err: any) {
    if (isNetworkError(err)) throw err;
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('não encontrad') || err?.status === 404) return;
    throw err;
  }
}

async function syncPhoto(item: QueueItem) {
  if (!item.attendanceId) throw new Error('Atendimento da foto não identificado.');
  const file = asFile(item);
  let uploaded = { key: item.uploadedKey || '', url: item.uploadedUrl || '' };
  if (!uploaded.key || !uploaded.url) {
    uploaded = await api.uploadPhoto(file, 'attendances');
    await updateQueueUpload(item.id, uploaded.key, uploaded.url);
  }
  await api.registerAttendancePhoto(item.orderId, item.attendanceId, {
    id: item.photoId,
    key: uploaded.key,
    url: uploaded.url,
    name: item.fileName || file.name
  });
  if (item.photoId && uploaded.key && uploaded.url) {
    await updateCachedPhoto(item.orderId, item.attendanceId, item.photoId, uploaded.key, uploaded.url);
  }
}

async function syncSignature(item: QueueItem) {
  const file = asFile(item);
  let uploaded = { key: item.uploadedKey || '', url: item.uploadedUrl || '' };
  if (!uploaded.key || !uploaded.url) {
    uploaded = await api.uploadPhoto(file, 'signatures');
    await updateQueueUpload(item.id, uploaded.key, uploaded.url);
  }
  const snapshot = await getOfflineSnapshot();
  const latestOrder = snapshot.orders.find(o => String(o.id) === String(item.orderId));
  const baseVersion = Number.isFinite(latestOrder?.syncVersion) ? latestOrder?.syncVersion : item.baseVersion;
  const saved = await api.syncOrderOnline(item.orderId, {
    clientSignature: uploaded.url,
    clientSignatureKey: uploaded.key,
    status: 'completed'
  }, item.id, baseVersion);
  await cacheOrders([saved]);
}

export async function syncOfflineQueue(): Promise<void> {
  if (running || !navigator.onLine) return;
  running = true;
  state = 'syncing';
  emit();

  try {
    let didSync = false;
    let hadError = false;
    await clearLegacyRecoveryItems();

    const queue = (await getQueue()).sort((a, b) => a.createdAt - b.createdAt);
    const recoverableQueue = queue.filter(i => !i.manualRecovery);

    // Cancel matching offline creates & deletes
    const clientDeleteIds = new Set(
      recoverableQueue
        .filter(i => i.type === 'client_delete')
        .map(i => i.clientId)
        .filter((x): x is string => Boolean(x))
    );
    const orderDeleteIds = new Set(
      recoverableQueue
        .filter(i => i.type === 'order_delete')
        .map(i => i.orderId)
        .filter((x): x is string => Boolean(x))
    );
    const localCreatedClientIds = new Set(
      recoverableQueue
        .filter(i => i.type === 'client_create')
        .map(i => i.clientId)
        .filter((x): x is string => Boolean(x))
    );
    const localCreatedOrderIds = new Set(
      recoverableQueue
        .filter(i => i.type === 'order_create')
        .map(i => i.orderId)
        .filter((x): x is string => Boolean(x))
    );

    // Process invalid items
    const invalidItems = recoverableQueue.filter(i => i.type === 'invalid');
    for (const item of invalidItems) {
      await markQueueManualRecovery(item.id, 'Operação offline inválida: tipo e/ou identificador não puderam ser recuperados.');
    }

    // 1. Process Clients
    const clientCreates = recoverableQueue.filter(i => i.type === 'client_create');
    for (const item of clientCreates) {
      if (!navigator.onLine) break;
      if (item.clientId && clientDeleteIds.has(item.clientId)) {
        await removeQueueItem(item.id);
        continue;
      }
      try {
        await markQueueAttempt(item.id);
        await syncClientCreate(item);
        await removeQueueItem(item.id);
        didSync = true;
      } catch (error) {
        if (isNetworkError(error)) {
          running = false;
          state = 'error';
          emit();
          return;
        }
        hadError = true;
        const msg = error instanceof Error ? error.message : 'Falha ao sincronizar cliente';
        await updateQueueFailure(item.id, msg);
        if (item.attempts >= 2) await markQueueManualRecovery(item.id, msg);
      }
    }

    const clientUpdates = recoverableQueue.filter(i => i.type === 'client_update');
    for (const item of clientUpdates) {
      if (!navigator.onLine) break;
      if (item.clientId && clientDeleteIds.has(item.clientId)) {
        await removeQueueItem(item.id);
        continue;
      }
      try {
        await markQueueAttempt(item.id);
        await syncClientUpdate(item);
        await removeQueueItem(item.id);
        didSync = true;
      } catch (error) {
        if (isNetworkError(error)) {
          running = false;
          state = 'error';
          emit();
          return;
        }
        hadError = true;
        const msg = error instanceof Error ? error.message : 'Falha ao atualizar cliente';
        await updateQueueFailure(item.id, msg);
        if (item.attempts >= 2) await markQueueManualRecovery(item.id, msg);
      }
    }

    const clientDeletes = recoverableQueue.filter(i => i.type === 'client_delete');
    for (const item of clientDeletes) {
      if (!navigator.onLine) break;
      if (item.clientId && localCreatedClientIds.has(String(item.clientId))) {
        await removeQueueItem(item.id);
        continue;
      }
      try {
        await markQueueAttempt(item.id);
        await syncClientDelete(item);
        await removeQueueItem(item.id);
        didSync = true;
      } catch (error) {
        if (isNetworkError(error)) {
          running = false;
          state = 'error';
          emit();
          return;
        }
        hadError = true;
        const msg = error instanceof Error ? error.message : 'Falha ao excluir cliente';
        await updateQueueFailure(item.id, msg);
        if (item.attempts >= 2) await markQueueManualRecovery(item.id, msg);
      }
    }

    // 2. Process Order Creates
    const createItems = recoverableQueue.filter(i => i.type === 'order_create');
    for (const item of createItems) {
      if (!navigator.onLine) break;
      if (item.orderId && orderDeleteIds.has(item.orderId)) {
        await removeQueueItem(item.id);
        continue;
      }
      try {
        await markQueueAttempt(item.id);
        await syncCreate(item);
        await removeQueueItem(item.id);
        didSync = true;
      } catch (error) {
        if (isNetworkError(error)) {
          running = false;
          state = 'error';
          emit();
          return;
        }
        hadError = true;
        const msg = error instanceof Error ? error.message : 'Falha ao criar OS offline no servidor';
        await updateQueueFailure(item.id, msg);
        if (item.attempts >= 2) await markQueueManualRecovery(item.id, msg);
      }
    }

    // 3. Process Photos
    const photoItems = recoverableQueue.filter(i => i.type === 'attendance_photo');
    for (const item of photoItems) {
      if (!navigator.onLine) break;
      if (item.orderId && orderDeleteIds.has(item.orderId)) {
        await removeQueueItem(item.id);
        continue;
      }
      if (!item.orderId || !item.attendanceId) {
        await markQueueManualRecovery(item.id, 'Recuperação manual necessária: OS/atendimento da foto não identificado com segurança.');
        continue;
      }
      try {
        await markQueueAttempt(item.id);
        await syncPhoto(item);
        await removeQueueItem(item.id);
        didSync = true;
      } catch (error) {
        if (isNetworkError(error)) {
          running = false;
          state = 'error';
          emit();
          return;
        }
        hadError = true;
        const msg = error instanceof Error ? error.message : 'Falha ao sincronizar foto';
        await updateQueueFailure(item.id, msg);
        if (item.attempts >= 2) await markQueueManualRecovery(item.id, msg);
      }
    }

    // 4. Process Order Updates
    const orderItems = recoverableQueue.filter(i => i.type === 'order_update');
    const latestByOrder = new Map<string, QueueItem>();
    for (const item of orderItems) {
      if (item.orderId && orderDeleteIds.has(item.orderId)) {
        await removeQueueItem(item.id);
        continue;
      }
      latestByOrder.set(item.orderId, item);
    }
    for (const item of latestByOrder.values()) {
      if (!navigator.onLine) break;
      try {
        await markQueueAttempt(item.id);
        await syncOrder(item);
        await removeQueueItem(item.id);
        didSync = true;
      } catch (error) {
        if (isNetworkError(error)) {
          running = false;
          state = 'error';
          emit();
          return;
        }
        hadError = true;
        const msg = error instanceof Error ? error.message : 'Falha ao sincronizar OS';
        if (Number((error as any)?.status) === 409) {
          await markQueueManualRecovery(item.id, `Conflito de sincronização: a OS foi alterada no servidor antes desta edição offline. ${msg}`);
        } else {
          await updateQueueFailure(item.id, msg);
          if (item.attempts >= 2) await markQueueManualRecovery(item.id, msg);
        }
      }
    }
    for (const item of orderItems) {
      if (latestByOrder.get(item.orderId)?.id === item.id) continue;
      await removeQueueItem(item.id);
    }

    // 6. Process Order Deletes
    const deleteItems = recoverableQueue.filter(i => i.type === 'order_delete');
    for (const item of deleteItems) {
      if (!navigator.onLine) break;
      if (item.orderId && localCreatedOrderIds.has(String(item.orderId))) {
        await removeQueueItem(item.id);
        continue;
      }
      try {
        await markQueueAttempt(item.id);
        await syncDelete(item);
        await removeQueueItem(item.id);
        didSync = true;
      } catch (error) {
        if (isNetworkError(error)) {
          running = false;
          state = 'error';
          emit();
          return;
        }
        hadError = true;
        const msg = error instanceof Error ? error.message : 'Falha ao excluir OS no servidor';
        await updateQueueFailure(item.id, msg);
        if (item.attempts >= 2) await markQueueManualRecovery(item.id, msg);
      }
    }

    const remaining = await getQueue();
    const activeRemaining = remaining.filter(i => !i.manualRecovery);
    if (activeRemaining.length === 0) {
      if (didSync) await markServerSync();
      state = remaining.some(i => i.manualRecovery) ? 'error' : 'idle';
    } else {
      state = hadError ? 'error' : 'idle';
    }
    emit();
  } finally {
    running = false;
  }
}

export async function getSyncInfo() {
  const queue = await getQueue();
  const pendingQueue = queue.filter(item => !item.manualRecovery);
  const recovery = queue.filter(item => Boolean(item.manualRecovery));
  const failed = pendingQueue.filter(item => Boolean(item.lastError));
  return {
    pending: pendingQueue.length,
    recovery: recovery.length,
    lastServerSync: await getLastServerSync(),
    state,
    lastError: failed.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.lastError || ''
  };
}

export function startOfflineSync() {
  if (listenersBound) return;
  listenersBound = true;
  const kick = () => {
    if (navigator.onLine && !running) void syncOfflineQueue();
  };
  window.addEventListener('online', kick);
  window.addEventListener('focus', kick);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kick();
  });
  window.setInterval(kick, 5000);
  kick();
}
    // 5. Process Signatures
    const signatureItems = recoverableQueue.filter(i => i.type === 'signature_upload');
    for (const item of signatureItems) {
      if (!navigator.onLine) break;
      if (item.orderId && orderDeleteIds.has(item.orderId)) {
        await removeQueueItem(item.id);
        continue;
      }
      try {
        await markQueueAttempt(item.id);
        await syncSignature(item);
        await removeQueueItem(item.id);
        didSync = true;
      } catch (error) {
        if (isNetworkError(error)) {
          running = false;
          state = 'error';
          emit();
          return;
        }
        hadError = true;
        const msg = error instanceof Error ? error.message : 'Falha ao sincronizar assinatura';
        if (Number((error as any)?.status) === 409) {
          await markQueueManualRecovery(item.id, `Conflito de sincronização da assinatura: a OS foi alterada no servidor antes desta assinatura offline. ${msg}`);
        } else {
          await updateQueueFailure(item.id, msg);
          if (item.attempts >= 2) await markQueueManualRecovery(item.id, msg);
        }
      }
    }

