#!/usr/bin/env bash
# Host ZoomControl admin frontend on AWS (S3 + CloudFront + ACM).
#
# Prerequisites:
#   - aws configure (zoomcontrol-deploy user)
#   - Attach infra/aws/iam-admin-frontend-policy.json to IAM user (CloudFront permissions)
#   - DNS access for meetverdure.com
#
# Usage:
#   export AWS_REGION=ap-south-1
#   ./scripts/setup-aws-admin-frontend.sh
#
# Optional:
#   ADMIN_BUCKET=zoomcontrol-admin-prod-639355809057
#   ADMIN_HOST=admin.meetverdure.com
#   DOMAIN=meetverdure.com

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="$ROOT/.deploy"
AWS_REGION="${AWS_REGION:-ap-south-1}"
ACM_REGION="us-east-1"
DOMAIN="${DOMAIN:-meetverdure.com}"
ADMIN_SUBDOMAIN="${ADMIN_SUBDOMAIN:-admin}"
ADMIN_HOST="${ADMIN_HOST:-${ADMIN_SUBDOMAIN}.${DOMAIN}}"
ADMIN_BUCKET="${ADMIN_BUCKET:-zoomcontrol-admin-prod-639355809057}"
ADMIN_URL="https://${ADMIN_HOST}"
CERT_ARN_FILE="$DEPLOY_DIR/admin-acm-cert-arn.txt"
OAC_ID_FILE="$DEPLOY_DIR/admin-oac-id.txt"
CF_ID_FILE="$DEPLOY_DIR/admin-cloudfront-id.txt"
CF_DOMAIN_FILE="$DEPLOY_DIR/admin-cloudfront-domain.txt"
ZOOM_HEADERS_POLICY_FILE="$DEPLOY_DIR/admin-zoom-headers-policy-id.txt"
EB_ENV="${EB_ENV:-$(cat "$DEPLOY_DIR/eb-env-name.txt" 2>/dev/null || echo zoomcontrol-backend-prod-v2)}"

die() { echo "ERROR: $*" >&2; exit 1; }

command -v aws >/dev/null || die "Run: aws configure"
aws sts get-caller-identity >/dev/null || die "AWS credentials not configured"

mkdir -p "$DEPLOY_DIR"
echo "$ADMIN_BUCKET" > "$DEPLOY_DIR/admin-s3-bucket.txt"

echo "==> Admin host: $ADMIN_HOST"
echo "==> S3 bucket: $ADMIN_BUCKET"
echo "==> Region: $AWS_REGION (S3/EB), $ACM_REGION (ACM for CloudFront)"

if ! aws s3api head-bucket --bucket "$ADMIN_BUCKET" --region "$AWS_REGION" 2>/dev/null; then
  die "S3 bucket $ADMIN_BUCKET not found. Create it first (Step 3)."
fi

# --- ACM certificate (must be us-east-1 for CloudFront) ---
if [[ -f "$CERT_ARN_FILE" ]]; then
  CERT_ARN=$(cat "$CERT_ARN_FILE")
  echo "==> Using saved ACM cert: $CERT_ARN"
else
  echo "==> Requesting ACM certificate for $ADMIN_HOST (region $ACM_REGION) ..."
  CERT_ARN=$(aws acm request-certificate \
    --domain-name "$ADMIN_HOST" \
    --validation-method DNS \
    --region "$ACM_REGION" \
    --query CertificateArn --output text)
  echo "$CERT_ARN" > "$CERT_ARN_FILE"
fi

echo ""
echo "============================================"
echo " DNS — ACM validation for admin SSL"
echo "============================================"
aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region "$ACM_REGION" \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord' \
  --output table 2>/dev/null || echo "(Pending — re-run in 1 minute)"

CERT_STATUS=$(aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region "$ACM_REGION" \
  --query 'Certificate.Status' --output text)

if [[ "$CERT_STATUS" != "ISSUED" ]]; then
  echo ""
  echo "Certificate status: $CERT_STATUS"
  echo "Add the CNAME above at your domain registrar, wait 5–30 min, then re-run this script."
  echo "============================================"
  exit 0
fi

echo "==> Certificate ISSUED"

# --- Origin Access Control ---
if [[ -f "$OAC_ID_FILE" ]]; then
  OAC_ID=$(cat "$OAC_ID_FILE")
  echo "==> Using saved OAC: $OAC_ID"
else
  echo "==> Creating CloudFront Origin Access Control ..."
  OAC_ID=$(aws cloudfront create-origin-access-control \
    --origin-access-control-config "Name=zoomcontrol-admin-oac,Description=ZoomControl admin S3 OAC,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
    --query 'OriginAccessControl.Id' --output text)
  echo "$OAC_ID" > "$OAC_ID_FILE"
fi

# --- Response headers policy for Zoom SDK pages ---
if [[ -f "$ZOOM_HEADERS_POLICY_FILE" ]]; then
  ZOOM_HEADERS_POLICY_ID=$(cat "$ZOOM_HEADERS_POLICY_FILE")
