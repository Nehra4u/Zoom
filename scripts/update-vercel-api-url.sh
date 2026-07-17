#!/usr/bin/env bash
# Update Vercel admin VITE_API_URL and trigger redeploy.
# Requires VERCEL_TOKEN (https://vercel.com/account/tokens)
#
# Usage:
#   VERCEL_TOKEN=xxx API_URL=https://your-eb-domain ./scripts/update-vercel-api-url.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN="$ROOT/admin"
API_URL="${API_URL:-${PUBLIC_API_URL:-$(cat "$ROOT/.deploy/aws-api-url.txt" 2>/dev/null || true)}}"
API_URL="${API_URL%/}"

[[ -n "$API_URL" ]] || { echo "Set API_URL or run setup-aws-eb.sh first" >&2; exit 1; }
[[ -n "${VERCEL_TOKEN:-}" ]] || { echo "Set VERCEL_TOKEN to deploy via CLI" >&2; exit 1; }

echo "==> Setting VITE_API_URL=$API_URL on Vercel (zoomcontrol-admin)"

# Update local reference file (safe to commit — public URL only)
echo "VITE_API_URL=$API_URL" > "$ADMIN/.env.production"

# Deploy with env var baked in at build time
cd "$ADMIN"
npx --yes vercel@latest deploy --prod \
  --token "$VERCEL_TOKEN" \
  --yes \
  --env "VITE_API_URL=$API_URL"

echo "==> Admin redeployed. API base: ${API_URL}/api"
