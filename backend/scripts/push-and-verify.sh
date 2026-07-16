#!/usr/bin/env bash
# Push backend fixes and verify production sdkKey delivery.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Pushing to origin/main..."
git push origin main

echo "==> Waiting 90s for Render deploy..."
sleep 90

echo "==> Production health:"
curl -sS "https://zoomcontrol.onrender.com/api/health" | python3 -m json.tool

echo "==> Production login sdkKey check:"
curl -sS -X POST "https://zoomcontrol.onrender.com/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"vishal@test1.com","password":"123456789","device":{"deviceId":"deploy-verify"}}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('login_status',d.get('status')); print('login_sdkKey',d.get('sdkKey','MISSING'))"

echo "==> Done. If zoomSdkConfigured is true and login_sdkKey is set, Android can init Zoom SDK."
