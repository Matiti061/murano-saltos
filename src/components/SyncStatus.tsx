import { useObservable } from 'dexie-react-hooks';
import { Cloud, CloudOff, CloudAlert, RefreshCw } from 'lucide-react';
import { db } from '../db/schema';
import { cx } from './ui';

type Kind = 'ok' | 'syncing' | 'offline' | 'error';

export function useSyncKind(): { kind: Kind; label: string } {
  const state = useObservable(db.cloud.syncState);
  if (!state) return { kind: 'syncing', label: 'Conectando…' };
  if (state.license && state.license !== 'ok') return { kind: 'error', label: 'Licencia de Dexie Cloud caducada' };
  if (state.phase === 'error' || state.status === 'error') return { kind: 'error', label: 'Error al sincronizar' };
  if (state.phase === 'offline' || state.status === 'offline') return { kind: 'offline', label: 'Sin conexión · se subirá al volver' };
  if (state.phase === 'in-sync') return { kind: 'ok', label: 'Sincronizado' };
  return { kind: 'syncing', label: 'Sincronizando…' };
}

const ICONS = { ok: Cloud, syncing: RefreshCw, offline: CloudOff, error: CloudAlert };
const STYLES: Record<Kind, string> = {
  ok: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  syncing: 'text-amber-800 bg-amber-50 border-amber-200',
  offline: 'text-slate-600 bg-slate-100 border-slate-200',
  error: 'text-red-700 bg-red-50 border-red-200',
};

/** Estado de la sincronización con la nube. `compact` muestra solo el icono. */
export function SyncStatus({ compact, onDark }: { compact?: boolean; onDark?: boolean }) {
  const { kind, label } = useSyncKind();
  const Icon = ICONS[kind];
  return (
    <span
      title={label}
      role="status"
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border text-xs font-semibold',
        compact ? 'p-1.5' : 'px-2.5 py-1',
        onDark ? 'border-white/30 bg-white/15 text-white' : STYLES[kind],
      )}
    >
      <Icon size={14} className={kind === 'syncing' ? 'animate-spin' : undefined} />
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}
