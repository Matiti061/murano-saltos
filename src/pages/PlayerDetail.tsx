import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ArchiveRestore, ArrowLeft, CheckCircle2, HeartPulse, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AcwrBadge } from '../components/AcwrBadge';
import { AcwrChart, ChartCard, ColumnChart, TrendLineChart, VIZ } from '../components/charts';
import { ComplaintForm } from '../components/ComplaintForm';
import { NumberBubble, StatusBadge } from '../components/PlayerBits';
import { PlayerForm } from '../components/PlayerForm';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, CardHeader, Disclaimer, EmptyState, StatTile } from '../components/ui';
import { complaintLabel, deleteComplaint, isActiveComplaint, reopenComplaint, resolveComplaint } from '../db/complaints';
import { loadPlayerRows, loadPointsFrom } from '../db/history';
import { deletePlayerCascade, setPlayerArchived } from '../db/players';
import { db } from '../db/schema';
import { isPresent } from '../db/sessions';
import { useSettings } from '../db/settings';
import { ATTENDANCE_LABEL, SESSION_TYPE_LABEL, type Complaint } from '../db/types';
import { fmtDate, fmtDateShort, fmtDayMonth, fmtNum, todayISO } from '../lib/format';
import { acwrSeries, computeAcwr, sessionRpeLoad, weeklyTotals, wellnessTotal } from '../lib/metrics';

