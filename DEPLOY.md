# EchoMind cloud deployment (Vercel + Railway / Render)

Frontend is a Next.js 14 App Router PWA. On Vercel it builds as the default serverless/static hybrid (not Docker `standalone`, not Capacitor `export`). The browser reads **`NEXT_PUBLIC_API_URL`** at build time and, in production, uses only that URL (no localhost probing).

Backend is FastAPI. Railway and Render can build `backend/Dockerfile` (preferred) or Nixpacks via `backend/nixpacks.toml`. The process binds `0.0.0.0:$PORT`.

## 1. Deploy the API first

**Railway:** New project → deploy from repo → set root to `backend` **or** use repo-root `railway.toml` (Dockerfile path `backend/Dockerfile`). Health check: `GET /api/v1/health`.

**Render:** Use `render.yaml`, or Web Service → Docker → context `backend`, Dockerfile `backend/Dockerfile`. Health check: `/api/v1/health`.

Copy the public HTTPS origin, for example `https://echomind-api.up.railway.app`. The client path is `/api/v1`.

## 2. Deploy the web app on Vercel

- Framework: Next.js
- Root directory: `frontend`
- Install: `npm ci`
- Build: `npm run build`
- Ignore native trees via `frontend/.vercelignore`

Set `NEXT_PUBLIC_API_URL` **before** the first production build, then redeploy if the API host changes.

## 3. Environment variable checklist

### Vercel (frontend)

| Variable | Required | Example |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | **Yes** | `https://echomind-api.up.railway.app/api/v1` |

Set it for Production and Preview. Do not point this at `localhost`.

### Railway or Render (backend)

| Variable | Required | Example |
| --- | --- | --- |
| `ENVIRONMENT` | **Yes** | `production` |
| `CORS_ORIGINS` | **Yes** | `https://echomind.vercel.app,https://localhost,capacitor://localhost` |
| `GEMINI_API_KEY` | Recommended | Gemini key (leave empty to stay fail-closed) |
| `GEMINI_MODEL` | Optional | `gemini-2.0-flash` |
| `PROJECT_NAME` | Optional | `EchoMind` |
| `API_V1_STR` | Optional | `/api/v1` |
| `CORS_ORIGIN_REGEX` | Optional | `^https://.*\.vercel\.app$` (Preview URLs) |
| `PORT` | Platform-set | Railway/Render inject this; do not hardcode |

`GEMINI_API_KEY` is server-only. Never add it to Vercel as `NEXT_PUBLIC_*`.

## 4. After both hosts are live

1. Confirm `GET https://<api-host>/api/v1/health` returns `{"status":"healthy"}`.
2. Confirm `GET https://<api-host>/api/v1/ready` shows Gemini configured or unconfigured as intended.
3. Open the Vercel URL and check the Online badge.
4. If the browser reports a CORS error, add the exact `https://…vercel.app` origin to `CORS_ORIGINS` and restart the API.

Android / tablet builds are separate: bake a LAN or production `NEXT_PUBLIC_API_URL` with `npm run export:android`.
