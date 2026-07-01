import { TRPCError } from '@trpc/server';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import { users } from '../../schema/users';
import { projects, teamInviteProjects } from '../../schema/projects';
import { teamInvites, teamMembers, teams } from '../../schema/teams';
import {
  inviteCreateSchema,
  inviteRevokeSchema,
  inviteTokenSchema,
  teamInviteSelectSchema,
  teamSelectSchema,
} from '../../schema/zod';
import { applyInviteProjectAssignments } from '../../lib/project-auth';
import { requireAdmin } from '../../lib/team-auth';
import { publicProcedure, verifiedProcedure, router } from '../init';

const INVITE_EXPIRY_DAYS = 7;

function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function loadValidInvite(db: Parameters<typeof requireAdmin>[0], token: string) {
  const [invite] = await db
    .select()
    .from(teamInvites)
    .where(eq(teamInvites.token, token))
    .limit(1);

  if (!invite) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
  }

  if (invite.accepted_at) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invite has already been accepted' });
  }

  if (invite.expires_at < new Date()) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invite has expired' });
  }

  return invite;
}

async function validateInviteProjectIds(
  db: Parameters<typeof requireAdmin>[0],
  teamId: string,
  projectIds: string[]
) {
  if (projectIds.length === 0) return;

  const rows = await db
    .select()
    .from(projects)
    .where(inArray(projects.id, projectIds));

  if (rows.length !== projectIds.length) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'One or more projects not found' });
  }

  for (const project of rows) {
    if (project.team_id !== teamId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'All projects must belong to the same team',
      });
    }
  }
}

async function getInviteProjects(db: Parameters<typeof requireAdmin>[0], inviteId: string) {
  return db
    .select({
      id: projects.id,
      name: projects.name,
    })
    .from(teamInviteProjects)
    .innerJoin(projects, eq(teamInviteProjects.project_id, projects.id))
    .where(eq(teamInviteProjects.invite_id, inviteId));
}

export const inviteRouter = router({
  create: verifiedProcedure.input(inviteCreateSchema).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.db, input.teamId, ctx.user.id);

    const email = normalizeEmail(input.email);
    const projectIds = input.projectIds ?? [];

    const [existingMember] = await ctx.db
      .select({ user_id: teamMembers.user_id })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.user_id, users.id))
      .where(and(eq(teamMembers.team_id, input.teamId), eq(users.email, email)))
      .limit(1);

    if (existingMember) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'This user is already a member of the team',
      });
    }

    await validateInviteProjectIds(ctx.db, input.teamId, projectIds);

    await ctx.db
      .delete(teamInvites)
      .where(
        and(
          eq(teamInvites.team_id, input.teamId),
          eq(teamInvites.email, email),
          isNull(teamInvites.accepted_at)
        )
      );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

    const [invite] = await ctx.db
      .insert(teamInvites)
      .values({
        team_id: input.teamId,
        email,
        role: input.role,
        token: generateInviteToken(),
        invited_by: ctx.user.id,
        expires_at: expiresAt,
      })
      .returning();

    if (projectIds.length > 0) {
      await ctx.db.insert(teamInviteProjects).values(
        projectIds.map((projectId) => ({
          invite_id: invite.id,
          project_id: projectId,
        }))
      );
    }

    const parsed = teamInviteSelectSchema.parse(invite);
    const assignedProjects = await getInviteProjects(ctx.db, invite.id);

    return {
      ...parsed,
      acceptPath: `/invite/${invite.token}`,
      projects: assignedProjects,
    };
  }),

  list: verifiedProcedure.input(inviteCreateSchema.pick({ teamId: true })).query(async ({ ctx, input }) => {
    await requireAdmin(ctx.db, input.teamId, ctx.user.id);

    const now = new Date();
    const rows = await ctx.db
      .select()
      .from(teamInvites)
      .where(
        and(
          eq(teamInvites.team_id, input.teamId),
          isNull(teamInvites.accepted_at),
          gt(teamInvites.expires_at, now)
        )
      );

    const invites = await Promise.all(
      rows.map(async (row) => {
        const parsed = teamInviteSelectSchema.parse(row);
        const assignedProjects = await getInviteProjects(ctx.db, row.id);
        return {
          ...parsed,
          projects: assignedProjects,
        };
      })
    );

    return invites;
  }),

  revoke: verifiedProcedure.input(inviteRevokeSchema).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.db, input.teamId, ctx.user.id);

    const [invite] = await ctx.db
      .select()
      .from(teamInvites)
      .where(and(eq(teamInvites.id, input.inviteId), eq(teamInvites.team_id, input.teamId)))
      .limit(1);

    if (!invite) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
    }

    await ctx.db.delete(teamInvites).where(eq(teamInvites.id, input.inviteId));
    return { ok: true as const };
  }),

  preview: publicProcedure.input(inviteTokenSchema).query(async ({ ctx, input }) => {
    const invite = await loadValidInvite(ctx.db, input.token);

    const [team] = await ctx.db.select().from(teams).where(eq(teams.id, invite.team_id)).limit(1);
    if (!team) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' });
    }

    const assignedProjects = await getInviteProjects(ctx.db, invite.id);

    return {
      teamName: team.name,
      email: invite.email,
      role: invite.role,
      expires_at: invite.expires_at.toISOString(),
      projects: assignedProjects,
    };
  }),

  accept: verifiedProcedure.input(inviteTokenSchema).mutation(async ({ ctx, input }) => {
    const invite = await loadValidInvite(ctx.db, input.token);

    const userEmail = ctx.user.email;
    if (!userEmail || normalizeEmail(userEmail) !== normalizeEmail(invite.email)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Sign in with ${invite.email} to accept this invite`,
      });
    }

    const [existingMember] = await ctx.db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.team_id, invite.team_id), eq(teamMembers.user_id, ctx.user.id)))
      .limit(1);

    if (existingMember) {
      await applyInviteProjectAssignments(ctx.db, invite.id, ctx.user.id);
      await ctx.db
        .update(teamInvites)
        .set({ accepted_at: new Date() })
        .where(eq(teamInvites.id, invite.id));
      return { teamId: invite.team_id, alreadyMember: true as const };
    }

    await ctx.db.insert(teamMembers).values({
      team_id: invite.team_id,
      user_id: ctx.user.id,
      role: invite.role,
    });

    await applyInviteProjectAssignments(ctx.db, invite.id, ctx.user.id);

    await ctx.db
      .update(teamInvites)
      .set({ accepted_at: new Date() })
      .where(eq(teamInvites.id, invite.id));

    const [team] = await ctx.db.select().from(teams).where(eq(teams.id, invite.team_id)).limit(1);

    return {
      teamId: invite.team_id,
      team: team ? teamSelectSchema.parse(team) : null,
      alreadyMember: false as const,
    };
  }),
});
