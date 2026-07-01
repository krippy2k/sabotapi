import { TRPCError } from '@trpc/server';
import { and, eq, inArray } from 'drizzle-orm';
import { users } from '../../schema/users';
import { projectMembers, projects } from '../../schema/projects';
import { teamMembers, teams } from '../../schema/teams';
import {
  memberRemoveSchema,
  memberRoleUpdateSchema,
  teamCreateSchema,
  teamIdSchema,
  teamSelectSchema,
  teamUpdateSchema,
} from '../../schema/zod';
import { countAdmins, requireAdmin, requireMembership } from '../../lib/team-auth';
import { protectedProcedure, verifiedProcedure, router } from '../init';

export const teamRouter = router({
  create: verifiedProcedure.input(teamCreateSchema).mutation(async ({ ctx, input }) => {
    const [team] = await ctx.db
      .insert(teams)
      .values({
        name: input.name,
        created_by: ctx.user.id,
      })
      .returning();

    const [membership] = await ctx.db
      .insert(teamMembers)
      .values({
        team_id: team.id,
        user_id: ctx.user.id,
        role: 'admin',
      })
      .returning();

    return {
      team: teamSelectSchema.parse(team),
      membership: {
        id: membership.id,
        team_id: membership.team_id,
        user_id: membership.user_id,
        role: membership.role,
        created_at: membership.created_at.toISOString(),
      },
    };
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        team: teams,
        role: teamMembers.role,
        membership_id: teamMembers.id,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.team_id, teams.id))
      .where(eq(teamMembers.user_id, ctx.user.id));

    return rows.map((row) => ({
      ...teamSelectSchema.parse(row.team),
      role: row.role,
      membership_id: row.membership_id,
    }));
  }),

  get: protectedProcedure.input(teamIdSchema).query(async ({ ctx, input }) => {
    await requireMembership(ctx.db, input.teamId, ctx.user.id);

    const [team] = await ctx.db.select().from(teams).where(eq(teams.id, input.teamId)).limit(1);
    if (!team) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' });
    }

    const members = await ctx.db
      .select({
        user_id: teamMembers.user_id,
        role: teamMembers.role,
        email: users.email,
        display_name: users.display_name,
        membership_id: teamMembers.id,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.user_id, users.id))
      .where(eq(teamMembers.team_id, input.teamId));

    return {
      team: teamSelectSchema.parse(team),
      members,
      callerRole: (await requireMembership(ctx.db, input.teamId, ctx.user.id)).role,
    };
  }),

  update: verifiedProcedure.input(teamUpdateSchema).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.db, input.teamId, ctx.user.id);

    const [team] = await ctx.db
      .update(teams)
      .set({ name: input.name, updated_at: new Date() })
      .where(eq(teams.id, input.teamId))
      .returning();

    if (!team) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' });
    }

    return teamSelectSchema.parse(team);
  }),

  members: router({
    updateRole: verifiedProcedure.input(memberRoleUpdateSchema).mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.db, input.teamId, ctx.user.id);

      const [target] = await ctx.db
        .select()
        .from(teamMembers)
        .where(
          and(eq(teamMembers.team_id, input.teamId), eq(teamMembers.user_id, input.userId))
        )
        .limit(1);

      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
      }

      if (target.role === 'admin' && input.role === 'user') {
        const admins = await countAdmins(ctx.db, input.teamId);
        if (admins <= 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot demote the last admin. Promote another member first.',
          });
        }
      }

      const [updated] = await ctx.db
        .update(teamMembers)
        .set({ role: input.role })
        .where(eq(teamMembers.id, target.id))
        .returning();

      return {
        user_id: updated.user_id,
        role: updated.role,
        membership_id: updated.id,
      };
    }),

    remove: verifiedProcedure.input(memberRemoveSchema).mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.db, input.teamId, ctx.user.id);

      const [target] = await ctx.db
        .select()
        .from(teamMembers)
        .where(
          and(eq(teamMembers.team_id, input.teamId), eq(teamMembers.user_id, input.userId))
        )
        .limit(1);

      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
      }

      if (target.role === 'admin') {
        const admins = await countAdmins(ctx.db, input.teamId);
        if (admins <= 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot remove the last admin. Promote another member first.',
          });
        }
      }

      const teamProjects = await ctx.db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.team_id, input.teamId));

      const projectIds = teamProjects.map((p) => p.id);
      if (projectIds.length > 0) {
        await ctx.db
          .delete(projectMembers)
          .where(
            and(
              eq(projectMembers.user_id, input.userId),
              inArray(projectMembers.project_id, projectIds)
            )
          );
      }

      await ctx.db.delete(teamMembers).where(eq(teamMembers.id, target.id));
      return { ok: true as const };
    }),
  }),
});
