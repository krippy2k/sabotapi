# Feature 6: State-Keeping (Dynamic CRUD Engine)

## Context

Most simple mocks are **entirely stateless**; if you send a **POST** request to add a new user, and then a **GET** request to list users, **the new user isn't there**.

This feature adds a **lightweight, isolated** data store per mock **collection** (scoped to a project). When a developer triggers **POST, PUT, or DELETE** requests, the Node backend **actually updates** that isolated data store. **GET** list/item routes read live data back.

**Portfolio flex:** Elevates the app from a basic **"response flinger"** into a **fully functional, stateful prototype backend database** that frontend teams can safely build actual applications against.

**Storage strategy (verbatim options):** **in-memory array** with **fast JSON-based storage file (like lowdb)** persistence — one JSON file per collection under `data/mock-stores/{projectId}/{collectionName}.json`. In-memory cache on read; write-through to disk on mutation. Node/local dev is the primary target (Cloudflare Workers have no durable filesystem; stateful mocks are Node-only for this feature).

Existing Features 4–5 (faker templates, routing rules) remain: rules evaluate **before** store handlers; static/faker responses still apply when a rule matches. Store CRUD runs only when the matched route has a `store_operation` and no rule matched.

---

## Phase 1 — Data Layer

### Extend schema: `server/src/schema/mocks.ts`

New table `mock_collections`:

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `project_id` | uuid FK → `projects.id` cascade | |
| `name` | text not null | e.g. `users`, `orders` |
| `id_field` | text not null default `id` | field used to identify items |
| `initial_data` | text not null default `[]` | JSON array seed (applied on reset) |
| `created_at`, `updated_at` | timestamp | |

Unique `(project_id, name)`.

### Extend `api_routes`

| Column | Type | Notes |
|--------|------|-------|
| `store_collection_id` | uuid FK → `mock_collections.id` nullable, set null on delete | |
| `store_operation` | text nullable | `list` \| `get` \| `create` \| `update` \| `delete` |

When `store_operation` is set, `store_collection_id` is required (Zod refine). When null, route behaves as today (static/faker only).

**Operation mapping (conventional REST):**

| `store_operation` | HTTP method (route) | Path pattern | Behavior |
|-------------------|---------------------|--------------|----------|
| `list` | GET | `/users` | Return full collection array |
| `get` | GET | `/users/:id` | Return single item by `id_field` |
| `create` | POST | `/users` | Append item from request JSON body |
| `update` | PUT or PATCH | `/users/:id` | Merge body into existing item |
| `delete` | DELETE | `/users/:id` | Remove item from array |

`response_body` on store routes is optional wrapper template; default response is the store payload directly (array or object). Support `{{store}}` token in `response_body` to embed live data inside a static shell (e.g. `{ "data": {{store}} }`).

### Zod: `server/src/schema/zod.ts`

- `storeOperationValues` / `storeOperationSchema`
- `mockCollectionSelectSchema`, `mockCollectionCreateSchema`, `mockCollectionUpdateSchema`, `mockCollectionIdSchema`, `mockCollectionListSchema`
- Extend `apiRouteCreateSchema` / `apiRouteUpdateSchema`: optional `storeCollectionId`, `storeOperation`; cross-field validation
- `mockCollectionResetSchema` — `{ teamId, projectId, collectionId }`

Validate `initial_data` parses as JSON array.

### DB push

Run `pnpm db:push` from `server/`.

---

## Phase 2A — Path Pattern Matching

Current `findMatchingRoute` uses **exact** path equality. CRUD needs `:param` segments.

### New module: `server/src/lib/mock-path-match.ts`

Export:

| Function | Role |
|----------|------|
| `compileRoutePattern(path)` | Split normalized path; `:name` segments are wildcards |
| `matchRoutePattern(pattern, requestPath)` | Return `null` or `Record<string, string>` of params |
| `findMatchingRouteWithParams(routes, method, requestPath)` | Among routes for project+method, try exact match first, then patterns; return `{ route, params }` |

**Algorithm:**
1. Normalize `requestPath` via existing `normalizeRoutePath`.
2. Prefer exact string match on `api_routes.path`.
3. Else for each route whose path contains `:`, compile and match segment count; bind param names to values.
4. Reject patterns with `..`; `:param` segments match one path segment (no slashes).

Update `normalizeRoutePath` / route create validation to allow `:id`-style segments.

---

## Phase 2B — Store Engine

### New module: `server/src/lib/mock-store.ts`

In-memory cache: `Map<string, unknown[]>` keyed by `{projectId}:{collectionName}`.

File path: `data/mock-stores/{projectId}/{collectionName}.json` (create dirs on write; add `data/mock-stores/` to `.gitignore`).

Export:

| Function | Role |
|----------|------|
| `loadCollection(projectId, collection)` | Read file → cache; if missing, parse `initial_data` from DB row, persist, return |
| `saveCollection(projectId, collection, items)` | Update cache + atomic write (write temp file, rename) |
| `listItems(...)` | `loadCollection` |
| `getItem(..., id)` | Find by `id_field` |
| `createItem(..., body, idField)` | Parse JSON body; if `id_field` missing, set `crypto.randomUUID()`; append; save; return item |
| `updateItem(..., id, body)` | Shallow merge; 404 if not found |
| `deleteItem(..., id)` | Filter out; 404 if not found |
| `resetCollection(...)` | Replace cache/file with `initial_data` from DB |

