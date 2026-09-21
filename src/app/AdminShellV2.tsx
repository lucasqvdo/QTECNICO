import { useEffect, useState, type ReactNode } from 'react';
import { BarChart3, Building2, CalendarDays, Clock3, ClipboardList, CreditCard, DollarSign, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Users, Wrench, X } from 'lucide-react';
import { api } from './api';
import ConnectivityStatus from './components/ConnectivityStatus';

export type AdminSectionV2 = 'dashboard' | 'clients' | 'team' | 'orders' | 'agenda' | 'finance' | 'company' | 'billing';
export type TechnicianSectionV2 = 'home' | 'orders' | 'attendances' | 'agenda' | 'profile';
export type ShellMode = 'admin' | 'technician';

type NavItem = readonly [string, typeof BarChart3, string, string];

const ADMIN_NAV: NavItem[] = [
  ['dashboard', BarChart3, 'Dashboard', 'Visão geral do negócio'],
  ['orders', ClipboardList, 'Ordens de Serviço', 'Operação e chamados'],
  ['clients', Users, 'Clientes', 'Base comercial'],
  ['team', Wrench, 'Técnicos / Equipe', 'Pessoas e acessos'],
  ['agenda', CalendarDays, 'Agenda', 'Programação'],
  ['finance', DollarSign, 'Financeiro', 'Receitas e custos'],
  ['company', Building2, 'Perfil da Empresa', 'Dados da empresa'],
  ['billing', CreditCard, 'Plano e Assinatura', 'Gestão do SaaS e faturas'],
];

const TECH_NAV: NavItem[] = [
  ['home', BarChart3, 'Início', 'Minha operação'],
  ['orders', ClipboardList, 'Minhas Ordens', 'Chamados atribuídos'],
  ['agenda', CalendarDays, 'Agenda', 'Minha programação'],
  ['profile', Users, 'Meu Perfil', 'Dados e acesso'],
];

type Props = {
  section: string;
  onSectionChange: (section: any) => void;
  children: ReactNode;
  mode?: ShellMode;
};

export default function AdminShellV2({ section, onSectionChange, children, mode = 'admin' }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState({ name: 'Usuário', role: mode === 'admin' ? 'Administrador' : 'Técnico' });
  const [company, setCompany] = useState('QTECNICO');
  const nav = mode === 'admin' ? ADMIN_NAV : TECH_NAV;

  useEffect(() => {
    void Promise.all([api.getMe(), api.getCompanyProfile()]).then(([u, c]) => {
      setUser({ name: u.name, role: u.role });
      setCompany(c?.tradeName || c?.legalName || 'QTECNICO');
    }).catch(() => undefined);
  }, []);

  const go = (s: string) => { onSectionChange(s); setMobileOpen(false); };
  const logout = async () => { try { await api.logout(); } finally { location.reload(); } };

  const side = (mobile = false) => (
    <aside className={`relative flex h-full flex-col bg-slate-950 text-white ${collapsed && !mobile ? 'w-[76px]' : 'w-[272px]'}`}>
      <div className={`flex h-20 items-center border-b border-white/10 ${collapsed && !mobile ? 'justify-center' : 'justify-between px-4'}`}>
        {collapsed && !mobile ? (
          <b className="text-xl">Q<span className="text-cyan-400">T</span></b>
        ) : (
          <div>
            <b className="text-xl">Q<span className="text-cyan-400">Técnico</span></b>
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Gestão técnica</p>
          </div>
        )}
        {mobile ? (
          <button onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><X /></button>
        ) : !collapsed ? (
          <button onClick={() => setCollapsed(true)} aria-label="Recolher menu" title="Recolher menu" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white">
            <PanelLeftClose size={18} />
          </button>
        ) : null}
      </div>

      {!mobile && collapsed && (
        <button onClick={() => setCollapsed(false)} aria-label="Expandir menu" title="Expandir menu" className="absolute -right-3 top-[4.5rem] z-50 flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-cyan-400 shadow-lg transition hover:bg-cyan-500 hover:text-slate-950">
          <PanelLeftOpen size={16} />
        </button>
      )}

      <nav className="flex-1 overflow-y-auto p-3">
        <p className={`${collapsed && !mobile ? 'hidden' : 'block'} px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500`}>{mode === 'admin' ? 'Operação' : 'Meu trabalho'}</p>
        {nav.map(([key, Icon, label, desc]) => (
          <button key={key} onClick={() => go(key)} title={collapsed && !mobile ? label : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${collapsed && !mobile ? 'justify-center' : ''} ${section === key ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:bg-white/10'}`}>
            <Icon size={19} />
            {!(collapsed && !mobile) && <span><span className="block text-sm font-semibold">{label}</span><span className="block text-[10px] text-slate-500">{desc}</span></span>}
          </button>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        {!(collapsed && !mobile) && <div className="mb-2 rounded-xl bg-white/5 p-3"><p className="truncate text-sm font-semibold">{user.name}</p><p className="text-xs text-slate-500">{user.role}</p><p className="mt-1 truncate text-[10px] text-cyan-400">{company}</p></div>}
        <button onClick={logout} className={`flex w-full items-center gap-3 rounded-xl p-2.5 text-sm text-slate-400 hover:text-red-300 ${collapsed && !mobile ? 'justify-center' : ''}`}><LogOut size={18} />{!(collapsed && !mobile) && 'Sair'}</button>
      </div>
    </aside>
  );

  const current = nav.find(x => x[0] === section);
  return (
    <div className="min-h-screen bg-slate-100">
      <header className={`fixed inset-x-0 top-0 z-30 h-16 border-b border-slate-200 bg-white/95 ${collapsed ? 'lg:left-[76px]' : 'lg:left-[272px]'}`}>
        <div className="flex h-full items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu /></button>
            <div><b className="text-sm">{current?.[2] || 'QTECNICO'}</b><p className="hidden text-xs text-slate-500 sm:block">{current?.[3]}</p></div>
          </div>
          <div className="flex items-center gap-2">
            <ConnectivityStatus />
            <span className="hidden max-w-48 truncate rounded-full border px-3 py-1 text-xs font-semibold md:inline">{company}</span>
            <button className="hidden rounded-xl border p-2 lg:block" onClick={() => setCollapsed(v => !v)} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'} title={collapsed ? 'Expandir menu' : 'Recolher menu'}>
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          </div>
        </div>
      </header>

      <div className="fixed inset-y-0 left-0 z-20 hidden pt-16 lg:block">{side()}</div>
      {mobileOpen && <><button className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" /><div className="fixed inset-y-0 left-0 z-50 lg:hidden">{side(true)}</div></>}
      <main className={`min-h-screen pt-16 ${collapsed ? 'lg:ml-[76px]' : 'lg:ml-[272px]'}`}>{children}</main>
    </div>
  );
}
