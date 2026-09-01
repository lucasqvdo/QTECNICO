/**
 * Hook useWebAuthn
 *
 * Encapsula toda a lógica de biometria: detectar suporte, registrar e autenticar.
 * Usa @simplewebauthn/browser para chamar o authenticator nativo do dispositivo
 * (Touch ID, Face ID, digital do Android etc.).
 *
 * Armazenamento local:
 *   qtecnico_webauthn_email  → e-mail do último usuário que ativou biometria
 *                              neste dispositivo; usado para pré-preencher o campo
 *                              na tela de login biométrico.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
} from '@simplewebauthn/browser';
import { api } from '../api';
import type { UserProfile } from '../api';

export interface WebAuthnState {
  /** Browser e dispositivo suportam WebAuthn com biometria nativa. */
  supported: boolean;
  /** Suporta "autofill" / passkey condicional (exibir na caixa de e-mail). */
  autofillSupported: boolean;
  /** E-mail que tem biometria cadastrada neste dispositivo (lido do localStorage). */
  enrolledEmail: string | null;
  loading: boolean;
  error: string | null;
}

export interface WebAuthnActions {
  /**
   * Registra a biometria do dispositivo para o usuário logado.
   * Deve ser chamado logo após o login com senha.
   */
  register: () => Promise<boolean>;

  /**
   * Autentica via biometria. Retorna token + perfil do usuário ou lança erro.
   */
  authenticate: (email: string) => Promise<{ token: string; user: UserProfile }>;

  /** Remove todas as credenciais biométricas do usuário neste dispositivo. */
  removeEnrollment: () => Promise<void>;

  clearError: () => void;
}

const STORAGE_KEY = 'qtecnico_webauthn_email';

export function useWebAuthn(): WebAuthnState & WebAuthnActions {
  const [supported, setSupported] = useState(false);
  const [autofillSupported, setAutofillSupported] = useState(false);
  const [enrolledEmail, setEnrolledEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detecta suporte ao montar
  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
    browserSupportsWebAuthnAutofill().then(setAutofillSupported).catch(() => {});
    setEnrolledEmail(localStorage.getItem(STORAGE_KEY));
  }, []);

  // ── Registro ──────────────────────────────────────────────────────────────
  const register = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      // 1. Pede as options ao servidor
      const options = await api.webauthn.registerOptions();

      // 2. Chama o authenticator nativo (abre o prompt de digital/face)
      const registrationResponse = await startRegistration({ optionsJSON: options as any });

      // 3. Envia a resposta ao servidor para verificação e persistência
      const { verified } = await api.webauthn.registerVerify(registrationResponse);

      if (verified) {
        // Salva o e-mail do usuário logado para uso na tela de login biométrico
        const me = await api.getMe();
        localStorage.setItem(STORAGE_KEY, me.email);
        setEnrolledEmail(me.email);
      }
      return verified;
    } catch (e: any) {
      // NotAllowedError = usuário cancelou ou timeout
      if (e?.name === 'NotAllowedError') {
        setError('Biometria cancelada. Tente novamente se desejar ativar.');
      } else {
        setError(e?.message || 'Erro ao registrar biometria.');
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Autenticação ──────────────────────────────────────────────────────────
  const authenticate = useCallback(async (
    email: string,
  ): Promise<{ token: string; user: UserProfile }> => {
    setLoading(true);
    setError(null);
    try {
      // 1. Pede as options ao servidor (envia o e-mail para buscar as credenciais)
      const optionsWithUserId = await api.webauthn.authenticateOptions(email);
      const { userId, ...options } = optionsWithUserId;

      // 2. Chama o authenticator nativo
      const authResponse = await startAuthentication({ optionsJSON: options as any });

      // 3. Verifica no servidor → recebe JWT
      const result = await api.webauthn.authenticateVerify(userId, authResponse);
      return result;
    } catch (e: any) {
      if (e?.name === 'NotAllowedError') {
        throw new Error('Biometria cancelada.');
      }
      throw new Error(e?.message || 'Erro na autenticação biométrica.');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Remover enrollment ────────────────────────────────────────────────────
  const removeEnrollment = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const creds = await api.webauthn.listCredentials();
      await Promise.all(creds.map(c => api.webauthn.deleteCredential(c.id)));
      localStorage.removeItem(STORAGE_KEY);
      setEnrolledEmail(null);
    } catch (e: any) {
      setError(e?.message || 'Erro ao remover biometria.');
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    supported,
    autofillSupported,
    enrolledEmail,
    loading,
    error,
    register,
    authenticate,
    removeEnrollment,
    clearError,
  };
}
