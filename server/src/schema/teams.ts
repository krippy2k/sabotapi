import { text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { appSchema, users } from './users';

export const teamRoleValues = ['admin', 'user'] as const;
export type TeamRole = (typeof teamRoleValues)[number];

export const teams = appSchema.table('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  created_by: text('created_by')
    .notNull()
    .references(() => users.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export const teamMembers = appSchema.table(
  'team_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    team_id: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').$type<TeamRole>().notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    teamUserUnique: unique('team_members_team_user_unique').on(table.team_id, table.user_id),
  })
);

export const teamInvites = appSchema.table('team_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  team_id: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').$type<TeamRole>().notNull(),
  token: text('token').notNull().unique(),
  invited_by: text('invited_by')
    .notNull()
    .references(() => users.id),
  expires_at: timestamp('expires_at').notNull(),
  accepted_at: timestamp('accepted_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export type Team = typeof teams.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type TeamInvite = typeof teamInvites.$inferSelect;
