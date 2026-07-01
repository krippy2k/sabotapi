import { and, eq } from 'drizzle-orm';
import type { DatabaseConnection } from './db';
import { apiRoutes, projectApis, type ApiRoute } from '../schema/mocks';
import { resolveResponseBody } from './faker-templates';
import { extractMockPath } from './mock-validation';

export function getContentTypeForResponse(responseType: ApiRoute['response_type']): string {
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

export function buildMockResponse(route: ApiRoute): Response {
  const headers = new Headers({
    'Content-Type': getContentTypeForResponse(route.response_type),
  });

  const body = resolveResponseBody(route.response_type, route.response_body);

  return new Response(body, {
    status: route.status_code,
    headers,
  });
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

  return buildMockResponse(route);
}
