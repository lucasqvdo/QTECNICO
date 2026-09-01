import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";

// Tipagem do evento nativo do browser (não está no TS padrão)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Banner de instalação da PWA.
 *
 * Aparece automaticamente quando o browser detecta que o app é elegível
 * para instalação (evento `beforeinstallprompt`). O usuário pode instalar
 * com um toque ou dispensar — a decisão fica salva em localStorage para
 * não incomodar novamente.
 *
 * No iOS o browser não dispara esse evento; nesse caso mostramos uma
 * instrução manual ("Compartilhar → Adicionar à Tela de Início").
 */
export function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Não mostra se já foi dispensado antes
    const dismissed = localStorage.getItem("pwa_install_dismissed");
    if (dismissed) return;

    // Detecta se já está rodando como PWA instalada
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (standalone) { setIsInstalled(true); return; }

    // Detecta iOS (Safari não dispara beforeinstallprompt)
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
    if (ios) {
      setIsIOS(true);
      // Mostra instrução manual após 3s para não ser intrusivo
      const t = setTimeout(() => setVisible(true), 3000);
      return () => clearTimeout(t);
    }

    // Android / Chrome / Edge: captura o evento de instalação
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
      setIsInstalled(true);
    }
    setInstallEvent(null);
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem("pwa_install_dismissed", "1");
  };

  if (!visible || isInstalled) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-2"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div
        className="rounded-2xl p-4 shadow-2xl flex items-start gap-3"
        style={{ background: "var(--primary)", color: "white" }}
      >
        {/* Ícone */}
        <div
          className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.15)" }}
        >
          <Download size={20} color="white" />
        </div>

        {/* Texto */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-white leading-tight">
            Instalar QTecnico
          </p>

          {isIOS ? (
            <p className="text-xs text-white/70 mt-1 leading-relaxed">
              Toque em{" "}
              <span className="font-semibold text-white">
                Compartilhar{" "}
                <svg className="inline w-3.5 h-3.5 -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </span>{" "}
              e depois em{" "}
              <span className="font-semibold text-white">
                Adicionar à Tela de Início
              </span>{" "}
              para instalar.
            </p>
          ) : (
            <p className="text-xs text-white/70 mt-1">
              Acesse mais rápido, sem abrir o browser.
            </p>
          )}

          {/* Botões — só mostra "Instalar" no Android/Chrome */}
          {!isIOS && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
                style={{ background: "white", color: "var(--primary)" }}
              >
                Instalar
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
                style={{ background: "rgba(255,255,255,0.15)", color: "white" }}
              >
                Agora não
              </button>
            </div>
          )}
        </div>

        {/* Fechar */}
        <button
          onClick={handleDismiss}
          className="p-1 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
          aria-label="Fechar"
        >
          <X size={16} color="rgba(255,255,255,0.7)" />
        </button>
      </div>
    </div>
  );
}
