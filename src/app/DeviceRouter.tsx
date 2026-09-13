import { useEffect, useState } from "react";
import App from "./App";
import AdminDashboard from "./AdminDashboard";

const DESKTOP_TABLET_QUERY = "(min-width: 768px)";

function isDesktopOrTablet() {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_TABLET_QUERY).matches;
}

export default function DeviceRouter() {
  const [desktopOrTablet, setDesktopOrTablet] = useState(isDesktopOrTablet);
  const [authenticated, setAuthenticated] = useState(() => Boolean(localStorage.getItem("qtecnico_token")));

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_TABLET_QUERY);
    const updateDevice = () => setDesktopOrTablet(media.matches);
    const updateAuth = () => setAuthenticated(Boolean(localStorage.getItem("qtecnico_token")));

    updateDevice();
    updateAuth();
    media.addEventListener("change", updateDevice);

    // The existing mobile login writes the token in the same tab. Polling only
    // localStorage keeps the router independent from the authentication screen.
    const authTimer = window.setInterval(updateAuth, 500);
    window.addEventListener("storage", updateAuth);

    return () => {
      media.removeEventListener("change", updateDevice);
      window.clearInterval(authTimer);
      window.removeEventListener("storage", updateAuth);
    };
  }, []);

  if (desktopOrTablet && authenticated) return <AdminDashboard />;
  return <App />;
}
