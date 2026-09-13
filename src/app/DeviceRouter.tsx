import { useEffect, useState } from "react";
import App from "./App";
import AdminDashboard from "./AdminDashboard";
import { api } from "./api";

const DESKTOP_TABLET_QUERY = "(min-width: 768px)";

function isDesktopOrTablet() {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_TABLET_QUERY).matches;
}

export default function DeviceRouter() {
  const [desktopOrTablet, setDesktopOrTablet] = useState(isDesktopOrTablet);
  const [authenticated, setAuthenticated] = useState(() => Boolean(localStorage.getItem("qtecnico_token")));
  const [adminAllowed, setAdminAllowed] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(() => Boolean(localStorage.getItem("qtecnico_token")));

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_TABLET_QUERY);
    const updateDevice = () => setDesktopOrTablet(media.matches);

    const checkAuth = async () => {
      const hasToken = Boolean(localStorage.getItem("qtecnico_token"));
      setAuthenticated(hasToken);

      if (!hasToken) {
        setAdminAllowed(false);
        setCheckingAdmin(false);
        return;
      }

      // Device size only selects the experience. The backend decides whether
      // the authenticated account is actually allowed to enter the admin area.
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

    updateDevice();
    void checkAuth();
    media.addEventListener("change", updateDevice);

    // The existing login flow writes the token in the same tab. Polling keeps
    // the device router independent from the authentication screen.
    const authTimer = window.setInterval(() => {
      const hasToken = Boolean(localStorage.getItem("qtecnico_token"));
      setAuthenticated((current) => {
        if (current !== hasToken) void checkAuth();
        return hasToken;
      });
    }, 500);

    return () => {
      media.removeEventListener("change", updateDevice);
      window.clearInterval(authTimer);
    };
  }, []);

  if (desktopOrTablet && authenticated && !checkingAdmin && adminAllowed) {
    return <AdminDashboard />;
  }

  return <App />;
}
