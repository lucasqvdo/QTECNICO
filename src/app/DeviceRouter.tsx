import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "./api";
import { getOfflineSnapshot } from "./offlineStore";

const App = lazy(() => import("./App"));
const AdminDashboard = lazy(() => import("./AdminDashboardV2"));
const TechnicianDashboard = lazy(() => import("./TechnicianDashboardV2"));

type Workspace = 'admin' | 'technician' | 'app';

function WorkspaceLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
      <div className="rounded-2xl bg-white px-6 py-5 text-center shadow-sm">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-500" />
        <p className="text-sm font-semibold text-slate-800">Carregando QTECNICO...</p>
        <p className="mt-1 text-xs text-slate-500">Preparando seu ambiente de trabalho</p>
      </div>
    </div>
  );
}

export default function DeviceRouter() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  useEffect(() => {
    let mounted = true;
    let timeoutId: number | undefined;
    let settled = false;

    const finish = (target: Workspace) => {
      if (!mounted || settled) return;
      settled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      setWorkspace(target);
    };

    const finishFromCachedUser = async () => {
      try {
        const cached = await getOfflineSnapshot();
        if (!mounted) return;
        if (cached.user && Number.isInteger(cached.user.accountId)) {
          finish(cached.user.isAdmin ? 'admin' : 'technician');
          return;
        }
      } catch (error) {
        console.warn("QTecnico: não foi possível ler o cache offline no início", error);
      }
      finish('app');
    };

    const checkAuth = async () => {
      // No cold start offline, não espere uma requisição de rede falhar.
      // O usuário e as OSs já preparadas para trabalho de campo ficam no IndexedDB.
      if (!navigator.onLine) {
        await finishFromCachedUser();
        return;
      }

      try {
        const user = await api.getMe();
        if (!mounted) return;

        if (user.isAdmin) {
          try {
            await api.getAdminAccess();
            finish('admin');
          } catch {
            finish('technician');
          }
        } else {
          finish('technician');
        }
      } catch {
        finish('app');
      }
    };

    timeoutId = window.setTimeout(() => finish('app'), 5000);
    void checkAuth();

    const handleAuthenticated = () => {
      if (!mounted) return;
      settled = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => finish('app'), 5000);
      void checkAuth();
    };

    const handleSessionExpired = () => {
      if (!mounted) return;
      // Uma resposta 401 só é relevante enquanto há conexão. Offline,
      // o cache local deve continuar permitindo o trabalho do técnico.
      if (!navigator.onLine) return;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      settled = true;
      setWorkspace('app');
    };

    const handleOnline = () => {
      if (!mounted || workspace) return;
      void checkAuth();
    };

    window.addEventListener("qtecnico-authenticated", handleAuthenticated);
    window.addEventListener("qtecnico-session-expired", handleSessionExpired);
    window.addEventListener("online", handleOnline);

    return () => {
      mounted = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      window.removeEventListener("qtecnico-authenticated", handleAuthenticated);
      window.removeEventListener("qtecnico-session-expired", handleSessionExpired);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!workspace) return <WorkspaceLoading />;

  return (
    <Suspense fallback={<WorkspaceLoading />}>
      {workspace === 'admin' && <AdminDashboard />}
      {workspace === 'technician' && <TechnicianDashboard />}
      {workspace === 'app' && <App />}
    </Suspense>
  );
}
