import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, FileUp, HelpCircle, MessageSquare, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PositionBubble } from '../components/PlayerBits';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, CardHeader, cx, EmptyState, PageHeader, Segmented, Select } from '../components/ui';
import { existingResponseKeys, importFormResponses, isDuplicate, type ImportItem, type ImportResult } from '../db/forms';
import { sortPlayers } from '../db/players';
import { db } from '../db/schema';
import { updateSettings, useSettings } from '../db/settings';
import { FORM_KIND_LABEL, type FormKind, type FormValues, type Player } from '../db/types';
import { useActiveTeam } from '../hooks/useActiveTeam';
import { FIELD_LABEL, type FormField } from '../lib/forms/fields';
import { detectForm, hasCompleteWellness, kindFromColumns, parseRows, type DetectedForm, type ParsedRow } from '../lib/forms/parse';
import { readFormFile, type SheetTable } from '../lib/forms/readFile';
import { normalize } from '../lib/forms/text';
import { DISCOMFORT_LABEL } from '../lib/forms/zones';
import { fmtDate, fmtTime } from '../lib/format';
import { wellnessLowItems, wellnessTotal } from '../lib/metrics';
import { NoTeam } from './Dashboard';

type RowStatus = 'nueva' | 'importada' | 'sin-jugadora' | 'sin-fecha';

function ValuesSummary({ kind, values, threshold }: { kind: FormKind; values: FormValues; threshold: number }) {
  if (kind === 'rpe') return values.rpe != null ? <Badge tone="brand">RPE {values.rpe}</Badge> : <span className="text-slate-400">–</span>;
  const w = values.wellness;
  const complete = hasCompleteWellness(w);
  const low = complete ? wellnessLowItems(w, threshold) : [];
  return (
    <div className="flex flex-wrap items-center gap-1">
      {complete ? <Badge tone={low.length ? 'amber' : 'slate'}>{wellnessTotal(w)}/20</Badge> : <Badge>Incompleto</Badge>}
      {low.length > 0 && <span className="text-xs text-amber-800">{low.join(', ')}</span>}
      {values.discomfort ? <Badge tone={values.discomfort >= 3 ? 'red' : 'amber'}>{DISCOMFORT_LABEL[values.discomfort]}</Badge> : null}
      {values.note && (
        <span title={values.note}>
          <MessageSquare size={14} className="text-orange-600" />
        </span>
      )}
    </div>
  );
}

