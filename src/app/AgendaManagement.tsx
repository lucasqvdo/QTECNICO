import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, RefreshCw } from 'lucide-react';
import { api } from './api';
import type { ServiceOrder } from './types';

type Props = { orders: ServiceOrder[]; onOrdersChange: (orders: ServiceOrder[]) => void; onBack: () => void };

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const formatDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
const statusLabel: Record<ServiceOrder['status'], string> = { pending: 'Pendente', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' };

export default function AgendaManagement({ orders, onOrdersChange, onBack }: Props) {
  const [selected, setSelected] = useState(isoDate(new Date()));
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const selectedOrders = useMemo(() => orders.filter((o) => o.date === selected).sort((a, b) => a.client.localeCompare(b.client)), [orders, selected]);
  const days = useMemo(() => {
    const base = new Date(`${selected}T12:00:00`);
    const day = base.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(base); d.setDate(base.getDate() + mondayOffset + i); return isoDate(d); });
  }, [selected]);

  const moveDay = (delta: number) => { const d = new Date(`${selected}T12:00:00`); d.setDate(d.getDate() + delta); setSelected(isoDate(d)); };
  const reschedule = async (order: ServiceOrder, date: string) => {
    if (date === order.date) return;
    setSaving(order.id); setError('');
    try {
      const saved = await api.updateOrder(order.id, { ...order, date });
      onOrdersChange(orders.map((item) => item.id === saved.id ? saved : item));
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível alterar a data da OS.'); }
    finally { setSaving(null); }
  };

  return <div className="p-4 sm:p-6 lg:p-8">
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div><button onClick={onBack} className="mb-2 text-sm font-semibold text-cyan-600">← Atendimentos</button><p className="text-sm font-medium text-cyan-600">Planejamento</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Agenda</h1><p className="mt-1 text-sm text-slate-500">Visualize as OS por dia e reagende serviços diretamente pela administração.</p></div>
      <div className="flex items-center gap-2"><button onClick={() => setSelected(isoDate(new Date()))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">Hoje</button><button onClick={() => moveDay(-1)} className="rounded-xl border border-slate-200 bg-white p-2" aria-label="Dia anterior"><ChevronLeft size={18}/></button><button onClick={() => moveDay(1)} className="rounded-xl border border-slate-200 bg-white p-2" aria-label="Próximo dia"><ChevronRight size={18}/></button></div>
    </div>

    <div className="mb-5 grid grid-cols-7 gap-2 overflow-x-auto">
      {days.map((day) => { const count = orders.filter((o) => o.date === day).length; const active = day === selected; return <button key={day} onClick={() => setSelected(day)} className={`min-w-[82px] rounded-xl border p-3 text-left ${active ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}><p className="text-[11px] font-semibold uppercase text-slate-500">{new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</p><p className="mt-1 text-xl font-bold">{new Date(`${day}T12:00:00`).getDate()}</p><p className="mt-1 text-[11px] text-slate-500">{count} OS</p></button>; })}
    </div>

    {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5"><div className="flex items-center gap-2"><CalendarDays size={19} className="text-cyan-600"/><div><h2 className="font-bold capitalize">{formatDate(selected)}</h2><p className="text-xs text-slate-500">{selectedOrders.length} ordem(ns) programada(s)</p></div></div></div>
      <div className="divide-y divide-slate-100">
        {!selectedOrders.length ? <div className="p-10 text-center text-sm text-slate-500">Nenhuma OS programada para este dia.</div> : selectedOrders.map((order) => <article key={order.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-bold">{order.id}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">{statusLabel[order.status]}</span><span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">Prioridade {order.priority}</span></div><h3 className="mt-2 font-semibold">{order.client}</h3><p className="mt-1 text-sm text-slate-600">{order.type || 'Serviço não informado'}</p><div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><MapPin size={14}/>{order.address || 'Endereço não informado'}</span><span className="inline-flex items-center gap-1"><Clock3 size={14}/>{order.attendances.length} atendimento(s)</span></div></div><div className="flex flex-col gap-2 sm:flex-row sm:items-center"><label className="text-xs font-semibold text-slate-500">Reagendar</label><input type="date" value={order.date} disabled={saving === order.id} onChange={(e) => void reschedule(order, e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/><span className="text-xs text-slate-400">{saving === order.id ? 'Salvando...' : ''}</span></div></div></article>)}
      </div>
    </section>
    <p className="mt-4 flex items-center gap-1 text-xs text-slate-400"><RefreshCw size={12}/> A agenda utiliza a data já existente na OS; não altera os atendimentos registrados.</p>
  </div>;
}