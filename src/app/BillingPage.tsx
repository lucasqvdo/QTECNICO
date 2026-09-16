import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, CreditCard, ExternalLink, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';

type Plan = { key: string; name: string; description?: string; amount: number; currency: string; billingInterval: string; features?: unknown };
type Payment = { id: number; amount: number; currency: string; status: string; dueAt?: string; paidAt?: string; provider?: string; providerPaymentId?: string; invoiceUrl?: string | null; failureReason?: string | null };
type Subscription = { id: number; planKey: string; planName: string; status: string; amount: number; currency: string; billingInterval: string; provider?: string; providerSubscriptionId?: string };
type BillingData = { account: { id: number; company: string; email: string; document: string }; plans: Plan[]; subscription: Subscription | null; payments: Payment[] };

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (v?: string) => v ? new Date(v).toLocaleDateString('pt-BR') : '—';
const csrf = () => decodeURIComponent(document.cookie.split('; ').find((x) => x.startsWith('qtecnico_csrf='))?.split('=').slice(1).join('=') || '');

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [selectedPlan, setSelectedPlan] = useState('medium');
  const [billingType, setBillingType] = useState('PIX');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/dashboard/billing', { credentials: 'include' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível carregar sua assinatura.');
      setData(body);
      if (body.subscription?.planKey) setSelectedPlan(body.subscription.planKey);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar sua assinatura.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const selected = useMemo(() => data?.plans.find((p) => p.key === selectedPlan) || null, [data, selectedPlan]);
  const current = data?.subscription;
  const hasOpenPayment = Boolean(data?.payments?.some((p) => ['PENDING', 'AWAITING_RISK_ANALYSIS', 'OVERDUE'].includes(p.status) && p.invoiceUrl));

  const subscribe = async () => {
    if (!selected || selected.amount <= 0) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/dashboard/billing/subscribe', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() }, body: JSON.stringify({ planKey: selected.key, billingType }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível iniciar a assinatura.');
      setMessage('Assinatura criada. A cobrança foi gerada no Asaas Sandbox.');
      await load();
      const payment = body.payments?.[0];
      if (payment?.invoiceUrl) window.location.href = payment.invoiceUrl;
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível iniciar a assinatura.'); }
    finally { setBusy(false); }
  };

  const refresh = async () => { setRefreshing(true); setError(''); try { await fetch('/api/dashboard/billing/refresh', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf() } }); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível atualizar a cobrança.'); } finally { setRefreshing(false); } };

  if (loading) return <div className="min-h-screen bg-slate-100 p-8"><div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">Carregando assinatura...</div></div>;
  if (error && !data) return <div className="min-h-screen bg-slate-100 p-6"><div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div></div>;

  const payment = data?.payments?.[0];
  const canSubscribe = !current || !['active', 'trial', 'trialing', 'past_due', 'unpaid'].includes(current.status);

  return <div className="min-h-screen bg-slate-100 px-4 py-6 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-semibold text-cyan-600">QTECNICO</p><h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">Minha assinatura</h1><p className="mt-1 text-sm text-slate-500">{data?.account.company}</p></div>
        <button onClick={() => window.history.back()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold"><ArrowLeft size={17} /> Voltar</button>
      </div>

      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

      {current && <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Plano atual</p><h2 className="mt-1 text-2xl font-black">{current.planName}</h2><p className="mt-1 text-sm text-slate-500">{money(current.amount)}/mês · {current.status}</p></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">{current.provider === 'asaas' ? 'Asaas' : 'QTECNICO'}</span></div>
      </section>}

      {payment && <section className="mb-6 rounded-2xl border border-cyan-200 bg-cyan-50/50 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-cyan-700">Cobrança</p><p className="mt-1 text-xl font-black text-slate-900">{money(payment.amount)}</p><p className="mt-1 text-sm text-slate-600">Vencimento: {date(payment.dueAt)} · Status: {payment.status}</p></div><div className="flex flex-wrap gap-2">{payment.invoiceUrl && <a href={payment.invoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950"><ExternalLink size={17} /> Abrir pagamento</a>}<button onClick={() => void refresh()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold">{refreshing ? <Loader2 className="animate-spin" size={17} /> : <RefreshCw size={17} />} Atualizar</button></div></div>
      </section>}

      {canSubscribe && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2"><ShieldCheck className="text-cyan-600" size={20} /><h2 className="text-xl font-black">Escolha seu plano</h2></div>
        <p className="mt-1 text-sm text-slate-500">O pagamento será concluído no ambiente seguro do Asaas. O QTECNICO não recebe os dados do cartão.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">{data?.plans.filter((p) => p.amount > 0).map((plan) => <button key={plan.key} onClick={() => setSelectedPlan(plan.key)} className={`rounded-2xl border p-5 text-left transition ${selectedPlan === plan.key ? 'border-cyan-400 bg-cyan-50 ring-2 ring-cyan-200' : 'border-slate-200 hover:border-slate-300'}`}><p className="font-bold">{plan.name}</p><p className="mt-2 text-2xl font-black">{money(plan.amount)}</p><p className="mt-1 text-xs text-slate-500">por mês</p></button>)}</div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="rounded-xl border border-slate-200 p-3"><span className="block text-xs font-bold uppercase text-slate-400">Forma de pagamento</span><select value={billingType} onChange={(e) => setBillingType(e.target.value)} className="mt-1 w-full bg-transparent text-sm font-semibold outline-none"><option value="PIX">PIX</option><option value="CREDIT_CARD">Cartão de crédito</option><option value="BOLETO">Boleto</option></select></label><button disabled={busy || !selected} onClick={() => void subscribe()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="animate-spin" size={18} /> : <CreditCard size={18} />} Continuar para pagamento</button></div>
        {hasOpenPayment && <p className="mt-4 text-xs text-slate-500">Existe uma cobrança em aberto. Use o botão de pagamento acima para continuar.</p>}
      </section>}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><CheckCircle2 className="text-cyan-600" size={20} /><h2 className="text-lg font-black">Histórico de cobranças</h2></div><div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase text-slate-400"><tr><th className="pb-3">Valor</th><th className="pb-3">Status</th><th className="pb-3">Vencimento</th><th className="pb-3">Pagamento</th><th className="pb-3">Ação</th></tr></thead><tbody className="divide-y divide-slate-100">{(data?.payments || []).map((p) => <tr key={p.id}><td className="py-3 font-semibold">{money(p.amount)}</td><td className="py-3">{p.status}</td><td className="py-3">{date(p.dueAt)}</td><td className="py-3">{date(p.paidAt)}</td><td className="py-3">{p.invoiceUrl ? <a className="font-semibold text-cyan-700" href={p.invoiceUrl} target="_blank" rel="noreferrer">Abrir</a> : '—'}</td></tr>)}</tbody></table>{!data?.payments?.length && <p className="py-6 text-center text-sm text-slate-500">Nenhuma cobrança registrada.</p>}</div></section>
    </div>
  </div>;
}
