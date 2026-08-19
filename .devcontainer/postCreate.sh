#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Waiting for Postgres to accept connections..."
for i in $(seq 1 60); do
  if (exec 3<>/dev/tcp/postgres/5432) 2>/dev/null; then
    exec 3<&- 3>&-
    echo "Postgres is up."
    break
  fi
  sleep 1
done

# Local .env files, so `npm run dev:*` also works outside this devcontainer
# script (containerEnv above already covers DATABASE_URL/JWT_SECRET for the
# app/API inside this container).
[ -f apps/api/.env ] || cp apps/api/.env.example apps/api/.env
[ -f apps/web/.env.local ] || cp apps/web/.env.example apps/web/.env.local

# Codespaces forwards each port on its own public hostname, so the browser
# hitting the web app can't reach the API at "localhost:4000" — point it at
# the API's forwarded URL instead.
if [ -n "${CODESPACE_NAME:-}" ]; then
  API_URL="https://${CODESPACE_NAME}-4000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}/api"
  echo "NEXT_PUBLIC_API_BASE_URL=\"${API_URL}\"" > apps/web/.env.local
  echo "Codespaces detected — web app will call the API at ${API_URL}"
fi

npm install
npm run build --workspace=packages/shared-types

(cd apps/api && npx prisma migrate deploy && npx prisma db seed)

cat <<'EOF'

Setup complete. Start the app in two terminals:
  npm run dev:api
  npm run dev:web

Then open the forwarded "Web (Next.js)" port from the Ports tab (port 4000
must stay reachable in the background for the web app's API calls to work).

Seeded logins:
  admin@ccip.local   / Admin@12345
  analyst@ccip.local / Analyst@12345
  viewer@ccip.local  / Viewer@12345
EOF
