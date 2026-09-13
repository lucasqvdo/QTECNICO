import { Router } from 'express';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { pool } from '../db.js';
import { requireAuth, signToken } from '../auth.js';
import { assertWebAuthnTransport, getWebAuthnConfig } from '../webauthn.js';

const router = Router();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function getUserId(req: any) {
  const userId = Number(req.userId);
  if (!Number.isInteger(userId) || userId <= 0) throw new Error('Usuário inválido');
  return userId;
}

async function saveChallenge(userId: number, type: 'registration' | 'authentication', challenge: string) {
  await pool.query(
    'DELETE FROM webauthn_challenges WHERE user_id = $1 AND type = $2',
    [userId, type],
  );
  await pool.query(
    `INSERT INTO webauthn_challenges (user_id, type, challenge, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')`,
    [userId, type, challenge],
  );
}

async function consumeChallenge(userId: number, type: 'registration' | 'authentication', challenge: string) {
  const result = await pool.query(
    `DELETE FROM webauthn_challenges
     WHERE user_id = $1 AND type = $2 AND challenge = $3 AND expires_at > NOW()
     RETURNING id`,
    [userId, type, challenge],
  );
  return result.rows.length > 0;
}

function sendWebAuthnError(res: any, error: unknown) {
  const message = error instanceof Error ? error.message : 'Erro WebAuthn';
  console.error('WebAuthn:', message);
  return res.status(400).json({ error: message });
}

router.post('/register/options', requireAuth, async (req, res) => {
  try {
    assertWebAuthnTransport(req);
    const userId = getUserId(req);
    const config = getWebAuthnConfig(req);
    const userResult = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const credentials = await pool.query(
      'SELECT id, transports FROM webauthn_credentials WHERE user_id = $1',
      [userId],
    );
    const options = await generateRegistrationOptions({
      rpName: 'QTecnico',
      rpID: config.rpID,
      userName: user.email,
      userDisplayName: user.name,
      userID: Buffer.from(String(user.id)),
      timeout: 60_000,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
      excludeCredentials: credentials.rows.map(credential => ({
        id: credential.id,
        transports: credential.transports || undefined,
      })),
    });
    await saveChallenge(userId, 'registration', options.challenge);
    res.json(options);
  } catch (error) {
    sendWebAuthnError(res, error);
  }
});

router.post('/register/verify', requireAuth, async (req, res) => {
  try {
    assertWebAuthnTransport(req);
    const userId = getUserId(req);
    const response = req.body as RegistrationResponseJSON;
    if (!response?.id || !response.response?.clientDataJSON || !response.response.attestationObject) {
      return res.status(400).json({ error: 'Resposta WebAuthn incompleta' });
    }

    const challengeResult = await pool.query(
      `SELECT challenge FROM webauthn_challenges
       WHERE user_id = $1 AND type = 'registration' AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [userId],
    );
    const challenge = challengeResult.rows[0]?.challenge;
    if (!challenge) return res.status(400).json({ error: 'Desafio WebAuthn expirado. Tente novamente.' });

    const config = getWebAuthnConfig(req);
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Não foi possível validar a biometria' });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    await pool.query(
      `INSERT INTO webauthn_credentials
        (id, user_id, public_key, counter, transports, device_type, backed_up)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET public_key = EXCLUDED.public_key,
         counter = EXCLUDED.counter, transports = EXCLUDED.transports`,
      [
        credential.id,
        userId,
        Buffer.from(credential.publicKey),
        credential.counter,
        response.response.transports || [],
        credentialDeviceType,
        credentialBackedUp,
      ],
    );
    await consumeChallenge(userId, 'registration', challenge);
    res.json({ success: true });
  } catch (error) {
    sendWebAuthnError(res, error);
  }
});

router.post('/authenticate/options', async (req, res) => {
  try {
    assertWebAuthnTransport(req);
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email) return res.status(400).json({ error: 'Informe o e-mail para usar a biometria' });

    const userResult = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = $1',
      [email],
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'E-mail ou biometria não cadastrados' });

    const credentials = await pool.query(
      'SELECT id, transports FROM webauthn_credentials WHERE user_id = $1',
      [user.id],
    );
    if (credentials.rows.length === 0) {
      return res.status(404).json({ error: 'Nenhuma biometria cadastrada para esta conta' });
    }

    const config = getWebAuthnConfig(req);
    const options = await generateAuthenticationOptions({
      rpID: config.rpID,
      allowCredentials: credentials.rows.map(credential => ({
        id: credential.id,
        transports: credential.transports || undefined,
      })),
      userVerification: 'required',
      timeout: 60_000,
    });
    await saveChallenge(user.id, 'authentication', options.challenge);
    res.json(options);
  } catch (error) {
    sendWebAuthnError(res, error);
  }
});

router.post('/authenticate/verify', async (req, res) => {
  try {
    assertWebAuthnTransport(req);
    const response = req.body as AuthenticationResponseJSON;
    if (!response?.id || !response.response?.clientDataJSON || !response.response.authenticatorData || !response.response.signature) {
      return res.status(400).json({ error: 'Resposta WebAuthn incompleta' });
    }

    const credentialResult = await pool.query(
      `SELECT c.*, u.id AS user_id, u.email, u.name, u.role, u.phone, u.photo_url
       FROM webauthn_credentials c
       JOIN users u ON u.id = c.user_id
       WHERE c.id = $1`,
      [response.id],
    );
    const credentialRow = credentialResult.rows[0];
    if (!credentialRow) return res.status(401).json({ error: 'Biometria não cadastrada' });

    const challengeResult = await pool.query(
      `SELECT challenge FROM webauthn_challenges
       WHERE user_id = $1 AND type = 'authentication' AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [credentialRow.user_id],
    );
    const challenge = challengeResult.rows[0]?.challenge;
    if (!challenge) return res.status(400).json({ error: 'Desafio WebAuthn expirado. Tente novamente.' });

    const config = getWebAuthnConfig(req);
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      requireUserVerification: true,
      credential: {
        id: credentialRow.id,
        publicKey: new Uint8Array(credentialRow.public_key),
        counter: Number(credentialRow.counter),
        transports: credentialRow.transports || undefined,
      },
    });
    if (!verification.verified) return res.status(401).json({ error: 'Não foi possível validar a biometria' });

    await pool.query('UPDATE webauthn_credentials SET counter = $1 WHERE id = $2', [
      verification.authenticationInfo.newCounter,
      credentialRow.id,
    ]);
    await consumeChallenge(credentialRow.user_id, 'authentication', challenge);

    const token = signToken({ id: credentialRow.user_id, email: credentialRow.email });
    res.json({
      token,
      user: {
        id: credentialRow.user_id,
        name: credentialRow.name,
        role: credentialRow.role || '',
        phone: credentialRow.phone || '',
        email: credentialRow.email,
        photoUrl: credentialRow.photo_url || null,
      },
    });
  } catch (error) {
    sendWebAuthnError(res, error);
  }
});

export default router;