import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ArrowLeft, Check, FileDown, FileSpreadsheet, HeartPulse, Pencil, Play, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AcwrBadge } from '../components/AcwrBadge';
import { ComplaintForm } from '../components/ComplaintForm';
import { Modal } from '../components/Modal';
import { PositionBubble } from '../components/PlayerBits';
import { rpeColor } from '../components/RpeSelector';
import { useToast } from '../components/Toast';
import { Badge, Button, ButtonLink, Card, CardHeader, cx, Disclaimer, EmptyState, Field, Input, PageHeader, Select, StatTile, Textarea } from '../components/ui';
import { isWellnessComplete, WellnessForm } from '../components/WellnessForm';
import { complaintLabel } from '../db/complaints';
import { loadSessionReport } from '../db/reportLoader';
import { db } from '../db/schema';
import { deleteSessionsCascade, reopenSession, updateAttendance } from '../db/sessions';
import { ATTENDANCE_LABEL, SESSION_TYPE_LABEL, type Attendance, type AttendanceStatus, type Player, type Wellness } from '../db/types';
import { loadClubLogo } from '../lib/clubLogo';
import { sessionCsv } from '../lib/csv';
import { canShareFiles, downloadBlob, downloadText, shareFile } from '../lib/download';
import { capitalize, fmtDateLong, fmtNum, fmtTime, slug } from '../lib/format';
import { playerLabel, type SessionReportData } from '../lib/report';

const LIMIT_TEXT = { none: '', ok: 'text-emerald-700', warn: 'text-amber-700 font-bold', over: 'text-red-700 font-bold' };

async function buildPdfBlob(data: SessionReportData) {
  const { createSessionPdf, sessionPdfFilename } = await import('../lib/pdf/sessionReport');
  const doc = createSessionPdf(data, data.settings.logoDataUrl ? undefined : await loadClubLogo());
  return { blob: doc.output('blob'), filename: sessionPdfFilename(data) };
}

