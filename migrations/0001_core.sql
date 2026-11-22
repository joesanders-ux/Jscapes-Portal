-- Core schema: users, team bulletin, calendar events.
-- Roles are enforced on the server; the database also constrains valid values.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL UNIQUE,
  name        text NOT NULL,
  role        text NOT NULL CHECK (role IN ('admin', 'staff')),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

CREATE TABLE bulletin_posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  pinned      boolean NOT NULL DEFAULT false,
  author_id   uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bulletin_posts_order_idx ON bulletin_posts (pinned DESC, created_at DESC);

-- event_date and start_time are local wall-clock values (no time zone),
-- so a 09:00 meeting is always shown as 09:00.
CREATE TABLE events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  type          text NOT NULL CHECK (type IN ('management', 'social', 'meeting', 'birthday')),
  event_date    date NOT NULL,
  start_time    time,
  meeting_url   text,
  notes         text NOT NULL DEFAULT '',
  created_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_date_idx ON events (event_date);
