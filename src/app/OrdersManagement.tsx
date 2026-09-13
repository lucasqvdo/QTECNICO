import { useMemo, useState } from 'react';
import { Calendar, Camera, CheckCircle2, ClipboardList, Clock3, Edit3, FileText, Image as ImageIcon, MapPin, Plus, Search, Trash2, UserRound, WalletCards, X } from 'lucide-react';
import { api } from './api';
import type { Client, OrderStatus, ServiceOrder } from './types';

const statusMeta: Record<OrderStatus, { label: string; cls: string }> = {
  pending: { label: 'Pendente', cls: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'Em andamento', cls: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Concluída', cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cancelada', cls: 'bg-red-100 text-red-700' },
};
const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatDate = (value: string) => value ? new Date(`${value}${value.length === 10 ? 'T12:00:00' : ''}`).toLocaleDateString('pt-BR') : '—';
const formatDateTime = (value: string) => value ? new Date(value).toLocaleString('pt-BR') : '—';
const formatDuration = (seconds: number) => {
  if (!seconds || seconds < 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}min` : `${minutes}min`;
};

type Props = { orders: ServiceOrder[]; clients: Client[]; onOrdersChange: (orders: ServiceOrder[]) => void; onBack: () => void };

function OrderDetailModal({ order, onClose, onEdit }: { order: ServiceOrder; onClose: () => void; onEdit: () => void }) {
  const totalExpenses = order.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const totalPaid = order.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const attendances = [...(order.attendances || [])].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  const photos = attendances.flatMap((attendance) => attendance.photos || []);

  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-5">
    <div className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-7">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight">OS {order.id}</h2>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusMeta[order.status].cls}`}>{statusMeta[order.status].label}</span>
          </div>
          <p className="mt-1 truncate text-sm text-slate-500">{order.client} · {order.type || 'Serviço não informado'}</p>
        </div>
        <div className="ml-3 flex items-center gap-2">
          <button onClick={onEdit} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"><Edit3 size={16} /> <span className="hidden sm:inline">Editar</span></button>
          <button onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100" aria-label="Fechar"><X /></button>
        </div>
      </header>

      <div className="overflow-y-auto bg-slate-50 p-4 sm:p-7">
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-slate-400"><UserRound size={15} /> Cliente</div><p className="font-semibold">{order.client || '—'}</p><p className="mt-1 text-sm text-slate-500">{order.phone || 'Telefone não informado'}</p></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-slate-400"><Calendar size={15} /> Data da OS</div><p className="font-semibold">{formatDate(order.date)}</p><p className="mt-1 text-sm text-slate-500">Prioridade: {order.priority === 'high' ? 'Alta' : order.priority === 'low' ? 'Baixa' : 'Média'}</p></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-2"><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-slate-400"><MapPin size={15} /> Local do atendimento</div><p className="text-sm font-medium">{order.address || 'Endereço não informado'}</p></div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between"><div><h3 className="flex items-center gap-2 font-bold"><ClipboardList size={18} /> Atendimentos</h3><p className="mt-1 text-xs text-slate-500">Histórico de visitas e registros realizados nesta OS.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{attendances.length} atendimento{attendances.length === 1 ? '' : 's'}</span></div>
              {!attendances.length ? <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">Nenhum atendimento registrado nesta OS.</div> : <div className="space-y-3">{attendances.map((attendance, index) => <article key={attendance.id || `${attendance.startTime}-${index}`} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold">Atendimento {attendances.length - index}</p><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><Clock3 size={13} /> {formatDateTime(attendance.startTime)}{attendance.endTime ? ` → ${formatDateTime(attendance.endTime)}` : ''}</span><span>Duração: {formatDuration(attendance.durationSeconds)}</span></div></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Registrado</span></div>
                {attendance.description && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{attendance.description}</p>}
                {!!attendance.photos?.length && <div className="mt-4"><p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-slate-400"><Camera size={14} /> Fotos do atendimento ({attendance.photos.length})</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{attendance.photos.map((photo) => <a key={photo.id || photo.key} href={photo.dataUrl} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-100"><img src={photo.dataUrl} alt={photo.name || 'Foto do atendimento'} className="aspect-square w-full object-cover transition group-hover:scale-105" /><span className="block truncate px-2 py-1.5 text-[11px] text-slate-500">{photo.name || 'Foto'}</span></a>)}</div></div>}
              </article>)}</div>}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between"><div><h3 className="flex items-center gap-2 font-bold"><ImageIcon size={18} /> Fotos da OS</h3><p className="mt-1 text-xs text-slate-500">Todas as fotos associadas aos atendimentos.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{photos.length} foto{photos.length === 1 ? '' : 's'}</span></div>
              {!photos.length ? <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">Nenhuma foto registrada nesta OS.</div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{photos.map((photo, index) => <a key={photo.id || photo.key || index} href={photo.dataUrl} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-100"><img src={photo.dataUrl} alt={photo.name || 'Foto da OS'} className="aspect-square w-full object-cover transition group-hover:scale-105" /><div className="truncate px-2 py-2 text-xs text-slate-600">{photo.name || 'Foto do atendimento'}</div></a>)}</div>}
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="flex items-center gap-2 font-bold"><FileText size={18} /> Descrição</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{order.description || 'Nenhuma descrição registrada.'}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="flex items-center gap-2 font-bold"><WalletCards size={18} /> Financeiro</h3><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-500">Valor da OS</span><strong>{money(order.clientValue)}</strong></div><div className="flex justify-between"><span className="text-slate-500">Despesas</span><strong>{money(totalExpenses)}</strong></div><div className="flex justify-between"><span className="text-slate-500">Recebido</span><strong>{money(totalPaid)}</strong></div><div className="border-t border-slate-100 pt-3 flex justify-between"><span className="font-semibold">Saldo</span><strong>{money(Math.max(0, order.clientValue - totalPaid))}</strong></div></div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="flex items-center gap-2 font-bold"><CheckCircle2 size={18} /> Pagamentos</h3>{!order.payments?.length ? <p className="mt-3 text-sm text-slate-500">Nenhum pagamento registrado.</p> : <div className="mt-3 space-y-2">{order.payments.map((payment) => <div key={payment.id} className="rounded-xl bg-slate-50 p-3"><div className="flex justify-between gap-3"><span className="font-medium">{payment.label || 'Pagamento'}</span><strong>{money(payment.amount)}</strong></div><div className="mt-1 text-xs text-slate-500">{formatDate(payment.date)} · {payment.status === 'paid' ? 'Pago' : 'Pendente'}</div></div>)}</div>}</div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-bold">Despesas</h3>{!order.expenses?.length ? <p className="mt-3 text-sm text-slate-500">Nenhuma despesa registrada.</p> : <div className="mt-3 space-y-2">{order.expenses.map((expense) => <div key={expense.id} className="flex justify-between rounded-xl bg-slate-50 p-3 text-sm"><span>{expense.label}</span><strong>{money(expense.amount)}</strong></div>)}</div>}</div>
          </aside>
        </div>
      </div>
    </div>
  </div>;
}

