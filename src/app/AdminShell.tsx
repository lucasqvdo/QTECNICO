import { useEffect, useState, type ReactNode } from 'react';
import { BarChart3, Building2, CalendarDays, ClipboardList, Clock3, DollarSign, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Users, Wrench, X } from 'lucide-react';
import { api } from './api';

export type AdminSection = 'dashboard' | 'clients' | 'team' | 'orders' | 'attendances' | 'agenda' | 'finance' | 'company';
type Props = { section: AdminSection; onSectionChange: (section: AdminSection) => void; children: ReactNode };
type NavItem = { key: AdminSection; icon: typeof BarChart3; label: string; description: string };
const NAV: NavItem[] = [
  { key: 'dashboard', icon: BarChart3, label: 'Dashboard', description: 'Visão geral do negócio' },
  { key: 'orders', icon: ClipboardList, label: 'Ordens de Serviço', description: 'Operação e chamados' },
  { key: 'attendances', icon: Clock3, label: 'Atendimentos', description: 'Execução em campo' },
  { key: 'clients', icon: Users, label: 'Clientes', description: 'Base comercial' },
  { key: 'team', icon: Wrench, label: 'Técnicos / Equipe', description: 'Pessoas e acessos' },
  { key: 'agenda', icon: CalendarDays, label: 'Agenda', description: 'Programação' },
  { key: 'finance', icon: DollarSign, label: 'Financeiro', description: 'Receitas e custos' },
  { key: 'company', icon: Building2, label: 'Perfil da Empresa', description: 'Dados da empresa' },
];

export default function AdminShell({ section, onSectionChange, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState({ name: 'Usuário', role: 'Administrador' });
  const [companyName, setCompanyName] = useState('QTECNICO');
  useEffect(() => { void Promise.all([api.getMe(), api.getCompanyProfile()]).then(([me, company]) => { setUser({ name: me.name, role: me.role }); setCompanyName(company?.tradeName || company?.legalName || 'QTECNICO'); }).catch(() => undefined); }, []);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') { event.preventDefault(); setCollapsed((v) => !v); } if (event.key === 'Escape') setMobileOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, []);
  const navigate = (next: AdminSection) => { onSectionChange(next); setMobileOpen(false); };
  const logout = async () => { try { await api.logout(); } finally { window.location.reload(); } };
  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => <aside className={`flex h-full flex-col bg-slate-950 text-white ${collapsed && !mobile ? 'w-[76px]' : 'w-[272px]'}`}>
    <div className={`flex h-20 shrink-0 items-center border-b border-white/10 ${collapsed && !mobile ? 'justify-center px-2' : 'justify-between px-4'}`}>{collapsed && !mobile ? <span className="text-xl font-black">Q<span className="text-cyan-400">T</span></span> : <div><div className="text-xl font-black">Q<span className="text-cyan-400">Técnico</span></div><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Gestão técnica</p></div>}{mobile ? <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10" aria-label="Fechar menu"><X size={18} /></button> : !collapsed && <button type="button" onClick={() => setCollapsed(true)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Recolher menu"><PanelLeftClose size={18} /></button>}</div>
    <nav className="min-h-0 flex-1 overflow-y-auto p-3">{!(collapsed && !mobile) && <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Operação</p>}<div className="space-y-1">{NAV.map(({ key, icon: Icon, label, description }) => { const active = section === key; return <button key={key} type="button" onClick={() => navigate(key)} title={collapsed && !mobile ? label : undefined} className={`group flex w-full items-center gap-3 rounded-xl text-left transition ${collapsed && !mobile ? 'justify-center px-2.5 py-3' : 'px-3 py-2.5'} ${active ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-950/30' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}><Icon size={19} className="shrink-0" />{!(collapsed && !mobile) && <span className="min-w-0"><span className="block truncate text-sm font-semibold">{label}</span><span className={`block truncate text-[10px] ${active ? 'text-slate-700' : 'text-slate-500'}`}>{description}</span></span>}</button>; })}</div></nav>
    <div className="border-t border-white/10 p-3">{!(collapsed && !mobile) && <div className="mb-2 rounded-xl bg-white/5 px-3 py-2.5"><p className="truncate text-sm font-semibold">{user.name}</p><p className="truncate text-xs text-slate-500">{user.role}</p><p className="mt-1 truncate text-[10px] text-cyan-400">{companyName}</p></div>}<button type="button" onClick={logout} title={collapsed && !mobile ? 'Sair' : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-400 hover:bg-red-500/10 hover:text-red-300 ${collapsed && !mobile ? 'justify-center' : ''}`}><LogOut size={18} />{!(collapsed && !mobile) && 'Sair'}</button></div>
  </aside>;
  return <div className="min-h-screen bg-slate-100 text-slate-900">
    <header className={`fixed inset-x-0 top-0 z-30 h-16 border-b border-slate-200 bg-white/95 backdrop-blur ${collapsed ? 'lg:left-[76px]' : 'lg:left-[272px]'}`}><div className="flex h-full items-center justify-between px-4 sm:px-6"><div className="flex min-w-0 items-center gap-3"><button type="button" className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu size={21} /></button><div className="min-w-0"><p className="truncate text-sm font-semibold">{NAV.find((item) => item.key === section)?.label}</p><p className="hidden text-xs text-slate-500 sm:block">{NAV.find((item) => item.key === section)?.description}</p></div></div><div className="flex items-center gap-2"><span className="hidden max-w-48 truncate rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 md:inline">{companyName}</span><button type="button" onClick={() => setCollapsed((v) => !v)} className="hidden rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 lg:block" title="Alternar menu (Ctrl+B)" aria-label="Alternar menu">{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button></div></div></header>
    <div className="fixed inset-y-0 left-0 z-20 hidden pt-16 lg:block"><Sidebar /></div>
    {mobileOpen && <><button type="button" className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" /><div className="fixed inset-y-0 left-0 z-50 lg:hidden"><Sidebar mobile /></div></>}
    <main className={`min-h-screen pt-16 transition-[margin] duration-200 ${collapsed ? 'lg:ml-[76px]' : 'lg:ml-[272px]'}`}>{children}</main>
  </div>;
}
