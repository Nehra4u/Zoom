#!/usr/bin/env bash
# Attach S3 recordings policy to the Elastic Beanstalk EC2 instance role.
# Run after EB environment is created.
#
# Usage: ./backend/scripts/attach-eb-s3-iam.sh

set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-south-1}"
ENV_NAME="${EB_ENV_NAME:-zoomcontrol-backend-prod}"
POLICY_NAME="${IAM_POLICY_NAME:-ZoomControlS3RecordingsAccess}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
POLICY_FILE="$ROOT/infra/aws/iam-s3-recordings-policy.json"

aws sts get-caller-identity >/dev/null || { echo "Configure AWS CLI first" >&2; exit 1; }

INSTANCE_PROFILE=$(aws elasticbeanstalk describe-configuration-settings \
  --application-name "${EB_APP_NAME:-zoomcontrol-backend}" \
  --environment-name "$ENV_NAME" \
  --region "$AWS_REGION" \
  --query 'ConfigurationSettings[0].OptionSettings[?OptionName==`IamInstanceProfile`].Value' \
  --output text)

[[ -n "$INSTANCE_PROFILE" && "$INSTANCE_PROFILE" != "None" ]] || die "Could not find IamInstanceProfile for $ENV_NAME"

ROLE_NAME="${INSTANCE_PROFILE##*/}"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
POLICY_ARN="arn:aws:iam::${ACCOUNT}:policy/${POLICY_NAME}"

if ! aws iam get-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1; then
  echo "==> Creating IAM policy: $POLICY_NAME"
  aws iam create-policy \
    --policy-name "$POLICY_NAME" \
    --policy-document "file://${POLICY_FILE}"
else
  echo "==> Policy exists: $POLICY_NAME"
fi

echo "==> Attaching policy to role: $ROLE_NAME"
aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn "$POLICY_ARN"

echo "Done. Remove AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY from EB env — instance role handles S3."
