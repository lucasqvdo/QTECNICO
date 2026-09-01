/**
 * Rotas WebAuthn — autenticação biométrica (digital / Face ID)
 *
 * Fluxo de REGISTRO (vincula o dispositivo à conta):
 *   1. POST /register/options  → servidor gera um challenge e devolve as options
 *   2. (browser chama o authenticator — digital/face)
 *   3. POST /register/verify   → servidor verifica a resposta e salva a credencial
 *
 * Fluxo de AUTENTICAÇÃO (login biométrico):
 *   1. POST /authenticate/options → servidor gera um challenge (pode ser anônimo ou por email)
 *   2. (browser chama o authenticator)
 *   3. POST /authenticate/verify  → servidor verifica, devolve JWT igual ao login normal
 */

import { Router } from 'express';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticatorTransportFuture,
  CredentialDeviceType,
} from '@simplewebauthn/types';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';
import { signToken } from '../auth.js';

const router = Router();

// ---------------------------------------------------------------------------
// Helpers de configuração
// ---------------------------------------------------------------------------

/** Hostname sem protocolo nem porta — usado como rpID pelo WebAuthn. */
function getRpID(): string {
  const url = process.env.APP_URL || 'http://localhost:5173';
  try { return new URL(url).hostname; }
  catch { return 'localhost'; }
}

