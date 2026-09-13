import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { BarChart3, CalendarDays, CheckCircle2, ClipboardList, Clock3, DollarSign, LogOut, Menu, Users, Wrench, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from './api';
import TeamManagement from './TeamManagement';
import ClientsManagement from './ClientsManagement';
import OrdersManagement from './OrdersManagement';
import AttendanceManagement from './AttendanceManagement';
import type { Client, OrderStatus, ServiceOrder } from './types';

const STATUS: Record<OrderStatus, { label: string; className: string }> = {
  pending: { label: 'Pendente', className: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'Em andamento', className: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Concluída', className: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cancelada', className: 'bg-red-100 text-red-700' },
};
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
type Section = 'dashboard' | 'clients' | 'team' | 'orders' | 'attendances';
type NavItem = { key: Section | 'agenda' | 'finance'; icon: typeof BarChart3; label: string };
const NAV: NavItem[] = [
  { key: 'dashboard', icon: BarChart3, label: 'Dashboard' },
  { key: 'orders', icon: ClipboardList, label: 'Ordens de Serviço' },
  { key: 'attendances', icon: Clock3, label: 'Atendimentos' },
  { key: 'clients', icon: Users, label: 'Clientes' },
  { key: 'team', icon: Wrench, label: 'Técnicos / Equipe' },
  { key: 'agenda', icon: CalendarDays, label: 'Agenda' },
  { key: 'finance', icon: DollarSign, label: 'Financeiro' },
];

function StatCard({ icon: Icon, label, value, detail }: { icon: typeof ClipboardList; label: string; value: string | number; detail?: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>{detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}</div><div className="rounded-xl bg-cyan-50 p-3 text-cyan-600"><Icon size={21} /></div></div></div>;
}

export default function AdminDashboard() {
  const [section, setSection] = useState<Section>('dashboard');
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [user, setUser] = useState({ name: 'Usuário', role: 'Administrador' });
  const [period, setPeriod] = useState('all');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [loadedOrders, loadedClients, loadedUser] = await Promise.all([api.getOrders(), api.getClients(), api.getMe()]);
        setOrders(loadedOrders); setClients(loadedClients); setUser({ name: loadedUser.name, role: loadedUser.role });
      } catch { setError('Não foi possível carregar os dados. Faça login novamente.'); }
      finally { setLoading(false); }
    })();
  }, []);

  const select = (next: Section) => { setSection(next); setMenuOpen(false); };
  const filteredOrders = useMemo(() => {
    let result = orders;
    if (statusFilter !== 'all') result = result.filter((o) => o.status === statusFilter);
    if (period !== 'all') { const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - Number(period)); result = result.filter((o) => new Date(`${o.date}T23:59:59`) >= cutoff); }
    return result;
  }, [orders, period, statusFilter]);
  const stats = useMemo(() => {
    const revenue = filteredOrders.reduce((sum, o) => sum + o.clientValue, 0);
    const paid = filteredOrders.reduce((sum, o) => sum + (o.payments?.length ? o.payments.filter((p) => p.status === 'paid').reduce((a, p) => a + p.amount, 0) : o.paymentStatus === 'paid' ? (o.paidAmount ?? o.clientValue) : 0), 0);
    const costs = filteredOrders.reduce((sum, o) => sum + o.expenses.reduce((a, e) => a + e.amount, 0), 0);
    return { total: filteredOrders.length, pending: filteredOrders.filter((o) => o.status === 'pending').length, progress: filteredOrders.filter((o) => o.status === 'in_progress').length, completed: filteredOrders.filter((o) => o.status === 'completed').length, revenue, paid, costs, margin: revenue - costs };
  }, [filteredOrders]);
  const statusData = [{ name: 'Pendentes', value: stats.pending }, { name: 'Em andamento', value: stats.progress }, { name: 'Concluídas', value: stats.completed }, { name: 'Canceladas', value: filteredOrders.filter((o) => o.status === 'cancelled').length }].filter((item) => item.value > 0);
  const monthData = useMemo(() => {
    const map = new Map<string, { name: string; valor: number }>();
    filteredOrders.forEach((o) => { const d = new Date(`${o.date}T12:00:00`); const key = `${d.getFullYear()}-${d.getMonth()}`; const item = map.get(key) ?? { name: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), valor: 0 }; item.valor += o.clientValue; map.set(key, item); });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([, value]) => value);
  }, [filteredOrders]);
  const logout = () => { localStorage.removeItem('qtecnico_token'); window.location.reload(); };

  const Sidebar = () => (
    <aside className={`${menuOpen ? 'fixed inset-y-0 left-0 z-50 flex' : 'hidden'} w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex lg:min-h-[calc(100vh-4rem)]`}>
      <div className="flex items-center justify-between border-b border-slate-100 p-4 lg:hidden"><b>Menu</b><button onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X /></button></div>
      <nav className="space-y-1 p-4">
        {NAV.map(({ key, icon: Icon, label }) => {
          const available = key === 'dashboard' || key === 'clients' || key === 'team' || key === 'orders' || key === 'attendances';
          return <button key={key} onClick={() => available ? select(key as Section) : setMenuOpen(false)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium ${section === key ? 'bg-cyan-50 text-cyan-700' : 'text-slate-600 hover:bg-slate-50'}`}><Icon size={18} /><span>{label}</span>{!available && <span className="ml-auto text-[10px] text-slate-400">Em breve</span>}</button>;
        })}
      </nav>
    </aside>
  );

  const Header = () => (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8"><div className="flex items-center gap-3"><button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu size={21} /></button><div className="text-xl font-black tracking-tight">Q<span className="text-cyan-500">Técnico</span></div><span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 sm:inline">Painel administrativo</span></div><div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-semibold">{user.name}</p><p className="text-xs text-slate-500">{user.role}</p></div><button onClick={logout} className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50" aria-label="Sair"><LogOut size={18} /></button></div></div></header>
  );

  const Layout = ({ children }: { children: ReactNode }) => (
    <div className="min-h-screen bg-slate-50 text-slate-900"><Header /><div className="mx-auto flex max-w-[1600px]"><Sidebar /><main className="min-w-0 flex-1">{children}</main></div>{menuOpen && <button className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Fechar menu" />}</div>
  );

  if (section === 'team') return <Layout><TeamManagement onBack={() => select('dashboard')} /></Layout>;
  if (section === 'clients') return <Layout><ClientsManagement clients={clients} orders={orders} onClientsChange={setClients} onBack={() => select('dashboard')} /></Layout>;
  if (section === 'orders') return <Layout><OrdersManagement orders={orders} clients={clients} onOrdersChange={setOrders} onBack={() => select('dashboard')} /></Layout>;
  if (section === 'attendances') return <Layout><AttendanceManagement orders={orders} onOrdersChange={setOrders} onBack={() => select('dashboard')} /></Layout>;

  return <Layout><div className="p-4 sm:p-6 lg:p-8">
    <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm font-medium text-cyan-600">Visão geral</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Dashboard</h1><p className="mt-1 text-sm text-slate-500">Acompanhe a operação, serviços e resultados da QTECH.</p></div><div className="flex flex-wrap gap-2"><select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="all">Todo o período</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option></select><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="all">Todos os status</option><option value="pending">Pendentes</option><option value="in_progress">Em andamento</option><option value="completed">Concluídas</option><option value="cancelled">Canceladas</option></select></div></div>
    {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">Carregando dados...</div> : <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard icon={ClipboardList} label="Ordens no período" value={stats.total} detail={`${stats.pending} pendentes`} /><StatCard icon={CheckCircle2} label="Concluídas" value={stats.completed} detail={`${stats.progress} em andamento`} /><StatCard icon={DollarSign} label="Valor contratado" value={money(stats.revenue)} detail={`${money(stats.paid)} recebido`} /><StatCard icon={BarChart3} label="Margem operacional" value={money(stats.margin)} detail={`Custos: ${money(stats.costs)}`} /></section>
      <section className="mt-5 grid gap-5 xl:grid-cols-[1.7fr_1fr]"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Evolução financeira</h2><p className="text-xs text-slate-500">Valor das ordens por mês</p><div className="mt-4 h-64">{monthData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={monthData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis /><Tooltip formatter={(v) => money(Number(v))} /><Bar dataKey="valor" fill="#22c5df" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-slate-500">Sem dados suficientes.</div>}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Status das ordens</h2><p className="text-xs text-slate-500">Distribuição atual</p><div className="h-64">{statusData.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>{statusData.map((item, index) => <Cell key={item.name} fill={['#f59e0b', '#3b82f6', '#10b981', '#ef4444'][index % 4]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-slate-500">Nenhuma ordem.</div>}</div></div></section>
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="font-bold">Ordens recentes</h2><p className="text-xs text-slate-500">Últimas movimentações</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">OS</th><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Serviço</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Valor</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredOrders.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((o) => <tr key={o.id}><td className="px-5 py-3.5 font-semibold">{o.id}</td><td className="px-5 py-3.5">{o.client}</td><td className="px-5 py-3.5 text-slate-600">{o.type}</td><td className="px-5 py-3.5"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[o.status].className}`}>{STATUS[o.status].label}</span></td><td className="px-5 py-3.5 text-right font-semibold">{money(o.clientValue)}</td></tr>)}</tbody></table></div></section>
      <p className="mt-4 text-xs text-slate-400">{clients.length} clientes cadastrados.</p>
    </>}
  </div></Layout>;
}
