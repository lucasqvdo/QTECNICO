export function installMobileCacheRecovery() {
  if (typeof window === 'undefined') return;
  const key = 'qtecnico-cache-recovery-v3';
  const run = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((cache) => caches.delete(cache)));
      }
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
      }
    } catch {
      // Never block application startup because cache cleanup is unavailable.
    }
  };
  void run();
}
