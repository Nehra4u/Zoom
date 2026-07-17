# AWS Backend Migration Runbook

Complete these steps **after** `aws configure` succeeds (`aws sts get-caller-identity`).

## Step 1 — Create Elastic Beanstalk (todo: setup-eb)

```bash
cd /Users/amit/Desktop
export AWS_REGION=ap-south-1
./backend/scripts/setup-aws-eb.sh
./backend/scripts/attach-eb-s3-iam.sh
```

Note the API URL printed (or read `.deploy/aws-api-url.txt`).

Optional: attach HTTPS custom domain in EB → Configuration → Load balancer → add ACM certificate, then:

```bash
PUBLIC_API_URL=https://api.yourdomain.com ./backend/scripts/update-eb-public-url.sh
```

## Step 2 — Update Vercel admin (todo: update-vercel)

Get a token from https://vercel.com/account/tokens

```bash
export VERCEL_TOKEN=your_token
export API_URL=https://your-eb-or-custom-domain   # no trailing slash
./scripts/update-vercel-api-url.sh
```

This sets `VITE_API_URL`, updates `admin/.env.production`, and redeploys to production.

## Step 3 — Zoom webhook + verify (todo: update-zoom)

1. Zoom Marketplace → your app → **Event Subscriptions**
2. Set endpoint URL to:
   ```
   https://<PUBLIC_API_URL>/api/webhooks/zoom
   ```
3. Verify:

```bash
./scripts/post-deploy-verify.sh https://your-api-domain

# Optional full SDK audit
cd backend
PROD_API_BASE=https://your-api-domain/api \
APK_USERNAME=your-apk-user APK_PASSWORD=your-password \
npm run audit:prod-sdkkey
```

## GitHub repo

Code is pushed to: https://github.com/itrigerinnovationspvtltd/zoomcontrol

Auto-deploy (optional): add GitHub secrets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `EB_APPLICATION_NAME`, `EB_ENVIRONMENT_NAME` — see `.github/workflows/deploy-backend-eb.yml`.
