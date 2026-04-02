# Quantum Stars Backend

Backend service for the Quantum Stars analytics workspace.

This app provides:

- JWT email/password authentication
- Google Sign-In callback support
- Multi-tenant analytics storage scoped by `ownerId`
- Public event ingestion via `/track`
- Redis + BullMQ backed event queue
- Real-time dashboard updates over Server-Sent Events
- Site connection / activation / monitoring flows
- AI settings and chat endpoints for authenticated users

## Stack

- Node.js
- Express 5
- Prisma 7 with MariaDB adapter
- MySQL 8
- Redis 7
- BullMQ
- JWT + bcrypt

## Current Architecture

### Request flow

1. A tracked site sends events to `POST /track` with `x-api-key`.
2. The API validates the payload, resolves the owner account, and checks the host against enabled connected sites.
3. The event is queued in BullMQ.
4. A worker persists the event to MySQL.
5. The saved event is published to Redis Pub/Sub.
6. The API fans the event out to dashboard clients over SSE.

### Multi-tenant isolation

- Every analytics event belongs to exactly one account through `Event.ownerId`.
- Authenticated analytics queries are filtered by `ownerId` unless the requester is an admin email.
- Connected sites are also scoped by `ownerId`.

### Worker model

The API server starts an inline BullMQ worker by default.

- Default behavior: `src/index.js` starts the HTTP API and an inline event worker.
- Optional dedicated worker: run `npm run worker`.
- If you want only the dedicated worker, set `ENABLE_INLINE_EVENT_WORKER=false`.

## Project Structure

```text
backend/
|- docker-compose.yml
|- prisma.config.ts
|- prisma/
|  |- schema.prisma
|  |- seed.js
|  `- migrations/
|- src/
|  |- index.js
|  |- worker.js
|  |- lib/
|  |  |- admin.js
|  |  |- event-worker.js
|  |  |- prisma.js
|  |  |- queue.js
|  |  `- redisPubSub.js
|  |- middleware/
|  |  |- auth.middleware.js
|  |  `- rate-limit.middleware.js
|  `- modules/
|     |- ai/
|     |- analytics/
|     |- auth/
|     |- event/
|     `- realtime/
`- package.json
```

## Data Model

Current Prisma models:

- `User`
  - authentication account
  - owns API key
  - stores AI settings
  - owns many connected sites
  - owns many events
- `ConnectedSite`
  - site URL and display name
  - `isActive` and `isEnabled` flags
  - belongs to one `ownerId`
- `Event`
  - `eventName`, `userId`, `properties`, `timestamp`
  - belongs to one `ownerId`
  - indexed for owner-scoped analytics queries

## Environment Variables

Create `backend/.env` with values like these:

```env
DATABASE_URL="mysql://root:password@127.0.0.1:3306/app_db?allowPublicKeyRetrieval=true"
REDIS_URL="redis://localhost:6379"
PORT=4000
JWT_SECRET="change-me"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_REDIRECT_URI="http://localhost:4000/auth/google/callback"

# Optional runtime tuning
ADMIN_EMAIL="admin@quantum.com"
ENABLE_INLINE_EVENT_WORKER=true
EVENT_WORKER_CONCURRENCY=25
JSON_BODY_LIMIT=64kb
SSE_HEARTBEAT_MS=15000
TRACKING_CONTEXT_TTL_MS=10000
```

### Railway note

If you deploy on Railway with the managed MySQL service, map:

```env
DATABASE_URL=${{mysql.MYSQL_URL}}
REDIS_URL=${{redis.REDIS_URL}}
```

The production Docker flow in the repo root serves the frontend from the backend, so a single Railway web service can host the app UI and API together.

### Notes

- `DATABASE_URL` is required by Prisma.
- `REDIS_URL` is used by Redis Pub/Sub and BullMQ.
- `JWT_SECRET` should always be changed in production.
- `GOOGLE_CLIENT_ID` is used to validate Google ID tokens.
- `GOOGLE_REDIRECT_URI` is currently only used by `GET /api/auth/google/auth-url`.
- `ADMIN_EMAIL` or `ADMIN_EMAILS` can define admin accounts.
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, and `REDIS_DB` are also supported by the queue layer if you do not want to use `REDIS_URL`.

