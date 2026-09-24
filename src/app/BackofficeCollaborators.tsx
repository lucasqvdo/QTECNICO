import { useEffect, useState, type FormEvent } from 'react';

type Member = { id: number; name: string; email: string; role: string; active: boolean };
export default function BackofficeCollaborators() {
  const [members, setMembers] = useState<Member[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const response = await fetch('/api/dashboard/backoffice/collaborators', { credentials: 'include' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os colaboradores.');
    setIsOwner(data.isOwner); setMembers(data.members);
  };
  useEffect(() => { void load().catch(error => setError(error.message)); }, []);
  const change = async (target: string, action: 'add' | 'remove') => {
    setBusy(true); setError('');
    try {
      const csrf = document.cookie.split('; ').find(value => value.startsWith('qtecnico_backoffice_csrf='))?.split('=')[1] || '';
      const response = await fetch('/api/dashboard/backoffice/collaborators', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ email: target, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível alterar o acesso.');
      setEmail(''); await load();
    } catch (error) { setError(error instanceof Error ? error.message : 'Falha ao alterar o acesso.'); }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void change(email, 'add'); };
  if (!isOwner) return error ? <p role="alert" className="mt-4 text-red-300">{error}</p> : null;
  return <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
    <h2 className="font-semibold">Colaboradores do Backoffice</h2>
    <p className="mt-1 text-sm text-slate-400">Conceda acesso à gestão de empresas, planos, degustações e cobranças. Apenas você pode gerenciar os colaboradores.</p>
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="flex-1 text-sm">E-mail de um usuário cadastrado<input type="email" required value={email} onChange={event => setEmail(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"/></label>
      <button disabled={busy} className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">Adicionar colaborador</button>
    </form>
    {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    <ul className="mt-4 space-y-3">{members.map(member => <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 p-3 text-sm">
      <div>{member.name} · {member.email}<p className="text-slate-400">{member.role === 'owner' ? 'Proprietário' : member.active ? 'Colaborador ativo' : 'Acesso removido'}</p></div>
      {member.role !== 'owner' && <button disabled={busy} onClick={() => void change(member.email, member.active ? 'remove' : 'add')} className="rounded-lg border border-slate-600 px-3 py-2 disabled:opacity-50">{member.active ? 'Remover acesso' : 'Reativar acesso'}</button>}
    </li>)}</ul>
  </section>;
}
