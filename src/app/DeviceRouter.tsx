import { useEffect, useState } from "react";
import App from "./App";
import AdminDashboard from "./AdminDashboardV2";
import { api } from "./api";

const AUTH_CHECK_TIMEOUT_MS = 8000;

export default function DeviceRouter() {
  const [authState, setAuthState] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [adminAllowed, setAdminAllowed] = useState(false);

  useEffect(() => {
    let mounted = true;
    let timeoutId: number | undefined;

    const checkAuth = async () => {
      try {
        const user = await api.getMe();
        if (!mounted) return;
        if (user.isAdmin) {
          try {
            await api.getAdminAccess();
            if (!mounted) return;
            setAdminAllowed(true);
          } catch {
            if (!mounted) return;
            setAdminAllowed(false);
          }
        } else {
          setAdminAllowed(false);
        }
        setAuthState("authenticated");
      } catch {
        if (!mounted) return;
        setAdminAllowed(false);
        setAuthState("unauthenticated");
      } finally {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      }
    };

    timeoutId = window.setTimeout(() => {
      if (!mounted) return;
      // Never leave the application stuck on the splash screen when a tablet
      // has a slow/interrupted connection. The login screen can recover normally.
      setAdminAllowed(false);
      setAuthState("unauthenticated");
    }, AUTH_CHECK_TIMEOUT_MS);

    void checkAuth();

    const handleAuthenticated = () => {
      if (!mounted) return;
      setAuthState("checking");
      void checkAuth();
    };
    const handleSessionExpired = () => {
      if (!mounted) return;
      setAdminAllowed(false);
      setAuthState("unauthenticated");
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

  if (authState === "checking") return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400" /><p className="text-sm text-slate-300">Carregando sua área de trabalho...</p></div></div>;
  if (authState === "authenticated" && adminAllowed) return <AdminDashboard />;
  return <App />;
}
