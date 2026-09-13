import { useMemo, useState } from 'react';
import { CalendarClock, Check, Clock3, Edit3, Plus, Trash2, UserRound, X } from 'lucide-react';
import { api } from './api';
import type { Attendance, ServiceOrder } from './types';

type Props = {
  orders: ServiceOrder[];
  onOrdersChange: (orders: ServiceOrder[]) => void;
  onBack: () => void;
};

const toLocalInput = (value: string) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromLocalInput = (value: string) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
};

const duration = (start: string, end: string) => {
  const seconds = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  return seconds;
};

const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Number(seconds || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  return h ? `${h}h ${m}min` : `${m}min`;
};

const formatDateTime = (value: string) => value ? new Date(value).toLocaleString('pt-BR') : '—';

export default function AttendanceManagement({ orders, onOrdersChange, onBack }: Props) {
  const [orderId, setOrderId] = useState(orders[0]?.id || '');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const order = useMemo(() => orders.find((item) => item.id === orderId) || orders[0], [orders, orderId]);
  const attendances = useMemo(() => [...(order?.attendances || [])].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()), [order]);

  const resetForm = () => {
    setEditingId(null);
    setStart('');
    setEnd('');
    setDescription('');
    setError('');
  };

  const editAttendance = (attendance: Attendance) => {
    setEditingId(attendance.id);
    setStart(toLocalInput(attendance.startTime));
    setEnd(toLocalInput(attendance.endTime));
    setDescription(attendance.description || '');
    setError('');
  };

  const newAttendance = () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    setEditingId(null);
    setStart(toLocalInput(oneHourAgo.toISOString()));
    setEnd(toLocalInput(now.toISOString()));
    setDescription('');
    setError('');
  };

  const save = async () => {
    if (!order) return;
    const startIso = fromLocalInput(start);
    const endIso = fromLocalInput(end);
    if (!startIso || !endIso) {
      setError('Informe a data e horário de início e término.');
      return;
    }
    if (new Date(endIso).getTime() < new Date(startIso).getTime()) {
      setError('O término não pode ser anterior ao início.');
      return;
    }

    const existing = order.attendances || [];
    const attendance: Attendance = {
      id: editingId || `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      startTime: startIso,
      endTime: endIso,
      durationSeconds: duration(startIso, endIso),
      description: description.trim(),
      photos: editingId ? (existing.find((item) => item.id === editingId)?.photos || []) : [],
    };
    const nextAttendances = editingId
      ? existing.map((item) => item.id === editingId ? attendance : item)
      : [...existing, attendance];

    setSaving(true);
    setError('');
    try {
      const saved = await api.updateOrder(order.id, { ...order, attendances: nextAttendances });
      onOrdersChange(orders.map((item) => item.id === saved.id ? saved : item));
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o atendimento.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (attendance: Attendance) => {
    if (!order) return;
    if (!window.confirm('Excluir este atendimento? As fotos vinculadas a ele também deixarão de aparecer nesta OS.')) return;
    setSaving(true);
    setError('');
    try {
      const nextAttendances = (order.attendances || []).filter((item) => item.id !== attendance.id);
      const saved = await api.updateOrder(order.id, { ...order, attendances: nextAttendances });
      onOrdersChange(orders.map((item) => item.id === saved.id ? saved : item));
      if (editingId === attendance.id) resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir o atendimento.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="p-4 sm:p-6 lg:p-8">
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <button onClick={onBack} className="mb-2 text-sm font-semibold text-cyan-600">← Dashboard</button>
        <h1 className="text-3xl font-bold tracking-tight">Atendimentos</h1>
        <p className="mt-1 text-sm text-slate-500">Corrija datas e horários ou registre atendimentos que ficaram fora do lançamento.</p>
      </div>
      <button onClick={newAttendance} disabled={!order || saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Plus size={17} /> Novo atendimento</button>
    </div>

    {!orders.length ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Nenhuma ordem de serviço disponível.</div> : <>
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Ordem de Serviço</label>
        <select value={order?.id || ''} onChange={(e) => { setOrderId(e.target.value); resetForm(); }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm sm:max-w-xl">
          {orders.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.client} · {item.type || 'Serviço não informado'}</option>)}
        </select>
      </div>

      {order && <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="flex items-center gap-2 font-bold"><Clock3 size={18} /> Histórico</h2><p className="mt-1 text-xs text-slate-500">{order.client} · {order.address || 'Endereço não informado'}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{attendances.length}</span></div>
          {!attendances.length ? <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">Nenhum atendimento registrado. Use “Novo atendimento”.</div> : <div className="space-y-3">
            {attendances.map((attendance) => <article key={attendance.id} className={`rounded-xl border p-4 ${editingId === attendance.id ? 'border-cyan-300 bg-cyan-50/30' : 'border-slate-200'}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold">{formatDateTime(attendance.startTime)}</p><p className="mt-1 text-xs text-slate-500">Término: {formatDateTime(attendance.endTime)} · Duração: {formatDuration(attendance.durationSeconds)}</p></div><div className="flex gap-2"><button onClick={() => editAttendance(attendance)} disabled={saving} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold hover:bg-white"><Edit3 size={14} /> Editar</button><button onClick={() => void remove(attendance)} disabled={saving} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50" aria-label="Excluir atendimento"><Trash2 size={14} /></button></div></div>
              {attendance.description && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{attendance.description}</p>}
              {!!attendance.photos?.length && <p className="mt-3 text-xs font-medium text-slate-500">📷 {attendance.photos.length} foto{attendance.photos.length === 1 ? '' : 's'} vinculada{attendance.photos.length === 1 ? '' : 's'}</p>}
            </article>)}
          </div>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="flex items-center gap-2 font-bold"><CalendarClock size={18} /> {editingId ? 'Editar atendimento' : 'Novo atendimento'}</h2><p className="mt-1 text-xs text-slate-500">O tempo é recalculado automaticamente.</p></div>{(start || end || description) && <button onClick={resetForm} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Limpar"><X size={18} /></button>}</div>
          <div className="space-y-4">
            <div><label className="mb-1.5 block text-xs font-semibold text-slate-600">Início</label><input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" /></div>
            <div><label className="mb-1.5 block text-xs font-semibold text-slate-600">Término</label><input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" /></div>
            <div><label className="mb-1.5 block text-xs font-semibold text-slate-600">Descrição do atendimento</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder="O que foi realizado, diagnóstico, observações..." className="w-full resize-none rounded-xl border border-slate-200 px-3 py-3 text-sm" /></div>
            {start && end && <div className="rounded-xl bg-slate-50 p-3 text-sm"><span className="text-slate-500">Duração calculada: </span><strong>{formatDuration(Math.max(0, duration(fromLocalInput(start), fromLocalInput(end))))}</strong></div>}
            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}
            <button onClick={() => void save()} disabled={saving || !start || !end} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Check size={17} /> {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Registrar atendimento'}</button>
          </div>
        </section>
      </div>}
    </>}
  </div>;
}
