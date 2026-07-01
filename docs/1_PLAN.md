# Feature 1: Teams, Invites, and Roles

## Context

User needs to be able to **create a team**, and then **invite other users to join the organization**, with either **admin** or **user** roles.

The codebase has no multi-tenancy today: only `app.users`, `user.me`, and `user.update` exist. Team/org membership is greenfield on the existing stack (Drizzle `app` schema, tRPC, React). "Team" and "organization" refer to the same entity (`teams` table). Invite delivery is link-based (copy URL); no email provider is configured.

Team-scoped features require a signed-in user with a non-null `email` (reject anonymous Firebase users).

---

## Phase 1 — Data Layer

### New schema: `server/src/schema/teams.ts`

Define in `app` schema (same pattern as `server/src/schema/users.ts`):

| Table | Columns | Constraints |
|-------|---------|-------------|
| `teams` | `id` (uuid PK), `name`, `created_by` (FK → `users.id`), `created_at`, `updated_at` | — |
| `team_members` | `id` (uuid PK), `team_id` (FK), `user_id` (FK), `role`, `created_at` | unique `(team_id, user_id)` |
| `team_invites` | `id` (uuid PK), `team_id` (FK), `email`, `role`, `token` (unique), `invited_by` (FK), `expires_at`, `accepted_at` (nullable), `created_at` | unique `(team_id, email)` where `accepted_at IS NULL` enforced in application logic |

`role` is a Postgres enum or text column with allowed values **`admin`** and **`user`** (verbatim from requirement).

### Zod schemas: `server/src/schema/zod.ts`

Add select/insert/update schemas for the three tables (follow `userSelectSchema` timestamp → ISO string transform pattern).

Export shared input schemas:
- `teamCreateSchema` — `{ name: string }`
- `inviteCreateSchema` — `{ teamId, email, role: 'admin' | 'user' }`
- `memberRoleUpdateSchema` — `{ teamId, userId, role: 'admin' | 'user' }`

### DB wiring

- **`server/src/lib/db.ts`** — change `import * as schema from '../schema/users'` to a barrel (e.g. `server/src/schema/index.ts`) that re-exports `users`, `teams`, `team_members`, `team_invites` so Drizzle relations work.
- Run `pnpm db:push` from `server/` after schema changes.

### Shared auth helpers: `server/src/lib/team-auth.ts` (new)

Query helpers used by tRPC middleware and procedures:
- `getMembership(db, teamId, userId)` → row or null
- `requireMembership(db, teamId, userId)` → throws if not a member
- `requireAdmin(db, teamId, userId)` → throws if role ≠ `admin`
- `countAdmins(db, teamId)` → used to guard last-admin demotion/removal

---

## Phase 2A — API (tRPC)

### Middleware: `server/src/trpc/init.ts`

Add factory middleware (alongside `requireUser`):

- `requireVerifiedUser` — `protectedProcedure` + reject `ctx.user.email === null`
- `requireTeamMember(input.teamId)` — loads membership into `ctx.membership`
- `requireTeamAdmin(input.teamId)` — membership role must be `admin`

### Router: `server/src/trpc/routers/team.ts` (new)

| Procedure | Auth | Algorithm |
|-----------|------|-----------|
| `team.create` | verified user | 1) Insert `teams` with `created_by = ctx.user.id`. 2) Insert `team_members` with `role = admin`. 3) Return team + caller's membership. |
| `team.list` | protected | Select teams via join on `team_members` where `user_id = ctx.user.id`. Include caller's `role` per team. |
| `team.get` | team member | Return team row + members list (user id, email, display_name, role). |
| `team.update` | team admin | Update `teams.name`. |
| `team.members.updateRole` | team admin | 1) Load target membership. 2) If demoting admin → `user`, ensure `countAdmins > 1`. 3) Update `role`. |
| `team.members.remove` | team admin | 1) Block self-removal if last admin. 2) Delete `team_members` row. |

### Router: `server/src/trpc/routers/invite.ts` (new)

