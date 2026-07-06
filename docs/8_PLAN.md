# Feature 8: Request Logging & Inspection History ("The Dashboard Terminal")

## Context

When frontend developers are debugging why a network request failed, they spend a lot of time guessing whether their headers or request body payload formatting were correct.

**The Feature:** Keep a live visual history of every incoming HTTP request that hits your Node gateway.

**Portfolio Flex:** Use WebSockets (Socket.io) to stream the incoming traffic metrics straight to a **"Logs"** panel inside the user's React dashboard. Display the exact timestamp, requested URL, request headers, raw query string params, incoming payload body, and your mock server's execution latency.

Scope is **mock gateway traffic only** (`GET|POST|… /mock/:projectId/*` in `server/src/api.ts`). In-dashboard `mockApi.routes.test` (tRPC → `executeMockRequest`) is out of scope — it does not hit the public HTTP gateway.

No database schema changes. Logs live in an **in-memory ring buffer** per `projectId` (bounded, e.g. last 200 entries). **Node dev server only** — Socket.io requires a persistent `http.Server`; Cloudflare Wrangler mode does not support this feature (UI shows a disabled state).

---

## Phase 1 — Log Capture & In-Memory Store (Server)

### New types & store: `server/src/lib/mock-request-logs.ts`

**`MockRequestLogEntry`** (serializable, sent over Socket.io):

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | uuid |
| `projectId` | string | |
| `timestamp` | string | ISO 8601 — **exact timestamp** |
| `method` | string | HTTP verb |
| `url` | string | full **requested URL** (path + query) as received |
| `path` | string | mock route path after `extractMockPath` |
| `queryString` | string | **raw query string params** (`url.search` without `?`, or empty) |
| `headers` | `Record<string, string>` | **request headers** (multi-value headers joined with `, `) |
| `body` | string \| null | **incoming payload body** (null for GET/HEAD/OPTIONS or empty body) |
| `durationMs` | number | **mock server execution latency** (wall clock around gateway handler) |
| `status` | number | HTTP response status (aids failure debugging; not in user bullet list but zero-cost) |
| `matchedRouteId` | string \| null | from existing `MockRequestMeta` |
| `matchedRuleId` | string \| null | |
| `storeOperation` | string \| null | |

**`MockRequestLogStore`** (module singleton):

| Function | Role |
|----------|------|
| `appendLog(projectId, entry)` | Push to per-project ring buffer; evict oldest past cap |
| `getRecentLogs(projectId, limit?)` | Return newest-first snapshot for socket `history` event |
| `subscribe(projectId, listener)` | Optional internal pub/sub hook for Socket.io bridge |

**Body truncation:** cap stored body at ~64 KB; append `…[truncated]` if longer (avoid memory blowups on file uploads).

### New helper: `server/src/lib/mock-request-snapshot.ts`

| Function | Role |
|----------|------|
| `captureRequestSnapshot(request)` | `request.clone()` → `buildRequestContext` (reuse from `mock-matching.ts`) → serialize headers/query/body into log fields **without** consuming the original request body |

### Modify: `server/src/api.ts`

Wrap both `/mock/:projectId` handlers:

**`handleMockGatewayWithLogging(db, projectId, request)` algorithm:**
1. `start = Date.now()`.
2. `snapshot = await captureRequestSnapshot(request)` (clone).
3. `{ response, meta } = await executeMockRequest(db, projectId, request)` (use `executeMockRequest` directly, not `handleMockRequest`, to retain `meta`).
4. `durationMs = Date.now() - start`.
5. Build `MockRequestLogEntry` from `snapshot`, `meta`, `durationMs`, `response.status`.
6. `appendLog(projectId, entry)` + notify Socket.io subscribers (Phase 2).
7. Return `response`.

Public gateway behavior unchanged aside from timing/logging overhead.

### Modify: `server/src/lib/mock-proxy.ts`

No algorithm change. `api.ts` calls `executeMockRequest` instead of `handleMockRequest` so logging can attach `MockRequestMeta`.

---

## Phase 2A — Socket.io Server (Server)

### Dependencies

- `server/package.json`: add `socket.io`
- `ui/package.json`: add `socket.io-client`

### Modify: `server/src/server.ts`

Refactor startup to share one Node `http.Server` between Hono and Socket.io:

1. `createServer` from `node:http`.
2. Attach Hono via `@hono/node-server` `serve({ fetch: app.fetch, createServer: … })` **or** manual `server.on('request', …)` adapter — same port as today.
3. Instantiate `SocketIOServer` on that `http.Server` with CORS allowing the Vite origin (`scripts/port-manager.js` already writes `VITE_API_URL`).

