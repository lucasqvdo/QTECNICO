const DB_NAME = "qtecnico-offline";
const DB_VERSION = 2;

export const OFFLINE_STORES = {
  metadata: "metadata",
  clients: "clients",
  serviceOrders: "service_orders",
  serviceOrderItems: "service_order_items",
  equipment: "equipment",
  checklists: "checklists",
  materials: "materials",
  photos: "photos",
  syncQueue: "sync_queue",
  syncConflicts: "sync_conflicts",
} as const;

type OfflineStoreName = typeof OFFLINE_STORES[keyof typeof OFFLINE_STORES];

function configureStore(store: IDBObjectStore, storeName: OfflineStoreName) {
  if (storeName === OFFLINE_STORES.syncQueue) {
    if (!store.indexNames.contains("status")) store.createIndex("status", "status", { unique: false });
    if (!store.indexNames.contains("createdAt")) store.createIndex("createdAt", "createdAt", { unique: false });
    if (!store.indexNames.contains("entity")) store.createIndex("entity", "entity", { unique: false });
  }

  if (storeName === OFFLINE_STORES.syncConflicts) {
    if (!store.indexNames.contains("entity")) store.createIndex("entity", "entity", { unique: false });
    if (!store.indexNames.contains("createdAt")) store.createIndex("createdAt", "createdAt", { unique: false });
  }

  if (storeName === OFFLINE_STORES.serviceOrders) {
    if (!store.indexNames.contains("status")) store.createIndex("status", "status", { unique: false });
    if (!store.indexNames.contains("updatedAt")) store.createIndex("updatedAt", "updatedAt", { unique: false });
  }
}

export function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB não está disponível neste ambiente."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      Object.values(OFFLINE_STORES).forEach((storeName) => {
        const store = db.objectStoreNames.contains(storeName)
          ? request.transaction!.objectStore(storeName)
          : db.createObjectStore(storeName, { keyPath: "id" });
        configureStore(store, storeName);
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir banco offline."));
    request.onblocked = () => console.warn("QTecnico: atualização do banco offline bloqueada por outra aba.");
  });
}

export async function initializeOfflineDb(): Promise<void> {
  const db = await openOfflineDb();
  db.close();
}

export async function putOffline<T extends { id: IDBValidKey }>(storeName: OfflineStoreName, value: T): Promise<void> {
  const db = await openOfflineDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Falha ao salvar dado offline."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Transação offline abortada."));
    });
  } finally {
    db.close();
  }
}

export async function getOffline<T>(storeName: OfflineStoreName, id: IDBValidKey): Promise<T | undefined> {
  const db = await openOfflineDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = db.transaction(storeName, "readonly").objectStore(storeName).get(id);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error ?? new Error("Falha ao ler dado offline."));
    });
  } finally {
    db.close();
  }
}

export async function getAllOffline<T>(storeName: OfflineStoreName): Promise<T[]> {
  const db = await openOfflineDb();
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error ?? new Error("Falha ao listar dados offline."));
    });
  } finally {
    db.close();
  }
}

export async function deleteOffline(storeName: OfflineStoreName, id: IDBValidKey): Promise<void> {
  const db = await openOfflineDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Falha ao remover dado offline."));
    });
  } finally {
    db.close();
  }
}
