# Deploy ZoomControl Backend on api.meetverdure.com

Domain: **meetverdure.com**  
API subdomain: **api.meetverdure.com**  
Backend: AWS Elastic Beanstalk (`zoomcontrol-backend-prod-v2`)

---

## Current status

| Item | Value |
|------|-------|
| EB environment | `zoomcontrol-backend-prod-v2` |
| EB URL (HTTP) | `zoomcontrol-backend-prod-v2.eba-rjgpwd2v.ap-south-1.elasticbeanstalk.com` |
| Target HTTPS URL | `https://api.meetverdure.com` |
| Admin (Vercel) | `https://zoomcontrol-admin.vercel.app` |

---

## Step 0 — AWS CLI login

```bash
aws configure
aws sts get-caller-identity
```

Use the `zoomcontrol-deploy` IAM user (with EB + S3 + ACM permissions).

---

## Step 1 — Backend is already deployed (HTTP)

Verify:

```bash
curl http://zoomcontrol-backend-prod-v2.eba-rjgpwd2v.ap-south-1.elasticbeanstalk.com/api/health
```

Expected: `{"ok":true,...}`

If this fails, re-run:

```bash
cd /Users/amit/Desktop
export AWS_REGION=ap-south-1
./backend/scripts/setup-aws-eb.sh
```

---

## Step 2 — HTTPS + custom domain (automated script)

```bash
cd /Users/amit/Desktop
export AWS_REGION=ap-south-1
chmod +x backend/scripts/setup-https-domain.sh
./backend/scripts/setup-https-domain.sh
```

The script will:

1. Request ACM SSL certificate for `api.meetverdure.com`
2. Print **DNS records** you must add at your domain registrar
3. After certificate is **ISSUED**, configure EB HTTPS on port 443
4. Set `PUBLIC_API_URL=https://api.meetverdure.com`

### DNS records to add (at meetverdure.com registrar)

**Record A — ACM validation** (script prints exact name/value):

| Type | Name | Value |
|------|------|-------|
| CNAME | `_xxxxx.api` | `_xxxxx.acm-validations.aws.` |

**Record B — API routing** (after cert issued):

| Type | Name | Value |
|------|------|-------|
| CNAME | `api` | `zoomcontrol-backend-prod-v2.eba-rjgpwd2v.ap-south-1.elasticbeanstalk.com` |

> If using **Cloudflare**: set proxy to **DNS only** (grey cloud) initially for EB to work correctly.

After adding validation CNAME, wait 5–30 min, then re-run:

```bash
./backend/scripts/setup-https-domain.sh
```

Verify HTTPS:

```bash
curl https://api.meetverdure.com/api/health
```

---

## Step 3 — Update Vercel admin

Get token: https://vercel.com/account/tokens

```bash
export VERCEL_TOKEN=your_token
export API_URL=https://api.meetverdure.com
./scripts/update-vercel-api-url.sh
```

Or manually in Vercel dashboard → **zoomcontrol-admin** → Settings → Environment Variables:

```
VITE_API_URL=https://api.meetverdure.com
```

Then redeploy.

Test: https://zoomcontrol-admin.vercel.app → login

---

## Step 4 — Update Zoom webhook

1. https://marketplace.zoom.us/user/build
2. Open **Server-to-Server OAuth** app
3. **Feature** → **Event Subscriptions**
4. Set URL:

```
https://api.meetverdure.com/api/webhooks/zoom
```

5. Subscribe to events (see `backend/docs/ZOOM_SETUP.md`)
6. Copy **Secret Token** → ensure it matches `ZOOM_WEBHOOK_SECRET_TOKEN` in EB env vars

---

## Step 5 — MongoDB Atlas network access

EB instances need access to Atlas:

1. Atlas → Network Access → Add IP Address
2. For dev: `0.0.0.0/0` (allow from anywhere)
3. For prod: add EB instance elastic IPs or use Atlas VPC peering

---

## Step 6 — Final verification

```bash
./scripts/post-deploy-verify.sh https://api.meetverdure.com

cd backend
PROD_API_BASE=https://api.meetverdure.com/api \
APK_USERNAME=your-user APK_PASSWORD=your-pass \
npm run audit:prod-sdkkey
```

Checklist:

- [ ] `https://api.meetverdure.com/api/health` returns ok
- [ ] Admin login works on Vercel
- [ ] Zoom webhook validated
- [ ] Android APK `/api/home` returns `websocket.url` with `wss://api.meetverdure.com`

---

## Architecture (final)

```
zoomcontrol-admin.vercel.app  ──HTTPS──►  api.meetverdure.com  (EB + ACM)
Android APK                   ──HTTPS──►  api.meetverdure.com
Zoom webhooks                 ──HTTPS──►  api.meetverdure.com/api/webhooks/zoom
                                              │
                                              ├── MongoDB Atlas
                                              └── S3 zoomcontrol-recordings-prod
```
