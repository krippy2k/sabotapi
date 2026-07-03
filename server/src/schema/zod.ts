import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from './users';
import { teamInvites, teamMembers, teamRoleValues, teams } from './teams';
import { projectMembers, projects } from './projects';
import {
  apiRouteRules,
  apiRoutes,
  conditionOperatorValues,
  conditionSourceValues,
  httpMethodValues,
  matchModeValues,
  projectApis,
  responseTypeValues,
} from './mocks';
import { validateResponseBody } from '../lib/mock-validation';

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
  validateResponseBody(data.responseType as (typeof responseTypeValues)[number], data.responseBody);
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
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : 'Invalid response body',
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
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : 'Invalid response body',
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

export const apiRoutePreviewSchema = z
  .object({
    teamId: z.string().uuid(),
    projectId: z.string().uuid(),
    apiId: z.string().uuid().optional(),
    routeId: z.string().uuid().optional(),
    method: httpMethodSchema.optional().default('GET'),
    responseType: responseTypeSchema,
    responseBody: z.string(),
    requestContext: z
      .object({
        query: z.record(z.string()).optional(),
        headers: z.record(z.string()).optional(),
        body: z.string().optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    try {
      responseBodyRefine({
        responseType: data.responseType,
        responseBody: data.responseBody,
      });
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : 'Invalid response body',
        path: ['responseBody'],
      });
    }
  });

const conditionOperatorSchema = z.enum(conditionOperatorValues);
const conditionSourceSchema = z.enum(conditionSourceValues);
const matchModeSchema = z.enum(matchModeValues);

export const routeConditionSchema = z
  .object({
    source: conditionSourceSchema,
    key: z.string().min(1),
    operator: conditionOperatorSchema,
    value: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const needsValue = ['equals', 'not_equals', 'contains'].includes(data.operator);
    if (needsValue && (data.value === undefined || data.value === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Value is required for this operator',
        path: ['value'],
      });
    }
  });

const routeRuleFieldsSchema = z.object({
  name: z.string().max(100).optional().nullable(),
  priority: z.number().int().min(0).optional(),
  matchMode: matchModeSchema.default('all'),
  conditions: z.array(routeConditionSchema).min(1),
  statusCode: z.number().int().min(100).max(599).optional().default(200),
  responseType: responseTypeSchema,
  responseBody: z.string(),
});

const routeRuleResponseRefine = (
  data: { responseType: string; responseBody: string },
  ctx: z.RefinementCtx
) => {
  try {
    responseBodyRefine(data);
  } catch (err) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: err instanceof Error ? err.message : 'Invalid response body',
      path: ['responseBody'],
    });
  }
};

export const routeRuleSelectSchema = createSelectSchema(apiRouteRules).transform((row) => ({
  id: row.id,
  route_id: row.route_id,
  name: row.name,
  priority: row.priority,
  match_mode: row.match_mode,
  conditions: JSON.parse(row.conditions) as z.infer<typeof routeConditionSchema>[],
  status_code: row.status_code,
  response_type: row.response_type,
  response_body: row.response_body,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString(),
}));

export const routeRuleListSchema = apiRouteIdSchema;

export const routeRuleListForApiSchema = projectApiIdSchema;

export const routeRuleCreateSchema = apiRouteIdSchema
  .merge(routeRuleFieldsSchema)
  .superRefine(routeRuleResponseRefine);

export const routeRuleUpdateSchema = apiRouteIdSchema
  .extend({ ruleId: z.string().uuid() })
  .merge(routeRuleFieldsSchema)
  .superRefine(routeRuleResponseRefine);

export const routeRuleIdSchema = z.object({
  teamId: z.string().uuid(),
  projectId: z.string().uuid(),
  apiId: z.string().uuid(),
  routeId: z.string().uuid(),
  ruleId: z.string().uuid(),
});

export const routeRuleReorderSchema = apiRouteIdSchema.extend({
  ruleIds: z.array(z.string().uuid()).min(1),
});

export type ProjectApiSelect = z.infer<typeof projectApiSelectSchema>;
export type ApiRouteSelect = z.infer<typeof apiRouteSelectSchema>;
export type RouteRuleSelect = z.infer<typeof routeRuleSelectSchema>;
