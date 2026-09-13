import { useMemo, useState } from 'react';
import { ClipboardList, Edit3, Plus, Search, Trash2, X } from 'lucide-react';
import { api } from './api';
import type { Client, OrderStatus, ServiceOrder } from './types';

const statusMeta: Record<OrderStatus, { label: string; cls: string }> = {
  pending: { label: 'Pendente', cls: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'Em andamento', cls: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Concluída', cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cancelada', cls: 'bg-red-100 text-red-700' },
};
const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

type Props = { orders: ServiceOrder[]; clients: Client[]; onOrdersChange: (orders: ServiceOrder[]) => void; onBack: () => void };

export default function OrdersManagement({ orders, clients, onOrdersChange, onBack }: Props) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [priority, setPriority] = useState<ServiceOrder['priority'] | 'all'>('all');
  const [editing, setEditing] = useState<ServiceOrder | null>(null);
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
    setEditing({
      id: '', clientId: client?.id || '', client: client?.name || '', address: client?.address || '', phone: client?.phone || '',
      type: '', status: 'pending', date: new Date().toISOString().slice(0, 10), priority: 'medium', description: '', clientValue: 0,
      expenses: [], attendances: [], payments: [], paymentStatus: 'pending',
    });
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
      setEditing(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar a ordem.'); }
    finally { setSaving(false); }
  };

  const remove = async (order: ServiceOrder) => {
    if (!window.confirm(`Excluir a ${order.id}? Esta ação não pode ser desfeita.`)) return;
    try { await api.deleteOrder(order.id); onOrdersChange(orders.filter((o) => o.id !== order.id)); }
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
      <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">OS</th><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Serviço</th><th className="px-5 py-3">Data</th><th className="px-5 py-3">Prioridade</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Valor</th><th className="px-5 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{visible.map((o) => <tr key={o.id} className="hover:bg-slate-50"><td className="px-5 py-4 font-bold">{o.id}</td><td className="px-5 py-4">{o.client}</td><td className="px-5 py-4 text-slate-600">{o.type || '—'}</td><td className="px-5 py-4">{new Date(`${o.date}T12:00:00`).toLocaleDateString('pt-BR')}</td><td className="px-5 py-4 capitalize">{o.priority === 'high' ? 'Alta' : o.priority === 'low' ? 'Baixa' : 'Média'}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusMeta[o.status].cls}`}>{statusMeta[o.status].label}</span></td><td className="px-5 py-4 text-right font-semibold">{money(o.clientValue)}</td><td className="px-5 py-4"><div className="flex justify-end gap-1"><button onClick={() => setEditing(o)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Editar"><Edit3 size={17} /></button><button onClick={() => void remove(o)} className="rounded-lg p-2 text-red-500 hover:bg-red-50" aria-label="Excluir"><Trash2 size={17} /></button></div></td></tr>)}</tbody></table></div>
      {!visible.length && <div className="p-12 text-center text-slate-500"><ClipboardList className="mx-auto mb-3" size={30} /><p className="font-semibold">Nenhuma OS encontrada</p><p className="mt-1 text-sm">Ajuste os filtros ou cadastre uma nova ordem.</p></div>}
    </div>
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
