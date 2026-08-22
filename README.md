# CCIP — Connectivity Coverage Intelligence Platform

MVP build. This README covers what's implemented and how to run it.

## Quick start: GitHub Codespaces

Code → Codespaces → **Create codespace on main**. The devcontainer starts Postgres, installs dependencies, runs migrations, and seeds the database automatically (see `.devcontainer/postCreate.sh`). Once setup finishes, run in two terminals:

```bash
npm run dev:api
npm run dev:web
```

Open the forwarded port 3000 from the **Ports** tab. Port 4000 (the API) must stay running in the background — the web app calls it via its own forwarded URL, wired up automatically by the postCreate script.

## Production deployment: Supabase + Render + Vercel

`apps/web` (Next.js) fits Vercel's model well. `apps/api` (NestJS + Prisma, a persistent server) does not — Vercel's serverless functions can't host a long-lived `app.listen()` process, so it's deployed to Render instead, with Supabase providing managed Postgres.

**1. Database — Supabase**
1. Create a project at [supabase.com](https://supabase.com).
2. Project Settings → Database → **Connection string** → copy the **Session pooler** string (not "Direct connection" — Supabase's direct host is IPv6-only unless you pay for their IPv4 add-on, and most PaaS hosts including Render only have IPv4 egress, so the direct connection times out from there. The session pooler is IPv4-compatible and, unlike the transaction pooler on `:6543`, has no prepared-statement caveats for Prisma migrate).

**2. API — Render**
1. New → **Blueprint**, point it at this repo — it will read `render.yaml` at the repo root and create the `ccip-api` web service.
2. Set the env vars Render marks `sync: false`: `DATABASE_URL` (the Supabase string from step 1), `SEED_ADMIN_PASSWORD`, and — once you know it — `WEB_ORIGIN` (your Vercel URL). Leaving `WEB_ORIGIN` unset is fine initially; CORS reflects any origin until it's set.
3. Deploy. `render.yaml`'s `startCommand` runs `prisma migrate deploy` then `prisma db seed` before starting the server, on every start — not just once. That's deliberate: Render's free tier has no Shell access to run it manually, and the seed script only upserts (never deletes), so repeating it on every restart is harmless and never touches real data added later.
4. Render's free tier spins the service down after 15 minutes of inactivity; the first request after that takes ~30-50s to cold-start (and re-runs migrate+seed as part of that cold start, adding a few more seconds).

**3. Web — Vercel**
1. In the Vercel project (should already exist, pointed at this repo with Root Directory `apps/web`), set `NEXT_PUBLIC_API_BASE_URL` to `https://<your-render-service>.onrender.com/api`.
2. Redeploy.

## What's here

- **apps/api** — NestJS + Prisma + PostgreSQL. JWT auth (RBAC: ADMIN/ANALYST/VIEWER), native GSMA IR.21 XML/ZIP bulk ingestion, Excel upload for Reach List data (Excel IR.21 upload has been retired in favor of native XML parsing), the comparison engine, Operator/Provider search, dashboard metrics. Swagger at `/api/docs`.
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

To test the Reach List upload flow, use the generated fixture in `sample-data/` (`sample-reachlist.xlsx`) on the Admin Upload page — it includes a few intentionally invalid/duplicate rows to demonstrate the validation reporting. IR.21 ingestion is tested by uploading real GSMA IR.21 XML files (or a .zip of them) via the same page's XML/ZIP upload card.

## Regenerating sample Excel fixtures

```bash
node sample-data/generate-sample-excel.js
```
