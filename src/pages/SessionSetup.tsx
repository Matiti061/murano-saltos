import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ArrowRight, ClipboardList, Play, SkipForward, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PositionBubble, PositionHeader, StatusBadge } from '../components/PlayerBits';
import { useToast } from '../components/Toast';
import { Badge, Button, ButtonLink, Card, EmptyState, Input, PageHeader, Segmented } from '../components/ui';
import { isWellnessComplete, WellnessForm } from '../components/WellnessForm';
import { groupByPosition, sortPlayers } from '../db/players';
import { db } from '../db/schema';
import { createLiveSession, getActiveSession, isPresent } from '../db/sessions';
import { ATTENDANCE_LABEL, type AttendanceStatus, type Player, type SessionType, type Wellness } from '../db/types';
import { useActiveTeam } from '../hooks/useActiveTeam';
import { NoTeam } from './Dashboard';

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; activeClass: string }[] = [
  { value: 'presente', label: ATTENDANCE_LABEL.presente, activeClass: 'bg-emerald-600 text-white shadow-sm' },
  { value: 'parcial', label: ATTENDANCE_LABEL.parcial, activeClass: 'bg-sky-600 text-white shadow-sm' },
  { value: 'ausente', label: ATTENDANCE_LABEL.ausente, activeClass: 'bg-slate-600 text-white shadow-sm' },
  { value: 'lesionada', label: ATTENDANCE_LABEL.lesionada, activeClass: 'bg-red-600 text-white shadow-sm' },
];

interface Row {
  status: AttendanceStatus;
  limit: string;
  wellness: Partial<Wellness>;
}

