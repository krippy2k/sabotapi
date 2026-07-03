import type {
  ApiRouteRule,
  ConditionOperator,
  RouteCondition,
} from '../schema/mocks';

export type MockRequestContext = {
  url: URL;
  method: string;
  headers: Headers;
  bodyText: string | null;
};

export type MockResponseConfig = {
  status_code: number;
  response_type: ApiRouteRule['response_type'];
  response_body: string;
};

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function buildRequestContext(request: Request): Promise<MockRequestContext> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  let bodyText: string | null = null;
  if (BODY_METHODS.has(method)) {
    const text = await request.text();
    bodyText = text.length > 0 ? text : null;
  }

  return {
    url,
    method,
    headers: request.headers,
    bodyText,
  };
}

export function buildSyntheticRequestContext(
  baseUrl: string,
  method: string,
  requestContext?: {
    query?: Record<string, string>;
    headers?: Record<string, string>;
    body?: string;
  }
): MockRequestContext {
  const url = new URL(baseUrl);
  if (requestContext?.query) {
    for (const [key, value] of Object.entries(requestContext.query)) {
      url.searchParams.set(key, value);
    }
  }

  const headers = new Headers();
  if (requestContext?.headers) {
    for (const [key, value] of Object.entries(requestContext.headers)) {
      headers.set(key, value);
    }
  }

  const bodyText =
    requestContext?.body && requestContext.body.length > 0 ? requestContext.body : null;

  return {
    url,
    method: method.toUpperCase(),
    headers,
    bodyText,
  };
}

export function getConditionActualValue(
  ctx: MockRequestContext,
  condition: RouteCondition
): string | null {
  const { source, key, operator } = condition;

  if (source === 'query') {
    return ctx.url.searchParams.get(key);
  }

  if (source === 'header') {
    return ctx.headers.get(key);
  }

  if (source === 'body') {
    if (!ctx.bodyText) {
      return null;
    }

    try {
      const parsed = JSON.parse(ctx.bodyText) as Record<string, unknown>;
      if (key in parsed) {
        const value = parsed[key];
        if (value === null || value === undefined) {
          return null;
        }
        return typeof value === 'string' ? value : JSON.stringify(value);
      }
      return operator === 'contains' ? ctx.bodyText : null;
    } catch {
      return operator === 'contains' ? ctx.bodyText : null;
    }
  }

  return null;
}

export function evaluateCondition(ctx: MockRequestContext, condition: RouteCondition): boolean {
  const actual = getConditionActualValue(ctx, condition);
  const { operator, value } = condition;

  switch (operator as ConditionOperator) {
    case 'exists':
      return actual !== null && actual !== '';
    case 'not_exists':
      return actual === null || actual === '';
    case 'equals':
      return actual === value;
    case 'not_equals':
      return actual !== value;
    case 'contains':
      return actual !== null && value !== undefined && actual.includes(value);
    default:
      return false;
  }
}

export function evaluateRule(ctx: MockRequestContext, rule: ApiRouteRule): boolean {
  let conditions: RouteCondition[];
  try {
    conditions = JSON.parse(rule.conditions) as RouteCondition[];
  } catch {
    return false;
  }

  if (conditions.length === 0) {
    return false;
  }

  if (rule.match_mode === 'any') {
    return conditions.some((c) => evaluateCondition(ctx, c));
  }

  return conditions.every((c) => evaluateCondition(ctx, c));
}

export function selectMatchingRule(
  rules: ApiRouteRule[],
  ctx: MockRequestContext
): ApiRouteRule | null {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  for (const rule of sorted) {
    if (evaluateRule(ctx, rule)) {
      return rule;
    }
  }
  return null;
}

export function ruleToResponseConfig(rule: ApiRouteRule): MockResponseConfig {
  return {
    status_code: rule.status_code,
    response_type: rule.response_type,
    response_body: rule.response_body,
  };
}
