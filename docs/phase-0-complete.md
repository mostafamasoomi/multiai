# Persian AI Gateway — Phase 0

## 1. SCOPE
Gateway + wallet + billing core.
Excludes: Telegram, web UI, payments driver.

## 2. DATA MODEL
See backend/schema.sql

## 3. API SURFACE
POST /v1/chat/completions Bearer
GET /v1/models Bearer
POST /admin/meter X-Internal-Token
GET /me/usage Bearer
GET /admin/pricing X-Internal-Token
POST /admin/pricing X-Internal-Token
POST /admin/models X-Internal-Token

## 4. CODE
See backend/app.py, requirements.txt, Dockerfile, docker-compose.yml

## 5. SECURITY NOTES
Bearer auth + internal token. Ledger append-only. No prompt/response bodies at INFO.

## 6. TEST PLAN
docker compose up -d
pytest backend/tests/test_phase0.py -q

## 7. OPEN QUESTIONS
1. LiteLLM stable version: [VERIFY: litellm docs]
2. Payment provider contract: [VERIFY: gateway docs]