These keys may still exist in local `.env` files but are not used by the current code paths:

- `SESSION_SECRET`
- `GOOGLE_CLIENT_SECRET`
- `FRONTEND_URL`

## Local Development

### 1. Start infrastructure

```bash
cd backend
docker compose up -d
```

This starts:

- MySQL on `localhost:3306`
- Redis on `localhost:6379`

### 2. Install dependencies

```bash
cd backend
npm install
```

### 3. Run migrations

```bash
cd backend
npx prisma migrate deploy
```

For local schema iteration you can also use:

```bash
npx prisma migrate dev
```

### 4. Seed admin user

```bash
cd backend
npm run seed
```

### 5. Start the API

```bash
cd backend
npm run dev
```

### 6. Optional: run a dedicated worker

```bash
cd backend
npm run worker
```

If you run a dedicated worker, consider setting:

```env
ENABLE_INLINE_EVENT_WORKER=false
```

## Scripts

```bash
npm run dev         # start API server
npm run dev:watch   # start API server with Node watch mode
npm run start       # start API server
npm run worker      # start BullMQ event worker
npm run seed        # seed admin user
```

## API Surface

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/google/callback`
- `GET /api/auth/google/auth-url`

### Analytics

- `POST /track`
- `POST /api/analytics/track`
- `GET /api/analytics/site`
- `POST /api/analytics/site/connect`
- `POST /api/analytics/sites/:siteId/activate`
- `POST /api/analytics/sites/:siteId/deactivate`
- `POST /api/analytics/sites/:siteId/analyze`
- `DELETE /api/analytics/sites/:siteId`
- `GET /api/analytics/kpis`
- `GET /api/analytics/realtime-summary`
- `GET /api/analytics/visitors`
- `GET /api/analytics/hourly`
- `GET /api/analytics/funnel`
- `GET /api/analytics/pages`
- `GET /api/analytics/devices`
- `GET /api/analytics/countries`
- `GET /api/analytics/events`
- `GET /api/analytics/export`
- `GET /api/analytics/users`

### Realtime

- `GET /api/realtime/stream`

### AI

- `GET /api/ai/settings`
- `PUT /api/ai/settings`
- `POST /api/ai/chat`

## Tracking API Example

Send events with the account API key:

```bash
curl -X POST http://localhost:4000/track ^
  -H "Content-Type: application/json" ^
  -H "x-api-key: dp_live_your_api_key" ^
  -d "{\"eventName\":\"page_view\",\"userId\":\"visitor_123\",\"properties\":{\"url\":\"/pricing\",\"host\":\"example.com\"}}"
```

Response:

- `202` when queued successfully
- `201` when queue fallback writes directly to MySQL

## Tracker Script

The public tracker file lives at:

- `frontend/public/tracker.js`

The backend serves it from:

- `GET /tracker.js`

Typical embed:

```html
<script
  defer
  src="http://localhost:4000/tracker.js"
  data-endpoint="http://localhost:4000/track"
  data-site-id="optional-site-id"
