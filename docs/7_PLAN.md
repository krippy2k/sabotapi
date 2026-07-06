# Feature 7: In-Dashboard Route Testing

## Context

**We need the ability to test the routes from within the dashboard.**

Today, `ApiDetail.tsx` has a **Preview** button inside the route **edit form** only. It calls `mockApi.routes.preview`, which resolves faker templates and evaluates routing rules against a synthetic context — but it does **not** run the full mock gateway pipeline. In particular:

- **Stateful CRUD** routes (`store_operation`) are not exercised (no real collection read/write).
- **Saved routes** in the list have no test action — users must copy the mock URL and use curl/Postman.
- Response **headers**, **timing**, and **resolved path** (with `:id` params) are not shown.

This feature adds a first-class **Send test request** flow on saved routes that invokes the same logic as `GET /mock/:projectId/*` (`handleMockRequest`), gated by project access via tRPC.

No database schema changes.

---

## Phase 1 — Mock Gateway Test Runner (Server)

### Refactor: `server/src/lib/mock-proxy.ts`

Extract shared execution from `handleMockRequest` into `executeMockRequest` returning metadata:

```ts
type MockRequestMeta = {
  matchedRouteId: string;
  matchedRuleId: string | null;
  storeOperation: string | null;
  resolvedPath: string;
};

type MockRequestResult = {
  response: Response;
  meta: MockRequestMeta;
};
```

**`executeMockRequest(db, projectId, request)` algorithm** (current `handleMockRequest` body):
1. Parse URL → `routePath` via `extractMockPath`.
2. `findRoutesForMethod` + `findMatchingRouteWithParams`.
3. No match → 404 response, `meta` with null route id.
4. `buildRequestContext(request)`.
5. Load rules → `selectMatchingRule`.
6. If rule matched → `buildMockResponse(rule)`.
7. Else if `route.store_operation` → `handleStoreRequest`.
8. Else → `buildMockResponse(route)`.
9. Return `{ response, meta }` including which route/rule/store path was used.

`handleMockRequest` becomes a thin wrapper: `executeMockRequest` → return `.response` (public gateway unchanged).

### New helper: `server/src/lib/mock-test-request.ts`

| Function | Role |
|----------|------|
| `substitutePathParams(path, pathParams)` | Replace `:param` segments in route pattern with provided values (e.g. `/users/:id` + `{ id: "1" }` → `/users/1`) |
| `buildMockTestUrl(projectId, resolvedPath, query?)` | `http://mock.test/mock/{projectId}{path}?...` (host arbitrary; only path matters to `extractMockPath`) |
| `buildMockTestRequest(method, url, headers?, body?)` | Construct `Request` for `executeMockRequest` |
| `responseToTestResult(response, meta, durationMs)` | Read body text; collect headers as `Record<string,string>`; return serializable result |

**`substitutePathParams` algorithm:**
1. Normalize path via `normalizeRoutePath`.
2. Split segments; for each `:name` segment, replace with `pathParams[name]` or leave `:name` if missing (gateway will 404 on mismatch).
3. Rejoin.

### New tRPC procedure: `mockApi.routes.test`

**Input schema** (`apiRouteTestSchema` in `server/src/schema/zod.ts`):

| Field | Type | Notes |
|-------|------|-------|
| `teamId`, `projectId`, `apiId`, `routeId` | uuid | required |
| `pathParams` | `Record<string, string>` optional | values for `:id` etc. |
| `query` | `Record<string, string>` optional | query string params |
| `headers` | `Record<string, string>` optional | request headers |
| `body` | string optional | request body (POST/PUT/PATCH/DELETE) |

**Algorithm:**
1. `requireProjectAccess` → `requireRouteInApi`.
2. Load route row (method, path from DB — not client-supplied method/path).
3. `resolvedPath = substitutePathParams(route.path, input.pathParams)`.
4. Build URL + `Request` with `route.method`.
5. `start = Date.now()` → `executeMockRequest(ctx.db, projectId, request)`.
6. Serialize response → return:

```ts
{
  status: number;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  resolvedPath: string;
  mockUrl: string;           // display URL using configured API origin hint
  matchedRouteId: string | null;
  matchedRuleId: string | null;
  storeOperation: string | null;
}
```

**Parity:** Same code path as external clients hitting `/mock/:projectId/*`, including rules, faker resolution, and stateful store mutations.

### Keep `mockApi.routes.preview`

Retain for **unsaved** form drafts (body/method not yet persisted). Optional follow-up: have Preview delegate to `test` after save. Out of scope: draft-route test without save.

---

## Phase 2 — UI

### New component: `ui/src/components/route-tester.tsx`

Props: `{ teamId, projectId, apiId, route, apiBaseUrl, defaultOpen? }`

**Request panel** (nested fields + dropdowns where applicable):
- Read-only **method** and **base URL** display: `{apiBaseUrl}/mock/{projectId}`
- **Path params** — dynamic inputs for each `:param` in `route.path` (parsed client-side from pattern)
- **Query string** input (same `key=value&...` format as existing preview context)
- **Headers** textarea (one `Name: value` per line)
- **Body** textarea (shown for POST, PUT, PATCH, DELETE)
- **Send** button → `mockApi.routes.test`

**Response panel:**
- HTTP status (color-coded: 2xx/4xx/5xx)
- Duration (ms)
- Metadata line: matched rule id, `store:{operation}`, or `static`
- Response headers (collapsible key/value list)
- Response body (pretty-printed JSON when parseable, else raw text)
- Copy response button

### Modify: `ui/src/pages/ApiDetail.tsx`

**Route list** (saved routes):
- Add **Test** button (e.g. `Play` icon) per route row → opens `RouteTester` in a **sheet/dialog** (or expandable panel below the row)
- Only one tester open at a time (or per-route expand)

**Route edit form:**
- Replace standalone **Preview** with **Test request** when `routeForm.routeId` is set (saved route) — uses `routes.test`
- When creating a new route (no `routeId`), keep **Preview** (`routes.preview`) for template/rule simulation on unsaved body
- Reuse `RouteTester` or shared request-context fields; remove duplicated preview context block from form once extracted

### Optional: `mockUrl` copy

Show full test URL in tester: `{apiBaseUrl}/mock/{projectId}{resolvedPath}` with query string appended for easy external replay.

---

## Files Summary

| Action | Path |
|--------|------|
| Create | `server/src/lib/mock-test-request.ts` |
| Modify | `server/src/lib/mock-proxy.ts` |
| Modify | `server/src/schema/zod.ts` |
| Modify | `server/src/trpc/routers/mockApi.ts` |
| Create | `ui/src/components/route-tester.tsx` |
| Modify | `ui/src/pages/ApiDetail.tsx` |

---

## Edge Cases

- **Path params missing** for `get`/`update`/`delete` on `/users/:id` → gateway may match a different route or 404; UI should mark required params from pattern.
- **Stateful POST** in tester mutates the real collection (same as external call) — show note in UI: "Test requests use live mock data."
- **CORS** not required — test goes through tRPC → server-side `executeMockRequest`, not browser `fetch` to `/mock`.
- **Rules + store:** rule match wins before store (existing behavior); metadata exposes which fired.
- **Faker templates:** new random values each test hit (expected).
- **204 DELETE** responses: body panel shows empty with status 204.
- **Invalid JSON body** on POST: 400 from store handler, surfaced in response panel.
- No `db:push` required.
