# CCIP — Connectivity Coverage Intelligence Platform

MVP build. This README covers what's implemented and how to run it.

## Quick start: GitHub Codespaces

Code → Codespaces → **Create codespace on main**. The devcontainer starts Postgres, installs dependencies, runs migrations, and seeds the database automatically (see `.devcontainer/postCreate.sh`). Once setup finishes, run in two terminals:

```bash
npm run dev:api
npm run dev:web
```

Open the forwarded port 3000 from the **Ports** tab. Port 4000 (the API) must stay running in the background — the web app calls it via its own forwarded URL, wired up automatically by the postCreate script.

## What's here

- **apps/api** — NestJS + Prisma + PostgreSQL. JWT auth (RBAC: ADMIN/ANALYST/VIEWER), Excel upload for IR.21 and Reach List data, the comparison engine, MNO/Provider search, dashboard metrics. Swagger at `/api/docs`.
- **apps/web** — Next.js (App Router) + MUI + Tailwind + AG Grid. Login, dashboard, admin upload, MNO search, provider search, comparison results.
- **packages/shared-types** — DTOs/enums shared between both apps.
- **sample-data/** — generator script + sample `.xlsx` fixtures for manually testing the upload flow.

**Not in this pass** (see plan for the full spec): country search, IR21/Reach List analysis modules, PDF/Excel report export, analytics charts (bar/map/pie/treemap/line), the connectivity relationship graph, PWA, Docker images for the apps themselves, Azure deployment, AI Insights.

## Running locally (outside Codespaces)

### Prerequisites

- Node.js 20+
- A PostgreSQL 16 instance (either `docker-compose up -d`, or a local install)

### First-time setup

```bash
npm install
cp apps/api/.env.example apps/api/.env      # adjust DATABASE_URL etc. if not using docker-compose defaults
cp apps/web/.env.example apps/web/.env.local
npm run prisma:migrate    # creates the schema
npm run prisma:seed       # seeds services, providers, sample MNOs, users, IR21/reachlist rows
```

A root `.env.example` is also provided as a single-file reference (e.g. for `docker-compose up -d`, which reads `POSTGRES_*` from a root `.env`).

Seeded logins (see `.env.example` / seed output for the source of truth):
- Admin: `admin@ccip.local` / `Admin@12345`
- Analyst: `analyst@ccip.local` / `Analyst@12345`
- Viewer: `viewer@ccip.local` / `Viewer@12345`

### Running

```bash
npm run dev:api   # http://localhost:4000/api  (Swagger at /api/docs)
npm run dev:web   # http://localhost:3000
```

After seeding, log in and open **Comparison** → **Run Comparison** (admin only) to populate `DataDiscrepancy` from the seeded IR21/reachlist rows — it's intentionally left empty until first run so the comparison engine's behavior is visible rather than baked into the seed.

To test the upload flow, use the generated fixtures in `sample-data/` (`sample-ir21.xlsx`, `sample-reachlist.xlsx`) on the Admin Upload page — they include a few intentionally invalid/duplicate rows to demonstrate the validation reporting.

## Regenerating sample Excel fixtures

```bash
node sample-data/generate-sample-excel.js
```
