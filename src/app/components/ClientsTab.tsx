import { useState, useEffect } from "react";
import { Search, Phone, Mail, MapPin, FileText, Edit2, Trash2, X, Users } from "lucide-react";
import { STATUS_CONFIG, fmt } from "../config";
import { Field } from "./ui/SharedComponents";
import type { Client, ServiceOrder, OrderStatus } from "../types";

type ContactRisk = "active" | "warning" | "danger" | "never";

const RISK_CONFIG: Record<ContactRisk, { label: string; color: string; bg: string; ring: string; days: string }> = {
  active:  { label: "Ativo",       color: "#15803D", bg: "#DCFCE7", ring: "#22C55E", days: "< 30 dias" },
  warning: { label: "Atenção",     color: "#D97706", bg: "#FEF3C7", ring: "#F59E0B", days: "30–90 dias" },
  danger:  { label: "Em risco",    color: "#B91C1C", bg: "#FEE2E2", ring: "#EF4444", days: "> 90 dias" },
  never:   { label: "Sem contato", color: "#64748B", bg: "#F1F5F9", ring: "#94A3B8", days: "Nunca" },
};

function getLastContact(clientId: string, orders: ServiceOrder[]): Date | null {
  const clientOrders = orders.filter(o => o.clientId === clientId && o.status !== "cancelled");
  if (clientOrders.length === 0) return null;
  const dates = clientOrders.flatMap(o => {
    const pts: Date[] = [new Date(o.date + "T12:00:00")];
    o.attendances.forEach(a => pts.push(new Date(a.startTime)));
    return pts;
  });
  return new Date(Math.max(...dates.map(d => d.getTime())));
}

function getRisk(lastContact: Date | null): ContactRisk {
  if (!lastContact) return "never";
  const days = Math.floor((Date.now() - lastContact.getTime()) / 86400000);
  if (days < 30) return "active";
  if (days <= 90) return "warning";
  return "danger";
}

