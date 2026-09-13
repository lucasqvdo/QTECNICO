import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  DollarSign,
  LogOut,
  Menu,
  Users,
  Wrench,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "./api";
import type { Client, OrderStatus, ServiceOrder } from "./types";

const STATUS: Record<OrderStatus, { label: string; className: string }> = {
  pending: { label: "Pendente", className: "bg-amber-100 text-amber-700" },
  in_progress: { label: "Em andamento", className: "bg-blue-100 text-blue-700" },
  completed: { label: "Concluída", className: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Cancelada", className: "bg-red-100 text-red-700" },
};

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function StatCard({ icon: Icon, label, value, detail }: { icon: typeof ClipboardList; label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
          {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
        </div>
        <div className="rounded-xl bg-cyan-50 p-3 text-cyan-600"><Icon size={21} /></div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [user, setUser] = useState<{ name: string; role: string }>({ name: "Usuário", role: "Administrador" });
  const [period, setPeriod] = useState("all");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [loadedOrders, loadedClients, loadedUser] = await Promise.all([
        api.getOrders(),
        api.getClients(),
        api.getMe(),
      ]);
      setOrders(loadedOrders);
      setClients(loadedClients);
      setUser({ name: loadedUser.name, role: loadedUser.role });
    } catch {
      setError("Não foi possível carregar os dados. Faça login novamente.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filteredOrders = useMemo(() => {
    let result = orders;
    if (statusFilter !== "all") result = result.filter((order) => order.status === statusFilter);
    if (period !== "all") {
      const days = Number(period);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      result = result.filter((order) => new Date(order.date + "T23:59:59") >= cutoff);
    }
    return result;
  }, [orders, period, statusFilter]);

  const stats = useMemo(() => {
    const revenue = filteredOrders.reduce((sum, order) => sum + order.clientValue, 0);
    const paid = filteredOrders.reduce((sum, order) => {
      if (order.payments?.length) return sum + order.payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
      return sum + (order.paymentStatus === "paid" ? (order.paidAmount ?? order.clientValue) : 0);
    }, 0);
    const costs = filteredOrders.reduce((sum, order) => sum + order.expenses.reduce((s, e) => s + e.amount, 0), 0);
    return {
      total: filteredOrders.length,
      pending: filteredOrders.filter((o) => o.status === "pending").length,
      progress: filteredOrders.filter((o) => o.status === "in_progress").length,
      completed: filteredOrders.filter((o) => o.status === "completed").length,
      revenue,
      paid,
      costs,
      margin: revenue - costs,
    };
  }, [filteredOrders]);

  const statusData = [
    { name: "Pendentes", value: stats.pending },
    { name: "Em andamento", value: stats.progress },
    { name: "Concluídas", value: stats.completed },
    { name: "Canceladas", value: filteredOrders.filter((o) => o.status === "cancelled").length },
  ].filter((item) => item.value > 0);

  const monthData = useMemo(() => {
    const map = new Map<string, { name: string; valor: number; ordens: number }>();
    filteredOrders.forEach((order) => {
      const date = new Date(order.date + "T12:00:00");
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const current = map.get(key) ?? { name: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), valor: 0, ordens: 0 };
      current.valor += order.clientValue;
      current.ordens += 1;
      map.set(key, current);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([, value]) => value);
  }, [filteredOrders]);

  const logout = () => {
    localStorage.removeItem("qtecnico_token");
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu size={21} /></button>
            <div className="text-xl font-black tracking-tight">Q<span className="text-cyan-500">Técnico</span></div>
            <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 sm:inline">Painel administrativo</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block"><p className="text-sm font-semibold">{user.name}</p><p className="text-xs text-slate-500">{user.role}</p></div>
            <button onClick={logout} className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50" title="Sair"><LogOut size={18} /></button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px]">
        <aside className={`${menuOpen ? "fixed inset-y-0 left-0 z-50 flex" : "hidden"} w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex lg:min-h-[calc(100vh-4rem)]`}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4 lg:hidden"><span className="font-bold">Menu</span><button onClick={() => setMenuOpen(false)}><X size={20} /></button></div>
          <nav className="space-y-1 p-4">
            {[{ icon: BarChart3, label: "Dashboard" }, { icon: ClipboardList, label: "Ordens de Serviço" }, { icon: Users, label: "Clientes" }, { icon: Wrench, label: "Técnicos / Equipe" }, { icon: CalendarDays, label: "Agenda" }, { icon: DollarSign, label: "Financeiro" }].map(({ icon: Icon, label }, index) => (
              <button key={label} onClick={() => setMenuOpen(false)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium ${index === 0 ? "bg-cyan-50 text-cyan-700" : "text-slate-600 hover:bg-slate-50"}`}><Icon size={18} />{label}</button>
            ))}
          </nav>
        </aside>
        {menuOpen && <button className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Fechar menu" />}

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div><p className="text-sm font-medium text-cyan-600">Visão geral</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Dashboard</h1><p className="mt-1 text-sm text-slate-500">Acompanhe a operação, serviços e resultados da QTECH.</p></div>
            <div className="flex flex-wrap gap-2">
              <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-cyan-400"><option value="all">Todo o período</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option></select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "all")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-cyan-400"><option value="all">Todos os status</option><option value="pending">Pendentes</option><option value="in_progress">Em andamento</option><option value="completed">Concluídas</option><option value="cancelled">Canceladas</option></select>
            </div>
          </div>

          {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">Carregando dados...</div> : <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={ClipboardList} label="Ordens no período" value={stats.total} detail={`${stats.pending} pendentes`} />
              <StatCard icon={CheckCircle2} label="Concluídas" value={stats.completed} detail={`${stats.progress} em andamento`} />
              <StatCard icon={DollarSign} label="Valor contratado" value={money(stats.revenue)} detail={`${money(stats.paid)} recebido`} />
              <StatCard icon={BarChart3} label="Margem operacional" value={money(stats.margin)} detail={`Custos: ${money(stats.costs)}`} />
            </section>

            <section className="mt-5 grid gap-5 xl:grid-cols-[1.7fr_1fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center justify-between"><div><h2 className="font-bold">Evolução financeira</h2><p className="text-xs text-slate-500">Valor das ordens por mês</p></div><TrendingIcon /></div>
                <div className="h-64">{monthData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={monthData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `R$ ${Math.round(v / 1000)}k`} /><Tooltip formatter={(value) => money(Number(value))} /><Bar dataKey="valor" radius={[7, 7, 0, 0]} fill="#22c5df" /></BarChart></ResponsiveContainer> : <Empty text="Ainda não há dados suficientes para o gráfico." />}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Status das ordens</h2><p className="text-xs text-slate-500">Distribuição atual</p><div className="h-64">{statusData.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>{statusData.map((entry, i) => <Cell key={entry.name} fill={["#f59e0b", "#3b82f6", "#10b981", "#ef4444"][i % 4]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <Empty text="Nenhuma ordem encontrada." />}</div></div>
            </section>

            <section className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-bold">Ordens recentes</h2><p className="text-xs text-slate-500">Últimas movimentações</p></div><ClipboardList size={19} className="text-slate-400" /></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">OS</th><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Serviço</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Valor</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredOrders.slice().sort((a,b) => b.date.localeCompare(a.date)).slice(0, 8).map((order) => <tr key={order.id} className="hover:bg-slate-50"><td className="whitespace-nowrap px-5 py-3.5 font-semibold">{order.id}</td><td className="whitespace-nowrap px-5 py-3.5">{order.client}</td><td className="px-5 py-3.5 text-slate-600">{order.type}</td><td className="px-5 py-3.5"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[order.status].className}`}>{STATUS[order.status].label}</span></td><td className="whitespace-nowrap px-5 py-3.5 text-right font-semibold">{money(order.clientValue)}</td></tr>)}{filteredOrders.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">Nenhuma ordem encontrada.</td></tr>}</tbody></table></div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Resumo operacional</h2><div className="mt-4 space-y-3"><Summary icon={Clock3} label="Pendentes" value={stats.pending} /><Summary icon={Wrench} label="Em andamento" value={stats.progress} /><Summary icon={CheckCircle2} label="Concluídas" value={stats.completed} /><Summary icon={Users} label="Clientes cadastrados" value={clients.length} /></div><div className="mt-5 rounded-xl bg-slate-50 p-4"><p className="text-xs font-medium text-slate-500">Recebimento pendente</p><p className="mt-1 text-xl font-bold text-slate-900">{money(Math.max(stats.revenue - stats.paid, 0))}</p></div></div>
            </section>
          </>}
        </main>
      </div>
    </div>
  );
}

function Summary({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: number }) {
  return <div className="flex items-center justify-between rounded-xl border border-slate-100 p-3"><div className="flex items-center gap-3"><Icon size={18} className="text-cyan-600" /><span className="text-sm text-slate-600">{label}</span></div><span className="font-bold">{value}</span></div>;
}
function Empty({ text }: { text: string }) { return <div className="flex h-full items-center justify-center text-center text-sm text-slate-400">{text}</div>; }
function TrendingIcon() { return <div className="rounded-lg bg-slate-50 p-2 text-cyan-600"><BarChart3 size={17} /></div>; }
