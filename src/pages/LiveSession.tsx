import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Flag, ListChecks, Plus, Square, Undo2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ComplaintForm } from '../components/ComplaintForm';
import { LiveCard } from '../components/LiveCard';
import { SyncStatus } from '../components/SyncStatus';
import { Modal } from '../components/Modal';
import { PositionBubble, PositionHeader } from '../components/PlayerBits';
import { useToast } from '../components/Toast';
import { Button, ButtonLink, Card, cx, EmptyState, Input, Segmented } from '../components/ui';
import { isActiveComplaint } from '../db/complaints';
import { groupByPosition, sortPlayers } from '../db/players';
import { db } from '../db/schema';
import {
  addJump,
  endOpenBlock,
  isPresent,
  removeLastJump,
  reopenSession,
  setAttendanceStatus,
  startBlock,
} from '../db/sessions';
import { updateSettings, useSettings } from '../db/settings';
import { ATTENDANCE_LABEL, SESSION_TYPE_LABEL, type AttendanceStatus, type Player } from '../db/types';
import { useNow } from '../hooks/useNow';
import { useWakeLock } from '../hooks/useWakeLock';
import { fmtElapsed, jumpsLabel } from '../lib/format';
import { countEvents, mergeBlockJumps, totalJumps } from '../lib/jumps';
import { limitState } from '../lib/metrics';


function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Sin vibración disponible.
  }
}

async function loadLive(sessionId: string) {
  const session = await db.sessions.get(sessionId);
  if (!session) return null;
  const [team, attendance, blocks] = await Promise.all([
    db.teams.get(session.teamId),
    db.attendance.where('sessionId').equals(sessionId).toArray(),
    db.blocks.where('sessionId').equals(sessionId).sortBy('order'),
  ]);
  const teamPlayers = await db.players.where('teamId').equals(session.teamId).toArray();
  const playersById = new Map(teamPlayers.map((p) => [p.id!, p]));
  // Jugadoras de la sesión que ya no estén en el equipo.
  const missing = attendance.filter((a) => !playersById.has(a.playerId)).map((a) => a.playerId);
  for (const p of await db.players.bulkGet(missing)) if (p) playersById.set(p.id!, p);

  const openBlock = blocks.filter((b) => b.endedAt == null).sort((a, b) => b.startedAt - a.startedAt)[0];

  // Los totales se calculan con todos los toques de la sesión (también los que llegan de otro
  // dispositivo al sincronizar) más lo ya compactado y el ajuste manual.
  const events = await db.jumpEvents.where('sessionId').equals(sessionId).toArray();
  const pending = countEvents(events);
  const perPlayer = new Map(attendance.map((a) => [a.playerId, mergeBlockJumps(a.blockJumps, pending.get(a.playerId))]));
  const live = attendance.map((a) => {
    const pendingCount = Object.values(pending.get(a.playerId) ?? {}).reduce((x, y) => x + y, 0);
    return { ...a, jumps: totalJumps(a, pendingCount) };
  });

  const blockCounts = new Map<string, number>();
  const blockTotals = new Map<string, number>();
  for (const [playerId, rec] of perPlayer) {
    if (openBlock) blockCounts.set(playerId, rec[openBlock.id!] ?? 0);
    for (const b of blocks) blockTotals.set(b.id!, (blockTotals.get(b.id!) ?? 0) + (rec[b.id!] ?? 0));
  }
  const complaints = await db.complaints.where('playerId').anyOf([...playersById.keys()]).filter(isActiveComplaint).toArray();
  return {
    session,
    team,
    attendance: live,
    blocks,
    openBlock,
    blockCounts,
    blockTotals,
    playersById,
    teamPlayers: sortPlayers(teamPlayers.filter((p) => !p.archived)),
    complainingIds: new Set(complaints.map((c) => c.playerId)),
  };
}

