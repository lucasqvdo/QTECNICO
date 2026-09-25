import { createHash } from 'node:crypto';

export const ACTIVE_TRIAL_SQL = "a.trial_plan_key = 'business' AND a.trial_started_at <= NOW() AND a.trial_ends_at > NOW() AND a.trial_ended_at IS NULL";
export const TRIAL_SCHEMA_SQL = `
  ALTER TABLE accounts ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;
  ALTER TABLE accounts ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
  ALTER TABLE accounts ADD COLUMN IF NOT EXISTS trial_plan_key TEXT;
  ALTER TABLE accounts ADD COLUMN IF NOT EXISTS trial_ended_at TIMESTAMPTZ;
  CREATE TABLE IF NOT EXISTS company_trial_claims (
    document_hash TEXT PRIMARY KEY,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS account_trial_events (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id),
    actor_user_id BIGINT,
    action TEXT NOT NULL,
    before_state JSONB,
    after_state JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

export function trialInfo(row: any, now = Date.now()) {
  const startedAt = row.trial_started_at || null;
  const endsAt = row.trial_ends_at || null;
  const active = row.trial_plan_key === 'business' && !!startedAt && !!endsAt &&
    new Date(startedAt).getTime() <= now && new Date(endsAt).getTime() > now && !row.trial_ended_at;
  return {
    planKey: row.trial_plan_key || null, startedAt, endsAt,
    status: !startedAt ? 'not_started' : row.trial_ended_at ? 'ended' : active ? 'active' : 'expired',
    active, daysRemaining: active ? Math.ceil((new Date(endsAt).getTime() - now) / 86400000) : 0,
  };
}

export function normalizeCompanyDocument(document: string) {
  return document.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Called only inside the registration transaction; never from login or reconciliation.
export async function grantRegistrationTrial(client: any, accountId: number, document: string) {
  const normalized = normalizeCompanyDocument(document);
  if (!normalized) throw new Error('Documento da empresa inválido.');
  const existing = await client.query(`SELECT 1 FROM company_profiles
    WHERE regexp_replace(upper(document), '[^A-Z0-9]', '', 'g') = $1 LIMIT 1`, [normalized]);
  if (existing.rows.length) return;
  // The unique claim serializes concurrent registrations and survives account deletion/document edits.
  const claim = await client.query(`INSERT INTO company_trial_claims (document_hash) VALUES ($1)
    ON CONFLICT DO NOTHING RETURNING document_hash`, [createHash('sha256').update(normalized).digest('hex')]);
  if (!claim.rows.length) return;
  const result = await client.query(`UPDATE accounts SET trial_started_at=NOW(),
    trial_ends_at=NOW() + INTERVAL '14 days', trial_plan_key='business'
    WHERE id=$1 AND trial_started_at IS NULL RETURNING trial_started_at,trial_ends_at,trial_plan_key`, [accountId]);
  if (result.rows.length) await client.query(`INSERT INTO account_trial_events (account_id,action,after_state)
    VALUES ($1,'registration',$2::jsonb)`, [accountId, JSON.stringify(result.rows[0])]);
}
