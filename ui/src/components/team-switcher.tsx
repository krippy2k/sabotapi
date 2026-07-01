import { Users } from 'lucide-react';
import { useTeam } from '@/lib/team-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export function TeamSwitcher() {
  const { teams, activeTeam, loading, setActiveTeam } = useTeam();

  if (loading) {
    return (
      <Button variant="outline" size="sm" disabled className="max-w-[200px]">
        Loading teams…
      </Button>
    );
  }

  if (teams.length === 0) {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link to="/teams">Create team</Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-[220px] truncate">
          <Users className="w-4 h-4 mr-2 shrink-0" />
          <span className="truncate">{activeTeam?.name ?? 'Select team'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Teams</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {teams.map((team) => (
          <DropdownMenuItem
            key={team.id}
            onClick={() => setActiveTeam(team.id)}
            className={team.id === activeTeam?.id ? 'bg-accent' : ''}
          >
            <span className="truncate">{team.name}</span>
            <span className="ml-auto text-xs text-muted-foreground capitalize">{team.role}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/teams">Manage teams</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
