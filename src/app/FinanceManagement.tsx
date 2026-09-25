import { useEffect, useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Clock3, DollarSign, Plus, Pencil, Trash2, X } from 'lucide-react';
import { api } from './api';
import type { CompanyExpense } from './api';
import type { Expense, Payment, ServiceOrder } from './types';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => new Date().toISOString().split('T')[0];

type Modal = 'payment' | 'expense' | null;
type EditingTransaction = { kind: 'payment' | 'expense'; id: string } | null;

export default function FinanceManagement({ orders, onOrdersChange, onBack }: { orders: ServiceOrder[]; onOrdersChange: (orders: ServiceOrder[]) => void; onBack: () => void }) {
  const [companyExpenses, setCompanyExpenses] = useState<CompanyExpense[]>([]);
  const [companyExpenseModal, setCompanyExpenseModal] = useState(false);
  const [companyExpenseEditing, setCompanyExpenseEditing] = useState<CompanyExpense|null>(null);
  const [companyExpenseForm, setCompanyExpenseForm] = useState({description:'',category:'Outros',supplier:'',amount:'',dueDate:today(),status:'pending' as 'pending'|'paid',recurrence:'once' as 'once'|'monthly'|'quarterly'|'yearly',notes:''});
  const [activeTab, setActiveTab] = useState<'receivable' | 'payable'>('receivable');
  const [period, setPeriod] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [financialStatusFilter, setFinancialStatusFilter] = useState('all');
  const [modal, setModal] = useState<Modal>(null);
  const [editing, setEditing] = useState<EditingTransaction>(null);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [financeOrderId, setFinanceOrderId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [status, setStatus] = useState<'paid' | 'pending'>('paid');
  const [saving, setSaving] = useState(false);
  const [quickSavingId, setQuickSavingId] = useState<string | null>(null);
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineLabel, setInlineLabel] = useState('');
  const [inlineAmount, setInlineAmount] = useState('');
  const [inlineDate, setInlineDate] = useState('');
  const [error, setError] = useState('');

  useEffect(()=>{void api.getCompanyExpenses().then(setCompanyExpenses).catch(e=>setError(e instanceof Error?e.message:'Não foi possível carregar as despesas da empresa.'))},[]);
  const openCompanyExpense=(expense?:CompanyExpense)=>{setCompanyExpenseEditing(expense||null);setCompanyExpenseForm(expense?{description:expense.description,category:expense.category,supplier:expense.supplier,amount:String(expense.amount),dueDate:String(expense.dueDate).slice(0,10),status:expense.status,recurrence:expense.recurrence,notes:expense.notes}:{description:'',category:'Outros',supplier:'',amount:'',dueDate:today(),status:'pending',recurrence:'once',notes:''});setCompanyExpenseModal(true)};
  const saveCompanyExpense=async()=>{if(!companyExpenseForm.description.trim()||Number(companyExpenseForm.amount)<=0||!companyExpenseForm.dueDate){setError('Informe descrição, valor e vencimento.');return}setSaving(true);setError('');try{const payload={...companyExpenseForm,amount:Number(companyExpenseForm.amount),paidAt:companyExpenseForm.status==='paid'?companyExpenseForm.dueDate:null};const saved=companyExpenseEditing?await api.updateCompanyExpense(companyExpenseEditing.id,payload):await api.createCompanyExpense(payload);setCompanyExpenses(x=>companyExpenseEditing?x.map(e=>e.id===saved.id?saved:e):[saved,...x]);setCompanyExpenseModal(false)}catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar a despesa.')}finally{setSaving(false)}};
  const removeCompanyExpense=async(expense:CompanyExpense)=>{if(!confirm('Excluir esta despesa da empresa?'))return;try{await api.deleteCompanyExpense(expense.id);setCompanyExpenses(x=>x.filter(e=>e.id!==expense.id))}catch(e){setError(e instanceof Error?e.message:'Não foi possível excluir a despesa.')}};

  const filteredOrders = useMemo(() => {
    let result = orders;
    if (period !== 'all') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - Number(period));
      result = result.filter((o) => new Date(`${o.date}T23:59:59`) >= cutoff);
    }
    if (paymentFilter !== 'all') result = result.filter((o) => o.paymentStatus === paymentFilter);
    if (clientFilter !== 'all') result = result.filter((o) => o.client === clientFilter);
    if (orderStatusFilter !== 'all') result = result.filter((o) => o.status === orderStatusFilter);
    if (financialStatusFilter !== 'all') result = result.filter((o) => {
      const received = o.payments.filter((p) => p.status === 'paid').reduce((s, p) => s + (Number(p.amount) || 0), 0);
      if (financialStatusFilter === 'unpaid') return received <= 0 && o.clientValue > 0;
      if (financialStatusFilter === 'partial') return received > 0 && received < o.clientValue;
      if (financialStatusFilter === 'settled') return o.clientValue > 0 && received >= o.clientValue;
      return true;
    });
    const term = search.trim().toLowerCase();
    if (term) result = result.filter((o) => `${o.id} ${o.client} ${o.type}`.toLowerCase().includes(term));
    return result;
  }, [orders, period, paymentFilter, clientFilter, orderStatusFilter, financialStatusFilter, search]);

  const totals = useMemo(() => {
    const contracted = filteredOrders.reduce((s, o) => s + (Number(o.clientValue) || 0), 0);
    const received = filteredOrders.reduce((s, o) => s + o.payments.filter((p) => p.status === 'paid').reduce((a, p) => a + (Number(p.amount) || 0), 0), 0);
    const expectedPending = filteredOrders.reduce((s, o) => s + o.payments.filter((p) => p.status === 'pending').reduce((a, p) => a + (Number(p.amount) || 0), 0), 0);
    const receivable = filteredOrders.reduce((s, o) => { const orderReceived = o.payments.filter((p) => p.status === 'paid').reduce((a, p) => a + (Number(p.amount) || 0), 0); return s + Math.max((Number(o.clientValue) || 0) - orderReceived, 0); }, 0);
    const receivableOrders = filteredOrders.filter((o) => { const orderReceived = o.payments.filter((p) => p.status === 'paid').reduce((a, p) => a + (Number(p.amount) || 0), 0); return Number(o.clientValue) > 0 && orderReceived < Number(o.clientValue); }).length;
    const expenses = filteredOrders.reduce((s, o) => s + o.expenses.reduce((a, e) => a + (Number(e.amount) || 0), 0), 0);
    return { contracted, received, expectedPending, receivable, receivableOrders, expenses, result: received - expenses };
  }, [filteredOrders]);

  const clientOptions = useMemo(() => Array.from(new Set(orders.map((o) => o.client).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')), [orders]);
  const hasFilters = period !== 'all' || paymentFilter !== 'all' || clientFilter !== 'all' || orderStatusFilter !== 'all' || financialStatusFilter !== 'all' || !!search.trim();
  const clearFilters = () => { setPeriod('all'); setPaymentFilter('all'); setClientFilter('all'); setOrderStatusFilter('all'); setFinancialStatusFilter('all'); setSearch(''); };

    const financeOrder = financeOrderId ? orders.find((o) => String(o.id) === financeOrderId) || null : null;

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
    if (modal === 'payment' && status === 'paid' && Number(selectedOrder.clientValue) > 0) {
      const alreadyPaid = selectedOrder.payments.filter((p) => p.status === 'paid' && !(editing?.kind === 'payment' && p.id === editing.id)).reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const available = Math.max((Number(selectedOrder.clientValue) || 0) - alreadyPaid, 0);
      if (Number(amount) > available) { setError(`Este pagamento excede o saldo da OS em ${money(Number(amount) - available)}. Saldo disponível: ${money(available)}.`); return; }
    }
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

  const startInlineEdit = (kind: 'payment' | 'expense', order: ServiceOrder, id: string) => {
    const item = kind === 'payment' ? order.payments.find((p) => p.id === id) : order.expenses.find((e) => e.id === id);
    if (!item) return;
    setInlineEditingId(`${order.id}:${kind}:${id}`); setInlineLabel(item.label); setInlineAmount(String(item.amount)); setInlineDate(kind === 'payment' ? (item as Payment).date : order.date); setError('');
  };

  const saveInlineEdit = async (kind: 'payment' | 'expense', order: ServiceOrder, id: string) => {
    if (!inlineLabel.trim() || Number(inlineAmount) <= 0) { setError('Informe descrição e um valor maior que zero.'); return; }
    if (kind === 'payment') {
      const current = order.payments.find((p) => p.id === id);
      if (current?.status === 'paid' && Number(order.clientValue) > 0) {
        const alreadyPaid = order.payments.filter((p) => p.status === 'paid' && p.id !== id).reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const available = Math.max((Number(order.clientValue) || 0) - alreadyPaid, 0);
        if (Number(inlineAmount) > available) { setError(`Este pagamento excede o saldo da OS em ${money(Number(inlineAmount) - available)}. Saldo disponível: ${money(available)}.`); return; }
      }
    }
    const key = `${order.id}:${kind}:${id}`; setQuickSavingId(key); setError('');
    try {
      let next: ServiceOrder;
      if (kind === 'payment') {
        const payments = order.payments.map((p) => p.id === id ? { ...p, label: inlineLabel.trim(), amount: Number(inlineAmount), date: inlineDate || p.date } : p);
        const paidAmount = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
        const paidPayments = payments.filter((p) => p.status === 'paid');
        next = { ...order, payments, paidAmount, paymentStatus: paidAmount >= order.clientValue && order.clientValue > 0 ? 'paid' : 'pending', paidDate: paidPayments.length ? paidPayments.map((p) => p.date).sort().at(-1) : undefined };
      } else next = { ...order, expenses: order.expenses.map((e) => e.id === id ? { ...e, label: inlineLabel.trim(), amount: Number(inlineAmount) } : e) };
      const saved = await api.updateOrder(order.id, next);
      onOrdersChange(orders.map((o) => String(o.id) === String(saved.id) ? saved : o)); setInlineEditingId(null);
    } catch (e: any) { setError(e?.message || 'Não foi possível atualizar o lançamento.'); }
    finally { setQuickSavingId(null); }
  };

  const quickPaymentStatus = async (order: ServiceOrder, paymentId: string, nextStatus: 'paid' | 'pending') => {
    const current = order.payments.find((p) => p.id === paymentId);
    if (!current || current.status === nextStatus) return;
    if (nextStatus === 'paid' && Number(order.clientValue) > 0) {
      const alreadyPaid = order.payments.filter((p) => p.status === 'paid' && p.id !== paymentId).reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const available = Math.max((Number(order.clientValue) || 0) - alreadyPaid, 0);
      if ((Number(current.amount) || 0) > available) { setError(`Não é possível marcar como pago: o lançamento excede o saldo da OS em ${money((Number(current.amount) || 0) - available)}.`); return; }
    }
    setQuickSavingId(paymentId); setError('');
    try {
      const payments = order.payments.map((p) => p.id === paymentId ? { ...p, status: nextStatus } : p);
      const paidAmount = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
      const paidPayments = payments.filter((p) => p.status === 'paid');
      const next = { ...order, payments, paidAmount, paymentStatus: paidAmount >= order.clientValue && order.clientValue > 0 ? 'paid' as const : 'pending' as const, paidDate: paidPayments.length ? paidPayments.map((p) => p.date).sort().at(-1) : undefined };
      const saved = await api.updateOrder(order.id, next);
      onOrdersChange(orders.map((o) => String(o.id) === String(saved.id) ? saved : o));
    } catch (e: any) { setError(e?.message || 'Não foi possível atualizar o pagamento.'); }
    finally { setQuickSavingId(null); }
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
      
    </div>

    {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Card icon={DollarSign} label="Faturamento" value={money(totals.contracted)} />
      <Card icon={ArrowDownCircle} label="Recebido" value={money(totals.received)} />
      <Card icon={ArrowUpCircle} label="A receber" value={money(totals.receivable)} detail={`${totals.receivableOrders} ${totals.receivableOrders === 1 ? "OS com saldo" : "OS com saldo"}`} />
      <Card icon={Clock3} label="Pagamentos pendentes" value={money(totals.expectedPending)} detail="Lançamentos já cadastrados" />
      <Card icon={ArrowUpCircle} label="Custos" value={money(totals.expenses)} />
      <Card icon={DollarSign} label="Resultado" value={money(totals.result)} detail="Recebido − custos" />
    </section>

    <div className="mt-6 flex gap-1 rounded-xl bg-slate-100 p-1">
      <button onClick={() => setActiveTab('receivable')} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${activeTab === 'receivable' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Contas a receber</button>
      <button onClick={() => setActiveTab('payable')} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${activeTab === 'payable' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Contas a pagar</button>
    </div>

    {activeTab === 'receivable' && <>
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5"><div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><h2 className="font-bold">Contas a receber por OS</h2><p className="text-xs text-slate-500">Acompanhe o valor contratado, recebido, saldo e custos. <strong>{filteredOrders.length}</strong> de {orders.length} OS.</p></div>{hasFilters && <button onClick={clearFilters} className="self-start rounded-lg px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-50">Limpar filtros</button>}</div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar OS, cliente ou serviço" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm xl:col-span-2"/><select value={clientFilter} onChange={(e)=>setClientFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="all">Todos os clientes</option>{clientOptions.map((client)=><option key={client} value={client}>{client}</option>)}</select><select value={orderStatusFilter} onChange={(e)=>setOrderStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="all">Todos os status da OS</option><option value="pending">Pendente</option><option value="in_progress">Em andamento</option><option value="completed">Concluída</option><option value="cancelled">Cancelada</option></select><select value={financialStatusFilter} onChange={(e)=>setFinancialStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="all">Situação financeira</option><option value="unpaid">Não recebido</option><option value="partial">Parcial</option><option value="settled">Quitado</option></select><select value={period} onChange={(e)=>setPeriod(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="all">Todo o período</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option></select></div></div>
      <div className="divide-y divide-slate-100">
        {filteredOrders.map((o) => { const received = o.payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0); const expenses = o.expenses.reduce((s, e) => s + e.amount, 0); const balance = Math.max(o.clientValue - received, 0); const missingValue = Number(o.clientValue) <= 0 && received > 0; const excess = Number(o.clientValue) > 0 ? Math.max(received - o.clientValue, 0) : 0; return <button type="button" key={o.id} onClick={() => setFinanceOrderId(String(o.id))} className="w-full p-5 text-left transition hover:bg-slate-50"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-bold">{o.id}</span><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${balance > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{missingValue ? 'Valor da OS não informado' : excess > 0 ? 'Recebimento excedente' : balance > 0 ? 'A receber' : 'Quitada'}</span>{excess > 0 && <span className="rounded-full bg-red-100 px-2 py-1 text-[11px] font-semibold text-red-700">+ {money(excess)}</span>}</div><p className="mt-1 font-medium">{o.client}</p><p className="text-xs text-slate-500">{o.type} · {o.date}</p></div><div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 xl:min-w-[620px]"><Metric label="Contratado" value={money(o.clientValue)} /><Metric label="Recebido" value={money(received)} /><Metric label="Saldo" value={money(balance)} /><Metric label="Custos" value={money(expenses)} /></div><span className="text-sm font-semibold text-cyan-600">Abrir financeiro →</span></div></button>; })}
        {!filteredOrders.length && <div className="p-10 text-center text-sm text-slate-500">Nenhuma OS encontrada.</div>}
      </div>
    </section>

    <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="font-bold">Recebimentos</h2><p className="text-xs text-slate-500">Clique na descrição ou no valor para editar diretamente. Pagamentos também permitem alterar data e status sem sair da tabela.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Data</th><th className="px-5 py-3">Tipo</th><th className="px-5 py-3">Descrição</th><th className="px-5 py-3">OS / Cliente</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Valor</th><th className="px-5 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{transactions.filter((t) => t.kind === 'payment').map((t) => { const itemId=t.id.split('-').slice(1).join('-'); const editKey=`${t.order.id}:${t.kind}:${itemId}`; const isEditing=inlineEditingId===editKey; return <tr key={t.id} className={isEditing ? 'bg-cyan-50/40' : ''}><td className="px-5 py-3.5">{isEditing ? <input type="date" value={inlineDate} disabled={t.kind==='expense'} onChange={(e)=>setInlineDate(e.target.value)} className="w-36 rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:bg-slate-100"/> : new Date(`${t.date}T12:00:00`).toLocaleDateString('pt-BR')}</td><td className="px-5 py-3.5">{t.kind === 'payment' ? <span className="inline-flex items-center gap-1 text-emerald-700"><ArrowDownCircle size={15}/>Recebimento</span> : <span className="inline-flex items-center gap-1 text-red-600"><ArrowUpCircle size={15}/>Custo</span>}</td><td className="px-5 py-3.5 font-medium">{isEditing ? <input value={inlineLabel} autoFocus onChange={(e)=>setInlineLabel(e.target.value)} className="w-full min-w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"/> : <button onClick={()=>startInlineEdit(t.kind,t.order,itemId)} className="text-left hover:text-cyan-700" title="Clique para editar">{t.label}</button>}</td><td className="px-5 py-3.5">{t.order.id} · {t.order.client}</td><td className="px-5 py-3.5">{t.kind === 'payment' ? <select value={t.status} disabled={quickSavingId === itemId} onChange={(e) => void quickPaymentStatus(t.order,itemId,e.target.value as 'paid'|'pending')} className={`rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold outline-none disabled:opacity-50 ${t.status==='paid'?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}><option value="paid">Pago</option><option value="pending">Pendente</option></select> : 'Registrado'}</td><td className="px-5 py-3.5 text-right">{isEditing ? <input type="number" min="0.01" step="0.01" value={inlineAmount} onChange={(e)=>setInlineAmount(e.target.value)} className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm font-semibold"/> : <button onClick={()=>startInlineEdit(t.kind,t.order,itemId)} className={`font-semibold ${t.kind==='payment'?'text-emerald-700':'text-red-600'}`} title="Clique para editar">{t.kind==='payment'?'+':'-'} {money(t.amount)}</button>}</td><td className="px-5 py-3.5 text-right"><div className="flex justify-end gap-1">{isEditing ? <><button disabled={quickSavingId===editKey} onClick={()=>void saveInlineEdit(t.kind,t.order,itemId)} className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{quickSavingId===editKey?'Salvando...':'Salvar'}</button><button onClick={()=>setInlineEditingId(null)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">Cancelar</button></> : <><button onClick={()=>startInlineEdit(t.kind,t.order,itemId)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Editar"><Pencil size={15}/></button><button onClick={()=>void removeTransaction(t.order,t.kind,itemId)} className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Excluir"><Trash2 size={15}/></button></>}</div></td></tr>; })}</tbody></table>{!transactions.length && <div className="p-10 text-center text-sm text-slate-500">Nenhuma movimentação registrada.</div>}</div></section>
    </>}

    {activeTab === 'payable' && <><section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-bold">Despesas da empresa</h2><p className="text-xs text-slate-500">Aluguel, internet, combustível, contador, ferramentas, impostos e outras despesas sem vínculo obrigatório com OS.</p></div><button onClick={()=>openCompanyExpense()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16}/> Nova despesa</button></div><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Vencimento</th><th className="px-5 py-3">Descrição</th><th className="px-5 py-3">Categoria / Fornecedor</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Valor</th><th/></tr></thead><tbody className="divide-y divide-slate-100">{companyExpenses.map(e=><tr key={e.id}><td className="px-5 py-3.5">{new Date(`${String(e.dueDate).slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR')}</td><td className="px-5 py-3.5 font-medium">{e.description}<div className="text-xs text-slate-400">{e.recurrence==='monthly'?'Mensal':e.recurrence==='quarterly'?'Trimestral':e.recurrence==='yearly'?'Anual':'Única'}</div></td><td className="px-5 py-3.5">{e.category}<div className="text-xs text-slate-400">{e.supplier||'Sem fornecedor'}</div></td><td className="px-5 py-3.5"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${e.status==='paid'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>{e.status==='paid'?'Pago':'Pendente'}</span></td><td className="px-5 py-3.5 text-right font-semibold text-red-600">{money(e.amount)}</td><td className="px-5 py-3.5"><div className="flex justify-end"><button onClick={()=>openCompanyExpense(e)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Pencil size={15}/></button><button onClick={()=>void removeCompanyExpense(e)} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 size={15}/></button></div></td></tr>)}</tbody></table>{!companyExpenses.length&&<div className="p-10 text-center text-sm text-slate-500">Nenhuma despesa da empresa cadastrada.</div>}</div></section><section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="font-bold">Custos das ordens de serviço</h2><p className="text-xs text-slate-500">Materiais, deslocamentos e demais custos vinculados às OS.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">OS / Cliente</th><th className="px-5 py-3">Descrição</th><th className="px-5 py-3">Referência</th><th className="px-5 py-3 text-right">Valor</th><th className="px-5 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{transactions.filter((t) => t.kind === 'expense').map((t) => { const itemId=t.id.split('-').slice(1).join('-'); return <tr key={t.id}><td className="px-5 py-3.5"><button onClick={()=>setFinanceOrderId(String(t.order.id))} className="text-left font-medium hover:text-cyan-700">{t.order.id} · {t.order.client}</button></td><td className="px-5 py-3.5">{t.label}</td><td className="px-5 py-3.5 text-slate-500">{new Date(`${t.order.date}T12:00:00`).toLocaleDateString('pt-BR')}</td><td className="px-5 py-3.5 text-right font-semibold text-red-600">{money(t.amount)}</td><td className="px-5 py-3.5 text-right"><div className="flex justify-end gap-1"><button onClick={()=>openEdit('expense',t.order,itemId)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Editar"><Pencil size={15}/></button><button onClick={()=>void removeTransaction(t.order,'expense',itemId)} className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Excluir"><Trash2 size={15}/></button></div></td></tr>; })}</tbody></table>{!transactions.some((t) => t.kind === 'expense') && <div className="p-10 text-center text-sm text-slate-500">Nenhuma conta a pagar registrada.</div>}</div></section></>}

    {financeOrder && (() => { const received = financeOrder.payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0); const costs = financeOrder.expenses.reduce((s, e) => s + e.amount, 0); const balance = Math.max(financeOrder.clientValue - received, 0); const missingValue = Number(financeOrder.clientValue) <= 0 && received > 0; const excess = Number(financeOrder.clientValue) > 0 ? Math.max(received - financeOrder.clientValue, 0) : 0; return <div className="fixed inset-0 z-40 bg-slate-50 overflow-y-auto"><div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8"><div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><button onClick={() => setFinanceOrderId(null)} className="mb-2 text-sm font-semibold text-cyan-600">← Voltar ao financeiro</button><h2 className="text-2xl font-bold">Financeiro da {financeOrder.id}</h2><p className="text-sm text-slate-500">{financeOrder.client} · {financeOrder.type}</p></div><div className="flex gap-2"><button onClick={() => openModal('expense', financeOrder)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"><Plus size={16}/> Adicionar custo</button><button onClick={() => openModal('payment', financeOrder)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16}/> Adicionar pagamento</button></div></div>{missingValue && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">Esta OS possui recebimentos registrados, mas o valor contratado ainda não foi informado. Defina o valor da OS para que saldo e situação financeira sejam calculados corretamente.</div>}{excess > 0 && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">Atenção: os recebimentos desta OS excedem o valor contratado em {money(excess)}. Revise os pagamentos registrados.</div>}<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Contratado" value={money(financeOrder.clientValue)} /><Metric label="Recebido" value={money(received)} /><Metric label="Saldo a receber" value={money(balance)} /><Metric label="Custos" value={money(costs)} /></div><div className="mt-6 grid gap-6 lg:grid-cols-2"><section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h3 className="font-bold">Custos</h3><p className="text-xs text-slate-500">Despesas vinculadas a esta OS.</p></div><button onClick={() => openModal('expense', financeOrder)} className="rounded-lg p-2 text-cyan-600 hover:bg-cyan-50"><Plus size={18}/></button></div><div className="divide-y divide-slate-100">{financeOrder.expenses.map((e) => <div key={e.id} className="flex items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{e.label}</p><p className="text-xs text-slate-500">Custo registrado</p></div><span className="font-semibold text-red-600">{money(e.amount)}</span><button onClick={() => openEdit('expense', financeOrder, e.id)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Pencil size={15}/></button><button onClick={() => void removeTransaction(financeOrder, 'expense', e.id)} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 size={15}/></button></div>)}{!financeOrder.expenses.length && <div className="p-8 text-center text-sm text-slate-500">Nenhum custo registrado.</div>}</div></section><section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h3 className="font-bold">Pagamentos</h3><p className="text-xs text-slate-500">Recebimentos e valores pendentes.</p></div><button onClick={() => openModal('payment', financeOrder)} className="rounded-lg p-2 text-cyan-600 hover:bg-cyan-50"><Plus size={18}/></button></div><div className="divide-y divide-slate-100">{financeOrder.payments.map((p) => <div key={p.id} className="flex items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{p.label}</p><p className="text-xs text-slate-500">{new Date(`${p.date}T12:00:00`).toLocaleDateString('pt-BR')} · {p.status === 'paid' ? 'Pago' : 'Pendente'}</p></div><span className={`font-semibold ${p.status === 'paid' ? 'text-emerald-700' : 'text-amber-700'}`}>{money(p.amount)}</span><button onClick={() => openEdit('payment', financeOrder, p.id)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Pencil size={15}/></button><button onClick={() => void removeTransaction(financeOrder, 'payment', p.id)} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 size={15}/></button></div>)}{!financeOrder.payments.length && <div className="p-8 text-center text-sm text-slate-500">Nenhum pagamento registrado.</div>}</div></section></div></div></div>; })()}

    {companyExpenseModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><div className="w-full max-w-lg rounded-2xl bg-white shadow-xl"><div className="flex items-center justify-between border-b p-5"><h2 className="font-bold">{companyExpenseEditing?'Editar despesa':'Nova despesa da empresa'}</h2><button onClick={()=>setCompanyExpenseModal(false)}><X size={18}/></button></div><div className="grid gap-4 p-5 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Descrição<input value={companyExpenseForm.description} onChange={e=>setCompanyExpenseForm({...companyExpenseForm,description:e.target.value})} className="mt-1 w-full rounded-xl border px-3 py-2"/></label><label className="text-sm font-medium">Categoria<select value={companyExpenseForm.category} onChange={e=>setCompanyExpenseForm({...companyExpenseForm,category:e.target.value})} className="mt-1 w-full rounded-xl border px-3 py-2"><option>Aluguel</option><option>Internet / Telefonia</option><option>Combustível</option><option>Ferramentas / Equipamentos</option><option>Contabilidade</option><option>Software / Assinaturas</option><option>Impostos</option><option>Salários / Pró-labore</option><option>Outros</option></select></label><label className="text-sm font-medium">Fornecedor<input value={companyExpenseForm.supplier} onChange={e=>setCompanyExpenseForm({...companyExpenseForm,supplier:e.target.value})} className="mt-1 w-full rounded-xl border px-3 py-2"/></label><label className="text-sm font-medium">Valor<input type="number" min="0.01" step="0.01" value={companyExpenseForm.amount} onChange={e=>setCompanyExpenseForm({...companyExpenseForm,amount:e.target.value})} className="mt-1 w-full rounded-xl border px-3 py-2"/></label><label className="text-sm font-medium">Vencimento<input type="date" value={companyExpenseForm.dueDate} onChange={e=>setCompanyExpenseForm({...companyExpenseForm,dueDate:e.target.value})} className="mt-1 w-full rounded-xl border px-3 py-2"/></label><label className="text-sm font-medium">Status<select value={companyExpenseForm.status} onChange={e=>setCompanyExpenseForm({...companyExpenseForm,status:e.target.value as 'pending'|'paid'})} className="mt-1 w-full rounded-xl border px-3 py-2"><option value="pending">Pendente</option><option value="paid">Pago</option></select></label><label className="text-sm font-medium">Recorrência<select value={companyExpenseForm.recurrence} onChange={e=>setCompanyExpenseForm({...companyExpenseForm,recurrence:e.target.value as any})} className="mt-1 w-full rounded-xl border px-3 py-2"><option value="once">Única</option><option value="monthly">Mensal</option><option value="quarterly">Trimestral</option><option value="yearly">Anual</option></select></label><label className="text-sm font-medium sm:col-span-2">Observações<textarea value={companyExpenseForm.notes} onChange={e=>setCompanyExpenseForm({...companyExpenseForm,notes:e.target.value})} className="mt-1 w-full rounded-xl border px-3 py-2" rows={3}/></label><div className="flex justify-end gap-2 sm:col-span-2"><button onClick={()=>setCompanyExpenseModal(false)} className="rounded-xl border px-4 py-2 text-sm font-semibold">Cancelar</button><button disabled={saving} onClick={()=>void saveCompanyExpense()} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving?'Salvando...':'Salvar despesa'}</button></div></div></div></div>}

    {modal && selectedOrder && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><div className="w-full max-w-md rounded-2xl bg-white shadow-xl"><div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-bold">{editing ? (modal === 'payment' ? 'Editar pagamento' : 'Editar custo') : (modal === 'payment' ? 'Registrar pagamento' : 'Registrar custo')}</h2><p className="text-xs text-slate-500">{selectedOrder.id} · {selectedOrder.client}</p></div><button onClick={() => setModal(null)} className="rounded-lg p-2 hover:bg-slate-100"><X size={18} /></button></div><div className="space-y-4 p-5"><label className="block text-sm font-medium">Descrição<input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder={modal === 'payment' ? 'Ex.: Sinal, PIX, parcela final' : 'Ex.: Material, deslocamento, terceirização'} /></label><label className="block text-sm font-medium">Valor<input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="0,00" /></label>{modal === 'payment' && <><label className="block text-sm font-medium">Data<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label><label className="block text-sm font-medium">Status<select value={status} onChange={(e) => setStatus(e.target.value as 'paid' | 'pending')} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"><option value="paid">Pago / recebido</option><option value="pending">Pendente</option></select></label></>}<div className="flex justify-end gap-2 pt-2"><button onClick={() => setModal(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Cancelar</button><button disabled={saving} onClick={() => void saveFinance()} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Salvar lançamento'}</button></div></div></div></div>}
  </div>;
}

function Card({ icon: Icon, label, value, detail }: { icon: typeof DollarSign; label: string; value: string; detail?: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-xl font-bold tracking-tight text-slate-900">{value}</p>{detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}</div><div className="rounded-xl bg-cyan-50 p-3 text-cyan-600"><Icon size={20} /></div></div></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-800">{value}</p></div>; }