else
  echo "==> Creating CloudFront response headers policy (COOP/COEP for Zoom) ..."
  ZOOM_HEADERS_POLICY_ID=$(aws cloudfront create-response-headers-policy \
    --response-headers-policy-config "{
      \"Name\": \"zoomcontrol-admin-zoom-headers-$(date +%s)\",
      \"Comment\": \"COOP/COEP for Zoom Meeting SDK\",
      \"CustomHeadersConfig\": {
        \"Quantity\": 2,
        \"Items\": [
          {\"Header\": \"Cross-Origin-Opener-Policy\", \"Value\": \"same-origin\", \"Override\": true},
          {\"Header\": \"Cross-Origin-Embedder-Policy\", \"Value\": \"credentialless\", \"Override\": true}
        ]
      }
    }" \
    --query 'ResponseHeadersPolicy.Id' --output text)
  echo "$ZOOM_HEADERS_POLICY_ID" > "$ZOOM_HEADERS_POLICY_FILE"
fi

ORIGIN_DOMAIN="${ADMIN_BUCKET}.s3.${AWS_REGION}.amazonaws.com"
ORIGIN_ID="S3-${ADMIN_BUCKET}"
CALLER_REF="zoomcontrol-admin-$(date +%s)"
CACHE_POLICY="658327ea-f89d-4fab-a63d-7e88639e58f6"

make_zoom_behavior() {
  local path_pattern=$1
  cat <<EOF
{
  "PathPattern": "$path_pattern",
  "TargetOriginId": "$ORIGIN_ID",
  "ViewerProtocolPolicy": "redirect-to-https",
  "AllowedMethods": {
    "Quantity": 2,
    "Items": ["GET", "HEAD"],
    "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]}
  },
  "Compress": true,
  "CachePolicyId": "$CACHE_POLICY",
  "ResponseHeadersPolicyId": "$ZOOM_HEADERS_POLICY_ID"
}
EOF
}

DIST_CONFIG=$(mktemp)
cat > "$DIST_CONFIG" <<EOF
{
  "CallerReference": "$CALLER_REF",
  "Comment": "ZoomControl admin portal",
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "$ORIGIN_ID",
      "DomainName": "$ORIGIN_DOMAIN",
      "OriginAccessControlId": "$OAC_ID",
      "S3OriginConfig": {"OriginAccessIdentity": ""}
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "$ORIGIN_ID",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"],
      "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]}
    },
    "Compress": true,
    "CachePolicyId": "$CACHE_POLICY"
  },
  "CacheBehaviors": {
    "Quantity": 3,
    "Items": [
      $(make_zoom_behavior "/zoom-join.html"),
      $(make_zoom_behavior "/zoom-leave.html"),
      $(make_zoom_behavior "/zoom/*")
    ]
  },
  "CustomErrorResponses": {
    "Quantity": 2,
    "Items": [
      {"ErrorCode": 403, "ResponsePagePath": "/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 0},
      {"ErrorCode": 404, "ResponsePagePath": "/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 0}
    ]
  },
  "Aliases": {"Quantity": 1, "Items": ["$ADMIN_HOST"]},
  "ViewerCertificate": {
    "ACMCertificateArn": "$CERT_ARN",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021"
  },
  "Enabled": true,
  "PriceClass": "PriceClass_200",
  "HttpVersion": "http2and3"
}
EOF

if [[ -f "$CF_ID_FILE" ]]; then
  CF_ID=$(cat "$CF_ID_FILE")
  echo "==> CloudFront distribution already exists: $CF_ID"
else
  echo "==> Creating CloudFront distribution (5–15 min to deploy) ..."
  CF_ID=$(aws cloudfront create-distribution \
    --distribution-config "file://$DIST_CONFIG" \
    --query 'Distribution.Id' --output text)
  echo "$CF_ID" > "$CF_ID_FILE"
fi
rm -f "$DIST_CONFIG"

CF_DOMAIN=$(aws cloudfront get-distribution \
  --id "$CF_ID" \
  --query 'Distribution.DomainName' --output text)
echo "$CF_DOMAIN" > "$CF_DOMAIN_FILE"

echo "==> Updating S3 bucket policy for CloudFront OAC ..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontServicePrincipal",
    "Effect": "Allow",
    "Principal": {"Service": "cloudfront.amazonaws.com"},
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::${ADMIN_BUCKET}/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${CF_ID}"
      }
    }
  }]
}
EOF
)
aws s3api put-bucket-policy --bucket "$ADMIN_BUCKET" --policy "$BUCKET_POLICY"

echo ""
echo "============================================"
echo " DNS — point admin subdomain to CloudFront"
echo "============================================"
echo "Type:  CNAME"
echo "Name:  $ADMIN_SUBDOMAIN"
echo "Value: $CF_DOMAIN"
echo "TTL:   300"
echo ""
echo "Admin URL: $ADMIN_URL"
echo "CloudFront ID: $CF_ID"
echo "============================================"

echo "==> Updating EB ADMIN_PORTAL_URL on $EB_ENV ..."
aws elasticbeanstalk update-environment \
  --environment-name "$EB_ENV" \
  --region "$AWS_REGION" \
  --option-settings \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=ADMIN_PORTAL_URL,Value=${ADMIN_URL}" \
  >/dev/null

echo "==> Deploying latest build to S3 ..."
chmod +x "$ROOT/scripts/deploy-admin-frontend.sh"
CLOUDFRONT_DISTRIBUTION_ID="$CF_ID" ADMIN_BUCKET="$ADMIN_BUCKET" "$ROOT/scripts/deploy-admin-frontend.sh"

echo ""
echo "Done. After DNS propagates, open: $ADMIN_URL"
echo "Verify backend CORS: curl -I -X OPTIONS $ADMIN_URL -H 'Origin: $ADMIN_URL'"
