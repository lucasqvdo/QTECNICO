import { useEffect, useState } from "react";
import App from "./App";
import AdminDashboard from "./AdminDashboard";
import { api } from "./api";

export default function DeviceRouter() {
  const [authState, setAuthState] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [adminAllowed, setAdminAllowed] = useState(false);

  useEffect(() => {
    let mounted = true;

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
      }
    };

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
      window.removeEventListener("qtecnico-authenticated", handleAuthenticated);
      window.removeEventListener("qtecnico-session-expired", handleSessionExpired);
    };
  }, []);

  if (authState === "checking") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400" />
          <p className="text-sm text-slate-300">Carregando sua área de trabalho...</p>
        </div>
      </div>
    );
  }

  if (authState === "authenticated" && adminAllowed) return <AdminDashboard />;
  return <App />;
}
