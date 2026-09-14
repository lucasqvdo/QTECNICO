import { createRoot } from "react-dom/client";
import DeviceRouter from "./app/DeviceRouter";
import "./styles/index.css";

const registerPwa = () => {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").then((registration) => {
      void registration.update();

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!sessionStorage.getItem("qtecnico-pwa-reloaded")) {
          sessionStorage.setItem("qtecnico-pwa-reloaded", "1");
          window.location.reload();
        }
      });
    }).catch(() => {
      // PWA registration is optional and must not block the application.
    });
  });
};

registerPwa();

createRoot(document.getElementById("root")!).render(<DeviceRouter />);