| Procedure | Auth | Algorithm |
|-----------|------|-----------|
| `invite.create` | team admin | 1) Reject if email already a member. 2) Revoke or reject duplicate pending invite for same `(team_id, email)`. 3) Generate cryptographically random `token`, set `expires_at` (e.g. 7 days). 4) Insert `team_invites` with requested **admin** or **user** role. 5) Return invite metadata + accept URL path `/invite/:token`. |
| `invite.list` | team admin | Pending invites for `team_id` (`accepted_at IS NULL`, not expired). |
| `invite.revoke` | team admin | Delete or mark invite invalid by id + team_id. |
| `invite.preview` | public (token input) | Return team name + invited email + role if token valid and not expired/accepted; no auth required. |
| `invite.accept` | verified user | 1) Load invite by `token`. 2) Fail if expired, already accepted, or `ctx.user.email` ≠ invite `email` (case-insensitive). 3) Insert `team_members` with invite's role. 4) Set `accepted_at`. 5) Return team id. |

### Register routers: `server/src/trpc/router.ts`

Add `team: teamRouter` and `invite: inviteRouter` to `appRouter`.

---

## Phase 2B — UI (React)

### Team context: `ui/src/lib/team-context.tsx` (new)

- Fetch `team.list` on auth.
- Hold `activeTeamId` in React state + `localStorage`.
- Expose `teams`, `activeTeam`, `setActiveTeam`, `refetchTeams`.

Wrap authenticated layout in `App.tsx` (inside `AuthProvider`, around sidebar content).

### Routes: `ui/src/App.tsx`

| Path | Page |
|------|------|
| `/teams` | List user's teams + "Create team" form |
| `/teams/:teamId` | Team detail: members table, invite form (admin only), pending invites (admin only) |
| `/invite/:token` | Accept-invite page (login redirect if needed, then `invite.accept`) |

### New pages

- **`ui/src/pages/Teams.tsx`** — `team.list`, link to detail, create-team dialog calling `team.create`.
- **`ui/src/pages/TeamDetail.tsx`** — `team.get`, `invite.list`; admin UI for role dropdown (`admin` / `user`), remove member, create invite with role selector; show copyable invite link from `invite.create` response.
- **`ui/src/pages/AcceptInvite.tsx`** — `invite.preview` on load; accept button calls `invite.accept`; handle email mismatch error with clear message.

### Navigation

- **`ui/src/components/appSidebar.tsx`** — add Teams nav item (`/teams`).
- **`ui/src/components/team-switcher.tsx`** (new) — dropdown in sidebar header or navbar to switch `activeTeamId` (for future mock-endpoint scoping).

### Patterns to follow

- tRPC hooks as in `ui/src/pages/Settings.tsx` (`trpc.team.create.useMutation`, etc.).
- ShadCN components already in `ui/src/components/ui/`.
- Block team UI for anonymous users (match server `requireVerifiedUser`).

---

## Files Summary

| Action | Path |
|--------|------|
| Create | `server/src/schema/teams.ts` |
| Create | `server/src/schema/index.ts` |
| Create | `server/src/lib/team-auth.ts` |
| Create | `server/src/trpc/routers/team.ts` |
| Create | `server/src/trpc/routers/invite.ts` |
| Modify | `server/src/schema/zod.ts` |
| Modify | `server/src/lib/db.ts` |
| Modify | `server/src/trpc/init.ts` |
| Modify | `server/src/trpc/router.ts` |
| Create | `ui/src/lib/team-context.tsx` |
| Create | `ui/src/pages/Teams.tsx` |
| Create | `ui/src/pages/TeamDetail.tsx` |
| Create | `ui/src/pages/AcceptInvite.tsx` |
| Create | `ui/src/components/team-switcher.tsx` |
| Modify | `ui/src/App.tsx` |
| Modify | `ui/src/components/appSidebar.tsx` |

---

## Edge Cases (application logic, not PM scope)

- Last admin cannot be demoted or removed; transfer admin first.
- Creator is always the first `admin` member on `team.create`.
- Accept invite: user must authenticate with the same email the invite was sent to.
- Expired or revoked tokens return `NOT_FOUND` / `BAD_REQUEST` on accept.
