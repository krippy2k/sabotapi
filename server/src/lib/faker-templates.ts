import { faker } from '@faker-js/faker';
import type { ResponseType } from '../schema/mocks';

export const FAKER_TOKEN_PATTERN = /\{\{([^}]+)\}\}/g;
export const FAKER_ARRAY_KEY = '__fakerArray';
export const FAKER_ARRAY_MAX_ITEMS = 100;

const WHOLE_TOKEN_PATTERN = /^\{\{([^}]+)\}\}$/;

type FakerPrimitive = string | number | boolean;

type FakerArrayConfig = {
  min: number;
  max: number;
  item: unknown;
};

export function extractFakerTokens(body: string): string[] {
  const tokens = new Set<string>();
  for (const match of body.matchAll(FAKER_TOKEN_PATTERN)) {
    tokens.add(match[1].trim());
  }
  return [...tokens];
}

export function resolveFakerPath(path: string): FakerPrimitive | undefined {
  const trimmed = path.trim();
  if (!trimmed.startsWith('faker.')) {
    return undefined;
  }

  const segments = trimmed.split('.');
  if (segments[0] !== 'faker' || segments.length < 2) {
    return undefined;
  }

  try {
    let current: unknown = faker;
    for (const segment of segments.slice(1)) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }

    if (typeof current === 'function') {
      current = (current as () => unknown)();
    }

    if (typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean') {
      return current;
    }

    if (current === null || current === undefined) {
      return undefined;
    }

    return JSON.stringify(current);
  } catch {
    return undefined;
  }
}

export function resolveTemplatesInString(value: string): string {
  return value.replace(FAKER_TOKEN_PATTERN, (full, inner: string) => {
    const resolved = resolveFakerPath(inner);
    if (resolved === undefined) {
      return full;
    }
    return String(resolved);
  });
}

export function stripTemplatesForValidation(body: string, responseType: ResponseType): string {
  const placeholder = responseType === 'json' ? '__faker__' : 'placeholder';
  return body.replace(FAKER_TOKEN_PATTERN, placeholder);
}

function cloneTemplateValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseFakerArrayConfig(value: unknown): FakerArrayConfig | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const wrapper = value as Record<string, unknown>;
  const config = wrapper[FAKER_ARRAY_KEY];
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    return undefined;
  }

  const { min, max, item } = config as Record<string, unknown>;
  if (
    typeof min !== 'number' ||
    typeof max !== 'number' ||
    !Number.isInteger(min) ||
    !Number.isInteger(max) ||
    min < 0 ||
    max < min ||
    max > FAKER_ARRAY_MAX_ITEMS
  ) {
    return undefined;
  }

  if (item === undefined) {
    return undefined;
  }

  return { min, max, item };
}

export function validateFakerArrayStructures(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      validateFakerArrayStructures(value[i], `${path}[${i}]`);
    }
    return;
  }

  if (value === null || typeof value !== 'object') {
    return;
  }

  const config = parseFakerArrayConfig(value);
  if (config) {
    validateFakerArrayStructures(config.item, `${path}.${FAKER_ARRAY_KEY}.item`);
    return;
  }

  if (FAKER_ARRAY_KEY in value) {
    throw new Error(
      `Invalid ${FAKER_ARRAY_KEY} at ${path}: expected { min, max, item } with integer min/max (0 ≤ min ≤ max ≤ ${FAKER_ARRAY_MAX_ITEMS})`
    );
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    validateFakerArrayStructures(child, `${path}.${key}`);
  }
}

function resolveFakerArray(config: FakerArrayConfig): unknown[] {
  const count = faker.number.int({ min: config.min, max: config.max });
  return Array.from({ length: count }, () => resolveJsonValue(cloneTemplateValue(config.item)));
}

function resolveJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(resolveJsonValue);
  }

  if (value !== null && typeof value === 'object') {
    const arrayConfig = parseFakerArrayConfig(value);
    if (arrayConfig) {
      return resolveFakerArray(arrayConfig);
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        resolveJsonValue(child),
      ])
    );
  }

  if (typeof value !== 'string') {
    return value;
  }

  const wholeMatch = value.trim().match(WHOLE_TOKEN_PATTERN);
  if (wholeMatch) {
    const resolved = resolveFakerPath(wholeMatch[1]);
    if (resolved !== undefined && typeof resolved !== 'string') {
      return resolved;
    }
  }

  return resolveTemplatesInString(value);
}

export const STORE_TOKEN = '{{store}}';

export function applyStoreToResponseBody(responseBody: string, storePayload: unknown): string {
  const serialized = JSON.stringify(storePayload);
  if (responseBody.trim() === STORE_TOKEN) {
    return serialized;
  }
  return responseBody.replace(/\{\{store\}\}/g, serialized);
}

export function resolveResponseBody(
  responseType: ResponseType,
  responseBody: string,
  storePayload?: unknown
): string {
  if (storePayload !== undefined && responseBody.includes('{{store}}')) {
    const withStore = applyStoreToResponseBody(responseBody, storePayload);
    if (responseType === 'json' && !withStore.includes('{{')) {
      return withStore;
    }
    responseBody = withStore;
  }

  if (!responseBody.includes('{{') && !responseBody.includes(FAKER_ARRAY_KEY)) {
    return responseBody;
  }

  if (responseType === 'json') {
    const parsed = JSON.parse(responseBody) as unknown;
    return JSON.stringify(resolveJsonValue(parsed));
  }

  return resolveTemplatesInString(responseBody);
}
