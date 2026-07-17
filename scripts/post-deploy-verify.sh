#!/usr/bin/env bash
# Post-deploy verification for ZoomControl backend on AWS.
# Usage: ./scripts/post-deploy-verify.sh [https://api-url]

set -euo pipefail

API_BASE="${1:-$(cat "$(dirname "$0")/../.deploy/aws-api-url.txt" 2>/dev/null || true)}"
API_BASE="${API_BASE%/}"
[[ -n "$API_BASE" ]] || { echo "Usage: $0 https://your-api-url" >&2; exit 1; }

echo "==> Health check: ${API_BASE}/api/health"
HEALTH=$(curl -sf "${API_BASE}/api/health")
echo "$HEALTH" | head -c 500
echo ""

echo "$HEALTH" | grep -q '"ok":true' || { echo "Health check failed" >&2; exit 1; }

echo "==> Zoom SDK configured:"
echo "$HEALTH" | grep -o '"zoomSdkConfigured":[^,]*' || true

echo ""
echo "==> Zoom webhook URL (register in Zoom Marketplace):"
echo "   ${API_BASE}/api/webhooks/zoom"
echo ""
echo "==> Optional SDK audit (set APK_USERNAME + APK_PASSWORD):"
echo "   cd backend && PROD_API_BASE=${API_BASE}/api npm run audit:prod-sdkkey"

if [[ -n "${APK_USERNAME:-}" && -n "${APK_PASSWORD:-}" ]]; then
  cd "$(dirname "$0")/../backend"
  PROD_API_BASE="${API_BASE}/api" npm run audit:prod-sdkkey
fi

echo "==> Verification complete"
