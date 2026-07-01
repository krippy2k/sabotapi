import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

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
  path: '/api/users',
  method: 'GET',
  statusCode: 200,
  responseType: 'json',
  responseBody: FAKER_ARRAY_TEMPLATE,
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
    onSuccess: (data) => setPreviewBody(data.resolvedBody),
  });

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
    setRouteForm({
      routeId: route.id,
      path: route.path,
      method: route.method,
      statusCode: route.status_code,
      responseType: route.response_type,
      responseBody: route.response_body,
    });
    setShowRouteForm(true);
  };

  const saveRoute = async () => {
    const payload = {
      teamId,
      projectId,
      apiId,
      path: routeForm.path,
      method: routeForm.method,
      statusCode: routeForm.statusCode,
      responseType: routeForm.responseType,
      responseBody: routeForm.responseBody,
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
                  <Label htmlFor="responseBody">Mock response body</Label>
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
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void previewMutation.mutateAsync({
                          teamId,
                          projectId,
                          responseType: routeForm.responseType,
                          responseBody: routeForm.responseBody,
                        })
                      }
                      disabled={previewMutation.isPending}
                    >
                      {previewMutation.isPending ? 'Previewing…' : 'Preview'}
                    </Button>
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
                    routeForm.responseType === 'json'
                      ? JSON_FAKER_PLACEHOLDER
                      : 'name={{faker.person.firstName}}&email={{faker.internet.email}}'
                  }
                />
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
                {previewMutation.isError ? (
                  <p className="text-sm text-destructive">{previewMutation.error.message}</p>
                ) : null}
                {previewBody !== null ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Preview output</p>
                    <pre className="text-xs rounded-md border bg-muted/50 p-3 overflow-x-auto font-mono whitespace-pre-wrap">
                      {previewBody}
                    </pre>
                  </div>
                ) : null}
              </div>
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
                    </p>
                    <code className="text-xs block truncate text-muted-foreground">
                      {apiBaseUrl}/mock/{projectId}
                      {route.path}
                    </code>
                  </div>
                  <div className="flex gap-1">
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
