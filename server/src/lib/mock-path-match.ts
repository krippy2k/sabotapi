import type { ApiRoute } from '../schema/mocks';
import { normalizeRoutePath } from './mock-validation';

export type RoutePatternSegment =
  | { type: 'literal'; value: string }
  | { type: 'param'; name: string };

export function compileRoutePattern(path: string): RoutePatternSegment[] {
  const normalized = normalizeRoutePath(path);
  return normalized.split('/').filter(Boolean).map((segment) => {
    if (segment.startsWith(':') && segment.length > 1) {
      return { type: 'param' as const, name: segment.slice(1) };
    }
    return { type: 'literal' as const, value: segment };
  });
}

export function matchRoutePattern(
  pattern: string,
  requestPath: string
): Record<string, string> | null {
  const patternSegments = compileRoutePattern(pattern);
  const requestSegments = normalizeRoutePath(requestPath).split('/').filter(Boolean);

  if (patternSegments.length !== requestSegments.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < patternSegments.length; i++) {
    const pSeg = patternSegments[i];
    const rSeg = requestSegments[i];

    if (pSeg.type === 'literal') {
      if (pSeg.value !== rSeg) {
        return null;
      }
    } else {
      params[pSeg.name] = decodeURIComponent(rSeg);
    }
  }

  return params;
}

export function findMatchingRouteWithParams(
  routes: ApiRoute[],
  requestPath: string
): { route: ApiRoute; params: Record<string, string> } | null {
  const normalized = normalizeRoutePath(requestPath);

  const exact = routes.find((r) => r.path === normalized);
  if (exact) {
    return { route: exact, params: {} };
  }

  for (const route of routes) {
    if (!route.path.includes(':')) {
      continue;
    }
    const params = matchRoutePattern(route.path, normalized);
    if (params) {
      return { route, params };
    }
  }

  return null;
}

export function extractPathParamId(params: Record<string, string>): string | undefined {
  if (params.id !== undefined) {
    return params.id;
  }
  const values = Object.values(params);
  return values[0];
}
