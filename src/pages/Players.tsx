import { Archive, HeartPulse, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AcwrBadge } from '../components/AcwrBadge';
import { NumberBubble, StatusBadge } from '../components/PlayerBits';
import { PlayerForm } from '../components/PlayerForm';
import { Badge, Button, Card, EmptyState, PageHeader } from '../components/ui';
import { useActiveTeam } from '../hooks/useActiveTeam';
import { useTeamLoad } from '../hooks/useTeamLoad';
import { NoTeam } from './Dashboard';

export function Players() {
  const { team, teams } = useActiveTeam();
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const summary = useTeamLoad(team?.id, showArchived);

  if (teams && !team) return <NoTeam />;
  const visible = summary?.filter((s) => showArchived || !s.player.archived) ?? [];

  return (
    <>
      <PageHeader
        title="Jugadoras"
        subtitle={team ? `${team.name} · ${visible.filter((s) => !s.player.archived).length} jugadoras` : undefined}
        actions={
          <>
            <Button variant="ghost" onClick={() => setShowArchived(!showArchived)}>
              <Archive size={18} />
              {showArchived ? 'Ocultar archivadas' : 'Ver archivadas'}
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus size={18} /> Añadir jugadora
            </Button>
          </>
        }
      />

      {summary && visible.length === 0 ? (
        <Card>
          <EmptyState icon={<Users size={40} />} title="Todavía no hay jugadoras">
            Añade a las jugadoras del equipo con su nombre, dorsal y posición.
            <div className="mt-4">
              <Button onClick={() => setFormOpen(true)}>
                <Plus size={18} /> Añadir la primera
              </Button>
            </div>
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(({ player, acwrJumps, jumps7d, activeComplaints }) => (
            <Link key={player.id} to={`/jugadoras/${player.id}`}>
              <Card className={`flex items-center gap-3 p-4 transition-shadow hover:shadow-md ${player.archived ? 'opacity-60' : ''}`}>
                <NumberBubble player={player} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate font-semibold text-slate-900">{player.name}</p>
                    <StatusBadge status={player.status} />
                    {player.archived ? <Badge>Archivada</Badge> : null}
                  </div>
                  <p className="text-sm text-slate-500">
                    {player.position}
                    {player.jumpLimit ? ` · límite ${player.jumpLimit}` : ''}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <span className="tabular-nums">{jumps7d} saltos en 7 días</span>
                    {activeComplaints.length > 0 && (
                      <Badge tone="red">
                        <HeartPulse size={12} /> {activeComplaints.length}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="mb-1 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">ACWR</p>
                  <AcwrBadge result={acwrJumps} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {team && <PlayerForm open={formOpen} onClose={() => setFormOpen(false)} teamId={team.id!} />}
    </>
  );
}