export function FormsPage() {
  const { team, teams } = useActiveTeam();
  const settings = useSettings();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<SheetTable | null>(null);
  const [form, setForm] = useState<DetectedForm | null>(null);
  const [kind, setKind] = useState<FormKind | null>(null);
  const [manual, setManual] = useState<Record<number, string>>({});
  const [showImported, setShowImported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(ImportResult & { kind: FormKind; rows: (ParsedRow & { playerId: string })[] }) | null>(null);

  const players = useLiveQuery(
    () => (team ? db.players.where('teamId').equals(team.id!).toArray().then(sortPlayers) : Promise.resolve([] as Player[])),
    [team?.id],
  );
  const keys = useLiveQuery(() => (team ? existingResponseKeys(team.id!) : Promise.resolve(new Set<string>())), [team?.id]);
  const sessionDates = useLiveQuery(
    async () => (team ? new Set((await db.sessions.where('teamId').equals(team.id!).toArray()).map((s) => s.date)) : new Set<string>()),
    [team?.id],
  );

  const parsed = useMemo(
    () => (table && form && kind && players ? parseRows(table, form, kind, players) : []),
    [table, form, kind, players],
  );

  const rows = useMemo(() => {
    return parsed
      .map((r) => {
        const playerId = manual[r.sheetRow] ?? r.match.player?.id ?? '';
        let status: RowStatus = 'nueva';
        if (r.submittedAt == null) status = 'sin-fecha';
        else if (!playerId) status = 'sin-jugadora';
        else if (keys && kind && isDuplicate(keys, { playerId, submittedAt: r.submittedAt }, kind)) status = 'importada';
        return { ...r, playerId, status };
      })
      .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
  }, [parsed, manual, keys, kind]);

  if (teams && !team) return <NoTeam />;

  const reset = () => {
    setTable(null);
    setForm(null);
    setKind(null);
    setManual({});
    setFileName('');
  };

  const onFile = async (file: File) => {
    setResult(null);
    try {
      const t = await readFormFile(file.name, await file.arrayBuffer());
      if (t.rows.length === 0) throw new Error('El archivo no tiene respuestas.');
      const detected = detectForm(t, players ?? [], settings.formColumnMap);
      setTable(t);
      setForm(detected);
      setKind(detected.kind);
      setManual({});
      setFileName(file.name);
    } catch (e) {
      toast(`No se pudo leer el archivo: ${(e as Error).message}`, 'error');
      reset();
    }
  };

  const changeColumn = (index: number, field: FormField) => {
    if (!form) return;
    const columns = form.columns.map((c) => {
      if (c.index === index) return { ...c, field, auto: false };
      // Un dato no puede estar en dos columnas.
      if (field !== 'ignore' && c.field === field) return { ...c, field: 'ignore' as FormField, auto: false };
      return c;
    });
    setForm({ ...form, columns });
    setKind((k) => k ?? kindFromColumns(columns));
  };

  const counts = {
    nueva: rows.filter((r) => r.status === 'nueva').length,
    importada: rows.filter((r) => r.status === 'importada').length,
    sinJugadora: rows.filter((r) => r.status === 'sin-jugadora').length,
    sinFecha: rows.filter((r) => r.status === 'sin-fecha').length,
  };
  const visible = rows.filter((r) => showImported || r.status !== 'importada');

  const doImport = async () => {
    if (!team || !kind || !form) return;
    setBusy(true);
    try {
      const toImport = rows.filter((r) => r.status === 'nueva');
      const items: ImportItem[] = toImport.map((r) => ({
        playerId: r.playerId,
        submittedAt: r.submittedAt!,
        date: r.date!,
        values: r.values,
        raw: r.raw,
      }));
      // Los nombres que hubo que elegir a mano o eran dudosos se recuerdan para la próxima vez.
      const aliases = toImport
        .filter((r) => r.rawName && (manual[r.sheetRow] || r.match.doubtful))
        .map((r) => ({ playerId: r.playerId, alias: r.rawName }));
      const res = await importFormResponses(team.id!, kind, items, aliases);

      const corrections = Object.fromEntries(form.columns.filter((c) => !c.auto).map((c) => [normalize(c.header), c.field]));
      if (Object.keys(corrections).length) {
        await updateSettings({ formColumnMap: { ...settings.formColumnMap, ...corrections } });
      }
      setResult({ ...res, kind, rows: toImport });
      reset();
      toast(`${res.added} respuestas importadas`, 'success');
    } catch (e) {
      toast(`Error al importar: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const playerName = (id: string) => players?.find((p) => p.id === id)?.name ?? '–';

  return (
    <>
      <PageHeader
        title="Encuestas"
        subtitle="Sube el archivo de respuestas de Google Forms y la app coloca los datos en cada jugadora"
        actions={
          table ? (
            <Button variant="ghost" onClick={reset}>
              Cancelar
            </Button>
          ) : undefined
        }
      />

      {result && (
        <Card className="mb-5 border-emerald-300">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-600" /> {FORM_KIND_LABEL[result.kind]}: {result.added} respuestas importadas
              </span>
            }
            subtitle={[
              result.applied ? `${result.applied} aplicadas a su entrenamiento` : '',
              result.pending ? `${result.pending} pendientes: se aplicarán al empezar el entrenamiento de ese día` : '',
              result.withoutAttendance ? `${result.withoutAttendance} de jugadoras que no estaban en la lista de ese entrenamiento` : '',
              result.duplicates ? `${result.duplicates} ya estaban importadas` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          />
          {result.kind === 'pre' && (
            <ul className="divide-y divide-slate-100 text-sm">
              {result.rows
                .filter((r) => r.values.discomfort || r.values.note || (hasCompleteWellness(r.values.wellness) && wellnessLowItems(r.values.wellness, settings.wellnessItemAlert).length))
                .map((r) => (
                  <li key={r.sheetRow} className="flex flex-wrap items-center gap-2 px-4 py-2">
                    <span className="font-semibold text-slate-900">{playerName(r.playerId)}</span>
                    <ValuesSummary kind="pre" values={r.values} threshold={settings.wellnessItemAlert} />
                    {r.values.note && <span className="w-full text-slate-600">«{r.values.note}»</span>}
                  </li>
                ))}
            </ul>
          )}
        </Card>
      )}

      {!table ? (
        <>
          <Card
            className="mb-5 border-2 border-dashed border-orange-300 bg-orange-50/50"
          >
            <div
              className="flex flex-col items-center gap-3 px-6 py-10 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void onFile(f);
              }}
            >
              <FileUp size={40} className="text-orange-500" />
              <p className="font-semibold text-slate-800">Arrastra aquí el archivo de respuestas o elígelo</p>
              <p className="text-sm text-slate-500">Vale el .zip o .csv de Google Forms y el .xlsx o .csv de la hoja de cálculo.</p>
              <Button onClick={() => inputRef.current?.click()}>
                <Upload size={18} /> Elegir archivo
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.zip,text/csv,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void onFile(f);
                }}
              />
            </div>
          </Card>
          <Card className="p-4 text-sm text-slate-600">
            <p className="mb-2 flex items-center gap-2 font-semibold text-slate-800">
              <HelpCircle size={16} /> Cómo descargar las respuestas
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                En Google Forms: pestaña <b>Respuestas</b> → menú ⋮ → <b>Descargar respuestas (.csv)</b>. Sube el .zip tal cual.
              </li>
              <li>
                O desde la hoja de cálculo de respuestas: <b>Archivo → Descargar → Microsoft Excel (.xlsx)</b> o <b>CSV</b>.
              </li>
              <li>Puedes subir siempre el archivo completo: las respuestas que ya estaban no se repiten.</li>
              <li>
                Para que los nombres coincidan, pega en el desplegable del formulario la lista de{' '}
                <Link to="/jugadoras" className="font-semibold text-orange-700 underline">
                  Jugadoras → Copiar nombres
                </Link>
                .
              </li>
            </ol>
          </Card>
        </>
      ) : (
        <>
          <Card className="mb-4 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{fileName}</p>
                <p className="text-sm text-slate-500">
                  {rows.length} respuestas · {counts.nueva} nuevas · {counts.importada} ya importadas
                  {counts.sinJugadora ? ` · ${counts.sinJugadora} sin jugadora` : ''}
                  {counts.sinFecha ? ` · ${counts.sinFecha} sin fecha` : ''}
                </p>
              </div>
              <Segmented
                value={kind ?? ('pre' as FormKind)}
                onChange={(k) => setKind(k)}
                options={[
                  { value: 'pre', label: 'Pre-entreno' },
                  { value: 'rpe', label: 'RPE' },
                ]}
              />
            </div>
            {!kind && (
              <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle size={16} /> No se reconoció el tipo de formulario: elige si es el pre-entreno o el RPE y revisa las columnas.
              </p>
            )}
            <details className="mt-3" open={!kind || form?.columns.every((c) => c.field !== 'name')}>
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                Columnas reconocidas ({form?.columns.filter((c) => c.field !== 'ignore').length} de {form?.columns.length})
              </summary>
              <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {form?.columns.map((c) => (
                  <div key={c.index} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-[12rem] flex-1 text-slate-700">{c.header || `Columna ${c.index + 1}`}</span>
                    <Select className="h-9 w-56 text-sm" value={c.field} onChange={(e) => changeColumn(c.index, e.target.value as FormField)}>
                      {(Object.keys(FIELD_LABEL) as FormField[]).map((f) => (
                        <option key={f} value={f}>
                          {FIELD_LABEL[f]}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
            </details>
          </Card>

          <Card className="mb-24">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold text-slate-900">Respuestas</h2>
              {counts.importada > 0 && (
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={showImported} onChange={(e) => setShowImported(e.target.checked)} className="h-4 w-4" />
                  Ver también las ya importadas
                </label>
              )}
            </div>
            {visible.length === 0 ? (
              <EmptyState title="No hay respuestas nuevas en este archivo">Todas estaban ya importadas.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th className="px-3 py-2">Respondió</th>
                      <th className="px-3 py-2">Nombre en el formulario</th>
                      <th className="px-3 py-2">Jugadora</th>
                      <th className="px-3 py-2">Respuestas</th>
                      <th className="px-3 py-2">Destino</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visible.map((r) => {
                      const chosen = players?.find((p) => p.id === r.playerId);
                      return (
                        <tr key={r.sheetRow} className={cx(r.status === 'importada' && 'opacity-50')}>
                          <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                            {r.submittedAt ? `${fmtDate(r.date!)} ${fmtTime(r.submittedAt)}` : <Badge tone="red">Sin fecha</Badge>}
                          </td>
                          <td className="px-3 py-2 text-slate-700">{r.rawName || <span className="text-slate-400">(vacío)</span>}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {chosen && <PositionBubble player={chosen} size="sm" />}
                              <Select
                                className={cx('h-9 w-44 text-sm', !r.playerId && 'border-red-400', r.match.doubtful && r.playerId && !manual[r.sheetRow] && 'border-amber-400')}
                                value={r.playerId}
                                onChange={(e) => setManual((m) => ({ ...m, [r.sheetRow]: e.target.value }))}
                              >
                                <option value="">— Elegir —</option>
                                {players?.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            {r.match.doubtful && r.playerId && !manual[r.sheetRow] && <p className="mt-0.5 text-xs text-amber-700">Revisa: nombre parecido</p>}
                          </td>
                          <td className="px-3 py-2">
                            {kind && <ValuesSummary kind={kind} values={r.values} threshold={settings.wellnessItemAlert} />}
                            {r.problems.length > 0 && <p className="mt-0.5 text-xs text-red-700">{r.problems.join(' · ')}</p>}
                          </td>
                          <td className="px-3 py-2 text-xs whitespace-nowrap">
                            {r.status === 'importada' ? (
                              <Badge>Ya importada</Badge>
                            ) : r.status === 'nueva' ? (
                              sessionDates?.has(r.date!) ? (
                                <Badge tone="green">Entreno {fmtDate(r.date!).slice(0, 5)}</Badge>
                              ) : (
                                <Badge tone="blue">Pendiente</Badge>
                              )
                            ) : (
                              <Badge tone="red">{r.status === 'sin-jugadora' ? 'Elige jugadora' : 'Sin fecha'}</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
              «Pendiente»: aún no hay entrenamiento ese día; los datos se colocarán solos al empezarlo.
            </p>
          </Card>

          <div className="fixed inset-x-0 bottom-[60px] z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-60">
            <div className="mx-auto flex max-w-6xl items-center justify-end gap-3">
              {counts.sinJugadora > 0 && <p className="mr-auto text-sm text-red-700">{counts.sinJugadora} sin jugadora no se importarán</p>}
              <Button size="lg" onClick={doImport} disabled={busy || !kind || counts.nueva === 0}>
                <Upload size={18} /> {busy ? 'Importando…' : `Importar ${counts.nueva} respuestas`}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
