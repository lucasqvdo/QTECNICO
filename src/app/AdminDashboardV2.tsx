import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BarChart3, Building2, CalendarDays, CheckCircle2, ClipboardList, Clock3, DollarSign, LogOut, Menu, Users, Wrench, X, TrendingUp } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { api } from './api';
import TeamManagement from './TeamManagement';
import ClientsManagement from './ClientsManagement';
import OrdersManagement from './OrdersManagement';
import AttendanceManagement from './AttendanceManagement';
import AgendaManagement from './AgendaManagement';
import FinanceManagement from './FinanceManagement';
import CompanyProfile from './CompanyProfile';
import type { Client, OrderStatus, ServiceOrder } from './types';

type Section = 'dashboard' | 'clients' | 'team' | 'orders' | 'attendances' | 'agenda' | 'finance' | 'company';
type DashboardSummary = {
  period: string;
  stats: { total: number; pending: number; inProgress: number; completed: number; cancelled: number; revenue: number; paid: number; costs: number; margin: number; clients: number; newClients: number };
  monthly: { month: string; revenue: number; orders: number }[];
  technicians: { id: number; name: string; orders: number; completed: number; revenue: number }[];
  recent: { id: string; client: string; type: string; status: OrderStatus; date: string; value: number; technician: string | null }[];
};

