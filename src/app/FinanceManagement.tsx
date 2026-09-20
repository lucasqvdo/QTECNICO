import { useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, DollarSign, Plus, Pencil, Trash2, X } from 'lucide-react';
import { api } from './api';
import type { Expense, Payment, ServiceOrder } from './types';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => new Date().toISOString().split('T')[0];

type Modal = 'payment' | 'expense' | null;
type EditingTransaction = { kind: 'payment' | 'expense'; id: string } | null;

export default function FinanceManagement({ orders, onOrdersChange, onBack }: { orders: ServiceOrder[]; onOrdersChange: (orders: ServiceOrder[]) => void; onBack: () => void }) {
  const [period, setPeriod] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [editing, setEditing] = useState<EditingTransaction>(null);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [status, setStatus] = useState<'paid' | 'pending'>('paid');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filteredOrders = useMemo(() => {
    let result = orders;
    if (period !== 'all') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - Number(period));
      result = result.filter((o) => new Date(`${o.date}T23:59:59`) >= cutoff);
    }
    if (paymentFilter !== 'all') result = result.filter((o) => o.paymentStatus === paymentFilter);
    const term = search.trim().toLowerCase();
    if (term) result = result.filter((o) => `${o.id} ${o.client} ${o.type}`.toLowerCase().includes(term));
    return result;
  }, [orders, period, paymentFilter, search]);

  const totals = useMemo(() => {
    const contracted = filteredOrders.reduce((s, o) => s + (Number(o.clientValue) || 0), 0);
    const received = filteredOrders.reduce((s, o) => s + o.payments.filter((p) => p.status === 'paid').reduce((a, p) => a + (Number(p.amount) || 0), 0), 0);
    const expectedPending = filteredOrders.reduce((s, o) => s + o.payments.filter((p) => p.status === 'pending').reduce((a, p) => a + (Number(p.amount) || 0), 0), 0);
    const receivable = Math.max(contracted - received, 0);
    const expenses = filteredOrders.reduce((s, o) => s + o.expenses.reduce((a, e) => a + (Number(e.amount) || 0), 0), 0);
    return { contracted, received, expectedPending, receivable, expenses, result: received - expenses };
  }, [filteredOrders]);

  const transactions = useMemo(() => filteredOrders.flatMap((o) => [
    ...o.payments.map((p) => ({ kind: 'payment' as const, id: `${o.id}-${p.id}`, date: p.date, label: p.label, order: o, amount: p.amount, status: p.status })),
    ...o.expenses.map((e) => ({ kind: 'expense' as const, id: `${o.id}-${e.id}`, date: o.date, label: e.label, order: o, amount: e.amount, status: 'paid' as const })),
  ]).sort((a, b) => b.date.localeCompare(a.date)), [filteredOrders]);

  const openModal = (kind: Modal, order: ServiceOrder) => {
    setModal(kind); setSelectedOrder(order); setEditing(null); setLabel(kind === 'payment' ? 'Pagamento' : ''); setAmount(''); setDate(today()); setStatus('paid'); setError('');
  };

  const openEdit = (kind: 'payment' | 'expense', order: ServiceOrder, id: string) => { const item = kind === 'payment' ? order.payments.find((p) => p.id === id) : order.expenses.find((e) => e.id === id); if (!item) return; setModal(kind); setSelectedOrder(order); setEditing({ kind, id }); setLabel(item.label); setAmount(String(item.amount)); if (kind === 'payment') { const payment = item as Payment; setDate(payment.date); setStatus(payment.status); } else { setDate(today()); setStatus('paid'); } setError(''); };

  const saveFinance = async () => {
    if (!selectedOrder || !label.trim() || Number(amount) <= 0) { setError('Informe descrição e um valor maior que zero.'); return; }
    setSaving(true); setError('');
    try {
      const value = Number(amount);
      let next: ServiceOrder;
      if (modal === 'payment') {
        const payments = editing?.kind === 'payment' ? selectedOrder.payments.map((p) => p.id === editing.id ? { ...p, label: label.trim(), amount: value, date, status } : p) : [...selectedOrder.payments, { id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, orderId: selectedOrder.id, label: label.trim(), amount: value, date, status } as Payment];
        const paidAmount = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
        const paidPayments = payments.filter((p) => p.status === 'paid');
        next = { ...selectedOrder, payments, paidAmount, paymentStatus: paidAmount >= selectedOrder.clientValue && selectedOrder.clientValue > 0 ? 'paid' : 'pending', paidDate: paidPayments.length ? paidPayments.map((p) => p.date).sort().at(-1) : undefined };
      } else {
        const expenses = editing?.kind === 'expense' ? selectedOrder.expenses.map((e) => e.id === editing.id ? { ...e, label: label.trim(), amount: value } : e) : [...selectedOrder.expenses, { id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, label: label.trim(), amount: value } as Expense];
        next = { ...selectedOrder, expenses };
      }
      const saved = await api.updateOrder(selectedOrder.id, next);
      onOrdersChange(orders.map((o) => o.id === saved.id ? saved : o));
      setModal(null); setSelectedOrder(null); setEditing(null);
    } catch (e: any) { setError(e?.message || 'Não foi possível salvar o lançamento.'); }
    finally { setSaving(false); }
  };

  const removeTransaction = async (order: ServiceOrder, kind: 'payment' | 'expense', id: string) => {
    if (!window.confirm('Excluir este lançamento financeiro?')) return;
    setError('');
    try {
      let next = order;
      if (kind === 'payment') {
        const payments = order.payments.filter((p) => p.id !== id);
        const paidAmount = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
        const paidPayments = payments.filter((p) => p.status === 'paid');
        next = { ...order, payments, paidAmount, paymentStatus: paidAmount >= order.clientValue && order.clientValue > 0 ? 'paid' : 'pending', paidDate: paidPayments.length ? paidPayments.map((p) => p.date).sort().at(-1) : undefined };
      } else next = { ...order, expenses: order.expenses.filter((e) => e.id !== id) };
      const saved = await api.updateOrder(order.id, next);
      onOrdersChange(orders.map((o) => o.id === saved.id ? saved : o));
    } catch (e: any) { setError(e?.message || 'Não foi possível excluir o lançamento.'); }
  };

  return <div className="p-4 sm:p-6 lg:p-8">
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div><button onClick={onBack} className="mb-2 text-sm font-semibold text-cyan-600 hover:text-cyan-700">← Voltar ao dashboard</button><h1 className="text-3xl font-bold tracking-tight">Financeiro</h1><p className="mt-1 text-sm text-slate-500">Controle de faturamento, recebimentos, contas a receber e custos das OS.</p></div>
      <div className="flex flex-wrap gap-2"><select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="all">Todo o período</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option></select><select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as any)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="all">Todos os pagamentos</option><option value="pending">A receber</option><option value="paid">Pagos</option></select></div>
    </div>

    {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Card icon={DollarSign} label="Faturamento" value={money(totals.contracted)} />
      <Card icon={ArrowDownCircle} label="Recebido" value={money(totals.received)} />
      <Card icon={ArrowUpCircle} label="A receber" value={money(totals.receivable)} detail={totals.expectedPending ? `${money(totals.expectedPending)} lançados` : undefined} />
      <Card icon={ArrowUpCircle} label="Custos" value={money(totals.expenses)} />
      <Card icon={DollarSign} label="Resultado" value={money(totals.result)} detail="Recebido − custos" />
    </section>

    <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between"><div><h2 className="font-bold">Contas por OS</h2><p className="text-xs text-slate-500">Acompanhe o valor contratado, recebido, saldo e custos.</p></div><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar OS, cliente ou serviço" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm md:w-72" /></div>
      <div className="divide-y divide-slate-100">
        {filteredOrders.map((o) => { const received = o.payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0); const expenses = o.expenses.reduce((s, e) => s + e.amount, 0); const balance = Math.max(o.clientValue - received, 0); return <div key={o.id} className="p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-bold">{o.id}</span><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${balance > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{balance > 0 ? 'A receber' : 'Quitada'}</span></div><p className="mt-1 font-medium">{o.client}</p><p className="text-xs text-slate-500">{o.type} · {o.date}</p></div><div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 xl:min-w-[620px]"><Metric label="Contratado" value={money(o.clientValue)} /><Metric label="Recebido" value={money(received)} /><Metric label="Saldo" value={money(balance)} /><Metric label="Custos" value={money(expenses)} /></div><div className="flex flex-wrap gap-2"><button onClick={() => openModal('payment', o)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"><Plus size={16} />Pagamento</button><button onClick={() => openModal('expense', o)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"><Plus size={16} />Custo</button></div></div></div>; })}
        {!filteredOrders.length && <div className="p-10 text-center text-sm text-slate-500">Nenhuma OS encontrada.</div>}
      </div>
    </section>

    <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="font-bold">Movimentações financeiras</h2><p className="text-xs text-slate-500">Pagamentos e custos registrados nas OS.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Data</th><th className="px-5 py-3">Tipo</th><th className="px-5 py-3">Descrição</th><th className="px-5 py-3">OS / Cliente</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Valor</th><th className="px-5 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{transactions.map((t) => <tr key={t.id}><td className="px-5 py-3.5">{new Date(`${t.date}T12:00:00`).toLocaleDateString('pt-BR')}</td><td className="px-5 py-3.5">{t.kind === 'payment' ? <span className="inline-flex items-center gap-1 text-emerald-700"><ArrowDownCircle size={15} />Recebimento</span> : <span className="inline-flex items-center gap-1 text-red-600"><ArrowUpCircle size={15} />Custo</span>}</td><td className="px-5 py-3.5 font-medium">{t.label}</td><td className="px-5 py-3.5">{t.order.id} · {t.order.client}</td><td className="px-5 py-3.5">{t.kind === 'payment' ? (t.status === 'paid' ? 'Pago' : 'Pendente') : 'Registrado'}</td><td className={`px-5 py-3.5 text-right font-semibold ${t.kind === 'payment' ? 'text-emerald-700' : 'text-red-600'}`}>{t.kind === 'payment' ? '+' : '-'} {money(t.amount)}</td><td className="px-5 py-3.5 text-right"><div className="flex justify-end gap-1"><button onClick={() => openEdit(t.kind, t.order, t.id.slice(t.order.id.length + 1))} className="rounded-lg p-2 text-slate-400 hover:bg-cyan-50 hover:text-cyan-700" aria-label="Editar lançamento"><Pencil size={16} /></button></div><button onClick={() => removeTransaction(t.order, t.kind, t.kind === 'payment' ? (t.order.payments.find((p) => `${t.order.id}-${p.id}` === t.id)?.id || '') : (t.order.expenses.find((e) => `${t.order.id}-${e.id}` === t.id)?.id || ''))} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Excluir lançamento"><Trash2 size={16} /></button></td></tr>)}</tbody></table>{!transactions.length && <div className="p-10 text-center text-sm text-slate-500">Nenhuma movimentação registrada.</div>}</div></section>

    {modal && selectedOrder && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><div className="w-full max-w-md rounded-2xl bg-white shadow-xl"><div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-bold">{editing ? (modal === 'payment' ? 'Editar pagamento' : 'Editar custo') : (modal === 'payment' ? 'Registrar pagamento' : 'Registrar custo')}</h2><p className="text-xs text-slate-500">{selectedOrder.id} · {selectedOrder.client}</p></div><button onClick={() => setModal(null)} className="rounded-lg p-2 hover:bg-slate-100"><X size={18} /></button></div><div className="space-y-4 p-5"><label className="block text-sm font-medium">Descrição<input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder={modal === 'payment' ? 'Ex.: Sinal, PIX, parcela final' : 'Ex.: Material, deslocamento, terceirização'} /></label><label className="block text-sm font-medium">Valor<input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="0,00" /></label>{modal === 'payment' && <><label className="block text-sm font-medium">Data<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label><label className="block text-sm font-medium">Status<select value={status} onChange={(e) => setStatus(e.target.value as 'paid' | 'pending')} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"><option value="paid">Pago / recebido</option><option value="pending">Pendente</option></select></label></>}<div className="flex justify-end gap-2 pt-2"><button onClick={() => setModal(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Cancelar</button><button disabled={saving} onClick={() => void saveFinance()} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Salvar lançamento'}</button></div></div></div></div>}
  </div>;
}

function Card({ icon: Icon, label, value, detail }: { icon: typeof DollarSign; label: string; value: string; detail?: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-xl font-bold tracking-tight text-slate-900">{value}</p>{detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}</div><div className="rounded-xl bg-cyan-50 p-3 text-cyan-600"><Icon size={20} /></div></div></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-800">{value}</p></div>; }
