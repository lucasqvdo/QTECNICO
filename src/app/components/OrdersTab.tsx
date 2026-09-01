import { ClipboardList, Search, DollarSign, Receipt, TrendingUp, TrendingDown, MapPin, Calendar, ChevronRight, BadgeCheck, CircleDollarSign, Hourglass } from "lucide-react";
import { STATUS_CONFIG, PRIORITY_CONFIG, fmt, orderPayInfo } from "../config";
import type { ServiceOrder, OrderStatus } from "../types";

export function OrdersTab({ orders, allOrders, searchQuery, filterStatus, counts, onSearch, onFilterChange, onSelectOrder }: {
  orders: ServiceOrder[]; allOrders: ServiceOrder[]; searchQuery: string; filterStatus: OrderStatus | "all";
  counts: Record<string, number>; onSearch: (v: string) => void;
  onFilterChange: (s: OrderStatus | "all") => void; onSelectOrder: (o: ServiceOrder) => void;
}) {
  const active = allOrders.filter(o => o.status !== "cancelled");
  const totalReceita = active.reduce((s, o) => s + o.clientValue, 0);
  const totalCusto = active.reduce((s, o) => s + o.expenses.reduce((a, e) => a + e.amount, 0), 0);
  const margem = totalReceita - totalCusto;

  const chips: { key: OrderStatus | "all"; label: string }[] = [
    { key: "all",         label: `Todas (${counts.all})` },
    { key: "pending",     label: `Pendentes (${counts.pending})` },
    { key: "in_progress", label: `Andamento (${counts.in_progress})` },
    { key: "completed",   label: `Concluídas (${counts.completed})` },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-4 pb-2 flex-shrink-0 grid grid-cols-3 gap-2">
        <MiniCard label="Receita" value={fmt(totalReceita)} color="var(--primary)"   icon={<DollarSign size={12} />} />
        <MiniCard label="Custos"  value={fmt(totalCusto)}   color="#D97706"          icon={<Receipt size={12} />} />
        <MiniCard label="Margem"  value={fmt(margem)}       color={margem >= 0 ? "#15803D" : "#B91C1C"} icon={margem >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />} />
      </div>
      <div className="px-4 pt-2 pb-2 flex-shrink-0">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={searchQuery} onChange={e => onSearch(e.target.value)} placeholder="Buscar cliente, tipo ou ID..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
      </div>
      <div className="px-4 pb-3 flex gap-2 overflow-x-auto flex-shrink-0" style={{ scrollbarWidth: "none" }}>
        {chips.map(f => (
          <button key={f.key} onClick={() => onFilterChange(f.key)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={filterStatus === f.key ? { background: "var(--primary)", color: "white" } : { background: "var(--secondary)", color: "var(--muted-foreground)" }}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-3">
        {orders.length === 0
          ? <div className="text-center py-16 text-muted-foreground text-sm"><ClipboardList size={36} className="mx-auto mb-3 opacity-30" />Nenhuma ordem encontrada.</div>
          : orders.map(o => <OrderCard key={o.id} order={o} onSelect={onSelectOrder} />)}
      </div>
    </div>
  );
}

function MiniCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="flex items-center gap-1 mb-1" style={{ color }}>{icon}<span className="text-xs font-semibold">{label}</span></div>
      <p className="text-sm font-bold text-foreground leading-tight">{value}</p>
    </div>
  );
}

function OrderCard({ order, onSelect }: { order: ServiceOrder; onSelect: (o: ServiceOrder) => void }) {
  const status = STATUS_CONFIG[order.status];
  const priority = PRIORITY_CONFIG[order.priority];
  const date = new Date(order.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const totalExp = order.expenses.reduce((s, e) => s + e.amount, 0);
  const margem = order.clientValue - totalExp;
  const hasActive = order.attendances.length > 0;

  return (
    <button onClick={() => onSelect(order)}
      className="w-full text-left bg-card rounded-2xl p-4 border border-border hover:border-primary/20 hover:shadow-sm transition-all active:scale-[0.99]">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">{order.client}</p>
          <p className="text-xs font-mono text-muted-foreground mt-0.5">{order.id}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {hasActive && <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-full">{order.attendances.length} atend.</span>}
          <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2.5">
        <MapPin size={11} /><span className="truncate">{order.address}</span>
      </div>
      <div className="flex items-center gap-2 mb-3 text-xs">
        <span className="font-semibold" style={{ color: "var(--primary)" }}>{fmt(order.clientValue)}</span>
        <span className="text-muted-foreground">· Custos {fmt(totalExp)}</span>
        {order.clientValue > 0 && (
          <span className="font-semibold" style={{ color: margem >= 0 ? "#15803D" : "#B91C1C" }}>
            · {margem >= 0 ? "+" : ""}{fmt(margem)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color: status.color, background: status.bg }}>
            {status.icon}{status.label}
          </span>
          {order.status !== "cancelled" && (() => {
            const { paid } = orderPayInfo(order);
            const isFullyPaid = paid >= order.clientValue && order.clientValue > 0;
            const isPartial = paid > 0 && !isFullyPaid;
            return (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                style={isFullyPaid
                  ? { color: "#15803D", background: "#DCFCE7" }
                  : isPartial
                  ? { color: "#1D4ED8", background: "#DBEAFE" }
                  : { color: "#D97706", background: "#FEF3C7" }}>
                {isFullyPaid ? <BadgeCheck size={11} /> : isPartial ? <CircleDollarSign size={11} /> : <Hourglass size={11} />}
                {isFullyPaid ? "Recebido" : isPartial ? `${fmt(paid)} rec.` : "A receber"}
              </span>
            );
          })()}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground"><Calendar size={11} />{date}</div>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
        <span className="font-semibold" style={{ color: priority.color }}>● {priority.label}</span>
      </div>
    </button>
  );
}
