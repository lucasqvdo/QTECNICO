import { useEffect, useState } from "react";
import App from "./App";
import AdminDashboard from "./AdminDashboardV2";
import { api } from "./api";

export default function DeviceRouter() {
  // Start from the normal application instead of a blocking splash screen.
  // Authentication is resolved in the background; this prevents a slow,
  // cached, offline or interrupted /users/me request from trapping the user
  // on the blue loading screen on tablets and desktop browsers.
  const [adminAllowed, setAdminAllowed] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;
    let timeoutId: number | undefined;
    let settled = false;

    const finish = (admin: boolean) => {
      if (!mounted || settled) return;
      settled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      setAdminAllowed(admin);
      setShowAdmin(admin);
    };

    const checkAuth = async () => {
      try {
        const user = await api.getMe();
        if (!mounted) return;

        if (user.isAdmin) {
          try {
            await api.getAdminAccess();
            finish(true);
          } catch {
            finish(false);
          }
        } else {
          finish(false);
        }
      } catch {
        finish(false);
      }
    };

    // Never block the application waiting for authentication.
    timeoutId = window.setTimeout(() => finish(false), 5000);
    void checkAuth();

    const handleAuthenticated = () => {
      if (!mounted) return;
      settled = false;
      setShowAdmin(false);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => finish(false), 5000);
      void checkAuth();
    };

    const handleSessionExpired = () => {
      if (!mounted) return;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      settled = true;
      setAdminAllowed(false);
      setShowAdmin(false);
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

  if (showAdmin && adminAllowed) return <AdminDashboard />;
  return <App />;
}
