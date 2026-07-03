# Feature 5: Request Matching & Routing Rules

## Context

Real APIs don't just return the same data blindly; they **adapt based on query parameters, request headers, or request bodies**.

Each mock route (`api_routes`) today has a single static response per `(path, method)`. This feature adds **conditional response rules** evaluated at request time against the incoming HTTP `Request` object. The base route row remains the **fallback** when no rule matches.

**Example rules (verbatim from requirement):**
- If query param `?status=pending` → return a list of **3 pending orders**
- If query param `?status=completed` → return **50 completed orders**
- If header **`Authorization` is missing** → automatically respond with **401 Unauthorized**

**Portfolio flex:** Build an **advanced rule-builder interface in React using nested fields and dropdown selectors**. On the Node side, write a **clean logic-matching engine** that inspects incoming HTTP request objects.

Faker templates (`{{faker.*}}`, `__fakerArray`) from Feature 4 apply to each rule's `response_body` at runtime via existing `resolveResponseBody`.

**Access:** Reuse `requireProjectAccess` — same as `mockApi.routes.*`.

---

## Phase 1 — Data Layer

### Extend schema: `server/src/schema/mocks.ts`

New table `api_route_rules`:

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `route_id` | uuid FK → `api_routes.id` cascade | |
| `name` | text nullable | optional label for UI ("Pending orders") |
| `priority` | int not null default 0 | **lower = evaluated first** |
| `match_mode` | text | `all` \| `any` — how conditions combine |
| `conditions` | text (JSON) | array of condition objects |
| `status_code` | int not null default 200 | |
| `response_type` | text | `json` \| `url_encoded` |
| `response_body` | text not null | supports faker templates |
| `created_at`, `updated_at` | timestamp | |

`api_routes` unchanged — its `status_code`, `response_type`, `response_body` are the **default fallback**.

### Condition shape (stored in `conditions` JSON)

| Field | Values |
|-------|--------|
| `source` | `query` \| `header` \| `body` |
| `key` | query param name, header name, or top-level JSON body field name |
| `operator` | `equals` \| `not_equals` \| `exists` \| `not_exists` \| `contains` |
| `value` | string, optional — omitted for `exists` / `not_exists` |

Examples mapping to requirement:
- `?status=pending` → `{ source: "query", key: "status", operator: "equals", value: "pending" }`
- `Authorization` missing → `{ source: "header", key: "Authorization", operator: "not_exists" }`

### Barrel: `server/src/schema/index.ts`

Re-export `api_route_rules`.

### Zod: `server/src/schema/zod.ts`

- `routeConditionSchema` — single condition
- `routeRuleSelectSchema` — DB row + parsed `conditions` array
- `routeRuleCreateSchema` — `{ teamId, projectId, apiId, routeId, name?, priority?, matchMode, conditions, statusCode?, responseType, responseBody }`
- `routeRuleUpdateSchema` — same + `ruleId`
- `routeRuleIdSchema` — `{ teamId, projectId, apiId, routeId, ruleId }`
- `routeRuleListSchema` — `{ teamId, projectId, apiId, routeId }`
- `routeRuleReorderSchema` — `{ teamId, projectId, apiId, routeId, ruleIds: uuid[] }` (ordered by priority)

Validate each rule's `response_body` with existing `validateResponseBody` (faker + `__fakerArray`).

Validate `conditions`: non-empty array; `value` required for `equals` / `not_equals` / `contains`; `key` required for all sources.

### DB push

Run `pnpm db:push` from `server/`.

---

## Phase 2A — Request Matching Engine

### New module: `server/src/lib/mock-matching.ts`

Types:
- `MockRequestContext` — `{ url: URL, method: string, headers: Headers, bodyText: string | null }`
- `RouteCondition`, `RouteRule` (inferred from schema)

Export:

| Function | Role |
|----------|------|
| `buildRequestContext(request)` | Parse URL; read body once (`request.text()`) for methods that may have a body; cache result |
| `getConditionActualValue(ctx, condition)` | Resolve actual value from query/header/body |
| `evaluateCondition(ctx, condition)` | Compare using operator |
| `evaluateRule(ctx, rule)` | Apply `match_mode`: `all` = every condition true; `any` = at least one true |
| `selectMatchingRule(rules, ctx)` | Sort by `priority` ASC; return first rule where `evaluateRule` is true, else `null` |

**`getConditionActualValue` algorithm:**
1. **`query`:** `ctx.url.searchParams.get(key)` (first value; case-sensitive key)
2. **`header`:** `ctx.headers.get(key)` (HTTP header lookup is case-insensitive)
3. **`body`:** if `bodyText` is null/empty → `null`. Try `JSON.parse`; on success read top-level `key` via `parsed[key]` stringified; on failure treat entire body as opaque string for `contains` only