function daysSince(date: Date | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function CrmSummaryCard({ label, count, color, bg, onClick, active }: {
  label: string; count: number; color: string; bg: string; onClick: () => void; active: boolean;
}) {
  return (
    <button onClick={onClick} className="rounded-xl p-3 text-left transition-all active:scale-95"
      style={{ background: active ? color : bg, border: `2px solid ${active ? color : "transparent"}` }}>
      <p className="text-xl font-bold" style={{ color: active ? "white" : color }}>{count}</p>
      <p className="text-xs font-semibold mt-0.5" style={{ color: active ? "rgba(255,255,255,0.85)" : color }}>{label}</p>
    </button>
  );
}

function ClientModal({ client, onSave, onClose }: { client: Client | null; onSave: (c: Client) => void; onClose: () => void }) {
  const [form, setForm] = useState<Client>(client ?? { id: Date.now().toString(), name: "", document: "", address: "", phone: "", email: "" });
  const valid = form.name.trim();
  return (
    <div className="absolute inset-0 z-30 flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="bg-background rounded-t-3xl p-6 pb-10 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-foreground">{client ? "Editar cliente" : "Novo cliente"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={18} className="text-muted-foreground" /></button>
        </div>
        <div className="space-y-3">
          <Field label="Nome / Razão social *" value={form.name}     onChange={v => setForm({ ...form, name: v })}     placeholder="Nome do cliente ou empresa" />
          <Field label="CPF / CNPJ"            value={form.document} onChange={v => setForm({ ...form, document: v })} placeholder="00.000.000/0001-00" />
          <Field label="Endereço"              value={form.address}  onChange={v => setForm({ ...form, address: v })}  placeholder="Rua, número — cidade, UF" />
          <Field label="Telefone"              value={form.phone}    onChange={v => setForm({ ...form, phone: v })}    placeholder="(00) 00000-0000" />
          <Field label="E-mail"               value={form.email}    onChange={v => setForm({ ...form, email: v })}    placeholder="contato@empresa.com.br" />
          <button onClick={() => valid && onSave(form)} disabled={!valid}
            className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-40"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
            {client ? "Salvar alterações" : "Cadastrar cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ClientsTab({ clients, orders, onSave, onDelete }: {
  clients: Client[]; orders: ServiceOrder[]; onSave: (c: Client) => void; onDelete: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ContactRisk | "all">("all");
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const handler = () => { setEditClient(null); setShowModal(true); };
    window.addEventListener("add-client", handler);
    return () => window.removeEventListener("add-client", handler);
  }, []);

  const saveClient = (c: Client) => { onSave(c); setShowModal(false); setEditClient(null); };

  const enriched = clients.map(c => {
    const last = getLastContact(c.id, orders);
    const risk = getRisk(last);
    const days = daysSince(last);
    const clientOrders = orders.filter(o => o.clientId === c.id);
    const revenue = clientOrders.filter(o => o.status === "completed").reduce((s, o) => s + o.clientValue, 0);
    return { ...c, last, risk, days, clientOrders, revenue };
  });

  const counts = {
    danger:  enriched.filter(c => c.risk === "danger" || c.risk === "never").length,
    warning: enriched.filter(c => c.risk === "warning").length,
    active:  enriched.filter(c => c.risk === "active").length,
  };

  const RISK_ORDER: Record<ContactRisk, number> = { danger: 0, never: 1, warning: 2, active: 3 };

  const visible = enriched
    .filter(c => {
      const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.document.includes(search) || c.phone.includes(search);
      const matchFilter = filter === "all" || c.risk === filter || (filter === "danger" && c.risk === "never");
      return matchSearch && matchFilter;
    })
    .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-4 pb-2 flex-shrink-0 grid grid-cols-3 gap-2">
        <CrmSummaryCard label="Em risco" count={counts.danger}  color="#B91C1C" bg="#FEE2E2" onClick={() => setFilter(f => f === "danger" ? "all" : "danger")} active={filter === "danger"} />
        <CrmSummaryCard label="Atenção"  count={counts.warning} color="#D97706" bg="#FEF3C7" onClick={() => setFilter(f => f === "warning" ? "all" : "warning")} active={filter === "warning"} />
        <CrmSummaryCard label="Ativos"   count={counts.active}  color="#15803D" bg="#DCFCE7" onClick={() => setFilter(f => f === "active" ? "all" : "active")} active={filter === "active"} />
      </div>

      <div className="px-4 pt-2 pb-3 flex-shrink-0">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, documento ou telefone..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-3">
        {visible.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            <Users size={36} className="mx-auto mb-3 opacity-30" />Nenhum cliente encontrado.
          </div>
        ) : visible.map(c => {
          const risk = RISK_CONFIG[c.risk];
          return (
            <div key={c.id} className="bg-card border border-border rounded-2xl p-4 transition-all hover:shadow-sm">
              <div className="flex items-start gap-3 mb-3">
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: "var(--primary)" }}>
                    {c.name.charAt(0)}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card" style={{ background: risk.ring }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{c.name}</p>
                      <p className="text-xs font-mono text-muted-foreground">{c.document}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => { setEditClient(c); setShowModal(true); }} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                        <Edit2 size={13} className="text-muted-foreground" />
                      </button>
                      <button onClick={() => onDelete(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                        <Trash2 size={13} className="text-destructive" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-1 mb-3 pl-[52px]">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone size={11} /><span>{c.phone}</span></div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail size={11} /><span className="truncate">{c.email}</span></div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin size={11} /><span className="truncate">{c.address}</span></div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-border">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color: risk.color, background: risk.bg }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: risk.ring }} />{risk.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.days === null ? "Nunca contatado" : c.days === 0 ? "Hoje" : `${c.days}d atrás`}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {c.clientOrders.length > 0 && <span className="flex items-center gap-1"><FileText size={11} />{c.clientOrders.length} OS</span>}
                  {c.revenue > 0 && <span className="font-semibold" style={{ color: "var(--primary)" }}>{fmt(c.revenue)}</span>}
                </div>
              </div>

              {c.clientOrders.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {(["pending","in_progress","completed","cancelled"] as OrderStatus[]).map(s => {
                    const n = c.clientOrders.filter(o => o.status === s).length;
                    if (!n) return null;
                    const sc = STATUS_CONFIG[s];
                    return <span key={s} className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: sc.bg, color: sc.color }}>{n} {sc.label}</span>;
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showModal && (
        <ClientModal client={editClient} onSave={saveClient} onClose={() => { setShowModal(false); setEditClient(null); }} />
      )}
    </div>
  );
}
