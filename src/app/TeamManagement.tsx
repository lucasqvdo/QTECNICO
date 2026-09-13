import { useEffect, useState } from 'react';
import { ArrowLeft, Mail, Phone, Plus, ShieldCheck, Trash2, UserPlus, Users, X } from 'lucide-react';
import { api, type TeamMember } from './api';

interface Props { onBack: () => void; }

export default function TeamManagement({ onBack }: Props) {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'Técnico', password: '' });

  const load = async () => {
    setLoading(true);
    setError('');
    try { setTeam(await api.getTeam()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erro ao carregar equipe'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await api.createTeamMember(form);
      setTeam((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm({ name: '', email: '', phone: '', role: 'Técnico', password: '' });
      setModalOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao criar conta'); }
    finally { setSaving(false); }
  };

  const remove = async (member: TeamMember) => {
    if (member.isAdmin) return;
    if (!window.confirm(`Remover a conta de ${member.name}?`)) return;
    setError('');
    try {
      await api.deleteTeamMember(member.id);
      setTeam((current) => current.filter((item) => item.id !== member.id));
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao remover conta'); }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">
        <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50" title="Voltar"><ArrowLeft size={19} /></button>
            <div>
              <p className="text-sm font-medium text-cyan-600">Administração</p>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Técnicos / Equipe</h1>
              <p className="mt-1 text-sm text-slate-500">Crie e gerencie as contas que terão acesso ao aplicativo técnico.</p>
            </div>
          </div>
          <button onClick={() => { setError(''); setModalOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"><Plus size={18} /> Novo técnico</button>
        </div>

        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-xl bg-cyan-50 p-3 text-cyan-600"><Users size={20} /></div><div><p className="text-sm text-slate-500">Membros da equipe</p><p className="text-2xl font-bold">{team.length}</p></div></div></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-50 p-3 text-emerald-600"><UserPlus size={20} /></div><div><p className="text-sm text-slate-500">Técnicos</p><p className="text-2xl font-bold">{team.filter((m) => !m.isAdmin).length}</p></div></div></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-xl bg-violet-50 p-3 text-violet-600"><ShieldCheck size={20} /></div><div><p className="text-sm text-slate-500">Administradores</p><p className="text-2xl font-bold">{team.filter((m) => m.isAdmin).length}</p></div></div></div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? <div className="p-10 text-center text-slate-500">Carregando equipe...</div> : team.length === 0 ? <div className="p-12 text-center"><Users className="mx-auto mb-3 text-slate-300" size={38} /><p className="font-semibold text-slate-700">Nenhum membro cadastrado</p><p className="mt-1 text-sm text-slate-500">Crie a primeira conta técnica para começar.</p></div> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Nome</th><th className="px-5 py-3">Função</th><th className="px-5 py-3">Contato</th><th className="px-5 py-3">Perfil</th><th className="px-5 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-slate-100">{team.map((member) => <tr key={member.id} className="hover:bg-slate-50"><td className="px-5 py-4"><div className="font-semibold text-slate-900">{member.name}</div><div className="text-xs text-slate-500">{member.email}</div></td><td className="px-5 py-4 text-slate-600">{member.role}</td><td className="px-5 py-4 text-slate-600"><div className="flex items-center gap-2"><Mail size={14} />{member.email}</div>{member.phone && <div className="mt-1 flex items-center gap-2 text-xs"><Phone size={13} />{member.phone}</div>}</td><td className="px-5 py-4">{member.isAdmin ? <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700"><ShieldCheck size={13} />Administrador</span> : <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-semibold text-cyan-700">Técnico</span>}</td><td className="px-5 py-4 text-right">{!member.isAdmin && <button onClick={() => void remove(member)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Remover conta"><Trash2 size={17} /></button>}</td></tr>)}</tbody></table></div>
          )}
        </div>
      </div>

      {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
        <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
          <div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-bold">Novo técnico</h2><p className="text-sm text-slate-500">A conta poderá entrar no app pelo celular.</p></div><button type="button" onClick={() => setModalOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={19} /></button></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-slate-700">Nome completo</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-cyan-400" /></label>
            <label><span className="mb-1.5 block text-sm font-medium text-slate-700">E-mail</span><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-cyan-400" /></label>
            <label><span className="mb-1.5 block text-sm font-medium text-slate-700">Telefone</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-cyan-400" /></label>
            <label><span className="mb-1.5 block text-sm font-medium text-slate-700">Função</span><input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-cyan-400" /></label>
            <label><span className="mb-1.5 block text-sm font-medium text-slate-700">Senha inicial</span><input required minLength={6} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-cyan-400" placeholder="Mínimo 6 caracteres" /></label>
          </div>
          <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Criando...' : 'Criar conta'}</button></div>
        </form>
      </div>}
    </div>
  );
}
