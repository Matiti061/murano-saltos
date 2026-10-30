import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarDays, ChevronRight, NotebookPen, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, ButtonLink, Card, EmptyState, Field, Input, PageHeader, Select } from '../components/ui';
import { db } from '../db/schema';
import { isPresent } from '../db/sessions';
import { SELECTABLE_SESSION_TYPES, SESSION_TYPE_LABEL, type SessionType } from '../db/types';
import { useActiveTeam } from '../hooks/useActiveTeam';
import { capitalize, fmtDateLong, fmtTime } from '../lib/format';
import { NoTeam } from './Dashboard';

export function History() {
  const { team, teams } = useActiveTeam();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [type, setType] = useState<SessionType | ''>('');

  const sessions = useLiveQuery(async () => {
    if (!team) return [];
    const list = await db.sessions.where('teamId').equals(team.id!).toArray();
    const filtered = list
      .filter((s) => (!from || s.date >= from) && (!to || s.date <= to) && (!type || s.type === type))
      .sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt);
    const atts = await db.attendance.where('sessionId').anyOf(filtered.map((s) => s.id!)).toArray();
    return filtered.map((s) => {
      const mine = atts.filter((a) => a.sessionId === s.id && isPresent(a.status));
      return { session: s, present: mine.length, jumps: mine.reduce((acc, a) => acc + a.jumps, 0) };
    });
  }, [team?.id, from, to, type]);

  if (teams && !team) return <NoTeam />;

  return (
    <>
      <PageHeader
        title="Historial"
        subtitle={team?.name}
        actions={
          <>
            <ButtonLink to="/historial/manual" variant="secondary">
              <NotebookPen size={18} /> Registro manual
            </ButtonLink>
            <ButtonLink to="/entreno/nuevo">
              <Plus size={18} /> Nuevo entrenamiento
            </ButtonLink>
          </>
        }
      />

      <Card className="mb-4 grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <Field label="Desde">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Tipo">
          <Select value={type} onChange={(e) => setType(e.target.value as SessionType | '')}>
            <option value="">Todos</option>
            {SELECTABLE_SESSION_TYPES.map((k) => (
              <option key={k} value={k}>
                {SESSION_TYPE_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <Button
            variant="ghost"
            onClick={() => {
              setFrom('');
              setTo('');
              setType('');
            }}
          >
            Limpiar filtros
          </Button>
        </div>
      </Card>

      <Card>
        {sessions && sessions.length === 0 ? (
          <EmptyState icon={<CalendarDays size={40} />} title="No hay entrenamientos">
            Empieza uno nuevo o registra uno pasado contado en papel con «Registro manual».
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sessions?.map(({ session: s, present, jumps }) => (
              <li key={s.id}>
                <Link to={`/entreno/${s.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{capitalize(fmtDateLong(s.date))}</span>
                      {s.status === 'en_curso' && <Badge tone="amber">En curso</Badge>}
                      {s.mode === 'manual' && <Badge>Manual</Badge>}
                    </div>
                    <p className="text-sm text-slate-500">
                      {SESSION_TYPE_LABEL[s.type]}
                      {s.mode === 'vivo' ? ` · ${fmtTime(s.startedAt)}` : ''}
                      {s.durationMin ? ` · ${s.durationMin} min` : ''} · {present} jugadoras
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-slate-900 tabular-nums">{jumps}</p>
                    <p className="text-xs text-slate-500">saltos</p>
                  </div>
                  <ChevronRight size={18} className="text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
