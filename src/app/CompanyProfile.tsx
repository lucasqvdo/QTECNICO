import { useEffect, useState } from 'react';
import { Building2, CheckCircle2, Loader2, Save } from 'lucide-react';
import { api, type CompanyProfileData } from './api';

type Props = { onBack: () => void };

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
};

function Field({ label, value, onChange, required, type = 'text', placeholder }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}{required ? ' *' : ''}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
      />
    </label>
  );
}

const empty: CompanyProfileData = {
  id: 0, legalName: '', tradeName: '', document: '', phone: '', whatsapp: '', email: '', website: '',
  postalCode: '', address: '', number: '', complement: '', neighborhood: '', city: '', state: '', logoKey: '', description: '', updatedAt: ''
};

export default function CompanyProfile({ onBack }: Props) {
  const [form, setForm] = useState<CompanyProfileData>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const profile = await api.getCompanyProfile();
        if (profile) setForm({ ...empty, ...profile });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Não foi possível carregar o perfil da empresa.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (key: keyof CompanyProfileData) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setError(''); setMessage('');
    if (!form.tradeName.trim() && !form.legalName.trim()) {
      setError('Informe o nome fantasia ou a razão social.');
      return;
    }
    setSaving(true);
    try {
      const saved = await api.updateCompanyProfile(form);
      setForm({ ...empty, ...saved });
      setMessage('Perfil da empresa atualizado com sucesso.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o perfil.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 lg:p-8"><div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">Carregando perfil da empresa...</div></div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-cyan-600">Configurações</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold tracking-tight"><Building2 size={28} /> Perfil da Empresa</h1>
          <p className="mt-1 text-sm text-slate-500">Dados cadastrais e informações que identificam sua empresa no QTECNICO.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Voltar</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60">
            {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} Salvar alterações
          </button>
        </div>
      </div>

      {message && <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 size={18} />{message}</div>}
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-bold">Dados da empresa</h2><p className="mb-5 text-xs text-slate-500">Informações principais cadastradas no primeiro acesso.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome fantasia" value={form.tradeName} onChange={set('tradeName')} required />
            <Field label="Razão social" value={form.legalName} onChange={set('legalName')} required />
            <Field label="CNPJ / CPF" value={form.document} onChange={set('document')} required />
            <Field label="Telefone" value={form.phone} onChange={set('phone')} required />
            <Field label="WhatsApp" value={form.whatsapp} onChange={set('whatsapp')} />
            <Field label="E-mail" value={form.email} onChange={set('email')} type="email" required />
            <Field label="Site" value={form.website} onChange={set('website')} placeholder="https://..." />
            <Field label="Logo" value={form.logoKey} onChange={set('logoKey')} placeholder="Chave do arquivo (opcional)" />
          </div>
          <div className="mt-4"><label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Descrição / segmento</span><textarea value={form.description} onChange={(e) => set('description')(e.target.value)} rows={3} className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" placeholder="Ex.: Segurança eletrônica, CFTV e redes." /></label></div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-bold">Endereço</h2><p className="mb-5 text-xs text-slate-500">Endereço comercial da empresa.</p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Field label="CEP" value={form.postalCode} onChange={set('postalCode')} />
            <div className="lg:col-span-2"><Field label="Endereço" value={form.address} onChange={set('address')} /></div>
            <Field label="Número" value={form.number} onChange={set('number')} />
            <Field label="Complemento" value={form.complement} onChange={set('complement')} />
            <Field label="Bairro" value={form.neighborhood} onChange={set('neighborhood')} />
            <Field label="Cidade" value={form.city} onChange={set('city')} />
            <Field label="UF" value={form.state} onChange={set('state')} placeholder="SP" />
          </div>
        </section>
      </div>
    </div>
  );
}
