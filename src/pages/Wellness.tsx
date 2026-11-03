import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, HeartPulse, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PositionBubble } from '../components/PlayerBits';
import { Button, ButtonLink, Card, CardHeader, EmptyState, Input, PageHeader } from '../components/ui';
import { WellnessGrid, type WellnessGridRow } from '../components/WellnessGrid';
import { latestResponsesOn } from '../db/forms';
import { sortPlayers } from '../db/players';
import { db } from '../db/schema';
import { useActiveTeam } from '../hooks/useActiveTeam';
import { capitalize, fmtDateLong, todayISO } from '../lib/format';
import { NoTeam } from './Dashboard';

/** Días del equipo con wellness (de un entrenamiento o de la encuesta pre-entreno), del más antiguo al más reciente. */
async function wellnessDates(teamId: string): Promise<string[]> {
  const sessions = await db.sessions.where('teamId').equals(teamId).toArray();
  const dateOf = new Map(sessions.map((s) => [s.id!, s.date]));
  const [withWellness, responses] = await Promise.all([
    db.attendance
      .where('sessionId')
      .anyOf([...dateOf.keys()])
      .filter((a) => !!a.wellness)
      .toArray(),
    db.formResponses.where('teamId').equals(teamId).filter((r) => r.kind === 'pre').toArray(),
  ]);
  const dates = new Set([...withWellness.map((a) => dateOf.get(a.sessionId)!), ...responses.map((r) => r.date)]);
  return [...dates].sort();
}

/** Wellness de cada jugadora en un día: lo del entrenamiento (puede estar corregido a mano) o, si no, la encuesta. */
async function loadDay(teamId: string, date: string) {
  const [players, sessions, responses] = await Promise.all([
    db.players.where('teamId').equals(teamId).filter((p) => !p.archived).toArray(),
    db.sessions.where('[teamId+date]').equals([teamId, date]).sortBy('startedAt'),
    latestResponsesOn(teamId, date),
  ]);
  const attendance = sessions.length ? await db.attendance.where('sessionId').anyOf(sessions.map((s) => s.id!)).toArray() : [];
  const order = new Map(sessions.map((s, i) => [s.id!, i]));
  attendance.sort((a, b) => order.get(a.sessionId)! - order.get(b.sessionId)!);
  const pre = new Map(responses.filter((r) => r.kind === 'pre').map((r) => [r.playerId, r]));

  const rows: WellnessGridRow[] = [];
  const missing: string[] = [];
  for (const p of sortPlayers(players)) {
    const att = attendance.find((a) => a.playerId === p.id && a.wellness) ?? attendance.find((a) => a.playerId === p.id);
    const form = pre.get(p.id!)?.values;
    const wellness = att?.wellness ?? form?.wellness;
    if (!wellness) {
      if (p.status !== 'baja') missing.push(p.name);
      continue;
    }
    rows.push({
      key: p.id!,
      label: (
        <Link to={`/jugadoras/${p.id}`} className="flex items-center gap-2 font-semibold whitespace-nowrap text-slate-900 hover:text-orange-700">
          <PositionBubble player={p} size="sm" />
          {p.name}
        </Link>
      ),
      wellness,
      discomfort: att?.discomfort ?? form?.discomfort,
      discomfortZone: form?.discomfortZone,
      note: att?.playerNote ?? form?.note,
    });
  }
  return { rows, missing, sessions };
}

export function WellnessPage() {
  const { team, teams } = useActiveTeam();
  const [picked, setPicked] = useState<string | null>(null);
  const dates = useLiveQuery(() => (team ? wellnessDates(team.id!) : Promise.resolve([])), [team?.id]);
  // Por defecto, hoy si hay datos; si no, el último día con datos.
  const today = todayISO();
  const date = picked ?? (dates && !dates.includes(today) && dates.length ? dates[dates.length - 1] : today);
  const day = useLiveQuery(() => (team ? loadDay(team.id!, date) : Promise.resolve(null)), [team?.id, date]);

  if (teams && !team) return <NoTeam />;
  if (!dates || !day) return null;

  const prev = [...dates].reverse().find((d) => d < date);
  const next = dates.find((d) => d > date);

  return (
    <>
      <PageHeader
        title="Wellness"
        subtitle="Lo que respondió cada jugadora, pregunta por pregunta (1 = muy mal, 10 = perfecto)"
        actions={
          <ButtonLink to="/encuestas" variant="secondary" size="sm">
            <Upload size={16} /> Subir encuesta
          </ButtonLink>
        }
      />

      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <Button variant="secondary" size="sm" disabled={!prev} onClick={() => prev && setPicked(prev)} title="Día anterior con datos">
          <ChevronLeft size={18} />
        </Button>
        <Input type="date" className="h-10 w-auto" value={date} max={today} onChange={(e) => e.target.value && setPicked(e.target.value)} />
        <Button variant="secondary" size="sm" disabled={!next} onClick={() => next && setPicked(next)} title="Día siguiente con datos">
          <ChevronRight size={18} />
        </Button>
        <span className="font-semibold text-slate-800">{capitalize(fmtDateLong(date))}</span>
        {day.sessions.map((s) => (
          <Link key={s.id} to={`/entreno/${s.id}`} className="text-sm font-semibold text-orange-700 underline">
            Ver informe del entreno
          </Link>
        ))}
      </Card>

      {day.rows.length === 0 ? (
        <Card>
          <EmptyState icon={<HeartPulse size={40} />} title="Sin wellness este día">
            {dates.length > 0 ? 'Usa las flechas para ir a otro día con respuestas.' : 'Sube la encuesta pre-entreno de Google Forms para verla aquí.'}
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <CardHeader title={`${day.rows.length} jugadoras respondieron`} subtitle="Rojo = zona de alerta · Ámbar = regular · Verde = bien" />
          <WellnessGrid rows={day.rows} showAverage showNotes />
          {day.missing.length > 0 && (
            <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">Sin responder: {day.missing.join(', ')}</p>
          )}
        </Card>
      )}
    </>
  );
}
