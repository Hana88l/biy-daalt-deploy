# Quantum Stars Frontend

React frontend for the Quantum Stars analytics workspace.

This app includes:

- Public landing page walkthrough
- Email/password login and register flows
- Google Sign-In on login and register
- Authenticated analytics dashboard pages
- Realtime updates over SSE
- AI settings and chat workspace
- Theme switching and local persistence

## Stack

- React 18
- React Router 6
- Vite 5
- Tailwind CSS
- Recharts
- Lucide React

## Current Routes

Public routes:

- `/`
- `/login`
- `/register`

Authenticated routes:

- `/`
- `/realtime`
- `/events`
- `/funnel`
- `/users`
- `/alerts`
- `/settings`
- `/ai`

Behavior at `/`:

- unauthenticated users see the landing page
- authenticated users are routed into the dashboard overview

## Project Structure

```text
frontend/
|- public/
|  `- tracker.js
|- src/
|  |- components/
|  |  |- auth/
|  |  |- charts/
|  |  |- dashboard/
|  |  |- layout/
|  |  `- ui/
|  |- context/
|  |- hooks/
|  |- pages/
|  |- utils/
|  |- App.jsx
|  |- index.css
|  `- main.jsx
|- index.html
|- vite.config.js
|- tailwind.config.js
|- postcss.config.js
`- package.json
```

## Important Frontend Modules

- `src/App.jsx`
  - route definitions
  - public vs protected route split
- `src/context/AuthContext.jsx`
  - session persistence in `localStorage`
  - login, register, Google login, logout
- `src/context/AnalyticsContext.jsx`
  - shared analytics state for protected pages
- `src/hooks/useAnalytics.js`
  - loads KPIs, tables, charts, alerts, exports
  - consumes realtime SSE stream
- `src/components/auth/GoogleAuthButton.jsx`
  - Google Identity Services button renderer
- `src/utils/api.js`
  - API base resolution
  - authenticated fetch helpers

## Environment Variables

Optional frontend env values:

```env
VITE_API_BASE_URL=http://localhost:4000/api
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

### Default behavior without env vars

- If the app runs on `localhost`, it defaults to `http://localhost:4000/api`
- Otherwise it defaults to `${window.location.origin}/api`
- In the Railway one-flow deployment, the frontend is served by the backend on the same domain, so `VITE_API_BASE_URL` is not required in production

## Local Development

### 1. Install dependencies

```bash
cd frontend
npm install
```

### 2. Start Vite

```bash
cd frontend
npm run dev
```

Default Vite URL is usually:

```text
http://localhost:5173
```

### 3. Build for production

```bash
cd frontend
npm run build
```

### 4. Preview production build

```bash
cd frontend
npm run preview
```

## Scripts

```bash
npm run dev
npm run build
npm run preview
```

## Backend Integration

The frontend expects the backend described in `../backend/README.md`.

