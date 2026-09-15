import { createRoot } from "react-dom/client";
import DeviceRouter from "./app/DeviceRouter";
import { installMobileCacheRecovery } from "./mobile-cache-recovery";
import "./styles/index.css";

// Clean obsolete service workers/cache before the app boots. This is intentionally
// runtime-only: the application does not register a new service worker.
installMobileCacheRecovery();

createRoot(document.getElementById("root")!).render(<DeviceRouter />);