export function SessionSetup() {
  const { team, teams } = useActiveTeam();
  const navigate = useNavigate();
  const toast = useToast();
  const players = useLiveQuery(
    () =>
      team
        ? db.players
            .where('teamId')
            .equals(team.id!)
            .filter((p) => !p.archived && p.status !== 'baja')
            .toArray()
            .then(sortPlayers)
        : Promise.resolve([] as Player[]),
    [team?.id],
  );
  const active = useLiveQuery(() => getActiveSession(team?.id), [team?.id]);

  const [type, setType] = useState<SessionType>('entrenamiento');
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [step, setStep] = useState<'asistencia' | 'wellness'>('asistencia');
  const [wIndex, setWIndex] = useState(0);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!players) return;
    setRows((prev) => {
      const next = { ...prev };
      for (const p of players) {
        next[p.id!] ??= { status: p.status === 'lesionada' ? 'lesionada' : 'presente', limit: '', wellness: {} };
      }
      return next;
    });
  }, [players]);

  const present = useMemo(() => (players ?? []).filter((p) => rows[p.id!] && isPresent(rows[p.id!].status)), [players, rows]);

  if (teams && !team) return <NoTeam />;
  if (!players) return null;

  const update = (id: string, changes: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...changes } }));

  const start = async () => {
    if (present.length === 0) return toast('Marca al menos una jugadora como presente', 'warning');
    setStarting(true);
    const id = await createLiveSession(
      team!.id!,
      type,
      players.map((p) => {
        const r = rows[p.id!];
        return {
          playerId: p.id!,
          status: r.status,
          jumpLimit: r.limit ? Number(r.limit) : undefined,
          wellness: isWellnessComplete(r.wellness) ? r.wellness : undefined,
        };
      }),
    );
    navigate(`/entreno/${id}/vivo`);
  };

  if (players.length === 0) {
    return (
      <Card>
        <EmptyState icon={<Users size={40} />} title="Primero añade jugadoras">
          <div className="mt-4">
            <ButtonLink to="/jugadoras">Ir a jugadoras</ButtonLink>
          </div>
        </EmptyState>
      </Card>
    );
  }

  if (step === 'wellness' && present.length > 0) {
    const p = present[Math.min(wIndex, present.length - 1)];
    const done = present.filter((pl) => isWellnessComplete(rows[pl.id!]?.wellness)).length;
    const isLast = wIndex === present.length - 1;
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => setStep('asistencia')}>
            <ArrowLeft size={18} /> Asistencia
          </Button>
          <Badge tone="brand">
            {wIndex + 1} de {present.length} · {done} completados
          </Badge>
        </div>
        <Card className="p-5 sm:p-8">
          <p className="text-sm font-semibold text-orange-700">Wellness antes de entrenar</p>
          <div className="mt-2 mb-6 flex items-center gap-3">
            <PositionBubble player={p} size="lg" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{p.name}</h1>
              <p className="text-slate-500">¿Cómo llegas hoy?</p>
            </div>
          </div>
          <WellnessForm large value={rows[p.id!].wellness} onChange={(w) => update(p.id!, { wellness: w })} />
          <div className="mt-8 flex flex-wrap justify-between gap-2">
            <Button variant="secondary" size="lg" disabled={wIndex === 0} onClick={() => setWIndex(wIndex - 1)}>
              <ArrowLeft size={18} /> Anterior
            </Button>
            <div className="flex gap-2">
              {!isLast && (
                <Button variant="ghost" size="lg" onClick={() => setWIndex(wIndex + 1)}>
                  <SkipForward size={18} /> Saltar
                </Button>
              )}
              {isLast ? (
                <Button size="lg" variant="success" onClick={start} disabled={starting}>
                  <Play size={18} /> Empezar a contar
                </Button>
              ) : (
                <Button size="lg" onClick={() => setWIndex(wIndex + 1)}>
                  Siguiente <ArrowRight size={18} />
                </Button>
              )}
            </div>
          </div>
        </Card>
        <p className="mt-4 text-center text-sm text-slate-500">
          Puedes pasar la tablet a cada jugadora. Las que no respondan se quedan sin wellness.{' '}
          <button type="button" className="font-semibold text-orange-700 underline" onClick={start}>
            Empezar ya
          </button>
        </p>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Nuevo entrenamiento" subtitle={team?.name} />

      {active && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Ya hay una sesión en curso para este equipo.</p>
          <ButtonLink to={`/entreno/${active.id}/vivo`} variant="primary" size="sm">
            Continuar esa sesión
          </ButtonLink>
        </Card>
      )}

      <Card className="mb-4 p-4">
        <p className="mb-2 text-sm font-medium text-slate-700">Tipo de sesión</p>
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: 'entrenamiento', label: 'Entrenamiento' },
            { value: 'fisico', label: 'Físico' },
          ]}
        />
      </Card>

      <Card className="mb-24">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="font-semibold text-slate-900">Asistencia</h2>
            <p className="text-sm text-slate-500">
              {present.length} de {players.length} entrenan hoy
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => players.forEach((p) => update(p.id!, { status: 'presente' }))}
          >
            Todas presentes
          </Button>
        </div>
        {groupByPosition(players, (p) => p).map(({ position, items }) => (
          <section key={position}>
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2">
              <PositionHeader position={position} count={items.length} />
            </div>
            <ul className="divide-y divide-slate-100">
              {items.map((p) => {
                const r = rows[p.id!];
                if (!r) return null;
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <PositionBubble player={p} />
                    <div className="min-w-[8rem] flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-slate-900">{p.name}</span>
                        <StatusBadge status={p.status} />
                      </div>
                    </div>
                    <Segmented size="sm" value={r.status} onChange={(s) => update(p.id!, { status: s })} options={STATUS_OPTIONS} />
                    {isPresent(r.status) && (
                      <label className="flex items-center gap-1.5 text-xs whitespace-nowrap text-slate-500">
                        Límite hoy
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          className="h-9 w-20 text-sm"
                          placeholder={p.jumpLimit ? String(p.jumpLimit) : '–'}
                          value={r.limit}
                          onChange={(e) => update(p.id!, { limit: e.target.value })}
                        />
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </Card>

      <div className="fixed inset-x-0 bottom-[60px] z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-2">
          <Link to="/" className="mr-auto hidden text-sm font-semibold text-slate-500 sm:block">
            Cancelar
          </Link>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => {
              if (present.length === 0) return toast('Marca al menos una jugadora como presente', 'warning');
              setWIndex(0);
              setStep('wellness');
            }}
          >
            <ClipboardList size={18} /> Wellness primero
          </Button>
          <Button size="lg" variant="success" onClick={start} disabled={starting}>
            <Play size={18} /> Empezar a contar
          </Button>
        </div>
      </div>
    </>
  );
}