const NAV = [
  ['dashboard', BarChart3, 'Dashboard'], ['orders', ClipboardList, 'Ordens de Serviço'], ['attendances', Clock3, 'Atendimentos'],
  ['clients', Users, 'Clientes'], ['team', Wrench, 'Técnicos / Equipe'], ['agenda', CalendarDays, 'Agenda'], ['finance', DollarSign, 'Financeiro'], ['company', Building2, 'Perfil da Empresa'],
] as const;
const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444'];
const STATUS: Record<OrderStatus, { label: string; className: string }> = {
  pending: { label: 'Pendente', className: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'Em andamento', className: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Concluída', className: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cancelada', className: 'bg-red-100 text-red-700' },
};
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Stat({ icon: Icon, label, value, detail }: { icon: typeof ClipboardList; label: string; value: string | number; detail: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div><div className="rounded-xl bg-cyan-50 p-3 text-cyan-600"><Icon size={21} /></div></div></div>;
}

export default function AdminDashboardV2() {
  const [section, setSection] = useState<Section>('dashboard');
  const [period, setPeriod] = useState('30');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [user, setUser] = useState({ name: 'Usuário', role: 'Administrador' });
  const [loading, setLoading] = useState(true);
  const [moduleLoading, setModuleLoading] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { void loadSummary(period); }, [period]);
  useEffect(() => { void api.getMe().then((u) => setUser({ name: u.name, role: u.role })).catch(() => setError('Sessão expirada. Faça login novamente.')); }, []);
  useEffect(() => {
    if (section === 'dashboard' || section === 'team' || section === 'company') return;
    let mounted = true;
    setModuleLoading(true);
    Promise.all([api.getOrders(), api.getClients()]).then(([o, c]) => { if (mounted) { setOrders(o); setClients(c); } }).catch(() => { if (mounted) setError('Não foi possível carregar os dados desta área.'); }).finally(() => { if (mounted) setModuleLoading(false); });
    return () => { mounted = false; };
  }, [section]);

  async function loadSummary(days: string) {
    setLoading(true); setError('');
    try {
      const response = await api.getDashboardSummary(days);
      setSummary(response);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o dashboard.');
    } finally { setLoading(false); }
  }

  const select = (next: Section) => { setSection(next); setMenuOpen(false); };
  const logout = async () => { try { await api.logout(); } finally { window.location.reload(); } };
  const statusData = useMemo(() => summary ? [
    { name: 'Pendentes', value: summary.stats.pending }, { name: 'Em andamento', value: summary.stats.inProgress }, { name: 'Concluídas', value: summary.stats.completed }, { name: 'Canceladas', value: summary.stats.cancelled },
  ].filter((x) => x.value > 0) : [], [summary]);

  const Sidebar = () => <aside className={`${menuOpen ? 'fixed inset-y-0 left-0 z-50 flex' : 'hidden'} w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex lg:min-h-[calc(100vh-4rem)]`}><div className="flex items-center justify-between border-b border-slate-100 p-4 lg:hidden"><b>Menu</b><button type="button" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X /></button></div><nav className="space-y-1 p-4">{NAV.map(([key, Icon, label]) => <button type="button" key={key} onClick={() => select(key)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium ${section === key ? 'bg-cyan-50 text-cyan-700' : 'text-slate-600 hover:bg-slate-50'}`}><Icon size={18} /><span>{label}</span></button>)}</nav></aside>;
  const Header = () => <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8"><div className="flex items-center gap-3"><button type="button" className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu size={21} /></button><div className="text-xl font-black tracking-tight">Q<span className="text-cyan-500">Técnico</span></div><span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 sm:inline">Painel administrativo</span></div><div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-semibold">{user.name}</p><p className="text-xs text-slate-500">{user.role}</p></div><button type="button" onClick={logout} className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50" aria-label="Sair"><LogOut size={18} /></button></div></div></header>;
  const Layout = ({ children }: { children: ReactNode }) => <div className="min-h-screen bg-slate-50 text-slate-900"><Header /><div className="mx-auto flex max-w-[1600px]"><Sidebar /><main className="min-w-0 flex-1">{children}</main></div>{menuOpen && <button type="button" className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Fechar menu" />}</div>;

  if (section === 'company') return <Layout><CompanyProfile onBack={() => select('dashboard')} /></Layout>;
  if (section === 'team') return <Layout><TeamManagement onBack={() => select('dashboard')} /></Layout>;
  if (moduleLoading) return <Layout><div className="p-8 text-center text-slate-500">Carregando área administrativa...</div></Layout>;
  if (section === 'clients') return <Layout><ClientsManagement clients={clients} orders={orders} onClientsChange={setClients} onBack={() => select('dashboard')} /></Layout>;
  if (section === 'orders') return <Layout><OrdersManagement orders={orders} clients={clients} onOrdersChange={setOrders} onBack={() => select('dashboard')} /></Layout>;
  if (section === 'attendances') return <Layout><AttendanceManagement orders={orders} onOrdersChange={setOrders} onBack={() => select('dashboard')} /></Layout>;
  if (section === 'agenda') return <Layout><AgendaManagement orders={orders} onOrdersChange={setOrders} onBack={() => select('dashboard')} /></Layout>;
  if (section === 'finance') return <Layout><FinanceManagement orders={orders} onOrdersChange={setOrders} onBack={() => select('dashboard')} /></Layout>;

  const stats = summary?.stats;
  return <Layout><div className="p-4 sm:p-6 lg:p-8"><div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm font-medium text-cyan-600">Visão geral</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Dashboard</h1><p className="mt-1 text-sm text-slate-500">Indicadores da operação, clientes e resultado financeiro.</p></div><select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-fit rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="all">Todo o período</option></select></div>{error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}{loading || !stats ? <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">Carregando indicadores...</div> : <><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={ClipboardList} label="Ordens" value={stats.total} detail={`${stats.pending} pendentes · ${stats.inProgress} em andamento`} /><Stat icon={CheckCircle2} label="Concluídas" value={stats.completed} detail={`${stats.cancelled} canceladas`} /><Stat icon={DollarSign} label="Faturamento" value={money(stats.revenue)} detail={`${money(stats.paid)} recebido`} /><Stat icon={TrendingUp} label="Margem operacional" value={money(stats.margin)} detail={`Custos: ${money(stats.costs)}`} /></section><section className="mt-5 grid gap-5 xl:grid-cols-[1.7fr_1fr]"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Evolução financeira</h2><p className="text-xs text-slate-500">Dados agregados pelo servidor</p><div className="mt-4 h-64">{summary.monthly.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={summary.monthly}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" /><YAxis /><Tooltip formatter={(v) => money(Number(v))} /><Bar dataKey="revenue" fill="#22c5df" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-slate-500">Sem dados no período.</div>}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Status das ordens</h2><p className="text-xs text-slate-500">Distribuição do período</p><div className="h-64">{statusData.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>{statusData.map((item, i) => <Cell key={item.name} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-slate-500">Nenhuma ordem.</div>}</div></div></section><section className="mt-5 grid gap-5 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold">Equipe</h2><p className="text-xs text-slate-500">Produtividade no período</p></div><Wrench size={19} className="text-cyan-600" /></div><div className="mt-4 space-y-3">{summary.technicians.length ? summary.technicians.map((tech) => <div key={tech.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><div><p className="font-semibold">{tech.name}</p><p className="text-xs text-slate-500">{tech.orders} OS · {tech.completed} concluídas</p></div><span className="text-sm font-bold">{money(tech.revenue)}</span></div>) : <p className="text-sm text-slate-500">Nenhum técnico cadastrado.</p>}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold">Clientes</h2><p className="text-xs text-slate-500">Base comercial</p></div><Users size={19} className="text-cyan-600" /></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Clientes</p><p className="mt-1 text-2xl font-bold">{stats.clients}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Novos no mês</p><p className="mt-1 text-2xl font-bold">{stats.newClients}</p></div></div></div></section><section className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="font-bold">Ordens recentes</h2><p className="text-xs text-slate-500">Resumo sem carregar fotos, assinaturas ou atendimentos</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">OS</th><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Serviço</th><th className="px-5 py-3">Técnico</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Valor</th></tr></thead><tbody className="divide-y divide-slate-100">{summary.recent.map((o) => <tr key={o.id}><td className="px-5 py-3.5 font-semibold">{o.id}</td><td className="px-5 py-3.5">{o.client}</td><td className="px-5 py-3.5 text-slate-600">{o.type}</td><td className="px-5 py-3.5 text-slate-600">{o.technician || 'Não atribuído'}</td><td className="px-5 py-3.5"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[o.status].className}`}>{STATUS[o.status].label}</span></td><td className="px-5 py-3.5 text-right font-semibold">{money(o.value)}</td></tr>)}</tbody></table></div></section></>}</div></Layout>;
}