></script>
```

## Realtime Notes

- Frontend uses `EventSource` against `/api/realtime/stream?token=<jwt>`.
- SSE keepalive heartbeats are emitted on a timer.
- Admin clients can receive cross-account realtime visibility based on configured admin email(s).

## Security and Hardening Already in Code

- Owner-scoped event storage through `ownerId`
- Queue-backed tracking ingestion
- Payload normalization and size checks for tracked events
- Auth rate limiting on register, login, and Google callback
- Reserved admin email protection
- Security response headers in Express
- Composite event indexes for owner-scoped analytics queries

## Validation Commands

Useful local checks:

```bash
node --check src/index.js
npx prisma validate
```

## Related Docs

- `integration_guide.md` for tracker/frontend integration details



Quantum Stars Backend
Quantum Stars аналитик ажлын талбарын арын албаны (backend) үйлчилгээ.

Энэхүү систем нь дараах боломжуудыг олгоно:

JWT ашиглан имэйл/нууц үгээр нэвтрэх

Google Sign-In дэмжлэг

ownerId-аар тусгаарлагдсан олон түрээслэгчийн (multi-tenant) аналитик хадгалалт

/track цэгээр дамжуулан нийтийн үйл явдлыг (event) бүртгэх

Redis + BullMQ дээр суурилсан дарааллын систем

Server-Sent Events (SSE) ашиглан бодит цагийн хянах самбарын шинэчлэлт

Веб сайтыг холбох, идэвхжүүлэх, хянах процессууд

AI тохиргоо болон чатлах хэсэг

Технологийн сан (Stack)
Node.js

Express 5

Prisma 7 (MariaDB/MySQL адаптертай)

MySQL 8

Redis 7

BullMQ (Ажлын дараалал)

JWT & bcrypt

Одоогийн Архитектур
Хүсэлтийн урсгал (Request Flow)
Хянагдаж буй сайт нь POST /track руу x-api-key-тэй үйл явдлыг илгээнэ.

API нь өгөгдлийг шалгаж, эзэмшигчийг тодорхойлж, тухайн сайтыг бүртгэлтэй эсэхийг хянана.

Үйл явдлыг BullMQ дараалалд оруулна.

Worker нь үйл явдлыг MySQL мэдээллийн санд хадгална.

Хадгалагдсан үйл явдлыг Redis Pub/Sub руу илгээнэ.

API нь SSE-ээр дамжуулан хянах самбар руу мэдээллийг бодит цагт түгээнэ.

Түрээслэгчдийн тусгаарлалт (Multi-tenant isolation)
Аналитик үйл явдал бүр Event.ownerId-аар дамжуулан зөвхөн нэг хэрэглэгчид хамаарна.

Хайлтын үр дүнгүүд үргэлж ownerId-аар шүүгдэнэ (Админ имэйлээс бусад тохиолдолд).

Төслийн бүтэц
Plaintext
backend/
|- prisma/             # Мэдээллийн сангийн схем ба шилжилт (migration)
|- src/
|  |- index.js         # API сервер болон үндсэн оролт
|  |- worker.js        # Тусдаа worker процесс
|  |- lib/             # Үндсэн сангууд (Prisma, Queue, Redis)
|  |- middleware/      # Auth болон Rate-limit хамгаалалтууд
|  |- modules/         # Бизнес логикийн модулиуд (AI, Analytics, Auth, Realtime)
`- package.json
Өгөгдлийн загвар (Data Model)
User: Хэрэглэгчийн бүртгэл, API түлхүүр, AI тохиргоо.

ConnectedSite: Холбогдсон сайтын URL, нэр, төлөв.

Event: Үйл явдлын нэр, шинж чанар, цаг хугацаа болон эзэмшигчийн ID.

Орчны хувьсагчид (.env)
Хөгжүүлэлтийн явцад дараах хувьсагчдыг тохируулна:

DATABASE_URL: MySQL холболтын хаяг.

REDIS_URL: Redis холболтын хаяг.

JWT_SECRET: Нууц түлхүүр.

ADMIN_EMAIL: Системийн админ хэрэглэгч.

Хөгжүүлэлт хийх заавар
Дэд бүтцийг эхлүүлэх (Docker):

Bash
docker compose up -d
Сангуудыг суулгах:

Bash
npm install
Мэдээллийн сан бэлтгэх:

Bash
npx prisma migrate deploy
npm run seed
Серверийг ажиллуулах:

Bash
npm run dev
API-ийн үндсэн цэгүүд
Auth: Бүртгүүлэх, нэвтрэх, гарах, Google Auth.

Analytics: Үйл явдлыг хянах (/track), KPI үзүүлэлтүүд, зочдын мэдээлэл, юүлүүр (funnel) шинжилгээ, экспорт.

Realtime: /api/realtime/stream - SSE ашиглан шууд мэдээлэл авах.

AI: Тохиргоо болон чатлах боломж.

Аюулгүй байдал
ownerId-аар өгөгдлийг хатуу тусгаарласан.

Үйл явдал бүртгэхэд дарааллын систем ашиглаж ачааллыг зохицуулсан.

Нэвтрэх хэсэгт хүсэлтийн хязгаарлалт (Rate limiting) хийсэн.

Express-д зориулсан аюулгүй байдлын толгой (header) мэдээллүүдийг тохируулсан.
