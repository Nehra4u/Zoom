#!/usr/bin/env bash
# Build and upload ZoomControl admin frontend to S3, then invalidate CloudFront cache.
#
# Usage:
#   ./scripts/deploy-admin-frontend.sh
#
# Optional env:
#   ADMIN_BUCKET=zoomcontrol-admin-prod-639355809057
#   CLOUDFRONT_DISTRIBUTION_ID=E1234567890ABC
#   VITE_API_URL=                    # empty = same-origin /api via CloudFront proxy (recommended for AWS)
#   VITE_API_URL=https://api.meetverdure.com  # direct cross-origin API (Vercel / no proxy)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN="$ROOT/admin"
DEPLOY_DIR="$ROOT/.deploy"
AWS_REGION="${AWS_REGION:-ap-south-1}"
ADMIN_BUCKET="${ADMIN_BUCKET:-$(cat "$DEPLOY_DIR/admin-s3-bucket.txt" 2>/dev/null || echo zoomcontrol-admin-prod-639355809057)}"
# Default empty for AWS (CloudFront proxies /api to backend). Set explicitly for Vercel builds.
VITE_API_URL="${VITE_API_URL-}"
DIST_ID="${CLOUDFRONT_DISTRIBUTION_ID:-$(cat "$DEPLOY_DIR/admin-cloudfront-id.txt" 2>/dev/null || true)}"

die() { echo "ERROR: $*" >&2; exit 1; }

command -v aws >/dev/null || die "Run: aws configure"
aws sts get-caller-identity >/dev/null || die "AWS credentials not configured"

echo "==> Building admin (VITE_API_URL=$VITE_API_URL)"
echo "VITE_API_URL=$VITE_API_URL" > "$ADMIN/.env.production"
(
  cd "$ADMIN"
  npm run build
)

echo "==> Syncing dist/ -> s3://$ADMIN_BUCKET/"
aws s3 sync "$ADMIN/dist/" "s3://$ADMIN_BUCKET/" \
  --region "$AWS_REGION" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html" \
  --exclude "zoom-join.html" \
  --exclude "zoom-leave.html"

for page in index.html zoom-join.html zoom-leave.html; do
  if [[ -f "$ADMIN/dist/$page" ]]; then
    aws s3 cp "$ADMIN/dist/$page" "s3://$ADMIN_BUCKET/$page" \
      --region "$AWS_REGION" \
      --cache-control "public, max-age=0, must-revalidate" \
      --content-type "text/html"
  fi
done

if [[ -n "$DIST_ID" ]]; then
  echo "==> Invalidating CloudFront cache: $DIST_ID"
  aws cloudfront create-invalidation \
    --distribution-id "$DIST_ID" \
    --paths "/*" \
    --query 'Invalidation.Id' \
    --output text
else
  echo "WARN: No CloudFront distribution ID (.deploy/admin-cloudfront-id.txt). Skipping invalidation."
fi

echo "==> Deploy complete."
