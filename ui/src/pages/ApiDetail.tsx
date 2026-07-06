import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Pencil, Play, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RouteRuleBuilder } from '@/components/route-rule-builder';
import { RouteTester, RouteTesterSheet } from '@/components/route-tester';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
const STORE_OPERATIONS = ['list', 'get', 'create', 'update', 'delete'] as const;
const CREATE_COLLECTION_VALUE = '__create_new__';

type PendingConfirm =
  | { type: 'deleteApi' }
  | { type: 'deleteRoute'; routeId: string; label: string }
  | null;

type RouteFormState = {
  routeId?: string;
  path: string;
  method: (typeof HTTP_METHODS)[number];
  statusCode: number;
  responseType: 'json' | 'url_encoded';
  responseBody: string;
  responseMode: 'static' | 'stateful';
  storeCollectionId: string;
  storeOperation: (typeof STORE_OPERATIONS)[number];
};

const FAKER_EXAMPLES = [
  '{{faker.person.firstName}}',
  '{{faker.person.lastName}}',
  '{{faker.internet.email}}',
  '{{faker.phone.number}}',
  '{{faker.string.uuid}}',
  '{{faker.location.city}}',
] as const;

const FAKER_ARRAY_TEMPLATE = JSON.stringify(
  {
    users: {
      __fakerArray: {
        min: 2,
        max: 5,
        item: {
          firstName: '{{faker.person.firstName}}',
          email: '{{faker.internet.email}}',
        },
      },
    },
  },
  null,
  2
);

const FAKER_ARRAY_EXAMPLE = FAKER_ARRAY_TEMPLATE;

const JSON_FAKER_PLACEHOLDER =
  '{"firstName":"{{faker.person.firstName}}","email":"{{faker.internet.email}}","phone":"{{faker.phone.number}}"}';

const emptyRouteForm = (): RouteFormState => ({
  path: '/users',
  method: 'GET',
  statusCode: 200,
  responseType: 'json',
  responseBody: '{{store}}',
  responseMode: 'stateful',
  storeCollectionId: '',
  storeOperation: 'list',
});

