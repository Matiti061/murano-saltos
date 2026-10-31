import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PositionBubble } from '../components/PlayerBits';
import { RpeSelector } from '../components/RpeSelector';
import { useToast } from '../components/Toast';
import { Button, Card, Field, Input, PageHeader, Textarea } from '../components/ui';
import { sortPlayers } from '../db/players';
import { db } from '../db/schema';
import { finishSession, isPresent } from '../db/sessions';
import type { Player } from '../db/types';

interface RowState {
  rpe?: number;
  minutes: string;
}

export function SessionFinish() {
  const id = useParams().id!;
  const navigate = useNavigate();
  const toast = useToast();
  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(id);
    if (!session) return null;
    const attendance = (await db.attendance.where('sessionId').equals(id).toArray()).filter((a) => isPresent(a.status));
    const players = (await db.players.bulkGet(attendance.map((a) => a.playerId))).filter((p): p is Player => !!p);
    return { session, attendance, players: sortPlayers(players) };
  }, [id]);

  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  // Rellena el formulario una sola vez con lo que ya haya guardado.
  useEffect(() => {
    if (!data || ready) return;
    const mins = data.session.durationMin ?? Math.max(1, Math.round((Date.now() - data.session.startedAt) / 60_000));
    setDuration(String(mins));
    setNotes(data.session.notes ?? '');
    const init: Record<string, RowState> = {};
    for (const a of data.attendance) {
      init[a.id!] = { rpe: a.rpe, minutes: a.minutes != null ? String(a.minutes) : a.status === 'parcial' ? '' : String(mins) };
    }
    setRows(init);
    setReady(true);
  }, [data, ready]);

  if (!data || !ready) return null;

  const setDurationAll = (value: string) => {
    // Las jugadoras que tenían la duración completa se actualizan con la nueva duración.
    setRows((prev) => {
      const next = { ...prev };
      for (const a of data.attendance) {
        if (a.status !== 'parcial' && next[a.id!].minutes === duration) next[a.id!] = { ...next[a.id!], minutes: value };
      }
      return next;
    });
    setDuration(value);
  };

  const save = async () => {
    const durationMin = Number(duration);
    if (!durationMin || durationMin <= 0) return toast('Indica la duración del entrenamiento', 'warning');
    setSaving(true);
    await finishSession(id, {
      durationMin,
      notes,
      rows: data.attendance.map((a) => {
        const r = rows[a.id!];
        return { attendanceId: a.id!, rpe: r.rpe, minutes: r.minutes === '' ? undefined : Number(r.minutes) };
      }),
    });
    toast('Entrenamiento guardado', 'success');
    navigate(`/entreno/${id}`, { replace: true });
  };

  const missingRpe = data.attendance.filter((a) => rows[a.id!]?.rpe == null).length;

  return (
    <div className="mx-auto max-w-3xl">
      <Link to={`/entreno/${id}/vivo`} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> Volver al conteo
      </Link>
      <PageHeader title="Finalizar entrenamiento" subtitle="Duración, esfuerzo percibido (RPE) y notas" />

      <Card className="mb-4 grid gap-4 p-4 sm:grid-cols-[180px_1fr]">
        <Field label="Duración (minutos)">
          <Input type="number" inputMode="numeric" min={1} value={duration} onChange={(e) => setDurationAll(e.target.value)} />
        </Field>
        <Field label="Notas del entrenamiento">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contenidos, incidencias, sensaciones del grupo…" />
        </Field>
      </Card>

      <Card className="mb-28">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-900">RPE de la sesión</h2>
          <p className="text-sm text-slate-500">
            Pregunta a cada jugadora «¿Cómo de duro ha sido el entrenamiento?» de 0 (reposo) a 10 (máximo). Lo ideal es
            preguntarlo unos 15-30 minutos después de terminar. Se puede completar más tarde desde el informe.
          </p>
        </div>
        <ul className="divide-y divide-slate-100">
          {data.players.map((p) => {
            const a = data.attendance.find((x) => x.playerId === p.id)!;
            const r = rows[a.id!];
            return (
              <li key={p.id} className="px-4 py-3">
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <PositionBubble player={p} size="sm" />
                  <span className="flex-1 font-semibold text-slate-900">
                    {p.name}
                    <span className="ml-2 text-sm font-normal text-slate-500">{a.jumps} saltos</span>
                  </span>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500">
                    Minutos
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className="h-9 w-20 text-sm"
                      value={r.minutes}
                      onChange={(e) => setRows((prev) => ({ ...prev, [a.id!]: { ...r, minutes: e.target.value } }))}
                    />
                  </label>
                </div>
                <RpeSelector compact value={r.rpe} onChange={(v) => setRows((prev) => ({ ...prev, [a.id!]: { ...r, rpe: v } }))} />
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="fixed inset-x-0 bottom-[60px] z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-60">
        <div className="mx-auto flex max-w-3xl items-center justify-end gap-3">
          {missingRpe > 0 && <p className="mr-auto text-sm text-slate-500">{missingRpe} sin RPE</p>}
          <Button size="lg" variant="success" onClick={save} disabled={saving}>
            <Check size={18} /> Guardar y ver informe
          </Button>
        </div>
      </div>
    </div>
  );
}
