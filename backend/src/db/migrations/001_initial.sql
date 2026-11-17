CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id serial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#748078',
  CONSTRAINT categories_name_not_blank CHECK (length(trim(name)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_global_name_unique
  ON categories (lower(name)) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS categories_user_name_unique
  ON categories (user_id, lower(name)) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  category_id integer REFERENCES categories(id) ON DELETE SET NULL,
  predicted_category_id integer REFERENCES categories(id) ON DELETE SET NULL,
  confidence real,
  is_manual boolean NOT NULL DEFAULT false,
  source_file text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_user_date_idx ON transactions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS transactions_user_category_date_idx ON transactions (user_id, category_id, date DESC);

CREATE TABLE IF NOT EXISTS uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename text NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('processing', 'done', 'failed')),
  warning text,
  accepted_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budgets (
  id serial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id integer NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month date NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  UNIQUE (user_id, category_id, month)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);

CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
