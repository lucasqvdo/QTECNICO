import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import DeviceRouter from "./app/DeviceRouter";
import "./styles/index.css";

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(<DeviceRouter />);
