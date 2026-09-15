import { createRoot } from "react-dom/client";
import DeviceRouter from "./app/DeviceRouter";
import "./styles/index.css";

// PWA registration is intentionally disabled for the browser application.
// A previous service worker could serve an obsolete index/asset manifest and
// cause missing CSS to be returned as the SPA HTML. The app remains fully
// usable in the browser and can be installed by the browser without this
// runtime registration until the PWA cache strategy is reworked safely.
createRoot(document.getElementById("root")!).render(<DeviceRouter />);