### New: `server/src/lib/mock-log-socket.ts`

**Connection auth algorithm:**
1. Client sends Firebase ID token in handshake `auth.token` (same token tRPC uses in `ui/src/lib/trpc.ts`).
2. `authenticateBearerRequest` / `upsertUserFromIdToken` (`server/src/lib/auth.ts`) → `user.id`.
3. On `subscribe` event `{ teamId, projectId }`:
   - `requireProjectAccess(db, teamId, projectId, user.id)` (`server/src/lib/project-auth.ts`).
   - `socket.join(roomForProject(projectId))` — room name `mock-logs:{projectId}`.
   - Emit `history` with `getRecentLogs(projectId)`.
4. On `unsubscribe` or disconnect → leave room.

**Broadcast algorithm (called from `appendLog`):**
1. `io.to(roomForProject(projectId)).emit('request', entry)`.

Export `initMockLogSocket(httpServer)` called from `server.ts`; export `emitMockRequestLog(entry)` called from log store append path.

**Security:** never subscribe without `teamId` + `projectId` access check; do not expose logs across projects.

---

## Phase 2B — Logs Panel UI

### New: `ui/src/lib/mock-log-socket.ts`

| Export | Role |
|--------|------|
| `useMockLogSocket({ teamId, projectId, enabled })` | Connect to `VITE_API_URL` with `auth: { token: await getIdToken() }`; on connect emit `subscribe`; listen `history` + `request`; maintain in-memory list (prepend new entries, cap display count); cleanup on unmount (`unsubscribe`, disconnect) |

Reconnect on token refresh / tab focus optional; at minimum reconnect on mount.

### New: `ui/src/components/mock-request-logs-panel.tsx`

**"Logs" panel** — terminal-inspired scrollable list:

- Header: **Logs**, connection indicator (live / disconnected), entry count, **Clear** (client-side only).
- Each row (collapsed): timestamp, method badge, path, status, durationMs.
- Expand row → full detail:
  - **requested URL** (copy button)
  - **request headers** (key/value)
  - **raw query string params** (show `queryString` or "none")
  - **incoming payload body** (pretty-print JSON when parseable, else raw; show "(empty)" when null)
  - metadata line: matched rule / `store:{op}` / static / no route
- Empty state: "No requests yet — hit your mock URL to see traffic."
- Stateful note (reuse copy from `route-tester.tsx`): POST/PUT/DELETE mutate live collections.

### Modify: `ui/src/pages/ProjectDetail.tsx`

Add a **Logs** card below APIs / collections (project-scoped — all mock traffic for `{apiBaseUrl}/mock/{projectId}/*`):

```tsx
<MockRequestLogsPanel teamId={teamId} projectId={projectId} apiBaseUrl={apiBaseUrl} />
```

`apiBaseUrl` from `import.meta.env.VITE_API_URL` (same as `ApiDetail.tsx`).

### Wrangler / no-socket fallback

If `import.meta.env.VITE_MOCK_LOGS_ENABLED === 'false'` (set by port-manager only in Wrangler mode) or socket connection fails persistently, panel shows: "Live request logs require the Node dev server."

---

## Files Summary

| Action | Path |
|--------|------|
| Create | `server/src/lib/mock-request-logs.ts` |
| Create | `server/src/lib/mock-request-snapshot.ts` |
| Create | `server/src/lib/mock-log-socket.ts` |
| Modify | `server/src/api.ts` |
| Modify | `server/src/server.ts` |
| Modify | `server/package.json` |
| Create | `ui/src/lib/mock-log-socket.ts` |
| Create | `ui/src/components/mock-request-logs-panel.tsx` |
| Modify | `ui/src/pages/ProjectDetail.tsx` |
| Modify | `ui/package.json` |
| Optional | `scripts/port-manager.js` — set `VITE_MOCK_LOGS_ENABLED=false` in Wrangler mode |

---

## Edge Cases

- **Request body consumed once:** always snapshot via `request.clone()` before `executeMockRequest`.
- **Large bodies:** truncate at store time; UI shows truncation marker.
- **Sensitive headers:** log as-is (local dev tool); optional follow-up: redact `Authorization` in UI.
- **High traffic:** ring buffer drops oldest; UI caps rendered rows (e.g. 200) for performance.
- **Multi-instance dev:** in-memory logs are per server process (acceptable for local dev).
- **404 / no matching route:** still logged with `matchedRouteId: null` and 404 status — helps debug wrong path/method.
- **HEAD / OPTIONS:** body null; still log URL, headers, query, latency.
- No `db:push` required.
