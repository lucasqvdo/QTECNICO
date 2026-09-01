import { useState, useEffect } from "react";
import { AlertCircle, Fingerprint } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import logoImg from "@/imports/ChatGPT_Image_8_de_jun._de_2026__11_15_09.png";

interface LoginScreenProps {
  email: string;
  password: string;
  error: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onLogin: () => void;
  onRegister: (name: string, email: string, password: string) => Promise<void>;
  onForgotPassword: (email: string) => Promise<{ ok: boolean; message: string }>;
  /** Exibe botão "voltar para biometria" quando o usuário veio do modo biométrico */
  showBiometricBack?: boolean;
  onBiometricBack?: () => void;
}

export function LoginScreen({ email, password, error, onEmailChange, onPasswordChange, onLogin, onRegister, onForgotPassword, showBiometricBack, onBiometricBack }: LoginScreenProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [resetMode, setResetMode] = useState<"request" | "code" | "new-password">("request");
  const [remember, setRemember] = useState(() => localStorage.getItem("qtecnico_remember") === "true");
  const [showPass, setShowPass] = useState(false);
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regError, setRegError] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState("");

  useEffect(() => {
    localStorage.removeItem("qtecnico_pass");
    if (localStorage.getItem("qtecnico_remember") === "true") {
      const savedEmail = localStorage.getItem("qtecnico_email") || "";
      if (savedEmail) onEmailChange(savedEmail);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = () => {
    if (remember) {
      localStorage.setItem("qtecnico_remember", "true");
      localStorage.setItem("qtecnico_email", email);
    } else {
      localStorage.removeItem("qtecnico_remember");
      localStorage.removeItem("qtecnico_email");
    }
    onLogin();
  };

  const handleRegister = async () => {
    setRegError("");
    if (!regName.trim()) return setRegError("Informe seu nome.");
    if (!regEmail.trim()) return setRegError("Informe o e-mail.");
    if (regPass.length < 6) return setRegError("A senha deve ter no mínimo 6 caracteres.");
    if (regPass !== regConfirm) return setRegError("As senhas não coincidem.");
    setRegLoading(true);
    try {
      await onRegister(regName.trim(), regEmail.trim(), regPass);
    } catch (e: any) {
      setRegError(e.message || "Erro ao criar conta.");
    } finally {
      setRegLoading(false);
    }
  };

  const toggleRemember = () => {
    const next = !remember;
    setRemember(next);
    if (!next) {
      localStorage.removeItem("qtecnico_remember");
      localStorage.removeItem("qtecnico_email");
    }
  };

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setForgotError("Informe seu e-mail para recuperar a senha.");
      setForgotMessage("");
      return;
    }
    setForgotLoading(true);
    setForgotError("");
    setForgotMessage("");
    setResetSuccess("");
    try {
      const response = await onForgotPassword(trimmedEmail);
      setForgotMessage(response.message || "Um código foi enviado para o seu e-mail. Verifique sua caixa de entrada e continue.");
      setResetMode("code");
    } catch (e: any) {
      setForgotError(e.message || "Não foi possível recuperar a senha.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleVerifyResetCode = () => {
    if (!resetCode.trim()) return setForgotError("Informe o código de 6 dígitos recebido por e-mail.");
    if (!/^\d{6}$/.test(resetCode.trim())) return setForgotError("O código deve conter exatamente 6 dígitos numéricos.");
    setForgotError("");
    setResetMode("new-password");
  };

  const handleResetPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return setForgotError("Informe seu e-mail antes de redefinir a senha.");
    if (!resetCode.trim()) return setForgotError("Informe o código de 6 dígitos recebido por e-mail.");
    if (newPassword.length < 6) return setForgotError("A nova senha deve ter no mínimo 6 caracteres.");
    if (newPassword !== newPasswordConfirm) return setForgotError("As senhas não coincidem.");
    setResetLoading(true);
    setForgotError("");
    setResetSuccess("");
    try {
      await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, code: resetCode.trim(), password: newPassword }),
      }).then(async (res) => {
        const data = await res.json().catch(() => ({ message: 'Erro ao redefinir a senha.' }));
        if (!res.ok) throw new Error(data.error || data.message || 'Erro ao redefinir a senha.');
        return data;
      });
      setResetSuccess("Senha redefinida com sucesso. Você pode voltar e entrar com a nova senha.");
      setForgotMessage("");
      setResetMode("request");
      setNewPassword(""); setNewPasswordConfirm(""); setResetCode("");
    } catch (e: any) {
      setForgotError(e.message || "Não foi possível redefinir a senha.");
    } finally {
      setResetLoading(false);
    }
  };

  const inputCls = "w-full px-4 py-3 rounded-xl bg-secondary text-foreground placeholder-muted-foreground text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all";

  return (
    <div className="min-h-screen bg-primary flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex-1 flex flex-col justify-end px-6 pb-0">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-1">
            {mode === "login" ? "Bem-vindo!" : "Criar conta"}
          </h1>
          <p className="text-white/50 text-sm">
            {mode === "login" ? "Acesse sua conta para continuar." : "Preencha os dados para se cadastrar."}
          </p>
        </div>
      </div>

      <div className="bg-background rounded-t-3xl px-6 pt-8 pb-10 overflow-y-auto">
        <div className="flex flex-col items-center mb-6">
          <ImageWithFallback src={logoImg} alt="QTecnico logo" className="w-20 h-20 object-contain" />
          <h2 className="text-2xl font-bold tracking-tight mt-2" style={{ color: "var(--primary)" }}>
            Q<span style={{ color: "var(--accent)" }}>Tecnico</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Gestão de Ordens de Serviço</p>
        </div>

        {mode === "login" ? (
          <>
            {resetMode === "request" && (
              <>
                <p className="text-base font-semibold text-foreground mb-4">Entrar na sua conta</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">E-mail</label>
                    <input type="email" value={email} onChange={e => onEmailChange(e.target.value)}
                      placeholder="seu@email.com" className={inputCls}
                      onKeyDown={e => e.key === "Enter" && handleLogin()} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Senha</label>
                    <div className="relative">
                      <input type={showPass ? "text" : "password"} value={password} onChange={e => onPasswordChange(e.target.value)}
                        placeholder="••••••••" className={`${inputCls} pr-12`}
                        onKeyDown={e => e.key === "Enter" && handleLogin()} />
                      <button type="button" onClick={() => setShowPass(!showPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5">
                        {showPass ? "Ocultar" : "Ver"}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-sm">
                      <AlertCircle size={14} /><span>E-mail ou senha incorretos.</span>
                    </div>
                  )}

                  <button type="button" onClick={toggleRemember} className="flex items-center gap-3 w-full group">
                    <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all"
                      style={{ borderColor: remember ? "var(--primary)" : "var(--border)", background: remember ? "var(--primary)" : "transparent" }}>
                      {remember && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </div>
                    <span className="text-sm text-foreground group-hover:text-primary transition-colors">Lembrar meus dados</span>
                  </button>

                  <button onClick={handleLogin}
                    className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                    style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                    Entrar
                  </button>

                  <button onClick={handleForgotPassword} disabled={forgotLoading}
                    className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-60"
                    style={{ background: "transparent", color: "var(--primary)" }}>
                    {forgotLoading ? "Verificando..." : "Esqueci minha senha"}
                  </button>

                  {forgotError && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-sm">
                      <AlertCircle size={14} /><span>{forgotError}</span>
                    </div>
                  )}
                  {forgotMessage && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 text-green-700 text-sm">
                      <AlertCircle size={14} /><span>{forgotMessage}</span>
                    </div>
                  )}

                  <button onClick={() => setMode("register")}
                    className="w-full py-3 rounded-xl font-semibold text-sm border-2 transition-all active:scale-95"
                    style={{ borderColor: "var(--primary)", color: "var(--primary)", background: "transparent" }}>
                    Criar conta
                  </button>

                  {/* Botão para voltar ao login biométrico — só aparece quando o
                      usuário escolheu "entrar com senha" a partir da tela biométrica */}
                  {showBiometricBack && onBiometricBack && (
                    <button onClick={onBiometricBack}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
                      style={{ color: "var(--primary)", background: "transparent" }}>
                      <Fingerprint size={16} />
                      Usar biometria
                    </button>
                  )}
                </div>
              </>
            )}

            {resetMode === "code" && (
              <>
                <p className="text-base font-semibold text-foreground mb-4">Confirmar código</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">E-mail</label>
                    <input type="email" value={email} onChange={e => onEmailChange(e.target.value)} placeholder="seu@email.com" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Código de 6 dígitos</label>
                    <input type="text" inputMode="numeric" maxLength={6} value={resetCode}
                      onChange={e => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456" className={inputCls} />
                  </div>
                  {forgotMessage && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 text-green-700 text-sm whitespace-pre-line">
                      <AlertCircle size={14} /><span>{forgotMessage}</span>
                    </div>
                  )}
                  {forgotError && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-sm">
                      <AlertCircle size={14} /><span>{forgotError}</span>
                    </div>
                  )}
                  <button onClick={handleVerifyResetCode}
                    className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                    style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                    Verificar código
                  </button>
                  <button onClick={() => { setResetMode("request"); setResetCode(""); setForgotError(""); setForgotMessage(""); setResetSuccess(""); }}
                    className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                    style={{ background: "transparent", color: "var(--primary)" }}>
                    Voltar
                  </button>
                </div>
              </>
            )}

            {resetMode === "new-password" && (
              <>
                <p className="text-base font-semibold text-foreground mb-4">Definir nova senha</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">E-mail</label>
                    <input type="email" value={email} onChange={e => onEmailChange(e.target.value)} placeholder="seu@email.com" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Código recebido</label>
                    <input type="text" inputMode="numeric" maxLength={6} value={resetCode}
                      onChange={e => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Nova senha</label>
                    <input type={showPass ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Confirmar nova senha</label>
                    <input type={showPass ? "text" : "password"} value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)} placeholder="Repita a nova senha" className={inputCls} />
                  </div>
                  {forgotError && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-sm">
                      <AlertCircle size={14} /><span>{forgotError}</span>
                    </div>
                  )}
                  {resetSuccess && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 text-green-700 text-sm">
                      <AlertCircle size={14} /><span>{resetSuccess}</span>
                    </div>
                  )}
                  <button onClick={handleResetPassword} disabled={resetLoading}
                    className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-60"
                    style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                    {resetLoading ? "Salvando..." : "Salvar nova senha"}
                  </button>
                  <button onClick={() => { setResetMode("request"); setResetCode(""); setNewPassword(""); setNewPasswordConfirm(""); setForgotError(""); setForgotMessage(""); setResetSuccess(""); }}
                    className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                    style={{ background: "transparent", color: "var(--primary)" }}>
                    Voltar
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <p className="text-base font-semibold text-foreground mb-4">Cadastrar nova conta</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Nome completo</label>
                <input type="text" value={regName} onChange={e => setRegName(e.target.value)} placeholder="João Silva" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">E-mail</label>
                <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="seu@email.com" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Senha</label>
                <div className="relative">
                  <input type={showPass ? "text" : "password"} value={regPass} onChange={e => setRegPass(e.target.value)}
                    placeholder="Mínimo 6 caracteres" className={`${inputCls} pr-12`} />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5">
                    {showPass ? "Ocultar" : "Ver"}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Confirmar senha</label>
                <input type={showPass ? "text" : "password"} value={regConfirm} onChange={e => setRegConfirm(e.target.value)}
                  placeholder="Repita a senha" className={inputCls}
                  onKeyDown={e => e.key === "Enter" && handleRegister()} />
              </div>
              {regError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-sm">
                  <AlertCircle size={14} /><span>{regError}</span>
                </div>
              )}
              <button onClick={handleRegister} disabled={regLoading}
                className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-60"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                {regLoading ? "Criando conta..." : "Criar conta"}
              </button>
              <button onClick={() => { setMode("login"); setRegError(""); }}
                className="w-full py-3 rounded-xl font-semibold text-sm border-2 transition-all active:scale-95"
                style={{ borderColor: "var(--primary)", color: "var(--primary)", background: "transparent" }}>
                Voltar para o login
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
