import { normalizeRoutePath } from './mock-validation';

export function extractPathParamNames(path: string): string[] {
  return normalizeRoutePath(path)
    .split('/')
    .filter((seg) => seg.startsWith(':') && seg.length > 1)
    .map((seg) => seg.slice(1));
}

export function substitutePathParams(
  path: string,
  pathParams: Record<string, string> = {}
): string {
  const normalized = normalizeRoutePath(path);
  const segments = normalized.split('/').filter(Boolean);
  const resolved = segments.map((seg) => {
    if (seg.startsWith(':') && seg.length > 1) {
      const name = seg.slice(1);
      return pathParams[name] ?? seg;
    }
    return seg;
  });
  return resolved.length === 0 ? '/' : `/${resolved.join('/')}`;
}

export function buildMockTestUrl(
  projectId: string,
  resolvedPath: string,
  query?: Record<string, string>
): string {
  const url = new URL(`http://mock.test/mock/${projectId}${resolvedPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export function buildMockTestRequest(
  method: string,
  url: string,
  headers?: Record<string, string>,
  body?: string
): Request {
  const init: RequestInit = { method: method.toUpperCase() };
  const reqHeaders = new Headers(headers ?? {});

  if (body !== undefined && body !== '') {
    if (!reqHeaders.has('Content-Type')) {
      reqHeaders.set('Content-Type', 'application/json');
    }
    init.body = body;
  }

  init.headers = reqHeaders;
  return new Request(url, init);
}

export type MockTestResult = {
  status: number;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  resolvedPath: string;
  mockUrl: string;
  matchedRouteId: string | null;
  matchedRuleId: string | null;
  storeOperation: string | null;
};

export async function responseToTestResult(
  response: Response,
  meta: {
    matchedRouteId: string | null;
    matchedRuleId: string | null;
    storeOperation: string | null;
    resolvedPath: string;
  },
  durationMs: number,
  displayMockUrl: string
): Promise<MockTestResult> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const body = await response.text();

  return {
    status: response.status,
    headers,
    body,
    durationMs,
    resolvedPath: meta.resolvedPath,
    mockUrl: displayMockUrl,
    matchedRouteId: meta.matchedRouteId,
    matchedRuleId: meta.matchedRuleId,
    storeOperation: meta.storeOperation,
  };
}

export function buildDisplayMockUrl(
  apiOrigin: string,
  projectId: string,
  resolvedPath: string,
  query?: Record<string, string>
): string {
  const base = apiOrigin.replace(/\/$/, '');
  const url = new URL(`${base}/mock/${projectId}${resolvedPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}
