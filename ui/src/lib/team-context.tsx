import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { trpc } from '@/lib/trpc';

const ACTIVE_TEAM_KEY = 'sabotapi-active-team-id';

type TeamListItem = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  role: 'admin' | 'user';
  membership_id: string;
};

type TeamContextType = {
  teams: TeamListItem[];
  activeTeamId: string | null;
  activeTeam: TeamListItem | null;
  loading: boolean;
  setActiveTeam: (teamId: string | null) => void;
  refetchTeams: () => Promise<void>;
};

const TeamContext = createContext<TeamContextType>({
  teams: [],
  activeTeamId: null,
  activeTeam: null,
  loading: true,
  setActiveTeam: () => {},
  refetchTeams: async () => {},
});

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isAnonymous = user?.isAnonymous ?? false;
  const [activeTeamId, setActiveTeamIdState] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_TEAM_KEY)
  );

  const teamsQuery = trpc.team.list.useQuery(undefined, {
    enabled: !!user && !isAnonymous,
  });

  const teams = teamsQuery.data ?? [];
  const activeTeam = teams.find((t) => t.id === activeTeamId) ?? null;

  const setActiveTeam = useCallback((teamId: string | null) => {
    setActiveTeamIdState(teamId);
    if (teamId) {
      localStorage.setItem(ACTIVE_TEAM_KEY, teamId);
    } else {
      localStorage.removeItem(ACTIVE_TEAM_KEY);
    }
  }, []);

  useEffect(() => {
    if (!teamsQuery.data?.length) return;
    const stillMember = activeTeamId && teamsQuery.data.some((t) => t.id === activeTeamId);
    if (!stillMember) {
      setActiveTeam(teamsQuery.data[0].id);
    }
  }, [teamsQuery.data, activeTeamId, setActiveTeam]);

  const refetchTeams = useCallback(async () => {
    await teamsQuery.refetch();
  }, [teamsQuery]);

  return (
    <TeamContext.Provider
      value={{
        teams,
        activeTeamId,
        activeTeam,
        loading: teamsQuery.isLoading,
        setActiveTeam,
        refetchTeams,
      }}
    >
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  return useContext(TeamContext);
}
