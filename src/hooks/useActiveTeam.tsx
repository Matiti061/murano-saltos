import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { db } from '../db/schema';
import type { Team } from '../db/types';

const STORAGE_KEY = 'murano.teamId';

interface TeamContextValue {
  /** undefined mientras carga. */
  teams: Team[] | undefined;
  team: Team | undefined;
  teamId: string | undefined;
  setTeamId: (id: string) => void;
}

const TeamContext = createContext<TeamContextValue>({
  teams: undefined,
  team: undefined,
  teamId: undefined,
  setTeamId: () => {},
});

function readStored(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function TeamProvider({ children }: { children: ReactNode }) {
  const teams = useLiveQuery(() => db.teams.toArray().then((ts) => ts.sort((a, b) => a.name.localeCompare(b.name, 'es'))), []);
  const [selected, setSelected] = useState<string | undefined>(readStored);

  const setTeamId = useCallback((id: string) => {
    setSelected(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Sin almacenamiento local: la selección dura lo que dure la pestaña.
    }
  }, []);

  const value = useMemo<TeamContextValue>(() => {
    const team = teams?.find((t) => t.id === selected) ?? teams?.find((t) => !t.demo) ?? teams?.[0];
    return { teams, team, teamId: team?.id, setTeamId };
  }, [teams, selected, setTeamId]);

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useActiveTeam() {
  return useContext(TeamContext);
}
