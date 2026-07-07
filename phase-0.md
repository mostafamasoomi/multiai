# Persian AI Gateway — Phase 0

## SCOPE
Deliver gateway + wallet + billing core.
- LiteLLM config + passthrough
- append-only ledger
- token metering middleware
- admin pricing tables

Excludes: Telegram bot, web UI, payments driver.

## DATA MODEL
CREATE TABLE users (id BIGSERIAL PRIMARY KEY, phone TEXT UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE subscriptions (id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id), plan TEXT NOT NULL CHECK (plan IN ('free','basic','pro')), starts_at TIMESTAMPTZ NOT NULL DEFAULT now(), ends_at TIMESTAMPTZ NOT NULL);
CREATE TABLE ledger (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id), amount BIGINT NOT NULL CHECK (amount <> 0), balance_after BIGINT NOT NULL CHECK (balance_after >= 0), reason TEXT NOT NULL, meta JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE prices (id BIGSERIAL PRIMARY KEY, model TEXT NOT NULL UNIQUE, currency TEXT NOT NULL DEFAULT 'IRR', input_price BIGINT NOT NULL, output_price BIGINT NOT NULL, fx_rate BIGINT NOT NULL, margin_numer INT NOT NULL DEFAULT 12, margin_denom INT NOT NULL DEFAULT 10, active BOOLEAN DEFAULT TRUE, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE models (id BIGSERIAL PRIMARY KEY, slug TEXT NOT NULL UNIQUE, upstream TEXT NOT NULL, aliases TEXT[], tags TEXT[], hidden BOOLEAN DEFAULT FALSE, sort INT DEFAULT 0);

## API SURFACE
POST /v1/chat/completions Bearer - Metered passthrough
GET /v1/models Bearer - Whitelisted models
POST /admin/meter X-Internal-Token - Record token spend
GET /me/usage Bearer - Usage summary 30 days
GET /admin/pricing X-Internal-Token - View prices
POST /admin/pricing X-Internal-Token - Upsert price

## CODE
See backend/app.py, backend/requirements.txt, infra/docker-compose.yml

## SECURITY NOTES
- Bearer auth for /v1/*
- Ledger append-only
- No prompt/response body logging at INFO
- Secrets in env

## TEST PLAN
docker compose up -d
curl -s http://127.0.0.1:8000/admin/pricing -H "X-Internal-Token: $INTERNAL_TOKEN" | jq .

## OPEN QUESTIONS
1. LiteLLM exact stable version: [VERIFY: litellm docs]
2. Payment provider/driver contract: [VERIFY: gateway docs]
