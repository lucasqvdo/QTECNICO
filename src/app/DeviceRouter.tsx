import { useEffect, useState } from "react";
import App from "./App";
import AdminDashboard from "./AdminDashboardV2";
import TechnicianDashboard from "./TechnicianDashboardV2";
import { api } from "./api";

export default function DeviceRouter() {
  const [workspace, setWorkspace] = useState<'admin' | 'technician' | 'app'>('app');

  useEffect(() => {
    let mounted = true;
    let timeoutId: number | undefined;
    let settled = false;

    const finish = (target: 'admin' | 'technician' | 'app') => {
      if (!mounted || settled) return;
      settled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      setWorkspace(target);
    };

    const checkAuth = async () => {
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
      setWorkspace('app');
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => finish('app'), 5000);
      void checkAuth();
    };

    const handleSessionExpired = () => {
      if (!mounted) return;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      settled = true;
      setWorkspace('app');
    };

    window.addEventListener("qtecnico-authenticated", handleAuthenticated);
    window.addEventListener("qtecnico-session-expired", handleSessionExpired);

    return () => {
      mounted = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      window.removeEventListener("qtecnico-authenticated", handleAuthenticated);
      window.removeEventListener("qtecnico-session-expired", handleSessionExpired);
    };
  }, []);

  if (workspace === 'admin') return <AdminDashboard />;
  if (workspace === 'technician') return <TechnicianDashboard />;
  return <App />;
}
