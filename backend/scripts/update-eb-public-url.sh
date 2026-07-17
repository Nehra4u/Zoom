#!/usr/bin/env bash
# Update Elastic Beanstalk PUBLIC_API_URL after HTTPS/domain is configured.
# Usage: PUBLIC_API_URL=https://api.example.com ./backend/scripts/update-eb-public-url.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_NAME="${EB_ENV_NAME:-$(cat "$ROOT/.deploy/eb-env-name.txt" 2>/dev/null || echo zoomcontrol-backend-prod)}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
PUBLIC_API_URL="${PUBLIC_API_URL:?Set PUBLIC_API_URL=https://your-api-domain}"

aws elasticbeanstalk update-environment \
  --environment-name "$ENV_NAME" \
  --region "$AWS_REGION" \
  --option-settings \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=PUBLIC_API_URL,Value=${PUBLIC_API_URL}"

echo "Updated PUBLIC_API_URL=$PUBLIC_API_URL on $ENV_NAME"
echo "Zoom webhook URL: ${PUBLIC_API_URL}/api/webhooks/zoom"
