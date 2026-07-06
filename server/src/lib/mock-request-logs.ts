import { randomUUID } from 'node:crypto';
import type { MockRequestMeta } from './mock-proxy';
import type { RequestSnapshot } from './mock-request-snapshot';

export type MockRequestLogEntry = {
  id: string;
  projectId: string;
  timestamp: string;
  method: string;
  url: string;
  path: string;
  queryString: string;
  headers: Record<string, string>;
  body: string | null;
  durationMs: number;
  status: number;
  matchedRouteId: string | null;
  matchedRuleId: string | null;
  storeOperation: string | null;
};

const MAX_LOGS_PER_PROJECT = 200;

type LogStoreGlobal = {
  mockRequestLogBuffers?: Map<string, MockRequestLogEntry[]>;
  mockRequestLogEmitter?: ((entry: MockRequestLogEntry) => void) | null;
};

const storeGlobal = globalThis as typeof globalThis & LogStoreGlobal;

function getBuffers(): Map<string, MockRequestLogEntry[]> {
  if (!storeGlobal.mockRequestLogBuffers) {
    storeGlobal.mockRequestLogBuffers = new Map();
  }
  return storeGlobal.mockRequestLogBuffers;
}

function getEmitter(): ((entry: MockRequestLogEntry) => void) | null {
  return storeGlobal.mockRequestLogEmitter ?? null;
}

function setEmitter(fn: ((entry: MockRequestLogEntry) => void) | null): void {
  storeGlobal.mockRequestLogEmitter = fn;
}

export function setMockLogEmitter(fn: (entry: MockRequestLogEntry) => void): void {
  setEmitter(fn);
}

export function buildLogEntry(
  projectId: string,
  snapshot: RequestSnapshot,
  meta: MockRequestMeta,
  durationMs: number,
  status: number,
  timestamp: string
): MockRequestLogEntry {
  return {
    id: randomUUID(),
    projectId,
    timestamp,
    method: snapshot.method,
    url: snapshot.url,
    path: meta.resolvedPath,
    queryString: snapshot.queryString,
    headers: snapshot.headers,
    body: snapshot.body,
    durationMs,
    status,
    matchedRouteId: meta.matchedRouteId,
    matchedRuleId: meta.matchedRuleId,
    storeOperation: meta.storeOperation,
  };
}

export function appendLog(entry: MockRequestLogEntry): void {
  const buffers = getBuffers();
  const existing = buffers.get(entry.projectId) ?? [];
  const next = [entry, ...existing].slice(0, MAX_LOGS_PER_PROJECT);
  buffers.set(entry.projectId, next);
  getEmitter()?.(entry);
}

export function getRecentLogs(projectId: string, limit = MAX_LOGS_PER_PROJECT): MockRequestLogEntry[] {
  return getBuffers().get(projectId)?.slice(0, limit) ?? [];
}
