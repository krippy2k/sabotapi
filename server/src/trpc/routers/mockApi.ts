import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { apiRouteRules, apiRoutes, projectApis } from '../../schema/mocks';
import {
  apiRouteCreateSchema,
  apiRouteIdSchema,
  apiRouteListSchema,
  apiRoutePreviewSchema,
  apiRouteSelectSchema,
  apiRouteUpdateSchema,
  projectApiCreateSchema,
  projectApiIdSchema,
  projectApiListSchema,
  projectApiSelectSchema,
  projectApiUpdateSchema,
  routeRuleCreateSchema,
  routeRuleIdSchema,
  routeRuleListForApiSchema,
  routeRuleListSchema,
  routeRuleReorderSchema,
  routeRuleSelectSchema,
  routeRuleUpdateSchema,
} from '../../schema/zod';
import { resolveResponseBody } from '../../lib/faker-templates';
import {
  buildSyntheticRequestContext,
  ruleToResponseConfig,
  selectMatchingRule,
} from '../../lib/mock-matching';
import {
  findRouteRules,
  routeToResponseConfig,
} from '../../lib/mock-proxy';
import { normalizeRoutePath, validateResponseBody } from '../../lib/mock-validation';
import { requireProjectAccess, requireProjectInTeam } from '../../lib/project-auth';
import { protectedProcedure, router } from '../init';

async function requireApiInProject(
  db: Parameters<typeof requireProjectInTeam>[0],
  apiId: string,
  projectId: string
) {
  const [api] = await db
    .select()
    .from(projectApis)
    .where(and(eq(projectApis.id, apiId), eq(projectApis.project_id, projectId)))
    .limit(1);

  if (!api) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'API not found in this project' });
  }

  return api;
}

async function requireRouteInApi(
  db: Parameters<typeof requireProjectInTeam>[0],
  routeId: string,
  apiId: string
) {
  const [route] = await db
    .select()
    .from(apiRoutes)
    .where(and(eq(apiRoutes.id, routeId), eq(apiRoutes.api_id, apiId)))
    .limit(1);

  if (!route) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Route not found in this API' });
  }

  return route;
}

async function requireRuleInRoute(
  db: Parameters<typeof requireProjectInTeam>[0],
  ruleId: string,
  routeId: string
) {
  const [rule] = await db
    .select()
    .from(apiRouteRules)
    .where(and(eq(apiRouteRules.id, ruleId), eq(apiRouteRules.route_id, routeId)))
    .limit(1);

  if (!rule) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Rule not found' });
  }

  return rule;
}

