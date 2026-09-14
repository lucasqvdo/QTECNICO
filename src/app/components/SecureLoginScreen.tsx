import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Fingerprint } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
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
    if (!email.trim()) { setFormError('Informe seu e-mail para usar a biometria.'); return; }
    setBiometricLoading(true);
    try { await onBiometricLogin(email.trim()); }
    catch (e: any) { setFormError(e?.message || 'Não foi possível entrar com a biometria.'); }
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
  const inputCls = 'w-full px-4 py-3 rounded-xl bg-secondary text-foreground placeholder-muted-foreground text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all';

  return (
    <div className="min-h-screen bg-primary flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex-1 flex flex-col justify-end px-6 pb-0">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-1">{mode === 'login' ? 'Bem-vindo!' : mode === 'register' ? 'Criar conta' : 'Recuperar acesso'}</h1>
          <p className="text-white/50 text-sm">{mode === 'login' ? 'Acesse sua conta para continuar.' : 'Recupere o acesso com segurança.'}</p>
        </div>
      </div>
      <div className="bg-background rounded-t-3xl px-6 pt-8 pb-10 overflow-y-auto">
        <div className="flex flex-col items-center mb-6">
          <ImageWithFallback src={logoImg} alt="QTecnico logo" className="w-20 h-20 object-contain" />
          <h2 className="text-2xl font-bold tracking-tight mt-2" style={{ color: 'var(--primary)' }}>Q<span style={{ color: 'var(--accent)' }}>Tecnico</span></h2>
          <p className="text-xs text-muted-foreground mt-0.5">Gestão de Ordens de Serviço</p>
        </div>

        {mode === 'login' && <>
          <p className="text-base font-semibold text-foreground mb-4">Entrar na sua conta</p>
          <div className="space-y-4">
            <input type="email" value={email} onChange={e => onEmailChange(e.target.value)} placeholder="seu@email.com" className={inputCls} />
            <div className="relative"><input type={showPass ? 'text' : 'password'} value={password} onChange={e => onPasswordChange(e.target.value)} placeholder="••••••••" className={`${inputCls} pr-12`} onKeyDown={e => e.key === 'Enter' && handleLogin()} /><button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">{showPass ? 'Ocultar' : 'Ver'}</button></div>
            {error && <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-sm"><AlertCircle size={14} />E-mail ou senha incorretos.</div>}
            {formError && <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-sm"><AlertCircle size={14} />{formError}</div>}
            {message && <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 text-green-700 text-sm"><CheckCircle2 size={14} />{message}</div>}
            <button type="button" onClick={() => { const next = !remember; setRemember(next); if (!next) { localStorage.removeItem('qtecnico_remember'); localStorage.removeItem('qtecnico_email'); localStorage.removeItem('qtecnico_pass'); } }} className="flex items-center gap-3 w-full text-sm text-foreground"><span className="w-5 h-5 rounded-md border-2 flex items-center justify-center" style={{ borderColor: remember ? 'var(--primary)' : 'var(--border)', background: remember ? 'var(--primary)' : 'transparent' }}>{remember && <span className="text-white text-xs">✓</span>}</span>Lembrar meu e-mail</button>
            <button onClick={handleLogin} className="w-full py-3.5 rounded-xl font-semibold text-sm" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>Entrar</button>
            <button onClick={handleBiometric} disabled={biometricLoading} className="w-full py-3 rounded-xl font-semibold text-sm border-2 flex items-center justify-center gap-2 disabled:opacity-60" style={{ borderColor: 'var(--accent)', color: 'var(--primary)' }}><Fingerprint size={18} />{biometricLoading ? 'Validando...' : 'Entrar com biometria'}</button>
            <button onClick={() => { clearFeedback(); setResetEmail(email); setMode('request'); }} className="w-full py-2.5 rounded-xl font-semibold text-sm" style={{ color: 'var(--primary)' }}>Esqueci minha senha</button>
            <button onClick={() => { clearFeedback(); setMode('register'); }} className="w-full py-3 rounded-xl font-semibold text-sm border-2" style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}>Criar conta</button>
          </div>
        </>}

        {mode === 'register' && <>
          <p className="text-base font-semibold text-foreground mb-4">Cadastrar nova conta</p>
          <div className="space-y-4">
            <input value={regName} onChange={e => setRegName(e.target.value)} placeholder="Nome completo" className={inputCls} />
            <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="seu@email.com" className={inputCls} />
            <input type="password" value={regPass} onChange={e => setRegPass(e.target.value)} placeholder="Senha — mínimo 8 caracteres" className={inputCls} />
            <input type="password" value={regConfirm} onChange={e => setRegConfirm(e.target.value)} placeholder="Confirmar senha" className={inputCls} onKeyDown={e => e.key === 'Enter' && handleRegister()} />
            {formError && <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-sm"><AlertCircle size={14} />{formError}</div>}
            <button onClick={handleRegister} disabled={loading} className="w-full py-3.5 rounded-xl font-semibold text-sm disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>{loading ? 'Criando conta...' : 'Criar conta'}</button>
            <button onClick={backToLogin} className="w-full py-3 rounded-xl font-semibold text-sm border-2" style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}>Voltar para o login</button>
          </div>
        </>}

        {mode === 'request' && <>
          <p className="text-base font-semibold text-foreground mb-2">Recuperar senha</p><p className="text-sm text-muted-foreground mb-4">Informe seu e-mail. Se a conta existir, enviaremos um código.</p>
          <div className="space-y-4"><input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="seu@email.com" className={inputCls} onKeyDown={e => e.key === 'Enter' && handleResetRequest()} />
            {formError && <div className="text-sm text-red-600">{formError}</div>}
            <button onClick={handleResetRequest} disabled={loading} className="w-full py-3.5 rounded-xl font-semibold text-sm disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>{loading ? 'Enviando...' : 'Enviar código'}</button><button onClick={backToLogin} className="w-full py-3 rounded-xl font-semibold text-sm border-2" style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}>Voltar</button>
          </div>
        </>}

        {mode === 'code' && <>
          <p className="text-base font-semibold text-foreground mb-2">Confirmar código</p><p className="text-sm text-muted-foreground mb-4">{message || 'Digite o código recebido por e-mail.'}</p>
          <div className="space-y-4"><input inputMode="numeric" maxLength={6} value={resetCode} onChange={e => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" className={inputCls} />
            {formError && <div className="text-sm text-red-600">{formError}</div>}
            <button onClick={handleVerifyCode} className="w-full py-3.5 rounded-xl font-semibold text-sm" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>Continuar</button><button onClick={backToLogin} className="w-full py-3 rounded-xl font-semibold text-sm border-2" style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}>Voltar</button>
          </div>
        </>}

        {mode === 'new-password' && <>
          <p className="text-base font-semibold text-foreground mb-2">Definir nova senha</p><p className="text-sm text-muted-foreground mb-4">Código válido por 15 minutos e de uso único.</p>
          <div className="space-y-4"><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Nova senha — mínimo 8 caracteres" className={inputCls} /><input type="password" value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)} placeholder="Confirmar nova senha" className={inputCls} />
            {formError && <div className="text-sm text-red-600">{formError}</div>}
            <button onClick={handleResetPassword} disabled={loading} className="w-full py-3.5 rounded-xl font-semibold text-sm disabled:opacity-60" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>{loading ? 'Salvando...' : 'Salvar nova senha'}</button><button onClick={() => setMode('code')} className="w-full py-3 rounded-xl font-semibold text-sm border-2" style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}>Voltar</button>
          </div>
        </>}
      </div>
    </div>
  );
}
