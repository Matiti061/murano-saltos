import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PositionBubble } from '../components/PlayerBits';
import { useToast } from '../components/Toast';
import { Button, Card, Field, Input, PageHeader, Segmented, Select, Textarea } from '../components/ui';
import { sortPlayers } from '../db/players';
import { db } from '../db/schema';
import { createManualSession, isPresent } from '../db/sessions';
import { ATTENDANCE_LABEL, SELECTABLE_SESSION_TYPES, SESSION_TYPE_LABEL, type AttendanceStatus, type Player, type SessionType } from '../db/types';
import { useActiveTeam } from '../hooks/useActiveTeam';
import { todayISO } from '../lib/format';
import { NoTeam } from './Dashboard';

interface Row {
  status: AttendanceStatus;
  jumps: string;
  minutes: string;
  rpe: string;
}

/** Para pasar a la app los entrenamientos contados a mano en papel. */
export function ManualEntry() {
  const { team, teams } = useActiveTeam();
  const navigate = useNavigate();
  const toast = useToast();
  const players = useLiveQuery(
    () =>
      team
        ? db.players.where('teamId').equals(team.id!).filter((p) => !p.archived).toArray().then(sortPlayers)
        : Promise.resolve([] as Player[]),
    [team?.id],
  );
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState<SessionType>('entrenamiento');
  const [duration, setDuration] = useState('120');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Record<number, Row>>({});

  useEffect(() => {
    if (!players) return;
    setRows((prev) => {
      const next = { ...prev };
      for (const p of players) next[p.id!] ??= { status: p.status === 'baja' ? 'ausente' : 'presente', jumps: '', minutes: '', rpe: '' };
      return next;
    });
  }, [players]);

  if (teams && !team) return <NoTeam />;
  if (!players) return null;

  const update = (id: number, changes: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...changes } }));

  const save = async () => {
    const durationMin = Number(duration);
    if (!date) return toast('Indica la fecha', 'warning');
    if (!durationMin) return toast('Indica la duración', 'warning');
    const sessionId = await createManualSession({
      teamId: team!.id!,
      date,
      type,
      durationMin,
      notes: notes.trim() || undefined,
      rows: players.map((p) => {
        const r = rows[p.id!];
        return {
          playerId: p.id!,
          status: r.status,
          jumps: Number(r.jumps) || 0,
          minutes: r.minutes ? Number(r.minutes) : undefined,
          rpe: r.rpe === '' ? undefined : Number(r.rpe),
        };
      }),
    });
    toast('Registro guardado', 'success');
    navigate(`/entreno/${sessionId}`, { replace: true });
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/historial" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> Historial
      </Link>
      <PageHeader
        title="Registro manual"
        subtitle="Introduce los totales de un entrenamiento contado en papel. Así el ACWR tiene histórico desde el primer día."
      />

      <Card className="mb-4 grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        <Field label="Fecha">
          <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Tipo">
          <Select value={type} onChange={(e) => setType(e.target.value as SessionType)}>
            {SELECTABLE_SESSION_TYPES.map((k) => (
              <option key={k} value={k}>
                {SESSION_TYPE_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Duración (min)">
          <Input type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} />
        </Field>
        <div className="col-span-2 sm:col-span-4">
          <Field label="Notas">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card className="mb-24">
        <ul className="divide-y divide-slate-100">
          {players.map((p) => {
            const r = rows[p.id!];
            if (!r) return null;
            const present = isPresent(r.status);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <PositionBubble player={p} size="sm" />
                <span className="min-w-[8rem] flex-1 font-semibold text-slate-900">{p.name}</span>
                <Segmented
                  size="sm"
                  value={r.status}
                  onChange={(s) => update(p.id!, { status: s })}
                  options={(Object.keys(ATTENDANCE_LABEL) as AttendanceStatus[]).map((k) => ({ value: k, label: ATTENDANCE_LABEL[k] }))}
                />
                {present && (
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label="Saltos"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className="h-9 w-24 text-sm font-semibold"
                      placeholder="Saltos"
                      value={r.jumps}
                      onChange={(e) => update(p.id!, { jumps: e.target.value })}
                    />
                    <Input
                      aria-label="Minutos"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className="h-9 w-20 text-sm"
                      placeholder={`${duration || '–'} min`}
                      value={r.minutes}
                      onChange={(e) => update(p.id!, { minutes: e.target.value })}
                    />
                    <Select aria-label="RPE" className="h-9 w-24 text-sm" value={r.rpe} onChange={(e) => update(p.id!, { rpe: e.target.value })}>
                      <option value="">RPE –</option>
                      {Array.from({ length: 11 }, (_, i) => (
                        <option key={i} value={i}>
                          RPE {i}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="fixed inset-x-0 bottom-[60px] z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-60">
        <div className="mx-auto flex max-w-4xl justify-end">
          <Button size="lg" onClick={save}>
            <Save size={18} /> Guardar registro
          </Button>
        </div>
      </div>
    </div>
  );
}
