import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [accepted, setAccepted] = useState(false);

  const previewQuery = trpc.invite.preview.useQuery(
    { token: token! },
    { enabled: !!token, retry: false }
  );

  const acceptMutation = trpc.invite.accept.useMutation({
    onSuccess: (data) => {
      setAccepted(true);
      setTimeout(() => navigate(`/teams/${data.teamId}`), 1500);
    },
  });
  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Invalid invite</CardTitle>
            <CardDescription>This invite link is missing a token.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (previewQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (previewQuery.isError) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Invite unavailable</CardTitle>
            <CardDescription>{previewQuery.error.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/">Go home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const preview = previewQuery.data;
  const needsSignIn = !user || user.isAnonymous;
  const emailMismatch =
    user &&
    !user.isAnonymous &&
    user.email &&
    user.email.toLowerCase() !== preview.email.toLowerCase();

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Join {preview.teamName}</CardTitle>
          <CardDescription>
            You&apos;ve been invited as <span className="capitalize font-medium">{preview.role}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Invite sent to <strong>{preview.email}</strong>
          </p>
          {preview.projects.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Projects: {preview.projects.map((p) => p.name).join(', ')}
            </p>
          ) : null}

          {accepted ? (
            <p className="text-sm text-green-600">Joined! Redirecting…</p>
          ) : needsSignIn ? (
            <p className="text-sm">
              Sign in with <strong>{preview.email}</strong> to accept this invite.
            </p>
          ) : emailMismatch ? (
            <p className="text-sm text-destructive">
              You&apos;re signed in as {user.email}. Sign in with {preview.email} to accept.
            </p>
          ) : (
            <>
              {acceptMutation.isError ? (
                <p className="text-sm text-destructive">{acceptMutation.error.message}</p>
              ) : null}
              <Button
                className="w-full"
                onClick={() => void acceptMutation.mutateAsync({ token })}
                disabled={acceptMutation.isPending}
              >
                {acceptMutation.isPending ? 'Joining…' : 'Accept invite'}
              </Button>
            </>
          )}

          <Button variant="outline" className="w-full" asChild>
            <Link to="/">Go home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
