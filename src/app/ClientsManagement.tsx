import { useMemo, useState } from 'react';
import { ArrowLeft, Edit3, Mail, MapPin, Phone, Plus, Search, Trash2, UserRound, X } from 'lucide-react';
import { api } from './api';
import type { Client, ServiceOrder } from './types';
import ClientPreventiveMaintenance from './ClientPreventiveMaintenance';

type Props = { clients: Client[]; orders: ServiceOrder[]; onClientsChange: (clients: Client[]) => void; onBack: () => void };

type FormState = Omit<Client, 'id'>;
const emptyForm: FormState = { name: '', document: '', address: '', phone: '', email: '' };

export default function ClientsManagement({ clients, orders, onClientsChange, onBack }: Props) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((c) => [c.name, c.document, c.phone, c.email, c.address].some((v) => v.toLowerCase().includes(term)));
  }, [clients, query]);

  const selected = clients.find((c) => c.id === selectedId) ?? null;
  const selectedOrders = selected ? orders.filter((o) => o.clientId === selected.id || o.client === selected.name) : [];

  const openNew = () => { setError(''); setEditing(null); setCreating(true); setForm({ ...emptyForm }); setSelectedId(null); };
  const openEdit = (client: Client) => { setError(''); setCreating(false); setEditing(client); setForm({ name: client.name, document: client.document, address: client.address, phone: client.phone, email: client.email }); setSelectedId(null); };
  const closeForm = () => { setEditing(null); setCreating(false); setForm({ ...emptyForm }); };

  const save = async () => {
    if (!form.name.trim()) { setError('Informe o nome do cliente.'); return; }
    setSaving(true); setError('');
    try {
      if (editing) {
        const updated = await api.updateClient(editing.id, form);
        onClientsChange(clients.map((c) => c.id === editing.id ? updated : c));
      } else {
        const created = await api.createClient({ id: crypto.randomUUID(), ...form });
        onClientsChange([created, ...clients]);
      }
      closeForm();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar o cliente.'); }
    finally { setSaving(false); }
  };

  const remove = async (client: Client) => {
    if (!window.confirm(`Excluir o cliente ${client.name}?`)) return;
    setError('');
    try { await api.deleteClient(client.id); onClientsChange(clients.filter((c) => String(c.id) !== String(client.id))); if (String(selectedId) === String(client.id)) setSelectedId(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível excluir o cliente.'); }
  };

  const showForm = creating || editing !== null;

  return <div className="p-4 sm:p-6 lg:p-8">
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3"><button onClick={onBack} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50"><ArrowLeft size={19} /></button><div><p className="text-sm font-medium text-cyan-600">Cadastros</p><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Clientes</h1><p className="mt-1 text-sm text-slate-500">Gerencie clientes, contatos e histórico de atendimento.</p></div></div>
      <button type="button" onClick={openNew} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"><Plus size={18} /> Novo cliente</button>
    </div>

    {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

    <div className="mb-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><Search size={19} className="text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome, documento, telefone ou e-mail..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" /><span className="hidden text-xs text-slate-400 sm:block">{filtered.length} cliente{filtered.length === 1 ? '' : 's'}</span></div>

    {showForm ? <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="font-bold">{editing ? 'Editar cliente' : 'Novo cliente'}</h2><button type="button" onClick={closeForm} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700">Nome<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-cyan-400" /></label><label className="text-sm font-medium text-slate-700">CPF/CNPJ<input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-cyan-400" /></label><label className="text-sm font-medium text-slate-700">Telefone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-cyan-400" /></label><label className="text-sm font-medium text-slate-700">E-mail<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-cyan-400" /></label><label className="text-sm font-medium text-slate-700 sm:col-span-2">Endereço<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-cyan-400" /></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={closeForm} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancelar</button><button type="button" disabled={saving} onClick={save} className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar cliente'}</button></div></div> : null}

    {selected ? <div className="mb-6 rounded-2xl border border-cyan-100 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><div className="rounded-xl bg-cyan-50 p-3 text-cyan-600"><UserRound size={22} /></div><div><h2 className="text-xl font-bold">{selected.name}</h2><p className="mt-1 text-sm text-slate-500">{selected.document || 'Documento não informado'}</p></div></div><div className="flex gap-2"><button type="button" onClick={() => openEdit(selected)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"><Edit3 size={16} /> Editar</button><button type="button" onClick={() => remove(selected)} className="rounded-xl border border-red-100 p-2 text-red-500"><Trash2 size={17} /></button></div></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">Telefone</p><p className="mt-1 flex items-center gap-2 text-sm font-medium"><Phone size={15} />{selected.phone || 'Não informado'}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">E-mail</p><p className="mt-1 flex items-center gap-2 break-all text-sm font-medium"><Mail size={15} />{selected.email || 'Não informado'}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">Endereço</p><p className="mt-1 flex items-center gap-2 text-sm font-medium"><MapPin size={15} />{selected.address || 'Não informado'}</p></div></div><ClientPreventiveMaintenance clientId={selected.id}/><div className="mt-5 border-t border-slate-100 pt-4"><h3 className="font-semibold">Histórico de OS <span className="text-slate-400">({selectedOrders.length})</span></h3>{selectedOrders.length ? <div className="mt-3 space-y-2">{selectedOrders.slice(0, 5).map((o) => <div key={o.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-sm"><span><b>{o.id}</b> · {o.type}</span><span className="text-slate-500">{o.date}</span></div>)}</div> : <p className="mt-2 text-sm text-slate-500">Nenhuma OS encontrada para este cliente.</p>}</div></div> : null}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((client) => <button type="button" key={client.id} onClick={() => setSelectedId(client.id)} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="rounded-xl bg-slate-100 p-3 text-slate-600 group-hover:bg-cyan-50 group-hover:text-cyan-600"><UserRound size={20} /></div><div className="min-w-0"><h3 className="truncate font-bold">{client.name}</h3><p className="mt-0.5 truncate text-xs text-slate-500">{client.document || 'Documento não informado'}</p></div></div><span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">Ativo</span></div><div className="mt-4 space-y-2 text-sm text-slate-600"><p className="flex items-center gap-2 truncate"><Phone size={15} />{client.phone || 'Telefone não informado'}</p><p className="flex items-center gap-2 truncate"><Mail size={15} />{client.email || 'E-mail não informado'}</p><p className="flex items-center gap-2 truncate"><MapPin size={15} />{client.address || 'Endereço não informado'}</p></div></button>)}</div>
    {!filtered.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><UserRound className="mx-auto text-slate-300" size={38} /><h3 className="mt-3 font-semibold">Nenhum cliente encontrado</h3><p className="mt-1 text-sm text-slate-500">Ajuste a busca ou cadastre um novo cliente.</p></div>}
  </div>;
}
