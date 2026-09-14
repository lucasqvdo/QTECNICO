import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Fingerprint, ArrowRight, ShieldCheck, ClipboardList, Users, Camera, BarChart3, Eye, EyeOff } from 'lucide-react';
import logoImg from '@/imports/ChatGPT_Image_8_de_jun._de_2026__11_15_09.png';
import { api } from '../api';

interface Props {
  email: string;
  password: string;
  error: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onLogin: () => void;
  onRegister: (name: string, email: string, password: string) => Promise<void>;
  onBiometricLogin: (email: string) => Promise<void>;
}

export default function SecureLoginScreen({
  email, password, error, onEmailChange, onPasswordChange, onLogin, onRegister, onBiometricLogin,
}: Props) {
  const [mode, setMode] = useState<'login' | 'register' | 'request' | 'code' | 'new-password'>('login');
  const [remember, setRemember] = useState(() => localStorage.getItem('qtecnico_remember') === 'true');
  const [showPass, setShowPass] = useState(false);
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [resetEmail, setResetEmail] = useState(email);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  useEffect(() => {
    localStorage.removeItem('qtecnico_pass');
    if (localStorage.getItem('qtecnico_remember') === 'true') {
      const savedEmail = localStorage.getItem('qtecnico_email') || '';
      if (savedEmail) onEmailChange(savedEmail);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearFeedback = () => { setFormError(''); setMessage(''); };

  const handleLogin = () => {
    clearFeedback();
    if (remember) {
      localStorage.setItem('qtecnico_remember', 'true');
      localStorage.setItem('qtecnico_email', email.trim());
      localStorage.removeItem('qtecnico_pass');
    } else {
      localStorage.removeItem('qtecnico_remember');
      localStorage.removeItem('qtecnico_email');
      localStorage.removeItem('qtecnico_pass');
    }
    onLogin();
  };

  const handleBiometric = async () => {
    clearFeedback();
    if (!email.trim()) { setFormError('Informe seu e-mail para usar a Passkey.'); return; }
    setBiometricLoading(true);
    try { await onBiometricLogin(email.trim()); }
    catch (e: any) { setFormError(e?.message || 'Não foi possível entrar com a Passkey.'); }
    finally { setBiometricLoading(false); }
  };

  const handleRegister = async () => {
    clearFeedback();
    if (!regName.trim() || !regEmail.trim()) return setFormError('Informe nome e e-mail.');
    if (regPass.length < 8) return setFormError('A senha deve ter no mínimo 8 caracteres.');
    if (regPass !== regConfirm) return setFormError('As senhas não coincidem.');
    setLoading(true);
    try { await onRegister(regName.trim(), regEmail.trim(), regPass); }
    catch (e: any) { setFormError(e?.message || 'Erro ao criar conta.'); }
    finally { setLoading(false); }
  };

  const handleResetRequest = async () => {
    clearFeedback();
    const target = resetEmail.trim().toLowerCase();
    if (!target) return setFormError('Informe o e-mail da conta.');
    setLoading(true);
    try {
      const result = await api.requestPasswordReset(target);
      setMessage(result.message);
      setResetEmail(target);
      setMode('code');
    } catch (e: any) {
      setFormError(e?.message || 'Não foi possível solicitar a recuperação.');
    } finally { setLoading(false); }
  };

  const handleVerifyCode = () => {
    clearFeedback();
    if (!/^\d{6}$/.test(resetCode.trim())) return setFormError('Informe o código de 6 dígitos recebido por e-mail.');
    setMode('new-password');
  };

  const handleResetPassword = async () => {
    clearFeedback();
    if (!/^\d{6}$/.test(resetCode.trim())) return setFormError('Informe o código de 6 dígitos recebido por e-mail.');
    if (newPassword.length < 8) return setFormError('A nova senha deve ter no mínimo 8 caracteres.');
    if (newPassword !== newPasswordConfirm) return setFormError('As senhas não coincidem.');
    setLoading(true);
    try {
      await api.resetPassword(resetEmail.trim().toLowerCase(), resetCode.trim(), newPassword);
      setMessage('Senha redefinida com sucesso. Você já pode entrar com a nova senha.');
      setNewPassword(''); setNewPasswordConfirm(''); setResetCode('');
      setMode('login');
      onEmailChange(resetEmail.trim().toLowerCase());
    } catch (e: any) {
      setFormError(e?.message || 'Não foi possível redefinir a senha.');
    } finally { setLoading(false); }
  };

  const backToLogin = () => { clearFeedback(); setMode('login'); setResetCode(''); setNewPassword(''); setNewPasswordConfirm(''); };
  const inputCls = 'w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 text-sm outline-none focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-400 transition-all';
  const featureCards = [
    { icon: ClipboardList, title: 'Ordens de serviço', text: 'Organize chamados, prioridades e status em um só lugar.' },
    { icon: Users, title: 'Clientes e técnicos', text: 'Tenha sua operação e equipe sempre conectadas.' },
    { icon: Camera, title: 'Evidências do atendimento', text: 'Registre fotos e informações diretamente no serviço.' },
    { icon: BarChart3, title: 'Visão financeira', text: 'Acompanhe valores, custos, pagamentos e resultados.' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="relative min-h-screen overflow-hidden">
        <div className="absolute -left-40 -top-40 w-96 h-96 rounded-full bg-cyan-400/10 blur-3xl pointer-events-none" />
        <div className="absolute -right-32 bottom-0 w-[30rem] h-[30rem] rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 mx-auto max-w-7xl min-h-screen px-5 py-5 sm:px-8 lg:px-10 lg:py-7 flex flex-col">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logoImg} alt="QTECNICO" className="w-10 h-10 object-contain" />
              <div>
                <div className="text-xl font-extrabold tracking-tight">Q<span className="text-cyan-400">TECNICO</span></div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">Gestão técnica</div>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-white/50"><ShieldCheck size={15} className="text-cyan-400" /> Ambiente seguro</div>
          </header>

          {mode === 'login' ? (
            <main className="flex-1 grid lg:grid-cols-[1.15fr_0.85fr] gap-10 xl:gap-20 items-center py-8 lg:py-10">
              <section className="max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3.5 py-2 text-xs font-medium text-cyan-300 mb-5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> Gestão inteligente para operações técnicas
                </div>
                <h1 className="text-4xl sm:text-5xl xl:text-6xl font-extrabold leading-[1.04] tracking-tight mb-5">
                  Sua operação técnica <span className="text-cyan-400">sob controle.</span>
                </h1>
                <p className="text-base sm:text-lg leading-7 text-white/55 max-w-xl mb-7">
                  Gerencie ordens de serviço, clientes, técnicos, atendimentos, evidências e financeiro em uma única plataforma criada para quem precisa executar e acompanhar o trabalho de verdade.
                </p>
                <div className="flex flex-wrap gap-3 mb-8">
                  <button type="button" onClick={() => { clearFeedback(); setMode('register'); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3.5 text-sm font-bold text-slate-950 hover:bg-cyan-300 transition-colors shadow-lg shadow-cyan-400/10">
                    Experimentar o QTECNICO <ArrowRight size={17} />
                  </button>
                  <div className="inline-flex items-center rounded-xl border border-white/10 px-4 py-3.5 text-xs text-white/45">Feito para equipes em campo</div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3 max-w-2xl">
                  {featureCards.map(({ icon: Icon, title, text }) => (
                    <div key={title} className="rounded-2xl border border-white/8 bg-white/[0.035] p-4 backdrop-blur-sm">
                      <div className="w-9 h-9 rounded-xl bg-cyan-400/10 flex items-center justify-center mb-3"><Icon size={18} className="text-cyan-400" /></div>
                      <h2 className="text-sm font-bold mb-1">{title}</h2>
                      <p className="text-xs leading-5 text-white/40">{text}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="w-full max-w-md lg:justify-self-end">
                <div className="rounded-3xl bg-white p-6 sm:p-8 shadow-2xl shadow-black/30 text-slate-900 border border-white/10">
                  <div className="mb-6">
                    <div className="text-2xl font-extrabold tracking-tight">Bem-vindo de volta.</div>
                    <p className="text-sm text-slate-500 mt-1">Acesse sua conta para continuar.</p>
                  </div>
                  <LoginForm />
                </div>
              </section>
            </main>
          ) : (
            <main className="flex-1 flex items-center justify-center py-8">
              <section className="w-full max-w-md">
                <div className="rounded-3xl bg-white p-6 sm:p-8 shadow-2xl shadow-black/30 text-slate-900">
                  <div className="flex items-center gap-3 mb-6">
                    <img src={logoImg} alt="QTECNICO" className="w-11 h-11 object-contain" />
                    <div><div className="text-xl font-extrabold">Q<span className="text-cyan-500">TECNICO</span></div><div className="text-xs text-slate-400">Gestão de Ordens de Serviço</div></div>
                  </div>
                  {mode === 'register' && <RegisterForm />}
                  {mode === 'request' && <ResetRequestForm />}
                  {mode === 'code' && <CodeForm />}
                  {mode === 'new-password' && <NewPasswordForm />}
                </div>
              </section>
            </main>
          )}

          <footer className="pt-3 text-center text-[11px] text-white/25">QTECNICO · Gestão de operações técnicas</footer>
        </div>
      </div>
    </div>
  );

  function Feedback() {
    return <>
      {error && <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 text-red-600 text-xs"><AlertCircle size={14} />E-mail ou senha incorretos.</div>}
      {formError && <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 text-red-600 text-xs"><AlertCircle size={14} />{formError}</div>}
      {message && <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-green-50 text-green-700 text-xs"><CheckCircle2 size={14} />{message}</div>}
    </>;
  }

  function LoginForm() {
    return <div className="space-y-4">
      <label className="block text-xs font-semibold text-slate-600">E-mail<input type="email" value={email} onChange={e => onEmailChange(e.target.value)} placeholder="seu@email.com" className={`${inputCls} mt-1.5`} autoComplete="email" /></label>
      <label className="block text-xs font-semibold text-slate-600">Senha<div className="relative mt-1.5"><input type={showPass ? 'text' : 'password'} value={password} onChange={e => onPasswordChange(e.target.value)} placeholder="••••••••" className={`${inputCls} pr-11`} autoComplete="current-password" onKeyDown={e => e.key === 'Enter' && handleLogin()} /><button type="button" aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{showPass ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
      <Feedback />
      <button type="button" onClick={() => { const next = !remember; setRemember(next); if (!next) { localStorage.removeItem('qtecnico_remember'); localStorage.removeItem('qtecnico_email'); } }} className="flex items-center gap-2.5 text-xs text-slate-500"><span className="w-4 h-4 rounded border flex items-center justify-center" style={{ borderColor: remember ? '#0891b2' : '#CBD5E1', background: remember ? '#0891b2' : 'transparent' }}>{remember && <span className="text-white text-[10px]">✓</span>}</span>Lembrar meu e-mail</button>
      <button onClick={handleLogin} className="w-full py-3.5 rounded-xl font-bold text-sm bg-slate-950 text-white hover:bg-slate-800 transition-colors">Entrar</button>
      <button onClick={handleBiometric} disabled={biometricLoading} className="w-full py-3.5 rounded-xl font-bold text-sm border border-cyan-500 text-slate-800 hover:bg-cyan-50 flex items-center justify-center gap-2 disabled:opacity-60"><Fingerprint size={18} className="text-cyan-600" />{biometricLoading ? 'Validando...' : 'Entrar com Passkey'}</button>
      <div className="flex items-center justify-between pt-1"><button onClick={() => { clearFeedback(); setResetEmail(email); setMode('request'); }} className="text-xs font-semibold text-slate-500 hover:text-slate-900">Esqueci minha senha</button><button onClick={() => { clearFeedback(); setMode('register'); }} className="text-xs font-bold text-cyan-600 hover:text-cyan-700">Criar conta</button></div>
    </div>;
  }

  function RegisterForm() {
    return <><h1 className="text-2xl font-extrabold mb-1">Experimente o QTECNICO</h1><p className="text-sm text-slate-500 mb-6">Crie sua conta e comece a organizar sua operação.</p><div className="space-y-4"><input value={regName} onChange={e => setRegName(e.target.value)} placeholder="Nome completo" className={inputCls} autoComplete="name" /><input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="seu@email.com" className={inputCls} autoComplete="email" /><input type="password" value={regPass} onChange={e => setRegPass(e.target.value)} placeholder="Senha — mínimo 8 caracteres" className={inputCls} autoComplete="new-password" /><input type="password" value={regConfirm} onChange={e => setRegConfirm(e.target.value)} placeholder="Confirmar senha" className={inputCls} autoComplete="new-password" onKeyDown={e => e.key === 'Enter' && handleRegister()} /><Feedback /><button onClick={handleRegister} disabled={loading} className="w-full py-3.5 rounded-xl font-bold text-sm bg-slate-950 text-white disabled:opacity-60">{loading ? 'Criando conta...' : 'Criar minha conta'}</button><button onClick={backToLogin} className="w-full py-3 rounded-xl font-semibold text-sm border border-slate-200 text-slate-600">Voltar para o login</button></div></>;
  }

  function ResetRequestForm() {
    return <><h1 className="text-2xl font-extrabold mb-1">Recuperar senha</h1><p className="text-sm text-slate-500 mb-6">Informe seu e-mail. Se a conta existir, enviaremos um código.</p><div className="space-y-4"><input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="seu@email.com" className={inputCls} onKeyDown={e => e.key === 'Enter' && handleResetRequest()} /><Feedback /><button onClick={handleResetRequest} disabled={loading} className="w-full py-3.5 rounded-xl font-bold text-sm bg-slate-950 text-white disabled:opacity-60">{loading ? 'Enviando...' : 'Enviar código'}</button><button onClick={backToLogin} className="w-full py-3 rounded-xl font-semibold text-sm border border-slate-200 text-slate-600">Voltar</button></div></>;
  }

  function CodeForm() {
    return <><h1 className="text-2xl font-extrabold mb-1">Confirmar código</h1><p className="text-sm text-slate-500 mb-6">{message || 'Digite o código recebido por e-mail.'}</p><div className="space-y-4"><input inputMode="numeric" maxLength={6} value={resetCode} onChange={e => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" className={inputCls} /><Feedback /><button onClick={handleVerifyCode} className="w-full py-3.5 rounded-xl font-bold text-sm bg-slate-950 text-white">Continuar</button><button onClick={backToLogin} className="w-full py-3 rounded-xl font-semibold text-sm border border-slate-200 text-slate-600">Voltar</button></div></>;
  }

  function NewPasswordForm() {
    return <><h1 className="text-2xl font-extrabold mb-1">Definir nova senha</h1><p className="text-sm text-slate-500 mb-6">Código válido por 15 minutos e de uso único.</p><div className="space-y-4"><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Nova senha — mínimo 8 caracteres" className={inputCls} autoComplete="new-password" /><input type="password" value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)} placeholder="Confirmar nova senha" className={inputCls} autoComplete="new-password" /><Feedback /><button onClick={handleResetPassword} disabled={loading} className="w-full py-3.5 rounded-xl font-bold text-sm bg-slate-950 text-white disabled:opacity-60">{loading ? 'Salvando...' : 'Salvar nova senha'}</button><button onClick={() => setMode('code')} className="w-full py-3 rounded-xl font-semibold text-sm border border-slate-200 text-slate-600">Voltar</button></div></>;
  }
}
