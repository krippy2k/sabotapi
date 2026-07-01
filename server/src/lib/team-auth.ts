import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';
import type { DatabaseConnection } from './db';
import { teamMembers, type TeamMember } from '../schema/teams';

export async function getMembership(
  db: DatabaseConnection,
  teamId: string,
  userId: string
): Promise<TeamMember | null> {
  const [row] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.team_id, teamId), eq(teamMembers.user_id, userId)))
    .limit(1);
  return row ?? null;
}

export async function requireMembership(
  db: DatabaseConnection,
  teamId: string,
  userId: string
): Promise<TeamMember> {
  const membership = await getMembership(db, teamId, userId);
  if (!membership) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a team member' });
  }
  return membership;
}

export async function requireAdmin(
  db: DatabaseConnection,
  teamId: string,
  userId: string
): Promise<TeamMember> {
  const membership = await requireMembership(db, teamId, userId);
  if (membership.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return membership;
}

export async function countAdmins(db: DatabaseConnection, teamId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(teamMembers)
    .where(and(eq(teamMembers.team_id, teamId), eq(teamMembers.role, 'admin')));
  return result?.count ?? 0;
}
