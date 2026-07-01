# Feature 3: Project APIs & Mock Routes

## Context

Now we need the **ability to add APIs to a project**. In each API we should be able to **create any number of routes**, corresponding to a **URL**, an **HTTP method** (GET, POST, etc), and a **mock return result**. The **mock return result could be JSON or a url-encoded response**, and we should be able to **configure what type of response it is**.

This is the core SabotAPI configuration surface (see `docs/PRODUCT_BRIEF.md`). Projects already exist with team-scoped membership (`server/src/schema/projects.ts`). Mock CRUD is greenfield; runtime serving is a new Hono catch-all on `/mock/*` (not tRPC). Chaos/latency toggles are out of scope for this feature.

**Access:** Reuse `requireProjectAccess` from `server/src/trpc/routers/project.ts` — team `admin` or project member may read/write mock config.

---

## Phase 1 — Data Layer

### New schema: `server/src/schema/mocks.ts`

| Table | Columns | Constraints |
|-------|---------|-------------|
| `project_apis` | `id` (uuid PK), `project_id` (FK → `projects.id`, cascade), `name`, `created_at`, `updated_at` | — |
| `api_routes` | `id` (uuid PK), `api_id` (FK → `project_apis.id`, cascade), `path` (text), `method` (text), `status_code` (int, default 200), `response_type` (text), `response_body` (text), `created_at`, `updated_at` | unique `(api_id, method, path)` |

Enums (text + Zod):
- `method`: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`
- `response_type`: **`json`** | **`url_encoded`** (verbatim from requirement)

`path` stores a normalized relative path (e.g. `/users/1`), always leading `/`, no query string.

### Barrel: `server/src/schema/index.ts`

Re-export `project_apis`, `api_routes`.

### Zod: `server/src/schema/zod.ts`

Select schemas (ISO timestamps) plus inputs:

- `projectApiCreateSchema` — `{ teamId, projectId, name }`
- `projectApiUpdateSchema` — `{ teamId, projectId, apiId, name }`
- `projectApiIdSchema` — `{ teamId, projectId, apiId }`
- `apiRouteCreateSchema` — `{ teamId, projectId, apiId, path, method, statusCode?, responseType, responseBody }`
- `apiRouteUpdateSchema` — same fields + `routeId`
- `apiRouteIdSchema` — `{ teamId, projectId, apiId, routeId }`

Validate `response_body` shape per `response_type`:
- `json` — must parse as JSON
- `url_encoded` — must parse as `application/x-www-form-urlencoded` key/value pairs

### DB push

Run `pnpm db:push` from `server/`.

---

## Phase 2A — Configuration API (tRPC)

### New router: `server/src/trpc/routers/mockApi.ts`

Nested under `apis` and `routes`:

| Procedure | Auth | Algorithm |
|-----------|------|-----------|
| `mockApi.apis.create` | project access | 1) `requireProjectAccess`. 2) Insert `project_apis`. 3) Return API row. |
| `mockApi.apis.list` | project access | Select all `project_apis` for `projectId`. |
| `mockApi.apis.update` | project access | Update `name`. |
| `mockApi.apis.delete` | project access | Delete API (cascades routes). |
| `mockApi.routes.create` | project access | 1) Verify API belongs to `projectId`. 2) Normalize `path` (leading `/`, collapse `//`). 3) Validate body per `response_type`. 4) Insert `api_routes`. |
| `mockApi.routes.list` | project access | List routes for `apiId`. |
| `mockApi.routes.update` | project access | Update route fields; re-validate body. |
| `mockApi.routes.delete` | project access | Delete route row. |

### Register: `server/src/trpc/router.ts`

Add `mockApi: mockApiRouter`.

---

## Phase 2B — Mock Gateway Runtime (Hono)

Per `docs/PRODUCT_BRIEF.md`, incoming mock traffic is served outside tRPC.

### New module: `server/src/lib/mock-proxy.ts`

Helpers:
- `normalizePath(pathname)` — strip `/mock/:projectId` prefix, normalize slashes
- `findMatchingRoute(db, projectId, method, path)` — query join `project_apis` ↔ `api_routes` where `projects.id = projectId`, `method` matches, `path` exact match
- `buildMockResponse(route)` — set `Content-Type` to `application/json` or `application/x-www-form-urlencoded`; return `response_body` as text with `status_code`

**Request algorithm** (`handleMockRequest`):
1. Parse `projectId` from URL prefix `/mock/:projectId/*`.
2. Load route via `findMatchingRoute`.
3. If no match → `404`.
4. Set response headers from `response_type`.
5. Return body + `status_code` (no chaos/delay in this feature).

### Wire: `server/src/api.ts`

Add public catch-all before tRPC:

```
app.all('/mock/:projectId/*', mockGatewayHandler)
```

Use `getDatabase()` directly (no auth on mock traffic — public mock endpoint for frontend dev). CORS already enabled globally.

**Public URL shape:** `GET http://localhost:5500/mock/{projectId}/users/1` matches route `path=/users/1`, `method=GET`.

---

## Phase 2C — UI

### Extend: `ui/src/pages/ProjectDetail.tsx`

Add **APIs** section below members:
- List APIs (`mockApi.apis.list`)
- Create API form (name)
- Link each API to detail page

### New page: `ui/src/pages/ApiDetail.tsx`

Route: `/teams/:teamId/projects/:projectId/apis/:apiId`

- API name (editable)
- Routes table: path, method, status, response type, actions
- Create/edit route form:
  - Path input
  - HTTP method select (`GET`, `POST`, etc.)
  - Status code input (default 200)
  - Response type select: **`json`** | **`url_encoded`**
  - Response body textarea (placeholder/examples per type)
- Show example mock URL: `{origin}/mock/{projectId}{path}`
- Delete API / delete route → use existing `ConfirmDialog` (`ui/src/components/confirm-dialog.tsx`)

### Routing: `ui/src/App.tsx`

Add `/teams/:teamId/projects/:projectId/apis/:apiId` → `ApiDetail`.

---

## Files Summary

| Action | Path |
|--------|------|
| Create | `server/src/schema/mocks.ts` |
| Create | `server/src/lib/mock-proxy.ts` |
| Create | `server/src/trpc/routers/mockApi.ts` |
| Create | `ui/src/pages/ApiDetail.tsx` |
| Modify | `server/src/schema/index.ts` |
| Modify | `server/src/schema/zod.ts` |
| Modify | `server/src/trpc/router.ts` |
| Modify | `server/src/api.ts` |
| Modify | `ui/src/pages/ProjectDetail.tsx` |
| Modify | `ui/src/App.tsx` |

---

## Edge Cases

- Duplicate `(api_id, method, path)` rejected at insert.
- `path` must start with `/`; reject `..` segments (path traversal).
- `json` response body must be valid JSON (object/array/primitive string).
- `url_encoded` body stored as raw string (e.g. `foo=bar&baz=1`); served as-is with correct `Content-Type`.
- Deleting a project cascades APIs and routes (FK cascade).
- Mock gateway is unauthenticated by design; project UUID acts as the public namespace.
