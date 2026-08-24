# Builds and runs apps/api for Cloud Run. Lives at the repo root (not
# apps/api/) because npm workspaces need the whole monorepo — root
# package.json/lockfile plus packages/shared-types — to install and build.
#
# Node 22, not 20: @supabase/supabase-js's client constructor always
# initializes an internal Realtime WebSocket client (even though this app
# only uses Storage), and that constructor throws immediately if there's no
# native `WebSocket` global — which Node 20 doesn't have. Node 22 does.
FROM node:22-slim

# Prisma's query/schema engine needs libssl at runtime to detect the OpenSSL
# version — the slim base image doesn't include it, which makes `prisma
# migrate deploy` fail silently into a hang (no clear crash, just never
# binds the port, so Cloud Run's startup probe times out with no obvious
# cause in the deploy output — only visible in the revision's own logs).
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /repo

# Copy just the manifests first so `npm ci` is cached across builds unless a
# package.json actually changed — apps/web's manifest is needed too since
# it's a workspace member the lockfile references, even though its source
# is never copied in (this image only serves the API).
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN npm ci

COPY packages/shared-types packages/shared-types
COPY apps/api apps/api

RUN npm run build --workspace=apps/api

ENV NODE_ENV=production
EXPOSE 8080

# Mirrors render.yaml's startCommand: migrate, then seed (upsert-only, so
# safe to repeat every boot), then start. Cloud Run injects $PORT — main.ts
# already reads it, no code change needed.
CMD ["sh", "-c", "npm run prisma:deploy --workspace=apps/api && npm run prisma:seed --workspace=apps/api && npm run start:prod --workspace=apps/api"]
