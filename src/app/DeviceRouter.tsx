import { useEffect, useState } from "react";
import App from "./App";
import AdminDashboard from "./AdminDashboard";
import { api } from "./api";

export default function DeviceRouter() {
  const [authenticated, setAuthenticated] = useState(false);
  const [adminAllowed, setAdminAllowed] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  useEffect(() => {
    let mounted = true;

    const checkAuth = async () => {
      try {
        const user = await api.getMe();
        if (!mounted) return;
        setAuthenticated(true);
        if (user.isAdmin) {
          await api.getAdminAccess();
          if (!mounted) return;
          setAdminAllowed(true);
        } else {
          setAdminAllowed(false);
        }
      } catch {
        if (!mounted) return;
        setAuthenticated(false);
        setAdminAllowed(false);
      } finally {
        if (mounted) setCheckingAdmin(false);
      }
    };

    void checkAuth();

    const handleSessionExpired = () => {
      if (!mounted) return;
      setAuthenticated(false);
      setAdminAllowed(false);
      setCheckingAdmin(false);
    };
    window.addEventListener("qtecnico-session-expired", handleSessionExpired);

    // App.tsx still writes a compatibility marker in localStorage. It is not
    // an authentication credential. Its only purpose here is to detect the
    // legacy logout action and revoke the real HttpOnly session server-side.
    const authTimer = window.setInterval(() => {
      const marker = localStorage.getItem("qtecnico_token");
      if (authenticated && !marker) {
        void api.logout().finally(() => {
          if (!mounted) return;
          setAuthenticated(false);
          setAdminAllowed(false);
          setCheckingAdmin(false);
        });
      } else if (!authenticated && marker) {
        setCheckingAdmin(true);
        void checkAuth();
      }
    }, 500);

    return () => {
      mounted = false;
      window.clearInterval(authTimer);
      window.removeEventListener("qtecnico-session-expired", handleSessionExpired);
    };
  }, [authenticated]);

  if (authenticated && !checkingAdmin && adminAllowed) return <AdminDashboard />;
  return <App />;
}
