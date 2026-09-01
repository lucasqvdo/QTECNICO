import { fmt } from "../../config";

export function Field({ label, value, onChange, placeholder, textarea }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; textarea?: boolean;
}) {
  const cls = "w-full px-4 py-3 rounded-xl bg-secondary text-foreground placeholder-muted-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none";
  return (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{label}</label>
      {textarea
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} className={cls} />
        : <input   value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />}
    </div>
  );
}

export function InfoRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2 text-sm text-muted-foreground">
      <span className="mt-0.5 flex-shrink-0">{icon}</span><span>{text}</span>
    </div>
  );
}

export function ActionBtn({ label, color, bg, onClick }: { label: string; color: string; bg: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
      style={{ color, background: bg }}>
      {label}
    </button>
  );
}

export function FinCard({ label, value, valueColor, sub }: { label: string; value: number; valueColor: string; sub?: string }) {
  return (
    <div className="bg-secondary rounded-xl p-3 text-center">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-bold leading-tight" style={{ color: valueColor }}>{fmt(value)}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export function ProfileField({ label, value, editing, onChange, icon }: {
  label: string; value: string; editing: boolean; onChange: (v: string) => void; icon: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{icon} {label}</label>
      {editing
        ? <input value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-secondary text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20" />
        : <p className="text-sm text-foreground pl-1">{value}</p>}
    </div>
  );
}

export function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div className="text-center bg-secondary rounded-xl py-3">
      <p className="text-xl font-bold" style={{ color: color || "var(--primary)" }}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

export function MiniCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="flex items-center gap-1 mb-1" style={{ color }}>{icon}<span className="text-xs font-semibold">{label}</span></div>
      <p className="text-sm font-bold text-foreground leading-tight">{value}</p>
    </div>
  );
}