export default function OrdersManagement({ orders, clients, onOrdersChange, onBack }: Props) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [priority, setPriority] = useState<ServiceOrder['priority'] | 'all'>('all');
  const [editing, setEditing] = useState<ServiceOrder | null>(null);
  const [viewing, setViewing] = useState<ServiceOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const visible = useMemo(() => orders.filter((o) => {
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || [o.id, o.client, o.type, o.phone].some((v) => String(v || '').toLowerCase().includes(q));
    return matchesQuery && (status === 'all' || o.status === status) && (priority === 'all' || o.priority === priority);
  }), [orders, query, status, priority]);

  const startNew = () => {
    const client = clients[0];
    setError('');
    setEditing({ id: '', clientId: client?.id || '', client: client?.name || '', address: client?.address || '', phone: client?.phone || '', type: '', status: 'pending', date: new Date().toISOString().slice(0, 10), priority: 'medium', description: '', clientValue: 0, expenses: [], attendances: [], payments: [], paymentStatus: 'pending' });
  };

  const selectClient = (id: string) => {
    const client = clients.find((c) => c.id === id);
    if (!client || !editing) return;
    setEditing({ ...editing, clientId: client.id, client: client.name, address: client.address, phone: client.phone });
  };

  const save = async () => {
    if (!editing?.clientId || !editing.type.trim() || !editing.date) { setError('Selecione um cliente e informe o serviço e a data.'); return; }
    setSaving(true); setError('');
    try {
      const saved = editing.id ? await api.updateOrder(editing.id, editing) : await api.createOrder(editing);
      const next = editing.id ? orders.map((o) => o.id === saved.id ? saved : o) : [saved, ...orders];
      onOrdersChange(next);
      setViewing(null);
      setEditing(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar a ordem.'); }
    finally { setSaving(false); }
  };

  const remove = async (order: ServiceOrder) => {
    if (!window.confirm(`Excluir a ${order.id}? Esta ação não pode ser desfeita.`)) return;
    try { await api.deleteOrder(order.id); onOrdersChange(orders.filter((o) => o.id !== order.id)); setViewing(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível excluir a ordem.'); }
  };

  return <div className="p-4 sm:p-6 lg:p-8">
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><button onClick={onBack} className="mb-2 text-sm font-semibold text-cyan-600">← Dashboard</button><h1 className="text-3xl font-bold tracking-tight">Ordens de Serviço</h1><p className="mt-1 text-sm text-slate-500">Controle operacional de serviços, prazos, prioridades e valores.</p></div>
      <button onClick={startNew} disabled={!clients.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Plus size={18} /> Nova OS</button>
    </div>
    <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_auto_auto]">
      <div className="relative"><Search size={18} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar OS, cliente, serviço ou telefone..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-cyan-400" /></div>
      <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | 'all')} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="all">Todos os status</option>{Object.entries(statusMeta).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      <select value={priority} onChange={(e) => setPriority(e.target.value as ServiceOrder['priority'] | 'all')} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="all">Todas as prioridades</option><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></select>
    </div>
    {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">OS</th><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Serviço</th><th className="px-5 py-3">Data</th><th className="px-5 py-3">Prioridade</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Valor</th><th className="px-5 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{visible.map((o) => <tr key={o.id} onClick={() => setViewing(o)} className="cursor-pointer hover:bg-slate-50"><td className="px-5 py-4 font-bold">{o.id}</td><td className="px-5 py-4">{o.client}</td><td className="px-5 py-4 text-slate-600">{o.type || '—'}</td><td className="px-5 py-4">{formatDate(o.date)}</td><td className="px-5 py-4 capitalize">{o.priority === 'high' ? 'Alta' : o.priority === 'low' ? 'Baixa' : 'Média'}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusMeta[o.status].cls}`}>{statusMeta[o.status].label}</span></td><td className="px-5 py-4 text-right font-semibold">{money(o.clientValue)}</td><td className="px-5 py-4"><div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}><button onClick={() => setViewing(o)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Abrir OS"><FileText size={17} /></button><button onClick={() => setEditing(o)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Editar"><Edit3 size={17} /></button><button onClick={() => void remove(o)} className="rounded-lg p-2 text-red-500 hover:bg-red-50" aria-label="Excluir"><Trash2 size={17} /></button></div></td></tr>)}</tbody></table></div>
      {!visible.length && <div className="p-12 text-center text-slate-500"><ClipboardList className="mx-auto mb-3" size={30} /><p className="font-semibold">Nenhuma OS encontrada</p><p className="mt-1 text-sm">Ajuste os filtros ou cadastre uma nova ordem.</p></div>}
    </div>

    {viewing && <OrderDetailModal order={viewing} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null); }} />}

    {editing && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-6"><div className="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-bold">{editing.id ? `Editar ${editing.id}` : 'Nova Ordem de Serviço'}</h2><p className="text-sm text-slate-500">Dados principais da ordem.</p></div><button onClick={() => setEditing(null)} className="rounded-xl p-2 hover:bg-slate-100"><X /></button></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Cliente<select value={editing.clientId} onChange={(e) => selectClient(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3"><option value="">Selecione...</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="text-sm font-medium">Serviço<input value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value })} placeholder="Ex.: Instalação de CFTV" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" /></label>
      <label className="text-sm font-medium">Data<input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" /></label>
      <label className="text-sm font-medium">Status<select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as OrderStatus })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3">{Object.entries(statusMeta).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
      <label className="text-sm font-medium">Prioridade<select value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: e.target.value as ServiceOrder['priority'] })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3"><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></select></label>
      <label className="text-sm font-medium">Valor<input type="number" min="0" step="0.01" value={editing.clientValue} onChange={(e) => setEditing({ ...editing, clientValue: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" /></label>
      <label className="text-sm font-medium">Telefone<input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" /></label>
      <label className="text-sm font-medium sm:col-span-2">Endereço<input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" /></label>
      <label className="text-sm font-medium sm:col-span-2">Descrição<textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={4} placeholder="Detalhes do atendimento..." className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" /></label></div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button onClick={() => setEditing(null)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold">Cancelar</button><button onClick={() => void save()} disabled={saving} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar OS'}</button></div>
    </div></div>}
  </div>;
}
