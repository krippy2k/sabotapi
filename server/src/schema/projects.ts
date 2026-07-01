import { primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { appSchema, users } from './users';
import { teamInvites, teams } from './teams';

export const projects = appSchema.table('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  team_id: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  created_by: text('created_by')
    .notNull()
    .references(() => users.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export const projectMembers = appSchema.table(
  'project_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    project_id: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    projectUserUnique: unique('project_members_project_user_unique').on(
      table.project_id,
      table.user_id
    ),
  })
);

export const teamInviteProjects = appSchema.table(
  'team_invite_projects',
  {
    invite_id: uuid('invite_id')
      .notNull()
      .references(() => teamInvites.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.invite_id, table.project_id] }),
  })
);

export type Project = typeof projects.$inferSelect;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type TeamInviteProject = typeof teamInviteProjects.$inferSelect;
