import { todayISO } from '../lib/format';
import { db } from './schema';
import type { Complaint } from './types';

export async function saveComplaint(c: Complaint): Promise<number> {
  return (await db.complaints.put({
    ...c,
    description: c.description?.trim() || undefined,
    physioNotes: c.physioNotes?.trim() || undefined,
  })) as number;
}

export async function resolveComplaint(id: number, date = todayISO()) {
  await db.complaints.update(id, { resolvedDate: date });
}

export async function reopenComplaint(id: number) {
  await db.complaints.update(id, { resolvedDate: undefined });
}

export async function deleteComplaint(id: number) {
  await db.complaints.delete(id);
}

export const isActiveComplaint = (c: Complaint) => !c.resolvedDate;

export function complaintLabel(c: Complaint): string {
  const side = c.side === 'no aplica' ? '' : ` ${c.side}`;
  return `${c.zone}${side} (${c.intensity}/10)`;
}
