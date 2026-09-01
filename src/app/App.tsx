import { useState, useRef, useEffect } from "react";
import { ClipboardList, User, Plus, LogOut, Users, BarChart2, X } from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import logoImg from "@/imports/ChatGPT_Image_8_de_jun._de_2026__11_15_09.png";
import { Screen, OrderStatus, ServiceOrder, Client } from "./types";
import { api } from "./api";
import { LoginScreen } from "./components/LoginScreen";
import { OrdersTab } from "./components/OrdersTab";
import { OrderDetail } from "./components/OrderDetail";
import { FinanceiroTab } from "./components/FinanceiroTab";
import { ClientsTab } from "./components/ClientsTab";
import { AddOrderModal } from "./components/AddOrderModal";
import { ProfileTab } from "./components/ProfileTab";
import { InstallPrompt } from "./components/InstallPrompt";

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [activeTab, setActiveTab] = useState<"orders" | "clients" | "financeiro" | "profile">("orders");
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<OrderStatus | "all">("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [profilePhotoKey, setProfilePhotoKey] = useState<string | null>(null);
  const [techName, setTechName] = useState("Carlos Eduardo Mendes");
  const [techRole, setTechRole] = useState("Técnico Eletricista — CREA/SP 123456");
  const [techPhone, setTechPhone] = useState("(11) 99000-1234");
  const [techEmail, setTechEmail] = useState("carlos.mendes@qtecnico.com.br");
  const [editingProfile, setEditingProfile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyUser = (user: { name: string; role: string; phone: string; email: string; photoUrl?: string | null; photoKey?: string | null }) => {
    setTechName(user.name);
    setTechRole(user.role);
    setTechPhone(user.phone);
    setTechEmail(user.email);
    if (user.photoUrl) setProfilePhoto(user.photoUrl);
    if (user.photoKey) setProfilePhotoKey(user.photoKey);
  };

  const loadData = async () => {
    const [fetchedOrders, fetchedClients, user] = await Promise.all([
      api.getOrders(), api.getClients(), api.getMe(),
    ]);
    setOrders(fetchedOrders);
    setClients(fetchedClients);
    applyUser(user);
  };

  useEffect(() => {
    const token = localStorage.getItem("qtecnico_token");
    if (token) {
      loadData()
        .then(() => { setScreen("orders"); setActiveTab("orders"); })
        .catch(() => localStorage.removeItem("qtecnico_token"));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const afterAuth = async (token: string, user: { name: string; role: string; phone: string; email: string; photoUrl?: string | null; photoKey?: string | null }) => {
    localStorage.setItem("qtecnico_token", token);
    applyUser(user);
    const [fetchedOrders, fetchedClients] = await Promise.all([api.getOrders(), api.getClients()]);
    setOrders(fetchedOrders);
    setClients(fetchedClients);
    setScreen("orders"); setActiveTab("orders"); setLoginError(false);
  };

  const handleLogin = async () => {
    try {
      const { token, user } = await api.login(loginEmail, loginPassword);
      await afterAuth(token, user);
    } catch {
      setLoginError(true);
    }
  };

  const handleRegister = async (name: string, email: string, password: string) => {
    const { token, user } = await api.register(name, email, password);
    await afterAuth(token, user);
  };

  const handleForgotPassword = async (email: string) => {
    return await api.forgotPassword(email);
  };

  const handleUpdateOrder = async (updated: ServiceOrder) => {
    try {
      const saved = await api.updateOrder(updated);
      setOrders(prev => prev.map(o => o.id === saved.id ? saved : o));
      setSelectedOrder(saved);
    } catch (e) { console.error("Erro ao atualizar OS:", e); }
  };

  const handleAddOrder = async (o: ServiceOrder) => {
    try {
      const created = await api.createOrder(o);
      setOrders(prev => [created, ...prev]);
      setShowAddModal(false);
    } catch (e) { console.error("Erro ao criar OS:", e); }
  };

  const handleSaveClient = async (c: Client) => {
    try {
      if (clients.find(x => x.id === c.id)) {
        const updated = await api.updateClient(c);
        setClients(prev => prev.map(x => x.id === updated.id ? updated : x));
      } else {
        const created = await api.createClient(c);
        setClients(prev => [created, ...prev]);
      }
    } catch (e) { console.error("Erro ao salvar cliente:", e); }
  };

  const handleDeleteClient = async (id: string) => {
    try {
      await api.deleteClient(id);
      setClients(prev => prev.filter(c => c.id !== id));
    } catch (e) { console.error("Erro ao deletar cliente:", e); }
  };

  const handleSaveProfile = async () => {
    try {
      await api.updateProfile({ name: techName, role: techRole, phone: techPhone, email: techEmail, photoUrl: profilePhoto, photoKey: profilePhotoKey });
    } catch (e) { console.error("Erro ao salvar perfil:", e); }
    setEditingProfile(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("qtecnico_token");
    setOrders([]); setClients([]);
    setScreen("login");
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { key, url } = await api.uploadPhoto(file, 'profiles');
      setProfilePhoto(url);
      setProfilePhotoKey(key);
    } catch (err) {
      console.error("Erro ao enviar foto de perfil:", err);
    }
    e.target.value = "";
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
      onLogin={handleLogin} onRegister={handleRegister} onForgotPassword={handleForgotPassword} />;

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

      {/* Drawer */}
      {drawerOpen && (
        <div className="absolute inset-0 z-40 flex" style={{ fontFamily: "'Inter', sans-serif" }}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="relative w-72 h-full flex flex-col shadow-2xl" style={{ background: "var(--primary)" }}>
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
            <div className="px-3 pb-8 flex-shrink-0 border-t border-white/10 pt-3">
              <button onClick={() => { setDrawerOpen(false); handleLogout(); }}
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
          <ClientsTab clients={clients} orders={orders} onSave={handleSaveClient} onDelete={handleDeleteClient} />
        )}
        {activeTab === "financeiro" && (
          <FinanceiroTab orders={orders} onUpdate={handleUpdateOrder} />
        )}
        {activeTab === "profile" && (
          <ProfileTab name={techName} role={techRole} phone={techPhone} email={techEmail}
            photo={profilePhoto} editing={editingProfile} orders={orders}
            onEditToggle={() => setEditingProfile(!editingProfile)}
            onNameChange={setTechName} onRoleChange={setTechRole}
            onPhoneChange={setTechPhone} onEmailChange={setTechEmail}
            onPhotoClick={() => fileInputRef.current?.click()}
            onSave={handleSaveProfile} />
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

      {/* Banner de instalação da PWA — aparece automaticamente quando elegível */}
      <InstallPrompt />
    </div>
  );
}
