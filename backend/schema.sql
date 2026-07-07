CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  plan TEXT NOT NULL CHECK (plan IN ('free','basic','pro')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  amount BIGINT NOT NULL CHECK (amount <> 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  reason TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS prices (
  id BIGSERIAL PRIMARY KEY,
  model TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL DEFAULT 'IRR',
  input_price BIGINT NOT NULL,
  output_price BIGINT NOT NULL,
  fx_rate BIGINT NOT NULL,
  margin_numer INT NOT NULL DEFAULT 12,
  margin_denom INT NOT NULL DEFAULT 10,
  active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS models (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  upstream TEXT NOT NULL,
  aliases TEXT[],
  tags TEXT[],
  hidden BOOLEAN DEFAULT FALSE,
  sort INT DEFAULT 0
);
