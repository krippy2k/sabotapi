import { TRPCError } from '@trpc/server';
import type { HttpMethod, ResponseType } from '../schema/mocks';
import { httpMethodValues, responseTypeValues } from '../schema/mocks';

export function normalizeRoutePath(path: string): string {
  let normalized = path.trim();
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  normalized = normalized.replace(/\/+/g, '/');
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  if (normalized.includes('..')) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Path cannot contain .. segments' });
  }
  return normalized;
}

export function validateResponseBody(responseType: ResponseType, responseBody: string): void {
  if (responseType === 'json') {
    try {
      JSON.parse(responseBody);
    } catch {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Response body must be valid JSON' });
    }
    return;
  }

  if (responseType === 'url_encoded') {
    if (responseBody.trim() === '') {
      return;
    }
    try {
      new URLSearchParams(responseBody);
    } catch {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Response body must be valid URL-encoded form data',
      });
    }
    return;
  }
}

export function parseHttpMethod(method: string): HttpMethod {
  const upper = method.toUpperCase();
  if (!httpMethodValues.includes(upper as HttpMethod)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid HTTP method' });
  }
  return upper as HttpMethod;
}

export function parseResponseType(responseType: string): ResponseType {
  if (!responseTypeValues.includes(responseType as ResponseType)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid response type' });
  }
  return responseType as ResponseType;
}

export function extractMockPath(projectId: string, pathname: string): string {
  const prefix = `/mock/${projectId}`;
  let rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname;
  if (!rest || rest === '/') {
    return '/';
  }
  return normalizeRoutePath(rest);
}
