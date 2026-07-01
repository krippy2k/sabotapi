import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import type { DatabaseConnection } from './db';
import {
  projectMembers,
  projects,
  teamInviteProjects,
  type Project,
  type ProjectMember,
} from '../schema/projects';
import { getMembership } from './team-auth';

export async function getProject(
  db: DatabaseConnection,
  projectId: string
): Promise<Project | null> {
  const [row] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return row ?? null;
}

export async function requireProjectInTeam(
  db: DatabaseConnection,
  projectId: string,
  teamId: string
): Promise<Project> {
  const project = await getProject(db, projectId);
  if (!project) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
  }
  if (project.team_id !== teamId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Project does not belong to this team' });
  }
  return project;
}

export async function getProjectMember(
  db: DatabaseConnection,
  projectId: string,
  userId: string
): Promise<ProjectMember | null> {
  const [row] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.project_id, projectId), eq(projectMembers.user_id, userId)))
    .limit(1);
  return row ?? null;
}

export async function requireProjectMember(
  db: DatabaseConnection,
  projectId: string,
  userId: string
): Promise<ProjectMember> {
  const membership = await getProjectMember(db, projectId, userId);
  if (!membership) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a project member' });
  }
  return membership;
}

export async function isTeamAdmin(
  db: DatabaseConnection,
  teamId: string,
  userId: string
): Promise<boolean> {
  const membership = await getMembership(db, teamId, userId);
  return membership?.role === 'admin';
}

export async function applyInviteProjectAssignments(
  db: DatabaseConnection,
  inviteId: string,
  userId: string
): Promise<void> {
  const rows = await db
    .select({ project_id: teamInviteProjects.project_id })
    .from(teamInviteProjects)
    .where(eq(teamInviteProjects.invite_id, inviteId));

  for (const row of rows) {
    await db
      .insert(projectMembers)
      .values({
        project_id: row.project_id,
        user_id: userId,
      })
      .onConflictDoNothing();
  }
}
