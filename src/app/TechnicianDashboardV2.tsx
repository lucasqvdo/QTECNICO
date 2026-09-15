import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, MapPin, Navigation, Phone, UserRound, Wrench } from 'lucide-react';
import AdminShellV2, { type TechnicianSectionV2 } from './AdminShellV2';
import TechnicianOrderDetail from './TechnicianOrderDetail';
import { api, type UserProfile } from './api';
import type { ServiceOrder } from './types';

const STATUS: Record<ServiceOrder['status'], { label: string; className: string }> = {
  pending: { label: 'Pendente', className: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'Em andamento', className: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Concluída', className: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cancelada', className: 'bg-red-100 text-red-700' },
};

const dateLabel = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const dateTimeLabel = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const openNavigation = (address: string | null | undefined) => {
  const destination = encodeURIComponent(String(address || '').trim());
  if (destination) window.location.href = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
};

function Stat({ label, value, icon: Icon, detail }: { label: string; value: number; icon: typeof Wrench; detail: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div><div className="rounded-xl bg-cyan-50 p-3 text-cyan-600"><Icon size={21} /></div></div></div>;
}

function Nav({ address }: { address?: string | null }) {
  return <button type="button" onClick={() => openNavigation(address)} disabled={!String(address || '').trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-100 disabled:opacity-50"><Navigation size={13} />Navegar</button>;
}

function Row({ order, onOpen }: { order: ServiceOrder; onOpen: (order: ServiceOrder) => void }) {
  const status = STATUS[order.status] ?? { label: 'Status desconhecido', className: 'bg-slate-100 text-slate-600' };
  return <div className="block w-full p-5 hover:bg-slate-50">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <button type="button" onClick={() => onOpen(order)} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-2"><p className="font-bold">{order.id || 'OS'}</p><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span></div>
        <p className="mt-1 font-semibold text-slate-800">{order.client || 'Cliente não informado'}</p>
        <p className="mt-1 text-sm text-slate-500">{order.type || 'Serviço'} · {dateLabel(order.date)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500"><MapPin size={13} /><span className="min-w-0">{order.address || 'Endereço não informado'}</span></div>
      </button>
      <div className="flex shrink-0 items-center gap-2 text-sm text-slate-500"><Phone size={15} />{order.phone || '—'}<Nav address={order.address} /></div>
    </div>
  </div>;
}

function Title({ title, subtitle }: { title: string; subtitle: string }) { return <div><p className="text-sm font-medium text-cyan-600">QTECNICO</p><h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">{text}</div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-800">{value}</p></div>; }

export default function TechnicianDashboardV2() {
  const [section, setSection] = useState<TechnicianSectionV2>('home');
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ServiceOrder | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [loadedOrders, loadedUser] = await Promise.all([api.getOrders(), api.getMe()]);
        if (!mounted) return;
        setOrders(Array.isArray(loadedOrders) ? loadedOrders : []);
        setUser(loadedUser);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Não foi possível carregar sua área.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const active = useMemo(() => orders.filter(o => o.status === 'pending' || o.status === 'in_progress'), [orders]);
  const completed = useMemo(() => orders.filter(o => o.status === 'completed'), [orders]);
  const today = useMemo(() => {
    const key = new Date().toISOString().slice(0, 10);
    return orders.filter(o => o.date === key || o.status === 'in_progress');
  }, [orders]);
  const attendances = useMemo(() => orders.flatMap(order => {
    const items = Array.isArray(order.attendances) ? order.attendances : [];
    return items.filter(Boolean).map(attendance => ({ ...attendance, order }));
  }).sort((a, b) => String(b.startTime || '').localeCompare(String(a.startTime || ''))), [orders]);
  const agenda = useMemo(() => [...orders].filter(o => o.status !== 'cancelled').sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))), [orders]);
  const save = (order: ServiceOrder) => { setOrders(previous => previous.map(item => item.id === order.id ? order : item)); setSelected(order); };

  let content: JSX.Element;
  if (loading) content = <div className="p-6 lg:p-8"><div className="rounded-2xl border bg-white p-12 text-center text-slate-500">Carregando sua operação...</div></div>;
  else if (error) content = <div className="p-6 lg:p-8"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div></div>;
  else if (section === 'home') content = <div className="p-4 sm:p-6 lg:p-8"><div className="mb-7"><p className="text-sm font-medium text-cyan-600">Minha operação</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Olá, {user?.name?.split(' ')[0] || 'Técnico'}!</h1><p className="mt-1 text-sm text-slate-500">Acompanhe suas ordens, atendimentos e programação.</p></div><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={Wrench} label="Minhas OS" value={orders.length} detail="Ordens atribuídas" /><Stat icon={Clock3} label="Em andamento" value={active.length} detail="Pendentes ou em execução" /><Stat icon={CheckCircle2} label="Concluídas" value={completed.length} detail="Histórico de execução" /><Stat icon={CalendarDays} label="Hoje" value={today.length} detail="Programadas / em execução" /></section><section className="mt-5 rounded-2xl border bg-white shadow-sm"><div className="border-b p-5"><h2 className="font-bold">Próximas ordens</h2><p className="text-xs text-slate-500">Chamados sob sua responsabilidade</p></div><div className="divide-y">{active.slice(0, 6).map(order => <Row key={order.id} order={order} onOpen={setSelected} />)}{!active.length && <p className="p-6 text-sm text-slate-500">Nenhuma ordem pendente no momento.</p>}</div></section></div>;
  else if (section === 'orders') content = <div className="p-4 sm:p-6 lg:p-8"><Title title="Minhas Ordens" subtitle="Chamados atribuídos a você." /><div className="mt-5 space-y-3">{orders.map(order => <div key={order.id} className="rounded-2xl border bg-white shadow-sm"><Row order={order} onOpen={setSelected} /></div>)}{!orders.length && <Empty text="Nenhuma ordem atribuída." />}</div></div>;
  else if (section === 'attendances') content = <div className="p-4 sm:p-6 lg:p-8"><Title title="Atendimentos" subtitle="Seu histórico de execução em campo." /><div className="mt-5 space-y-3">{attendances.map(attendance => <button type="button" key={attendance.id} onClick={() => setSelected(attendance.order)} className="block w-full rounded-2xl border bg-white p-5 text-left shadow-sm hover:border-cyan-300"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-bold">{attendance.order.id} · {attendance.order.client}</p><p className="mt-1 text-xs text-slate-500">{dateTimeLabel(attendance.startTime)} · {attendance.order.type}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{Math.round(Number(attendance.durationSeconds || 0) / 60)} min</span></div><p className="mt-4 text-sm text-slate-600">{attendance.description || 'Sem descrição registrada.'}</p></button>)}{!attendances.length && <Empty text="Nenhum atendimento registrado." />}</div></div>;
  else if (section === 'agenda') content = <div className="p-4 sm:p-6 lg:p-8"><Title title="Minha Agenda" subtitle="Programação das suas ordens." /><div className="mt-5 space-y-3">{agenda.map(order => <div key={order.id} className="rounded-2xl border bg-white p-5 shadow-sm hover:border-cyan-300"><button type="button" onClick={() => setSelected(order)} className="block w-full text-left"><div className="flex items-start gap-4"><div className="rounded-xl bg-cyan-50 p-3 text-cyan-600"><CalendarDays size={20} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-2"><p className="font-bold">{order.id} · {order.client}</p><span className="text-sm font-semibold text-slate-500">{dateLabel(order.date)}</span></div><p className="mt-1 text-sm text-slate-600">{order.type}</p><div className="mt-2 flex items-center gap-2 text-xs text-slate-500"><MapPin size={13} /><span className="truncate">{order.address || 'Endereço não informado'}</span></div></div></div></button><div className="mt-3"><Nav address={order.address} /></div></div>)}{!agenda.length && <Empty text="Agenda vazia." />}</div></div>;
  else content = <div className="p-4 sm:p-6 lg:p-8"><Title title="Meu Perfil" subtitle="Seus dados de acesso ao QTECNICO." /><div className="mt-5 max-w-2xl rounded-2xl border bg-white p-6 shadow-sm"><div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-50 text-cyan-600"><UserRound size={26} /></div><div><p className="text-lg font-bold">{user?.name || '—'}</p><p className="text-sm text-slate-500">{user?.role || 'Técnico'}</p></div></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Info label="E-mail" value={user?.email || '—'} /><Info label="Telefone" value={user?.phone || '—'} /></div></div></div>;

  return <AdminShellV2 section={section} onSectionChange={setSection} mode="technician">{content}{selected && <TechnicianOrderDetail order={selected} onClose={() => setSelected(null)} onSaved={save} />}</AdminShellV2>;
}
