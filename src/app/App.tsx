import { useState, useRef, useEffect } from "react";
import {
  ClipboardList, User, Plus, LogOut, ChevronRight, Clock, CheckCircle2,
  AlertCircle, XCircle, Camera, ArrowLeft, Search, MapPin, Phone, Mail,
  Calendar, Wrench, X, DollarSign, TrendingUp, TrendingDown, Trash2,
  Receipt, Users, FileText, Play, Square, Image, Download, Edit2, Save,
  BarChart2, BadgeCheck, Hourglass, CircleDollarSign,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import logoImg from "@/imports/ChatGPT_Image_8_de_jun._de_2026__11_15_09.png";
import { Screen, OrderStatus, ServiceOrder, Client, Attendance, AttendancePhoto, PaymentStatus } from "./types";
import { INITIAL_ORDERS } from "./ordersData";
import { INITIAL_CLIENTS } from "./clientsData";

/* ─── Configs ───────────────────────────────────────────────── */

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:     { label: "Pendente",      color: "#D97706", bg: "#FEF3C7", icon: <Clock size={12} /> },
  in_progress: { label: "Em andamento",  color: "#1D4ED8", bg: "#DBEAFE", icon: <Wrench size={12} /> },
  completed:   { label: "Concluída",     color: "#15803D", bg: "#DCFCE7", icon: <CheckCircle2 size={12} /> },
  cancelled:   { label: "Cancelada",     color: "#B91C1C", bg: "#FEE2E2", icon: <XCircle size={12} /> },
};

