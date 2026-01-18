# OpenCCP Development Commands

# Default: show available commands
default:
    @just --list

# Initialize the database schema
db-init:
    just db-migrate

# Run all schema migrations (safe to run multiple times)
db-migrate:
    #!/usr/bin/env bash
    for f in backend/db/schema*.sql; do echo "Running $f"; psql -h localhost -p 5433 -U openccp_user openccp -f "$f"; done

# Reset database (drop and recreate all tables)
db-reset:
    psql -h localhost -p 5433 -U openccp_user openccp -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
    just db-init

# Connect to the database
db:
    psql -h localhost -p 5433 -U openccp_user openccp

# Install backend dependencies
backend-install:
    cd backend && uv venv && VIRTUAL_ENV=.venv uv pip install -r requirements.txt

# Run backend server with LOCAL database
backend:
    backend/.venv/bin/uvicorn backend.api.main:app --reload --host 0.0.0.0 --port 8000

# Run backend server with PRODUCTION database (for testing backend changes with real data)
# Uses PROD_DATABASE_URL from .env
backend-prod:
    DATABASE_URL="$PROD_DATABASE_URL" backend/.venv/bin/uvicorn backend.api.main:app --reload --host 0.0.0.0 --port 8000

# Install frontend dependencies
frontend-install:
    cd frontend && bun install

# Run frontend dev server (points to local backend)
frontend:
    cd frontend && bun dev

# Run frontend pointing to PRODUCTION backend (no local backend needed)
# Great for frontend-only changes with real crowdsourced data
frontend-prod:
    cd frontend && VITE_API_TARGET=prod bun dev

# Install all dependencies
install: backend-install frontend-install

# Run everything (use with terminal multiplexer or run separately)
dev:
    @echo "Run 'just backend' and 'just frontend' in separate terminals"

# Scrape a Twitter account (requires backend running)
scrape username:
    curl -X POST http://localhost:8000/api/scrape \
      -H "Content-Type: application/json" \
      -d '{"username": "{{username}}", "include_tweets": true, "include_following": true, "include_followers": true}'

# Analyze all accounts for camp membership
analyze:
    curl -X POST http://localhost:8000/api/analyze -H "Content-Type: application/json" -d '{}'

# Check stats
stats:
    curl -s http://localhost:8000/api/stats | jq
