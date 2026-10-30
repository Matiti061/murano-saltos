import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, DatabaseBackup, FileSpreadsheet, ImagePlus, Plus, ShieldCheck, Sparkles, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select } from '../components/ui';
import { createTeam, deleteTeamCascade, renameTeam } from '../db/players';
import { db, isStoragePersisted, requestPersistentStorage } from '../db/schema';
import { updateSettings, useSettings } from '../db/settings';
import { useActiveTeam } from '../hooks/useActiveTeam';
import { exportBackup, exportComplaintsCsv, exportLoadsCsv, parseBackup, restoreBackup, type BackupSummary } from '../lib/backup';
import { clearDemo, hasDemoData, seedDemo } from '../lib/demo';
import { fmtNum } from '../lib/format';

/** Reduce el logo para que el PDF y la base de datos no pesen de más. */
function resizeImage(file: File, max = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = URL.createObjectURL(file);
  });
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="p-4">{children}</div>
    </Card>
  );
}

export function SettingsPage() {
  const settings = useSettings();
  const toast = useToast();
  const { teams, setTeamId } = useActiveTeam();
  const demo = useLiveQuery(hasDemoData, []);
  const counts = useLiveQuery(async () => ({ sessions: await db.sessions.count(), players: await db.players.count() }), []);
  const [newTeam, setNewTeam] = useState('');
  const [newExercise, setNewExercise] = useState('');
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string>('');
  const [pendingImport, setPendingImport] = useState<{ file: Parameters<typeof restoreBackup>[0]; summary: BackupSummary } | null>(null);
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void isStoragePersisted().then(setPersisted);
    void navigator.storage?.estimate?.().then((e) => {
      if (e.usage != null) setUsage(`${fmtNum(e.usage / 1024 / 1024, 1)} MB usados`);
    });
  }, []);

  const moveExercise = (i: number, dir: -1 | 1) => {
    const list = [...settings.exercises];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    void updateSettings({ exercises: list });
  };

  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Club" subtitle="Aparece en la cabecera de los informes PDF">
          <div className="space-y-4">
            <Field label="Nombre del club">
              <Input
                key={settings.clubName}
                defaultValue={settings.clubName}
                onBlur={(e) => e.target.value.trim() && updateSettings({ clubName: e.target.value.trim() })}
              />
            </Field>
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Escudo / logo</p>
              <div className="flex items-center gap-3">
                {settings.logoDataUrl ? (
                  <img src={settings.logoDataUrl} alt="Logo del club" className="h-16 w-16 rounded-xl border border-slate-200 object-contain p-1" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-slate-300 text-slate-400">
                    <ImagePlus />
                  </div>
                )}
                <label className="cursor-pointer">
                  <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
                    <Upload size={16} /> Subir imagen
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      try {
                        await updateSettings({ logoDataUrl: await resizeImage(file) });
                        toast('Logo guardado', 'success');
                      } catch (err) {
                        toast((err as Error).message, 'error');
                      }
                    }}
                  />
                </label>
                {settings.logoDataUrl && (
                  <Button size="sm" variant="ghost" onClick={() => updateSettings({ logoDataUrl: undefined })}>
                    Quitar
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Section>

        <Section title="Equipos" subtitle="Cada equipo tiene sus jugadoras y entrenamientos">
          <ul className="mb-3 space-y-2">
            {teams?.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <Input key={t.name} defaultValue={t.name} className="h-10" onBlur={(e) => e.target.value.trim() && renameTeam(t.id!, e.target.value)} />
                {t.demo && <Badge tone="indigo">Ejemplo</Badge>}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  title="Borrar equipo"
                  onClick={async () => {
                    if (!confirm(`¿Borrar el equipo «${t.name}» con TODAS sus jugadoras, entrenamientos y molestias?`)) return;
                    if (!t.demo && !confirm('Esto no se puede deshacer. ¿Seguro? (Te recomendamos hacer antes una copia de seguridad)')) return;
                    await deleteTeamCascade(t.id!);
                    toast('Equipo borrado', 'success');
                  }}
                >
                  <Trash2 size={16} />
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newTeam.trim()) return;
              setTeamId(await createTeam(newTeam));
              setNewTeam('');
              toast('Equipo creado', 'success');
            }}
          >
            <Input value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder="Nuevo equipo" className="h-10" />
            <Button type="submit" variant="secondary">
              <Plus size={16} /> Añadir
            </Button>
          </form>
        </Section>

        <Section title="Ejercicios" subtitle="Botones rápidos en la pantalla de conteo">
          <ul className="mb-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {settings.exercises.map((ex, i) => (
              <li key={ex} className="flex items-center gap-1 px-3 py-1.5">
                <span className="flex-1 text-sm font-medium text-slate-800">{ex}</span>
                <Button size="sm" variant="ghost" onClick={() => moveExercise(i, -1)} disabled={i === 0} aria-label="Subir">
                  <ArrowUp size={14} />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => moveExercise(i, 1)} disabled={i === settings.exercises.length - 1} aria-label="Bajar">
                  <ArrowDown size={14} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Quitar"
                  onClick={() => updateSettings({ exercises: settings.exercises.filter((e) => e !== ex) })}
                >
                  <Trash2 size={14} />
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newExercise.trim();
              if (!name || settings.exercises.includes(name)) return;
              void updateSettings({ exercises: [...settings.exercises, name] });
              setNewExercise('');
            }}
          >
            <Input value={newExercise} onChange={(e) => setNewExercise(e.target.value)} placeholder="Nuevo ejercicio" className="h-10" />
            <Button type="submit" variant="secondary">
              <Plus size={16} /> Añadir
            </Button>
          </form>
        </Section>

        <Section title="Umbrales de alerta" subtitle="Valores por defecto basados en la literatura de monitorización de carga">
          <div className="grid grid-cols-3 gap-3">
            <Field label="ACWR bajo <">
              <Input type="number" step="0.05" defaultValue={settings.acwrLow} key={`l${settings.acwrLow}`} onBlur={(e) => updateSettings({ acwrLow: Number(e.target.value) || 0.8 })} />
            </Field>
            <Field label="Pico >">
              <Input type="number" step="0.05" defaultValue={settings.acwrHigh} key={`h${settings.acwrHigh}`} onBlur={(e) => updateSettings({ acwrHigh: Number(e.target.value) || 1.3 })} />
            </Field>
            <Field label="Pico alto >">
              <Input type="number" step="0.05" defaultValue={settings.acwrVeryHigh} key={`v${settings.acwrVeryHigh}`} onBlur={(e) => updateSettings({ acwrVeryHigh: Number(e.target.value) || 1.5 })} />
            </Field>
            <Field label="Aviso de límite (%)">
              <Input type="number" min={50} max={99} defaultValue={settings.limitWarnPct} key={`p${settings.limitWarnPct}`} onBlur={(e) => updateSettings({ limitWarnPct: Number(e.target.value) || 80 })} />
            </Field>
            <div className="col-span-2">
              <Field label="Alerta wellness si un ítem es ≤">
                <Select value={settings.wellnessItemAlert} onChange={(e) => updateSettings({ wellnessItemAlert: Number(e.target.value) })}>
                  <option value={1}>1 (muy mal)</option>
                  <option value={2}>2 (mal)</option>
                  <option value={3}>3 (regular)</option>
                </Select>
              </Field>
            </div>
          </div>
        </Section>

        <Section title="Copia de seguridad" subtitle="Los datos se guardan solo en este dispositivo">
          <p className="mb-3 text-sm text-slate-600">
            Descarga una copia periódicamente y guárdala en Drive, el correo o un USB. Si cambias de tablet, importa la copia en
            la nueva. <b>Contiene datos de salud: guárdala en un sitio privado.</b>
          </p>
          <p className="mb-3 text-sm text-slate-500">
            Última copia: {settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString('es-ES') : 'nunca'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                await exportBackup();
                toast('Copia descargada', 'success');
              }}
            >
              <DatabaseBackup size={18} /> Descargar copia
            </Button>
            <Button variant="secondary" onClick={() => importRef.current?.click()}>
              <Upload size={18} /> Importar copia
            </Button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  setPendingImport(parseBackup(await file.text()));
                } catch (err) {
                  toast((err as Error).message, 'error');
                }
              }}
            />
          </div>
        </Section>

        <Section title="Exportar a Excel" subtitle="Archivos CSV que se abren directamente en Excel">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportLoadsCsv}>
              <FileSpreadsheet size={18} /> Cargas de todas las sesiones
            </Button>
            <Button variant="secondary" onClick={exportComplaintsCsv}>
              <FileSpreadsheet size={18} /> Molestias y lesiones
            </Button>
          </div>
        </Section>

        <Section title="Almacenamiento">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {persisted ? (
              <Badge tone="green">
                <ShieldCheck size={12} /> Protegido: el navegador no borrará los datos
              </Badge>
            ) : (
              <>
                <Badge tone="amber">Sin protección permanente</Badge>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    const ok = await requestPersistentStorage();
                    setPersisted(ok);
                    toast(ok ? 'Almacenamiento protegido' : 'El navegador no lo ha permitido. Instala la app en la pantalla de inicio.', ok ? 'success' : 'warning');
                  }}
                >
                  Proteger datos
                </Button>
              </>
            )}
            {usage && <span className="text-slate-500">{usage}</span>}
            {counts && (
              <span className="text-slate-500">
                · {counts.players} jugadoras · {counts.sessions} sesiones
              </span>
            )}
          </div>
        </Section>

        <Section title="Datos de ejemplo" subtitle="Un equipo ficticio con 5 semanas de entrenamientos para probar la app">
          {demo ? (
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await clearDemo();
                setBusy(false);
                toast('Datos de ejemplo borrados', 'success');
              }}
            >
              <Trash2 size={18} /> Borrar datos de ejemplo
            </Button>
          ) : (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setTeamId(await seedDemo());
                setBusy(false);
                toast('Datos de ejemplo cargados', 'success');
              }}
            >
              <Sparkles size={18} /> {busy ? 'Cargando…' : 'Cargar datos de ejemplo'}
            </Button>
          )}
        </Section>

        <Section title="Cómo se calculan las métricas">
          <dl className="space-y-3 text-sm text-slate-600">
            <div>
              <dt className="font-semibold text-slate-800">ACWR (ratio agudo:crónico)</dt>
              <dd>
                Carga de los últimos 7 días dividida entre la media semanal de las últimas 4 semanas. Por encima de{' '}
                {fmtNum(settings.acwrHigh, 1)} indica un aumento brusco de carga, asociado a más riesgo de lesión. Necesita al
                menos 3 semanas de datos.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-800">sRPE (carga interna)</dt>
              <dd>Esfuerzo percibido de la sesión (0-10) multiplicado por los minutos entrenados.</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-800">Wellness</dt>
              <dd>Suma de sueño, fatiga, dolor muscular y estrés (1-5 cada uno; 20 es el mejor estado).</dd>
            </div>
            <p className="text-xs text-slate-400">
              Son indicadores orientativos para apoyar las decisiones del cuerpo técnico y médico, no un diagnóstico.
            </p>
          </dl>
        </Section>
      </div>

      <Modal
        open={!!pendingImport}
        onClose={() => setPendingImport(null)}
        title="Importar copia de seguridad"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingImport(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await restoreBackup(pendingImport!.file);
                  toast('Copia importada', 'success');
                  setPendingImport(null);
                } catch (err) {
                  toast(`Error al importar: ${(err as Error).message}`, 'error');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Sustituir todos los datos
            </Button>
          </>
        }
      >
        {pendingImport && (
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              Copia del <b>{new Date(pendingImport.summary.exportedAt).toLocaleString('es-ES')}</b> con{' '}
              {pendingImport.summary.counts.teams} equipos, {pendingImport.summary.counts.players} jugadoras y{' '}
              {pendingImport.summary.counts.sessions} sesiones.
            </p>
            <p className="rounded-xl bg-red-50 p-3 font-semibold text-red-800">
              Se borrarán todos los datos actuales de este dispositivo y se sustituirán por los de la copia.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
