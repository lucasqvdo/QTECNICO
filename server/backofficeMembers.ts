export const BACKOFFICE_OWNER_EMAIL = 'lucas.qvdo@gmail.com';
export const BACKOFFICE_MEMBERS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS backoffice_members (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    role TEXT NOT NULL CHECK (role IN ('owner','collaborator')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    added_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS backoffice_single_owner ON backoffice_members (role) WHERE role='owner';
  INSERT INTO backoffice_members (user_id,role)
    SELECT id,'owner' FROM users WHERE LOWER(email)='${BACKOFFICE_OWNER_EMAIL}'
    AND NOT EXISTS (SELECT 1 FROM backoffice_members WHERE role='owner')
    ON CONFLICT DO NOTHING;
  CREATE TABLE IF NOT EXISTS backoffice_access_events (
    id BIGSERIAL PRIMARY KEY, actor_user_id INTEGER NOT NULL,
    target_user_id INTEGER NOT NULL, action TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;
