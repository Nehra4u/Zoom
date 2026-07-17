# Deploy Backend to AWS Elastic Beanstalk

The admin portal stays on **Vercel**. Only the Node.js API + WebSocket server moves to AWS.

## Architecture

```
Vercel (admin) ──REST/WS──► Elastic Beanstalk (backend) ──► MongoDB Atlas
                                    │
                                    ├──► AWS S3 (recordings)
                                    └──► Zoom APIs / webhooks
Android APK ──REST/WS────────────────┘
```

## Prerequisites

| Item | Notes |
|------|-------|
| AWS account | Region: `ap-south-1` (matches S3 bucket) |
| MongoDB Atlas | Keep existing `MONGODB_URI` |
| S3 bucket | `zoomcontrol-recordings` (or your bucket name) |
| GitHub repo | `itrigerinnovationspvtltd/zoomcontrol` |
| Zoom Marketplace | Meeting SDK + S2S OAuth apps configured |

## 1. IAM role for Elastic Beanstalk instances

Create an IAM policy (or attach inline) to the **EC2 instance profile** used by EB:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::zoomcontrol-recordings",
        "arn:aws:s3:::zoomcontrol-recordings/*"
      ]
    }
  ]
}
```

When this role is attached, **do not set** `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in EB env vars. The SDK picks up the instance profile automatically (see `src/services/s3Service.js`).

## 2. Create Elastic Beanstalk application

1. AWS Console → **Elastic Beanstalk** → Create application
2. **Application name:** `zoomcontrol-backend`
3. **Platform:** Node.js 20 running on 64bit Amazon Linux 2023
4. **Application code:** Upload `backend/` as zip **or** connect GitHub repo with source at `backend/`

### Build settings (if using GitHub)

| Setting | Value |
|---------|-------|
| Root directory | `backend` |
| Build command | `npm install` |
| Start command | `npm start` |

### Load balancer & health

| Setting | Value |
|---------|-------|
| Load balancer type | Application Load Balancer |
| Health check path | `/api/health` |
| Stickiness | Enabled (via `.ebextensions/01_websocket.config`) |

WebSocket proxy is configured in `.platform/nginx/conf.d/websocket.conf`.

## 3. Environment variables

Set these in **EB → Configuration → Software → Environment properties**.

### Non-secret

| Variable | Example |
|----------|---------|
| `NODE_ENV` | `production` |
| `PORT` | `8080` |
| `PUBLIC_API_URL` | `https://api.yourdomain.com` (no trailing slash) |
| `ADMIN_PORTAL_URL` | `https://your-admin.vercel.app` |
| `AWS_REGION` | `ap-south-1` |
| `AWS_S3_BUCKET` | `zoomcontrol-recordings` |
| `AWS_S3_VOICE_PREFIX` | `user-voice/` |
| `ZOOM_MOCK` | `false` |
| `RECONCILE_ENABLED` | `true` |
| `RECONCILE_INTERVAL_MS` | `60000` |

### Secrets (mark as secure in EB, or use AWS Secrets Manager)

| Variable | Notes |
|----------|-------|
| `MONGODB_URI` | Atlas connection string |
| `JWT_ACCESS_SECRET` | 64+ char hex |
| `JWT_CLIENT_SECRET` | 64+ char hex |
| `JWT_REFRESH_SECRET` | 64+ char hex |
| `ZOOM_SDK_KEY` | Meeting SDK app |
| `ZOOM_SDK_SECRET` | Meeting SDK app |
| `ZOOM_CLIENT_ID` | S2S OAuth |
| `ZOOM_CLIENT_SECRET` | S2S OAuth |
| `ZOOM_ACCOUNT_ID` | S2S OAuth |
| `ZOOM_HOST_USER_ID` | Default Zoom host user |
| `ZOOM_WEBHOOK_SECRET_TOKEN` | From Zoom Event Subscriptions |

Generate JWT secrets:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## 4. Seed super admin (first deploy only)

SSH into the EB instance or run locally against production Atlas:

```bash
cd backend
MONGODB_URI=<atlas-uri> SUPER_ADMIN_EMAIL=... SUPER_ADMIN_PASSWORD=... npm run seed
```

## 5. Update Vercel admin

In Vercel project settings → Environment Variables:

```
VITE_API_URL=https://<your-eb-or-custom-domain>
```

Redeploy admin. Vite bakes this at build time (`admin/src/config.ts`).

Update `admin/.env.production` in git for reference only.

## 6. Update Zoom webhook

In Zoom Marketplace → your app → Event Subscriptions:

```
https://<PUBLIC_API_URL>/api/webhooks/zoom
```

`PUBLIC_API_URL` must match exactly (used in `/api/home` websocket URL for APK).

## 7. Verify deployment

```bash
# Health
curl https://<api-url>/api/health

# SDK key audit (needs APK test user)
cd backend
PROD_API_BASE=https://<api-url>/api \
APK_USERNAME=<user> APK_PASSWORD=<pass> \
npm run audit:prod-sdkkey
```

Expected:
- `GET /api/health` → `{ ok: true, zoomSdkConfigured: true }`
- Admin login from Vercel works
- WebSocket connects at `/socket.io`
- APK `/api/home` returns correct `websocket.url`

## 8. Optional: GitHub Actions auto-deploy

See `.github/workflows/deploy-backend-eb.yml`. Required GitHub secrets:

| Secret | Purpose |
|--------|---------|
| `AWS_ACCESS_KEY_ID` | CI deploy user |
| `AWS_SECRET_ACCESS_KEY` | CI deploy user |
| `AWS_REGION` | e.g. `ap-south-1` |
| `EB_APPLICATION_NAME` | `zoomcontrol-backend` |
| `EB_ENVIRONMENT_NAME` | e.g. `zoomcontrol-backend-prod` |

## Docker alternative

Deploy the same image on EB Docker platform:

```bash
cd backend
docker build -t zoomcontrol-backend .
```

The `Dockerfile` uses Node 20 Alpine and runs `node src/app.js` on port 8080.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| WebSocket disconnects | Confirm ALB stickiness is enabled |
| CORS errors from Vercel | Set `ADMIN_PORTAL_URL`; `*.vercel.app` is already allowed in code |
| `sdkKey: null` | Set `ZOOM_SDK_KEY` and `ZOOM_SDK_SECRET` in EB env |
| S3 upload fails | Attach IAM instance profile; remove static AWS keys |
| 502 on health check | App must listen on `process.env.PORT` (8080 on EB) |

## Deprecating Render

After AWS is verified, update clients and remove the Render service. Keep `render.yaml` in git until migration is complete.
