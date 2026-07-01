# Feature 4: Dynamic Data Generation (Faker Integration)

## Context

Instead of returning a single static JSON file every time a developer calls a mock route (e.g. `/api/users`), the Node backend should use **faker.js** (`@faker-js/faker`) to generate **realistic, randomized mock data on the fly** at request time.

**Developer benefit:** Hitting `/api/user` returns a **new random name, random email, and actual formatted phone number every time**.

**Dashboard syntax:** Users save **template strings** like `{{faker.person.firstName}}` directly inside their mock JSON response bodies in the React dashboard. The Node server **parses and populates** those tokens before responding.

No database schema changes — templates live in the existing `api_routes.response_body` text column. Resolution runs only in the mock gateway (`handleMockRequest` / `buildMockResponse`), not at save time (except validation).

---

## Phase 1 — Faker Template Engine (Server)

### Dependency: `server/package.json`

Add `@faker-js/faker` to server dependencies (server-side only; UI does not bundle faker).

### New module: `server/src/lib/faker-templates.ts`

Export:

| Function | Role |
|----------|------|
| `FAKER_TOKEN_PATTERN` | Regex for `{{...}}` tokens (non-greedy inner match) |
| `extractFakerTokens(body)` | Return all unique token inner strings from a body |
| `resolveFakerPath(path)` | Given `faker.person.firstName`, walk the `@faker-js/faker` export; invoke if function (no args); stringify primitives |
| `resolveTemplatesInString(value)` | Replace every `{{faker.*}}` match in a string with `resolveFakerPath` result |
| `stripTemplatesForValidation(body)` | Replace each `{{...}}` with a safe placeholder so structural validation can proceed |
| `resolveResponseBody(responseType, responseBody)` | Entry point used by mock gateway |

**Token syntax (verbatim):** `{{faker.person.firstName}}` — double curly braces, inner path must start with `faker.` followed by dot-separated Faker API segments matching `@faker-js/faker` (e.g. `faker.internet.email`, `faker.phone.number`).

**`resolveFakerPath` algorithm:**
1. Trim whitespace from inner token; reject if it does not start with `faker.`.
2. Split on `.`; first segment must be `faker`; remaining segments are the property path.
3. Walk from the default `faker` instance: for each segment, descend; if current value is a function, call with no arguments.
4. Coerce result: if `string` | `number` | `boolean`, use as-is; otherwise `JSON.stringify` the value.
5. If path is invalid or throws, return the original `{{...}}` token unchanged (mock still responds; bad tokens are visible to the developer).

**`resolveResponseBody` algorithm:**
1. If `response_body` contains no `{{` tokens, return as-is (static responses unchanged).
2. **`json`:**
   - `JSON.parse(response_body)` into a value tree.
   - Recursively walk: arrays map children; objects map values; strings run through `resolveTemplatesInString`.
   - **Whole-string template coercion:** if a string value matches exactly one token (entire value is `{{faker.datatype.boolean}}`), and `resolveFakerPath` returns a non-string primitive, use that primitive type in the output JSON (so booleans/numbers are not quoted).
   - `JSON.stringify` the resolved tree (no pretty-print).
3. **`url_encoded`:**
   - Run `resolveTemplatesInString` on the raw body string (templates may appear in parameter values, e.g. `name={{faker.person.firstName}}&email={{faker.internet.email}}`).
4. Return resolved string.

Each mock request creates **fresh random values** (new faker calls per hit; no cross-request caching).

---

## Phase 2A — Mock Gateway Runtime

### Modify: `server/src/lib/mock-proxy.ts`

Update `buildMockResponse(route)`:
1. Call `resolveResponseBody(route.response_type, route.response_body)`.
2. Return `Response` with resolved body, existing `status_code`, and existing `Content-Type` from `getContentTypeForResponse`.

`handleMockRequest` unchanged except it now serves dynamically resolved bodies.

**Example stored body** (for route `GET /api/user`):

```json
{
  "firstName": "{{faker.person.firstName}}",
  "email": "{{faker.internet.email}}",
  "phone": "{{faker.phone.number}}"
}
```

Each `GET /mock/{projectId}/api/user` returns new values.

---

## Phase 2B — Save-Time Validation

Templates must remain valid JSON / url-encoded **after** placeholders are substituted.

### Modify: `server/src/lib/mock-validation.ts`

Update `validateResponseBody`:
- Before `JSON.parse` or `URLSearchParams`, call `stripTemplatesForValidation(responseBody)`.
- `stripTemplatesForValidation`: replace each `{{...}}` with `"__faker__"` (json) or `placeholder` (url_encoded values) so structure validators pass.
- Optionally validate each extracted token starts with `faker.` via `extractFakerTokens`; if not, throw `BAD_REQUEST` with message listing invalid tokens.

### Modify: `server/src/schema/zod.ts`

Update `responseBodyRefine` in `apiRouteCreateSchema` / `apiRouteUpdateSchema` to use the same strip-and-validate logic (import from `mock-validation.ts` or `faker-templates.ts` to avoid duplication).

Bodies like `{"name":"{{faker.person.firstName}}"}` must save successfully; bodies with broken JSON structure still rejected.

---

## Phase 2C — Dashboard UI

### Modify: `ui/src/pages/ApiDetail.tsx`

Route form **Mock response body** textarea:
- Update `json` placeholder/example to show faker templates, e.g. `{"firstName":"{{faker.person.firstName}}","email":"{{faker.internet.email}}","phone":"{{faker.phone.number}}"}`.
- Add helper text under the textarea explaining: **template strings** `{{faker.*}}` are resolved on every mock request with randomized data.
- Add a compact **syntax reference** (collapsible or muted list) of common tokens aligned with user examples:
  - `{{faker.person.firstName}}`, `{{faker.person.lastName}}`
  - `{{faker.internet.email}}`
  - `{{faker.phone.number}}`
  - `{{faker.string.uuid}}`, `{{faker.location.city}}`, etc.

### Optional: preview procedure

### Modify: `server/src/trpc/routers/mockApi.ts`

Add `mockApi.routes.preview` (protected, project access):
- Input: `{ teamId, projectId, responseType, responseBody }`
- Output: `{ resolvedBody: string }` via `resolveResponseBody` (no DB write).

### Modify: `ui/src/pages/ApiDetail.tsx`

**Preview** button next to the response body textarea calls `mockApi.routes.preview` and shows resolved output in a read-only mono block below the form.

---

## Files Summary

| Action | Path |
|--------|------|
| Create | `server/src/lib/faker-templates.ts` |
| Modify | `server/package.json` |
| Modify | `server/src/lib/mock-proxy.ts` |
| Modify | `server/src/lib/mock-validation.ts` |
| Modify | `server/src/schema/zod.ts` |
| Modify | `server/src/trpc/routers/mockApi.ts` (preview only) |
| Modify | `ui/src/pages/ApiDetail.tsx` |

---

## Edge Cases

- Static bodies with no `{{` tokens behave exactly as today.
- Multiple tokens in one string (e.g. `"{{faker.person.firstName}} {{faker.person.lastName}}"`) each resolve independently in the same request.
- Invalid or unknown `faker.*` paths: leave token literal in response (developer can fix in dashboard).
- `json` validation: templates only allowed inside JSON string values (or as whole values for type coercion); malformed JSON after strip still rejected at save.
- `url_encoded`: empty body still allowed; templates in keys or values both supported via string replacement.
- Faker runs server-side only — mock gateway latency includes generation cost; acceptable for dev use.
- No new env vars or `db:push` required.
