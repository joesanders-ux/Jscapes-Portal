-- Authentication: email+password, Google sign-in (linked by Google account id),
-- database-backed sessions, and one-time invite links sent by admins.
-- Only token HASHES are stored; the raw invite/session token never touches the database.

ALTER TABLE users
  ADD COLUMN password_hash    text,
  ADD COLUMN google_sub       text UNIQUE,
  ADD COLUMN activated_at     timestamptz,
  ADD COLUMN failed_attempts  integer NOT NULL DEFAULT 0,
  ADD COLUMN locked_until     timestamptz;

CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE invites (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invites_user_idx ON invites (user_id);
