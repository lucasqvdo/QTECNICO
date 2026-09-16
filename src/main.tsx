import React from "react";
import { createRoot } from "react-dom/client";
import DeviceRouter from "./app/DeviceRouter";
import PricingPage from "./app/PricingPage";
import BackofficeLogin from "./app/BackofficeLogin";
import BackofficeDashboard from "./app/BackofficeDashboard";
import BackofficeBilling from "./app/BackofficeBilling";
import "./styles/index.css";

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("QTecnico render error:", error); }
  render() {
    if (this.state.error) return <div className="min-h-screen bg-white flex items-center justify-center p-6"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"><h1 className="text-xl font-bold text-slate-900">Não foi possível carregar o QTecnico</h1><p className="mt-2 text-sm text-slate-500">O aplicativo encontrou um erro ao montar a tela. Tente recarregar.</p><button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white">Recarregar</button></div></div>;
    return this.props.children;
  }
}

const root = createRoot(document.getElementById("root")!);
const path = window.location.pathname;
const page = path === "/planos" ? <PricingPage /> : path === "/backoffice/login" ? <BackofficeLogin /> : path === "/backoffice/billing" ? <BackofficeBilling /> : path === "/backoffice" ? <BackofficeDashboard /> : <DeviceRouter />;
root.render(<AppErrorBoundary>{page}</AppErrorBoundary>);