export function SessionReport() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const toast = useToast();
  const data = useLiveQuery(() => loadSessionReport(id).then((d) => d ?? null), [id]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wellnessFor, setWellnessFor] = useState<{ attendance: Attendance; player: Player } | null>(null);
  const [wellnessDraft, setWellnessDraft] = useState<Partial<Wellness>>({});
  const [complaintPlayer, setComplaintPlayer] = useState<Player | undefined>();

  if (data === undefined) return null;
  if (data === null) {
    return (
      <Card>
        <EmptyState title="Sesión no encontrada">
          <Link to="/historial" className="text-orange-700 underline">
            Ir al historial
          </Link>
        </EmptyState>
      </Card>
    );
  }

  const { session, totals } = data;
  const live = session.status === 'en_curso';

  const downloadPdf = async () => {
    setBusy(true);
    try {
      const { blob, filename } = await buildPdfBlob(data);
      downloadBlob(blob, filename);
    } finally {
      setBusy(false);
    }
  };

  const sharePdf = async () => {
    setBusy(true);
    try {
      const { blob, filename } = await buildPdfBlob(data);
      const ok = await shareFile(blob, filename, `Informe ${data.team?.name ?? ''} ${session.date}`);
      if (!ok) downloadBlob(blob, filename);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    downloadText(sessionCsv(data), `Sesion_${slug(data.team?.name ?? 'equipo')}_${session.date}.csv`, 'text/csv;charset=utf-8');
  };

  const remove = async () => {
    if (!confirm('¿Borrar este entrenamiento y todos sus saltos? Esto no se puede deshacer.')) return;
    await deleteSessionsCascade([id]);
    toast('Entrenamiento borrado', 'success');
    navigate('/historial', { replace: true });
  };

  const numberOrUndefined = (v: string) => (v === '' ? undefined : Number(v));

  return (
    <>
      <Link to="/historial" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> Historial
      </Link>
      <PageHeader
        title={capitalize(fmtDateLong(session.date))}
        subtitle={
          <>
            {data.team?.name} · {SESSION_TYPE_LABEL[session.type]} ·{' '}
            {session.mode === 'manual'
              ? 'registro manual'
              : `${fmtTime(session.startedAt)}${session.endedAt ? `–${fmtTime(session.endedAt)}` : ''}`}
            {session.durationMin ? ` · ${session.durationMin} min` : ''}
            {live && (
              <Badge tone="amber" className="ml-2">
                En curso
              </Badge>
            )}
          </>
        }
        actions={
          <>
            {live && (
              <ButtonLink to={`/entreno/${id}/vivo`} variant="success">
                <Play size={18} /> Volver al conteo
              </ButtonLink>
            )}
            <Button onClick={downloadPdf} disabled={busy}>
              <FileDown size={18} /> Descargar PDF
            </Button>
            {canShareFiles() && (
              <Button variant="secondary" onClick={sharePdf} disabled={busy}>
                <Share2 size={18} /> Compartir
              </Button>
            )}
            <Button variant="secondary" onClick={exportCsv}>
              <FileSpreadsheet size={18} /> CSV
            </Button>
            <Button variant={editing ? 'primary' : 'secondary'} onClick={() => setEditing(!editing)}>
              {editing ? <Check size={18} /> : <Pencil size={18} />} {editing ? 'Listo' : 'Editar'}
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Saltos totales" value={fmtNum(totals.jumps)} />
        <StatTile label="Media por jugadora" value={fmtNum(totals.avg, 1)} />
        <StatTile label="Máximo" value={totals.max ? totals.max.jumps : '–'} hint={totals.max?.name} />
        <StatTile label="Asistencia" value={`${totals.present}/${totals.convened}`} hint={`${data.blocks.length} ejercicios`} />
      </div>

      {data.alerts.length > 0 && (
        <Card className="mb-5">
          <CardHeader title={<span className="inline-flex items-center gap-2"><AlertTriangle size={18} className="text-amber-500" /> Alertas</span>} />
          <ul className="divide-y divide-slate-100">
            {data.alerts.map((a, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <Badge tone={a.level === 'alta' ? 'red' : 'amber'}>{a.level === 'alta' ? 'Alta' : 'Media'}</Badge>
                <span className="text-slate-700">{a.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {editing && (
        <Card className="mb-5 grid gap-4 p-4 sm:grid-cols-[180px_1fr]">
          <Field label="Duración (min)">
            <Input
              type="number"
              min={1}
              defaultValue={session.durationMin ?? ''}
              onBlur={(e) => db.sessions.update(id, { durationMin: numberOrUndefined(e.target.value) })}
            />
          </Field>
          <Field label="Notas">
            <Textarea rows={2} defaultValue={session.notes ?? ''} onBlur={(e) => db.sessions.update(id, { notes: e.target.value.trim() || undefined })} />
          </Field>
          {session.status === 'finalizado' && session.mode === 'vivo' && (
            <div className="sm:col-span-2">
              <Button variant="secondary" size="sm" onClick={async () => { await reopenSession(id); navigate(`/entreno/${id}/vivo`); }}>
                <Play size={16} /> Reabrir y seguir contando
              </Button>
            </div>
          )}
        </Card>
      )}

      <Card className="mb-5">
        <CardHeader
          title="Detalle por jugadora"
          subtitle={editing ? 'Los cambios se guardan al salir de cada casilla. «Ajuste» suma o resta saltos a mano.' : undefined}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2">Jugadora</th>
                <th className="px-3 py-2 text-right">Saltos</th>
                {editing && <th className="px-3 py-2 text-right">Ajuste</th>}
                <th className="px-3 py-2 text-right">Límite</th>
                <th className="px-3 py-2 text-right">Min</th>
                <th className="px-3 py-2 text-center">RPE</th>
                <th className="px-3 py-2 text-right">sRPE</th>
                <th className="px-3 py-2 text-center">Wellness</th>
                <th className="px-3 py-2 text-center">ACWR saltos</th>
                <th className="px-3 py-2 text-center">ACWR sRPE</th>
                {editing && <th className="px-3 py-2">Asistencia</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((r) => (
                <tr key={r.attendance.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link to={`/jugadoras/${r.player.id}`} className="flex items-center gap-2">
                      <PositionBubble player={r.player} size="sm" />
                      <span className="font-semibold text-slate-900">{r.player.name}</span>
                      {r.attendance.status === 'parcial' && <Badge tone="blue">Parcial</Badge>}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right text-base font-bold tabular-nums">{r.jumps}</td>
                  {editing && (
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        className="h-9 w-20 text-right text-sm"
                        defaultValue={r.attendance.manualJumps || ''}
                        placeholder="0"
                        onBlur={(e) => updateAttendance(r.attendance.id!, { manualJumps: Number(e.target.value) || 0 })}
                      />
                    </td>
                  )}
                  <td className={cx('px-3 py-2 text-right tabular-nums', LIMIT_TEXT[r.limitState])}>
                    {r.limit ? `${r.limitPct}%` : '–'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {editing ? (
                      <Input
                        type="number"
                        className="h-9 w-20 text-right text-sm"
                        defaultValue={r.minutes ?? ''}
                        onBlur={(e) => updateAttendance(r.attendance.id!, { minutes: numberOrUndefined(e.target.value) })}
                      />
                    ) : (
                      (r.minutes ?? '–')
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {editing ? (
                      <Select
                        className="h-9 w-20 text-sm"
                        value={r.rpe ?? ''}
                        onChange={(e) => updateAttendance(r.attendance.id!, { rpe: numberOrUndefined(e.target.value) })}
                      >
                        <option value="">–</option>
                        {Array.from({ length: 11 }, (_, i) => (
                          <option key={i} value={i}>
                            {i}
                          </option>
                        ))}
                      </Select>
                    ) : r.rpe != null ? (
                      <span className={cx('inline-block min-w-8 rounded-md px-1.5 py-0.5 font-bold', rpeColor(r.rpe))}>{r.rpe}</span>
                    ) : (
                      '–'
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.srpe ?? '–'}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      disabled={!editing}
                      onClick={() => {
                        setWellnessDraft(r.attendance.wellness ?? {});
                        setWellnessFor({ attendance: r.attendance, player: r.player });
                      }}
                      className={cx(editing && 'rounded-md underline decoration-dotted')}
                    >
                      {r.wellnessTotal != null ? (
                        <Badge tone={r.wellnessLow.length || r.wellnessDrop ? 'amber' : 'slate'}>{r.wellnessTotal}/20</Badge>
                      ) : editing ? (
                        <span className="text-orange-700">Añadir</span>
                      ) : (
                        '–'
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <AcwrBadge result={r.acwrJumps} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <AcwrBadge result={r.acwrSrpe} />
                  </td>
                  {editing && (
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <AttendanceSelect attendance={r.attendance} />
                        <Button size="sm" variant="ghost" title="Registrar molestia" onClick={() => setComplaintPlayer(r.player)}>
                          <HeartPulse size={16} />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {data.rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">Nadie entrenó en esta sesión.</p>}
        </div>
      </Card>

      {data.blocks.length > 0 && (
        <Card className="mb-5">
          <CardHeader title="Por ejercicio" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Ejercicio</th>
                  <th className="px-3 py-2 text-right">Duración</th>
                  <th className="px-3 py-2 text-right">Saltos</th>
                  <th className="px-3 py-2 text-right">Saltos/min</th>
                  <th className="px-3 py-2 text-right">Media por jugadora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.blocks.map((b) => (
                  <tr key={b.block.id}>
                    <td className="px-3 py-2 font-semibold text-slate-900">
                      {b.block.order}. {b.block.name}
                      <span className="ml-2 text-xs font-normal text-slate-500">{fmtTime(b.block.startedAt)}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{b.durationMin != null ? `${fmtNum(b.durationMin)} min` : '–'}</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">{b.jumps}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(b.perMin, 1)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(data.rows.length ? b.jumps / data.rows.length : null, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.showNoBlock && (
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
              {data.rows.reduce((a, r) => a + r.noBlock, 0)} saltos se contaron fuera de un ejercicio o se ajustaron a mano.
            </p>
          )}
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Molestias registradas" />
          {data.complaints.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Ninguna en esta sesión.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.complaints.map(({ complaint: c, player }) => (
                <li key={c.id} className="px-4 py-2.5 text-sm">
                  <Badge tone={c.kind === 'lesion' ? 'red' : 'amber'}>{c.kind === 'lesion' ? 'Lesión' : 'Molestia'}</Badge>{' '}
                  <span className="font-semibold">{player ? playerLabel(player) : '–'}</span>: {complaintLabel(c)}
                  {c.description && <p className="text-slate-500">{c.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="No entrenan" />
          {data.absent.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Asistencia completa.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.absent.map(({ player, status }) => (
                <li key={player.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                  <PositionBubble player={player} size="sm" />
                  <span className="flex-1 font-semibold text-slate-800">{player.name}</span>
                  {editing ? <AbsentSelect sessionId={id} playerId={player.id!} status={status} /> : <Badge>{ATTENDANCE_LABEL[status]}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {session.notes && !editing && (
        <Card className="mt-5 p-4">
          <h2 className="mb-1 font-semibold text-slate-900">Notas</h2>
          <p className="text-sm whitespace-pre-line text-slate-700">{session.notes}</p>
        </Card>
      )}

      <div className="mt-8 flex justify-center">
        <Button variant="ghost" className="text-red-600" onClick={remove}>
          <Trash2 size={16} /> Borrar este entrenamiento
        </Button>
      </div>
      <Disclaimer />

      <Modal
        open={!!wellnessFor}
        onClose={() => setWellnessFor(null)}
        title={`Wellness · ${wellnessFor?.player.name ?? ''}`}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={async () => {
                await updateAttendance(wellnessFor!.attendance.id!, { wellness: undefined });
                setWellnessFor(null);
              }}
            >
              Quitar
            </Button>
            <Button
              onClick={async () => {
                if (!isWellnessComplete(wellnessDraft)) return toast('Completa los 4 ítems', 'warning');
                await updateAttendance(wellnessFor!.attendance.id!, { wellness: wellnessDraft });
                setWellnessFor(null);
              }}
            >
              Guardar
            </Button>
          </>
        }
      >
        <WellnessForm value={wellnessDraft} onChange={setWellnessDraft} />
      </Modal>

      <ComplaintForm open={!!complaintPlayer} onClose={() => setComplaintPlayer(undefined)} player={complaintPlayer} sessionId={id} />
    </>
  );
}

function AttendanceSelect({ attendance }: { attendance: Attendance }) {
  return (
    <Select
      className="h-9 w-32 text-sm"
      value={attendance.status}
      onChange={(e) => updateAttendance(attendance.id!, { status: e.target.value as AttendanceStatus })}
    >
      {(Object.keys(ATTENDANCE_LABEL) as AttendanceStatus[]).map((k) => (
        <option key={k} value={k}>
          {ATTENDANCE_LABEL[k]}
        </option>
      ))}
    </Select>
  );
}

function AbsentSelect({ sessionId, playerId, status }: { sessionId: number; playerId: number; status: AttendanceStatus }) {
  return (
    <Select
      className="h-9 w-32 text-sm"
      value={status}
      onChange={async (e) => {
        const att = await db.attendance.where('[sessionId+playerId]').equals([sessionId, playerId]).first();
        if (att) await updateAttendance(att.id!, { status: e.target.value as AttendanceStatus });
      }}
    >
      {(Object.keys(ATTENDANCE_LABEL) as AttendanceStatus[]).map((k) => (
        <option key={k} value={k}>
          {ATTENDANCE_LABEL[k]}
        </option>
      ))}
    </Select>
  );
}
