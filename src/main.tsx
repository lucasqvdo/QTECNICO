import { createRoot } from "react-dom/client";
import DeviceRouter from "./app/DeviceRouter";
import "./styles/index.css";

const registerPwa = () => {
  if (!("serviceWorker" in navigator)) return;

  // Listen before registration so the legacy worker can be replaced and
  // the self-destroying migration worker can take control immediately.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!sessionStorage.getItem("qtecnico-pwa-reloaded")) {
      sessionStorage.setItem("qtecnico-pwa-reloaded", "1");
      window.location.reload();
    }
  });

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
      void registration.update();
    }).catch(() => {
      // PWA registration is optional and must not block the application.
    });
  });
};

registerPwa();

createRoot(document.getElementById("root")!).render(<DeviceRouter />);
