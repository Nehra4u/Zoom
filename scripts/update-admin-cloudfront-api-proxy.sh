#!/usr/bin/env bash
# Proxy /api/* and /socket.io/* from admin CloudFront to the backend API.
# After this, deploy admin with VITE_API_URL empty so requests are same-origin (no CORS).
#
# Usage: ./scripts/update-admin-cloudfront-api-proxy.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="$ROOT/.deploy"
CF_ID="${CLOUDFRONT_DISTRIBUTION_ID:-$(cat "$DEPLOY_DIR/admin-cloudfront-id.txt" 2>/dev/null || true)}"
API_ORIGIN_DOMAIN="${API_ORIGIN_DOMAIN:-api.meetverdure.com}"
API_ORIGIN_ID="api-meetverdure-backend"

# AWS managed policies
CACHE_DISABLED="4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
ORIGIN_ALL_VIEWER="216adef6-5c7f-47e4-b989-5492eafa07d3"

die() { echo "ERROR: $*" >&2; exit 1; }
[[ -n "$CF_ID" ]] || die "CloudFront distribution ID not found (.deploy/admin-cloudfront-id.txt)"

echo "==> Updating CloudFront $CF_ID to proxy /api/* and /socket.io/* -> $API_ORIGIN_DOMAIN"

TMP=$(mktemp)
aws cloudfront get-distribution-config --id "$CF_ID" > "$TMP"
ETAG=$(python3 -c "import json; print(json.load(open('$TMP'))['ETag'])")

python3 - "$TMP" "$API_ORIGIN_ID" "$API_ORIGIN_DOMAIN" "$CACHE_DISABLED" "$ORIGIN_ALL_VIEWER" <<'PY'
import json
import sys

config_path, api_origin_id, api_domain, cache_disabled, origin_all_viewer = sys.argv[1:6]
data = json.load(open(config_path))
config = data["DistributionConfig"]

origins = config["Origins"]["Items"]
if not any(o["Id"] == api_origin_id for o in origins):
    origins.append({
        "Id": api_origin_id,
        "DomainName": api_domain,
        "OriginPath": "",
        "CustomHeaders": {"Quantity": 0},
        "CustomOriginConfig": {
            "HTTPPort": 80,
            "HTTPSPort": 443,
            "OriginProtocolPolicy": "https-only",
            "OriginSslProtocols": {"Quantity": 1, "Items": ["TLSv1.2"]},
            "OriginReadTimeout": 60,
            "OriginKeepaliveTimeout": 5,
        },
        "ConnectionAttempts": 3,
        "ConnectionTimeout": 10,
        "OriginShield": {"Enabled": False},
    })
config["Origins"]["Quantity"] = len(origins)

def make_api_behavior(path_pattern: str) -> dict:
    return {
        "PathPattern": path_pattern,
        "TargetOriginId": api_origin_id,
        "TrustedSigners": {"Enabled": False, "Quantity": 0},
        "TrustedKeyGroups": {"Enabled": False, "Quantity": 0},
        "ViewerProtocolPolicy": "redirect-to-https",
        "AllowedMethods": {
            "Quantity": 7,
            "Items": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
            "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]},
        },
        "SmoothStreaming": False,
        "Compress": True,
        "LambdaFunctionAssociations": {"Quantity": 0},
        "FunctionAssociations": {"Quantity": 0},
        "FieldLevelEncryptionId": "",
        "CachePolicyId": cache_disabled,
        "OriginRequestPolicyId": origin_all_viewer,
        "GrpcConfig": {"Enabled": False},
    }

existing = config.get("CacheBehaviors", {"Quantity": 0, "Items": []})
items = existing.get("Items") or []
filtered = [b for b in items if b.get("PathPattern") not in ("/api/*", "/socket.io/*")]
for pattern in ("/api/*", "/socket.io/*"):
    filtered.append(make_api_behavior(pattern))

config["CacheBehaviors"] = {"Quantity": len(filtered), "Items": filtered}

out = config_path + ".new"
json.dump(config, open(out, "w"))
print(out)
PY

NEW_CONFIG="${TMP}.new"
aws cloudfront update-distribution \
  --id "$CF_ID" \
  --if-match "$ETAG" \
  --distribution-config "file://$NEW_CONFIG" \
  --query 'Distribution.{Id:Id,Status:Status,DomainName:DomainName}' \
  --output json

rm -f "$TMP" "$NEW_CONFIG"

echo "==> CloudFront API proxy enabled (may take a few minutes to deploy)."
echo "    Redeploy admin with: VITE_API_URL= ./scripts/deploy-admin-frontend.sh"
