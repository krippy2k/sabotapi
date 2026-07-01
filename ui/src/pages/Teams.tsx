import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useTeam } from '@/lib/team-context';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, Plus } from 'lucide-react';

export function Teams() {
  const { user } = useAuth();
  const { teams, loading, refetchTeams } = useTeam();
  const [name, setName] = useState('');
  const [showForm, setShowForm] = useState(false);

  const utils = trpc.useUtils();
  const createMutation = trpc.team.create.useMutation({
    onSuccess: async () => {
      await utils.team.list.invalidate();
      await refetchTeams();
      setName('');
      setShowForm(false);
    },
  });

  if (user?.isAnonymous) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Teams require a full account</CardTitle>
            <CardDescription>
              Sign in with email to create a team and invite other users.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="w-8 h-8" />
            Teams
          </h1>
          <p className="text-muted-foreground mt-1">
            Create a team and invite others with admin or user roles.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="w-4 h-4 mr-2" />
          New team
        </Button>
      </div>

      {showForm ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create team</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="teamName">Team name</Label>
              <Input
                id="teamName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Engineering"
              />
            </div>
            {createMutation.isError ? (
              <p className="text-sm text-destructive">{createMutation.error.message}</p>
            ) : null}
            <div className="flex gap-2">
              <Button
                onClick={() => void createMutation.mutateAsync({ name })}
                disabled={!name.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating…' : 'Create'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <p className="text-muted-foreground">Loading teams…</p>
      ) : teams.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No teams yet. Create one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {teams.map((team) => (
            <Card key={team.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>
                    <Link to={`/teams/${team.id}`} className="hover:underline">
                      {team.name}
                    </Link>
                  </CardTitle>
                  <CardDescription className="capitalize">Your role: {team.role}</CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/teams/${team.id}`}>Manage</Link>
                </Button>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