const PRIORITY_CONFIG = {
  high:   { label: "Alta",   color: "#EF4444" },
  medium: { label: "Média",  color: "#F97316" },
  low:    { label: "Baixa",  color: "#64748B" },
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDuration = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/* ─── PDF Export ────────────────────────────────────────────── */

function exportPDF(order: ServiceOrder, client?: Client, techName = "Técnico") {
  const totalExpenses = order.expenses.reduce((s, e) => s + e.amount, 0);
  const margem = order.clientValue - totalExpenses;
  const status = STATUS_CONFIG[order.status];

  const attendanceRows = order.attendances.map((att) => {
    const photoImgs = att.photos.map(p =>
      `<img src="${p.dataUrl}" style="width:180px;height:120px;object-fit:cover;border-radius:6px;margin:4px;" alt="${p.name}" />`
    ).join("");
    return `
      <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:12px;page-break-inside:avoid;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="font-weight:600;color:#1A2B4A;">Atendimento — ${fmtDateTime(att.startTime)}</span>
          <span style="background:#DBEAFE;color:#1D4ED8;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;">
            Duração: ${fmtDuration(att.durationSeconds)}
          </span>
        </div>
        <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 10px;">${att.description || "Sem descrição."}</p>
        ${att.photos.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:6px;">${photoImgs}</div>` : ""}
      </div>`;
  }).join("");

  const expenseRows = order.expenses.map(e =>
    `<tr><td style="padding:6px 0;color:#374151;">${e.label}</td><td style="padding:6px 0;text-align:right;font-weight:600;">${fmt(e.amount)}</td></tr>`
  ).join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>OS ${order.id} — QTecnico</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:Arial,sans-serif;color:#0D1B2E;padding:32px;font-size:14px;}
    h1{color:#1A2B4A;font-size:22px;margin-bottom:4px;}
    h2{color:#1A2B4A;font-size:15px;margin:20px 0 10px;}
    .badge{display:inline-block;padding:3px 12px;border-radius:999px;font-size:12px;font-weight:700;}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
    .card{border:1px solid #e2e8f0;border-radius:8px;padding:14px;}
    .label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748B;font-weight:600;margin-bottom:4px;}
    table{width:100%;border-collapse:collapse;}
    td{vertical-align:top;}
    .total-row td{font-weight:700;border-top:2px solid #e2e8f0;padding-top:8px;margin-top:4px;}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1A2B4A;padding-bottom:16px;margin-bottom:20px;}
    .logo-text{font-size:24px;font-weight:900;color:#1A2B4A;}
    .logo-text span{color:#29C5E8;}
    @media print{body{padding:20px;}}
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo-text">Q<span>Tecnico</span></div>
      <div style="color:#64748B;font-size:12px;margin-top:2px;">Gestão de Ordens de Serviço</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:18px;font-weight:700;color:#1A2B4A;">${order.id}</div>
      <div style="color:#64748B;font-size:12px;">${new Date(order.date + "T12:00:00").toLocaleDateString("pt-BR")}</div>
      <span class="badge" style="background:${STATUS_CONFIG[order.status].bg};color:${STATUS_CONFIG[order.status].color};margin-top:4px;">
        ${status.label}
      </span>
    </div>
  </div>

  <div class="grid2">
    <div class="card">
      <div class="label">Cliente</div>
      <div style="font-weight:700;font-size:15px;margin-bottom:6px;">${order.client}</div>
      ${client ? `<div style="color:#64748B;font-size:13px;">${client.document}</div>` : ""}
      <div style="color:#64748B;font-size:13px;margin-top:4px;">${order.address}</div>
      <div style="color:#64748B;font-size:13px;">${order.phone}</div>
    </div>
    <div class="card">
      <div class="label">Serviço</div>
      <div style="font-weight:700;font-size:15px;margin-bottom:6px;">${order.type}</div>
      <div style="color:#374151;font-size:13px;line-height:1.5;">${order.description}</div>
      <div style="margin-top:8px;font-size:12px;color:#64748B;">Técnico: <strong>${techName}</strong></div>
    </div>
  </div>

  <h2>Controle Financeiro</h2>
  <div class="card">
    <table>
      ${expenseRows}
      <tr class="total-row">
        <td>Total de custos</td>
        <td style="text-align:right;">${fmt(totalExpenses)}</td>
      </tr>
      <tr>
        <td style="padding-top:8px;">Valor do cliente</td>
        <td style="text-align:right;padding-top:8px;color:#1A2B4A;font-weight:700;">${fmt(order.clientValue)}</td>
      </tr>
      <tr>
        <td style="padding-top:4px;font-weight:700;">Margem</td>
        <td style="text-align:right;padding-top:4px;font-weight:700;color:${margem >= 0 ? "#15803D" : "#B91C1C"};">${fmt(margem)}</td>
      </tr>
    </table>
  </div>

  <h2>Registros de Atendimento (${order.attendances.length})</h2>
  ${order.attendances.length === 0
    ? `<p style="color:#64748B;font-style:italic;">Nenhum atendimento registrado.</p>`
    : attendanceRows}

  <div style="margin-top:32px;border-top:1px solid #e2e8f0;padding-top:12px;font-size:11px;color:#94A3B8;text-align:center;">
    Documento gerado pelo QTecnico em ${new Date().toLocaleString("pt-BR")}
  </div>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }
}

/* ─── App Root ──────────────────────────────────────────────── */

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [activeTab, setActiveTab] = useState<"orders" | "clients" | "financeiro" | "profile">("orders");
  const [orders, setOrders] = useState<ServiceOrder[]>(INITIAL_ORDERS);
  const [clients, setClients] = useState<Client[]>(INITIAL_CLIENTS);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<OrderStatus | "all">("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [techName, setTechName] = useState("Carlos Eduardo Mendes");
  const [techRole, setTechRole] = useState("Técnico Eletricista — CREA/SP 123456");
  const [techPhone, setTechPhone] = useState("(11) 99000-1234");
  const [techEmail, setTechEmail] = useState("carlos.mendes@qtecnico.com.br");
  const [editingProfile, setEditingProfile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogin = () => {
    if (loginEmail === "lucas.qtech@gmail.com" && loginPassword === "123456") {
      setScreen("orders"); setActiveTab("orders");
    } else setLoginError(true);
  };

  const handleUpdateOrder = (updated: ServiceOrder) => {
    setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
    setSelectedOrder(updated);
  };

  const handleAddOrder = (o: ServiceOrder) => {
    setOrders(prev => [o, ...prev]);
    setShowAddModal(false);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setProfilePhoto(URL.createObjectURL(file));
  };

  const filteredOrders = orders.filter(o => {
    const q = searchQuery.toLowerCase();
    const match = o.client.toLowerCase().includes(q) || o.id.toLowerCase().includes(q) || o.type.toLowerCase().includes(q);
    return match && (filterStatus === "all" || o.status === filterStatus);
  });

  const counts = {
    all: orders.length,
    pending: orders.filter(o => o.status === "pending").length,
    in_progress: orders.filter(o => o.status === "in_progress").length,
    completed: orders.filter(o => o.status === "completed").length,
  };

  if (screen === "login")
    return <LoginScreen email={loginEmail} password={loginPassword} error={loginError}
      onEmailChange={v => { setLoginEmail(v); setLoginError(false); }}
      onPasswordChange={v => { setLoginPassword(v); setLoginError(false); }}
      onLogin={handleLogin} />;

  const navItems: { key: typeof activeTab; label: string; icon: React.ReactNode }[] = [
    { key: "orders",     label: "Ordens de Serviço", icon: <ClipboardList size={20} /> },
    { key: "clients",    label: "Clientes",           icon: <Users size={20} /> },
    { key: "financeiro", label: "Financeiro",         icon: <BarChart2 size={20} /> },
    { key: "profile",    label: "Meu Perfil",         icon: <User size={20} /> },
  ];

  const tabLabel: Record<typeof activeTab, string> = {
    orders: "Ordens de Serviço", clients: "Clientes", financeiro: "Financeiro", profile: "Meu Perfil",
  };

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <header className="bg-primary text-primary-foreground px-4 pt-10 pb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setDrawerOpen(true)}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors flex-shrink-0" aria-label="Menu">
            <div className="flex flex-col gap-1.5 w-5">
              <span className="block h-0.5 bg-white rounded-full" />
              <span className="block h-0.5 bg-white rounded-full w-3" />
              <span className="block h-0.5 bg-white rounded-full" />
            </div>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-primary-foreground/60 uppercase tracking-widest font-medium">QTecnico</p>
            <h1 className="text-lg font-semibold mt-0.5 truncate">{tabLabel[activeTab]}</h1>
          </div>
        </div>
      </header>

      {/* Drawer overlay */}
      {drawerOpen && (
        <div className="absolute inset-0 z-40 flex" style={{ fontFamily: "'Inter', sans-serif" }}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />

          {/* Drawer panel */}
          <div className="relative w-72 h-full flex flex-col shadow-2xl" style={{ background: "var(--primary)" }}>
            {/* Drawer header */}
            <div className="px-5 pt-12 pb-6 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/10 flex items-center justify-center">
                  <ImageWithFallback src={logoImg} alt="QTecnico logo" className="w-9 h-9 object-contain" />
                </div>
                <div>
                  <p className="font-bold text-white text-base leading-tight">
                    Q<span style={{ color: "var(--accent)" }}>Tecnico</span>
                  </p>
                  <p className="text-xs text-white/50">{techName.split(" ")[0]}</p>
                </div>
              </div>
              <button onClick={() => setDrawerOpen(false)}
                className="p-2 rounded-xl hover:bg-white/10 transition-colors text-white/70 hover:text-white">
                <X size={18} />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
              {navItems.map(item => {
                const isActive = activeTab === item.key;
                return (
                  <button key={item.key}
                    onClick={() => { setActiveTab(item.key); setDrawerOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all"
                    style={isActive
                      ? { background: "rgba(255,255,255,0.15)", color: "white" }
                      : { color: "rgba(255,255,255,0.6)" }}>
                    <span style={{ color: isActive ? "var(--accent)" : "inherit" }}>{item.icon}</span>
                    <span className="font-semibold text-sm">{item.label}</span>
                    {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />}
                  </button>
                );
              })}
            </nav>

            {/* Drawer footer */}
            <div className="px-3 pb-8 flex-shrink-0 border-t border-white/10 pt-3">
              <button onClick={() => { setDrawerOpen(false); setScreen("login"); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all"
                style={{ color: "rgba(255,255,255,0.6)" }}>
                <LogOut size={20} />
                <span className="font-semibold text-sm">Sair</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-hidden relative">
        {activeTab === "orders" && (
          <OrdersTab orders={filteredOrders} allOrders={orders} searchQuery={searchQuery}
            filterStatus={filterStatus} counts={counts} onSearch={setSearchQuery}
            onFilterChange={s => setFilterStatus(s)} onSelectOrder={setSelectedOrder} />
        )}
        {activeTab === "clients" && (
          <ClientsTab clients={clients} orders={orders} onUpdate={setClients} />
        )}
        {activeTab === "financeiro" && (
          <FinanceiroTab orders={orders} onUpdate={o => setOrders(orders.map(x => x.id === o.id ? o : x))} />
        )}
        {activeTab === "profile" && (
          <ProfileTab name={techName} role={techRole} phone={techPhone} email={techEmail}
            photo={profilePhoto} editing={editingProfile} orders={orders}
            onEditToggle={() => setEditingProfile(!editingProfile)}
            onNameChange={setTechName} onRoleChange={setTechRole}
            onPhoneChange={setTechPhone} onEmailChange={setTechEmail}
            onPhotoClick={() => fileInputRef.current?.click()}
            onSave={() => setEditingProfile(false)} />
        )}

        {activeTab === "orders" && (
          <button onClick={() => setShowAddModal(true)}
            className="absolute bottom-6 right-6 w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform active:scale-95"
            style={{ background: "var(--primary)" }} aria-label="Nova OS">
            <Plus size={24} color="white" strokeWidth={2.5} />
          </button>
        )}
        {activeTab === "clients" && (
          <button onClick={() => { const ev = new CustomEvent("add-client"); window.dispatchEvent(ev); }}
            className="absolute bottom-6 right-6 w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform active:scale-95"
            style={{ background: "var(--primary)" }} aria-label="Novo cliente">
            <Plus size={24} color="white" strokeWidth={2.5} />
          </button>
        )}
      </main>

      {showAddModal && (
        <AddOrderModal clients={clients} orders={orders} onAdd={handleAddOrder} onClose={() => setShowAddModal(false)} />
      )}
      {selectedOrder && (
        <OrderDetail order={selectedOrder} client={clients.find(c => c.id === selectedOrder.clientId)}
          techName={techName} onClose={() => setSelectedOrder(null)} onUpdate={handleUpdateOrder} />
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
    </div>
  );
}

/* ─── Login ─────────────────────────────────────────────────── */

function LoginScreen({ email, password, error, onEmailChange, onPasswordChange, onLogin }: {
  email: string; password: string; error: boolean;
  onEmailChange: (v: string) => void; onPasswordChange: (v: string) => void; onLogin: () => void;
}) {
  const [remember, setRemember] = useState(() => localStorage.getItem("qtecnico_remember") === "true");
  const [showPass, setShowPass] = useState(false);

  // On mount: restore saved credentials if remember was on
  useEffect(() => {
    if (localStorage.getItem("qtecnico_remember") === "true") {
      const savedEmail = localStorage.getItem("qtecnico_email") || "";
      const savedPass  = localStorage.getItem("qtecnico_pass")  || "";
      if (savedEmail) onEmailChange(savedEmail);
      if (savedPass)  onPasswordChange(savedPass);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = () => {
    if (remember) {
      localStorage.setItem("qtecnico_remember", "true");
      localStorage.setItem("qtecnico_email", email);
      localStorage.setItem("qtecnico_pass",  password);
    } else {
      localStorage.removeItem("qtecnico_remember");
      localStorage.removeItem("qtecnico_email");
      localStorage.removeItem("qtecnico_pass");
    }
    onLogin();
  };

  const toggleRemember = () => {
    const next = !remember;
    setRemember(next);
    if (!next) {
      localStorage.removeItem("qtecnico_remember");
      localStorage.removeItem("qtecnico_email");
      localStorage.removeItem("qtecnico_pass");
    }
  };

  return (
    <div className="min-h-screen bg-primary flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex-1 flex flex-col justify-end px-6 pb-0">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-1">Bem-vindo!</h1>
          <p className="text-white/50 text-sm">Acesse sua conta para continuar.</p>
        </div>
      </div>
      <div className="bg-background rounded-t-3xl px-6 pt-8 pb-10">
        <div className="flex flex-col items-center mb-6">
          <ImageWithFallback src={logoImg} alt="QTecnico logo" className="w-24 h-24 object-contain" />
          <h2 className="text-2xl font-bold tracking-tight mt-2" style={{ color: "var(--primary)" }}>
            Q<span style={{ color: "var(--accent)" }}>Tecnico</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Gestão de Ordens de Serviço</p>
        </div>

        <p className="text-base font-semibold text-foreground mb-4">Entrar na sua conta</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">E-mail</label>
            <input type="email" value={email} onChange={e => onEmailChange(e.target.value)}
              placeholder="lucas.qtech@gmail.com"
              className="w-full px-4 py-3 rounded-xl bg-secondary text-foreground placeholder-muted-foreground text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
              onKeyDown={e => e.key === "Enter" && handleLogin()} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Senha</label>
            <div className="relative">
              <input type={showPass ? "text" : "password"} value={password} onChange={e => onPasswordChange(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 pr-12 rounded-xl bg-secondary text-foreground placeholder-muted-foreground text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                onKeyDown={e => e.key === "Enter" && handleLogin()} />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5">
                {showPass ? "Ocultar" : "Ver"}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-sm">
              <AlertCircle size={14} /><span>E-mail ou senha incorretos.</span>
            </div>
          )}

          {/* Lembrar de mim */}
          <button type="button" onClick={toggleRemember}
            className="flex items-center gap-3 w-full group">
            <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all"
              style={{
                borderColor: remember ? "var(--primary)" : "var(--border)",
                background: remember ? "var(--primary)" : "transparent",
              }}>
              {remember && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span className="text-sm text-foreground group-hover:text-primary transition-colors">Lembrar meus dados</span>
          </button>

          <button onClick={handleLogin}
            className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
            Entrar
          </button>

          <p className="text-xs text-muted-foreground text-center">
            Demo: <span className="font-mono">lucas.qtech@gmail.com</span> / <span className="font-mono">123456</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Orders Tab ─────────────────────────────────────────────── */

function OrdersTab({ orders, allOrders, searchQuery, filterStatus, counts, onSearch, onFilterChange, onSelectOrder }: {
  orders: ServiceOrder[]; allOrders: ServiceOrder[]; searchQuery: string; filterStatus: OrderStatus | "all";
  counts: Record<string, number>; onSearch: (v: string) => void;
  onFilterChange: (s: OrderStatus | "all") => void; onSelectOrder: (o: ServiceOrder) => void;
}) {
  const active = allOrders.filter(o => o.status !== "cancelled");
  const totalReceita = active.reduce((s, o) => s + o.clientValue, 0);
  const totalCusto = active.reduce((s, o) => s + o.expenses.reduce((a, e) => a + e.amount, 0), 0);
  const margem = totalReceita - totalCusto;

  const chips: { key: OrderStatus | "all"; label: string }[] = [
    { key: "all",        label: `Todas (${counts.all})` },
    { key: "pending",    label: `Pendentes (${counts.pending})` },
    { key: "in_progress",label: `Andamento (${counts.in_progress})` },
    { key: "completed",  label: `Concluídas (${counts.completed})` },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-4 pb-2 flex-shrink-0 grid grid-cols-3 gap-2">
        <MiniCard label="Receita" value={fmt(totalReceita)} color="var(--primary)"   icon={<DollarSign size={12} />} />
        <MiniCard label="Custos"  value={fmt(totalCusto)}   color="#D97706"          icon={<Receipt size={12} />} />
        <MiniCard label="Margem"  value={fmt(margem)}       color={margem >= 0 ? "#15803D" : "#B91C1C"} icon={margem >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />} />
      </div>
      <div className="px-4 pt-2 pb-2 flex-shrink-0">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={searchQuery} onChange={e => onSearch(e.target.value)} placeholder="Buscar cliente, tipo ou ID..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
      </div>
      <div className="px-4 pb-3 flex gap-2 overflow-x-auto flex-shrink-0" style={{ scrollbarWidth: "none" }}>
        {chips.map(f => (
          <button key={f.key} onClick={() => onFilterChange(f.key)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={filterStatus === f.key ? { background: "var(--primary)", color: "white" } : { background: "var(--secondary)", color: "var(--muted-foreground)" }}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-3">
        {orders.length === 0
          ? <div className="text-center py-16 text-muted-foreground text-sm"><ClipboardList size={36} className="mx-auto mb-3 opacity-30" />Nenhuma ordem encontrada.</div>
          : orders.map(o => <OrderCard key={o.id} order={o} onSelect={onSelectOrder} />)}
      </div>
    </div>
  );
}

function MiniCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="flex items-center gap-1 mb-1" style={{ color }}>{icon}<span className="text-xs font-semibold">{label}</span></div>
      <p className="text-sm font-bold text-foreground leading-tight">{value}</p>
    </div>
  );
}

function OrderCard({ order, onSelect }: { order: ServiceOrder; onSelect: (o: ServiceOrder) => void }) {
  const status = STATUS_CONFIG[order.status];
  const priority = PRIORITY_CONFIG[order.priority];
  const date = new Date(order.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const totalExp = order.expenses.reduce((s, e) => s + e.amount, 0);
  const margem = order.clientValue - totalExp;
  const hasActive = order.attendances.length > 0;

  return (
    <button onClick={() => onSelect(order)}
      className="w-full text-left bg-card rounded-2xl p-4 border border-border hover:border-primary/20 hover:shadow-sm transition-all active:scale-[0.99]">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">{order.client}</p>
          <p className="text-xs font-mono text-muted-foreground mt-0.5">{order.id}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {hasActive && <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-full">{order.attendances.length} atend.</span>}
          <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2.5">
        <MapPin size={11} /><span className="truncate">{order.address}</span>
      </div>
      <div className="flex items-center gap-2 mb-3 text-xs">
        <span className="font-semibold" style={{ color: "var(--primary)" }}>{fmt(order.clientValue)}</span>
        <span className="text-muted-foreground">· Custos {fmt(totalExp)}</span>
        {order.clientValue > 0 && (
          <span className="font-semibold" style={{ color: margem >= 0 ? "#15803D" : "#B91C1C" }}>
            · {margem >= 0 ? "+" : ""}{fmt(margem)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color: status.color, background: status.bg }}>
            {status.icon}{status.label}
          </span>
          {order.status !== "cancelled" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
              style={order.paymentStatus === "paid"
                ? { color: "#15803D", background: "#DCFCE7" }
                : { color: "#D97706", background: "#FEF3C7" }}>
              {order.paymentStatus === "paid" ? <BadgeCheck size={11} /> : <Hourglass size={11} />}
              {order.paymentStatus === "paid" ? "Recebido" : "A receber"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground"><Calendar size={11} />{date}</div>
      </div>
    </button>
  );
}

/* ─── Order Detail ───────────────────────────────────────────── */

function OrderDetail({ order, client, techName, onClose, onUpdate }: {
  order: ServiceOrder; client?: Client; techName: string;
  onClose: () => void; onUpdate: (o: ServiceOrder) => void;
}) {
  const [newExpLabel, setNewExpLabel] = useState("");
  const [newExpAmt, setNewExpAmt] = useState("");
  const [timerActive, setTimerActive] = useState(false);
  const [timerStart, setTimerStart] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [pendingDesc, setPendingDesc] = useState<string | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<AttendancePhoto[]>([]);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!timerActive || !timerStart) return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - timerStart.getTime()) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [timerActive, timerStart]);

  const startTimer = () => { setTimerStart(new Date()); setTimerActive(true); setElapsed(0); };

  const stopTimer = () => { setTimerActive(false); setPendingDesc(""); };

  const saveAttendance = () => {
    if (!timerStart || pendingDesc === null) return;
    const att: Attendance = {
      id: Date.now().toString(),
      startTime: timerStart.toISOString(),
      endTime: new Date().toISOString(),
      durationSeconds: elapsed,
      description: pendingDesc,
      photos: pendingPhotos,
    };
    onUpdate({ ...order, attendances: [...order.attendances, att] });
    setTimerStart(null); setElapsed(0); setPendingDesc(null); setPendingPhotos([]);
  };

  const addPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        setPendingPhotos(prev => [...prev, { id: Date.now() + file.name, dataUrl: ev.target!.result as string, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removePhoto = (id: string) => setPendingPhotos(prev => prev.filter(p => p.id !== id));
  const deleteAttPhoto = (attId: string, photoId: string) => {
    onUpdate({ ...order, attendances: order.attendances.map(a => a.id === attId ? { ...a, photos: a.photos.filter(p => p.id !== photoId) } : a) });
  };

  const status = STATUS_CONFIG[order.status];
  const priority = PRIORITY_CONFIG[order.priority];
  const dateStr = new Date(order.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const totalExp = order.expenses.reduce((s, e) => s + e.amount, 0);
  const margem = order.clientValue - totalExp;
  const margemPct = order.clientValue > 0 ? ((margem / order.clientValue) * 100).toFixed(1) : "0";

  const addExpense = () => {
    const amount = parseFloat(newExpAmt.replace(",", "."));
    if (!newExpLabel.trim() || isNaN(amount) || amount <= 0) return;
    onUpdate({ ...order, expenses: [...order.expenses, { id: Date.now().toString(), label: newExpLabel.trim(), amount }] });
    setNewExpLabel(""); setNewExpAmt("");
  };
  const removeExpense = (id: string) => onUpdate({ ...order, expenses: order.expenses.filter(e => e.id !== id) });
  const updateClientValue = (raw: string) => {
    const val = parseFloat(raw.replace(",", "."));
    onUpdate({ ...order, clientValue: isNaN(val) ? 0 : val });
  };

  return (
    <div className="absolute inset-0 bg-background z-20 flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="bg-primary text-primary-foreground px-4 pt-10 pb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><ArrowLeft size={18} /></button>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-xs text-primary-foreground/60">{order.id}</p>
            <h2 className="font-semibold text-base truncate">{order.type}</h2>
          </div>
          <button onClick={() => exportPDF(order, client, techName)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-white/10 transition-colors">
            <Download size={14} /> PDF
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-8">
        {/* Status */}
        <div className="flex gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ color: status.color, background: status.bg }}>
            {status.icon} {status.label}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-secondary text-foreground">
            <span className="w-2 h-2 rounded-full" style={{ background: priority.color }} /> Prioridade {priority.label}
          </span>
        </div>

        {/* Cliente */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Cliente</h3>
          <p className="font-semibold text-foreground">{order.client}</p>
          {client && <p className="text-xs text-muted-foreground font-mono">{client.document}</p>}
          <div className="space-y-2">
            <InfoRow icon={<MapPin size={13} />} text={order.address} />
            <InfoRow icon={<Phone size={13} />} text={order.phone} />
            <InfoRow icon={<Calendar size={13} />} text={dateStr} />
          </div>
        </div>

        {/* Descrição */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Descrição</h3>
          <p className="text-sm text-foreground leading-relaxed">{order.description}</p>
        </div>

        {/* ── Atendimento ──────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Atendimentos</h3>

          {/* Timer ativo */}
          {timerActive && (
            <div className="rounded-2xl p-4 text-center space-y-3" style={{ background: "var(--primary)" }}>
              <p className="text-primary-foreground/70 text-xs font-semibold uppercase tracking-widest">Atendimento em curso</p>
              <p className="text-5xl font-mono font-bold text-white tracking-widest">{fmtDuration(elapsed)}</p>
              <button onClick={stopTimer}
                className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                style={{ background: "#EF4444", color: "white" }}>
                <Square size={14} fill="white" /> Encerrar atendimento
              </button>
            </div>
          )}

          {/* Formulário pós-timer */}
          {!timerActive && pendingDesc !== null && (
            <div className="border border-dashed border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CheckCircle2 size={16} className="text-green-600" />
                Duração: <span className="font-mono">{fmtDuration(elapsed)}</span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">O que foi feito *</label>
                <textarea value={pendingDesc} onChange={e => setPendingDesc(e.target.value)} rows={3}
                  placeholder="Descreva as atividades realizadas neste atendimento..."
                  className="w-full px-3 py-2.5 rounded-xl bg-secondary text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
              </div>
              {/* Fotos */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Fotos ({pendingPhotos.length})</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {pendingPhotos.map(p => (
                    <div key={p.id} className="relative">
                      <img src={p.dataUrl} alt={p.name} className="w-20 h-20 object-cover rounded-xl border border-border" />
                      <button onClick={() => removePhoto(p.id)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                        <X size={10} color="white" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => photoRef.current?.click()}
                    className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary/40 transition-colors">
                    <Image size={18} /><span className="text-xs">Adicionar</span>
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setPendingDesc(null); setPendingPhotos([]); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-secondary text-muted-foreground transition-all active:scale-95">
                  Cancelar
                </button>
                <button onClick={saveAttendance} disabled={!pendingDesc?.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-40"
                  style={{ background: "var(--primary)" }}>
                  Salvar atendimento
                </button>
              </div>
            </div>
          )}

          {/* Botão iniciar */}
          {!timerActive && pendingDesc === null && order.status !== "cancelled" && (
            <button onClick={startTimer}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
              style={{ background: "var(--primary)", color: "white" }}>
              <Play size={15} fill="white" /> Iniciar atendimento
            </button>
          )}

          {/* Histórico */}
          {order.attendances.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Histórico ({order.attendances.length})</p>
              {order.attendances.map(att => (
                <AttendanceCard key={att.id} att={att} onDeletePhoto={pid => deleteAttPhoto(att.id, pid)} />
              ))}
            </div>
          )}
        </div>

        {/* Financeiro */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Financeiro</h3>
          <div className="grid grid-cols-3 gap-2">
            <FinCard label="Receita" value={order.clientValue} valueColor="var(--primary)" />
            <FinCard label="Custos"  value={totalExp}          valueColor="#D97706" />
            <FinCard label="Margem"  value={margem}            valueColor={margem >= 0 ? "#15803D" : "#B91C1C"} sub={`${margemPct}%`} />
          </div>
          {order.clientValue > 0 && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Custo / Receita</span>
                <span>{((totalExp / order.clientValue) * 100).toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, (totalExp / order.clientValue) * 100)}%`, background: totalExp > order.clientValue ? "#EF4444" : "var(--accent)" }} />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Valor do cliente (R$)</label>
            <input type="number" defaultValue={order.clientValue || ""} onBlur={e => updateClientValue(e.target.value)} placeholder="0,00"
              className="w-full px-4 py-2.5 rounded-xl bg-secondary text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Despesas</p>
            {order.expenses.length === 0
              ? <p className="text-xs text-muted-foreground italic py-1">Nenhuma despesa registrada.</p>
              : (
                <div className="space-y-2">
                  {order.expenses.map(exp => (
                    <div key={exp.id} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
                      <span className="flex-1 text-sm text-foreground truncate">{exp.label}</span>
                      <span className="text-sm font-semibold font-mono flex-shrink-0">{fmt(exp.amount)}</span>
                      <button onClick={() => removeExpense(exp.id)} className="p-1 rounded-lg hover:bg-red-50 transition-colors">
                        <Trash2 size={13} className="text-destructive" />
                      </button>
                    </div>
                  ))}
                  <div className="flex justify-between pt-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total</span>
                    <span className="text-sm font-bold" style={{ color: "var(--primary)" }}>{fmt(totalExp)}</span>
                  </div>
                </div>
              )}
            <div className="border border-dashed border-border rounded-xl p-3 space-y-2 mt-3">
              <div className="flex gap-2">
                <input value={newExpLabel} onChange={e => setNewExpLabel(e.target.value)} placeholder="Descrição"
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-secondary text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  onKeyDown={e => e.key === "Enter" && addExpense()} />
                <input value={newExpAmt} onChange={e => setNewExpAmt(e.target.value)} placeholder="R$ 0,00" type="number"
                  className="w-24 px-3 py-2 rounded-xl bg-secondary text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  onKeyDown={e => e.key === "Enter" && addExpense()} />
              </div>
              <button onClick={addExpense}
                className="w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                style={{ background: "var(--secondary)", color: "var(--primary)" }}>
                <Plus size={13} /> Adicionar despesa
              </button>
            </div>
          </div>
        </div>

        {order.status !== "completed" && order.status !== "cancelled" && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Alterar status</h3>
            <div className="flex gap-2 flex-wrap">
              {order.status === "pending" && <ActionBtn label="Iniciar" color="#1D4ED8" bg="#DBEAFE" onClick={() => onUpdate({ ...order, status: "in_progress" })} />}
              {order.status === "in_progress" && <ActionBtn label="Concluir" color="#15803D" bg="#DCFCE7" onClick={() => onUpdate({ ...order, status: "completed" })} />}
              <ActionBtn label="Cancelar" color="#B91C1C" bg="#FEE2E2" onClick={() => onUpdate({ ...order, status: "cancelled" })} />
            </div>
          </div>
        )}
      </div>

      <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={addPhoto} />
    </div>
  );
}

