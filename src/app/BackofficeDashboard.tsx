import React from 'react';
import { Building2, CreditCard, LogOut, ShieldCheck, Users, WalletCards } from 'lucide-react';

const accounts = [
  { company: 'Contas cadastradas', detail: 'Base SaaS', plan: 'Todos', status: 'Monitorar', value: '—' },
];

export default function BackofficeDashboard() {
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
    window.location.href = '/backoffice/login';
  };

  return <main className="min-h-screen bg-slate-950 text-white">
    <header className="border-b border-slate-800 bg-slate-900/80 px-6 py-4">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-3"><div className="rounded-xl bg-cyan-500/10 p-2 text-cyan-400"><ShieldCheck size={22}/></div><div><p className="text-xs uppercase tracking-[0.2em] text-cyan-400">QTECNICO</p><h1 className="font-semibold">Backoffice SaaS</h1></div></div>
        <button onClick={logout} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300"><LogOut size={16}/> Sair</button>
      </div>
    </header>
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8"><h2 className="text-3xl font-semibold">Gestão de contas</h2><p className="mt-1 text-slate-400">Visão administrativa das empresas, assinaturas e recebimentos.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[['Contas ativas','—',Building2],['Em teste','—',Users],['MRR','R$ 0,00',CreditCard],['A receber','R$ 0,00',WalletCards]].map(([label,value,Icon]) => <div key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><Icon className="mb-4 text-cyan-400" size={21}/><p className="text-sm text-slate-400">{String(label)}</p><strong className="mt-1 block text-2xl">{String(value)}</strong></div>)}
      </div>
      <section className="mt-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900"><div className="border-b border-slate-800 p-5"><h3 className="font-semibold">Contas</h3><p className="text-sm text-slate-500">A listagem dinâmica de empresas e pagamentos será ligada à API de assinaturas na próxima etapa.</p></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-950/60 text-slate-400"><tr>{['Conta','Detalhe','Plano','Status','Valor'].map(h=><th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{accounts.map(a=><tr key={a.company} className="border-t border-slate-800"><td className="px-5 py-4">{a.company}</td><td className="px-5 py-4 text-slate-400">{a.detail}</td><td className="px-5 py-4">{a.plan}</td><td className="px-5 py-4">{a.status}</td><td className="px-5 py-4">{a.value}</td></tr>)}</tbody></table></div></section>
    </div>
  </main>;
}
