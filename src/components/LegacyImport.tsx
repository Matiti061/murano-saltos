import { CloudUpload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { markLegacyHandled, readLegacyData } from '../db/legacy';
import { importDataset, isEmptyDataset, summarize, withoutDemo, type Dataset, type DatasetSummary } from '../lib/importData';
import { useToast } from './Toast';
import { Button, Card } from './ui';

/**
 * Si este dispositivo tiene datos de la versión anterior (sin nube), ofrece subirlos una sola vez.
 * La base antigua no se borra: queda como respaldo.
 */
export function LegacyImport({ onImported }: { onImported?: (firstTeamName?: string) => void }) {
  const toast = useToast();
  const [pending, setPending] = useState<{ data: Dataset; summary: DatasetSummary } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readLegacyData()
      .then((legacy) => {
        if (cancelled || !legacy || legacy.importedAt) return;
        const data = withoutDemo(legacy.data);
        if (isEmptyDataset(data)) return;
        setPending({ data, summary: summarize(data) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!pending) return null;
  const { summary } = pending;

  const upload = async () => {
    setBusy(true);
    try {
      await importDataset(pending.data);
      await markLegacyHandled('imported');
      setPending(null);
      toast('Datos subidos a la nube', 'success');
      onImported?.(summary.teamNames[0]);
    } catch (e) {
      toast(`No se pudieron subir: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const neverAsk = async () => {
    if (!confirm('¿No subir nunca estos datos? Seguirán guardados en este dispositivo como respaldo, pero no aparecerán en la nube.')) return;
    await markLegacyHandled('skipped');
    setPending(null);
  };

  return (
    <Card className="mb-4 border-orange-300 bg-orange-50 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <CloudUpload className="mt-0.5 shrink-0 text-orange-600" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">Este dispositivo tiene datos de la versión anterior</p>
          <p className="text-sm text-slate-700">
            {summary.teams} equipo(s) ({summary.teamNames.join(', ')}), {summary.players} jugadoras y {summary.sessions} entrenamientos.
            Súbelos a la nube para verlos en todos tus dispositivos. Hazlo solo desde el dispositivo que tenga los datos buenos.
          </p>
          <button type="button" onClick={neverAsk} className="mt-1 text-xs font-semibold text-slate-500 underline">
            No volver a preguntar en este dispositivo
          </button>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
            Ahora no
          </Button>
          <Button onClick={upload} disabled={busy}>
            <CloudUpload size={18} /> {busy ? 'Subiendo…' : 'Subir a la nube'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
