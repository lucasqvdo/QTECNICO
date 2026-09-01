import { Camera, User, Wrench, Phone, Mail, DollarSign, Receipt, TrendingUp, TrendingDown, Edit2, Save, Fingerprint, ShieldCheck, ShieldOff, Loader2 } from "lucide-react";
import { fmt } from "../config";
import { ProfileField, Stat } from "./ui/SharedComponents";
import type { ServiceOrder } from "../types";

export function ProfileTab({ name, role, phone, email, photo, editing, orders, onEditToggle, onNameChange, onRoleChange, onPhoneChange, onEmailChange, onPhotoClick, onSave, biometricEnrolled, biometricLoading, onEnableBiometric, onDisableBiometric }: {
  name: string; role: string; phone: string; email: string; photo: string | null; editing: boolean; orders: ServiceOrder[];
  onEditToggle: () => void; onNameChange: (v: string) => void; onRoleChange: (v: string) => void;
  onPhoneChange: (v: string) => void; onEmailChange: (v: string) => void; onPhotoClick: () => void; onSave: () => void;
  /** Se há credencial biométrica cadastrada neste dispositivo */
  biometricEnrolled?: boolean;
  biometricLoading?: boolean;
  onEnableBiometric?: () => void;
  onDisableBiometric?: () => void;
}) {
  const done = orders.filter(o => o.status === "completed");
  const totalReceita = done.reduce((s, o) => s + o.clientValue, 0);
  const totalCusto = done.reduce((s, o) => s + o.expenses.reduce((a, e) => a + e.amount, 0), 0);
  const totalAtend = orders.reduce((s, o) => s + o.attendances.length, 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 pb-24 space-y-4">
        <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-secondary flex items-center justify-center border-2" style={{ borderColor: "var(--primary)" }}>
              {photo ? <img src={photo} alt="Foto" className="w-full h-full object-cover" /> : <span className="text-3xl font-bold text-primary">{name.charAt(0)}</span>}
            </div>
            <button onClick={onPhotoClick} className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center shadow-md" style={{ background: "var(--accent)" }}>
              <Camera size={14} color="#0D1B2E" />
            </button>
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">{name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{role}</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Informações</h3>
            <button onClick={editing ? onSave : onEditToggle}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all"
              style={{ background: editing ? "var(--primary)" : "var(--secondary)", color: editing ? "white" : "var(--foreground)" }}>
              {editing ? <><Save size={12} /> Salvar</> : <><Edit2 size={12} /> Editar</>}
            </button>
          </div>
          <div className="space-y-4">
            <ProfileField label="Nome completo"   value={name}  editing={editing} onChange={onNameChange}  icon={<User size={14} />} />
            <ProfileField label="Cargo / Registro" value={role} editing={editing} onChange={onRoleChange}  icon={<Wrench size={14} />} />
            <ProfileField label="Telefone"         value={phone} editing={editing} onChange={onPhoneChange} icon={<Phone size={14} />} />
            <ProfileField label="E-mail"           value={email} editing={editing} onChange={onEmailChange} icon={<Mail size={14} />} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Resumo de Atividade</h3>
          <div className="grid grid-cols-4 gap-2">
            <Stat value={String(orders.length)}                                         label="OS Total" />
            <Stat value={String(orders.filter(o => o.status === "in_progress").length)} label="Andamento"  color="#1D4ED8" />
            <Stat value={String(orders.filter(o => o.status === "completed").length)}   label="Concluídas" color="#15803D" />
            <Stat value={String(totalAtend)}                                            label="Atend."     color="var(--accent)" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Financeiro (Concluídas)</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><DollarSign size={14} style={{ color: "var(--primary)" }} /><span>Receita bruta</span></div>
              <span className="font-bold text-sm" style={{ color: "var(--primary)" }}>{fmt(totalReceita)}</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Receipt size={14} className="text-amber-500" /><span>Custos totais</span></div>
              <span className="font-bold text-sm text-amber-600">{fmt(totalCusto)}</span>
            </div>
            <div className="h-px bg-border" />
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {totalReceita - totalCusto >= 0 ? <TrendingUp size={14} className="text-green-600" /> : <TrendingDown size={14} className="text-red-600" />}
                <span>Resultado</span>
              </div>
              <span className="font-bold text-base" style={{ color: totalReceita - totalCusto >= 0 ? "#15803D" : "#B91C1C" }}>{fmt(totalReceita - totalCusto)}</span>
            </div>
          </div>
        </div>

        {/* Card de segurança — biometria */}
        {(onEnableBiometric || onDisableBiometric) && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Segurança</h3>
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: biometricEnrolled ? "#DCFCE7" : "var(--secondary)" }}>
                {biometricEnrolled
                  ? <ShieldCheck size={22} className="text-green-700" />
                  : <Fingerprint size={22} className="text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Login biométrico</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {biometricEnrolled
                    ? "Ativo neste dispositivo"
                    : "Digital ou reconhecimento facial"}
                </p>
              </div>
              {biometricLoading ? (
                <Loader2 size={18} className="animate-spin text-muted-foreground flex-shrink-0" />
              ) : biometricEnrolled ? (
                <button onClick={onDisableBiometric}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 flex-shrink-0"
                  style={{ background: "#FEE2E2", color: "#B91C1C" }}>
                  <ShieldOff size={13} /> Desativar
                </button>
              ) : (
                <button onClick={onEnableBiometric}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 flex-shrink-0"
                  style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                  <Fingerprint size={13} /> Ativar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
