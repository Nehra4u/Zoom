#!/usr/bin/env bash
# Set ADMIN_PORTAL_URL on Elastic Beanstalk (CORS + Socket.io).
# Usage: ADMIN_PORTAL_URL=https://admin.meetverdure.com ./backend/scripts/update-eb-admin-portal-url.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_NAME="${EB_ENV_NAME:-$(cat "$ROOT/.deploy/eb-env-name.txt" 2>/dev/null || echo zoomcontrol-backend-prod-v2)}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
ADMIN_PORTAL_URL="${ADMIN_PORTAL_URL:?Set ADMIN_PORTAL_URL=https://admin.meetverdure.com}"
ADMIN_PORTAL_URL="${ADMIN_PORTAL_URL%/}"

aws elasticbeanstalk update-environment \
  --environment-name "$ENV_NAME" \
  --region "$AWS_REGION" \
  --option-settings \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=ADMIN_PORTAL_URL,Value=${ADMIN_PORTAL_URL}"

echo "Updated ADMIN_PORTAL_URL=$ADMIN_PORTAL_URL on $ENV_NAME"
