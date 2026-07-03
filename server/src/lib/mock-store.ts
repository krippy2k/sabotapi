import fs from 'fs-extra';
import path from 'path';
import type { MockCollection } from '../schema/mocks';
import type { DatabaseConnection } from './db';
import { mockCollections } from '../schema/mocks';
import { eq } from 'drizzle-orm';
import type { MockRequestContext } from './mock-matching';
import type { ApiRoute } from '../schema/mocks';
import { extractPathParamId } from './mock-path-match';
import { applyStoreToResponseBody } from './faker-templates';

const memoryCache = new Map<string, unknown[]>();

function cacheKey(projectId: string, collectionName: string): string {
  return `${projectId}:${collectionName}`;
}

function getStoresRoot(): string {
  const fromRoot = path.resolve(process.cwd(), 'data', 'mock-stores');
  if (fs.existsSync(path.dirname(fromRoot))) {
    return fromRoot;
  }
  return path.resolve(process.cwd(), '..', 'data', 'mock-stores');
}

function collectionFilePath(projectId: string, collectionName: string): string {
  return path.join(getStoresRoot(), projectId, `${collectionName}.json`);
}

function parseInitialData(initialData: string): unknown[] {
  const parsed = JSON.parse(initialData) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('initial_data must be a JSON array');
  }
  return parsed;
}

export async function loadCollectionItems(
  projectId: string,
  collection: MockCollection
): Promise<unknown[]> {
  const key = cacheKey(projectId, collection.name);
  if (memoryCache.has(key)) {
    return memoryCache.get(key)!;
  }

  const filePath = collectionFilePath(projectId, collection.name);
  if (await fs.pathExists(filePath)) {
    const items = (await fs.readJson(filePath)) as unknown[];
    memoryCache.set(key, items);
    return items;
  }

  const items = parseInitialData(collection.initial_data);
  await saveCollectionItems(projectId, collection.name, items);
  return items;
}

export async function saveCollectionItems(
  projectId: string,
  collectionName: string,
  items: unknown[]
): Promise<void> {
  const key = cacheKey(projectId, collectionName);
  memoryCache.set(key, items);

  const filePath = collectionFilePath(projectId, collectionName);
  await fs.ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp`;
  await fs.writeJson(tempPath, items, { spaces: 2 });
  await fs.move(tempPath, filePath, { overwrite: true });
}

export async function deleteCollectionFile(
  projectId: string,
  collectionName: string
): Promise<void> {
  memoryCache.delete(cacheKey(projectId, collectionName));
  const filePath = collectionFilePath(projectId, collectionName);
  if (await fs.pathExists(filePath)) {
    await fs.remove(filePath);
  }
}

export async function resetCollectionItems(
  projectId: string,
  collection: MockCollection
): Promise<unknown[]> {
  const items = parseInitialData(collection.initial_data);
  await saveCollectionItems(projectId, collection.name, items);
  return items;
}

function findItemIndex(items: unknown[], idField: string, id: string): number {
  return items.findIndex((item) => {
    if (item === null || typeof item !== 'object') {
      return false;
    }
    return String((item as Record<string, unknown>)[idField]) === id;
  });
}

export async function getCollectionSnapshot(
  projectId: string,
  collection: MockCollection
): Promise<unknown[]> {
  return loadCollectionItems(projectId, collection);
}

async function loadCollectionRow(
  db: DatabaseConnection,
  collectionId: string
): Promise<MockCollection | null> {
  const [row] = await db
    .select()
    .from(mockCollections)
    .where(eq(mockCollections.id, collectionId))
    .limit(1);
  return row ?? null;
}

function jsonResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildStoreBody(route: ApiRoute, payload: unknown): string {
  const serialized = JSON.stringify(payload);
  if (route.response_body.includes('{{store}}')) {
    return applyStoreToResponseBody(route.response_body, payload);
  }
  return serialized;
}

function parseRequestObject(bodyText: string | null): Record<string, unknown> {
  if (!bodyText) {
    throw new Error('Request body required');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new Error('Request body must be valid JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Request body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

export async function handleStoreRequest(
  db: DatabaseConnection,
  projectId: string,
  route: ApiRoute,
  params: Record<string, string>,
  ctx: MockRequestContext
): Promise<Response> {
  if (!route.store_operation || !route.store_collection_id) {
    return jsonResponse(JSON.stringify({ error: 'Route is not stateful' }), 500);
  }

  const collection = await loadCollectionRow(db, route.store_collection_id);
  if (!collection || collection.project_id !== projectId) {
    return jsonResponse(JSON.stringify({ error: 'Collection not found' }), 404);
  }

  const items = await loadCollectionItems(projectId, collection);
  const idField = collection.id_field;
  const itemId = extractPathParamId(params);

  try {
    switch (route.store_operation) {
      case 'list': {
        const body = buildStoreBody(route, items);
        return jsonResponse(body, route.status_code);
      }
      case 'get': {
        if (!itemId) {
          return jsonResponse(JSON.stringify({ error: 'Missing path id' }), 400);
        }
        const index = findItemIndex(items, idField, itemId);
        if (index === -1) {
          return jsonResponse(JSON.stringify({ error: 'Not found' }), 404);
        }
        const body = buildStoreBody(route, items[index]);
        return jsonResponse(body, route.status_code);
      }
      case 'create': {
        const bodyObj = parseRequestObject(ctx.bodyText);
        if (bodyObj[idField] === undefined || bodyObj[idField] === null || bodyObj[idField] === '') {
          bodyObj[idField] = crypto.randomUUID();
        }
        const id = String(bodyObj[idField]);
        if (findItemIndex(items, idField, id) !== -1) {
          return jsonResponse(JSON.stringify({ error: 'Item already exists' }), 409);
        }
        items.push(bodyObj);
        await saveCollectionItems(projectId, collection.name, items);
        const status = route.status_code === 200 ? 201 : route.status_code;
        const body = buildStoreBody(route, bodyObj);
        return jsonResponse(body, status);
      }
      case 'update': {
        if (!itemId) {
          return jsonResponse(JSON.stringify({ error: 'Missing path id' }), 400);
        }
        const index = findItemIndex(items, idField, itemId);
        if (index === -1) {
          return jsonResponse(JSON.stringify({ error: 'Not found' }), 404);
        }
        const bodyObj = parseRequestObject(ctx.bodyText);
        const updated = { ...(items[index] as Record<string, unknown>), ...bodyObj, [idField]: itemId };
        items[index] = updated;
        await saveCollectionItems(projectId, collection.name, items);
        const body = buildStoreBody(route, updated);
        return jsonResponse(body, route.status_code);
      }
      case 'delete': {
        if (!itemId) {
          return jsonResponse(JSON.stringify({ error: 'Missing path id' }), 400);
        }
        const index = findItemIndex(items, idField, itemId);
        if (index === -1) {
          return jsonResponse(JSON.stringify({ error: 'Not found' }), 404);
        }
        items.splice(index, 1);
        await saveCollectionItems(projectId, collection.name, items);
        if (route.response_body.includes('{{store}}')) {
          return jsonResponse(buildStoreBody(route, { deleted: true, id: itemId }), route.status_code);
        }
        return new Response(null, { status: route.status_code === 200 ? 204 : route.status_code });
      }
      default:
        return jsonResponse(JSON.stringify({ error: 'Unknown store operation' }), 500);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bad request';
    return jsonResponse(JSON.stringify({ error: message }), 400);
  }
}
