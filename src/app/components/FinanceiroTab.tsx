import { useState } from "react";
import { BadgeCheck, Hourglass, Receipt, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { fmt, orderPayInfo } from "../config";
import type { ServiceOrder, Payment } from "../types";

type FinPeriod = "3m" | "6m" | "12m" | "all";

function FinSummaryCard({ label, value, icon, color, bg }: { label: string; value: number; icon: React.ReactNode; color: string; bg: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: bg }}>
      <div className="flex items-center gap-1.5 mb-2" style={{ color }}>
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="text-lg font-bold" style={{ color }}>{fmt(value)}</p>
    </div>
  );
}

export function FinanceiroTab({ orders, onUpdate }: { orders: ServiceOrder[]; onUpdate: (o: ServiceOrder) => void }) {
  const [period, setPeriod] = useState<FinPeriod>("6m");

  const now = new Date();
  const periodMonths: Record<FinPeriod, number> = { "3m": 3, "6m": 6, "12m": 12, all: 999 };
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - periodMonths[period]);

  const activeOrders = orders.filter(o => o.status !== "cancelled");
  const filtered = activeOrders.filter(o => new Date(o.date + "T12:00:00") >= cutoff);

  const totalRecebido = filtered.reduce((s, o) => s + orderPayInfo(o).paid, 0);
  const totalAReceber = filtered.reduce((s, o) => s + Math.max(0, o.clientValue - orderPayInfo(o).paid), 0);
  const totalCustos   = filtered.reduce((s, o) => s + o.expenses.reduce((a, e) => a + e.amount, 0), 0);
  const margemLiq     = totalRecebido - totalCustos;

  const monthsToShow = Math.min(periodMonths[period], 12);
  const monthlyData = Array.from({ length: monthsToShow }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (monthsToShow - 1 - i), 1);
    const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    const monthOrders = activeOrders.filter(o => {
      const od = new Date(o.date + "T12:00:00");
      return od.getFullYear() === d.getFullYear() && od.getMonth() === d.getMonth();
    });
    return {
      label,
      recebido: monthOrders.reduce((s, o) => s + orderPayInfo(o).paid, 0),
      aReceber: monthOrders.reduce((s, o) => s + Math.max(0, o.clientValue - orderPayInfo(o).paid), 0),
    };
  });

  const donutData = [
    { name: "Recebido",  value: totalRecebido, color: "#15803D" },
    { name: "A receber", value: totalAReceber, color: "#D97706" },
  ].filter(d => d.value > 0);

  const pendingOrders = filtered
    .filter(o => o.clientValue - orderPayInfo(o).paid > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const periods: { key: FinPeriod; label: string }[] = [
    { key: "3m", label: "3 meses" },
    { key: "6m", label: "6 meses" },
    { key: "12m", label: "12 meses" },
    { key: "all", label: "Tudo" },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4 pb-24">
        <div className="flex gap-2">
          {periods.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className="flex-1 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={period === p.key ? { background: "var(--primary)", color: "white" } : { background: "var(--secondary)", color: "var(--muted-foreground)" }}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FinSummaryCard label="Recebido"       value={totalRecebido} icon={<BadgeCheck size={16} />} color="#15803D" bg="#DCFCE7" />
          <FinSummaryCard label="A receber"      value={totalAReceber} icon={<Hourglass size={16} />}  color="#D97706" bg="#FEF3C7" />
          <FinSummaryCard label="Custos"         value={totalCustos}   icon={<Receipt size={16} />}    color="#B91C1C" bg="#FEE2E2" />
          <FinSummaryCard label="Margem líquida" value={margemLiq}     icon={<TrendingUp size={16} />} color={margemLiq >= 0 ? "#15803D" : "#B91C1C"} bg={margemLiq >= 0 ? "#DCFCE7" : "#FEE2E2"} />
        </div>

        {donutData.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Recebido vs A receber</h3>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={42} outerRadius={65} paddingAngle={3} dataKey="value">
                    {donutData.map((entry, i) => <Cell key={i} fill={entry.color} strokeWidth={0} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {donutData.map(d => (
                  <div key={d.name} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                      <span className="text-xs text-muted-foreground">{d.name}</span>
                    </div>
                    <span className="text-xs font-bold" style={{ color: d.color }}>{fmt(d.value)}</span>
                  </div>
                ))}
                <div className="pt-1 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Total</span>
                    <span className="text-xs font-bold text-foreground">{fmt(totalRecebido + totalAReceber)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-card border border-border rounded-2xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Comparativo mensal</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData} barSize={12} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} width={36} />
              <Tooltip
                formatter={(value: number, name: string) => [fmt(value), name === "recebido" ? "Recebido" : "A receber"]}
                contentStyle={{ borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", fontSize: 12 }}
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
              />
              <Bar dataKey="recebido" fill="#15803D" radius={[4, 4, 0, 0]} />
              <Bar dataKey="aReceber" fill="#FCD34D" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 justify-center">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-3 h-2 rounded-sm bg-green-700 inline-block" /> Recebido</div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-3 h-2 rounded-sm bg-yellow-300 inline-block" /> A receber</div>
          </div>
        </div>

        {pendingOrders.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              A receber ({pendingOrders.length})
            </h3>
            <div className="space-y-3">
              {pendingOrders.map(o => (
                <div key={o.id} className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{o.client}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs font-mono text-muted-foreground">{o.id}</p>
                      <span className="text-xs text-muted-foreground">·</span>
                      <p className="text-xs text-muted-foreground">{new Date(o.date + "T12:00:00").toLocaleDateString("pt-BR")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-bold text-sm text-amber-700">{fmt(Math.max(0, o.clientValue - orderPayInfo(o).paid))}</span>
                    <button
                      onClick={() => {
                        const remaining = Math.max(0, o.clientValue - orderPayInfo(o).paid);
                        const newPay: Payment = { id: `pay-${Date.now()}`, orderId: o.id, label: "Pagamento", amount: remaining, date: new Date().toISOString().split("T")[0], status: "paid" };
                        onUpdate({ ...o, payments: [...(o.payments || []), newPay] });
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95"
                      style={{ background: "#DCFCE7", color: "#15803D" }}>
                      Receber
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
