#!/usr/bin/env bash
# Set up HTTPS for ZoomControl backend on api.meetverdure.com
#
# Prerequisites: aws configure, EB env running, DNS access for meetverdure.com
#
# Usage:
#   export AWS_REGION=ap-south-1
#   ./backend/scripts/setup-https-domain.sh
#
# Or override:
#   DOMAIN=meetverdure.com API_SUBDOMAIN=api EB_ENV=zoomcontrol-backend-prod-v2 ./backend/scripts/setup-https-domain.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AWS_REGION="${AWS_REGION:-ap-south-1}"
DOMAIN="${DOMAIN:-meetverdure.com}"
API_SUBDOMAIN="${API_SUBDOMAIN:-api}"
API_HOST="${API_SUBDOMAIN}.${DOMAIN}"
PUBLIC_API_URL="https://${API_HOST}"
EB_ENV="${EB_ENV:-$(cat "$ROOT/.deploy/eb-env-name.txt" 2>/dev/null || echo zoomcontrol-backend-prod-v2)}"
CERT_ARN_FILE="$ROOT/.deploy/acm-cert-arn.txt"

die() { echo "ERROR: $*" >&2; exit 1; }

command -v aws >/dev/null || die "Run: aws configure"
aws sts get-caller-identity >/dev/null || die "AWS credentials not configured"

echo "==> Domain: $API_HOST"
echo "==> EB environment: $EB_ENV"
echo "==> Region: $AWS_REGION"

# --- Get EB CNAME for DNS instructions ---
EB_CNAME=$(aws elasticbeanstalk describe-environments \
  --environment-names "$EB_ENV" \
  --region "$AWS_REGION" \
  --query 'Environments[0].CNAME' --output text)
[[ -n "$EB_CNAME" && "$EB_CNAME" != "None" ]] || die "EB environment $EB_ENV not found or has no CNAME"

echo "==> EB CNAME: $EB_CNAME"

# --- ACM certificate (must be in same region as EB ALB: ap-south-1) ---
if [[ -f "$CERT_ARN_FILE" ]]; then
  CERT_ARN=$(cat "$CERT_ARN_FILE")
  echo "==> Using saved certificate: $CERT_ARN"
else
  echo "==> Requesting ACM certificate for $API_HOST ..."
  CERT_ARN=$(aws acm request-certificate \
    --domain-name "$API_HOST" \
    --validation-method DNS \
    --region "$AWS_REGION" \
    --query CertificateArn --output text)
  echo "$CERT_ARN" > "$CERT_ARN_FILE"
  echo "==> Certificate ARN saved to .deploy/acm-cert-arn.txt"
fi

echo ""
echo "============================================"
echo " STEP 1 — Add these DNS records at your domain registrar"
echo "         (GoDaddy / Namecheap / Cloudflare / Route53)"
echo "============================================"
echo ""

# Certificate validation records
echo "--- ACM validation (required for SSL) ---"
aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region "$AWS_REGION" \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord' \
  --output table 2>/dev/null || echo "(Certificate pending — run this script again in 1 minute)"

echo ""
echo "--- API routing (required after cert is issued) ---"
echo "Type:  CNAME"
echo "Name:  $API_SUBDOMAIN"
echo "Value: $EB_CNAME"
echo "TTL:   300 (or default)"
echo ""
echo "Full API URL will be: $PUBLIC_API_URL"
echo "============================================"
echo ""

CERT_STATUS=$(aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region "$AWS_REGION" \
  --query 'Certificate.Status' --output text)

if [[ "$CERT_STATUS" != "ISSUED" ]]; then
  echo "Certificate status: $CERT_STATUS"
  echo ""
  echo "Add the ACM validation CNAME above, wait 5–30 minutes, then re-run:"
  echo "  ./backend/scripts/setup-https-domain.sh"
  echo ""
  echo "Check status:"
  echo "  aws acm describe-certificate --certificate-arn $CERT_ARN --region $AWS_REGION --query Certificate.Status"
  exit 0
fi

echo "==> Certificate ISSUED. Configuring EB HTTPS listener on port 443 ..."

aws elasticbeanstalk update-environment \
  --environment-name "$EB_ENV" \
  --region "$AWS_REGION" \
  --option-settings \
    "Namespace=aws:elbv2:listener:443,OptionName=ListenerEnabled,Value=true" \
    "Namespace=aws:elbv2:listener:443,OptionName=Protocol,Value=HTTPS" \
    "Namespace=aws:elbv2:listener:443,OptionName=SSLCertificateArns,Value=$CERT_ARN" \
    "Namespace=aws:elbv2:listener:443,OptionName=DefaultProcess,Value=default" \
  --query Status --output text

echo "==> Waiting for EB update ..."
aws elasticbeanstalk wait environment-updated \
  --environment-names "$EB_ENV" \
  --region "$AWS_REGION"

echo "==> Setting PUBLIC_API_URL=$PUBLIC_API_URL"
PUBLIC_API_URL="$PUBLIC_API_URL" EB_ENV_NAME="$EB_ENV" "$ROOT/backend/scripts/update-eb-public-url.sh"

mkdir -p "$ROOT/.deploy"
echo "$PUBLIC_API_URL" > "$ROOT/.deploy/aws-api-url.txt"

echo ""
echo "==> Waiting for DNS (api CNAME) to propagate ..."
sleep 5

if curl -sf --max-time 15 "${PUBLIC_API_URL}/api/health" >/dev/null 2>&1; then
  echo "==> HTTPS health check PASSED"
  curl -sf "${PUBLIC_API_URL}/api/health" | head -c 300
  echo ""
else
  echo "WARN: HTTPS health check not reachable yet."
  echo "      Ensure CNAME $API_SUBDOMAIN -> $EB_CNAME is added and propagated."
  echo "      Test: curl ${PUBLIC_API_URL}/api/health"
fi

echo ""
echo "============================================"
echo " NEXT STEPS"
echo "============================================"
echo "1. Confirm DNS CNAME: $API_SUBDOMAIN -> $EB_CNAME"
echo "2. Update Vercel admin:"
echo "     API_URL=$PUBLIC_API_URL ./scripts/update-vercel-api-url.sh"
echo "3. Update Zoom webhook:"
echo "     ${PUBLIC_API_URL}/api/webhooks/zoom"
echo "4. Test admin: https://zoomcontrol-admin.vercel.app"
echo "============================================"