function AttendanceCard({ att, onDeletePhoto }: { att: Attendance; onDeletePhoto: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-secondary/50 hover:bg-secondary transition-colors">
        <div className="text-left">
          <p className="text-xs font-semibold text-foreground">{fmtDateTime(att.startTime)}</p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">Duração: {fmtDuration(att.durationSeconds)}</p>
        </div>
        <div className="flex items-center gap-2">
          {att.photos.length > 0 && <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-full">{att.photos.length} foto(s)</span>}
          <ChevronRight size={14} className="text-muted-foreground transition-transform" style={{ transform: expanded ? "rotate(90deg)" : "none" }} />
        </div>
      </button>
      {expanded && (
        <div className="px-4 py-3 space-y-3">
          <p className="text-sm text-foreground leading-relaxed">{att.description || <span className="italic text-muted-foreground">Sem descrição.</span>}</p>
          {att.photos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {att.photos.map(p => (
                <div key={p.id} className="relative">
                  <img src={p.dataUrl} alt={p.name} className="w-20 h-20 object-cover rounded-xl border border-border" />
                  <button onClick={() => onDeletePhoto(p.id)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                    <X size={10} color="white" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Clients Tab ────────────────────────────────────────────── */

/* ─── Financeiro Tab ─────────────────────────────────────────── */

type FinPeriod = "3m" | "6m" | "12m" | "all";

function FinanceiroTab({ orders, onUpdate }: { orders: ServiceOrder[]; onUpdate: (o: ServiceOrder) => void }) {
  const [period, setPeriod] = useState<FinPeriod>("6m");

  const now = new Date();
  const periodMonths: Record<FinPeriod, number> = { "3m": 3, "6m": 6, "12m": 12, all: 999 };

  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - periodMonths[period]);

  const activeOrders = orders.filter(o => o.status !== "cancelled");
  const filtered = activeOrders.filter(o => new Date(o.date + "T12:00:00") >= cutoff);

  const totalRecebido = filtered.filter(o => o.paymentStatus === "paid").reduce((s, o) => s + o.clientValue, 0);
  const totalAReceber = filtered.filter(o => o.paymentStatus === "pending").reduce((s, o) => s + o.clientValue, 0);
  const totalCustos   = filtered.reduce((s, o) => s + o.expenses.reduce((a, e) => a + e.amount, 0), 0);
  const margemLiq     = totalRecebido - filtered.filter(o => o.paymentStatus === "paid").reduce((s, o) => s + o.expenses.reduce((a, e) => a + e.amount, 0), 0);

  // Monthly bar chart data
  const monthsToShow = Math.min(periodMonths[period], 12);
  const monthlyData = Array.from({ length: monthsToShow }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (monthsToShow - 1 - i), 1);
    const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    const monthOrders = activeOrders.filter(o => {
      const od = new Date(o.date + "T12:00:00");
      return od.getFullYear() === d.getFullYear() && od.getMonth() === d.getMonth();
    });
    return {
      label,
      recebido: monthOrders.filter(o => o.paymentStatus === "paid").reduce((s, o) => s + o.clientValue, 0),
      aReceber: monthOrders.filter(o => o.paymentStatus === "pending").reduce((s, o) => s + o.clientValue, 0),
    };
  });

  // Donut data
  const donutData = [
    { name: "Recebido",  value: totalRecebido, color: "#15803D" },
    { name: "A receber", value: totalAReceber, color: "#D97706" },
  ].filter(d => d.value > 0);

  // Pending list
  const pendingOrders = filtered.filter(o => o.paymentStatus === "pending").sort((a, b) => a.date.localeCompare(b.date));

  const periods: { key: FinPeriod; label: string }[] = [
    { key: "3m", label: "3 meses" },
    { key: "6m", label: "6 meses" },
    { key: "12m", label: "12 meses" },
    { key: "all", label: "Tudo" },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4 pb-24">
        {/* Period filter */}
        <div className="flex gap-2">
          {periods.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className="flex-1 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={period === p.key ? { background: "var(--primary)", color: "white" } : { background: "var(--secondary)", color: "var(--muted-foreground)" }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <FinSummaryCard label="Recebido" value={totalRecebido} icon={<BadgeCheck size={16} />} color="#15803D" bg="#DCFCE7" />
          <FinSummaryCard label="A receber" value={totalAReceber} icon={<Hourglass size={16} />} color="#D97706" bg="#FEF3C7" />
          <FinSummaryCard label="Custos" value={totalCustos} icon={<Receipt size={16} />} color="#B91C1C" bg="#FEE2E2" />
          <FinSummaryCard label="Margem líquida" value={margemLiq} icon={<TrendingUp size={16} />} color={margemLiq >= 0 ? "#15803D" : "#B91C1C"} bg={margemLiq >= 0 ? "#DCFCE7" : "#FEE2E2"} />
        </div>

        {/* Donut chart */}
        {donutData.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Recebido vs A receber</h3>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={42} outerRadius={65} paddingAngle={3} dataKey="value">
                    {donutData.map((entry, i) => <Cell key={i} fill={entry.color} strokeWidth={0} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {donutData.map(d => (
                  <div key={d.name} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                      <span className="text-xs text-muted-foreground">{d.name}</span>
                    </div>
                    <span className="text-xs font-bold" style={{ color: d.color }}>{fmt(d.value)}</span>
                  </div>
                ))}
                <div className="pt-1 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Total</span>
                    <span className="text-xs font-bold text-foreground">{fmt(totalRecebido + totalAReceber)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Monthly bar chart */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Comparativo mensal</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData} barSize={12} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} width={36} />
              <Tooltip
                formatter={(value: number, name: string) => [fmt(value), name === "recebido" ? "Recebido" : "A receber"]}
                contentStyle={{ borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", fontSize: 12 }}
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
              />
              <Bar dataKey="recebido" fill="#15803D" radius={[4, 4, 0, 0]} />
              <Bar dataKey="aReceber" fill="#FCD34D" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 justify-center">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-3 h-2 rounded-sm bg-green-700 inline-block" /> Recebido</div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-3 h-2 rounded-sm bg-yellow-300 inline-block" /> A receber</div>
          </div>
        </div>

        {/* Pending payments list */}
        {pendingOrders.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              A receber ({pendingOrders.length})
            </h3>
            <div className="space-y-3">
              {pendingOrders.map(o => (
                <div key={o.id} className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{o.client}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs font-mono text-muted-foreground">{o.id}</p>
                      <span className="text-xs text-muted-foreground">·</span>
                      <p className="text-xs text-muted-foreground">{new Date(o.date + "T12:00:00").toLocaleDateString("pt-BR")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-bold text-sm text-amber-700">{fmt(o.clientValue)}</span>
                    <button
                      onClick={() => onUpdate({ ...o, paymentStatus: "paid", paidDate: new Date().toISOString().split("T")[0] })}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95"
                      style={{ background: "#DCFCE7", color: "#15803D" }}>
                      Receber
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FinSummaryCard({ label, value, icon, color, bg }: { label: string; value: number; icon: React.ReactNode; color: string; bg: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: bg }}>
      <div className="flex items-center gap-1.5 mb-2" style={{ color }}>
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="text-lg font-bold" style={{ color }}>{fmt(value)}</p>
    </div>
  );
}

/* ─── CRM helpers ────────────────────────────────────────────── */

type ContactRisk = "active" | "warning" | "danger" | "never";

const RISK_CONFIG: Record<ContactRisk, { label: string; color: string; bg: string; ring: string; days: string }> = {
  active:  { label: "Ativo",      color: "#15803D", bg: "#DCFCE7", ring: "#22C55E", days: "< 30 dias" },
  warning: { label: "Atenção",    color: "#D97706", bg: "#FEF3C7", ring: "#F59E0B", days: "30–90 dias" },
  danger:  { label: "Em risco",   color: "#B91C1C", bg: "#FEE2E2", ring: "#EF4444", days: "> 90 dias" },
  never:   { label: "Sem contato",color: "#64748B", bg: "#F1F5F9", ring: "#94A3B8", days: "Nunca" },
};

function getLastContact(clientId: string, orders: ServiceOrder[]): Date | null {
  const clientOrders = orders.filter(o => o.clientId === clientId && o.status !== "cancelled");
  if (clientOrders.length === 0) return null;
  const dates = clientOrders.flatMap(o => {
    const pts: Date[] = [new Date(o.date + "T12:00:00")];
    o.attendances.forEach(a => pts.push(new Date(a.startTime)));
    return pts;
  });
  return new Date(Math.max(...dates.map(d => d.getTime())));
}

function getRisk(lastContact: Date | null): ContactRisk {
  if (!lastContact) return "never";
  const days = Math.floor((Date.now() - lastContact.getTime()) / 86400000);
  if (days < 30) return "active";
  if (days <= 90) return "warning";
  return "danger";
}

function daysSince(date: Date | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function ClientsTab({ clients, orders, onUpdate }: { clients: Client[]; orders: ServiceOrder[]; onUpdate: (c: Client[]) => void }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ContactRisk | "all">("all");
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const handler = () => { setEditClient(null); setShowModal(true); };
    window.addEventListener("add-client", handler);
    return () => window.removeEventListener("add-client", handler);
  }, []);

  const saveClient = (c: Client) => {
    if (clients.find(x => x.id === c.id)) onUpdate(clients.map(x => x.id === c.id ? c : x));
    else onUpdate([c, ...clients]);
    setShowModal(false); setEditClient(null);
  };

  const deleteClient = (id: string) => onUpdate(clients.filter(c => c.id !== id));

  // Enrich each client with CRM data
  const enriched = clients.map(c => {
    const last = getLastContact(c.id, orders);
    const risk = getRisk(last);
    const days = daysSince(last);
    const clientOrders = orders.filter(o => o.clientId === c.id);
    const revenue = clientOrders.filter(o => o.status === "completed").reduce((s, o) => s + o.clientValue, 0);
    return { ...c, last, risk, days, clientOrders, revenue };
  });

  // Summary counts
  const counts = {
    danger:  enriched.filter(c => c.risk === "danger" || c.risk === "never").length,
    warning: enriched.filter(c => c.risk === "warning").length,
    active:  enriched.filter(c => c.risk === "active").length,
  };

  // Filter + search + sort by risk (danger first)
  const RISK_ORDER: Record<ContactRisk, number> = { danger: 0, never: 1, warning: 2, active: 3 };

  const visible = enriched
    .filter(c => {
      const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.document.includes(search) || c.phone.includes(search);
      const matchFilter = filter === "all" || c.risk === filter ||
        (filter === "danger" && c.risk === "never");
      return matchSearch && matchFilter;
    })
    .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]);

  return (
    <div className="h-full flex flex-col">
      {/* CRM summary */}
      <div className="px-4 pt-4 pb-2 flex-shrink-0 grid grid-cols-3 gap-2">
        <CrmSummaryCard label="Em risco" count={counts.danger}  color="#B91C1C" bg="#FEE2E2" onClick={() => setFilter(f => f === "danger" ? "all" : "danger")} active={filter === "danger"} />
        <CrmSummaryCard label="Atenção"  count={counts.warning} color="#D97706" bg="#FEF3C7" onClick={() => setFilter(f => f === "warning" ? "all" : "warning")} active={filter === "warning"} />
        <CrmSummaryCard label="Ativos"   count={counts.active}  color="#15803D" bg="#DCFCE7" onClick={() => setFilter(f => f === "active" ? "all" : "active")} active={filter === "active"} />
      </div>

      {/* Search */}
      <div className="px-4 pt-2 pb-3 flex-shrink-0">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, documento ou telefone..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-3">
        {visible.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            <Users size={36} className="mx-auto mb-3 opacity-30" />Nenhum cliente encontrado.
          </div>
        ) : visible.map(c => {
          const risk = RISK_CONFIG[c.risk];
          return (
            <div key={c.id} className="bg-card border border-border rounded-2xl p-4 transition-all hover:shadow-sm">
              <div className="flex items-start gap-3 mb-3">
                {/* Avatar with risk ring */}
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                    style={{ background: "var(--primary)" }}>
                    {c.name.charAt(0)}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card"
                    style={{ background: risk.ring }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{c.name}</p>
                      <p className="text-xs font-mono text-muted-foreground">{c.document}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => { setEditClient(c); setShowModal(true); }}
                        className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                        <Edit2 size={13} className="text-muted-foreground" />
                      </button>
                      <button onClick={() => deleteClient(c.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                        <Trash2 size={13} className="text-destructive" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact info */}
              <div className="space-y-1 mb-3 pl-[52px]">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone size={11} /><span>{c.phone}</span></div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail size={11} /><span className="truncate">{c.email}</span></div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin size={11} /><span className="truncate">{c.address}</span></div>
              </div>

              {/* CRM row */}
              <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-border">
                <div className="flex items-center gap-2">
                  {/* Risk badge */}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{ color: risk.color, background: risk.bg }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: risk.ring }} />
                    {risk.label}
                  </span>
                  {/* Days since */}
                  <span className="text-xs text-muted-foreground">
                    {c.days === null ? "Nunca contatado" : c.days === 0 ? "Hoje" : `${c.days}d atrás`}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {c.clientOrders.length > 0 && (
                    <span className="flex items-center gap-1">
                      <FileText size={11} />{c.clientOrders.length} OS
                    </span>
                  )}
                  {c.revenue > 0 && (
                    <span className="font-semibold" style={{ color: "var(--primary)" }}>{fmt(c.revenue)}</span>
                  )}
                </div>
              </div>

              {/* OS status pills */}
              {c.clientOrders.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-2 pl-0">
                  {(["pending","in_progress","completed","cancelled"] as OrderStatus[]).map(s => {
                    const n = c.clientOrders.filter(o => o.status === s).length;
                    if (!n) return null;
                    const sc = STATUS_CONFIG[s];
                    return <span key={s} className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: sc.bg, color: sc.color }}>{n} {sc.label}</span>;
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showModal && (
        <ClientModal client={editClient} onSave={saveClient} onClose={() => { setShowModal(false); setEditClient(null); }} />
      )}
    </div>
  );
}

function CrmSummaryCard({ label, count, color, bg, onClick, active }: {
  label: string; count: number; color: string; bg: string; onClick: () => void; active: boolean;
}) {
  return (
    <button onClick={onClick} className="rounded-xl p-3 text-left transition-all active:scale-95"
      style={{ background: active ? color : bg, border: `2px solid ${active ? color : "transparent"}` }}>
      <p className="text-xl font-bold" style={{ color: active ? "white" : color }}>{count}</p>
      <p className="text-xs font-semibold mt-0.5" style={{ color: active ? "rgba(255,255,255,0.85)" : color }}>{label}</p>
    </button>
  );
}

function ClientModal({ client, onSave, onClose }: { client: Client | null; onSave: (c: Client) => void; onClose: () => void }) {
  const [form, setForm] = useState<Client>(client ?? { id: Date.now().toString(), name: "", document: "", address: "", phone: "", email: "" });
  const valid = form.name.trim();
  return (
    <div className="absolute inset-0 z-30 flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="bg-background rounded-t-3xl p-6 pb-10 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-foreground">{client ? "Editar cliente" : "Novo cliente"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={18} className="text-muted-foreground" /></button>
        </div>
        <div className="space-y-3">
          <Field label="Nome / Razão social *" value={form.name}     onChange={v => setForm({ ...form, name: v })}     placeholder="Nome do cliente ou empresa" />
          <Field label="CPF / CNPJ"            value={form.document} onChange={v => setForm({ ...form, document: v })} placeholder="00.000.000/0001-00" />
          <Field label="Endereço"              value={form.address}  onChange={v => setForm({ ...form, address: v })}  placeholder="Rua, número — cidade, UF" />
          <Field label="Telefone"              value={form.phone}    onChange={v => setForm({ ...form, phone: v })}    placeholder="(00) 00000-0000" />
          <Field label="E-mail"               value={form.email}    onChange={v => setForm({ ...form, email: v })}    placeholder="contato@empresa.com.br" />
          <button onClick={() => valid && onSave(form)} disabled={!valid}
            className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-40"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
            {client ? "Salvar alterações" : "Cadastrar cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Add Order Modal ────────────────────────────────────────── */

function AddOrderModal({ clients, orders, onAdd, onClose }: {
  clients: Client[]; orders: ServiceOrder[]; onAdd: (o: ServiceOrder) => void; onClose: () => void;
}) {
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [type, setType] = useState("");
  const [priority, setPriority] = useState<ServiceOrder["priority"]>("medium");
  const [description, setDescription] = useState("");
  const [clientValue, setClientValue] = useState("");

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.document.includes(clientSearch)
  );

  const handleAdd = () => {
    if (!selectedClient || !type.trim()) return;
    const id = `OS-2406-${String(orders.length + 1).padStart(3, "0")}`;
    onAdd({
      id, clientId: selectedClient.id, client: selectedClient.name,
      address: selectedClient.address, phone: selectedClient.phone,
      type, status: "pending", date: new Date().toISOString().split("T")[0],
      priority, description,
      clientValue: parseFloat(clientValue.replace(",", ".")) || 0,
      expenses: [], attendances: [],
    });
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="bg-background rounded-t-3xl p-6 pb-10 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-foreground">Nova Ordem de Serviço</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={18} className="text-muted-foreground" /></button>
        </div>
        <div className="space-y-3">
          {/* Client picker */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Cliente *</label>
            {selectedClient ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary border-2 border-primary/20">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{selectedClient.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{selectedClient.document}</p>
                </div>
                <button onClick={() => setSelectedClient(null)} className="p-1 rounded-lg hover:bg-red-50 transition-colors">
                  <X size={14} className="text-muted-foreground" />
                </button>
              </div>
            ) : (
              <button onClick={() => setShowPicker(!showPicker)}
                className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-secondary text-sm text-muted-foreground text-left hover:bg-muted transition-colors">
                <Search size={15} /> Selecionar cliente...
              </button>
            )}
            {showPicker && !selectedClient && (
              <div className="mt-2 border border-border rounded-xl overflow-hidden bg-card shadow-lg">
                <div className="p-2 border-b border-border">
                  <input value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="Buscar..."
                    className="w-full px-3 py-2 rounded-lg bg-secondary text-sm text-foreground outline-none" autoFocus />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {filtered.length === 0
                    ? <p className="text-xs text-muted-foreground text-center py-4">Nenhum cliente encontrado.</p>
                    : filtered.map(c => (
                      <button key={c.id} onClick={() => { setSelectedClient(c); setShowPicker(false); setClientSearch(""); }}
                        className="w-full text-left px-4 py-3 hover:bg-secondary transition-colors border-b border-border last:border-0">
                        <p className="font-semibold text-sm text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{c.document}</p>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          <Field label="Tipo de serviço *" value={type} onChange={setType} placeholder="ex: Instalação Elétrica" />
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Valor do cliente (R$)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
              <input type="number" value={clientValue} onChange={e => setClientValue(e.target.value)} placeholder="0,00"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-secondary text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          </div>
          <Field label="Descrição" value={description} onChange={setDescription} placeholder="Detalhes do serviço..." textarea />
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Prioridade</label>
            <div className="flex gap-2">
              {(["low","medium","high"] as const).map(p => (
                <button key={p} onClick={() => setPriority(p)}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
                  style={priority === p ? { background: PRIORITY_CONFIG[p].color, color: "white" } : { background: "var(--secondary)", color: "var(--muted-foreground)" }}>
                  {PRIORITY_CONFIG[p].label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleAdd} disabled={!selectedClient || !type.trim()}
            className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-40"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
            Criar Ordem de Serviço
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Profile Tab ────────────────────────────────────────────── */

function ProfileTab({ name, role, phone, email, photo, editing, orders, onEditToggle, onNameChange, onRoleChange, onPhoneChange, onEmailChange, onPhotoClick, onSave }: {
  name: string; role: string; phone: string; email: string; photo: string | null; editing: boolean; orders: ServiceOrder[];
  onEditToggle: () => void; onNameChange: (v: string) => void; onRoleChange: (v: string) => void;
  onPhoneChange: (v: string) => void; onEmailChange: (v: string) => void; onPhotoClick: () => void; onSave: () => void;
}) {
  const done = orders.filter(o => o.status === "completed");
  const totalReceita = done.reduce((s, o) => s + o.clientValue, 0);
  const totalCusto = done.reduce((s, o) => s + o.expenses.reduce((a, e) => a + e.amount, 0), 0);
  const totalAtend = orders.reduce((s, o) => s + o.attendances.length, 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 pb-24 space-y-4">
        <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-secondary flex items-center justify-center border-2" style={{ borderColor: "var(--primary)" }}>
              {photo ? <img src={photo} alt="Foto" className="w-full h-full object-cover" /> : <span className="text-3xl font-bold text-primary">{name.charAt(0)}</span>}
            </div>
            <button onClick={onPhotoClick} className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center shadow-md" style={{ background: "var(--accent)" }}>
              <Camera size={14} color="#0D1B2E" />
            </button>
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">{name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{role}</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Informações</h3>
            <button onClick={editing ? onSave : onEditToggle}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all"
              style={{ background: editing ? "var(--primary)" : "var(--secondary)", color: editing ? "white" : "var(--foreground)" }}>
              {editing ? <><Save size={12} /> Salvar</> : <><Edit2 size={12} /> Editar</>}
            </button>
          </div>
          <div className="space-y-4">
            <ProfileField label="Nome completo" value={name}  editing={editing} onChange={onNameChange}  icon={<User size={14} />} />
            <ProfileField label="Cargo / Registro" value={role} editing={editing} onChange={onRoleChange} icon={<Wrench size={14} />} />
            <ProfileField label="Telefone"        value={phone} editing={editing} onChange={onPhoneChange} icon={<Phone size={14} />} />
            <ProfileField label="E-mail"          value={email} editing={editing} onChange={onEmailChange} icon={<Mail size={14} />} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Resumo de Atividade</h3>
          <div className="grid grid-cols-4 gap-2">
            <Stat value={String(orders.length)}                                             label="OS Total" />
            <Stat value={String(orders.filter(o => o.status === "in_progress").length)}     label="Andamento" color="#1D4ED8" />
            <Stat value={String(orders.filter(o => o.status === "completed").length)}       label="Concluídas" color="#15803D" />
            <Stat value={String(totalAtend)}                                                label="Atend." color="var(--accent)" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Financeiro (Concluídas)</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><DollarSign size={14} style={{ color: "var(--primary)" }} /><span>Receita bruta</span></div>
              <span className="font-bold text-sm" style={{ color: "var(--primary)" }}>{fmt(totalReceita)}</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Receipt size={14} className="text-amber-500" /><span>Custos totais</span></div>
              <span className="font-bold text-sm text-amber-600">{fmt(totalCusto)}</span>
            </div>
            <div className="h-px bg-border" />
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {totalReceita - totalCusto >= 0 ? <TrendingUp size={14} className="text-green-600" /> : <TrendingDown size={14} className="text-red-600" />}
                <span>Resultado</span>
              </div>
              <span className="font-bold text-base" style={{ color: totalReceita - totalCusto >= 0 ? "#15803D" : "#B91C1C" }}>{fmt(totalReceita - totalCusto)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────── */

function Field({ label, value, onChange, placeholder, textarea }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; textarea?: boolean;
}) {
  const cls = "w-full px-4 py-3 rounded-xl bg-secondary text-foreground placeholder-muted-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none";
  return (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{label}</label>
      {textarea ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} className={cls} />
                : <input   value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />}
    </div>
  );
}

function InfoRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2 text-sm text-muted-foreground">
      <span className="mt-0.5 flex-shrink-0">{icon}</span><span>{text}</span>
    </div>
  );
}

function ActionBtn({ label, color, bg, onClick }: { label: string; color: string; bg: string; onClick: () => void }) {
  return <button onClick={onClick} className="px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95" style={{ color, background: bg }}>{label}</button>;
}

function FinCard({ label, value, valueColor, sub }: { label: string; value: number; valueColor: string; sub?: string }) {
  return (
    <div className="bg-secondary rounded-xl p-3 text-center">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-bold leading-tight" style={{ color: valueColor }}>{fmt(value)}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function ProfileField({ label, value, editing, onChange, icon }: {
  label: string; value: string; editing: boolean; onChange: (v: string) => void; icon: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{icon} {label}</label>
      {editing
        ? <input value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-secondary text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20" />
        : <p className="text-sm text-foreground pl-1">{value}</p>}
    </div>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div className="text-center bg-secondary rounded-xl py-3">
      <p className="text-xl font-bold" style={{ color: color || "var(--primary)" }}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function TabBtn({ active, label, icon, onClick }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex-1 flex flex-col items-center gap-1 py-3 transition-all" style={{ color: active ? "var(--primary)" : "var(--muted-foreground)" }}>
      {icon}
      <span className="text-xs font-semibold">{label}</span>
      {active && <span className="w-1 h-1 rounded-full" style={{ background: "var(--accent)" }} />}
    </button>
  );
}
