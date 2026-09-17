import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CloudOff, RefreshCw, Wifi, WifiOff, X } from 'lucide-react';
import { api } from '../api';

type State = 'online' | 'offline' | 'syncing' | 'error';

function formatTime(value: Date | null) {
  return value ? value.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
}

export default function ConnectivityStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [state, setState] = useState<State>(() => navigator.onLine ? 'syncing' : 'offline');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  const refresh = async () => {
    if (!navigator.onLine) {
      setOnline(false);
      setState('offline');
      return;
    }
    setOnline(true);
    setState('syncing');
    setError('');
    try {
      await api.getMe();
      setLastSync(new Date());
      setState('online');
    } catch (e) {
      setState('error');
      setError(e instanceof Error ? e.message : 'Não foi possível confirmar a conexão com o servidor.');
    }
  };

  useEffect(() => {
    const onOnline = () => { setOnline(true); void refresh(); };
    const onOffline = () => { setOnline(false); setState('offline'); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.clearInterval(timer);
    };
  }, []);

  const meta = useMemo(() => {
    if (state === 'offline') return { label: 'Offline', Icon: WifiOff, className: 'border-red-200 bg-red-50 text-red-700' };
    if (state === 'syncing') return { label: 'Sincronizando…', Icon: RefreshCw, className: 'border-amber-200 bg-amber-50 text-amber-700' };
    if (state === 'error') return { label: 'Erro de sincronização', Icon: CloudOff, className: 'border-red-200 bg-red-50 text-red-700' };
    return { label: 'Online · Atualizado', Icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
  }, [state]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition hover:brightness-95 ${meta.className}`}
        title="Status da conexão e sincronização"
      >
        <meta.Icon size={14} className={state === 'syncing' ? 'animate-spin' : ''} />
        <span className="hidden sm:inline">{meta.label}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-72 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900">Status da conexão</p>
              <p className="mt-0.5 text-xs text-slate-500">Estado atual do QTECNICO</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Fechar"><X size={16} /></button>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between"><span className="text-slate-500">Internet</span><span className={`font-semibold ${online ? 'text-emerald-600' : 'text-red-600'}`}>{online ? 'Conectada' : 'Desconectada'}</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-500">Servidor</span><span className={`font-semibold ${state === 'error' || state === 'offline' ? 'text-red-600' : 'text-emerald-600'}`}>{state === 'error' ? 'Indisponível' : state === 'offline' ? 'Sem conexão' : 'Disponível'}</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-500">Última confirmação</span><span className="font-semibold text-slate-700">{formatTime(lastSync)}</span></div>
          </div>

          {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs leading-relaxed text-red-700">{error}</p>}

          <button type="button" onClick={() => void refresh()} disabled={state === 'syncing'} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            <Wifi size={14} /> Verificar conexão
          </button>
        </div>
      )}
    </div>
  );
}