export const mockApiRouter = router({
  apis: router({
    create: protectedProcedure.input(projectApiCreateSchema).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.db, input.teamId, input.projectId, ctx.user.id);

      const [api] = await ctx.db
        .insert(projectApis)
        .values({
          project_id: input.projectId,
          name: input.name,
        })
        .returning();

      return projectApiSelectSchema.parse(api);
    }),

    list: protectedProcedure.input(projectApiListSchema).query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.db, input.teamId, input.projectId, ctx.user.id);

      const rows = await ctx.db
        .select()
        .from(projectApis)
        .where(eq(projectApis.project_id, input.projectId));

      return rows.map((row) => projectApiSelectSchema.parse(row));
    }),

    update: protectedProcedure.input(projectApiUpdateSchema).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.db, input.teamId, input.projectId, ctx.user.id);
      await requireApiInProject(ctx.db, input.apiId, input.projectId);

      const [api] = await ctx.db
        .update(projectApis)
        .set({ name: input.name, updated_at: new Date() })
        .where(eq(projectApis.id, input.apiId))
        .returning();

      return projectApiSelectSchema.parse(api);
    }),

    delete: protectedProcedure.input(projectApiIdSchema).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.db, input.teamId, input.projectId, ctx.user.id);
      await requireApiInProject(ctx.db, input.apiId, input.projectId);

      await ctx.db.delete(projectApis).where(eq(projectApis.id, input.apiId));
      return { ok: true as const };
    }),
  }),

  routes: router({
    create: protectedProcedure.input(apiRouteCreateSchema).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.db, input.teamId, input.projectId, ctx.user.id);
      await requireApiInProject(ctx.db, input.apiId, input.projectId);

      const path = normalizeRoutePath(input.path);

      const [route] = await ctx.db
        .insert(apiRoutes)
        .values({
          api_id: input.apiId,
          path,
          method: input.method,
          status_code: input.statusCode,
          response_type: input.responseType,
          response_body: input.responseBody,
        })
        .returning();

      return apiRouteSelectSchema.parse(route);
    }),

    list: protectedProcedure.input(apiRouteListSchema).query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.db, input.teamId, input.projectId, ctx.user.id);
      await requireApiInProject(ctx.db, input.apiId, input.projectId);

      const rows = await ctx.db
        .select()
        .from(apiRoutes)
        .where(eq(apiRoutes.api_id, input.apiId));

      return rows.map((row) => apiRouteSelectSchema.parse(row));
    }),

    update: protectedProcedure.input(apiRouteUpdateSchema).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.db, input.teamId, input.projectId, ctx.user.id);
      await requireApiInProject(ctx.db, input.apiId, input.projectId);

      const path = normalizeRoutePath(input.path);

      const [route] = await ctx.db
        .update(apiRoutes)
        .set({
          path,
          method: input.method,
          status_code: input.statusCode,
          response_type: input.responseType,
          response_body: input.responseBody,
          updated_at: new Date(),
        })
        .where(and(eq(apiRoutes.id, input.routeId), eq(apiRoutes.api_id, input.apiId)))
        .returning();

      if (!route) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Route not found' });
      }

      return apiRouteSelectSchema.parse(route);
    }),

    delete: protectedProcedure.input(apiRouteIdSchema).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.db, input.teamId, input.projectId, ctx.user.id);
      await requireApiInProject(ctx.db, input.apiId, input.projectId);

      const [route] = await ctx.db
        .select()
        .from(apiRoutes)
        .where(and(eq(apiRoutes.id, input.routeId), eq(apiRoutes.api_id, input.apiId)))
        .limit(1);

      if (!route) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Route not found' });
      }

      await ctx.db.delete(apiRoutes).where(eq(apiRoutes.id, input.routeId));
      return { ok: true as const };
    }),

    preview: protectedProcedure.input(apiRoutePreviewSchema).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.db, input.teamId, input.projectId, ctx.user.id);

      validateResponseBody(input.responseType, input.responseBody);

      let statusCode = 200;
      let responseType = input.responseType;
      let responseBody = input.responseBody;
      let matchedRuleId: string | null = null;

      if (input.routeId && input.apiId) {
        await requireApiInProject(ctx.db, input.apiId, input.projectId);
        const route = await requireRouteInApi(ctx.db, input.routeId, input.apiId);
        const rules = await findRouteRules(ctx.db, route.id);
        const ctxMatch = buildSyntheticRequestContext(
          `http://localhost/mock${route.path}`,
          input.method,
          input.requestContext
        );
        const matched = selectMatchingRule(rules, ctxMatch);
        if (matched) {
          const config = ruleToResponseConfig(matched);
          statusCode = config.status_code;
          responseType = config.response_type;
          responseBody = config.response_body;
          matchedRuleId = matched.id;
        } else {
          const fallback = routeToResponseConfig(route);
          statusCode = fallback.status_code;
          responseType = fallback.response_type;
          responseBody = fallback.response_body;
        }
      }

      const resolvedBody = resolveResponseBody(responseType, responseBody);
      return { resolvedBody, statusCode, matchedRuleId };
    }),
  }),

  rules: router({
    list: protectedProcedure.input(routeRuleListSchema).query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.db, input.teamId, input.projectId, ctx.user.id);
      await requireApiInProject(ctx.db, input.apiId, input.projectId);
      await requireRouteInApi(ctx.db, input.routeId, input.apiId);

      const rows = await findRouteRules(ctx.db, input.routeId);
      return rows.map((row) => routeRuleSelectSchema.parse(row));
    }),

    listForApi: protectedProcedure.input(routeRuleListForApiSchema).query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.db, input.teamId, input.projectId, ctx.user.id);
      await requireApiInProject(ctx.db, input.apiId, input.projectId);

      const routes = await ctx.db
        .select({ id: apiRoutes.id })
        .from(apiRoutes)
        .where(eq(apiRoutes.api_id, input.apiId));

      if (routes.length === 0) {
        return [];
      }

      const routeIds = routes.map((r) => r.id);
      const rows = await ctx.db
        .select()
        .from(apiRouteRules)
        .where(inArray(apiRouteRules.route_id, routeIds))
        .orderBy(asc(apiRouteRules.priority));

      return rows.map((row) => routeRuleSelectSchema.parse(row));
    }),

    create: protectedProcedure.input(routeRuleCreateSchema).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.db, input.teamId, input.projectId, ctx.user.id);
      await requireApiInProject(ctx.db, input.apiId, input.projectId);
      await requireRouteInApi(ctx.db, input.routeId, input.apiId);

      let priority = input.priority;
      if (priority === undefined) {
        const existing = await findRouteRules(ctx.db, input.routeId);
        priority = existing.length > 0 ? Math.max(...existing.map((r) => r.priority)) + 1 : 0;
      }

      const [rule] = await ctx.db
        .insert(apiRouteRules)
        .values({
          route_id: input.routeId,
          name: input.name ?? null,
          priority,
          match_mode: input.matchMode,
          conditions: JSON.stringify(input.conditions),
          status_code: input.statusCode,
          response_type: input.responseType,
          response_body: input.responseBody,
        })
        .returning();

      return routeRuleSelectSchema.parse(rule);
    }),

    update: protectedProcedure.input(routeRuleUpdateSchema).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.db, input.teamId, input.projectId, ctx.user.id);
      await requireApiInProject(ctx.db, input.apiId, input.projectId);
      await requireRouteInApi(ctx.db, input.routeId, input.apiId);
      await requireRuleInRoute(ctx.db, input.ruleId, input.routeId);

      const [rule] = await ctx.db
        .update(apiRouteRules)
        .set({
          name: input.name ?? null,
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          match_mode: input.matchMode,
          conditions: JSON.stringify(input.conditions),
          status_code: input.statusCode,
          response_type: input.responseType,
          response_body: input.responseBody,
          updated_at: new Date(),
        })
        .where(and(eq(apiRouteRules.id, input.ruleId), eq(apiRouteRules.route_id, input.routeId)))
        .returning();

      return routeRuleSelectSchema.parse(rule);
    }),

    delete: protectedProcedure.input(routeRuleIdSchema).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.db, input.teamId, input.projectId, ctx.user.id);
      await requireApiInProject(ctx.db, input.apiId, input.projectId);
      await requireRouteInApi(ctx.db, input.routeId, input.apiId);
      await requireRuleInRoute(ctx.db, input.ruleId, input.routeId);

      await ctx.db.delete(apiRouteRules).where(eq(apiRouteRules.id, input.ruleId));
      return { ok: true as const };
    }),

    reorder: protectedProcedure.input(routeRuleReorderSchema).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.db, input.teamId, input.projectId, ctx.user.id);
      await requireApiInProject(ctx.db, input.apiId, input.projectId);
      await requireRouteInApi(ctx.db, input.routeId, input.apiId);

      const existing = await findRouteRules(ctx.db, input.routeId);
      const existingIds = new Set(existing.map((r) => r.id));
      if (
        input.ruleIds.length !== existing.length ||
        !input.ruleIds.every((id) => existingIds.has(id))
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'ruleIds must include every rule for this route exactly once',
        });
      }

      await Promise.all(
        input.ruleIds.map((ruleId, index) =>
          ctx.db
            .update(apiRouteRules)
            .set({ priority: index, updated_at: new Date() })
            .where(and(eq(apiRouteRules.id, ruleId), eq(apiRouteRules.route_id, input.routeId)))
        )
      );

      const rows = await findRouteRules(ctx.db, input.routeId);
      return rows.map((row) => routeRuleSelectSchema.parse(row));
    }),
  }),
});
