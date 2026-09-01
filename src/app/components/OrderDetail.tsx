import { useState, useRef, useEffect } from "react";
import { ArrowLeft, Download, MapPin, Phone, Calendar, Plus, Trash2, Play, Square, CheckCircle2, Image, X, PenLine } from "lucide-react";
import { STATUS_CONFIG, PRIORITY_CONFIG, fmt, fmtDuration, fmtDateTime } from "../config";
import { InfoRow, ActionBtn, FinCard } from "./ui/SharedComponents";
import { exportPDF } from "../exportPDF";
import { api } from "../api";
import type { ServiceOrder, Client, Attendance, AttendancePhoto, Payment } from "../types";

/* ─── Signature Pad ──────────────────────────────────────────── */

function SignaturePad({ onSave, onCancel }: { onSave: (result: { key: string; url: string }) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [saving, setSaving] = useState(false);

  const getCtx = () => {
    const c = canvasRef.current;
    if (!c) return null;
    const ctx = c.getContext("2d");
    if (ctx) { ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; }
    return ctx;
  };

  const getXY = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const scaleX = c.width / rect.width;
    const scaleY = c.height / rect.height;
    if ("touches" in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  };

  const onStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = getCtx(); if (!ctx) return;
    const { x, y } = getXY(e);
    ctx.beginPath(); ctx.moveTo(x, y);
    setIsDrawing(true); setHasStrokes(true);
  };

  const onMove = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = getCtx(); if (!ctx) return;
    const { x, y } = getXY(e);
    ctx.lineTo(x, y); ctx.stroke();
  };

  const onEnd = () => setIsDrawing(false);

  const clear = () => {
    const c = canvasRef.current; if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setHasStrokes(false);
  };

  const save = () => {
    const c = canvasRef.current;
    if (!c) return;
    setSaving(true);
    c.toBlob(async (blob) => {
      if (!blob) { setSaving(false); return; }
      try {
        const file = new File([blob], `assinatura-${Date.now()}.png`, { type: "image/png" });
        const { key, url } = await api.uploadPhoto(file, "signatures");
        onSave({ key, url });
      } catch (err) {
        console.error("Erro ao enviar assinatura:", err);
      } finally {
        setSaving(false);
      }
    }, "image/png");
  };

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden border-2 border-dashed border-border bg-white" style={{ touchAction: "none" }}>
        <canvas ref={canvasRef} width={600} height={200}
          className="w-full block" style={{ cursor: "crosshair" }}
          onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
          onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
        />
        {!hasStrokes && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none select-none">
            Assine aqui
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={clear} className="px-3 py-2 rounded-xl text-xs font-semibold bg-secondary text-muted-foreground transition-all active:scale-95">Limpar</button>
        <button onClick={onCancel} className="flex-1 py-2 rounded-xl text-xs font-semibold bg-secondary text-muted-foreground transition-all active:scale-95">Cancelar</button>
        <button onClick={save} disabled={!hasStrokes || saving}
          className="flex-1 py-2 rounded-xl text-xs font-semibold text-white transition-all active:scale-95 disabled:opacity-40"
          style={{ background: "var(--primary)" }}>
          {saving ? "Enviando..." : "Salvar assinatura"}
        </button>
      </div>
    </div>
  );
}

/* ─── Attendance Card ────────────────────────────────────────── */

