import { useEffect, useState } from 'react';
import { Building2, LockKeyhole } from 'lucide-react';
import { api, type CompanyProfileData } from './api';

type Props = { onBack: () => void };

type FieldProps = {
  label: string;
  value: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
};

function Field({ label, value, required, type = 'text', placeholder }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}{required ? ' *' : ''}</span>
      <input
        type={type}
        value={value}
        readOnly
        placeholder={placeholder}
        className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none"
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

  if (loading) return <div className="p-6 lg:p-8"><div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">Carregando perfil da empresa...</div></div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-cyan-600">Configurações</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold tracking-tight"><Building2 size={28} /> Perfil da Empresa</h1>
          <p className="mt-1 text-sm text-slate-500">Dados cadastrais e informações que identificam sua empresa no QTECNICO.</p>
        </div>
        <button onClick={onBack} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Voltar</button>
      </div>

      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <LockKeyhole size={19} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Dados cadastrais protegidos</p>
          <p className="mt-1">CNPJ, razão social, nome fantasia, endereço e demais dados da empresa não podem ser alterados diretamente pelo cliente. Para solicitar uma alteração cadastral, entre em contato com o suporte do QTECNICO para validação e atualização manual.</p>
        </div>
      </div>

      <div className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-bold">Dados da empresa</h2><p className="mb-5 text-xs text-slate-500">Informações cadastradas no primeiro acesso.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome fantasia" value={form.tradeName} required />
            <Field label="Razão social" value={form.legalName} required />
            <Field label="CNPJ / CPF" value={form.document} required />
            <Field label="Telefone" value={form.phone} required />
            <Field label="WhatsApp" value={form.whatsapp} />
            <Field label="E-mail" value={form.email} type="email" required />
            <Field label="Site" value={form.website} placeholder="https://..." />
            <Field label="Logo" value={form.logoKey} placeholder="Chave do arquivo (opcional)" />
          </div>
          <div className="mt-4"><label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Descrição / segmento</span><textarea value={form.description} readOnly rows={3} className="w-full cursor-not-allowed resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none" /></label></div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-bold">Endereço</h2><p className="mb-5 text-xs text-slate-500">Endereço comercial cadastrado.</p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Field label="CEP" value={form.postalCode} />
            <div className="lg:col-span-2"><Field label="Endereço" value={form.address} /></div>
            <Field label="Número" value={form.number} />
            <Field label="Complemento" value={form.complement} />
            <Field label="Bairro" value={form.neighborhood} />
            <Field label="Cidade" value={form.city} />
            <Field label="UF" value={form.state} placeholder="SP" />
          </div>
        </section>
      </div>
    </div>
  );
}
