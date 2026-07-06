import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Trash2, Webhook } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { MockCollectionPanel } from '@/components/mock-collection-panel';
import { MockRequestLogsPanel } from '@/components/mock-request-logs-panel';

type PendingConfirm =
  | { type: 'deleteProject' }
  | { type: 'removeMember'; userId: string; name: string }
  | null;

export function ProjectDetail() {
  const { teamId, projectId } = useParams<{ teamId: string; projectId: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [addUserId, setAddUserId] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [apiName, setApiName] = useState('');
  const [showApiForm, setShowApiForm] = useState(false);

  const utils = trpc.useUtils();
  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5500';

  const projectQuery = trpc.project.get.useQuery(
    { teamId: teamId!, projectId: projectId! },
    { enabled: !!teamId && !!projectId }
  );

  const teamQuery = trpc.team.get.useQuery(
    { teamId: teamId! },
    { enabled: !!teamId && projectQuery.data?.callerIsAdmin === true }
  );

  const updateMutation = trpc.project.update.useMutation({
    onSuccess: () => void utils.project.get.invalidate({ teamId: teamId!, projectId: projectId! }),
  });

  const deleteMutation = trpc.project.delete.useMutation({
    onSuccess: () => navigate(`/teams/${teamId}`),
  });

  const addMemberMutation = trpc.project.members.add.useMutation({
    onSuccess: () => {
      void utils.project.get.invalidate({ teamId: teamId!, projectId: projectId! });
      setAddUserId('');
    },
  });

  const removeMemberMutation = trpc.project.members.remove.useMutation({
    onSuccess: () =>
      void utils.project.get.invalidate({ teamId: teamId!, projectId: projectId! }),
  });

  const apisQuery = trpc.mockApi.apis.list.useQuery(
    { teamId: teamId!, projectId: projectId! },
    { enabled: !!teamId && !!projectId }
  );

  const createApiMutation = trpc.mockApi.apis.create.useMutation({
    onSuccess: () => {
      void utils.mockApi.apis.list.invalidate({ teamId: teamId!, projectId: projectId! });
      setApiName('');
      setShowApiForm(false);
    },
  });

  useEffect(() => {
    if (projectQuery.data) {
      setName(projectQuery.data.project.name);
    }
  }, [projectQuery.data?.project.name]);

  if (!teamId || !projectId) {
    return <p className="p-6 text-destructive">Invalid project</p>;
  }

  if (projectQuery.isLoading) {
    return <p className="p-6 text-muted-foreground">Loading project…</p>;
  }

  if (projectQuery.isError || !projectQuery.data) {
    return (
      <div className="p-6">
        <p className="text-destructive">{projectQuery.error?.message ?? 'Project not found'}</p>
        <Button variant="link" asChild className="px-0 mt-2">
          <Link to={`/teams/${teamId}`}>Back to team</Link>
        </Button>
      </div>
    );
  }

  const { project, members, callerIsAdmin } = projectQuery.data;

  const projectMemberIds = new Set(members.map((m) => m.user_id));
  const availableTeamMembers =
    teamQuery.data?.members.filter((m) => !projectMemberIds.has(m.user_id)) ?? [];

  const memberDisplayName = (userId: string, displayName?: string | null, email?: string | null) =>
    displayName ?? email ?? userId;

  const handleConfirm = async () => {
    if (!pendingConfirm || !teamId || !projectId) return;
    if (pendingConfirm.type === 'deleteProject') {
      await deleteMutation.mutateAsync({ teamId, projectId });
    } else if (pendingConfirm.type === 'removeMember') {
      await removeMemberMutation.mutateAsync({
        teamId,
        projectId,
        userId: pendingConfirm.userId,
      });
    }
  };

  const confirmOpen = pendingConfirm !== null;
  const confirmLoading =
    pendingConfirm?.type === 'deleteProject'
      ? deleteMutation.isPending
      : removeMemberMutation.isPending;

  let confirmTitle = '';
  let confirmDescription = '';
  let confirmLabel = 'Confirm';

  if (pendingConfirm?.type === 'deleteProject') {
    confirmTitle = 'Delete project?';
    confirmDescription = `This will permanently delete "${project.name}" and remove all project members. This cannot be undone.`;
    confirmLabel = 'Delete project';
  } else if (pendingConfirm?.type === 'removeMember') {
    confirmTitle = 'Remove from project?';
    confirmDescription = `Remove ${pendingConfirm.name} from this project? They will remain a team member.`;
    confirmLabel = 'Remove';
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link to={`/teams/${teamId}`}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to team
        </Link>
      </Button>

      {callerIsAdmin ? (
        <div className="flex items-center gap-2 mb-6">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-3xl font-bold h-auto py-1 max-w-md"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void updateMutation.mutateAsync({
                teamId,
                projectId,
                name: name,
              })
            }
            disabled={updateMutation.isPending || !name.trim()}
          >
            Save
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setPendingConfirm({ type: 'deleteProject' })}
            disabled={deleteMutation.isPending}
          >
            Delete
          </Button>
        </div>
      ) : (
        <h1 className="text-3xl font-bold mb-6">{project.name}</h1>
      )}

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="w-5 h-5" />
              APIs
            </CardTitle>
            <CardDescription>Mock APIs and routes for this project</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowApiForm((v) => !v)}>
            New API
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {showApiForm ? (
            <div className="flex gap-2">
              <Input
                value={apiName}
                onChange={(e) => setApiName(e.target.value)}
                placeholder="API name"
              />
              <Button
                onClick={() =>
                  void createApiMutation.mutateAsync({ teamId, projectId, name: apiName })
                }
                disabled={!apiName.trim() || createApiMutation.isPending}
              >
                Create
              </Button>
            </div>
          ) : null}
          {createApiMutation.isError ? (
            <p className="text-sm text-destructive">{createApiMutation.error.message}</p>
          ) : null}
          {apisQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading APIs…</p>
          ) : !apisQuery.data?.length ? (
            <p className="text-sm text-muted-foreground">No APIs yet</p>
          ) : (
            <div className="space-y-2">
              {apisQuery.data.map((api) => (
                <div
                  key={api.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <Link
                    to={`/teams/${teamId}/projects/${projectId}/apis/${api.id}`}
                    className="font-medium hover:underline"
                  >
                    {api.name}
                  </Link>
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/teams/${teamId}/projects/${projectId}/apis/${api.id}`}>
                      Manage routes
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Mock data stores</CardTitle>
          <CardDescription>
            Collections persist across requests — use with stateful CRUD routes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MockCollectionPanel teamId={teamId} projectId={projectId} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Project members</CardTitle>
          <CardDescription>
            {members.length} member{members.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {callerIsAdmin ? (
            <div className="flex gap-2">
              <select
                className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={addUserId}
                onChange={(e) => setAddUserId(e.target.value)}
              >
                <option value="">Add team member…</option>
                {availableTeamMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name ?? m.email ?? m.user_id}
                  </option>
                ))}
              </select>
              <Button
                onClick={() =>
                  void addMemberMutation.mutateAsync({ teamId, projectId, userId: addUserId })
                }
                disabled={!addUserId || addMemberMutation.isPending}
              >
                Add
              </Button>
            </div>
          ) : null}

          <div className="space-y-3">
            {members.map((member) => (
              <div
                key={member.membership_id}
                className="flex items-center gap-4 py-2 border-b last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {member.display_name ?? member.email ?? member.user_id}
                  </p>
                  {member.display_name && member.email ? (
                    <p className="text-sm text-muted-foreground truncate">{member.email}</p>
                  ) : null}
                </div>
                {callerIsAdmin ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setPendingConfirm({
                        type: 'removeMember',
                        userId: member.user_id,
                        name: memberDisplayName(
                          member.user_id,
                          member.display_name,
                          member.email
                        ),
                      })
                    }
                    disabled={removeMemberMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>

          {addMemberMutation.isError ? (
            <p className="text-sm text-destructive">{addMemberMutation.error.message}</p>
          ) : null}
          {updateMutation.isError ? (
            <p className="text-sm text-destructive">{updateMutation.error.message}</p>
          ) : null}
          {deleteMutation.isError ? (
            <p className="text-sm text-destructive">{deleteMutation.error.message}</p>
          ) : null}
        </CardContent>
      </Card>

      <MockRequestLogsPanel teamId={teamId} projectId={projectId} apiBaseUrl={apiBaseUrl} />

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
