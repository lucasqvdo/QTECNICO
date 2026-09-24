import { useEffect, useState, useRef } from 'react';
import { api, type TrialInfo } from './api';

export default function TrialBanner({ onChoosePlan }: { onChoosePlan?: () => void }) {
  const [trial, setTrial] = useState<TrialInfo | null>(null);
  const effectivePlan = useRef<string | null>(null);
  useEffect(() => {
    let mounted = true;
    const refresh = () => { void api.getTrial().then(data => { if (mounted) { setTrial(data.trial); if (effectivePlan.current !== null && effectivePlan.current !== data.effectivePlanKey) window.dispatchEvent(new Event('qtecnico-plan-changed')); effectivePlan.current = data.effectivePlanKey; } }).catch(() => undefined); };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => { mounted = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  if (!trial || trial.status === 'not_started') return null;
  const ending = !trial.active || trial.daysRemaining <= 3;
  return <aside aria-label="Período de degustação" className={`mx-4 my-3 rounded-xl border px-4 py-3 text-sm ${ending ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-cyan-100 bg-cyan-50 text-cyan-950'}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-medium">{trial.active ? 'Você está experimentando o QTECNICO Business' : 'Seu período de degustação Business terminou'}</p>
        <p className="mt-1">{trial.active ? `${trial.daysRemaining} ${trial.daysRemaining === 1 ? 'dia restante' : 'dias restantes'} · Sem cartão e sem cobrança automática.` : 'Seus dados continuam salvos. O acesso segue o plano contratado.'}</p>
        {ending && trial.active && <p className="mt-1">Escolha o plano ideal para continuar com os recursos que precisa.</p>}
      </div>
      {onChoosePlan && <button type="button" onClick={onChoosePlan} className="rounded-lg border border-current px-3 py-2 font-semibold">Escolher plano</button>}
    </div>
  </aside>;
}