export function ApiDetail() {
  const { teamId, projectId, apiId } = useParams<{
    teamId: string;
    projectId: string;
    apiId: string;
  }>();
  const navigate = useNavigate();
  const [apiName, setApiName] = useState('');
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [routeForm, setRouteForm] = useState<RouteFormState>(emptyRouteForm);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [previewBody, setPreviewBody] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<number | null>(null);
  const [previewMatchedRule, setPreviewMatchedRule] = useState<string | null>(null);
  const [previewQuery, setPreviewQuery] = useState('status=pending');
  const [previewHeaders, setPreviewHeaders] = useState('Authorization: Bearer test');
  const [previewRequestBody, setPreviewRequestBody] = useState('');
  const [testingRouteId, setTestingRouteId] = useState<string | null>(null);
  const [showNewCollectionForm, setShowNewCollectionForm] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionIdField, setNewCollectionIdField] = useState('id');

  const utils = trpc.useUtils();
  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5500';

  const apisQuery = trpc.mockApi.apis.list.useQuery(
    { teamId: teamId!, projectId: projectId! },
    { enabled: !!teamId && !!projectId }
  );

  const routesQuery = trpc.mockApi.routes.list.useQuery(
    { teamId: teamId!, projectId: projectId!, apiId: apiId! },
    { enabled: !!teamId && !!projectId && !!apiId }
  );

  const rulesForApiQuery = trpc.mockApi.rules.listForApi.useQuery(
    { teamId: teamId!, projectId: projectId!, apiId: apiId! },
    { enabled: !!teamId && !!projectId && !!apiId }
  );

  const collectionsQuery = trpc.mockApi.collections.list.useQuery(
    { teamId: teamId!, projectId: projectId! },
    { enabled: !!teamId && !!projectId }
  );

  const ruleCountByRoute = (rulesForApiQuery.data ?? []).reduce<Record<string, number>>(
    (acc, rule) => {
      acc[rule.route_id] = (acc[rule.route_id] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const api = apisQuery.data?.find((a) => a.id === apiId);

  const updateApiMutation = trpc.mockApi.apis.update.useMutation({
    onSuccess: () => void utils.mockApi.apis.list.invalidate({ teamId: teamId!, projectId: projectId! }),
  });

  const deleteApiMutation = trpc.mockApi.apis.delete.useMutation({
    onSuccess: () => navigate(`/teams/${teamId}/projects/${projectId}`),
  });

  const createRouteMutation = trpc.mockApi.routes.create.useMutation({
    onSuccess: () => {
      void utils.mockApi.routes.list.invalidate({
        teamId: teamId!,
        projectId: projectId!,
        apiId: apiId!,
      });
      setShowRouteForm(false);
      setRouteForm(emptyRouteForm());
    },
  });

  const updateRouteMutation = trpc.mockApi.routes.update.useMutation({
    onSuccess: () => {
      void utils.mockApi.routes.list.invalidate({
        teamId: teamId!,
        projectId: projectId!,
        apiId: apiId!,
      });
      setShowRouteForm(false);
      setRouteForm(emptyRouteForm());
    },
  });

  const deleteRouteMutation = trpc.mockApi.routes.delete.useMutation({
    onSuccess: () =>
      void utils.mockApi.routes.list.invalidate({
        teamId: teamId!,
        projectId: projectId!,
        apiId: apiId!,
      }),
  });

  const previewMutation = trpc.mockApi.routes.preview.useMutation({
    onSuccess: (data) => {
      setPreviewBody(data.resolvedBody);
      setPreviewStatus(data.statusCode);
      setPreviewMatchedRule(data.matchedRuleId);
    },
  });

  const createCollectionMutation = trpc.mockApi.collections.create.useMutation({
    onSuccess: (created) => {
      void utils.mockApi.collections.list.invalidate({ teamId: teamId!, projectId: projectId! });
      setShowNewCollectionForm(false);
      setNewCollectionName('');
      setNewCollectionIdField('id');
      setRouteForm((f) => ({ ...f, storeCollectionId: created.id }));
    },
  });

  const parsePreviewQuery = (): Record<string, string> => {
    const params: Record<string, string> = {};
    for (const part of previewQuery.split('&')) {
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
  };

  const parsePreviewHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {};
    for (const line of previewHeaders.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const colon = trimmed.indexOf(':');
      if (colon === -1) continue;
      headers[trimmed.slice(0, colon).trim()] = trimmed.slice(colon + 1).trim();
    }
    return headers;
  };

  const runPreview = () => {
    if (!teamId || !projectId || !apiId) return;
    void previewMutation.mutateAsync({
      teamId,
      projectId,
      apiId,
      routeId: routeForm.routeId,
      method: routeForm.method,
      responseType: routeForm.responseType,
      responseBody: routeForm.responseBody,
      requestContext: {
        query: parsePreviewQuery(),
        headers: parsePreviewHeaders(),
        body: previewRequestBody || undefined,
      },
    });
  };

  useEffect(() => {
    if (api) {
      setApiName(api.name);
    }
  }, [api?.name]);

  if (!teamId || !projectId || !apiId) {
    return <p className="p-6 text-destructive">Invalid API</p>;
  }

  if (apisQuery.isLoading) {
    return <p className="p-6 text-muted-foreground">Loading API…</p>;
  }

  if (!api) {
    return (
      <div className="p-6">
        <p className="text-destructive">API not found</p>
        <Button variant="link" asChild className="px-0 mt-2">
          <Link to={`/teams/${teamId}/projects/${projectId}`}>Back to project</Link>
        </Button>
      </div>
    );
  }

  const startEditRoute = (route: NonNullable<typeof routesQuery.data>[number]) => {
    setPreviewBody(null);
    setPreviewStatus(null);
    setPreviewMatchedRule(null);
    setShowNewCollectionForm(false);
    const isStateful = !!route.store_operation && !!route.store_collection_id;
    setRouteForm({
      routeId: route.id,
      path: route.path,
      method: route.method as RouteFormState['method'],
      statusCode: route.status_code,
      responseType: route.response_type as RouteFormState['responseType'],
      responseBody: route.response_body,
      responseMode: isStateful ? 'stateful' : 'static',
      storeCollectionId: route.store_collection_id ?? '',
      storeOperation: (route.store_operation ?? 'list') as RouteFormState['storeOperation'],
    });
    setShowRouteForm(true);
  };

  const saveRoute = async () => {
    const isStateful = routeForm.responseMode === 'stateful';
    const payload = {
      teamId,
      projectId,
      apiId,
      path: routeForm.path,
      method: routeForm.method,
      statusCode: routeForm.statusCode,
      responseType: isStateful ? ('json' as const) : routeForm.responseType,
      responseBody: isStateful ? routeForm.responseBody || '{{store}}' : routeForm.responseBody,
      storeCollectionId: isStateful ? routeForm.storeCollectionId : null,
      storeOperation: isStateful ? routeForm.storeOperation : null,
    };

    if (routeForm.routeId) {
      await updateRouteMutation.mutateAsync({ ...payload, routeId: routeForm.routeId });
    } else {
      await createRouteMutation.mutateAsync(payload);
    }
  };

  const handleConfirm = async () => {
    if (!pendingConfirm) return;
    if (pendingConfirm.type === 'deleteApi') {
      await deleteApiMutation.mutateAsync({ teamId, projectId, apiId });
    } else {
      await deleteRouteMutation.mutateAsync({
        teamId,
        projectId,
        apiId,
        routeId: pendingConfirm.routeId,
      });
    }
  };

  const confirmOpen = pendingConfirm !== null;
  const confirmLoading =
    pendingConfirm?.type === 'deleteApi'
      ? deleteApiMutation.isPending
      : deleteRouteMutation.isPending;

  let confirmTitle = '';
  let confirmDescription = '';
  let confirmLabel = 'Confirm';

  if (pendingConfirm?.type === 'deleteApi') {
    confirmTitle = 'Delete API?';
    confirmDescription = `Delete "${api.name}" and all of its routes? This cannot be undone.`;
    confirmLabel = 'Delete API';
  } else if (pendingConfirm?.type === 'deleteRoute') {
    confirmTitle = 'Delete route?';
    confirmDescription = `Delete route ${pendingConfirm.label}? This cannot be undone.`;
    confirmLabel = 'Delete route';
  }

  const routeMutationError =
    createRouteMutation.error ?? updateRouteMutation.error ?? deleteRouteMutation.error;

  const testingRoute = testingRouteId
    ? routesQuery.data?.find((r) => r.id === testingRouteId)
    : undefined;

  const editingRoute = routeForm.routeId
    ? routesQuery.data?.find((r) => r.id === routeForm.routeId)
    : undefined;

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link to={`/teams/${teamId}/projects/${projectId}`}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to project
        </Link>
      </Button>

      <div className="flex items-center gap-2 mb-6">
        <Input
          value={apiName}
          onChange={(e) => setApiName(e.target.value)}
          className="text-3xl font-bold h-auto py-1 max-w-md"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void updateApiMutation.mutateAsync({ teamId, projectId, apiId, name: apiName })
          }
          disabled={updateApiMutation.isPending || !apiName.trim()}
        >
          Save
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setPendingConfirm({ type: 'deleteApi' })}
        >
          Delete API
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Routes</CardTitle>
            <CardDescription>
              Mock endpoints served at {apiBaseUrl}/mock/{projectId}
              {'{path}'}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRouteForm(emptyRouteForm());
              setShowNewCollectionForm(false);
              setShowRouteForm((v) => !v);
            }}
          >
            {showRouteForm ? 'Cancel' : 'New route'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {showRouteForm ? (
            <div className="space-y-4 rounded-md border p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="routePath">URL path</Label>
                  <Input
                    id="routePath"
                    value={routeForm.path}
                    onChange={(e) => setRouteForm((f) => ({ ...f, path: e.target.value }))}
                    placeholder="/users/1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="routeMethod">HTTP method</Label>
                  <select
                    id="routeMethod"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={routeForm.method}
                    onChange={(e) =>
                      setRouteForm((f) => ({
                        ...f,
                        method: e.target.value as RouteFormState['method'],
                      }))
                    }
                  >
                    {HTTP_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="responseMode">Response mode</Label>
                  <select
                    id="responseMode"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={routeForm.responseMode}
                    onChange={(e) => {
                      const mode = e.target.value as 'static' | 'stateful';
                      setRouteForm((f) => ({
                        ...f,
                        responseMode: mode,
                        ...(mode === 'stateful'
                          ? {
                              responseType: 'json' as const,
                              responseBody: f.responseBody || '{{store}}',
                            }
                          : {}),
                      }));
                    }}
                  >
                    <option value="static">Static (faker / fixed JSON)</option>
                    <option value="stateful">Stateful (CRUD)</option>
                  </select>
                </div>
                {routeForm.responseMode === 'stateful' ? (
                  <>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="storeCollection">Collection</Label>
                      <select
                        id="storeCollection"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={
                          showNewCollectionForm
                            ? CREATE_COLLECTION_VALUE
                            : routeForm.storeCollectionId
                        }
                        onChange={(e) => {
                          if (e.target.value === CREATE_COLLECTION_VALUE) {
                            setShowNewCollectionForm(true);
                            return;
                          }
                          setShowNewCollectionForm(false);
                          setRouteForm((f) => ({ ...f, storeCollectionId: e.target.value }));
                        }}
                      >
                        <option value="">Select collection…</option>
                        {collectionsQuery.data?.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                        <option value={CREATE_COLLECTION_VALUE}>+ Create new collection…</option>
                      </select>
                      {showNewCollectionForm ? (
                        <div className="space-y-2 rounded-md border p-3 bg-muted/20">
                          <div className="space-y-1">
                            <Label htmlFor="newCollectionName" className="text-xs">
                              Collection name
                            </Label>
                            <Input
                              id="newCollectionName"
                              value={newCollectionName}
                              onChange={(e) => setNewCollectionName(e.target.value)}
                              placeholder="users"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="newCollectionIdField" className="text-xs">
                              ID field
                            </Label>
                            <Input
                              id="newCollectionIdField"
                              value={newCollectionIdField}
                              onChange={(e) => setNewCollectionIdField(e.target.value)}
                              placeholder="id"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                void createCollectionMutation.mutateAsync({
                                  teamId,
                                  projectId,
                                  name: newCollectionName,
                                  idField: newCollectionIdField,
                                  initialData: '[]',
                                })
                              }
                              disabled={
                                !newCollectionName.trim() || createCollectionMutation.isPending
                              }
                            >
                              {createCollectionMutation.isPending ? 'Creating…' : 'Create'}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setShowNewCollectionForm(false);
                                setNewCollectionName('');
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                          {createCollectionMutation.isError ? (
                            <p className="text-xs text-destructive">
                              {createCollectionMutation.error.message}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="storeOperation">Store operation</Label>
                      <select
                        id="storeOperation"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={routeForm.storeOperation}
                        onChange={(e) =>
                          setRouteForm((f) => ({
                            ...f,
                            storeOperation: e.target.value as RouteFormState['storeOperation'],
                          }))
                        }
                      >
                        {STORE_OPERATIONS.map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-xs text-muted-foreground">
                        Use <code className="text-xs">:id</code> in the path for get/update/delete
                        (e.g. <code className="text-xs">/users/:id</code>). List/create use
                        collection paths like <code className="text-xs">/users</code>.
                      </p>
                    </div>
                  </>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="statusCode">Status code</Label>
                  <Input
                    id="statusCode"
                    type="number"
                    value={routeForm.statusCode}
                    onChange={(e) =>
                      setRouteForm((f) => ({ ...f, statusCode: Number(e.target.value) }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="responseType">Response type</Label>
                  <select
                    id="responseType"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={routeForm.responseType}
                    disabled={routeForm.responseMode === 'stateful'}
                    onChange={(e) =>
                      setRouteForm((f) => ({
                        ...f,
                        responseType: e.target.value as 'json' | 'url_encoded',
                      }))
                    }
                  >
                    <option value="json">json</option>
                    <option value="url_encoded">url_encoded</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="responseBody">
                    {routeForm.responseMode === 'stateful'
                      ? 'Response wrapper (optional)'
                      : 'Mock response body'}
                  </Label>
                  <div className="flex gap-2">
                    {routeForm.responseType === 'json' ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPreviewBody(null);
                          setRouteForm((f) => ({
                            ...f,
                            responseType: 'json',
                            responseBody: FAKER_ARRAY_TEMPLATE,
                          }));
                        }}
                      >
                        Insert array template
                      </Button>
                    ) : null}
                    {!routeForm.routeId ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPreviewBody(null);
                          setPreviewStatus(null);
                          setPreviewMatchedRule(null);
                          runPreview();
                        }}
                        disabled={previewMutation.isPending}
                      >
                        {previewMutation.isPending ? 'Previewing…' : 'Preview'}
                      </Button>
                    ) : null}
                  </div>
                </div>
                <textarea
                  id="responseBody"
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  value={routeForm.responseBody}
                  onChange={(e) => {
                    setPreviewBody(null);
                    setRouteForm((f) => ({ ...f, responseBody: e.target.value }));
                  }}
                  placeholder={
                    routeForm.responseMode === 'stateful'
                      ? '{{store}} or {"data":{{store}}}'
                      : routeForm.responseType === 'json'
                        ? JSON_FAKER_PLACEHOLDER
                        : 'name={{faker.person.firstName}}&email={{faker.internet.email}}'
                  }
                />
                {routeForm.responseMode === 'stateful' ? (
                  <p className="text-xs text-muted-foreground">
                    Leave as <code className="text-xs">{'{{store}}'}</code> to return live collection
                    data directly.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Use template strings like{' '}
                      <code className="text-xs">{'{{faker.*}}'}</code> in your response body — they
                      resolve with randomized data on every mock request. Wrap an object in{' '}
                      <code className="text-xs">__fakerArray</code> with <code className="text-xs">min</code>
                      , <code className="text-xs">max</code>, and <code className="text-xs">item</code>{' '}
                      to generate a random-length array (2–5 items in the example below).
                    </p>
                    <pre className="text-xs rounded-md border bg-muted/30 p-2 overflow-x-auto font-mono whitespace-pre-wrap text-muted-foreground">
                      {FAKER_ARRAY_EXAMPLE}
                    </pre>
                    <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                      {FAKER_EXAMPLES.map((token) => (
                        <li key={token}>
                          <code className="text-xs">{token}</code>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {!routeForm.routeId ? (
                  <>
                    <div className="space-y-2 rounded-md border p-3">
                      <p className="text-xs font-medium">Preview request context</p>
                      <div className="space-y-1">
                        <Label htmlFor="previewQuery" className="text-xs">
                          Query string
                        </Label>
                        <Input
                          id="previewQuery"
                          className="font-mono text-xs h-8"
                          value={previewQuery}
                          onChange={(e) => setPreviewQuery(e.target.value)}
                          placeholder="status=pending"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="previewHeaders" className="text-xs">
                          Headers (one per line)
                        </Label>
                        <textarea
                          id="previewHeaders"
                          className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-mono"
                          value={previewHeaders}
                          onChange={(e) => setPreviewHeaders(e.target.value)}
                          placeholder="Authorization: Bearer token"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="previewRequestBody" className="text-xs">
                          Request body
                        </Label>
                        <textarea
                          id="previewRequestBody"
                          className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-mono"
                          value={previewRequestBody}
                          onChange={(e) => setPreviewRequestBody(e.target.value)}
                          placeholder='{"role":"admin"}'
                        />
                      </div>
                    </div>
                    {previewMutation.isError ? (
                      <p className="text-sm text-destructive">{previewMutation.error.message}</p>
                    ) : null}
                    {previewBody !== null ? (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">
                          Preview output
                          {previewStatus !== null ? ` · HTTP ${previewStatus}` : ''}
                          {previewMatchedRule ? ' · matched rule' : ''}
                        </p>
                        <pre className="text-xs rounded-md border bg-muted/50 p-3 overflow-x-auto font-mono whitespace-pre-wrap">
                          {previewBody}
                        </pre>
                      </div>
                    ) : null}
                  </>
                ) : editingRoute ? (
                  <div className="space-y-2 rounded-md border p-3">
                    <p className="text-xs font-medium">Test saved route</p>
                    <RouteTester
                      teamId={teamId}
                      projectId={projectId}
                      apiId={apiId}
                      route={{
                        id: editingRoute.id,
                        method: editingRoute.method,
                        path: editingRoute.path,
                        store_operation: editingRoute.store_operation,
                      }}
                      apiBaseUrl={apiBaseUrl}
                      compact
                    />
                  </div>
                ) : null}
              </div>
              {routeForm.routeId ? (
                <RouteRuleBuilder
                  teamId={teamId}
                  projectId={projectId}
                  apiId={apiId}
                  routeId={routeForm.routeId}
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Save the route first to add conditional response rules.
                </p>
              )}
              <Button
                onClick={() => void saveRoute()}
                disabled={createRouteMutation.isPending || updateRouteMutation.isPending}
              >
                {routeForm.routeId ? 'Update route' : 'Create route'}
              </Button>
            </div>
          ) : null}

          {routeMutationError ? (
            <p className="text-sm text-destructive">{routeMutationError.message}</p>
          ) : null}

          {routesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading routes…</p>
          ) : !routesQuery.data?.length ? (
            <p className="text-sm text-muted-foreground">No routes yet</p>
          ) : (
            <div className="space-y-3">
              {routesQuery.data.map((route) => (
                <div
                  key={route.id}
                  className="flex items-start gap-4 py-3 border-b last:border-0"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-mono text-sm font-medium">
                      <span className="text-muted-foreground">{route.method}</span> {route.path}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {route.status_code} · {route.response_type}
                      {route.store_operation
                        ? ` · store:${route.store_operation}`
                        : ''}
                      {(ruleCountByRoute[route.id] ?? 0) > 0
                        ? ` · ${ruleCountByRoute[route.id]} rule${ruleCountByRoute[route.id] === 1 ? '' : 's'}`
                        : ''}
                    </p>
                    <code className="text-xs block truncate text-muted-foreground">
                      {apiBaseUrl}/mock/{projectId}
                      {route.path}
                    </code>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Test route"
                      onClick={() => setTestingRouteId(route.id)}
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => startEditRoute(route)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setPendingConfirm({
                          type: 'deleteRoute',
                          routeId: route.id,
                          label: `${route.method} ${route.path}`,
                        })
                      }
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {testingRoute ? (
        <RouteTesterSheet
          open={!!testingRouteId}
          onOpenChange={(open) => !open && setTestingRouteId(null)}
          teamId={teamId}
          projectId={projectId}
          apiId={apiId}
          route={{
            id: testingRoute.id,
            method: testingRoute.method,
            path: testingRoute.path,
            store_operation: testingRoute.store_operation,
          }}
          apiBaseUrl={apiBaseUrl}
        />
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => !open && setPendingConfirm(null)}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={confirmLabel}
        onConfirm={handleConfirm}
        loading={confirmLoading}
      />
    </div>
  );
}
