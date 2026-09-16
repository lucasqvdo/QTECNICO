import React, { useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';

export default function BackofficeLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, loginContext: 'backoffice' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível entrar.');
      window.location.href = '/backoffice';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-xl bg-cyan-500/10 p-3 text-cyan-400"><ShieldCheck size={25} /></div>
          <div><p className="text-xs uppercase tracking-[0.2em] text-cyan-400">QTECNICO</p><h1 className="text-2xl font-semibold">Backoffice</h1></div>
        </div>
        <p className="mb-6 text-sm text-slate-400">Acesso administrativo da plataforma. Esta área é separada do ambiente dos clientes.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input aria-label="E-mail" value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="E-mail administrativo" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400" />
          <input aria-label="Senha" value={password} onChange={e => setPassword(e.target.value)} type="password" required placeholder="Senha" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400" />
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 hover:bg-cyan-400"><LockKeyhole size={18} /> Entrar no Backoffice</button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-500">Área restrita • Gestão de contas e assinaturas</p>
      </section>
    </main>
  );
}
