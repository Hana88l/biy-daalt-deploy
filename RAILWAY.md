# Quantum Stars on Railway

This repo is prepared for a one-flow Railway deployment:

- one `app` web service from the repo root
- one Railway `MySQL` service
- one Railway `Redis` service

The app service uses the root `Dockerfile`, builds the React frontend, embeds `frontend/dist`, runs Prisma migrations on boot, and starts the backend API that also serves the SPA.

## What Deploys

- Frontend: served by the backend from the built `frontend/dist`
- Backend API: Express app on the same public domain
- Tracking script: served from `/tracker.js`
- Health check: served from `/health`
- Analytics API: served from `/api/*`

## Railway Project Layout

Create one Railway project with these services:

1. `app`
2. `mysql`
3. `redis`

Use the repo root for the `app` service so Railway picks up the root `Dockerfile`.

## App Service Variables

In the `app` service, add these variables:

```env
REDIS_URL=${{redis.REDIS_URL}}
MYSQLHOST=${{mysql.MYSQLHOST}}
MYSQLPORT=${{mysql.MYSQLPORT}}
MYSQLUSER=${{mysql.MYSQLUSER}}
MYSQLPASSWORD=${{mysql.MYSQLPASSWORD}}
MYSQLDATABASE=${{mysql.MYSQLDATABASE}}

JWT_SECRET=replace-with-a-long-secret
SESSION_SECRET=replace-with-a-long-secret
ADMIN_EMAIL=admin@quantum.com
AI_TIMEZONE=Asia/Ulaanbaatar

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
APP_ORIGIN=https://${{app.RAILWAY_PUBLIC_DOMAIN}}
FRONTEND_URL=https://${{app.RAILWAY_PUBLIC_DOMAIN}}
GOOGLE_REDIRECT_URI=https://${{app.RAILWAY_PUBLIC_DOMAIN}}/api/auth/google/callback

AI_SHARED_PROVIDER=groq
AI_SHARED_BASE_URL=https://api.groq.com/openai/v1
AI_SHARED_MODEL=openai/gpt-oss-120b
AI_SHARED_API_KEY=your-groq-key

# Optional Gemini override. If this is set, the server will prefer Gemini.
# GEMINI_API_KEY=your-gemini-key
# GEMINI_MODEL=gemini-2.5-flash
```

Notes:

- Service names inside `${{...}}` must match the exact Railway service names you create.
- Railway already injects `PORT`; do not hardcode it.
- The app now builds `DATABASE_URL` from Railway MySQL component vars so special characters in passwords are escaped safely for Prisma.
- `REDIS_URL` is intentionally mapped from Railway Redis's `REDIS_URL`.
- If Railway private networking still gives `P1001` for `mysql.railway.internal`, set `DATABASE_URL` in the `app` service to the MySQL service's `MYSQL_PUBLIC_URL` instead and remove the `MYSQLHOST`/`MYSQLPORT`/`MYSQLUSER`/`MYSQLPASSWORD`/`MYSQLDATABASE` overrides.

## Google Sign-In Setup

In Google Cloud Console, add:

- Authorized JavaScript origin:
  - `https://<your-app-domain>`
- Authorized redirect URI:
  - `https://<your-app-domain>/api/auth/google/callback`

For Railway, `<your-app-domain>` should be the `app` service public domain.

## Deploy Flow

1. Create a new Railway project.
2. Add a `MySQL` service.
3. Add a `Redis` service.
4. Add a web service from this GitHub repo.
5. Point that web service at the repo root.
6. Add the variables above to the `app` service.
7. Deploy.

On startup the container will:

1. map Railway-native env vars
2. run `prisma migrate deploy`
3. start the API server
4. serve the built frontend from the same domain

## Result

After deploy:

- app UI: `https://<your-app-domain>/`
- API health: `https://<your-app-domain>/health`
- tracking endpoint: `https://<your-app-domain>/track`
- tracker script: `https://<your-app-domain>/tracker.js`

## Why This Is One-Flow

You only deploy one code service.

- no separate frontend service
- no separate backend service
- no separate worker service

The only additional Railway services are the managed infrastructure services:

- MySQL
- Redis
