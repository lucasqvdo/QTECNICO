const DB_NAME = "qtecnico-offline";
const DB_VERSION = 1;

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
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir banco offline."));
  });
}

export async function initializeOfflineDb(): Promise<void> {
  const db = await openOfflineDb();
  db.close();
}