**`evaluateCondition` algorithm:**
1. Resolve `actual` via `getConditionActualValue`
2. `exists` → `actual !== null && actual !== ''`
3. `not_exists` → `actual === null || actual === ''`
4. `equals` → `actual === value`
5. `not_equals` → `actual !== value`
6. `contains` → `actual` includes `value` (string coercion)

### Modify: `server/src/lib/mock-proxy.ts`

- Add `findRouteRules(db, routeId)` — select all rules for route, order by `priority` ASC
- Refactor `buildMockResponse` to accept `{ status_code, response_type, response_body }` (route or rule row)
- Update `handleMockRequest`:
  1. `findMatchingRoute` (unchanged path/method match)
  2. If no route → 404
  3. `ctx = await buildRequestContext(request)`
  4. `rules = await findRouteRules(db, route.id)`
  5. `matched = selectMatchingRule(rules, ctx)`
  6. If `matched` → `buildMockResponse(matched)` else `buildMockResponse(route)` (fallback)
  7. Both paths run `resolveResponseBody` inside `buildMockResponse`

**Fixed-count list examples** (requirement: 3 vs 50 items) use `__fakerArray` with `min` = `max`:
- 3 pending: `{ "__fakerArray": { "min": 3, "max": 3, "item": { ... } } }`
- 50 completed: `{ "__fakerArray": { "min": 50, "max": 50, "item": { ... } } }` (within `FAKER_ARRAY_MAX_ITEMS` cap of 100)

---

## Phase 2B — Configuration API (tRPC)

### Extend: `server/src/trpc/routers/mockApi.ts`

New nested router `rules`:

| Procedure | Algorithm |
|-----------|-----------|
| `mockApi.rules.list` | `requireProjectAccess` → verify route in project → select rules ordered by `priority` |
| `mockApi.rules.create` | Verify route → validate conditions + response body → insert with next `priority` if omitted |
| `mockApi.rules.update` | Verify rule belongs to route → update fields |
| `mockApi.rules.delete` | Delete rule row |
| `mockApi.rules.reorder` | Set `priority` from array index of `ruleIds` |

### Extend: `mockApi.routes.preview`

Add optional `requestContext` to input:
```ts
{ query?: Record<string, string>, headers?: Record<string, string>, body?: string }
```
Build synthetic `MockRequestContext`, load route rules, run `selectMatchingRule`, resolve winning response (or fallback). Return `{ resolvedBody, statusCode, matchedRuleId: string | null }`.

### Register: `server/src/trpc/router.ts`

No change if rules live under existing `mockApi` router.

---

## Phase 2C — Rule Builder UI

### New component: `ui/src/components/route-rule-builder.tsx`

**Advanced rule-builder** with nested fields and dropdown selectors:
- List rules for a route (name, priority, condition summary, status, actions)
- Add / edit rule panel:
  - **Conditions** (repeatable rows):
    - Source dropdown: `Query parameter` | `Header` | `Body field`
    - Key input
    - Operator dropdown: `equals` | `not equals` | `exists` | `does not exist` | `contains`
    - Value input (hidden when operator is exists/not_exists)
  - Match mode dropdown: `All conditions` | `Any condition`
  - Response: status code, response type (`json` / `url_encoded`), body textarea (faker + array help)
- Reorder rules (up/down or drag) → `mockApi.rules.reorder`
- Delete rule → `ConfirmDialog`

### Modify: `ui/src/pages/ApiDetail.tsx`

- In route edit form (or expandable row per route), embed `RouteRuleBuilder` when editing/creating a route
- **Preview** panel: add optional inputs for query params, headers, and body so developers can test which rule fires before saving
- Route list: show rule count badge per route

---

## Files Summary

| Action | Path |
|--------|------|
| Modify | `server/src/schema/mocks.ts` |
| Modify | `server/src/schema/index.ts` |
| Modify | `server/src/schema/zod.ts` |
| Create | `server/src/lib/mock-matching.ts` |
| Modify | `server/src/lib/mock-proxy.ts` |
| Modify | `server/src/trpc/routers/mockApi.ts` |
| Create | `ui/src/components/route-rule-builder.tsx` |
| Modify | `ui/src/pages/ApiDetail.tsx` |

---

## Edge Cases

- **Rule priority:** first match wins; overlapping rules resolved by `priority` only
- **No rule matches:** serve base `api_routes` response (current behavior preserved)
- **Empty conditions array:** reject at save (rules must have ≥1 condition)
- **Body conditions on GET/HEAD:** `bodyText` is null → `exists` fails, `not_exists` passes
- **Invalid JSON body:** body field conditions see `null` unless `contains` on raw string
- **401 rule:** dedicated rule with `not_exists` on `Authorization`, `status_code: 401`, error JSON body
- **Rule delete / route delete:** FK cascade removes rules
- **Preview / gateway parity:** both use same `selectMatchingRule` + `resolveResponseBody` path
- Request body read once per mock hit (required for POST body rules)
