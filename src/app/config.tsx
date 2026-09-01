import { Clock, CheckCircle2, XCircle, Wrench } from "lucide-react";
import type { OrderStatus, ServiceOrder } from "./types";

export const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:     { label: "Pendente",      color: "#D97706", bg: "#FEF3C7", icon: <Clock size={12} /> },
  in_progress: { label: "Em andamento",  color: "#1D4ED8", bg: "#DBEAFE", icon: <Wrench size={12} /> },
  completed:   { label: "Concluída",     color: "#15803D", bg: "#DCFCE7", icon: <CheckCircle2 size={12} /> },
  cancelled:   { label: "Cancelada",     color: "#B91C1C", bg: "#FEE2E2", icon: <XCircle size={12} /> },
};

export const PRIORITY_CONFIG = {
  high:   { label: "Alta",   color: "#EF4444" },
  medium: { label: "Média",  color: "#F97316" },
  low:    { label: "Baixa",  color: "#64748B" },
};

export const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function orderPayInfo(order: ServiceOrder) {
  if (order.payments && order.payments.length > 0) {
    const paid = order.payments.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
    const pending = order.payments.filter(p => p.status === "pending").reduce((s, p) => s + p.amount, 0);
    return { paid, pending, hasPayments: true };
  }
  const paid = order.paymentStatus === "paid" ? (order.paidAmount ?? order.clientValue) : 0;
  return { paid, pending: order.paymentStatus === "pending" ? order.clientValue : 0, hasPayments: false };
}

export const fmtDuration = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
