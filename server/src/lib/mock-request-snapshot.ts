import { buildRequestContext } from './mock-matching';

export type RequestSnapshot = {
  method: string;
  url: string;
  queryString: string;
  headers: Record<string, string>;
  body: string | null;
};

const MAX_BODY_BYTES = 64 * 1024;

function serializeHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = result[key] ? `${result[key]}, ${value}` : value;
  });
  return result;
}

function truncateBody(body: string | null): string | null {
  if (body === null) {
    return null;
  }
  if (body.length <= MAX_BODY_BYTES) {
    return body;
  }
  return `${body.slice(0, MAX_BODY_BYTES)}…[truncated]`;
}

export async function captureRequestSnapshot(request: Request): Promise<RequestSnapshot> {
  const ctx = await buildRequestContext(request.clone());
  const { url } = ctx;
  const queryString = url.search.startsWith('?') ? url.search.slice(1) : url.search;

  return {
    method: ctx.method,
    url: `${url.pathname}${url.search}`,
    queryString,
    headers: serializeHeaders(ctx.headers),
    body: truncateBody(ctx.bodyText),
  };
}
