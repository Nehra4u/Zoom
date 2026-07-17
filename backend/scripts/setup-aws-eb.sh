#!/usr/bin/env bash
# Create ZoomControl backend on AWS Elastic Beanstalk (Node.js 20).
# Requires: AWS CLI configured (aws configure or AWS_* env vars), zip, jq optional.
#
# Usage:
#   export AWS_REGION=ap-south-1
#   ./backend/scripts/setup-aws-eb.sh
#
# Reads secrets from backend/.env (gitignored). Never commit that file.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND="$ROOT/backend"
ENV_FILE="${ENV_FILE:-$BACKEND/.env}"

APP_NAME="${EB_APP_NAME:-zoomcontrol-backend}"
ENV_NAME="${EB_ENV_NAME:-zoomcontrol-backend-prod}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
S3_BUCKET="${AWS_S3_BUCKET:-zoomcontrol-recordings}"
ADMIN_URL="${ADMIN_PORTAL_URL:-https://zoomcontrol-admin.vercel.app}"

die() { echo "ERROR: $*" >&2; exit 1; }

command -v aws >/dev/null || die "AWS CLI not found. Run: aws configure"
aws sts get-caller-identity >/dev/null || die "AWS credentials not configured"
[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE — copy backend/.env.example and fill values"

echo "==> Using AWS account:"
aws sts get-caller-identity
echo "==> Region: $AWS_REGION | App: $APP_NAME | Env: $ENV_NAME"

# --- S3 bucket for recordings (idempotent, optional) ---
if aws s3api head-bucket --bucket "$S3_BUCKET" 2>/dev/null; then
  echo "==> S3 bucket exists: $S3_BUCKET"
else
  echo "==> Creating S3 bucket: $S3_BUCKET"
  CREATE_OK=false
  if [[ "$AWS_REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$S3_BUCKET" 2>/dev/null && CREATE_OK=true
  else
    aws s3api create-bucket --bucket "$S3_BUCKET" \
      --create-bucket-configuration "LocationConstraint=$AWS_REGION" 2>/dev/null && CREATE_OK=true
  fi
  if [[ "$CREATE_OK" != "true" ]]; then
    echo "WARN: Could not create S3 bucket $S3_BUCKET (missing s3:CreateBucket?)."
    echo "      Create it manually in AWS Console ($AWS_REGION), then run attach-eb-s3-iam.sh"
  fi
fi

# --- EB application ---
if ! aws elasticbeanstalk describe-applications --application-names "$APP_NAME" \
  --region "$AWS_REGION" --query 'Applications[0].ApplicationName' --output text 2>/dev/null | grep -q "$APP_NAME"; then
  echo "==> Creating EB application: $APP_NAME"
  aws elasticbeanstalk create-application \
    --application-name "$APP_NAME" \
    --description "ZoomControl Express + Socket.io API" \
    --region "$AWS_REGION"
else
  echo "==> EB application exists: $APP_NAME"
fi

# --- Resolve Node.js 20 platform ---
STACK=$(aws elasticbeanstalk list-available-solution-stacks \
  --region "$AWS_REGION" \
  --query "SolutionStacks[?contains(@, 'Node.js 20') && contains(@, 'Amazon Linux 2023')] | [0]" \
  --output text)
[[ -n "$STACK" && "$STACK" != "None" ]] || die "Could not find Node.js 20 AL2023 platform stack"
echo "==> Platform: $STACK"

# --- Build deployment zip ---
VERSION_LABEL="v$(date +%Y%m%d%H%M%S)-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)"
ZIP="/tmp/zoomcontrol-backend-${VERSION_LABEL}.zip"
echo "==> Packaging $ZIP"
(
  cd "$BACKEND"
  zip -r "$ZIP" . \
    -x "node_modules/*" \
    -x ".env" \
    -x ".env.*" \
    -x "!.env.example" \
    >/dev/null
)

# --- Upload to EB-managed bucket ---
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
EB_BUCKET="elasticbeanstalk-${AWS_REGION}-${ACCOUNT}"
aws s3 mb "s3://${EB_BUCKET}" --region "$AWS_REGION" 2>/dev/null || true
S3_KEY="${APP_NAME}/${VERSION_LABEL}.zip"
aws s3 cp "$ZIP" "s3://${EB_BUCKET}/${S3_KEY}" --region "$AWS_REGION"

echo "==> Creating application version: $VERSION_LABEL"
aws elasticbeanstalk create-application-version \
  --application-name "$APP_NAME" \
  --version-label "$VERSION_LABEL" \
  --source-bundle "S3Bucket=${EB_BUCKET},S3Key=${S3_KEY}" \
  --region "$AWS_REGION"

# --- Load env vars from .env (skip comments/blanks) ---
load_env() {
  grep -E '^[A-Z_]+=' "$ENV_FILE" | grep -v '^#' || true
}

build_option_settings() {
  local key val settings=()
  while IFS= read -r line; do
    key="${line%%=*}"
    val="${line#*=}"
    # Skip local-only keys; EB sets PORT/NODE_ENV
    case "$key" in
      PORT|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|PUBLIC_API_URL) continue ;;
    esac
    settings+=("Namespace=aws:elasticbeanstalk:application:environment,OptionName=${key},Value=${val}")
  done < <(load_env)

  settings+=("Namespace=aws:elasticbeanstalk:application:environment,OptionName=NODE_ENV,Value=production")
  settings+=("Namespace=aws:elasticbeanstalk:application:environment,OptionName=PORT,Value=8080")
  settings+=("Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_REGION,Value=${AWS_REGION}")
  settings+=("Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_S3_BUCKET,Value=${S3_BUCKET}")
  settings+=("Namespace=aws:elasticbeanstalk:application:environment,OptionName=ADMIN_PORTAL_URL,Value=${ADMIN_URL}")
  settings+=("Namespace=aws:elasticbeanstalk:application:environment,OptionName=ZOOM_MOCK,Value=false")
  settings+=("Namespace=aws:autoscaling:launchconfiguration,OptionName=IamInstanceProfile,Value=aws-elasticbeanstalk-ec2-role")
  settings+=("Namespace=aws:elasticbeanstalk:environment,OptionName=ServiceRole,Value=aws-elasticbeanstalk-service-role")

  printf '%s\n' "${settings[@]}"
}

run_with_option_settings() {
  local aws_cmd=$1
  shift
  local OPT_ARGS=()
  local s
  while IFS= read -r s; do
    [[ -n "$s" ]] && OPT_ARGS+=(--option-settings "$s")
  done < <(build_option_settings)
  "$aws_cmd" "$@" "${OPT_ARGS[@]}"
}

# --- Create or update environment ---
if aws elasticbeanstalk describe-environments \
  --application-name "$APP_NAME" \
  --environment-names "$ENV_NAME" \
  --region "$AWS_REGION" \
  --query 'Environments[?Status!=`Terminated`].EnvironmentName' \
  --output text 2>/dev/null | grep -q "$ENV_NAME"; then
  echo "==> Updating existing environment: $ENV_NAME"
  run_with_option_settings aws elasticbeanstalk update-environment \
    --environment-name "$ENV_NAME" \
    --version-label "$VERSION_LABEL" \
    --region "$AWS_REGION"
else
  echo "==> Creating environment: $ENV_NAME (5–10 min)"
  run_with_option_settings aws elasticbeanstalk create-environment \
    --application-name "$APP_NAME" \
    --environment-name "$ENV_NAME" \
    --solution-stack-name "$STACK" \
    --version-label "$VERSION_LABEL" \
    --tier Name=WebServer,Type=Standard \
    --region "$AWS_REGION"
fi

echo "==> Waiting for environment to become Ready..."
aws elasticbeanstalk wait environment-updated \
  --environment-names "$ENV_NAME" \
  --region "$AWS_REGION"

CNAME=$(aws elasticbeanstalk describe-environments \
  --environment-names "$ENV_NAME" \
  --region "$AWS_REGION" \
  --query 'Environments[0].CNAME' \
  --output text)

API_URL="http://${CNAME}"
echo ""
echo "==> Setting PUBLIC_API_URL on environment..."
aws elasticbeanstalk update-environment \
  --environment-name "$ENV_NAME" \
  --region "$AWS_REGION" \
  --option-settings \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=PUBLIC_API_URL,Value=${API_URL}" \
  >/dev/null
aws elasticbeanstalk wait environment-updated \
  --environment-names "$ENV_NAME" \
  --region "$AWS_REGION"

echo ""
echo "============================================"
echo " EB environment ready"
echo " URL: $API_URL"
echo " Health: ${API_URL}/api/health"
echo "============================================"
echo ""
echo "Next: set HTTPS + PUBLIC_API_URL, then run:"
echo "  PUBLIC_API_URL=https://your-domain ./scripts/update-vercel-api-url.sh"
echo "  ./scripts/post-deploy-verify.sh $API_URL"

# Write URL for other scripts
mkdir -p "$ROOT/.deploy"
echo "$API_URL" > "$ROOT/.deploy/aws-api-url.txt"
echo "$ENV_NAME" > "$ROOT/.deploy/eb-env-name.txt"
