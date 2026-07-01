import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { useTeam } from '@/lib/team-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Copy, FolderKanban, Trash2 } from 'lucide-react';

export function TeamDetail() {
  const { teamId } = useParams<{ teamId: string }>();
  const { refetchTeams } = useTeam();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [inviteProjectIds, setInviteProjectIds] = useState<string[]>([]);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [showProjectForm, setShowProjectForm] = useState(false);

  const utils = trpc.useUtils();

  const teamQuery = trpc.team.get.useQuery(
    { teamId: teamId! },
    { enabled: !!teamId }
  );

  const invitesQuery = trpc.invite.list.useQuery(
    { teamId: teamId! },
    { enabled: !!teamId && teamQuery.data?.callerRole === 'admin' }
  );

  const projectsQuery = trpc.project.list.useQuery(
    { teamId: teamId! },
    { enabled: !!teamId }
  );

  const createProjectMutation = trpc.project.create.useMutation({
    onSuccess: () => {
      void utils.project.list.invalidate({ teamId: teamId! });
      setProjectName('');
      setShowProjectForm(false);
    },
  });

  const createInviteMutation = trpc.invite.create.useMutation({
    onSuccess: (data) => {
      setLastInviteLink(`${window.location.origin}${data.acceptPath}`);
      setInviteEmail('');
      setInviteProjectIds([]);
      void utils.invite.list.invalidate({ teamId: teamId! });
    },
  });

  const revokeInviteMutation = trpc.invite.revoke.useMutation({
    onSuccess: () => void utils.invite.list.invalidate({ teamId: teamId! }),
  });

  const updateRoleMutation = trpc.team.members.updateRole.useMutation({
    onSuccess: () => {
      void utils.team.get.invalidate({ teamId: teamId! });
      void refetchTeams();
    },
  });

  const removeMemberMutation = trpc.team.members.remove.useMutation({
    onSuccess: () => {
      void utils.team.get.invalidate({ teamId: teamId! });
      void refetchTeams();
    },
  });

  if (!teamId) {
    return <p className="p-6 text-destructive">Invalid team</p>;
  }

  if (teamQuery.isLoading) {
    return <p className="p-6 text-muted-foreground">Loading team…</p>;
  }

  if (teamQuery.isError || !teamQuery.data) {
    return (
      <div className="p-6">
        <p className="text-destructive">{teamQuery.error?.message ?? 'Team not found'}</p>
        <Button variant="link" asChild className="px-0 mt-2">
          <Link to="/teams">Back to teams</Link>
        </Button>
      </div>
    );
  }

  const { team, members, callerRole } = teamQuery.data;
  const isAdmin = callerRole === 'admin';

  const copyInviteLink = async () => {
    if (!lastInviteLink) return;
    await navigator.clipboard.writeText(lastInviteLink);
  };

  const toggleInviteProject = (projectId: string) => {
    setInviteProjectIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
    );
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link to="/teams">
          <ArrowLeft className="w-4 h-4 mr-2" />
          All teams
        </Link>
      </Button>

      <h1 className="text-3xl font-bold mb-6">{team.name}</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>{members.length} member{members.length !== 1 ? 's' : ''}</CardDescription>
        </CardHeader>
        <CardContent>
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
                {isAdmin ? (
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm capitalize"
                    value={member.role}
                    onChange={(e) =>
                      void updateRoleMutation.mutateAsync({
                        teamId,
                        userId: member.user_id,
                        role: e.target.value as 'admin' | 'user',
                      })
                    }
                    disabled={updateRoleMutation.isPending}
                  >
                    <option value="admin">admin</option>
                    <option value="user">user</option>
                  </select>
                ) : (
                  <span className="text-sm capitalize text-muted-foreground">{member.role}</span>
                )}
                {isAdmin ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      void removeMemberMutation.mutateAsync({ teamId, userId: member.user_id })
                    }
                    disabled={removeMemberMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
          {updateRoleMutation.isError ? (
            <p className="text-sm text-destructive mt-2">{updateRoleMutation.error.message}</p>
          ) : null}
          {removeMemberMutation.isError ? (
            <p className="text-sm text-destructive mt-2">{removeMemberMutation.error.message}</p>
          ) : null}
        </CardContent>
      </Card>

      <Separator className="my-6" />

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderKanban className="w-5 h-5" />
              Projects
            </CardTitle>
            <CardDescription>Projects within this team</CardDescription>
          </div>
          {isAdmin ? (
            <Button variant="outline" size="sm" onClick={() => setShowProjectForm((v) => !v)}>
              New project
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {isAdmin && showProjectForm ? (
            <div className="flex gap-2">
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Project name"
              />
              <Button
                onClick={() =>
                  void createProjectMutation.mutateAsync({ teamId, name: projectName })
                }
                disabled={!projectName.trim() || createProjectMutation.isPending}
              >
                Create
              </Button>
            </div>
          ) : null}
          {createProjectMutation.isError ? (
            <p className="text-sm text-destructive">{createProjectMutation.error.message}</p>
          ) : null}
          {projectsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading projects…</p>
          ) : !projectsQuery.data?.length ? (
            <p className="text-sm text-muted-foreground">No projects yet</p>
          ) : (
            <div className="space-y-2">
              {projectsQuery.data.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <Link
                    to={`/teams/${teamId}/projects/${project.id}`}
                    className="font-medium hover:underline"
                  >
                    {project.name}
                  </Link>
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/teams/${teamId}/projects/${project.id}`}>Open</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isAdmin ? (
        <>
          <Separator className="my-6" />
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Invite members</CardTitle>
              <CardDescription>
                Invite other users to join the organization with admin or user roles.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="inviteEmail">Email</Label>
                  <Input
                    id="inviteEmail"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inviteRole">Role</Label>
                  <select
                    id="inviteRole"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm capitalize"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'admin' | 'user')}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
              </div>
              {(projectsQuery.data?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  <Label>Assign to projects initially</Label>
                  <div className="rounded-md border p-3 space-y-2 max-h-40 overflow-y-auto">
                    {projectsQuery.data?.map((project) => (
                      <label key={project.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={inviteProjectIds.includes(project.id)}
                          onChange={() => toggleInviteProject(project.id)}
                          className="rounded border-input"
                        />
                        {project.name}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
              {createInviteMutation.isError ? (
                <p className="text-sm text-destructive">{createInviteMutation.error.message}</p>
              ) : null}
              <Button
                onClick={() =>
                  void createInviteMutation.mutateAsync({
                    teamId,
                    email: inviteEmail,
                    role: inviteRole,
                    projectIds: inviteProjectIds,
                  })
                }
                disabled={!inviteEmail.trim() || createInviteMutation.isPending}
              >
                {createInviteMutation.isPending ? 'Creating invite…' : 'Create invite link'}
              </Button>
              {lastInviteLink ? (
                <div className="flex items-center gap-2 p-3 rounded-md bg-muted">
                  <code className="text-xs flex-1 truncate">{lastInviteLink}</code>
                  <Button variant="outline" size="sm" onClick={() => void copyInviteLink()}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pending invites</CardTitle>
            </CardHeader>
            <CardContent>
              {invitesQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : !invitesQuery.data?.length ? (
                <p className="text-sm text-muted-foreground">No pending invites</p>
              ) : (
                <div className="space-y-2">
                  {invitesQuery.data.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex items-center justify-between py-2 border-b last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium">{invite.email}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {invite.role} · expires {new Date(invite.expires_at).toLocaleDateString()}
                          {invite.projects.length > 0
                            ? ` · ${invite.projects.map((p) => p.name).join(', ')}`
                            : ''}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          void revokeInviteMutation.mutateAsync({
                            teamId,
                            inviteId: invite.id,
                          })
                        }
                        disabled={revokeInviteMutation.isPending}
                      >
                        Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
