import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appPath = path.join(root, 'src/app/App.tsx');
let source = fs.readFileSync(appPath, 'utf8');

if (!source.includes('SecureLoginScreen')) {
  source = source.replace(
    'import { api } from "./api";\n',
    'import { api } from "./api";\nimport SecureLoginScreen from "./components/SecureLoginScreen";\n',
  );

  source = source.replace(
    /\n  const handlePasswordResetRequest = \(email: string\) => api\.requestPasswordReset\(email\);\n\n  const handlePasswordReset = \(resetToken: string, password: string\) =>\n    api\.resetPassword\(resetToken, password\);\n/,
    '\n',
  );

  const legacyLoginStart = source.indexOf('/* ─── Login ─────────────────────────────────────────────────── */');
  const ordersMarker = source.indexOf('/* ─── Orders Tab ─────────────────────────────────────────────── */');
  if (legacyLoginStart < 0 || ordersMarker < 0 || ordersMarker <= legacyLoginStart) {
    throw new Error('Security build: legacy LoginScreen markers not found. Refusing to build.');
  }

  source = source.slice(0, legacyLoginStart) + ordersMarker + source.slice(ordersMarker + '/* ─── Orders Tab ─────────────────────────────────────────────── */'.length);

  const legacyReturn = /  if \(screen === "login"\)\n    return <LoginScreen[\s\S]*?onPasswordReset=\{handlePasswordReset\} \/>;\n/;
  const secureReturn = `  if (screen === "login")\n    return <SecureLoginScreen email={loginEmail} password={loginPassword} error={loginError}\n      onEmailChange={v => { setLoginEmail(v); setLoginError(false); }}\n      onPasswordChange={v => { setLoginPassword(v); setLoginError(false); }}\n      onLogin={handleLogin} onRegister={handleRegister} onBiometricLogin={handleBiometricLogin} />;\n`;

  if (!legacyReturn.test(source)) {
    throw new Error('Security build: legacy login render not found. Refusing to build.');
  }
  source = source.replace(legacyReturn, secureReturn);

  const sessionEffectAnchor = '  useEffect(() => {\n    const token = localStorage.getItem("qtecnico_token");';
  const sessionEffect = `  useEffect(() => {\n    const handleSessionExpired = () => {\n      setOrders([]);\n      setClients([]);\n      setScreen("login");\n      setLoginPassword("");\n    };\n    window.addEventListener("qtecnico-session-expired", handleSessionExpired);\n    return () => window.removeEventListener("qtecnico-session-expired", handleSessionExpired);\n  }, []);\n\n  useEffect(() => {\n    const token = localStorage.getItem("qtecnico_token");`;
  if (!source.includes('qtecnico-session-expired')) {
    if (!source.includes(sessionEffectAnchor)) throw new Error('Security build: session effect anchor not found.');
    source = source.replace(sessionEffectAnchor, sessionEffect);
  }

  fs.writeFileSync(appPath, source);
}

console.log('Security build: legacy login flow replaced with secure email-code recovery.');
