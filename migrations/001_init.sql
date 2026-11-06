-- Up Migration

CREATE TABLE accounts (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL
);

CREATE TABLE tasks (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tasks_owner_created_idx ON tasks (owner_id, created_at, id);

-- Down Migration

DROP TABLE tasks;
DROP TABLE accounts;
