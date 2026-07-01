import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from './users';
import { teamInvites, teamMembers, teamRoleValues, teams } from './teams';
import { projectMembers, projects } from './projects';
import {
  apiRoutes,
  httpMethodValues,
  projectApis,
  responseTypeValues,
} from './mocks';

/** User row shape for tRPC/JSON responses (timestamps as ISO strings). */
export const userSelectSchema = createSelectSchema(users).transform((row) => ({
  ...row,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString(),
}));

const insertBase = createInsertSchema(users);
export const userInsertSchema = insertBase;

export const userUpdateSchema = insertBase.pick({ display_name: true }).partial();

export type UserSelect = z.infer<typeof userSelectSchema>;
export type UserInsert = z.infer<typeof userInsertSchema>;
export type UserUpdate = z.infer<typeof userUpdateSchema>;

const teamRoleSchema = z.enum(teamRoleValues);

export const teamSelectSchema = createSelectSchema(teams).transform((row) => ({
  ...row,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString(),
}));

export const teamMemberSelectSchema = createSelectSchema(teamMembers).transform((row) => ({
  ...row,
  created_at: row.created_at.toISOString(),
}));

export const teamInviteSelectSchema = createSelectSchema(teamInvites).transform((row) => ({
  ...row,
  expires_at: row.expires_at.toISOString(),
  accepted_at: row.accepted_at?.toISOString() ?? null,
  created_at: row.created_at.toISOString(),
}));

export const teamCreateSchema = z.object({
  name: z.string().min(1).max(100),
});

export const teamUpdateSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().min(1).max(100),
});

export const teamIdSchema = z.object({
  teamId: z.string().uuid(),
});

export const inviteCreateSchema = z.object({
  teamId: z.string().uuid(),
  email: z.string().email(),
  role: teamRoleSchema,
  projectIds: z.array(z.string().uuid()).optional().default([]),
});

export const projectSelectSchema = createSelectSchema(projects).transform((row) => ({
  ...row,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString(),
}));

export const projectMemberSelectSchema = createSelectSchema(projectMembers).transform((row) => ({
  ...row,
  created_at: row.created_at.toISOString(),
}));

export const projectCreateSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().min(1).max(100),
});

export const projectUpdateSchema = z.object({
  teamId: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1).max(100),
});

export const projectIdSchema = z.object({
  teamId: z.string().uuid(),
  projectId: z.string().uuid(),
});

export const projectMemberAddSchema = z.object({
  teamId: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string().min(1),
});

export const projectMemberRemoveSchema = z.object({
  teamId: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string().min(1),
});

export const inviteRevokeSchema = z.object({
  teamId: z.string().uuid(),
  inviteId: z.string().uuid(),
});

export const inviteTokenSchema = z.object({
  token: z.string().min(1),
});

export const memberRoleUpdateSchema = z.object({
  teamId: z.string().uuid(),
  userId: z.string().min(1),
  role: teamRoleSchema,
});

export const memberRemoveSchema = z.object({
  teamId: z.string().uuid(),
  userId: z.string().min(1),
});

export type TeamSelect = z.infer<typeof teamSelectSchema>;
export type TeamMemberSelect = z.infer<typeof teamMemberSelectSchema>;
export type TeamInviteSelect = z.infer<typeof teamInviteSelectSchema>;
export type ProjectSelect = z.infer<typeof projectSelectSchema>;
export type ProjectMemberSelect = z.infer<typeof projectMemberSelectSchema>;

const httpMethodSchema = z.enum(httpMethodValues);
const responseTypeSchema = z.enum(responseTypeValues);

export const projectApiSelectSchema = createSelectSchema(projectApis).transform((row) => ({
  ...row,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString(),
}));

export const apiRouteSelectSchema = createSelectSchema(apiRoutes).transform((row) => ({
  ...row,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString(),
}));

const responseBodyRefine = (data: { responseType: string; responseBody: string }) => {
  if (data.responseType === 'json') {
    JSON.parse(data.responseBody);
  } else if (data.responseType === 'url_encoded' && data.responseBody.trim() !== '') {
    new URLSearchParams(data.responseBody);
  }
};

const routeFieldsSchema = z.object({
  path: z.string().min(1),
  method: httpMethodSchema,
  statusCode: z.number().int().min(100).max(599).optional().default(200),
  responseType: responseTypeSchema,
  responseBody: z.string(),
});

export const projectApiCreateSchema = z.object({
  teamId: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1).max(100),
});

export const projectApiUpdateSchema = z.object({
  teamId: z.string().uuid(),
  projectId: z.string().uuid(),
  apiId: z.string().uuid(),
  name: z.string().min(1).max(100),
});

export const projectApiIdSchema = z.object({
  teamId: z.string().uuid(),
  projectId: z.string().uuid(),
  apiId: z.string().uuid(),
});

export const projectApiListSchema = projectIdSchema;

export const apiRouteCreateSchema = projectApiIdSchema
  .merge(routeFieldsSchema)
  .superRefine((data, ctx) => {
    try {
      responseBodyRefine({
        responseType: data.responseType,
        responseBody: data.responseBody,
      });
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          data.responseType === 'json'
            ? 'Response body must be valid JSON'
            : 'Response body must be valid URL-encoded form data',
        path: ['responseBody'],
      });
    }
  });

export const apiRouteUpdateSchema = projectApiIdSchema
  .extend({ routeId: z.string().uuid() })
  .merge(routeFieldsSchema)
  .superRefine((data, ctx) => {
    try {
      responseBodyRefine({
        responseType: data.responseType,
        responseBody: data.responseBody,
      });
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          data.responseType === 'json'
            ? 'Response body must be valid JSON'
            : 'Response body must be valid URL-encoded form data',
        path: ['responseBody'],
      });
    }
  });

export const apiRouteIdSchema = z.object({
  teamId: z.string().uuid(),
  projectId: z.string().uuid(),
  apiId: z.string().uuid(),
  routeId: z.string().uuid(),
});

export const apiRouteListSchema = projectApiIdSchema;

export type ProjectApiSelect = z.infer<typeof projectApiSelectSchema>;
export type ApiRouteSelect = z.infer<typeof apiRouteSelectSchema>;