export function LiveSession() {
  const id = useParams().id!;
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useSettings();
  const now = useNow(1000);
  const data = useLiveQuery(() => loadLive(id).then((d) => d ?? null), [id]);
  const [flashes, setFlashes] = useState<Record<string, number>>({});
  const [complaintPlayer, setComplaintPlayer] = useState<Player | undefined>();
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [saveCustom, setSaveCustom] = useState(true);

  useWakeLock(data?.session.status === 'en_curso');

  // Siempre agrupadas por posición: es lo que mira quien cuenta desde fuera de la pista.
  const cards = useMemo(() => {
    if (!data) return [];
    return data.attendance
      .filter((a) => isPresent(a.status))
      .map((a) => ({ attendance: a, player: data.playersById.get(a.playerId)! }))
      .filter((c) => c.player);
  }, [data]);
  const groups = useMemo(() => groupByPosition(cards, (c) => c.player), [cards]);

  const tap = useCallback(
    async (player: Player, limit?: number) => {
      setFlashes((f) => ({ ...f, [player.id!]: (f[player.id!] ?? 0) + 1 }));
      vibrate(20);
      const total = await addJump(id, player.id!);
      if (limit) {
        const warnAt = Math.ceil((limit * settings.limitWarnPct) / 100);
        if (total === limit) {
          vibrate([250, 120, 250]);
          toast(`${player.name} ha llegado a su límite (${limit} saltos)`, 'error');
        } else if (total === warnAt) {
          vibrate([120, 80, 120]);
          toast(`${player.name} está al ${settings.limitWarnPct}% de su límite`, 'warning');
        }
      }
    },
    [id, settings.limitWarnPct, toast],
  );

  if (data === undefined) return null;
  if (data === null) {
    return (
      <div className="p-6">
        <Card>
          <EmptyState title="Entrenamiento no encontrado">
            <Link to="/" className="text-orange-700 underline">
              Volver al panel
            </Link>
          </EmptyState>
        </Card>
      </div>
    );
  }

  const { session, team, openBlock, blocks, blockTotals } = data;
  const finished = session.status === 'finalizado';
  const totalJumps = cards.reduce((a, c) => a + c.attendance.jumps, 0);

  const undo = async () => {
    const res = await removeLastJump(id);
    if (!res) return toast('No hay saltos que deshacer');
    vibrate(40);
    const p = data.playersById.get(res.playerId);
    toast(`Deshecho: −1 a ${p?.name ?? 'jugadora'} (${res.total})`);
  };

  const minus = async (player: Player) => {
    const res = await removeLastJump(id, player.id!);
    if (!res) return toast(`${player.name} no tiene saltos`);
    vibrate(40);
    toast(`−1 a ${player.name} (${res.total})`);
  };

  const begin = async (name: string) => {
    if (!name.trim()) return;
    await startBlock(id, name);
    vibrate(30);
    toast(`Ejercicio: ${name}`, 'success');
  };

  const exerciseChips = [...new Set([...settings.exercises])];

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Barra superior */}
      <header className="sticky top-0 z-30 bg-orange-600 text-white shadow-md">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
          <Link to="/" className="rounded-lg p-2 hover:bg-white/10" aria-label="Volver al panel (el entrenamiento sigue abierto)">
            <ArrowLeft size={22} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-orange-100">
              {team?.name} · {SESSION_TYPE_LABEL[session.type]}
            </p>
            <p className="text-xl leading-tight font-bold tabular-nums">
              {finished ? 'Finalizado' : fmtElapsed(now - session.startedAt)}
              <span className="ml-3 text-base font-semibold text-orange-100">{jumpsLabel(totalJumps)}</span>
            </p>
          </div>
          <SyncStatus compact onDark />
          <Button variant="secondary" onClick={undo} className="border-0" disabled={finished}>
            <Undo2 size={18} /> <span className="hidden sm:inline">Deshacer</span>
          </Button>
          <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => setAttendanceOpen(true)}>
            <ListChecks size={18} /> <span className="hidden md:inline">Asistencia</span>
          </Button>
          {!finished && (
            <Button variant="success" onClick={() => navigate(`/entreno/${id}/finalizar`)}>
              <Flag size={18} /> Finalizar
            </Button>
          )}
        </div>

        {/* Ejercicio actual */}
        <div className="border-t border-white/10 bg-orange-700 px-3 py-2 sm:px-4">
          <div className="flex flex-wrap items-center gap-2">
            {openBlock ? (
              <>
                <span className="rounded-lg bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">EN CURSO</span>
                <span className="font-semibold">
                  {openBlock.order}. {openBlock.name}
                </span>
                <span className="text-sm text-orange-100 tabular-nums">
                  {fmtElapsed(now - openBlock.startedAt)} · {jumpsLabel(blockTotals.get(openBlock.id!) ?? 0)}
                </span>
                <Button size="sm" variant="ghost" className="ml-auto text-white hover:bg-white/10" onClick={() => endOpenBlock(id)}>
                  <Square size={14} /> Terminar ejercicio
                </Button>
              </>
            ) : (
              <span className="text-sm text-orange-100">
                Sin ejercicio activo: elige uno para ver los saltos por ejercicio (los saltos se cuentan igual).
              </span>
            )}
          </div>
          {!finished && (
            <div className="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {exerciseChips.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => begin(name)}
                  className={cx(
                    'shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap',
                    openBlock?.name === name ? 'bg-white text-orange-700' : 'bg-white/10 text-white hover:bg-white/20',
                  )}
                >
                  {name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setCustomName('');
                  setCustomOpen(true);
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/30 px-3 py-1.5 text-sm font-semibold text-white"
              >
                <Plus size={14} /> Otro
              </button>
            </div>
          )}
        </div>
      </header>

      {finished && (
        <div className="m-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 sm:mx-4">
          <p className="text-sm font-semibold text-amber-900">Esta sesión ya está finalizada.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => reopenSession(id)}>
              Reabrir para seguir contando
            </Button>
            <ButtonLink size="sm" to={`/entreno/${id}`}>
              Ver informe
            </ButtonLink>
          </div>
        </div>
      )}

      <main className="p-3 pb-24 sm:p-4">
        {blocks.some((b) => b.endedAt) && (
          <p className="mb-3 truncate text-xs text-slate-500">
            Hechos:{' '}
            {blocks
              .filter((b) => b.endedAt)
              .map((b) => `${b.name} (${blockTotals.get(b.id!) ?? 0})`)
              .join(' · ')}
          </p>
        )}

        {cards.length === 0 ? (
          <Card>
            <EmptyState title="No hay jugadoras presentes">
              Marca la asistencia para empezar a contar.
              <div className="mt-3">
                <Button onClick={() => setAttendanceOpen(true)}>Asistencia</Button>
              </div>
            </EmptyState>
          </Card>
        ) : (
          <div className={cx('space-y-5', finished && 'pointer-events-none opacity-60')}>
            {groups.map(({ position, items }) => (
              <section key={position}>
                <div className="mb-2">
                  <PositionHeader
                    position={position}
                    count={items.length}
                    action={
                      <span className="text-sm font-semibold text-slate-500 tabular-nums">
                        {jumpsLabel(items.reduce((a, c) => a + c.attendance.jumps, 0))}
                      </span>
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {items.map(({ player, attendance }) => {
                    const limit = attendance.jumpLimit ?? player.jumpLimit;
                    return (
                      <LiveCard
                        key={player.id}
                        player={player}
                        attendance={attendance}
                        blockJumps={data.blockCounts.get(player.id!) ?? 0}
                        showBlock={!!openBlock}
                        limit={limit}
                        state={limitState(attendance.jumps, limit, settings.limitWarnPct)}
                        flashKey={flashes[player.id!] ?? 0}
                        hasComplaint={data.complainingIds.has(player.id!)}
                        onTap={() => tap(player, limit)}
                        onMinus={() => minus(player)}
                        onComplaint={() => setComplaintPlayer(player)}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <ComplaintForm
        open={!!complaintPlayer}
        onClose={() => setComplaintPlayer(undefined)}
        player={complaintPlayer}
        sessionId={id}
      />

      <Modal open={customOpen} onClose={() => setCustomOpen(false)} title="Nuevo ejercicio"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCustomOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                const name = customName.trim();
                if (!name) return;
                if (saveCustom && !settings.exercises.includes(name)) {
                  await updateSettings({ exercises: [...settings.exercises, name] });
                }
                await begin(name);
                setCustomOpen(false);
              }}
            >
              Empezar
            </Button>
          </>
        }
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <Input autoFocus value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Ej.: Contraataque, 3x3, Saque táctico…" />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={saveCustom} onChange={(e) => setSaveCustom(e.target.checked)} className="h-4 w-4" />
            Guardarlo en la lista de ejercicios
          </label>
        </form>
      </Modal>

      <Modal open={attendanceOpen} onClose={() => setAttendanceOpen(false)} title="Asistencia" wide>
        <p className="mb-3 text-sm text-slate-500">
          Marca a quien llega tarde o se retira. Los saltos ya contados no se borran.
        </p>
        <ul className="divide-y divide-slate-100">
          {data.teamPlayers.map((p) => {
            const att = data.attendance.find((a) => a.playerId === p.id);
            const status: AttendanceStatus = att?.status ?? 'ausente';
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <PositionBubble player={p} size="sm" />
                <span className="min-w-[8rem] flex-1 font-semibold text-slate-800">{p.name}</span>
                <Segmented
                  size="sm"
                  value={status}
                  onChange={(s) => setAttendanceStatus(id, p.id!, s)}
                  options={(Object.keys(ATTENDANCE_LABEL) as AttendanceStatus[]).map((k) => ({ value: k, label: ATTENDANCE_LABEL[k] }))}
                />
              </li>
            );
          })}
        </ul>
      </Modal>
    </div>
  );
}
