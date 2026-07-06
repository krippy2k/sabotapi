import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type RouteForTest = {
  id: string;
  method: string;
  path: string;
  store_operation?: string | null;
};

function extractPathParamNames(path: string): string[] {
  return path
    .split('/')
    .filter((seg) => seg.startsWith(':') && seg.length > 1)
    .map((seg) => seg.slice(1));
}

function parseQueryString(query: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const part of query.split('&')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      params[trimmed] = '';
    } else {
      params[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
  }
  return params;
}

function parseHeadersText(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    headers[trimmed.slice(0, colon).trim()] = trimmed.slice(colon + 1).trim();
  }
  return headers;
}

function formatBody(body: string): string {
  if (!body) return '';
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return 'text-green-600';
  if (status >= 400 && status < 500) return 'text-amber-600';
  if (status >= 500) return 'text-destructive';
  return 'text-muted-foreground';
}

type RouteTesterProps = {
  teamId: string;
  projectId: string;
  apiId: string;
  route: RouteForTest;
  apiBaseUrl: string;
  compact?: boolean;
};

export function RouteTester({
  teamId,
  projectId,
  apiId,
  route,
  apiBaseUrl,
  compact = false,
}: RouteTesterProps) {
  const paramNames = useMemo(() => extractPathParamNames(route.path), [route.path]);
  const [pathParams, setPathParams] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [headers, setHeaders] = useState('Authorization: Bearer test');
  const [body, setBody] = useState('{"name":"Test User"}');
  const [showResponseHeaders, setShowResponseHeaders] = useState(false);

  const testMutation = trpc.mockApi.routes.test.useMutation();
  const result = testMutation.data;
  const showBody = BODY_METHODS.has(route.method.toUpperCase());

  const resolvedPathPreview = useMemo(() => {
    let p = route.path;
    for (const name of paramNames) {
      const value = pathParams[name];
      if (value) {
        p = p.replace(`:${name}`, value);
      }
    }
    return p;
  }, [route.path, paramNames, pathParams]);

  const sendTest = () => {
    void testMutation.mutateAsync({
      teamId,
      projectId,
      apiId,
      routeId: route.id,
      pathParams: Object.keys(pathParams).length ? pathParams : undefined,
      query: Object.keys(parseQueryString(query)).length ? parseQueryString(query) : undefined,
      headers: Object.keys(parseHeadersText(headers)).length
        ? parseHeadersText(headers)
        : undefined,
      body: showBody && body ? body : undefined,
      apiOrigin: apiBaseUrl,
    });
  };

  return (
    <div className={compact ? 'space-y-4' : 'space-y-4 p-4 overflow-y-auto'}>
      <div className="space-y-1">
        <p className="text-xs font-mono text-muted-foreground">
          <span className="font-semibold text-foreground">{route.method}</span>{' '}
          {apiBaseUrl}/mock/{projectId}
          {resolvedPathPreview}
        </p>
        {route.store_operation ? (
          <p className="text-xs text-amber-600">
            Test requests use live mock data (stateful: {route.store_operation}).
          </p>
        ) : null}
      </div>

      {paramNames.length > 0 ? (
        <div className="space-y-2">
          <Label className="text-xs">Path parameters</Label>
          <div className="grid grid-cols-1 gap-2">
            {paramNames.map((name) => (
              <div key={name} className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground w-16">:{name}</span>
                <Input
                  className="h-8 text-xs font-mono"
                  value={pathParams[name] ?? ''}
                  onChange={(e) =>
                    setPathParams((prev) => ({ ...prev, [name]: e.target.value }))
                  }
                  placeholder="value"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-1">
        <Label htmlFor={`test-query-${route.id}`} className="text-xs">
          Query string
        </Label>
        <Input
          id={`test-query-${route.id}`}
          className="font-mono text-xs h-8"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="status=pending"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`test-headers-${route.id}`} className="text-xs">
          Headers (one per line)
        </Label>
        <textarea
          id={`test-headers-${route.id}`}
          className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-mono"
          value={headers}
          onChange={(e) => setHeaders(e.target.value)}
        />
      </div>

      {showBody ? (
        <div className="space-y-1">
          <Label htmlFor={`test-body-${route.id}`} className="text-xs">
            Request body
          </Label>
          <textarea
            id={`test-body-${route.id}`}
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-mono"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
      ) : null}

      <Button onClick={sendTest} disabled={testMutation.isPending} size="sm">
        {testMutation.isPending ? 'Sending…' : 'Send test request'}
      </Button>

      {testMutation.isError ? (
        <p className="text-sm text-destructive">{testMutation.error.message}</p>
      ) : null}

      {result ? (
        <div className="space-y-3 rounded-md border p-3 bg-muted/20">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className={`font-semibold ${statusColor(result.status)}`}>
              HTTP {result.status}
            </span>
            <span className="text-xs text-muted-foreground">{result.durationMs}ms</span>
            {result.matchedRuleId ? (
              <span className="text-xs text-muted-foreground">matched rule</span>
            ) : result.storeOperation ? (
              <span className="text-xs text-muted-foreground">store:{result.storeOperation}</span>
            ) : (
              <span className="text-xs text-muted-foreground">static</span>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-mono break-all">{result.mockUrl}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(result.mockUrl)}
            >
              Copy URL
            </Button>
          </div>

          <div>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => setShowResponseHeaders((v) => !v)}
            >
              {showResponseHeaders ? 'Hide' : 'Show'} response headers
            </button>
            {showResponseHeaders ? (
              <pre className="text-xs mt-1 rounded border bg-background p-2 overflow-x-auto font-mono">
                {Object.entries(result.headers)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join('\n') || '(none)'}
              </pre>
            ) : null}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">Response body</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void navigator.clipboard.writeText(result.body)}
              >
                Copy
              </Button>
            </div>
            <pre className="text-xs rounded-md border bg-background p-3 overflow-x-auto font-mono whitespace-pre-wrap max-h-64">
              {result.body ? formatBody(result.body) : '(empty)'}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type RouteTesterSheetProps = RouteTesterProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RouteTesterSheet({
  open,
  onOpenChange,
  route,
  ...props
}: RouteTesterSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            Test route — {route.method} {route.path}
          </SheetTitle>
          <SheetDescription>
            Sends a request through the live mock gateway (rules, faker, and stateful stores).
          </SheetDescription>
        </SheetHeader>
        <RouteTester route={route} {...props} />
      </SheetContent>
    </Sheet>
  );
}
