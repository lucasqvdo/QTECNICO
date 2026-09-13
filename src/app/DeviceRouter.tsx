import { useEffect, useState } from "react";
import App from "./App";
import AdminDashboard from "./AdminDashboard";
import { api } from "./api";

function isAdminFromStoredSession() {
  return false;
}

export default function DeviceRouter() {
  const [authenticated, setAuthenticated] = useState(() => Boolean(localStorage.getItem("qtecnico_token")));
  const [adminAllowed, setAdminAllowed] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(() => Boolean(localStorage.getItem("qtecnico_token")));

  useEffect(() => {
    const checkAuth = async () => {
      const hasToken = Boolean(localStorage.getItem("qtecnico_token"));
      setAuthenticated(hasToken);

      if (!hasToken) {
        setAdminAllowed(false);
        setCheckingAdmin(false);
        return;
      }

      // Administrative authorization is role-based and independent of screen
      // size. An administrator gets the same admin experience on phone,
      // tablet and desktop; CSS/layout handles responsiveness.
      setCheckingAdmin(true);
      try {
        await api.getAdminAccess();
        setAdminAllowed(true);
      } catch {
        setAdminAllowed(false);
      } finally {
        setCheckingAdmin(false);
      }
    };

    void checkAuth();

    // The existing login flow writes the token in the same tab. Polling keeps
    // the router independent from the authentication screen.
    const authTimer = window.setInterval(() => {
      const hasToken = Boolean(localStorage.getItem("qtecnico_token"));
      setAuthenticated((current) => {
        if (current !== hasToken) void checkAuth();
        return hasToken;
      });
    }, 500);

    return () => window.clearInterval(authTimer);
  }, []);

  // Role, not device, determines the application experience.
  if (authenticated && !checkingAdmin && adminAllowed) {
    return <AdminDashboard />;
  }

  return <App />;
}
