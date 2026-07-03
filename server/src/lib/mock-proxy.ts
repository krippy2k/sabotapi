import { and, asc, eq } from 'drizzle-orm';
import type { DatabaseConnection } from './db';
import { apiRouteRules, apiRoutes, projectApis, type ApiRoute } from '../schema/mocks';
import { resolveResponseBody } from './faker-templates';
import {
  buildRequestContext,
  ruleToResponseConfig,
  selectMatchingRule,
  type MockResponseConfig,
} from './mock-matching';
import { extractMockPath } from './mock-validation';

export function getContentTypeForResponse(
  responseType: MockResponseConfig['response_type']
): string {
  return responseType === 'json'
    ? 'application/json'
    : 'application/x-www-form-urlencoded';
}

export async function findMatchingRoute(
  db: DatabaseConnection,
  projectId: string,
  method: string,
  normalizedPath: string
): Promise<ApiRoute | null> {
  const upperMethod = method.toUpperCase();

  const [row] = await db
    .select({ route: apiRoutes })
    .from(apiRoutes)
    .innerJoin(projectApis, eq(apiRoutes.api_id, projectApis.id))
    .where(
      and(
        eq(projectApis.project_id, projectId),
        eq(apiRoutes.method, upperMethod as ApiRoute['method']),
        eq(apiRoutes.path, normalizedPath)
      )
    )
    .limit(1);

  return row?.route ?? null;
}

export async function findRouteRules(
  db: DatabaseConnection,
  routeId: string
): Promise<(typeof apiRouteRules.$inferSelect)[]> {
  return db
    .select()
    .from(apiRouteRules)
    .where(eq(apiRouteRules.route_id, routeId))
    .orderBy(asc(apiRouteRules.priority));
}

export function buildMockResponse(config: MockResponseConfig): Response {
  const headers = new Headers({
    'Content-Type': getContentTypeForResponse(config.response_type),
  });

  const body = resolveResponseBody(config.response_type, config.response_body);

  return new Response(body, {
    status: config.status_code,
    headers,
  });
}

export function routeToResponseConfig(route: ApiRoute): MockResponseConfig {
  return {
    status_code: route.status_code,
    response_type: route.response_type,
    response_body: route.response_body,
  };
}

export async function handleMockRequest(
  db: DatabaseConnection,
  projectId: string,
  request: Request
): Promise<Response> {
  const url = new URL(request.url);
  const routePath = extractMockPath(projectId, url.pathname);
  const route = await findMatchingRoute(db, projectId, request.method, routePath);

  if (!route) {
    return new Response(JSON.stringify({ error: 'No matching mock route' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ctx = await buildRequestContext(request);
  const rules = await findRouteRules(db, route.id);
  const matched = selectMatchingRule(rules, ctx);
  const config = matched ? ruleToResponseConfig(matched) : routeToResponseConfig(route);

  return buildMockResponse(config);
}
