import { useState } from 'react';
import type { MockRequestLogEntry } from '@server/lib/mock-request-logs';
import { useMockLogs } from '@/lib/use-mock-logs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Terminal, ChevronDown, ChevronRight, Circle } from 'lucide-react';

const MOCK_LOGS_ENABLED = import.meta.env.VITE_MOCK_LOGS_ENABLED !== 'false';

type MockRequestLogsPanelProps = {
  teamId: string;
  projectId: string;
  apiBaseUrl: string;
};

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  } catch {
    return iso;
  }
}

function formatBody(body: string | null): string {
  if (!body) {
    return '(empty)';
  }
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

function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'bg-blue-500/15 text-blue-700 dark:text-blue-300';
    case 'POST':
      return 'bg-green-500/15 text-green-700 dark:text-green-300';
    case 'PUT':
    case 'PATCH':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
    case 'DELETE':
      return 'bg-red-500/15 text-red-700 dark:text-red-300';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function metadataLine(entry: MockRequestLogEntry): string {
  if (entry.matchedRuleId) {
    return 'matched rule';
  }
  if (entry.storeOperation) {
    return `store:${entry.storeOperation}`;
  }
  if (entry.matchedRouteId) {
    return 'static';
  }
  return 'no route matched';
}

function LogRow({ entry, apiBaseUrl, projectId }: { entry: MockRequestLogEntry; apiBaseUrl: string; projectId: string }) {
  const [expanded, setExpanded] = useState(false);
  const fullUrl = `${apiBaseUrl}/mock/${projectId}${entry.path}${entry.queryString ? `?${entry.queryString}` : ''}`;

  return (
    <div className="border-b last:border-0 font-mono text-xs">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="text-muted-foreground shrink-0 w-[90px]">{formatTimestamp(entry.timestamp)}</span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${methodColor(entry.method)}`}>
          {entry.method}
        </span>
        <span className="truncate flex-1">{entry.path}</span>
        <span className={`shrink-0 font-semibold ${statusColor(entry.status)}`}>{entry.status}</span>
        <span className="shrink-0 text-muted-foreground w-12 text-right">{entry.durationMs}ms</span>
      </button>

      {expanded ? (
        <div className="px-3 pb-3 pt-0 space-y-3 bg-muted/20 border-t">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-sans">Requested URL</p>
            <div className="flex items-start gap-2">
              <code className="break-all flex-1">{fullUrl}</code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs shrink-0 font-sans"
                onClick={() => void navigator.clipboard.writeText(fullUrl)}
              >
                Copy
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-sans">Query string</p>
            <pre className="rounded border bg-background p-2 overflow-x-auto whitespace-pre-wrap">
              {entry.queryString || '(none)'}
            </pre>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-sans">Request headers</p>
            <pre className="rounded border bg-background p-2 overflow-x-auto max-h-40">
              {Object.keys(entry.headers).length
                ? Object.entries(entry.headers)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join('\n')
                : '(none)'}
            </pre>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-sans">Request body</p>
            <pre className="rounded border bg-background p-2 overflow-x-auto max-h-48 whitespace-pre-wrap">
              {formatBody(entry.body)}
            </pre>
          </div>

          <p className="text-muted-foreground font-sans text-[11px]">{metadataLine(entry)}</p>
        </div>
      ) : null}
    </div>
  );
}

export function MockRequestLogsPanel({ teamId, projectId, apiBaseUrl }: MockRequestLogsPanelProps) {
  const enabled = MOCK_LOGS_ENABLED;
  const { logs, connected, failed, subscribeError, clearLogs } = useMockLogs({
    teamId,
    projectId,
    enabled,
  });

  if (!enabled) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            Logs
          </CardTitle>
          <CardDescription>Live request log streaming is not available in this environment.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Live request logs require the Node dev server.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            Logs
          </CardTitle>
          <CardDescription>
            Live history of requests to {apiBaseUrl}/mock/{projectId}
            {'/*'} and in-dashboard route tests
          </CardDescription>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Circle
              className={`w-2 h-2 fill-current ${connected ? 'text-green-500' : failed ? 'text-destructive' : 'text-amber-500'}`}
            />
            {connected ? 'Live' : failed ? 'Disconnected' : 'Connecting…'}
          </span>
          <span className="text-xs text-muted-foreground">{logs.length} entries</span>
          <Button type="button" variant="outline" size="sm" onClick={clearLogs} disabled={logs.length === 0}>
            Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {failed && !connected ? (
          <p className="text-sm text-muted-foreground px-6 pb-4">
            Live request logs require the Node dev server.
          </p>
        ) : null}
        {subscribeError ? (
          <p className="text-sm text-destructive px-6 pb-4">{subscribeError}</p>
        ) : null}
        <p className="text-xs text-muted-foreground px-6 pb-3 font-sans">
          POST, PUT, and DELETE requests mutate live mock collections.
        </p>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground px-6 pb-6">
            No requests yet — hit your mock URL to see traffic.
          </p>
        ) : (
          <div className="max-h-[480px] overflow-y-auto rounded-b-lg border-t bg-background">
            {logs.map((entry) => (
              <LogRow key={entry.id} entry={entry} apiBaseUrl={apiBaseUrl} projectId={projectId} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