function AttendanceCard({ att, onDeletePhoto }: { att: Attendance; onDeletePhoto: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-secondary/50 hover:bg-secondary transition-colors">
        <div className="text-left">
          <p className="text-xs font-semibold text-foreground">{fmtDateTime(att.startTime)}</p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">Duração: {fmtDuration(att.durationSeconds)}</p>
        </div>
        <div className="flex items-center gap-2">
          {att.photos.length > 0 && <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-full">{att.photos.length} foto(s)</span>}
          <span className="text-muted-foreground transition-transform inline-block" style={{ transform: expanded ? "rotate(90deg)" : "none" }}>›</span>
        </div>
      </button>
      {expanded && (
        <div className="px-4 py-3 space-y-3">
          <p className="text-sm text-foreground leading-relaxed">{att.description || <span className="italic text-muted-foreground">Sem descrição.</span>}</p>
          {att.photos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {att.photos.map(p => (
                <div key={p.id} className="relative">
                  <img src={p.dataUrl} alt={p.name} className="w-20 h-20 object-cover rounded-xl border border-border" />
                  <button onClick={() => onDeletePhoto(p.id)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                    <X size={10} color="white" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Payments Card ──────────────────────────────────────────── */

function PaymentsCard({ order, onUpdate }: { order: ServiceOrder; onUpdate: (o: ServiceOrder) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAmt, setNewAmt] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().split("T")[0]);
  const [newStatus, setNewStatus] = useState<"paid" | "pending">("pending");

  const sorted = [...(order.payments || [])].sort((a, b) => a.date.localeCompare(b.date));
  const totalPaid    = sorted.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const totalPending = sorted.filter(p => p.status === "pending").reduce((s, p) => s + p.amount, 0);
  const totalSched   = totalPaid + totalPending;
  const balance      = order.clientValue - totalSched;

  const openForm = () => {
    setNewLabel(`Parcela ${sorted.length + 1}`);
    setNewAmt(balance > 0 ? String(balance.toFixed(2)) : "");
    setNewDate(new Date().toISOString().split("T")[0]);
    setNewStatus("pending");
    setShowForm(true);
  };

  const addPayment = () => {
    const amount = parseFloat(newAmt.replace(",", "."));
    if (isNaN(amount) || amount <= 0) return;
    const p: Payment = { id: `pay-${Date.now()}`, orderId: order.id, label: newLabel.trim() || "Pagamento", amount, date: newDate, status: newStatus };
    onUpdate({ ...order, payments: [...(order.payments || []), p] });
    setShowForm(false);
  };

  const markPaid = (id: string) =>
    onUpdate({ ...order, payments: order.payments.map(p => p.id === id ? { ...p, status: "paid" } : p) });

  const removePay = (id: string) =>
    onUpdate({ ...order, payments: order.payments.filter(p => p.id !== id) });

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Pagamentos</h3>
        {sorted.length > 0 && (
          <div className="flex items-center gap-3 text-xs">
            <span className="font-semibold text-green-700">{fmt(totalPaid)} rec.</span>
            {totalPending > 0 && <span className="font-semibold text-amber-600">{fmt(totalPending)} pend.</span>}
          </div>
        )}
      </div>

      {sorted.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl p-2.5 border border-green-100 bg-green-50 text-center">
            <p className="text-xs text-muted-foreground mb-0.5">Recebido</p>
            <p className="text-xs font-bold font-mono text-green-700">{fmt(totalPaid)}</p>
          </div>
          <div className="rounded-xl p-2.5 border border-amber-100 bg-amber-50 text-center">
            <p className="text-xs text-muted-foreground mb-0.5">Pendente</p>
            <p className="text-xs font-bold font-mono text-amber-700">{fmt(totalPending)}</p>
          </div>
          <div className={`rounded-xl p-2.5 border text-center ${balance > 0 ? "border-blue-100 bg-blue-50" : balance < 0 ? "border-orange-100 bg-orange-50" : "border-border bg-secondary"}`}>
            <p className="text-xs text-muted-foreground mb-0.5">Saldo OS</p>
            <p className={`text-xs font-bold font-mono ${balance > 0 ? "text-blue-700" : balance < 0 ? "text-orange-700" : "text-foreground"}`}>{fmt(Math.abs(balance))}{balance < 0 ? " +" : ""}</p>
          </div>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="space-y-2">
          {sorted.map(p => (
            <div key={p.id} className="flex items-center gap-2 p-3 rounded-xl border border-border bg-secondary/30">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">{p.label}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${p.status === "paid" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                    {p.status === "paid" ? "Recebido" : "Pendente"}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm font-mono font-bold">{fmt(p.amount)}</span>
                  <span className="text-xs text-muted-foreground">· {new Date(p.date + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {p.status === "pending" && (
                  <button onClick={() => markPaid(p.id)}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95"
                    style={{ background: "#DCFCE7", color: "#15803D" }}>
                    Receber
                  </button>
                )}
                <button onClick={() => removePay(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                  <Trash2 size={12} className="text-destructive" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {order.clientValue > 0 && sorted.length > 0 && balance !== 0 && (
        <p className={`text-xs px-3 py-1.5 rounded-lg font-medium ${balance > 0 ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"}`}>
          {balance > 0 ? `${fmt(balance)} ainda não agendado` : `${fmt(Math.abs(balance))} acima do valor da OS`}
        </p>
      )}

      {showForm ? (
        <div className="border border-dashed border-border rounded-xl p-4 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Descrição</label>
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Ex: Entrada, Parcela 1..."
                className="w-full px-3 py-2 rounded-xl bg-secondary text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div className="w-28">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Valor (R$)</label>
              <input type="number" value={newAmt} onChange={e => setNewAmt(e.target.value)} placeholder="0,00"
                className="w-full px-3 py-2 rounded-xl bg-secondary text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Data</label>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-secondary text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Status</label>
              <div className="flex gap-1.5 h-[38px]">
                <button onClick={() => setNewStatus("pending")} className="flex-1 rounded-xl text-xs font-semibold transition-all"
                  style={newStatus === "pending" ? { background: "#FEF3C7", color: "#D97706" } : { background: "var(--secondary)", color: "var(--muted-foreground)" }}>
                  Pendente
                </button>
                <button onClick={() => setNewStatus("paid")} className="flex-1 rounded-xl text-xs font-semibold transition-all"
                  style={newStatus === "paid" ? { background: "#DCFCE7", color: "#15803D" } : { background: "var(--secondary)", color: "var(--muted-foreground)" }}>
                  Recebido
                </button>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-secondary text-muted-foreground transition-all active:scale-95">Cancelar</button>
            <button onClick={addPayment} disabled={!newAmt}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-40"
              style={{ background: "var(--primary)" }}>
              Adicionar
            </button>
          </div>
        </div>
      ) : (
        <button onClick={openForm}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 border-2 border-dashed border-border text-muted-foreground hover:border-primary/30 hover:text-foreground">
          <Plus size={14} /> Adicionar pagamento
        </button>
      )}
    </div>
  );
}

/* ─── Order Detail ───────────────────────────────────────────── */

export function OrderDetail({ order, client, techName, onClose, onUpdate }: {
  order: ServiceOrder; client?: Client; techName: string;
  onClose: () => void; onUpdate: (o: ServiceOrder) => void;
}) {
  const [newExpLabel, setNewExpLabel] = useState("");
  const [newExpAmt, setNewExpAmt] = useState("");
  const [timerActive, setTimerActive] = useState(false);
  const [timerStart, setTimerStart] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [pendingDesc, setPendingDesc] = useState<string | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<AttendancePhoto[]>([]);
  const photoRef = useRef<HTMLInputElement>(null);
  const [showSigPad, setShowSigPad] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  useEffect(() => {
    if (!timerActive || !timerStart) return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - timerStart.getTime()) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [timerActive, timerStart]);

  const startTimer = () => { setTimerStart(new Date()); setTimerActive(true); setElapsed(0); };
  const stopTimer = () => { setTimerActive(false); setPendingDesc(""); };

  const saveAttendance = () => {
    if (!timerStart || pendingDesc === null) return;
    const att: Attendance = {
      id: Date.now().toString(),
      startTime: timerStart.toISOString(),
      endTime: new Date().toISOString(),
      durationSeconds: elapsed,
      description: pendingDesc,
      photos: pendingPhotos,
    };
    onUpdate({ ...order, attendances: [...order.attendances, att] });
    setTimerStart(null); setElapsed(0); setPendingDesc(null); setPendingPhotos([]);
  };

  const addPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploadingPhotos(true);
    try {
      for (const file of files) {
        const { key, url } = await api.uploadPhoto(file, 'attendances');
        setPendingPhotos(prev => [...prev, { id: Date.now() + file.name, key, dataUrl: url, name: file.name }]);
      }
    } catch (err) {
      console.error("Erro ao enviar foto:", err);
    } finally {
      setUploadingPhotos(false);
    }
  };

  const removePhoto = (id: string) => setPendingPhotos(prev => prev.filter(p => p.id !== id));
  const deleteAttPhoto = (attId: string, photoId: string) =>
    onUpdate({ ...order, attendances: order.attendances.map(a => a.id === attId ? { ...a, photos: a.photos.filter(p => p.id !== photoId) } : a) });

  const status = STATUS_CONFIG[order.status];
  const priority = PRIORITY_CONFIG[order.priority];
  const dateStr = new Date(order.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const totalExp = order.expenses.reduce((s, e) => s + e.amount, 0);
  const margem = order.clientValue - totalExp;
  const margemPct = order.clientValue > 0 ? ((margem / order.clientValue) * 100).toFixed(1) : "0";

  const addExpense = () => {
    const amount = parseFloat(newExpAmt.replace(",", "."));
    if (!newExpLabel.trim() || isNaN(amount) || amount <= 0) return;
    onUpdate({ ...order, expenses: [...order.expenses, { id: Date.now().toString(), label: newExpLabel.trim(), amount }] });
    setNewExpLabel(""); setNewExpAmt("");
  };

  const removeExpense = (id: string) => onUpdate({ ...order, expenses: order.expenses.filter(e => e.id !== id) });

  const updateClientValue = (raw: string) => {
    const val = parseFloat(raw.replace(",", "."));
    onUpdate({ ...order, clientValue: isNaN(val) ? 0 : val });
  };

  return (
    <div className="absolute inset-0 bg-background z-20 flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="bg-primary text-primary-foreground px-4 pt-10 pb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><ArrowLeft size={18} /></button>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-xs text-primary-foreground/60">{order.id}</p>
            <h2 className="font-semibold text-base truncate">{order.type}</h2>
          </div>
          <button onClick={() => exportPDF(order, client, techName)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-white/10 transition-colors">
            <Download size={14} /> PDF
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-8">
        <div className="flex gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ color: status.color, background: status.bg }}>
            {status.icon} {status.label}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-secondary text-foreground">
            <span className="w-2 h-2 rounded-full" style={{ background: priority.color }} /> Prioridade {priority.label}
          </span>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Cliente</h3>
          <p className="font-semibold text-foreground">{order.client}</p>
          {client && <p className="text-xs text-muted-foreground font-mono">{client.document}</p>}
          <div className="space-y-2">
            <InfoRow icon={<MapPin size={13} />} text={order.address} />
            <InfoRow icon={<Phone size={13} />} text={order.phone} />
            <InfoRow icon={<Calendar size={13} />} text={dateStr} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Descrição</h3>
          <p className="text-sm text-foreground leading-relaxed">{order.description}</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Assinatura do cliente</h3>
          {order.clientSignature ? (
            <div>
              <img src={order.clientSignature} alt="Assinatura do cliente"
                className="w-full max-h-28 object-contain bg-white rounded-xl border border-border p-2" />
              <div className="flex gap-3 mt-2">
                <button onClick={() => setShowSigPad(true)} className="text-xs text-primary font-semibold hover:underline transition-colors">Refazer</button>
                <button onClick={() => onUpdate({ ...order, clientSignature: undefined, clientSignatureKey: undefined })}
                  className="text-xs text-destructive font-semibold hover:underline transition-colors">Remover</button>
              </div>
            </div>
          ) : showSigPad ? (
            <SignaturePad
              onSave={({ key, url }) => { onUpdate({ ...order, clientSignature: url, clientSignatureKey: key }); setShowSigPad(false); }}
              onCancel={() => setShowSigPad(false)}
            />
          ) : (
            <button onClick={() => setShowSigPad(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 border-2 border-dashed border-border text-muted-foreground hover:border-primary/30 hover:text-foreground">
              <PenLine size={15} /> Coletar assinatura do cliente
            </button>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Atendimentos</h3>

          {timerActive && (
            <div className="rounded-2xl p-4 text-center space-y-3" style={{ background: "var(--primary)" }}>
              <p className="text-primary-foreground/70 text-xs font-semibold uppercase tracking-widest">Atendimento em curso</p>
              <p className="text-5xl font-mono font-bold text-white tracking-widest">{fmtDuration(elapsed)}</p>
              <button onClick={stopTimer}
                className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                style={{ background: "#EF4444", color: "white" }}>
                <Square size={14} fill="white" /> Encerrar atendimento
              </button>
            </div>
          )}

          {!timerActive && pendingDesc !== null && (
            <div className="border border-dashed border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CheckCircle2 size={16} className="text-green-600" />
                Duração: <span className="font-mono">{fmtDuration(elapsed)}</span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">O que foi feito *</label>
                <textarea value={pendingDesc} onChange={e => setPendingDesc(e.target.value)} rows={3}
                  placeholder="Descreva as atividades realizadas neste atendimento..."
                  className="w-full px-3 py-2.5 rounded-xl bg-secondary text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Fotos ({pendingPhotos.length})</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {pendingPhotos.map(p => (
                    <div key={p.id} className="relative">
                      <img src={p.dataUrl} alt={p.name} className="w-20 h-20 object-cover rounded-xl border border-border" />
                      <button onClick={() => removePhoto(p.id)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                        <X size={10} color="white" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => photoRef.current?.click()} disabled={uploadingPhotos}
                    className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary/40 transition-colors disabled:opacity-50">
                    {uploadingPhotos ? <span className="text-xs">Enviando...</span> : <><Image size={18} /><span className="text-xs">Adicionar</span></>}
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setPendingDesc(null); setPendingPhotos([]); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-secondary text-muted-foreground transition-all active:scale-95">
                  Cancelar
                </button>
                <button onClick={saveAttendance} disabled={!pendingDesc?.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-40"
                  style={{ background: "var(--primary)" }}>
                  Salvar atendimento
                </button>
              </div>
            </div>
          )}

          {!timerActive && pendingDesc === null && order.status !== "cancelled" && (
            <button onClick={startTimer}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
              style={{ background: "var(--primary)", color: "white" }}>
              <Play size={15} fill="white" /> Iniciar atendimento
            </button>
          )}

          {order.attendances.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Histórico ({order.attendances.length})</p>
              {order.attendances.map(att => (
                <AttendanceCard key={att.id} att={att} onDeletePhoto={pid => deleteAttPhoto(att.id, pid)} />
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Financeiro</h3>
          <div className="grid grid-cols-3 gap-2">
            <FinCard label="Receita" value={order.clientValue} valueColor="var(--primary)" />
            <FinCard label="Custos"  value={totalExp}          valueColor="#D97706" />
            <FinCard label="Margem"  value={margem}            valueColor={margem >= 0 ? "#15803D" : "#B91C1C"} sub={`${margemPct}%`} />
          </div>
          {order.clientValue > 0 && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Custo / Receita</span>
                <span>{((totalExp / order.clientValue) * 100).toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, (totalExp / order.clientValue) * 100)}%`, background: totalExp > order.clientValue ? "#EF4444" : "var(--accent)" }} />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Valor do cliente (R$)</label>
            <input type="number" defaultValue={order.clientValue || ""} onBlur={e => updateClientValue(e.target.value)} placeholder="0,00"
              className="w-full px-4 py-2.5 rounded-xl bg-secondary text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Despesas</p>
            {order.expenses.length === 0
              ? <p className="text-xs text-muted-foreground italic py-1">Nenhuma despesa registrada.</p>
              : (
                <div className="space-y-2">
                  {order.expenses.map(exp => (
                    <div key={exp.id} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
                      <span className="flex-1 text-sm text-foreground truncate">{exp.label}</span>
                      <span className="text-sm font-semibold font-mono flex-shrink-0">{fmt(exp.amount)}</span>
                      <button onClick={() => removeExpense(exp.id)} className="p-1 rounded-lg hover:bg-red-50 transition-colors">
                        <Trash2 size={13} className="text-destructive" />
                      </button>
                    </div>
                  ))}
                  <div className="flex justify-between pt-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total</span>
                    <span className="text-sm font-bold" style={{ color: "var(--primary)" }}>{fmt(totalExp)}</span>
                  </div>
                </div>
              )}
            <div className="border border-dashed border-border rounded-xl p-3 space-y-2 mt-3">
              <div className="flex gap-2">
                <input value={newExpLabel} onChange={e => setNewExpLabel(e.target.value)} placeholder="Descrição"
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-secondary text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  onKeyDown={e => e.key === "Enter" && addExpense()} />
                <input value={newExpAmt} onChange={e => setNewExpAmt(e.target.value)} placeholder="R$ 0,00" type="number"
                  className="w-24 px-3 py-2 rounded-xl bg-secondary text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  onKeyDown={e => e.key === "Enter" && addExpense()} />
              </div>
              <button onClick={addExpense}
                className="w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                style={{ background: "var(--secondary)", color: "var(--primary)" }}>
                <Plus size={13} /> Adicionar despesa
              </button>
            </div>
          </div>
        </div>

        <PaymentsCard order={order} onUpdate={onUpdate} />

        {order.status !== "completed" && order.status !== "cancelled" && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Alterar status</h3>
            <div className="flex gap-2 flex-wrap">
              {order.status === "pending" && <ActionBtn label="Iniciar" color="#1D4ED8" bg="#DBEAFE" onClick={() => onUpdate({ ...order, status: "in_progress" })} />}
              {order.status === "in_progress" && <ActionBtn label="Concluir" color="#15803D" bg="#DCFCE7" onClick={() => onUpdate({ ...order, status: "completed" })} />}
              <ActionBtn label="Cancelar" color="#B91C1C" bg="#FEE2E2" onClick={() => onUpdate({ ...order, status: "cancelled" })} />
            </div>
          </div>
        )}
      </div>

      <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={addPhoto} />
    </div>
  );
}