**`handleStoreRequest` algorithm:**
1. Load collection metadata from Postgres (`mock_collections` row).
2. `loadCollection` for current items.
3. Dispatch by `store_operation` + path `params.id` (for get/update/delete).
4. Build response JSON; if route `response_body` contains `{{store}}`, substitute stringified payload; else return payload as body.
5. Set `status_code` from route (201 default for `create` if route still 200 — optional: allow route config to set 201).
6. `Content-Type: application/json` for store responses.

Parse request body once (reuse `MockRequestContext.bodyText` from `mock-matching.ts`).

---

## Phase 2C — Mock Gateway Integration

### Modify: `server/src/lib/mock-proxy.ts`

Update `handleMockRequest`:

1. Load all candidate routes for `projectId` + `method` (new query — not only exact path).
2. `findMatchingRouteWithParams` → `{ route, params }` or 404.
3. `buildRequestContext(request)`.
4. Load rules → `selectMatchingRule` → if matched, `buildMockResponse(rule)` (unchanged).
5. Else if `route.store_operation` → `handleStoreRequest(db, route, params, ctx)` → `Response`.
6. Else `buildMockResponse(route)` fallback.

### Modify: `server/src/lib/faker-templates.ts`

Add `{{store}}` resolution hook in `resolveResponseBody` — caller passes optional `storePayload` for substitution (not a faker path).

---

## Phase 2D — Configuration API (tRPC)

### Extend: `server/src/trpc/routers/mockApi.ts`

New router `collections`:

| Procedure | Algorithm |
|-----------|-----------|
| `mockApi.collections.create` | `requireProjectAccess`; insert `mock_collections` |
| `mockApi.collections.list` | List collections for `projectId` |
| `mockApi.collections.update` | Update name, `id_field`, `initial_data` (does not mutate runtime file until reset) |
| `mockApi.collections.delete` | Delete row + delete JSON file if exists |
| `mockApi.collections.reset` | `resetCollection` — restore `initial_data` to file/cache |
| `mockApi.collections.snapshot` | Return current runtime array (for dashboard viewer) |

Extend `mockApi.routes.create` / `update` to accept `storeCollectionId` + `storeOperation`.

---

## Phase 2E — UI

### New component: `ui/src/components/mock-collection-panel.tsx`

On **Project detail** (`ui/src/pages/ProjectDetail.tsx`) or **API detail**:
- List collections (name, item count from `snapshot`)
- Create collection: name, `id_field`, `initial_data` JSON array editor
- **Reset** / **Delete** collection → `ConfirmDialog`
- View live data (read-only JSON preview)

### Modify: `ui/src/pages/ApiDetail.tsx`

Route form additions (dropdown selectors):
- **Response mode:** `Static` | `Stateful (CRUD)`
- When stateful: collection select, operation select (`list` / `get` / `create` / `update` / `delete`)
- Path helper text: use `:id` for item routes (e.g. `/users/:id`)
- Hide or optionalize response body when operation is `list`/`get` (live data is the body)

Route list: badge `store` + operation name.

---

## Files Summary

| Action | Path |
|--------|------|
| Modify | `server/src/schema/mocks.ts` |
| Modify | `server/src/schema/index.ts` |
| Modify | `server/src/schema/zod.ts` |
| Create | `server/src/lib/mock-path-match.ts` |
| Create | `server/src/lib/mock-store.ts` |
| Modify | `server/src/lib/mock-proxy.ts` |
| Modify | `server/src/lib/mock-validation.ts` |
| Modify | `server/src/lib/faker-templates.ts` |
| Modify | `server/src/trpc/routers/mockApi.ts` |
| Create | `ui/src/components/mock-collection-panel.tsx` |
| Modify | `ui/src/pages/ProjectDetail.tsx` |
| Modify | `ui/src/pages/ApiDetail.tsx` |
| Modify | `.gitignore` (add `data/mock-stores/`) |

---

## Edge Cases

- **POST then GET:** same `store_collection_id` on both routes → shared file/cache.
- **Missing collection file:** seed from `initial_data` on first access.
- **Invalid POST body:** 400 if not valid JSON object.
- **Duplicate `id_field` on create:** 409 or overwrite — use **409 Conflict**.
- **Item not found:** 404 for get/update/delete.
- **Rules + store:** e.g. `Authorization not_exists` → 401 rule fires before store logic.
- **Faker on create:** merge request body first; optional route template with `{{store}}` for shaped responses.
- **Multi-instance dev:** file persistence shares state across server restarts; multiple Node processes need same `data/` path (single dev server assumed).
- **url_encoded store routes:** out of scope — store operations return JSON only.
- Deleting a project cascades `mock_collections`; orphan JSON dirs cleaned on `collections.delete` or lazy GC.
