import type { DatabaseConnection } from './db';
import { executeMockRequest, type MockRequestMeta, type MockRequestResult } from './mock-proxy';
import { captureRequestSnapshot } from './mock-request-snapshot';
import { appendLog, buildLogEntry } from './mock-request-logs';
import { extractMockPath } from './mock-validation';

function fallbackMeta(snapshotPath: string): MockRequestMeta {
  return {
    matchedRouteId: null,
    matchedRuleId: null,
    storeOperation: null,
    resolvedPath: snapshotPath,
  };
}

export async function executeMockRequestWithLogging(
  db: DatabaseConnection,
  projectId: string,
  request: Request
): Promise<MockRequestResult> {
  const timestamp = new Date().toISOString();
  const start = Date.now();
  const snapshot = await captureRequestSnapshot(request);
  const routePath = extractMockPath(projectId, new URL(request.url).pathname);

  let result: MockRequestResult | null = null;
  let status = 500;

  try {
    result = await executeMockRequest(db, projectId, request);
    status = result.response.status;
    return result;
  } catch (error) {
    result = {
      response: new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
      meta: fallbackMeta(routePath),
    };
    throw error;
  } finally {
    const durationMs = Date.now() - start;
    const meta = result?.meta ?? fallbackMeta(routePath);
    appendLog(
      buildLogEntry(projectId, snapshot, meta, durationMs, status, timestamp)
    );
  }
}
