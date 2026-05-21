# Session Handoff

Paste the **Resume prompt** below into a fresh Claude Code session started from this directory.

## How to start the new session

```bash
cd /Users/kenr/Code/naval-vessel-tracker
claude --dangerously-skip-permissions
```

Project memory (ports 6731/6732) and the global `~/.claude/CLAUDE.md` will auto-load. This conversation's context will not.

## Resume prompt

> Repo is at `/Users/kenr/Code/naval-vessel-tracker`, on branch `bootstrap` (off `main`). Public GitHub repo lives at https://github.com/nodots/naval-vessel-tracker. The MVP spec is at `docs/naval-vessel-tracker-mvp-spec.md` — read it. A six-milestone implementation plan was already agreed; start **Milestone 1 (Project bootstrap)**: pnpm monorepo with `apps/web` (Vite + React + TS + MUI + MapLibre on port 6731), `apps/api` (Express + TS on port 6732 with `/api/health` only), `apps/worker` (empty entrypoint), `packages/shared` (types from spec §13), root `docker-compose.yml` with postgis/postgis:16-3.4, and `tsconfig.base.json`. Use the ports from project memory (6731 web, 6732 api). No Tailwind — MUI per global CLAUDE.md. Stop at the M1 acceptance gate (`pnpm dev` brings up web + api, `/api/health` returns ok, `docker compose up` works) and commit on the `bootstrap` branch. Do not push without asking.

## State snapshot (as of handoff)

- Branch: `bootstrap` (no commits yet on this branch — diverged from `main` at the initial commit)
- `main`: initial commit only — `README.md`, `.gitignore`, `docs/naval-vessel-tracker-mvp-spec.md`
- GitHub: `nodots/naval-vessel-tracker`, public, default branch `main`
- No code scaffolded yet
- Agreed plan: six milestones, M1 in progress next

## Milestone 1 acceptance gate (recap)

- `pnpm dev` starts API on `6732` and web on `6731`
- `curl http://localhost:6732/api/health` returns `{"ok": true, "service": "naval-tracker-api"}`
- `docker compose up` brings up Postgres + PostGIS on `5432`
- Shared TypeScript package compiles and is consumable by api/web/worker
