import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { useTeam } from '@/lib/team-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Copy, Trash2 } from 'lucide-react';

export function TeamDetail() {
  const { teamId } = useParams<{ teamId: string }>();
  const { refetchTeams } = useTeam();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const teamQuery = trpc.team.get.useQuery(
    { teamId: teamId! },
    { enabled: !!teamId }
  );

  const invitesQuery = trpc.invite.list.useQuery(
    { teamId: teamId! },
    { enabled: !!teamId && teamQuery.data?.callerRole === 'admin' }
  );

  const createInviteMutation = trpc.invite.create.useMutation({
    onSuccess: (data) => {
      setLastInviteLink(`${window.location.origin}${data.acceptPath}`);
      setInviteEmail('');
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
              {createInviteMutation.isError ? (
                <p className="text-sm text-destructive">{createInviteMutation.error.message}</p>
              ) : null}
              <Button
                onClick={() =>
                  void createInviteMutation.mutateAsync({
                    teamId,
                    email: inviteEmail,
                    role: inviteRole,
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