/** Origin completa aceita pelo WebAuthn (protocolo + host + porta se != 80/443). */
function getExpectedOrigins(): string[] {
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const origins = [appUrl];
  // Em dev o Vite roda na 5173 mas o servidor Express fica na 3000 servindo o
  // build. Aceitamos ambas para facilitar os testes locais.
  if (appUrl.includes('localhost')) {
    origins.push('http://localhost:3000');
  }
  return [...new Set(origins)];
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// ---------------------------------------------------------------------------
// Helpers de banco
// ---------------------------------------------------------------------------

async function saveChallenge(userId: number, challenge: string) {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  await pool.query(
    `INSERT INTO webauthn_challenges (user_id, challenge, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET challenge = $2, expires_at = $3`,
    [userId, challenge, expiresAt],
  );
}

async function consumeChallenge(userId: number): Promise<string | null> {
  const res = await pool.query(
    `DELETE FROM webauthn_challenges
     WHERE user_id = $1 AND expires_at > NOW()
     RETURNING challenge`,
    [userId],
  );
  return res.rows[0]?.challenge ?? null;
}

// ---------------------------------------------------------------------------
// REGISTRO — gerar options  (requer login prévio com senha)
// ---------------------------------------------------------------------------
router.post('/register/options', requireAuth, async (req, res) => {
  const userId = req.userId as number;

  const userRow = await pool.query(
    'SELECT id, name, email FROM users WHERE id = $1',
    [userId],
  );
  const user = userRow.rows[0];
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  // Credenciais já registradas neste usuário (para excluir do prompt)
  const existingCreds = await pool.query(
    'SELECT id, transports FROM webauthn_credentials WHERE user_id = $1',
    [userId],
  );

  const options = await generateRegistrationOptions({
    rpName: 'QTecnico',
    rpID: getRpID(),
    userName: user.email,
    userDisplayName: user.name,
    // Não permite registrar a mesma chave duas vezes
    excludeCredentials: existingCreds.rows.map((c: any) => ({
      id: c.id,
      transports: c.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      // 'platform' = biometria nativa do dispositivo (digital, Face ID)
      // 'cross-platform' = chave de segurança física (YubiKey etc.)
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'required',   // exige biometria — não aceita só PIN
    },
    timeout: 60000,
  });

  await saveChallenge(userId, options.challenge);
  res.json(options);
});

// ---------------------------------------------------------------------------
// REGISTRO — verificar resposta do authenticator
// ---------------------------------------------------------------------------
router.post('/register/verify', requireAuth, async (req, res) => {
  const userId = req.userId as number;

  const expectedChallenge = await consumeChallenge(userId);
  if (!expectedChallenge) {
    return res.status(400).json({ error: 'Challenge expirado ou inválido. Tente novamente.' });
  }

  try {
    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: getExpectedOrigins(),
      expectedRPID: getRpID(),
      requireUserVerification: true,
    });

    if (!verified || !registrationInfo) {
      return res.status(400).json({ error: 'Verificação biométrica falhou.' });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;

    // Salva a credencial no banco
    await pool.query(
      `INSERT INTO webauthn_credentials
         (id, user_id, public_key, counter, device_type, backed_up, transports)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        credential.id,
        userId,
        Buffer.from(credential.publicKey),
        credential.counter,
        credentialDeviceType,
        credentialBackedUp,
        credential.transports ?? [],
      ],
    );

    res.json({ verified: true });
  } catch (e: any) {
    console.error('WebAuthn register verify error:', e);
    res.status(400).json({ error: e.message || 'Erro ao registrar biometria.' });
  }
});

// ---------------------------------------------------------------------------
// AUTENTICAÇÃO — gerar options  (não requer login; recebe email para buscar creds)
// ---------------------------------------------------------------------------
router.post('/authenticate/options', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Informe o e-mail.' });

  const userRow = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [String(email).trim().toLowerCase()],
  );
  // Retorna genérico para não enumerar usuários
  if (userRow.rows.length === 0) {
    return res.status(404).json({ error: 'Nenhuma biometria cadastrada para este dispositivo.' });
  }
  const userId: number = userRow.rows[0].id;

  const creds = await pool.query(
    'SELECT id, transports FROM webauthn_credentials WHERE user_id = $1',
    [userId],
  );
  if (creds.rows.length === 0) {
    return res.status(404).json({ error: 'Nenhuma biometria cadastrada para este dispositivo.' });
  }

  const options = await generateAuthenticationOptions({
    rpID: getRpID(),
    allowCredentials: creds.rows.map((c: any) => ({
      id: c.id,
      transports: c.transports as AuthenticatorTransportFuture[],
    })),
    userVerification: 'required',
    timeout: 60000,
  });

  await saveChallenge(userId, options.challenge);
  // Devolve o userId para o frontend usar na etapa de verify
  res.json({ ...options, userId });
});

// ---------------------------------------------------------------------------
// AUTENTICAÇÃO — verificar resposta e devolver JWT
// ---------------------------------------------------------------------------
router.post('/authenticate/verify', async (req, res) => {
  const { userId, response } = req.body;
  if (!userId || !response) {
    return res.status(400).json({ error: 'Dados incompletos.' });
  }

  const expectedChallenge = await consumeChallenge(Number(userId));
  if (!expectedChallenge) {
    return res.status(400).json({ error: 'Challenge expirado ou inválido. Tente novamente.' });
  }

  // Busca a credencial específica que o dispositivo usou
  const credRow = await pool.query(
    'SELECT * FROM webauthn_credentials WHERE id = $1 AND user_id = $2',
    [response.id, Number(userId)],
  );
  if (credRow.rows.length === 0) {
    return res.status(400).json({ error: 'Credencial não encontrada.' });
  }
  const storedCred = credRow.rows[0];

  try {
    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: getExpectedOrigins(),
      expectedRPID: getRpID(),
      requireUserVerification: true,
      credential: {
        id: storedCred.id,
        publicKey: new Uint8Array(storedCred.public_key),
        counter: Number(storedCred.counter),
        transports: storedCred.transports as AuthenticatorTransportFuture[],
      },
    });

    if (!verified) {
      return res.status(401).json({ error: 'Verificação biométrica falhou.' });
    }

    // Atualiza counter anti-replay e last_used_at
    await pool.query(
      `UPDATE webauthn_credentials
       SET counter = $1, last_used_at = NOW()
       WHERE id = $2`,
      [authenticationInfo.newCounter, storedCred.id],
    );

    // Retorna o mesmo formato do /auth/login para o frontend reutilizar afterAuth()
    const userRow = await pool.query(
      `SELECT id, name, role, phone, email, photo_url FROM users WHERE id = $1`,
      [Number(userId)],
    );
    const user = userRow.rows[0];

    const token = signToken({ id: user.id, email: user.email });
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role || '',
        phone: user.phone || '',
        email: user.email,
        photoUrl: user.photo_url || null,
      },
    });
  } catch (e: any) {
    console.error('WebAuthn authenticate verify error:', e);
    res.status(401).json({ error: e.message || 'Erro na autenticação biométrica.' });
  }
});

// ---------------------------------------------------------------------------
// LISTAR credenciais do usuário logado
// ---------------------------------------------------------------------------
router.get('/credentials', requireAuth, async (req, res) => {
  const userId = req.userId as number;
  const result = await pool.query(
    `SELECT id, device_type, backed_up, transports, created_at, last_used_at
     FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  res.json(result.rows);
});

// ---------------------------------------------------------------------------
// REMOVER credencial
// ---------------------------------------------------------------------------
router.delete('/credentials/:id', requireAuth, async (req, res) => {
  const userId = req.userId as number;
  await pool.query(
    'DELETE FROM webauthn_credentials WHERE id = $1 AND user_id = $2',
    [req.params.id, userId],
  );
  res.json({ success: true });
});

export default router;
