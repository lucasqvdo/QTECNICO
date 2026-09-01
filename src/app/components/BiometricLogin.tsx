/**
 * Componentes de UI para autenticação biométrica.
 *
 * BiometricLoginButton  — botão na tela de login (quando há biometria cadastrada)
 * BiometricEnrollPrompt — banner pós-login com senha oferecendo ativar a biometria
 */

import { useState } from 'react';
import { Fingerprint, ShieldCheck, X, ChevronRight, Loader2 } from 'lucide-react';
import type { UserProfile } from '../api';

// ── Ícone de biometria adaptativo ────────────────────────────────────────────
// Tenta detectar se é iOS (Face ID) ou Android/outros (digital) para
// mostrar o ícone mais adequado. É apenas cosmético — a API é a mesma.
function BiometricIcon({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS) {
    // Face ID — quadrado com cantos arredondados e pontos
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6a2 2 0 0 1 2-2h1M4 18a2 2 0 0 0 2 2h1M20 6a2 2 0 0 0-2-2h-1M20 18a2 2 0 0 1-2 2h-1" />
        <path d="M9 10h.01M15 10h.01" />
        <path d="M9.5 15a3.5 3.5 0 0 0 5 0" />
        <path d="M12 7v3" />
      </svg>
    );
  }
  // Digital — usa o ícone Fingerprint do lucide
  return <Fingerprint size={size} color={color} strokeWidth={2} />;
}

// ── BiometricLoginButton ──────────────────────────────────────────────────────

interface BiometricLoginButtonProps {
  enrolledEmail: string;
  loading: boolean;
  error: string | null;
  onAuthenticate: () => void;
  onUsePassword: () => void;
}

/**
 * Substitui (ou complementa) a tela de login quando o dispositivo tem
 * uma credencial biométrica cadastrada.
 */
export function BiometricLoginButton({
  enrolledEmail,
  loading,
  error,
  onAuthenticate,
  onUsePassword,
}: BiometricLoginButtonProps) {
  return (
    <div className="flex flex-col items-center gap-6 py-2">
      {/* Avatar / ícone central */}
      <div
        className="w-24 h-24 rounded-3xl flex items-center justify-center shadow-lg"
        style={{ background: 'var(--primary)' }}
      >
        <BiometricIcon size={44} color="white" />
      </div>

      <div className="text-center space-y-1">
        <p className="text-base font-semibold text-foreground">Entrar como</p>
        <p className="text-sm text-muted-foreground font-mono">{enrolledEmail}</p>
      </div>

      {/* Erro */}
      {error && (
        <div className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm">
          <X size={14} className="flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Botão principal — aciona o prompt nativo */}
      <button
        onClick={onAuthenticate}
        disabled={loading}
        className="w-full py-4 rounded-2xl font-semibold text-base transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-3"
        style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
      >
        {loading ? (
          <Loader2 size={22} className="animate-spin" />
        ) : (
          <>
            <BiometricIcon size={22} color="white" />
            Usar biometria
          </>
        )}
      </button>

      {/* Fallback para senha */}
      <button
        onClick={onUsePassword}
        disabled={loading}
        className="flex items-center gap-1.5 text-sm font-semibold transition-colors disabled:opacity-50"
        style={{ color: 'var(--primary)' }}
      >
        Entrar com senha
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

// ── BiometricEnrollPrompt ─────────────────────────────────────────────────────

interface BiometricEnrollPromptProps {
  loading: boolean;
  error: string | null;
  onEnable: () => void;
  onDismiss: () => void;
}

/**
 * Banner exibido logo após o primeiro login com senha, perguntando se o
 * usuário quer ativar o login biométrico neste dispositivo.
 */
export function BiometricEnrollPrompt({
  loading,
  error,
  onEnable,
  onDismiss,
}: BiometricEnrollPromptProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Backdrop semi-transparente */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={handleDismiss}
      />

      {/* Sheet */}
      <div className="relative w-full bg-background rounded-t-3xl px-6 pt-6 pb-10 shadow-2xl">
        {/* Handle */}
        <div className="w-10 h-1 rounded-full bg-border mx-auto mb-6" />

        {/* Ícone + título */}
        <div className="flex items-center gap-4 mb-5">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--primary)' }}
          >
            <BiometricIcon size={28} color="white" />
          </div>
          <div>
            <p className="font-bold text-foreground text-base leading-tight">
              Ativar login biométrico
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Entre mais rápido nas próximas vezes
            </p>
          </div>

          <button
            onClick={handleDismiss}
            className="ml-auto p-1.5 rounded-xl hover:bg-secondary transition-colors"
            aria-label="Fechar"
          >
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        {/* Benefícios */}
        <div className="space-y-3 mb-6">
          {[
            'Sem digitar senha toda vez',
            'Usando a biometria do seu dispositivo',
            'Pode desativar a qualquer momento no perfil',
          ].map((text) => (
            <div key={text} className="flex items-center gap-3">
              <ShieldCheck size={16} className="flex-shrink-0 text-green-600" />
              <span className="text-sm text-foreground">{text}</span>
            </div>
          ))}
        </div>

        {/* Erro */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm mb-4">
            <X size={14} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Ações */}
        <div className="flex gap-3">
          <button
            onClick={handleDismiss}
            disabled={loading}
            className="flex-1 py-3 rounded-xl text-sm font-semibold bg-secondary text-foreground transition-all active:scale-95 disabled:opacity-50"
          >
            Agora não
          </button>
          <button
            onClick={onEnable}
            disabled={loading}
            className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <BiometricIcon size={16} color="white" />
                Ativar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
