# Project Integration Guide

This guide details how to integrate your React Dashboard frontend with the new internal Node/Express API services. Complete these sections to replace your local `mockData.js` state logic.

---

## 1. Authentication & Bearer Tokens

The backend exposes a secure mechanism for authentication via `bcrypt` and JSON Web Tokens.
All secure API calls must pass the user's encoded JWT either via the `Authorization: Bearer <token>` header, or as a query parameter (`?token=<token>`).

### Standard Endpoints

- **`POST /api/auth/register`**
  - **Body**: `{ "email": "test@example.com", "password": "supersecret" }`
  - **Response**: `{ message: '...', token: 'eyJhi...', user: { id: 1, email: ... }}`
  
- **`POST /api/auth/login`**
  - **Body**: `{ "email": "test@example.com", "password": "supersecret" }`
  - **Response**: Returns your `token`. Save this in your frontend context (`localStorage`).

- **`GET /api/auth/me`**
  - **Headers**: `Authorization: Bearer <token>`
  - Use this on application load to verify if the user's session token is still valid.

---

## 2. Event Tracking Snippet

Any application or website you connect to the dashboard will generate events via the `/track` endpoint. 

**Unified User-Project Model:** Every registered user account acts as its own isolated tracking project. Your user automatically receives a unique `apiKey` upon registration which acts as your environment identifier. There are no sub-projects to configure. 

- **`POST /track`**
  - **Headers**: `x-api-key: your_project_api_key`
  - **Body**: 
    ```json
    {
      "event": "page_view",
      "userId": "visitor_xyz001",
      "properties": {
        "url": "/pricing"
      }
    }
    ```
  - **Architecture**: The event is pushed into **BullMQ**. Processing happens completely out-of-band by standardizing it on your Redis workers. When a worker finishes writing a `/track` API event to MySQL, it instantly broadcasts the payload via **Redis Pub/Sub**.

### Automatic Error Tracking

The hosted `tracker.js` snippet now auto-captures common browser-side failures and sends them as `error` events:

- Uncaught JavaScript runtime errors
- Unhandled promise rejections
- Resource load failures such as broken scripts, stylesheets, or images

These `error` events are automatically included in the dashboard KPI calculation:

```text
errorRate = error events / all non-heartbeat events * 100
```

If your site has custom validation or health-check logic, you can also report those failures manually:

```javascript
window.quantumTracker?.trackError(new Error('Checkout validation failed'), {
  check: 'checkout_form',
  severity: 'error'
})
```

---

## 3. Real-Time Data Streaming

The API broadcasts **Server-Sent Events (SSE)**. You do not need bloated WebSockets libraries. 
This is handled natively by the `EventSource` mechanism in React/vanilla JS.

The main node application subscribes to the Redis Pub/Sub channel. As worker nodes announce new DB writes, the API pushes that payload directly down this active HTTP stream for your charts to populate live.

### React Integration 

Inside your `useAnalytics.js` or `Realtime.jsx` view:

```javascript
import { useEffect, useState } from 'react';

function useRealtimeStream(jwtToken) {
  const [liveEvents, setLiveEvents] = useState([]);

  useEffect(() => {
    // 1. You MUST pass the JWT token inside the query string.
    const url = `http://localhost:4000/api/realtime/stream?token=${jwtToken}`;
    
    // 2. Open an un-polled SSE Connection
    const eventSource = new EventSource(url);

    // 3. Listen for specific types of messages
    eventSource.onmessage = (rawStream) => {
      const data = JSON.parse(rawStream.data);
      
      if (data.type === 'NEW_EVENT') {
         // Appends the live occurrence into your local pipeline
         setLiveEvents(prev => [data.payload, ...prev].slice(0, 100)); // maintain max length
      }
    };

    return () => {
      eventSource.close();
    };
  }, [jwtToken]);

  return liveEvents;
}
```

---

## 4. Core Analytics Aggregations

The backend provides several high-performance endpoints for dashboard metrics and visualizations, powered by raw SQL and Prisma aggregates mapping JSON telemetry.

### Analytics Endpoints

All calls require your JWT `Authorization: Bearer <token>`. You can pass `?range=7d` (default), `24h`, `30d`, or `90d` to filter the data.

- **`GET /api/analytics/kpis`**
  - Returns top-level aggregates: `totalEvents`, `totalUsers`, `pageViews`, `errors`, `bounceRate`, `errorRate`.
- **`GET /api/analytics/visitors`**
  - Returns time-series data grouped by date: `[{ date: '2023-10-01', count: 120 }, ...]`.
- **`GET /api/analytics/hourly`**
  - Returns event volume broken down by hour: `[{ hour: 14, count: 50 }, ...]`.
- **`GET /api/analytics/funnel`**
  - Returns predetermined conversion steps: `page_view` -> `click` -> `signup` -> `purchase`.
- **`GET /api/analytics/pages`**
  - Top 10 most visited URLs parsed from JSON `properties.url`.
- **`GET /api/analytics/devices`** & **`GET /api/analytics/countries`**
  - Categorical breakdowns parsed from your JSON telemetry properties.
