import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { apiRoutes, projectApis } from '../../schema/mocks';
import {
  apiRouteCreateSchema,
  apiRouteIdSchema,
  apiRouteListSchema,
  apiRouteSelectSchema,
  apiRouteUpdateSchema,
  projectApiCreateSchema,
  projectApiIdSchema,
  projectApiListSchema,
  projectApiSelectSchema,
  projectApiUpdateSchema,
} from '../../schema/zod';
import { normalizeRoutePath } from '../../lib/mock-validation';
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
  }),
});
