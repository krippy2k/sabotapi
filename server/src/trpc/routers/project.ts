import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { users } from '../../schema/users';
import { projectMembers, projects } from '../../schema/projects';
import { teamMembers } from '../../schema/teams';
import {
  projectCreateSchema,
  projectIdSchema,
  projectMemberAddSchema,
  projectMemberRemoveSchema,
  projectSelectSchema,
  projectUpdateSchema,
  teamIdSchema,
} from '../../schema/zod';
import {
  isTeamAdmin,
  requireProjectAccess,
  requireProjectInTeam,
} from '../../lib/project-auth';
import { requireAdmin, requireMembership } from '../../lib/team-auth';
import { protectedProcedure, verifiedProcedure, router } from '../init';

export const projectRouter = router({
  create: verifiedProcedure.input(projectCreateSchema).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.db, input.teamId, ctx.user.id);

    const [project] = await ctx.db
      .insert(projects)
      .values({
        team_id: input.teamId,
        name: input.name,
        created_by: ctx.user.id,
      })
      .returning();

    await ctx.db.insert(projectMembers).values({
      project_id: project.id,
      user_id: ctx.user.id,
    });

    return projectSelectSchema.parse(project);
  }),

  list: protectedProcedure.input(teamIdSchema).query(async ({ ctx, input }) => {
    const teamMembership = await requireMembership(ctx.db, input.teamId, ctx.user.id);

    if (teamMembership.role === 'admin') {
      const rows = await ctx.db
        .select()
        .from(projects)
        .where(eq(projects.team_id, input.teamId));
      return rows.map((row) => projectSelectSchema.parse(row));
    }

    const rows = await ctx.db
      .select({ project: projects })
      .from(projects)
      .innerJoin(projectMembers, eq(projects.id, projectMembers.project_id))
      .where(
        and(eq(projects.team_id, input.teamId), eq(projectMembers.user_id, ctx.user.id))
      );

    return rows.map((row) => projectSelectSchema.parse(row.project));
  }),

  get: protectedProcedure.input(projectIdSchema).query(async ({ ctx, input }) => {
    const { project } = await requireProjectAccess(
      ctx.db,
      input.teamId,
      input.projectId,
      ctx.user.id
    );

    const members = await ctx.db
      .select({
        user_id: projectMembers.user_id,
        email: users.email,
        display_name: users.display_name,
        membership_id: projectMembers.id,
      })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.user_id, users.id))
      .where(eq(projectMembers.project_id, input.projectId));

    const callerIsAdmin = await isTeamAdmin(ctx.db, input.teamId, ctx.user.id);

    return {
      project: projectSelectSchema.parse(project),
      members,
      callerIsAdmin,
    };
  }),

  update: verifiedProcedure.input(projectUpdateSchema).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.db, input.teamId, ctx.user.id);
    await requireProjectInTeam(ctx.db, input.projectId, input.teamId);

    const [project] = await ctx.db
      .update(projects)
      .set({ name: input.name, updated_at: new Date() })
      .where(eq(projects.id, input.projectId))
      .returning();

    if (!project) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
    }

    return projectSelectSchema.parse(project);
  }),

  delete: verifiedProcedure.input(projectIdSchema).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.db, input.teamId, ctx.user.id);
    await requireProjectInTeam(ctx.db, input.projectId, input.teamId);

    await ctx.db.delete(projects).where(eq(projects.id, input.projectId));
    return { ok: true as const };
  }),

  members: router({
    list: protectedProcedure.input(projectIdSchema).query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.db, input.teamId, input.projectId, ctx.user.id);

      const members = await ctx.db
        .select({
          user_id: projectMembers.user_id,
          email: users.email,
          display_name: users.display_name,
          membership_id: projectMembers.id,
        })
        .from(projectMembers)
        .innerJoin(users, eq(projectMembers.user_id, users.id))
        .where(eq(projectMembers.project_id, input.projectId));

      return members;
    }),

    add: verifiedProcedure.input(projectMemberAddSchema).mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.db, input.teamId, ctx.user.id);
      await requireProjectInTeam(ctx.db, input.projectId, input.teamId);

      const [teamMember] = await ctx.db
        .select()
        .from(teamMembers)
        .where(
          and(eq(teamMembers.team_id, input.teamId), eq(teamMembers.user_id, input.userId))
        )
        .limit(1);

      if (!teamMember) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'User must be a team member before joining a project',
        });
      }

      const [membership] = await ctx.db
        .insert(projectMembers)
        .values({
          project_id: input.projectId,
          user_id: input.userId,
        })
        .onConflictDoNothing()
        .returning();

      if (!membership) {
        const existing = await ctx.db
          .select()
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.project_id, input.projectId),
              eq(projectMembers.user_id, input.userId)
            )
          )
          .limit(1);
        return {
          user_id: input.userId,
          membership_id: existing[0]?.id ?? null,
        };
      }

      return {
        user_id: membership.user_id,
        membership_id: membership.id,
      };
    }),

    remove: verifiedProcedure.input(projectMemberRemoveSchema).mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.db, input.teamId, ctx.user.id);
      await requireProjectInTeam(ctx.db, input.projectId, input.teamId);

      await ctx.db
        .delete(projectMembers)
        .where(
          and(
            eq(projectMembers.project_id, input.projectId),
            eq(projectMembers.user_id, input.userId)
          )
        );

      return { ok: true as const };
    }),
  }),
});