### Auth flow

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/google/callback`
- `GET /api/auth/me`
- `POST /api/auth/logout`

The session is stored in `localStorage` under:

```text
auth_user
```

### Analytics flow

The dashboard loads data from endpoints such as:

- `/api/analytics/kpis`
- `/api/analytics/realtime-summary`
- `/api/analytics/visitors`
- `/api/analytics/hourly`
- `/api/analytics/funnel`
- `/api/analytics/pages`
- `/api/analytics/devices`
- `/api/analytics/countries`
- `/api/analytics/events`
- `/api/analytics/export`
- `/api/analytics/site`

### Realtime flow

Realtime updates use:

- `GET /api/realtime/stream?token=<jwt>`

This is consumed through `EventSource` inside `useAnalytics.js`.

## Dashboard Features

- overview metrics and KPI cards
- live event stream
- hourly and visitor charts
- funnel visualization
- top pages table
- device and country breakdowns
- alert rule UI stored in local storage
- connected site status and site-mode analytics
- AI workspace settings and chat
- light and dark theme support

## Google Sign-In

Google Sign-In is available on both:

- login page
- register page

The frontend loads Google Identity Services dynamically and sends the returned ID token to:

- `POST /api/auth/google/callback`

## Tracker Asset

The repository also includes a browser tracker asset at:

- `public/tracker.js`

The backend serves that file from `/tracker.js`, so the frontend source is the canonical file used by the backend as well.

## Notes

- There are no automated frontend tests configured in `package.json` right now.
- `dist/` is build output and should not be edited manually.
- The docs here are based on the current code, not on the older mock-only version.



## Quantum Stars Frontend
Quantum Stars аналитик ажлын талбарт зориулсан React фронтенд.

Энэхүү аппликейшн нь дараах зүйлсийг агуулна:

Нүүр хуудасны танилцуулга (Landing page)

Имэйл/нууц үгээр нэвтрэх болон бүртгүүлэх хэсэг

Google Sign-In ашиглан нэвтрэх болон бүртгүүлэх

Нэвтэрсэн хэрэглэгчдэд зориулсан аналитик хянах самбар (Dashboard)

SSE (Server-Sent Events) ашиглан бодит цагийн (Realtime) мэдээлэл шинэчлэлт

AI тохиргоо болон чатлах хэсэг

Theme (цонхны өнгө) солих болон тохиргоо хадгалах

Технологийн сан (Stack)
React 18

React Router 6

Vite 5

Tailwind CSS

Recharts (График дүрслэлд)

Lucide React (Айкон дүрслэлд)

Одоогийн замууд (Routes)
Нээлттэй замууд (Public):

/ - Нүүр хуудас

/login - Нэвтрэх

/register - Бүртгүүлэх

Хамгаалагдсан замууд (Authenticated):

/ - (Нэвтэрсэн үед хянах самбар руу шилжинэ)

/realtime - Бодит цагийн мэдээлэл

/events - Үйл явдлууд

/funnel - Борлуулалтын юүлүүр

/users - Хэрэглэгчид

/alerts - Мэдэгдэл, дохиолол

/settings - Тохиргоо

/ai - AI туслах

Төслийн бүтэц
Plaintext
frontend/
|- public/           # Статик файлууд (tracker.js гэх мэт)
|- src/
|  |- components/    # Дахин ашиглагдах бүрэлдэхүүн хэсгүүд
|  |- context/       # State management (Auth, Analytics)
|  |- hooks/         # Custom hooks (useAnalytics гэх мэт)
|  |- pages/         # Хуудсууд
|  |- utils/         # Туслах функцууд (API дуудлага гэх мэт)
|  |- App.jsx        # Үндсэн апп болон Routing
|  |- index.css      # Глобал стиль
|  `- main.jsx       # Entry point
|- vite.config.js    # Vite тохиргоо
`- package.json      # Хамаарлууд болон скриптүүд
Чухал модулиуд
src/App.jsx: Маршрутын тодорхойлолт, нээлттэй болон хамгаалагдсан замуудын зааг.

src/context/AuthContext.jsx: localStorage ашиглан нэвтрэх төлөвийг хадгалах, нэвтрэх, гарах функцууд.

src/context/AnalyticsContext.jsx: Хамгаалагдсан хуудсууд дахь дундын аналитик өгөгдөл.

src/hooks/useAnalytics.js: KPI үзүүлэлтүүд, график, хүснэгтийн өгөгдөл ачаалах, SSE урсгалыг хүлээн авах.

src/utils/api.js: API-ийн суурь хаягийг тодорхойлох болон хүсэлт илгээх туслах функцууд.

Орчны хувьсагчид (Environment Variables)
Frontend-д зориулсан нэмэлт утгууд:

Code snippet
VITE_API_BASE_URL=http://localhost:4000/api
VITE_GOOGLE_CLIENT_ID=таны-google-client-id
Хэрэв эдгээрийг тохируулаагүй бол localhost:4000/api хаягийг анхдагчаар ашиглана.

Хөгжүүлэлт хийх заавар
Сангуудыг суулгах:

Bash
npm install
Программыг ажиллуулах (Vite):

Bash
npm run dev
Ихэвчлэн http://localhost:5173 хаяг дээр ажиллана.

Production-д зориулж бэлтгэх:

Bash
npm run build
Backend-тэй холбогдох нь
Frontend нь backend-ээс дараах API-уудыг хүлээж авна:

Auth (Нэвтрэлт): /api/auth/login, /api/auth/google/callback, гэх мэт.

Analytics: /api/analytics/kpis, /api/analytics/funnel, гэх мэт.

Realtime: Бодит цагийн мэдээллийг GET /api/realtime/stream?token=<jwt> хаягаар EventSource ашиглан авна.

Хянах самбарын боломжууд
Үндсэн үзүүлэлтүүд болон KPI картууд.

Шууд (live) үйл явдлын урсгал.

Борлуулалтын юүлүүр (funnel) дүрслэл.

Төхөөрөмж болон улс орны ангилал.

Мэдэгдэл өгөх дүрмийн тохиргоо (local storage-д хадгалагдана).

Цайвар (light) болон бараан (dark) горим.

Тэмдэглэл: Одоогоор автомат тест тохируулагдаагүй байгаа бөгөөд dist/ хавтсан дахь файлуудыг гараар засварлаж болохгүй.