export function PlayerDetail() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useSettings();
  // null = no existe; undefined = cargando.
  const player = useLiveQuery(() => db.players.get(id).then((p) => p ?? null), [id]);
  const rows = useLiveQuery(() => loadPlayerRows(id), [id]);
  const complaints = useLiveQuery(
    () => db.complaints.where('playerId').equals(id).toArray().then((cs) => cs.sort((a, b) => b.date.localeCompare(a.date))),
    [id],
  );
  const [editOpen, setEditOpen] = useState(false);
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [editingComplaint, setEditingComplaint] = useState<Complaint | undefined>();

  const stats = useMemo(() => {
    if (!rows) return null;
    const points = loadPointsFrom(rows);
    const today = todayISO();
    const recent = rows.filter((r) => isPresent(r.attendance.status)).slice(-20);
    return {
      points,
      acwrJumps: computeAcwr(points, today, 'jumps', settings),
      acwrSrpe: computeAcwr(points, today, 'srpe', settings),
      perSession: recent.map((r) => ({
        label: fmtDateShort(r.session.date),
        value: r.attendance.jumps,
        detail: `${fmtDate(r.session.date)} · ${SESSION_TYPE_LABEL[r.session.type]}`,
      })),
      weeklyJumps: weeklyTotals(points, 'jumps')
        .slice(-12)
        .map((w) => ({ label: fmtDayMonth(w.week), value: w.value, detail: `Semana del ${fmtDate(w.week)}` })),
      weeklySrpe: weeklyTotals(points, 'srpe')
        .slice(-12)
        .map((w) => ({ label: fmtDayMonth(w.week), value: w.value, detail: `Semana del ${fmtDate(w.week)}` })),
      acwr: acwrSeries(points, 'jumps', settings)
        .slice(-30)
        .map((a) => ({ label: fmtDateShort(a.date), value: a.ratio, detail: fmtDate(a.date) })),
      wellness: rows
        .filter((r) => r.attendance.wellness)
        .slice(-20)
        .map((r) => ({ label: fmtDateShort(r.session.date), value: wellnessTotal(r.attendance.wellness), detail: fmtDate(r.session.date) })),
      sessionsCount: rows.filter((r) => isPresent(r.attendance.status)).length,
    };
  }, [rows, settings]);

  if (player === undefined || !stats) return null;
  if (player === null) {
    return (
      <Card>
        <EmptyState title="Jugadora no encontrada">
          <Link className="text-indigo-700 underline" to="/jugadoras">
            Volver a jugadoras
          </Link>
        </EmptyState>
      </Card>
    );
  }

  const remove = async () => {
    if (!confirm(`¿Borrar a ${player.name} y TODOS sus datos (saltos, asistencia, molestias)? Esto no se puede deshacer.\n\nSi solo ya no juega, mejor usa «Archivar».`)) return;
    await deletePlayerCascade(player.id!);
    toast('Jugadora borrada', 'success');
    navigate('/jugadoras');
  };

  const activeComplaints = complaints?.filter(isActiveComplaint) ?? [];

  return (
    <>
      <Link to="/jugadoras" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> Jugadoras
      </Link>

      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <NumberBubble player={player} size="lg" />
          <div className="min-w-[14rem] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">{player.name}</h1>
              <StatusBadge status={player.status} />
              {player.archived ? <Badge>Archivada</Badge> : null}
            </div>
            <p className="text-slate-500">
              {player.position}
              {player.jumpLimit ? ` · Límite: ${player.jumpLimit} saltos por sesión` : ''}
            </p>
            {player.notes && <p className="mt-1 text-sm text-slate-600">{player.notes}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil size={16} /> Editar
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setEditingComplaint(undefined);
                setComplaintOpen(true);
              }}
            >
              <HeartPulse size={16} /> Molestia
            </Button>
            <Button variant="ghost" onClick={() => setPlayerArchived(player.id!, !player.archived)}>
              {player.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
              {player.archived ? 'Recuperar' : 'Archivar'}
            </Button>
            <Button variant="ghost" onClick={remove} className="text-red-600">
              <Trash2 size={16} />
            </Button>
          </div>
        </div>
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Saltos 7 días" value={fmtNum(stats.acwrJumps.acute)} hint={`Media semanal: ${fmtNum(stats.acwrJumps.chronicWeekly)}`} />
        <StatTile
          label="ACWR saltos"
          value={<AcwrBadge result={stats.acwrJumps} showLabel />}
          tone={stats.acwrJumps.status === 'muy_alto' ? 'red' : stats.acwrJumps.status === 'alto' ? 'amber' : undefined}
        />
        <StatTile
          label="ACWR sRPE"
          value={<AcwrBadge result={stats.acwrSrpe} showLabel />}
          tone={stats.acwrSrpe.status === 'muy_alto' ? 'red' : stats.acwrSrpe.status === 'alto' ? 'amber' : undefined}
        />
        <StatTile label="Sesiones" value={stats.sessionsCount} hint={activeComplaints.length ? `${activeComplaints.length} molestia(s) activa(s)` : 'Sin molestias activas'} />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Saltos por sesión" subtitle="Últimas 20 sesiones">
          <ColumnChart data={stats.perSession} unit="saltos" limit={player.jumpLimit} />
        </ChartCard>
        <ChartCard title="Saltos por semana" subtitle="Últimas 12 semanas">
          <ColumnChart data={stats.weeklyJumps} unit="saltos" />
        </ChartCard>
        <ChartCard title="ACWR de saltos" subtitle="Carga de 7 días frente a la media de 4 semanas">
          <AcwrChart data={stats.acwr} th={settings} />
        </ChartCard>
        <ChartCard title="Carga interna por semana (sRPE)" subtitle="RPE × minutos">
          <ColumnChart data={stats.weeklySrpe} unit="UA" color={VIZ.series2} />
        </ChartCard>
        <ChartCard title="Wellness" subtitle="Suma de 4 ítems (4 = muy mal, 20 = perfecto)">
          <TrendLineChart data={stats.wellness} unit="/ 20" domain={[4, 20]} />
        </ChartCard>

        <Card>
          <CardHeader
            title="Molestias y lesiones"
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setEditingComplaint(undefined);
                  setComplaintOpen(true);
                }}
              >
                Añadir
              </Button>
            }
          />
          {complaints && complaints.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Sin molestias registradas.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {complaints?.map((c) => (
                <li key={c.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={c.kind === 'lesion' ? 'red' : 'amber'}>{c.kind === 'lesion' ? 'Lesión' : 'Molestia'}</Badge>
                      <span className="font-semibold text-slate-800">{complaintLabel(c)}</span>
                      {c.resolvedDate ? <Badge tone="green">Alta {fmtDateShort(c.resolvedDate)}</Badge> : <Badge tone="red">Activa</Badge>}
                    </div>
                    <p className="text-xs text-slate-500">{fmtDate(c.date)}</p>
                    {c.description && <p className="text-sm text-slate-600">{c.description}</p>}
                    {c.physioNotes && <p className="text-sm text-slate-600">Fisio: {c.physioNotes}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {c.resolvedDate ? (
                      <Button size="sm" variant="ghost" title="Reabrir" onClick={() => reopenComplaint(c.id!)}>
                        <RotateCcw size={16} />
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" title="Dar el alta" onClick={() => resolveComplaint(c.id!)}>
                        <CheckCircle2 size={16} />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Editar"
                      onClick={() => {
                        setEditingComplaint(c);
                        setComplaintOpen(true);
                      }}
                    >
                      <Pencil size={16} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Borrar"
                      onClick={() => confirm('¿Borrar este registro?') && deleteComplaint(c.id!)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Historial de sesiones" subtitle={`${rows?.length ?? 0} registros`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Asistencia</th>
                <th className="px-4 py-2 text-right">Saltos</th>
                <th className="px-4 py-2 text-right">Min</th>
                <th className="px-4 py-2 text-right">RPE</th>
                <th className="px-4 py-2 text-right">sRPE</th>
                <th className="px-4 py-2 text-right">Wellness</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...(rows ?? [])].reverse().map(({ session, attendance: a }) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link className="font-semibold text-indigo-700 hover:underline" to={`/entreno/${session.id}`}>
                      {fmtDate(session.date)}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{SESSION_TYPE_LABEL[session.type]}</td>
                  <td className="px-4 py-2 text-slate-600">{ATTENDANCE_LABEL[a.status]}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{isPresent(a.status) ? a.jumps : '–'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{a.minutes ?? '–'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{a.rpe ?? '–'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{sessionRpeLoad(a.rpe, a.minutes) ?? '–'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{wellnessTotal(a.wellness) ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows?.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">Todavía no ha participado en ninguna sesión.</p>}
        </div>
      </Card>

      <Disclaimer />

      <PlayerForm open={editOpen} onClose={() => setEditOpen(false)} teamId={player.teamId} player={player} />
      <ComplaintForm open={complaintOpen} onClose={() => setComplaintOpen(false)} player={player} complaint={editingComplaint} />
    </>
  );
}
