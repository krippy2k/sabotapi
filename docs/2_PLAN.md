# Feature 2: Team Projects & Project Member Assignment

## Context

Now we need to be able to **create projects within a team** and **add team members to the project**. When **inviting a user to a team** we should also be able to **select which projects they are assigned to initially**.

Projects are scoped to a single team. Only existing team members can be assigned to a project. Team admins manage projects and assignments; team `user` role members can view projects they belong to. Initial project assignment on invite is applied when the invite is accepted (including the already-member accept path).

---

## Phase 1 — Data Layer

### New schema: `server/src/schema/projects.ts`

| Table | Columns | Constraints |
|-------|---------|-------------|
| `projects` | `id` (uuid PK), `team_id` (FK → `teams.id`, cascade), `name`, `created_by` (FK → `users.id`), `created_at`, `updated_at` | — |
| `project_members` | `id` (uuid PK), `project_id` (FK → `projects.id`, cascade), `user_id` (FK → `users.id`, cascade), `created_at` | unique `(project_id, user_id)` |
| `team_invite_projects` | `invite_id` (FK → `team_invites.id`, cascade), `project_id` (FK → `projects.id`, cascade) | composite PK `(invite_id, project_id)` |

Export types: `Project`, `ProjectMember`, `TeamInviteProject`.

### Barrel: `server/src/schema/index.ts`

Re-export `projects`, `project_members`, `team_invite_projects`.

### Zod: `server/src/schema/zod.ts`

Add select schemas (ISO timestamp transforms) and input schemas:

- `projectCreateSchema` — `{ teamId, name }`
- `projectUpdateSchema` — `{ teamId, projectId, name }`
- `projectIdSchema` — `{ teamId, projectId }`
- `projectMemberAddSchema` — `{ teamId, projectId, userId }`
- `projectMemberRemoveSchema` — `{ teamId, projectId, userId }`
- Extend `inviteCreateSchema` with `projectIds: z.array(z.string().uuid()).optional().default([])`

### Auth helpers: `server/src/lib/project-auth.ts` (new)

- `getProject(db, projectId)` → row or null
- `requireProjectInTeam(db, projectId, teamId)` → project row or throw
- `requireProjectMember(db, projectId, userId)` → membership or throw
- `isTeamAdmin(db, teamId, userId)` — thin wrapper around existing `requireAdmin` / `getMembership`
- `applyInviteProjectAssignments(db, inviteId, userId)` — load `team_invite_projects` for invite, insert `project_members` rows (skip duplicates)

Reuse `server/src/lib/team-auth.ts` for team-level checks; do not duplicate admin/membership logic.

### DB push

Run `pnpm db:push` from `server/` after schema changes.

---

## Phase 2A — API

### New router: `server/src/trpc/routers/project.ts`

| Procedure | Auth | Algorithm |
|-----------|------|-----------|
| `project.create` | team admin | 1) Insert `projects` with `team_id`, `created_by`. 2) Insert `project_members` for creator. 3) Return project. |
| `project.list` | team member | If caller is team `admin`: all projects for `teamId`. If `user`: projects where caller has a `project_members` row (join `projects` ↔ `project_members`). |
| `project.get` | team member + project access | 1) `requireProjectInTeam`. 2) Admin or project member may view. 3) Return project + members list (user id, email, display_name). |
| `project.update` | team admin | Update `projects.name`. |
| `project.delete` | team admin | Delete project (cascades `project_members`, `team_invite_projects`). |
| `project.members.add` | team admin | 1) `requireProjectInTeam`. 2) Verify `userId` exists in `team_members` for `teamId`. 3) Insert `project_members` (idempotent on conflict). |
| `project.members.remove` | team admin | Delete `project_members` row. |
| `project.members.list` | team member + project access | Return member rows for project. |

### Extend: `server/src/trpc/routers/invite.ts`

**`invite.create`**
1. After existing validations, if `projectIds` non-empty: load each project, reject any where `project.team_id !== input.teamId`.
2. Insert `team_invites` as today.
3. Bulk insert `team_invite_projects` for each `projectId`.

**`invite.list`**
Include `projectIds` (and optionally project names) per pending invite via join on `team_invite_projects`.

**`invite.preview`**
Return `projects: { id, name }[]` for invite's initial assignments.

**`invite.accept`**
After `team_members` insert (or on `alreadyMember` path before marking accepted):
1. Call `applyInviteProjectAssignments(db, invite.id, ctx.user.id)`.
2. Delete `team_invite_projects` rows for invite (or rely on cascade when invite is cleaned up).

**`invite.revoke`**
Existing delete on `team_invites` cascades `team_invite_projects` — no change needed beyond FK cascade.

### Extend: `server/src/trpc/routers/team.ts`

**`team.members.remove`**
Before deleting `team_members` row: delete all `project_members` for that `userId` in projects where `projects.team_id = teamId`.

### Register: `server/src/trpc/router.ts`

Add `project: projectRouter`.

---

## Phase 2B — UI

### Team detail: `ui/src/pages/TeamDetail.tsx`

Add **Projects** section (visible to all team members):
- List projects (`project.list`); link to project detail.
- Admin: inline create-project form (`project.create`).

Extend **Invite members** form (admin only):
- Multi-select checklist of team projects (`project.list` with admin scope = all projects).
- Pass selected IDs as `projectIds` to `invite.create`.
- Show assigned projects on pending invites in the list.

### New page: `ui/src/pages/ProjectDetail.tsx`

Route: `/teams/:teamId/projects/:projectId`

- `project.get` — project name, member table.
- Admin: add-member dropdown populated from team members not yet on project (`team.get` members minus `project.get` members); call `project.members.add` / `project.members.remove`.
- Admin: rename (`project.update`), delete (`project.delete`).

### Routing: `ui/src/App.tsx`

Add route `/teams/:teamId/projects/:projectId` → `ProjectDetail`.

### Optional context: `ui/src/lib/team-context.tsx`

No required changes for this feature; project scoping can be added later for mock-endpoint work.

---

## Files Summary

| Action | Path |
|--------|------|
| Create | `server/src/schema/projects.ts` |
| Create | `server/src/lib/project-auth.ts` |
| Create | `server/src/trpc/routers/project.ts` |
| Create | `ui/src/pages/ProjectDetail.tsx` |
| Modify | `server/src/schema/index.ts` |
| Modify | `server/src/schema/zod.ts` |
| Modify | `server/src/trpc/routers/invite.ts` |
| Modify | `server/src/trpc/routers/team.ts` |
| Modify | `server/src/trpc/router.ts` |
| Modify | `ui/src/pages/TeamDetail.tsx` |
| Modify | `ui/src/App.tsx` |

---

## Edge Cases

- `projectIds` on invite must all belong to the same `teamId`; reject cross-team IDs.
- Cannot assign a user to a project unless they are (or will become) a team member — invite flow assigns team membership first, then projects.
- `project.members.add` rejects users not in `team_members`.
- Removing a team member clears their project memberships within that team.
- Team `admin` sees all team projects; team `user` sees only assigned projects.
- Duplicate `project_members` inserts are no-ops (unique constraint).
