import { useMemo, useRef, useState } from 'react';
import { CalendarClock, Check, Clock3, Edit3, FileText, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { api } from './api';
import { exportClientPDF, exportAdminPDF } from './exportPDF';
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

const duration = (start: string, end: string) => Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));

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
  const [modalOpen, setModalOpen] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [photoBusyId, setPhotoBusyId] = useState<string | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [error, setError] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const targetAttendanceRef = useRef<string | null>(null);

  const order = useMemo(() => orders.find((item) => item.id === orderId) || orders[0], [orders, orderId]);
  const attendances = useMemo(() => [...(order?.attendances || [])].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()), [order]);

  const resetForm = () => {
    setEditingId(null);
    setStart('');
    setEnd('');
    setDescription('');
    setPendingPhotos([]);
    setError('');
    setModalOpen(false);
  };

  const editAttendance = (attendance: Attendance) => {
    setEditingId(attendance.id);
    setStart(toLocalInput(attendance.startTime));
    setEnd(toLocalInput(attendance.endTime));
    setDescription(attendance.description || '');
    setPendingPhotos([]);
    setError('');
    setModalOpen(true);
  };

  const newAttendance = () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    setEditingId(null);
    setStart(toLocalInput(oneHourAgo.toISOString()));
    setEnd(toLocalInput(now.toISOString()));
    setDescription('');
    setPendingPhotos([]);
    setError('');
    setModalOpen(true);
  };

  const choosePhoto = (attendanceId: string | null) => {
    targetAttendanceRef.current = attendanceId;
    photoInputRef.current?.click();
  };

  const handlePhotoSelection = async (files: FileList | null) => {
    const selected = Array.from(files || []).filter(file => file.type.startsWith('image/'));
    if (!selected.length || !order) return;
    const attendanceId = targetAttendanceRef.current;
    if (!attendanceId) {
      setPendingPhotos(current => [...current, ...selected]);
      return;
    }

    setPhotoBusyId(attendanceId);
    setError('');
    try {
      const added = [] as Attendance['photos'];
      for (const file of selected) {
        const result = await api.addAttendancePhoto(order.id, attendanceId, file);
        added.push(result.photo);
      }
      if (added.length) {
        const nextOrders = orders.map(item => item.id === order.id
          ? { ...item, attendances: (item.attendances || []).map(att => att.id === attendanceId ? { ...att, photos: [...(att.photos || []), ...added] } : att) }
          : item);
        onOrdersChange(nextOrders);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível adicionar a foto.');
    } finally {
      setPhotoBusyId(null);
      targetAttendanceRef.current = null;
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const removePhoto = async (attendanceId: string, photoId: string) => {
    if (!order || !window.confirm('Excluir esta foto do atendimento?')) return;
    setPhotoBusyId(attendanceId);
    setError('');
    try {
      await api.deleteAttendancePhoto(order.id, attendanceId, photoId);
      onOrdersChange(orders.map(item => item.id === order.id
        ? { ...item, attendances: (item.attendances || []).map(att => att.id === attendanceId ? { ...att, photos: (att.photos || []).filter(photo => photo.id !== photoId) } : att) }
        : item));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir a foto.');
    } finally {
      setPhotoBusyId(null);
    }
  };

  const save = async () => {
    if (!order) return;
    const startIso = fromLocalInput(start);
    const endIso = fromLocalInput(end);
    if (!startIso || !endIso) return setError('Informe a data e horário de início e término.');
    if (new Date(endIso).getTime() < new Date(startIso).getTime()) return setError('O término não pode ser anterior ao início.');

    const existing = order.attendances || [];
    const attendance: Attendance = {
      id: editingId || `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      startTime: startIso,
      endTime: endIso,
      durationSeconds: duration(startIso, endIso),
      description: description.trim(),
      photos: editingId ? (existing.find(item => item.id === editingId)?.photos || []) : [],
    };
    const nextAttendances = editingId ? existing.map(item => item.id === editingId ? attendance : item) : [...existing, attendance];

    setSaving(true);
    setError('');
    try {
      const saved = await api.updateOrder(order.id, { ...order, attendances: nextAttendances });
      let finalOrder = saved;
      if (!editingId && pendingPhotos.length) {
        const added = [] as Attendance['photos'];
        for (const file of pendingPhotos) {
          const result = await api.addAttendancePhoto(saved.id, attendance.id, file);
          added.push(result.photo);
        }
        finalOrder = { ...saved, attendances: (saved.attendances || []).map(att => att.id === attendance.id ? { ...att, photos: [...(att.photos || []), ...added] } : att) };
      }
      onOrdersChange(orders.map(item => item.id === finalOrder.id ? finalOrder : item));
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o atendimento.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (attendance: Attendance) => {
    if (!order || !window.confirm('Excluir este atendimento? As fotos vinculadas a ele também deixarão de aparecer nesta OS.')) return;
    setSaving(true);
    setError('');
    try {
      const nextAttendances = (order.attendances || []).filter(item => item.id !== attendance.id);
      const saved = await api.updateOrder(order.id, { ...order, attendances: nextAttendances });
      onOrdersChange(orders.map(item => item.id === saved.id ? saved : item));
      if (editingId === attendance.id) resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir o atendimento.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="p-4 sm:p-6 lg:p-8">
    <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => void handlePhotoSelection(e.target.files)} />
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><button onClick={onBack} className="mb-2 text-sm font-semibold text-cyan-600">← Dashboard</button><h1 className="text-3xl font-bold tracking-tight">Atendimentos</h1><p className="mt-1 text-sm text-slate-500">Registre, edite e complemente os atendimentos da OS.</p></div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => order && void exportClientPDF(order)} disabled={!order || saving} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-white px-4 py-3 text-sm font-semibold text-cyan-700 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"><FileText size={17} /> PDF cliente</button><button onClick={() => order && void exportAdminPDF(order)} disabled={!order || saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"><FileText size={17} /> PDF administrativo</button>
        <button onClick={newAttendance} disabled={!order || saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Plus size={17} /> Novo atendimento</button>
      </div>
    </div>

    {!orders.length ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Nenhuma ordem de serviço disponível.</div> : <>
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Ordem de Serviço</label><select value={order?.id || ''} onChange={e => { setOrderId(e.target.value); resetForm(); }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm sm:max-w-xl">{orders.map(item => <option key={item.id} value={item.id}>{item.id} · {item.client} · {item.type || 'Serviço não informado'}</option>)}</select></div>

      {order && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="flex items-center gap-2 font-bold"><Clock3 size={18} /> Histórico</h2><p className="mt-1 text-xs text-slate-500">{order.client} · {order.address || 'Endereço não informado'}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{attendances.length}</span></div>
        {!attendances.length ? <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">Nenhum atendimento registrado. Use “Novo atendimento”.</div> : <div className="space-y-3">{attendances.map(attendance => <article key={attendance.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold">{formatDateTime(attendance.startTime)}</p><p className="mt-1 text-xs text-slate-500">Término: {formatDateTime(attendance.endTime)} · Duração: {formatDuration(attendance.durationSeconds)}</p></div><div className="flex gap-2"><button onClick={() => editAttendance(attendance)} disabled={saving} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold hover:bg-white"><Edit3 size={14} /> Editar</button><button onClick={() => choosePhoto(attendance.id)} disabled={saving || photoBusyId === attendance.id} className="inline-flex items-center gap-1 rounded-lg border border-cyan-200 px-2.5 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-50"><ImagePlus size={14} /> {photoBusyId === attendance.id ? 'Enviando...' : 'Adicionar foto'}</button><button onClick={() => void remove(attendance)} disabled={saving || !!photoBusyId} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50" aria-label="Excluir atendimento"><Trash2 size={14} /></button></div></div>
          {attendance.description && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{attendance.description}</p>}
          <div className="mt-3 flex flex-wrap gap-2">{(attendance.photos || []).map(photo => <div key={photo.id} className="group relative"><img src={photo.dataUrl} alt={photo.name || 'Foto do atendimento'} className="h-20 w-20 rounded-lg border border-slate-200 object-cover" /><button onClick={() => void removePhoto(attendance.id, photo.id)} disabled={photoBusyId === attendance.id} className="absolute right-1 top-1 hidden rounded-full bg-red-600 p-1 text-white group-hover:block" aria-label="Excluir foto"><X size={12} /></button></div>)}<button onClick={() => choosePhoto(attendance.id)} disabled={saving || photoBusyId === attendance.id} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-slate-500 hover:border-cyan-400 hover:text-cyan-700"><ImagePlus size={18} /><span className="text-[11px] font-semibold">Adicionar foto</span></button></div>
        </article>)}</div>}
      </section>}
    </>}

    {modalOpen && order && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="attendance-modal-title" onMouseDown={e => { if (e.target === e.currentTarget && !saving) resetForm(); }}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div><h2 id="attendance-modal-title" className="flex items-center gap-2 text-lg font-bold"><CalendarClock size={19} /> {editingId ? 'Editar atendimento' : 'Novo atendimento'}</h2><p className="mt-1 text-xs text-slate-500">{order.id} · {order.client}</p></div>
          <button onClick={resetForm} disabled={saving} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50" aria-label="Fechar"><X size={20} /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-1.5 block text-xs font-semibold text-slate-600">Início</label><input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" /></div><div><label className="mb-1.5 block text-xs font-semibold text-slate-600">Término</label><input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" /></div></div>
          <div><label className="mb-1.5 block text-xs font-semibold text-slate-600">Descrição do atendimento</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} placeholder="O que foi realizado, diagnóstico, observações..." className="w-full resize-none rounded-xl border border-slate-200 px-3 py-3 text-sm" /></div>
          <div><div className="mb-2 flex items-center justify-between"><label className="text-xs font-semibold text-slate-600">Fotos do atendimento</label><button type="button" onClick={() => choosePhoto(null)} disabled={saving || !!editingId} className="inline-flex items-center gap-1 rounded-lg border border-cyan-200 px-2.5 py-1.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-50 disabled:opacity-50"><ImagePlus size={14} /> Adicionar foto</button></div>{pendingPhotos.length > 0 && <div className="flex flex-wrap gap-2">{pendingPhotos.map((file, index) => <div key={`${file.name}-${index}`} className="relative"><img src={URL.createObjectURL(file)} alt={file.name} className="h-20 w-20 rounded-lg border border-slate-200 object-cover" /></div>)}</div>}{editingId && <p className="text-xs text-slate-500">Para este atendimento, use o botão “Adicionar foto” no histórico para incluir novas imagens.</p>}</div>
          {start && end && <div className="rounded-xl bg-slate-50 p-3 text-sm"><span className="text-slate-500">Duração calculada: </span><strong>{formatDuration(duration(fromLocalInput(start), fromLocalInput(end)))}</strong></div>}
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}
        </div>
        <div className="sticky bottom-0 flex gap-2 border-t border-slate-200 bg-white p-5"><button onClick={resetForm} disabled={saving} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button><button onClick={() => void save()} disabled={saving || !start || !end} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Check size={17} /> {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Registrar atendimento'}</button></div>
      </div>
    </div>}
  </div>;
}
